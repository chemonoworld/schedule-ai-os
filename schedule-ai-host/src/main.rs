//! Schedule AI Native Messaging Host
//!
//! Chrome Extension과 Tauri 데스크톱 앱 사이의 브릿지 역할을 합니다.
//! - Chrome Extension ←→ stdin/stdout (Native Messaging Protocol)
//! - Tauri App ←→ Local Socket IPC (양방향, 크로스 플랫폼)
//!
//! 크로스 플랫폼 지원:
//! - macOS/Linux: Unix Socket (/tmp/schedule-ai.sock)
//! - Windows: Named Pipe (\\.\pipe\schedule-ai)

use interprocess::local_socket::tokio::{prelude::*, Stream};
#[cfg(unix)]
use interprocess::local_socket::{GenericFilePath, ToFsName};
#[cfg(windows)]
use interprocess::local_socket::{GenericNamespaced, ToNsName};
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::sync::Mutex;

/// 소켓 이름 (Windows Named Pipe용)
#[cfg(windows)]
const SOCKET_NAME: &str = "schedule-ai";

/// Chrome Extension으로부터 받는 메시지
#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload")]
enum IncomingMessage {
    #[serde(rename = "GET_STATE")]
    GetState,
    #[serde(rename = "TOGGLE_FOCUS")]
    ToggleFocus {
        #[allow(dead_code)]
        #[serde(rename = "blockedUrls")]
        blocked_urls: Option<Vec<String>>,
    },
    #[serde(rename = "START_FOCUS")]
    StartFocus {
        #[serde(rename = "blockedUrls")]
        blocked_urls: Vec<String>,
        #[serde(rename = "timerType")]
        timer_type: Option<String>,
        #[serde(rename = "timerDuration")]
        timer_duration: Option<u32>,
    },
    #[serde(rename = "STOP_FOCUS")]
    StopFocus,
    #[serde(rename = "UPDATE_BLOCKED_URLS")]
    UpdateBlockedUrls {
        #[serde(rename = "blockedUrls")]
        blocked_urls: Vec<String>,
    },
}

/// Chrome Extension으로 보내는 메시지
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type")]
enum OutgoingMessage {
    #[serde(rename = "CONNECTED")]
    Connected,
    #[serde(rename = "FOCUS_STATE")]
    FocusState { payload: FocusState },
    #[serde(rename = "ERROR")]
    Error { error: String },
}

/// Focus Mode 상태
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FocusState {
    is_active: bool,
    blocked_urls: Vec<String>,
    elapsed_seconds: u32,
    timer_seconds: u32,
    timer_type: String,
}

/// Tauri 앱으로 보내는 IPC 메시지
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "payload")]
enum IpcRequest {
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

/// Tauri 앱으로부터 받는 IPC 메시지
#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload")]
enum IpcResponse {
    State(FocusState),
    Ok,
    Error { message: String },
}

/// Chrome Native Messaging 프로토콜: 메시지 읽기 (blocking)
fn read_native_message_blocking() -> io::Result<Option<IncomingMessage>> {
    tracing::debug!("Waiting for message from Chrome...");

    let mut len_bytes = [0u8; 4];
    if io::stdin().read_exact(&mut len_bytes).is_err() {
        tracing::debug!("stdin read failed or EOF");
        return Ok(None);
    }

    let len = u32::from_ne_bytes(len_bytes) as usize;
    tracing::debug!("Message length: {} bytes", len);

    if len == 0 || len > 1024 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid message length",
        ));
    }

    let mut buffer = vec![0u8; len];
    io::stdin().read_exact(&mut buffer)?;

    // 원본 JSON 로깅
    if let Ok(raw_json) = String::from_utf8(buffer.clone()) {
        tracing::debug!("Raw JSON from Chrome: {}", raw_json);
    }

    let message: IncomingMessage = serde_json::from_slice(&buffer).map_err(|e| {
        tracing::error!("JSON parse error: {}", e);
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("JSON parse error: {}", e),
        )
    })?;

    Ok(Some(message))
}

