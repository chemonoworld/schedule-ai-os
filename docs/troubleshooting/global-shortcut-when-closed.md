# 글로벌 단축키: 앱 종료 시에도 동작하게 하기

## 증상

- 글로벌 단축키 (`Alt+Shift+Space`)가 앱이 실행 중일 때만 동작함
- 앱을 완전히 종료하면 단축키가 동작하지 않음
- 사용자가 앱을 닫아도 단축키로 다시 열 수 있기를 기대함

## 원인

현재 구현:
```rust
// lib.rs
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
```

**문제점**:
1. 글로벌 단축키는 OS 레벨이 아닌 앱 프로세스 레벨에서 등록됨
2. 앱 프로세스가 종료되면 단축키 등록도 해제됨
3. 닫기 버튼(X)을 누르면 앱 프로세스가 완전히 종료됨

## 해결 방법

### 전략: 닫기 → 숨김으로 변경 + 시스템 트레이

앱을 "종료"하는 대신 "숨김" 처리하여 백그라운드에서 계속 실행:

1. **닫기 버튼 동작 변경**: 종료 대신 숨김
2. **시스템 트레이 아이콘**: macOS 메뉴바에 아이콘 표시
3. **실제 종료**: 트레이 메뉴에서 "Quit" 선택 시에만 종료

### 구현 단계

#### 1. tauri.conf.json 수정

시스템 트레이 활성화:
```json
{
  "app": {
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    }
  }
}
```

#### 2. Cargo.toml 확인

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
```

#### 3. lib.rs 수정

```rust
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

// 닫기 버튼 클릭 시 숨김 처리
fn setup_close_behavior(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 종료 대신 숨김
                api.prevent_close();
                if let Some(win) = app_handle.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
        });
    }
}

// 시스템 트레이 설정
fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit Schedule AI", true, None::<&str>)?;
    let show = tauri::menu::MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;

    let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// setup 함수에 추가
.setup(move |app| {
    // 기존 단축키 등록
    app.global_shortcut().register(default_shortcut)?;

    // 닫기 동작 변경
    setup_close_behavior(app.handle());

    // 시스템 트레이 설정
    setup_tray(app.handle())?;

    Ok(())
})
```

#### 4. macOS 권한 설정 (tauri.conf.json)

```json
{
  "bundle": {
    "macOS": {
      "minimumSystemVersion": "12.0"
    }
  }
}
```

### 사용자 경험 변화

| 동작 | 이전 | 이후 |
|------|------|------|
| X 버튼 클릭 | 앱 종료 | 앱 숨김 (백그라운드 유지) |
| 단축키 | 앱 실행 중일 때만 동작 | 항상 동작 (백그라운드에서 대기) |
| 완전 종료 | X 버튼 | 트레이 메뉴 → Quit |
| 메뉴바 | 없음 | 트레이 아이콘 표시 |

### 선택적 추가 기능: Launch at Login

시스템 시작 시 자동 실행 (백그라운드):

```rust
// tauri-plugin-autostart 사용
// Cargo.toml
tauri-plugin-autostart = "2"

// lib.rs
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    Some(vec!["--hidden"]), // 숨김 상태로 시작
))
```

```typescript
// 프론트엔드에서 설정
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';

// 자동 시작 활성화
await enable();

// 상태 확인
const enabled = await isEnabled();
```

## 파일 변경 목록

- `schedule-ai-tauri/src-tauri/Cargo.toml` - tray-icon 기능 추가
- `schedule-ai-tauri/src-tauri/tauri.conf.json` - 트레이 아이콘 설정
- `schedule-ai-tauri/src-tauri/src/lib.rs` - 닫기 동작 변경 + 트레이 설정

## 참고

- [Tauri System Tray](https://v2.tauri.app/learn/system-tray/)
- [Tauri Plugin Autostart](https://v2.tauri.app/plugin/autostart/)
- [Window Events](https://v2.tauri.app/reference/webview-window/#events)

---

## 추가 이슈: 릴리즈 빌드에서 트레이 아이콘 안 보임

### 증상

- 개발 모드에서는 트레이 아이콘이 보임
- 릴리즈 빌드(DMG)에서는 macOS 메뉴바에 트레이 아이콘이 표시되지 않음

### 원인

`tauri.conf.json`의 `iconAsTemplate: true` 설정이 문제:

```json
"trayIcon": {
  "iconPath": "icons/icon.png",
  "iconAsTemplate": true  // 문제!
}
```

macOS에서 `iconAsTemplate: true`는:
- 아이콘의 **알파 채널만** 사용하여 흑백으로 렌더링
- 컬러 아이콘(512x512 RGBA)은 매우 희미하게 보이거나 **완전히 안 보임**
- 릴리즈 빌드에서 더 엄격하게 적용됨

### 해결

`tauri.conf.json`에서 `trayIcon` 설정 제거 (코드에서 직접 생성하므로 중복):

```json
// trayIcon 설정 삭제 - lib.rs의 setup_tray()에서 생성
```

또는 컬러 아이콘을 사용하려면:

```json
"trayIcon": {
  "iconPath": "icons/icon.png",
  "iconAsTemplate": false
}
```

### 추가 이슈: 트레이 아이콘 2개 표시

`tauri.conf.json`의 `trayIcon`과 `lib.rs`의 `setup_tray()` 둘 다 설정하면 아이콘이 2개 생성됨.
**해결**: `tauri.conf.json`에서 `trayIcon` 설정을 제거하고 코드에서만 생성.

---

상태: 해결됨
우선순위: 높음
생성일: 2026-01-01
해결일: 2026-01-02
