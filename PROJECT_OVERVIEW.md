# Schedule AI - 프로젝트 소개

## 서비스 명

**Schedule AI** - ADHD 환자를 위한 AI 기반 일정 관리 앱

---

## 서비스 배포 URL

- **웹사이트**: Vercel 배포 예정 (Next.js 랜딩 페이지)
- **데스크톱 앱**: GitHub Releases를 통한 배포
  - macOS Apple Silicon (aarch64)
  - macOS Intel (x64)
- **Chrome Extension**: Chrome Web Store 배포 예정

---

## 해결하고자 했던 문제

ADHD 환자들은 일정 관리에서 다음과 같은 어려움을 겪습니다:

1. **매일 TODO를 짜는 부담**: 매번 새로 계획을 세우는 것 자체가 큰 에너지 소모
2. **태스크 분해의 어려움**: 큰 목표를 작은 단위로 나누기 어려움
3. **집중력 유지 실패**: SNS, 유튜브 등 방해 요소에 쉽게 빠짐
4. **진행 상황 파악 부재**: 얼마나 진행했는지 시각적 피드백 부족
5. **반복 일정 관리**: 매일/매주 해야 할 일들을 일일이 입력해야 함

---

## 서비스 소개 및 주요 기능

### 핵심 컨셉

> "한 번 Plan을 설정하면, AI가 매일 적절한 태스크를 제안하고 집중할 수 있도록 돕는다"

### 주요 기능

#### 1. AI 기반 스마트 TODO 시스템
- **자연어 Plan 입력**: 텍스트로 계획을 입력하면 Claude AI가 구조화
- **일일 태스크 자동 생성**: Plan 기반으로 오늘 해야 할 일 자동 추천
- **ADHD 친화적 태스크 분해**: 큰 태스크를 5-15분 단위의 작은 서브태스크로 분해
- **반복 일정 자동화**: "매일 아침 운동" 같은 자연어를 AI가 파싱하여 반복 태스크 생성

#### 2. Focus Mode (집중 모드) - Hard Blocking
- **앱 강제 종료**: 집중 모드 중 차단 앱 실행 시 자동 종료 (terminate/forceTerminate)
- **Chrome Extension 연동**: 웹사이트 차단 (YouTube, SNS 등)
- **뽀모도로 타이머**: 25분 집중 / 5분 휴식 / 15분 긴 휴식 자동 전환
- **실시간 경과 시간 표시**: 집중한 시간 시각화

#### 3. Progress Tracking
- **일일 진행률 계산**: 완료한 태스크 비율 표시
- **연간 히트맵**: GitHub 스타일 잔디 그래프로 1년간 기록 시각화
- **연속 기록 (Streak)**: 연속으로 태스크를 완료한 일수 표시

#### 4. 데이터 이식성
- **Markdown 내보내기**: 일정 데이터를 Markdown으로 추출
- **JSON 백업/복원**: 완전한 데이터 백업 및 복원

#### 5. 다국어 지원 (i18n)
- 한국어/영어 지원
- 시스템 언어 자동 감지
- 설정에서 언어 변경 가능

---

## 활용한 핵심 기술 및 AI 모델 (Tech Stack)

### 데스크톱 앱

| 영역 | 기술 |
|------|------|
| 프레임워크 | **Tauri v2** - Rust 기반 크로스플랫폼 데스크톱 앱 |
| 프론트엔드 | **React + TypeScript + Vite** |
| 상태관리 | **Zustand** |
| 백엔드 (데스크톱) | **Rust** |
| 데이터베이스 (로컬) | **SQLite** |

### macOS Native 기능

| 라이브러리 | 용도 |
|------------|------|
| **objc2** | Objective-C 런타임 바인딩 |
| **objc2-app-kit** | NSWorkspace, NSRunningApplication 접근 |
| **cocoa** | 앱 강제 활성화 (activateIgnoringOtherApps) |
| **core-graphics** | 그래픽 관련 API |
| **core-foundation** | 기본 데이터 타입 |

### AI 모델

| 용도 | 모델 |
|------|------|
| Plan 파싱 | **Claude API** (claude-sonnet-4-20250514) |
| 태스크 생성 | **Claude API** |
| 반복 일정 파싱 | **Claude API** |
| 태스크 분해 | **Claude API** |

### 백엔드 서버 (개발 중)

| 영역 | 기술 |
|------|------|
| 웹 프레임워크 | **Axum 0.7** |
| 런타임 | **Tokio** |
| 데이터베이스 | **PostgreSQL + SQLx** |
| 인증 | **Google OAuth 2.0 + JWT** |
| 결제 | **Stripe** (예정) |
| 배포 | **Docker + fly.io / Railway** (예정) |

### 웹사이트

| 영역 | 기술 |
|------|------|
| 프레임워크 | **Next.js** |
| 스타일링 | **Tailwind CSS** |
| i18n | **next-intl** |
| 호스팅 | **Vercel** |

### CI/CD

| 영역 | 기술 |
|------|------|
| 빌드 자동화 | **GitHub Actions + tauri-action** |
| 릴리즈 | 태그 푸시 시 자동 빌드 및 릴리즈 생성 |

---

## 기술적 챌린지 및 해결 과정

### 1. macOS 앱 강제 종료 (Hard Blocking)

**문제**: Accessibility 권한 없이 방해 앱을 차단하는 방법 필요

**해결**:
- `objc2-app-kit` 크레이트로 `NSWorkspace` API 접근
- `NSRunningApplication.terminate()` 호출로 앱 종료
- 종료 실패 시 `forceTerminate()` 사용
- 1초 폴링으로 현재 활성 앱 감지 후 차단 앱이면 즉시 종료