/// Chrome Native Messaging 프로토콜: 메시지 쓰기
fn write_native_message(msg: &OutgoingMessage) -> io::Result<()> {
    let json = serde_json::to_vec(msg)?;
    let len = (json.len() as u32).to_ne_bytes();

    let stdout = io::stdout();
    let mut handle = stdout.lock();
    handle.write_all(&len)?;
    handle.write_all(&json)?;
    handle.flush()?;

    Ok(())
}

/// 소켓 이름 생성 (OS별 자동 분기)
fn get_socket_name() -> io::Result<interprocess::local_socket::Name<'static>> {
    #[cfg(unix)]
    {
        "/tmp/schedule-ai.sock".to_fs_name::<GenericFilePath>()
    }
    #[cfg(windows)]
    {
        SOCKET_NAME.to_ns_name::<GenericNamespaced>()
    }
}

/// Tauri IPC 연결 관리
struct TauriConnection {
    reader: BufReader<tokio::io::ReadHalf<Stream>>,
    writer: BufWriter<tokio::io::WriteHalf<Stream>>,
}

impl TauriConnection {
    async fn connect() -> io::Result<Self> {
        let name = get_socket_name()?;
        let stream = Stream::connect(name).await?;
        let (read_half, write_half) = tokio::io::split(stream);
        Ok(Self {
            reader: BufReader::new(read_half),
            writer: BufWriter::new(write_half),
        })
    }

