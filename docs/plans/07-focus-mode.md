# 집중 모드 (Focus Mode) 설계

## 개요
코어타임 동안 방해가 되는 앱들을 블로킹하여 집중력 유지

## 블로킹 수준

| 수준 | 설명 | 권한 | 구현 상태 |
|------|------|------|----------|
| **Hard** | 차단 앱 강제 종료 (terminate) | 없음 | **완료** |
| Medium | 앱 숨김 + 포커스 전환 | Accessibility | 추후 |
| Soft | 앱 활성화 + 오버레이 + 알림 | 없음 | 대체됨 |

---

## Phase 5: Hard Blocking (완료)

### 구현된 기능
- [x] 실행 중인 앱 목록 조회 (NSWorkspace)
- [x] 현재 활성 앱 감지 (1초 폴링)
- [x] 수동 집중 모드 시작/종료
- [x] 차단할 앱 선택 (칩 스타일 UI)
- [x] 차단 앱 감지 시 강제 종료 (`NSRunningApplication.terminate()`)
- [x] 종료 실패 시 강제 종료 (`forceTerminate()`)
- [x] 알림 발송 (소리 포함, 중복 방지)
- [x] 경과 시간 타이머
- [x] 집중 모드 중 오늘의 할 일 표시
- [x] 탭 이동 시에도 블로킹 유지 (전역 폴링)

### 기술 스택

#### macOS Native API

**NSWorkspace (앱 모니터링)**
```rust
// objc2 + objc2-app-kit 사용
use objc2_app_kit::{NSWorkspace, NSRunningApplication};

// 실행 중인 모든 앱 목록
let apps = NSWorkspace::sharedWorkspace().runningApplications();

// 현재 활성화된 앱
let frontmost = NSWorkspace::sharedWorkspace().frontmostApplication();

// 앱 정보
app.bundleIdentifier()  // "com.apple.Safari"
app.localizedName()     // "Safari"
```

**NSRunningApplication (앱 강제 종료)**
```rust
// 차단된 앱 강제 종료
pub fn terminate_app_by_bundle_id(bundle_id: &str) -> bool {
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let apps = workspace.runningApplications();
        for app in apps {
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

**Cocoa (앱 강제 활성화)**
```rust
// cocoa crate 사용
use cocoa::appkit::{NSApp, NSApplication};

// 다른 앱 무시하고 우리 앱 강제 활성화
let app = NSApp();
app.activateIgnoringOtherApps_(true);
```

#### 필요 의존성 (Cargo.toml)
```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-app-kit = { version = "0.2", features = ["NSWorkspace", "NSRunningApplication", "NSWindow", "NSApplication"] }
objc2-foundation = "0.2"
cocoa = "0.26"
core-graphics = "0.24"
core-foundation = "0.10"
```

### 파일 구조

```
apps/desktop/
├── src-tauri/
│   └── src/
│       ├── focus/
│       │   └── mod.rs          # macOS 앱 모니터링 & 활성화
│       └── lib.rs              # Tauri 커맨드 등록
└── src/
    └── stores/
        └── focusStore.ts       # Zustand 상태 관리
```

### 아키텍처

```
┌─────────────────────────────────────┐
│  Focus Tab UI (React)               │
│  - 시작/종료 버튼                    │
│  - 차단 앱 선택                      │
│  - 타이머 표시                       │
│  - 인앱 오버레이                     │
└──────────────┬──────────────────────┘
               │ Zustand Store
┌──────────────▼──────────────────────┐
│  focusStore.ts                       │
│  - 1초 폴링으로 checkFrontmostApp   │
│  - 차단 앱 감지 시 activate + 알림   │
└──────────────┬──────────────────────┘
               │ invoke
┌──────────────▼──────────────────────┐
│  Tauri Commands                      │
│  - get_running_apps_command         │
│  - get_frontmost_app_command        │
│  - activate_app_command             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  focus/mod.rs                        │
│  - NSWorkspace: 앱 목록/활성앱 조회  │
│  - Cocoa: 앱 강제 활성화            │
└──────────────────────────────────────┘
```

### Hard Blocking 흐름

```
사용자: 집중 모드 시작 (차단 앱 선택)
    │
    ▼
