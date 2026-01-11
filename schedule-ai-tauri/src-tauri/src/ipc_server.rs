//! Chrome Extension과 통신하기 위한 IPC 서버
//!
//! Native Host와 통신하여 Focus Mode 상태를 공유합니다.
//!
//! 크로스 플랫폼 지원:
//! - macOS/Linux: Unix Socket (/tmp/schedule-ai.sock)
//! - Windows: Named Pipe (\\.\pipe\schedule-ai)

use interprocess::local_socket::{
    tokio::{prelude::*, Stream},
    ListenerOptions,
};
#[cfg(unix)]
use interprocess::local_socket::{GenericFilePath, ToFsName};
#[cfg(windows)]
use interprocess::local_socket::{GenericNamespaced, ToNsName};
use serde::{Deserialize, Serialize};
use std::io;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{broadcast, RwLock};

/// 소켓 이름 (OS별로 자동 변환됨)
/// - Unix: /tmp/schedule-ai.sock
/// - Windows: \\.\pipe\schedule-ai
pub const SOCKET_NAME: &str = "schedule-ai";

/// Focus Mode 상태
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FocusState {
    pub is_active: bool,
    pub blocked_urls: Vec<String>,
    pub elapsed_seconds: u32,
    pub timer_seconds: u32,
    pub timer_type: String,
}

/// IPC 요청 메시지
#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum IpcRequest {
    GetState,
    StartFocus {
        blocked_urls: Vec<String>,
        timer_type: String,
        timer_duration: u32,
    },
    StopFocus,
    UpdateBlockedUrls {
        blocked_urls: Vec<String>,
    },
}

/// IPC 응답 메시지
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum IpcResponse {
    State(FocusState),
    Ok,
    Error { message: String },
}

/// Chrome Extension에서 Focus Mode 제어 요청 시 프론트엔드에 알림
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionFocusCommand {
    pub command: String, // "start" | "stop"
    pub blocked_urls: Vec<String>,
    pub timer_type: String,
    pub timer_duration: u32,
}

/// IPC 서버의 공유 상태
pub struct IpcServerState {
    pub focus_state: RwLock<FocusState>,
    pub state_tx: broadcast::Sender<FocusState>,
    pub app_handle: RwLock<Option<AppHandle>>,
    /// Extension에서 온 명령 큐 (덮어씌움 방지)
    pub pending_commands: RwLock<Vec<ExtensionFocusCommand>>,
}

impl IpcServerState {
    pub fn new() -> Self {
        let (state_tx, _) = broadcast::channel(16);
        Self {
            focus_state: RwLock::new(FocusState::default()),
            state_tx,
            app_handle: RwLock::new(None),
            pending_commands: RwLock::new(Vec::new()),
        }
    }

    /// 대기 중인 Extension 명령 가져오기 (마지막 명령만 처리, 중간 명령은 무시)
    pub async fn take_pending_command(&self) -> Option<ExtensionFocusCommand> {
        let mut commands = self.pending_commands.write().await;
        if commands.is_empty() {
            None
        } else {
            // 마지막 명령만 가져오고 나머지는 버림
            let last_command = commands.pop();
            commands.clear();
            last_command
        }
    }

    /// AppHandle 설정 (setup에서 호출)
    pub async fn set_app_handle(&self, handle: AppHandle) {
        let mut app_handle = self.app_handle.write().await;
        *app_handle = Some(handle);
    }

    /// Focus Mode 상태 업데이트 (Tauri 앱에서 호출)
    pub async fn update_state(&self, new_state: FocusState) {
        {
            let mut state = self.focus_state.write().await;
            *state = new_state.clone();
        }
        // 연결된 모든 클라이언트에게 상태 변경 알림
        let _ = self.state_tx.send(new_state);
    }

    /// 현재 상태 가져오기
    pub async fn get_state(&self) -> FocusState {
        self.focus_state.read().await.clone()
    }

    /// Chrome Extension에서 Focus 제어 요청 시 프론트엔드에 알림
    pub async fn emit_focus_command(&self, command: ExtensionFocusCommand) {
        // pending_commands 큐에 추가 (덮어씌움 방지)
        {
            let mut commands = self.pending_commands.write().await;
            commands.push(command.clone());
            println!(
                "Added command to queue: {:?}, queue size: {}",
                command.command,
                commands.len()
            );
        }

        // emit도 시도 (작동하면 더 빠름)
        let app_handle = self.app_handle.read().await;
        if let Some(handle) = app_handle.as_ref() {
            match handle.emit_to(
                tauri::EventTarget::any(),
                "extension-focus-command",
                &command,
            ) {
                Ok(_) => println!("Also emitted focus command: {:?}", command.command),
                Err(e) => eprintln!("Failed to emit focus command: {}", e),
            }
        }
    }
}

