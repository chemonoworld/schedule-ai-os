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
