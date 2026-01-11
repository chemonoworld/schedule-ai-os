# 10-04. 클라이언트(Tauri) 연동

## 개요

Tauri 데스크톱 앱을 서버와 연동하고, 기존 API Key 입력 방식을 제거.

---

## 목표

- [ ] API Key 입력 UI 제거
- [ ] 로그인/회원가입 UI 추가
- [ ] OAuth 딥링크 처리 (`scheduleai://`)
- [ ] 인증 상태 관리 (Zustand store)
- [ ] LLM 호출을 서버 API로 변경
- [ ] 토큰 자동 갱신 로직
- [ ] 사용량 표시 UI
- [ ] 로그아웃 기능

---

## UI 변경사항

### 제거

- Settings 페이지의 "Claude API Key" 입력 필드
- API Key 유효성 검사 로직
- 로컬 API Key 저장 (`tauri-plugin-store`)

### 추가

- 로그인 화면 (Google 로그인 버튼)
- 사용자 프로필 표시 (이름, 아바타)
- AI 사용량 표시 (3/10 사용됨)
- 사용량 초과 시 업그레이드 유도 모달
- 로그아웃 버튼

---

## OAuth 딥링크 설정

### tauri.conf.json

```json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["scheduleai"]
      }
    }
  }
}
```

### 플로우

1. 사용자가 "Google로 로그인" 클릭
2. 기본 브라우저에서 `{SERVER_URL}/api/auth/google` 열기
3. Google 로그인 완료
4. 서버가 `scheduleai://auth/callback?token=xxx&refresh=yyy` 로 리다이렉트
5. Tauri 앱이 딥링크 수신
6. 토큰 저장 및 로그인 완료

---

## 인증 Store

```typescript
// src/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  usage: Usage | null;
  isAuthenticated: boolean;

  login: (tokens: Tokens, user: User) => void;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
  fetchUsage: () => Promise<void>;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

interface Usage {
  aiCallsUsed: number;
  aiCallsLimit: number;
  isPro: boolean;
  remaining: number;
}
```

---

## API 클라이언트

```typescript
// src/lib/api.ts
const API_URL = import.meta.env.VITE_API_URL || 'https://api.schedule-ai.com';

class ApiClient {
  private accessToken: string | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.accessToken && { 'Authorization': `Bearer ${this.accessToken}` }),
      ...options?.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // 토큰 갱신 시도
      await useAuthStore.getState().refreshAccessToken();
      // 재시도
      return this.request(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new ApiError(error);
    }

    return response.json();
  }
}

export const api = new ApiClient();
```

---

## LLM 호출 변경

### Before (로컬 API Key)

```typescript
// invoke로 Tauri 백엔드 호출
const result = await invoke('parse_plan_with_ai', {
  planInput: text,
  planRules: rules,
});
```

### After (서버 API)

```typescript
// 서버 API 호출
const result = await api.request('/api/llm/parse-plan', {
  method: 'POST',
  body: JSON.stringify({
    plan_input: text,
    plan_rules: rules,
  }),
});
```

---

## 사용량 초과 처리

```typescript
// 사용량 초과 에러 핸들링
try {
  await api.request('/api/llm/parse-plan', ...);
} catch (error) {
  if (error.code === 'usage_limit_exceeded') {
    // 업그레이드 모달 표시
    showUpgradeModal();
  }
}
```

### 업그레이드 모달 UI

```
┌────────────────────────────────────┐
│  🎯 무료 체험이 끝났어요!          │
│                                    │
│  AI 기능을 계속 사용하려면         │
│  Pro 플랜으로 업그레이드하세요.    │
│                                    │
│  ✓ AI 기능 무제한                  │
│  ✓ 기기간 동기화                   │
│  ✓ 클라우드 백업                   │
│                                    │
│  [Pro로 업그레이드 - $9.99/월]     │
│  [나중에]                          │
└────────────────────────────────────┘
```

---

## 파일 변경 목록

### 수정

- `src/pages/SettingsPage.tsx` - API Key 입력 제거, 계정 섹션 추가
- `src/stores/settingsStore.ts` - API Key 관련 상태 제거
- `src/hooks/useLLM.ts` - 서버 API로 변경
- `tauri.conf.json` - 딥링크 설정 추가
- `Cargo.toml` - deep-link 플러그인 추가

### 신규

- `src/stores/authStore.ts` - 인증 상태 관리
- `src/lib/api.ts` - API 클라이언트
- `src/pages/LoginPage.tsx` - 로그인 화면
- `src/components/UserProfile.tsx` - 사용자 프로필
- `src/components/UsageIndicator.tsx` - 사용량 표시
- `src/components/UpgradeModal.tsx` - 업그레이드 유도

### 삭제

- API Key 관련 Rust 커맨드 (선택적 - 향후 정리)

---

## 의존성 추가

```bash
# Tauri 딥링크 플러그인
pnpm add @tauri-apps/plugin-deep-link
```

```toml
# Cargo.toml
tauri-plugin-deep-link = "2"
```

---

## 구현 순서

1. `tauri-plugin-deep-link` 설치 및 설정
2. `authStore.ts` 생성
3. `api.ts` 클라이언트 생성
4. `LoginPage.tsx` 생성
5. OAuth 딥링크 핸들러 구현
6. LLM 호출 로직 변경 (`useLLM.ts`)
7. Settings 페이지 수정
8. `UsageIndicator.tsx` 생성
9. `UpgradeModal.tsx` 생성
10. 기존 API Key UI 제거
11. 테스트

---

## 테스트 시나리오

1. 비로그인 상태에서 AI 기능 접근 시 로그인 유도
2. Google 로그인 플로우 정상 동작
3. 토큰 갱신 정상 동작
4. AI 호출 시 사용량 증가 확인
5. 사용량 초과 시 업그레이드 모달 표시
6. 로그아웃 정상 동작

---

상태: 미시작
우선순위: 높음
예상 작업량: 대
