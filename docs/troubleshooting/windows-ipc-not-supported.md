# Windows IPC 서버 지원

## 상태: 완료

## 문제

Windows에서 빌드 시 다음 에러 발생:

```
error[E0432]: unresolved imports `tokio::net::UnixListener`, `tokio::net::UnixStream`
```

## 원인

- Unix 소켓(`UnixListener`, `UnixStream`)은 Unix 계열 OS(macOS, Linux)에서만 지원
- Windows는 Unix 소켓을 네이티브로 지원하지 않음

## 해결 방법

`interprocess` 크레이트를 사용하여 크로스 플랫폼 IPC 구현:

- **macOS/Linux**: Unix Socket (`/tmp/schedule-ai.sock`)
- **Windows**: Named Pipe (`\\.\pipe\schedule-ai`)

### 변경된 파일

1. **schedule-ai-tauri/src-tauri/Cargo.toml**
   ```toml
   interprocess = { version = "2", features = ["tokio"] }
   ```

2. **schedule-ai-tauri/src-tauri/src/ipc_server.rs**
   ```rust
   use interprocess::local_socket::{
       tokio::{prelude::*, Stream},
       ListenerOptions,
   };
   #[cfg(unix)]
   use interprocess::local_socket::{GenericFilePath, ToFsName};
   #[cfg(windows)]
   use interprocess::local_socket::{GenericNamespaced, ToNsName};

   fn get_socket_name() -> io::Result<interprocess::local_socket::Name<'static>> {
       #[cfg(unix)]
       { "/tmp/schedule-ai.sock".to_fs_name::<GenericFilePath>() }
       #[cfg(windows)]
       { SOCKET_NAME.to_ns_name::<GenericNamespaced>() }
   }
   ```

3. **schedule-ai-host/Cargo.toml**
   ```toml
   interprocess = { version = "2", features = ["tokio"] }
   ```

4. **schedule-ai-host/src/main.rs**
   - 동일한 방식으로 `interprocess` 사용

## 지원 현황

| 기능 | macOS | Linux | Windows |
|------|-------|-------|---------|
| 앱 기본 기능 | ✅ | ✅ | ✅ |
| Focus Mode | ✅ | ✅ | ✅ |
| Chrome Extension 연동 | ✅ | ✅ | ✅ |
| 프로세스 모니터링 | ✅ | ✅ | ❌ |
| 앱 차단 (terminate) | ✅ | ✅ | ❌ |
| 설치된 앱 목록 | ✅ | ✅ | ❌ |
| 현재 활성 앱 감지 | ✅ | ✅ (X11 + Wayland) | ❌ |

### Linux 프로세스 모니터링 구현

Linux에서 프로세스 모니터링 기능 추가:

**사용 기술:**
- `procfs` - `/proc` 파일시스템 파싱
- `x11rb` - X11 프로토콜로 활성 창 감지
- `nix` - SIGTERM 시그널로 프로세스 종료
- `gdbus` / `qdbus` - Wayland 환경에서 D-Bus를 통한 활성 창 감지

**구현 내용:**
- `get_installed_apps()`: `/usr/share/applications`, `~/.local/share/applications`, Flatpak, Snap 앱 목록
- `get_running_apps()`: 설치된 앱 중 실행 중인 프로세스 필터링
- `get_frontmost_app()`: X11 또는 Wayland 환경에 따라 자동 선택
  - X11: `_NET_ACTIVE_WINDOW` 속성으로 활성 창 PID 조회
  - Wayland (GNOME): `org.gnome.Shell.Eval` D-Bus 메서드로 `wm_class` 조회
  - Wayland (KDE): `org.kde.KWin` D-Bus로 활성 창 정보 조회
  - XWayland fallback: Wayland에서도 X11 앱은 XWayland를 통해 감지
- `terminate_app_by_bundle_id()`: SIGTERM 시그널로 프로세스 종료

**Wayland 지원 환경:**
- GNOME Shell (Ubuntu, Fedora 등)
- KDE Plasma (KWin)
- XWayland를 통한 X11 앱

## 테스트

```bash
# Tauri 앱 빌드 체크
cargo check --manifest-path schedule-ai-tauri/src-tauri/Cargo.toml

# Native Host 빌드 체크
cargo check --manifest-path schedule-ai-host/Cargo.toml
```

## 참고

- [interprocess crate](https://docs.rs/interprocess/latest/interprocess/)
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