/// 소켓 이름 생성 (OS별 자동 분기)
fn get_socket_name() -> io::Result<interprocess::local_socket::Name<'static>> {
    // Unix에서는 파일 시스템 경로 사용
    #[cfg(unix)]
    {
        "/tmp/schedule-ai.sock".to_fs_name::<GenericFilePath>()
    }
    // Windows에서는 Named Pipe 네임스페이스 사용
    #[cfg(windows)]
    {
        SOCKET_NAME.to_ns_name::<GenericNamespaced>()
    }
}

/// IPC 서버 시작 (크로스 플랫폼)
pub async fn start_ipc_server(
    state: Arc<IpcServerState>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let name = get_socket_name()?;

    // Unix에서는 기존 소켓 파일 제거
    #[cfg(unix)]
    {
        let _ = std::fs::remove_file("/tmp/schedule-ai.sock");
    }

    let opts = ListenerOptions::new().name(name);
    let listener = match opts.create_tokio() {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to create IPC listener: {}", e);
            return Err(e.into());
        }
    };

    println!("IPC server listening on {}", SOCKET_NAME);

    loop {
        match listener.accept().await {
            Ok(stream) => {
                let state_clone = state.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, state_clone).await {
                        eprintln!("IPC connection error: {}", e);
                    }
                });
            }
            Err(e) => {
                eprintln!("Failed to accept IPC connection: {}", e);
            }
        }
    }
}

/// 개별 연결 처리
async fn handle_connection(
    stream: Stream,
    state: Arc<IpcServerState>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (reader, mut writer) = stream.split();
    let mut reader = BufReader::new(reader);
    let mut line = String::new();

    // 상태 변경 구독
    let mut state_rx = state.state_tx.subscribe();

    loop {
        tokio::select! {
            // 클라이언트로부터 요청 수신
            result = reader.read_line(&mut line) => {
                match result {
                    Ok(0) => {
                        // 연결 종료
                        break;
                    }
                    Ok(_) => {
                        let response = process_request(&line, &state).await;
                        let response_json = serde_json::to_string(&response)?;
                        writer.write_all(response_json.as_bytes()).await?;
                        writer.write_all(b"\n").await?;
                        writer.flush().await?;
                        line.clear();
                    }
                    Err(e) => {
                        eprintln!("Error reading from IPC client: {}", e);
                        break;
                    }
                }
            }

            // 상태 변경 시 클라이언트에게 푸시
            result = state_rx.recv() => {
                match result {
                    Ok(new_state) => {
                        let response = IpcResponse::State(new_state);
                        let response_json = serde_json::to_string(&response)?;
                        writer.write_all(response_json.as_bytes()).await?;
                        writer.write_all(b"\n").await?;
                        writer.flush().await?;
                    }
                    Err(_) => {
                        // 채널 닫힘
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

/// IPC 요청 처리
async fn process_request(request_str: &str, state: &Arc<IpcServerState>) -> IpcResponse {
    let request: Result<IpcRequest, _> = serde_json::from_str(request_str.trim());
    println!("IPC request: {:?}", request);

    match request {
        Ok(IpcRequest::GetState) => {
            let current_state = state.get_state().await;
            IpcResponse::State(current_state)
        }
        Ok(IpcRequest::StartFocus {
            blocked_urls,
            timer_type,
            timer_duration,
        }) => {
            println!("Processing StartFocus command");
            // 프론트엔드에 Focus 시작 명령 emit
            state
                .emit_focus_command(ExtensionFocusCommand {
                    command: "start".to_string(),
                    blocked_urls: blocked_urls.clone(),
                    timer_type: timer_type.clone(),
                    timer_duration,
                })
                .await;
            println!("Emitted StartFocus, updating state");

            let new_state = FocusState {
                is_active: true,
                blocked_urls,
                elapsed_seconds: 0,
                timer_seconds: timer_duration * 60,
                timer_type,
            };
            state.update_state(new_state.clone()).await;
            IpcResponse::State(new_state)
        }
        Ok(IpcRequest::StopFocus) => {
            // 프론트엔드에 Focus 종료 명령 emit
            state
                .emit_focus_command(ExtensionFocusCommand {
                    command: "stop".to_string(),
                    blocked_urls: vec![],
                    timer_type: "none".to_string(),
                    timer_duration: 0,
                })
                .await;

            let new_state = FocusState::default();
            state.update_state(new_state.clone()).await;
            IpcResponse::State(new_state)
        }
        Ok(IpcRequest::UpdateBlockedUrls { blocked_urls }) => {
            let mut current_state = state.get_state().await;
            current_state.blocked_urls = blocked_urls;
            state.update_state(current_state.clone()).await;
            IpcResponse::State(current_state)
        }
        Err(e) => IpcResponse::Error {
            message: format!("Invalid request: {}", e),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_focus_state_serialization() {
        let state = FocusState {
            is_active: true,
            blocked_urls: vec!["youtube.com".to_string()],
            elapsed_seconds: 120,
            timer_seconds: 1500,
            timer_type: "pomodoro".to_string(),
        };

        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("isActive"));
        assert!(json.contains("blockedUrls"));
    }
}