프론트엔드: 1초마다 폴링 시작 (App 컴포넌트 레벨)
    │
    ├── tick(): 경과 시간 업데이트
    │
    └── checkFrontmostApp(): 활성 앱 확인
              │
              ▼
        차단 앱 감지됨?
              │
              ├── No → 계속 폴링
              │
              └── Yes ─┬─→ terminate_app_command 호출
                       │   (macOS: NSRunningApplication.terminate)
                       │
                       ├─→ 종료 실패 시 forceTerminate()
                       │
                       ├─→ 알림 발송 (소리 포함, 중복 방지)
                       │
                       └─→ activate_app_command 호출
                             │
                             ▼
                       차단된 앱 종료됨
                       Schedule AI 활성화
                             │
                             ▼
                       사용자가 다시 차단 앱 실행 시도
                             │
                             ▼
                       1초 후 다시 감지 & 종료 (무한 반복)
```

### 핵심 코드

#### Rust: focus/mod.rs
```rust
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningApp {
    pub bundle_id: String,
    pub name: String,
}

#[cfg(target_os = "macos")]
mod macos {
    use super::RunningApp;
    use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace};

    pub fn get_running_apps() -> Vec<RunningApp> {
        unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let apps = workspace.runningApplications();
            let mut result = Vec::new();
            let count = apps.count();
            for i in 0..count {
                let app = apps.objectAtIndex(i);
                // 일반 앱만 포함 (백그라운드 프로세스 제외)
                if app.activationPolicy() == NSApplicationActivationPolicy::Regular {
                    let bundle_id = app.bundleIdentifier()
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                    let name = app.localizedName()
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                    if !bundle_id.is_empty() && !name.is_empty() {
                        result.push(RunningApp { bundle_id, name });
                    }
                }
            }
            result
        }
    }

    pub fn get_frontmost_app() -> Option<RunningApp> {
        unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let app = workspace.frontmostApplication()?;
            let bundle_id = app.bundleIdentifier()?.to_string();
            let name = app.localizedName()?.to_string();
            Some(RunningApp { bundle_id, name })
        }
    }

    /// 우리 앱을 강제로 맨 앞으로 활성화
    pub fn activate_our_app() {
        use cocoa::appkit::{NSApp, NSApplication};
        unsafe {
            let app = NSApp();
            app.activateIgnoringOtherApps_(true);
        }
    }
}

#[tauri::command]
pub fn activate_app_command(app: AppHandle) {
    activate_our_app();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
```

#### TypeScript: focusStore.ts
```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import i18n from '../i18n';

export interface RunningApp {
  bundle_id: string;
  name: string;
}

interface FocusState {
  isActive: boolean;
  blockedApps: string[];
  runningApps: RunningApp[];
  currentFrontmostApp: RunningApp | null;
  startedAt: number | null;
  elapsedSeconds: number;
  terminatedApps: string[];  // 종료된 앱 목록 (중복 알림 방지)

  loadRunningApps: () => Promise<void>;
  startFocus: (blockedApps: string[]) => void;
  stopFocus: () => void;
  checkFrontmostApp: () => Promise<void>;
  tick: () => void;
}

// 앱 종료 함수
async function terminateApp(bundleId: string): Promise<boolean> {
  return await invoke<boolean>('terminate_app_command', { bundleId });
}

// 알림 발송 함수 (i18n 적용)
async function sendTerminateNotification(appName: string) {
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === 'granted';
  }
  if (permissionGranted) {
    await sendNotification({
      title: i18n.t('focus:notification.title'),
      body: i18n.t('focus:notification.terminated', { appName }),
      sound: 'default',
    });
  }
}