```rust
// 앱 강제 종료 구현
pub fn terminate_app_by_bundle_id(bundle_id: &str) -> bool {
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        for app in workspace.runningApplications() {
            if app.bundleIdentifier() == bundle_id {
                let terminated = app.terminate();
                if !terminated {
                    app.forceTerminate(); // 강제 종료
                }
                return true;
            }
        }
        false
    }
}
```

---

### 2. Chrome Extension ↔ Desktop 양방향 동기화

**문제**: Chrome Extension에서 Focus Mode 토글 시 Desktop 앱에 동기화 안 됨

**원인 분석**:
1. **데드락**: Native Host에서 하나의 Tauri IPC 연결을 공유하면서 락 경쟁 발생
2. **Service Worker 수명 주기**: Chrome의 Manifest V3 Service Worker가 idle 상태로 전환되면서 연결 끊김

**해결**:
- Chrome 요청용과 Push 수신용으로 **별도의 Tauri 연결** 사용
- `isPortReady` 플래그로 연결 준비 완료 후에만 메시지 전송
- `pendingMessages` 큐로 연결 전 메시지 보관 후 일괄 전송

```
Desktop App ←→ Unix Socket IPC (2개 연결) ←→ Native Host ←→ Chrome Extension
                ├── Chrome 요청용
                └── Push 수신용
```

---

### 3. Windows IPC 지원 (크로스 플랫폼)

**문제**: Windows에서 `tokio::net::UnixSocket` 미지원으로 빌드 실패

**해결**: `interprocess` 크레이트로 플랫폼별 IPC 구현

| OS | IPC 방식 |
|----|----------|
| macOS/Linux | Unix Socket (`/tmp/schedule-ai.sock`) |
| Windows | Named Pipe (`\\.\pipe\schedule-ai`) |

```rust
fn get_socket_name() -> io::Result<interprocess::local_socket::Name<'static>> {
    #[cfg(unix)]
    { "/tmp/schedule-ai.sock".to_fs_name::<GenericFilePath>() }
    #[cfg(windows)]
    { SOCKET_NAME.to_ns_name::<GenericNamespaced>() }
}
```

---

### 4. LLM Provider 추상화

**문제**: Claude 외에 다른 LLM (OpenAI, Ollama 등) 지원 필요

**해결**: Rust trait 기반 추상화 레이어 구현

```rust
#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn complete(&self, request: LLMRequest) -> Result<LLMResponse, LLMError>;
    fn name(&self) -> &str;
}

// Claude 구현
impl LLMProvider for ClaudeProvider { ... }

// Ollama 구현 (추후)
impl LLMProvider for OllamaProvider { ... }
```

---

### 5. 서버 아키텍처 설계 (무료 티어 + 구독 모델)

**요구사항**:
- 10회 무료 AI 호출 후 Pro 구독 필요
- API Key는 서버에서만 관리 (보안)
- Google OAuth 인증

**해결**:
- `usage` 테이블로 사용자별 AI 호출 횟수 추적
- LLM Proxy API로 모든 AI 호출 서버 경유
- JWT + Refresh Token rotation으로 인증

```sql
CREATE TABLE usage (
  user_id UUID REFERENCES users(id),
  ai_calls_used INTEGER DEFAULT 0,
  ai_calls_limit INTEGER DEFAULT 10, -- 무료 티어 제한
  ...
);
```

---

## 프로젝트 구조

```
schedule-ai/
├── schedule-ai-tauri/     # Tauri 데스크톱 앱
│   ├── src/               # React 프론트엔드
│   │   ├── components/
│   │   ├── stores/        # Zustand 상태관리
│   │   └── i18n/          # 다국어 지원
│   └── src-tauri/         # Rust 백엔드
│       ├── src/
│       │   ├── commands/  # Tauri 커맨드
│       │   ├── db/        # SQLite 연동
│       │   ├── focus/     # 집중모드 (macOS Native)
│       │   └── llm/       # LLM 통합
│       └── Cargo.toml
├── schedule-ai-server/    # Axum 백엔드 서버
│   └── src/
│       ├── routes/        # API 라우트
│       ├── models/        # 데이터 모델
│       └── services/      # 비즈니스 로직
├── schedule-ai-web/       # Next.js 웹사이트
├── schedule-ai-host/      # Chrome Native Messaging Host
├── chrome-extension/      # Chrome Extension
├── packages/              # 공유 패키지
│   ├── core/              # 타입 및 유틸리티
│   ├── ui/                # UI 컴포넌트
│   └── llm-client/        # LLM 클라이언트
└── docs/                  # 문서
    ├── ROADMAP.md         # 전체 로드맵
    ├── plans/             # 설계 문서
    ├── progress/          # 진행 기록
    └── troubleshooting/   # 버그 수정 기록
```

---

## 현재 상태

| Phase | 이름 | 상태 |
|-------|------|------|
| Phase 1-4 | MVP (프로젝트 셋업, 데이터 모델, LLM 통합, Progress Tracking) | 완료 |
| Phase 5 | 집중 모드 (Focus Mode) - Hard Blocking | 완료 |
| Phase 6 | i18n (다국어 지원) | 완료 |
| Phase 7 | 웹사이트 & 배포 | 완료 |
| Phase 8 | 구독 모델 & 백엔드 서버 | 진행중 |
| Phase 9 | 모바일 확장 (iOS/Android) | 예정 |

---

마지막 업데이트: 2026-01-11
