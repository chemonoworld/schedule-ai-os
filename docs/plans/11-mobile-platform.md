# 11. 모바일 플랫폼 지원

## 개요

Tauri v2를 활용한 iOS/Android 모바일 앱 지원. 데스크톱과 코드를 최대한 공유하면서 모바일 특성에 맞는 UX 제공.

---

## 목적

- iOS/Android 네이티브 앱 배포
- 데스크톱과 동일한 기능 제공 (집중 모드는 제한적)
- 코드 공유 극대화로 유지보수 효율화

---

## 프로젝트 구조: 데스크톱 vs 모바일

Tauri v2는 데스크톱과 모바일을 동일 프로젝트에서 빌드 가능.

### 옵션 A: 단일 프로젝트 (권장)

```
schedule-ai-tauri/
├── src/                    # React 프론트엔드 (공유)
├── src-tauri/
│   ├── src/                # Rust 백엔드 (공유)
│   ├── Cargo.toml
│   ├── tauri.conf.json     # 데스크톱 설정
│   ├── gen/
│   │   ├── android/        # Android 프로젝트 (tauri android init)
│   │   └── apple/          # iOS 프로젝트 (tauri ios init)
│   └── icons/
│       ├── icon.icns
│       ├── icon.ico
│       ├── ios/
│       └── android/
└── package.json
```

**장점**:
- 프론트엔드 코드 100% 공유
- Rust 코드 공유 (플랫폼별 분기는 `#[cfg(target_os = "...")]`)
- Tauri 공식 권장 방식
- 버전 동기화 용이

**단점**:
- iOS/Android 네이티브 코드가 `gen/` 폴더에 생성됨
- 플랫폼별 설정이 복잡해질 수 있음

### 옵션 B: 워크스페이스 분리

```
schedule-ai/
├── schedule-ai-desktop/    # 데스크톱 (macOS, Windows, Linux)
│   ├── src/
│   └── src-tauri/
├── schedule-ai-mobile/     # 모바일 (iOS, Android)
│   ├── src/
│   └── src-tauri/
└── packages/
    ├── ui/                 # 공유 UI 컴포넌트
    └── core/               # 공유 비즈니스 로직
```

**장점**:
- 플랫폼별 완전 독립
- 각 플랫폼 최적화 용이

**단점**:
- 코드 중복 또는 복잡한 공유 패키지 관리
- 버전 동기화 어려움

### 결정: 옵션 A (단일 프로젝트) 권장

Tauri v2의 공식 방식이며, 대부분의 코드를 공유할 수 있음.

---

## 플랫폼별 코드 분기

### Rust (src-tauri/src/)

```rust
#[cfg(target_os = "macos")]
mod macos_specific;

#[cfg(target_os = "ios")]
mod ios_specific;

#[cfg(any(target_os = "android", target_os = "ios"))]
fn mobile_only_feature() { ... }
```

### TypeScript (src/)

```typescript
import { platform } from '@tauri-apps/plugin-os';

const isMobile = platform() === 'ios' || platform() === 'android';

if (isMobile) {
  // 모바일 전용 UI
}
```

### tauri.conf.json

```json
{
  "bundle": {
    "iOS": {
      "developmentTeam": "TEAM_ID"
    },
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

---

## 데스크톱/모바일 UI 전략

Tauri에서 데스크톱과 모바일 앱의 UI 처리 방식.

### 옵션 A: 완전 반응형 (하나의 UI)

```tsx
// 화면 크기로만 구분
<div className="hidden md:block">데스크톱 사이드바</div>
<div className="md:hidden">모바일 바텀탭</div>
```

**장점**: 코드 하나로 관리
**단점**: 플랫폼 특성 무시 (데스크톱은 마우스, 모바일은 터치)

### 옵션 B: 플랫폼 감지 + 반응형 혼합 (권장)

```tsx
import { platform } from '@tauri-apps/plugin-os';

const isMobile = platform() === 'ios' || platform() === 'android';