export const useFocusStore = create<FocusState>((set, get) => ({
  // ... 상태 초기값

  checkFrontmostApp: async () => {
    const { isActive, blockedApps, terminatedApps } = get();
    if (!isActive) return;

    const frontmost = await invoke<RunningApp | null>('get_frontmost_app_command');
    set({ currentFrontmostApp: frontmost });

    if (frontmost && blockedApps.includes(frontmost.bundle_id)) {
      // 차단된 앱 감지 -> 종료
      const terminated = await terminateApp(frontmost.bundle_id);
      if (terminated && !terminatedApps.includes(frontmost.bundle_id)) {
        set({ terminatedApps: [...terminatedApps, frontmost.bundle_id] });
        await sendTerminateNotification(frontmost.name);
      }
      // 우리 앱 활성화
      await invoke('activate_app_command');
    }
  },
}));
```

---

## UI 디자인

### Focus 탭 (비활성 상태)
```
┌─────────────────────────────────────┐
│  🎯 Focus Mode                      │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  상태: 비활성                  │  │
│  │                               │  │
│  │  차단할 앱:                   │  │
│  │  ☑ Safari                    │  │
│  │  ☑ YouTube                   │  │
│  │  ☐ Slack                     │  │
│  │  ☐ Discord                   │  │
│  │                               │  │
│  │  [집중 모드 시작]             │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Focus 탭 (활성 상태)
```
┌─────────────────────────────────────┐
│  🎯 Focus Mode                      │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  🔥 집중 중!                   │  │
│  │                               │  │
│  │     ⏱️ 01:23:45               │  │
│  │                               │  │
│  │  차단 앱: Safari, YouTube     │  │
│  │                               │  │
│  │  [집중 모드 종료]             │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### 인앱 오버레이 (차단 앱 감지 시)
```
┌─────────────────────────────────────┐
│  ████████████████████████████████   │
│  ██                            ██   │
│  ██   🧘 집중 시간입니다        ██   │
│  ██                            ██   │
│  ██   차단된 앱: Safari        ██   │
│  ██                            ██   │
│  ██   ⏱️ 01:23:45              ██   │
│  ██                            ██   │
│  ████████████████████████████████   │
│                                     │
│  (반투명 배경으로 앱 전체 덮음)     │
└─────────────────────────────────────┘
```

---

## 데이터 모델

### TypeScript
```typescript
interface RunningApp {
  bundle_id: string;
  name: string;
}

interface FocusState {
  isActive: boolean;
  blockedApps: string[];       // 차단할 앱 bundle IDs
  runningApps: RunningApp[];   // 실행 중인 앱 목록
  currentFrontmostApp: RunningApp | null;
  showOverlay: boolean;
  startedAt: number | null;    // timestamp
  elapsedSeconds: number;
  lastNotifiedApp: string | null;  // 중복 알림 방지
  blockedAppName: string | null;   // 오버레이 표시용
}
```

### Rust
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningApp {
    pub bundle_id: String,
    pub name: String,
}
```

---

## 제한사항 및 알려진 이슈

### macOS 알림 클릭
- Tauri v2 notification plugin의 `onAction`은 iOS/Android에서만 지원
- macOS에서는 알림 클릭 시 앱으로 이동하는 기능 미지원
- 대안: 1초 폴링으로 지속적인 앱 활성화로 해결

### 권한 없는 Soft Blocking 한계
- 사용자가 ESC 키나 Cmd+Tab으로 다른 앱 전환 가능
- 1초 후에 다시 Schedule AI가 활성화되어 지속적으로 방해
- 완전한 차단은 Accessibility 권한 필요 (추후 구현)

---

## 추후 확장

### Medium Blocking
- Accessibility 권한 요청
- 차단 앱 자동 숨김 (`app.hide()`)
- 더 즉각적인 포커스 전환

### CGEventTap 기반 차단 (선택적)
- Input Monitoring 권한 요청
- CGEventTap으로 키보드/마우스 이벤트 차단
- 앱 종료 대신 입력만 차단하는 Soft 모드

### 자동화
- Core Time 스케줄 기반 자동 시작
- 코어타임 시작 5분 전 알림
- 휴식 시간 (Pomodoro) 지원

### 통계 (완료)
- [x] 차단 앱 접근 시도 횟수 기록 (SQLite)
- [x] 앱별 차단 통계 표시
- [x] 일별 추이 그래프 (최근 7일)
- [x] AI 인사이트 기능 (Claude API)
- [ ] 집중 시간 기록
- [ ] 주별/월별 리포트

---

## 참고

- [macOS Focus Mode 구현 가능 범위](../../temp/macos-focus-mode-feasibility.md)