    async fn send_request(&mut self, request: &IpcRequest) -> io::Result<IpcResponse> {
        let json = serde_json::to_string(request)?;
        tracing::debug!("Sending to Tauri: {}", json);
        self.writer.write_all(json.as_bytes()).await?;
        self.writer.write_all(b"\n").await?;
        self.writer.flush().await?;
        tracing::debug!("Sent to Tauri, waiting for response...");

        let mut line = String::new();
        // 5초 타임아웃
        match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            self.reader.read_line(&mut line),
        )
        .await
        {
            Ok(Ok(_)) => {
                tracing::debug!("Got response from Tauri: {}", line.trim());
                let response: IpcResponse = serde_json::from_str(&line)?;
                Ok(response)
            }
            Ok(Err(e)) => {
                tracing::error!("Error reading from Tauri: {}", e);
                Err(e)
            }
            Err(_) => {
                tracing::error!("Timeout waiting for Tauri response");
                Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Tauri response timeout",
                ))
            }
        }
    }

    async fn read_push(&mut self) -> io::Result<Option<IpcResponse>> {
        let mut line = String::new();
        match self.reader.read_line(&mut line).await {
            Ok(0) => Ok(None),
            Ok(_) => {
                let response: IpcResponse = serde_json::from_str(&line)?;
                Ok(Some(response))
            }
            Err(e) => Err(e),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 로깅 초기화
    let log_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".schedule-ai-host.log");

    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    tracing_subscriber::fmt()
        .with_writer(file)
        .with_env_filter("schedule_ai_host=debug")
        .init();

    tracing::info!("Schedule AI Host started");

    // 연결 확인 메시지 전송
    write_native_message(&OutgoingMessage::Connected)?;

    // Chrome 요청 처리용 Tauri 연결 (별도)
    let tauri_conn_for_chrome: Arc<Mutex<Option<TauriConnection>>> = Arc::new(Mutex::new(None));

    // 초기 연결 시도 (Chrome 요청용)
    match TauriConnection::connect().await {
        Ok(conn) => {
            tracing::info!("Connected to Tauri app (for Chrome requests)");
            *tauri_conn_for_chrome.lock().await = Some(conn);
        }
        Err(e) => {
            tracing::warn!("Failed to connect to Tauri app: {}", e);
            write_native_message(&OutgoingMessage::Error {
                error: format!("Tauri app not running: {}", e),
            })?;
        }
    };

    // Push 수신용 별도 연결
    let push_task = tokio::spawn(async move {
        // Push 전용 연결
        let mut push_conn: Option<TauriConnection> = None;

        loop {
            // 연결 없으면 연결 시도
            if push_conn.is_none() {
                match TauriConnection::connect().await {
                    Ok(conn) => {
                        tracing::info!("Connected to Tauri app (for push)");
                        push_conn = Some(conn);
                    }
                    Err(_) => {
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                        continue;
                    }
                }
            }

            let msg = if let Some(ref mut conn) = push_conn {
                conn.read_push().await
            } else {
                continue;
            };

            match msg {
                Ok(Some(IpcResponse::State(state))) => {
                    tracing::debug!("Received push state from Tauri: {:?}", state);
                    if let Err(e) = write_native_message(&OutgoingMessage::FocusState {
                        payload: state,
                    }) {
                        tracing::error!("Failed to write push message: {}", e);
                    }
                }
                Ok(Some(_)) => {}
                Ok(None) => {
                    tracing::warn!("Tauri push connection closed");
                    push_conn = None;
                }
                Err(e) => {
                    tracing::error!("Error reading from Tauri push: {}", e);
                    push_conn = None;
                }
            }
        }
    });

    // Chrome 메시지 처리 (blocking I/O를 별도 스레드에서)
    let chrome_task = tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Handle::current();

        loop {
            let message = match read_native_message_blocking() {
                Ok(Some(msg)) => msg,
                Ok(None) => {
                    tracing::info!("Chrome extension disconnected");
                    break;
                }
                Err(e) => {
                    tracing::error!("Failed to read message: {}", e);
                    let _ = write_native_message(&OutgoingMessage::Error {
                        error: e.to_string(),
                    });
                    continue;
                }
            };

            tracing::debug!("Received from Chrome: {:?}", message);
            tracing::debug!("About to call block_on for Tauri communication...");

            let response = rt.block_on(async {
                tracing::debug!("Inside block_on, acquiring lock...");
                let mut conn_guard = tauri_conn_for_chrome.lock().await;
                tracing::debug!("Lock acquired");

                // 연결 없으면 재연결 시도
                if conn_guard.is_none() {
                    if let Ok(new_conn) = TauriConnection::connect().await {
                        tracing::info!("Reconnected to Tauri app");
                        *conn_guard = Some(new_conn);
                    }
                }

                match &mut *conn_guard {
                    Some(conn) => {
                        let ipc_request = match &message {
                            IncomingMessage::GetState => IpcRequest::GetState,
                            IncomingMessage::ToggleFocus { blocked_urls: _ } => IpcRequest::GetState,
                            IncomingMessage::StartFocus {
                                blocked_urls,
                                timer_type,
                                timer_duration,
                            } => IpcRequest::StartFocus {
                                blocked_urls: blocked_urls.clone(),
                                timer_type: timer_type.clone().unwrap_or_else(|| "none".to_string()),
                                timer_duration: timer_duration.unwrap_or(0),
                            },
                            IncomingMessage::StopFocus => IpcRequest::StopFocus,
                            IncomingMessage::UpdateBlockedUrls { blocked_urls } => {
                                IpcRequest::UpdateBlockedUrls {
                                    blocked_urls: blocked_urls.clone(),
                                }
                            }
                        };

                        match conn.send_request(&ipc_request).await {
                            Ok(IpcResponse::State(state)) => {
                                OutgoingMessage::FocusState { payload: state }
                            }
                            Ok(IpcResponse::Ok) => {
                                // 상태 다시 요청
                                match conn.send_request(&IpcRequest::GetState).await {
                                    Ok(IpcResponse::State(state)) => {
                                        OutgoingMessage::FocusState { payload: state }
                                    }
                                    _ => OutgoingMessage::Connected,
                                }
                            }
                            Ok(IpcResponse::Error { message }) => {
                                OutgoingMessage::Error { error: message }
                            }
                            Err(e) => {
                                tracing::error!("IPC error: {}", e);
                                *conn_guard = None;
                                OutgoingMessage::Error {
                                    error: format!("IPC error: {}", e),
                                }
                            }
                        }
                    }
                    None => {
                        // Tauri 연결 안됨 - 에러 반환
                        OutgoingMessage::Error {
                            error: "Desktop app not connected".to_string(),
                        }
                    }
                }
            });

            tracing::debug!("Sending response to Chrome...");
            if let Err(e) = write_native_message(&response) {
                tracing::error!("Failed to write response: {}", e);
            }
            tracing::debug!("Response sent, looping for next message...");
        }
    });

    // Chrome 태스크가 끝나면 종료
    let _ = chrome_task.await;
    push_task.abort();

    tracing::info!("Schedule AI Host stopped");
    Ok(())
}