// 플랫폼별 레이아웃
{isMobile ? <MobileLayout /> : <DesktopLayout />}
```

**장점**:
- 플랫폼 특성에 맞는 UX (터치 vs 마우스)
- 네이티브 느낌
- 컴포넌트는 공유, 레이아웃만 분리

---

## 플랫폼별 UX 차이

| 요소 | 데스크톱 | 모바일 |
|------|----------|--------|
| 내비게이션 | 사이드바/탭 | 바텀 탭 |
| 입력 | 키보드 단축키 | 터치 제스처 |
| 집중 모드 | 앱 강제 종료 | 알림 차단 (제한적) |
| 리스트 | 호버 효과 | 스와이프 액션 |
| 모달 | 중앙 모달 | 바텀 시트 |
| 드래그 | 마우스 드래그 | 롱프레스 + 드래그 |

---

## 권장 프로젝트 구조

```
src/
├── components/              # 공유 컴포넌트 (80%+)
│   ├── TaskCard.tsx
│   ├── PlanForm.tsx
│   ├── ProgressHeatmap.tsx
│   └── ...
├── layouts/
│   ├── DesktopLayout.tsx    # 사이드바 레이아웃
│   └── MobileLayout.tsx     # 바텀탭 레이아웃
├── hooks/
│   └── usePlatform.ts       # 플랫폼 감지 훅
└── App.tsx
```

---

## 플랫폼 감지 훅

```typescript
// hooks/usePlatform.ts
import { platform } from '@tauri-apps/plugin-os';
import { useState, useEffect } from 'react';

export type PlatformType = 'desktop' | 'mobile';

export function usePlatform(): PlatformType {
  const [platformType, setPlatformType] = useState<PlatformType>('desktop');

  useEffect(() => {
    const p = platform();
    if (p === 'ios' || p === 'android') {
      setPlatformType('mobile');
    }
  }, []);

  return platformType;
}
```

---

## App.tsx 예시

```tsx
import { usePlatform } from './hooks/usePlatform';
import { DesktopLayout } from './layouts/DesktopLayout';
import { MobileLayout } from './layouts/MobileLayout';

function App() {
  const platformType = usePlatform();

  return platformType === 'mobile'
    ? <MobileLayout />
    : <DesktopLayout />;
}
```

---

## 모바일 집중 모드 제한사항

모바일에서는 다른 앱을 강제 종료할 수 없음. 대안:

- **iOS**: Screen Time API 연동 (제한적), Focus Mode 알림
- **Android**: Usage Access 권한으로 앱 사용 모니터링, DND 모드
- **공통**: 집중 모드 중 앱 이탈 시 알림으로 리마인드

```rust
#[cfg(any(target_os = "ios", target_os = "android"))]
fn start_focus_mode() {
    // 모바일: 알림 기반 리마인드
    schedule_reminder_notification();
}

#[cfg(target_os = "macos")]
fn start_focus_mode() {
    // macOS: 앱 강제 종료
    start_blocking_poll();
}
```

---

## 릴리즈 워크플로우

모바일은 앱스토어 심사 과정이 있으므로 데스크톱과 별도 워크플로우로 분리.

### .github/workflows/release-mobile.yml

```yaml
on:
  workflow_dispatch:  # 수동 트리거
    inputs:
      version:
        description: 'Version to release'
        required: true
      platform:
        type: choice
        options: [ios, android, both]
```

---

## 구현 상태

- [ ] iOS 프로젝트 초기화 (`tauri ios init`)
- [ ] Android 프로젝트 초기화 (`tauri android init`)
- [ ] 플랫폼 감지 훅 구현
- [ ] 모바일 레이아웃 구현
- [ ] 바텀 탭 네비게이션
- [ ] 터치 제스처 지원
- [ ] 모바일 집중 모드 (알림 기반)
- [ ] iOS TestFlight 배포
- [ ] Android Play Store 배포

---

## 참고

- [Tauri Mobile](https://v2.tauri.app/start/migrate/from-tauri-1/#mobile)
- [Tauri iOS Development](https://v2.tauri.app/start/prerequisites/#ios)
- [Tauri Android Development](https://v2.tauri.app/start/prerequisites/#android)

---

마지막 업데이트: 2026-01-01
