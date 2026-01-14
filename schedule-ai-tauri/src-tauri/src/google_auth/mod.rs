// Google OAuth 2.0 인증 모듈
// PKCE + Loopback redirect 방식으로 데스크톱 앱 인증 구현

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::Entry;
use rand::Rng;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager, State};
use url::Url;

// Keyring 서비스 및 키 이름
const SERVICE_NAME: &str = "schedule-ai";
const ACCESS_TOKEN_KEY: &str = "google-access-token";
const REFRESH_TOKEN_KEY: &str = "google-refresh-token";
const USER_EMAIL_KEY: &str = "google-user-email";
const TOKEN_EXPIRY_KEY: &str = "google-token-expiry";

// Google OAuth 엔드포인트
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

// OAuth 상태를 저장하는 구조체
pub struct OAuthState {
    pub code_verifier: Mutex<Option<String>>,
    pub pending_port: Mutex<Option<u16>>,
}

impl OAuthState {
    pub fn new() -> Self {
        Self {
            code_verifier: Mutex::new(None),
            pending_port: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleUserInfo {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub success: bool,
    pub email: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub is_connected: bool,
    pub email: Option<String>,
    pub expires_at: Option<i64>,
}

// PKCE code_verifier 생성 (43-128자의 랜덤 문자열)
fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

// PKCE code_challenge 생성 (code_verifier의 SHA256 해시를 Base64URL 인코딩)
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(&hash)
}

/// OAuth 인증 URL 생성 (PKCE 포함)
#[command]
pub async fn get_google_auth_url(
    state: State<'_, OAuthState>,
    client_id: String,
    redirect_port: u16,
) -> Result<String, String> {
    // PKCE 생성
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);

    // 상태에 code_verifier 저장
    {
        let mut verifier = state.code_verifier.lock().unwrap();
        *verifier = Some(code_verifier);
    }
    {
        let mut port = state.pending_port.lock().unwrap();
        *port = Some(redirect_port);
    }

    // Google Calendar API 스코프
    let scopes = [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "openid",
    ]
    .join(" ");

    let redirect_uri = format!("http://127.0.0.1:{}", redirect_port);

    let mut url = Url::parse(GOOGLE_AUTH_URL).map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &scopes)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent"); // refresh_token을 받기 위해 필요

    Ok(url.to_string())
}

/// Authorization code를 access token으로 교환
#[command]
pub async fn exchange_google_code(
    state: State<'_, OAuthState>,
    code: String,
    client_id: String,
    client_secret: String,
    redirect_port: u16,
) -> Result<AuthResult, String> {
    // code_verifier 가져오기
    let code_verifier = {
        let verifier = state.code_verifier.lock().unwrap();
        verifier.clone().ok_or("No code verifier found")?
    };

    let redirect_uri = format!("http://127.0.0.1:{}", redirect_port);

    // 토큰 교환 요청
    let client = Client::new();
    let mut params = HashMap::new();
    params.insert("code", code.as_str());
    params.insert("client_id", client_id.as_str());
    params.insert("client_secret", client_secret.as_str());
    params.insert("redirect_uri", redirect_uri.as_str());
    params.insert("grant_type", "authorization_code");
    params.insert("code_verifier", code_verifier.as_str());

    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Ok(AuthResult {
            success: false,
            email: None,
            error: Some(format!("Token exchange failed: {}", error_text)),
        });
    }

    let tokens: GoogleTokens = response.json().await.map_err(|e| e.to_string())?;

    // 사용자 정보 가져오기
    let user_info = get_user_info(&tokens.access_token).await?;

    // 토큰과 사용자 정보 저장
    let expires_at = chrono::Utc::now().timestamp() + tokens.expires_in;
    save_tokens_to_keyring(
        &tokens.access_token,
        tokens.refresh_token.as_deref(),
        &user_info.email,
        expires_at,
    )?;

    // code_verifier 초기화
    {
        let mut verifier = state.code_verifier.lock().unwrap();
        *verifier = None;
    }

    Ok(AuthResult {
        success: true,
        email: Some(user_info.email),
        error: None,
    })
}

/// 사용자 정보 가져오기
async fn get_user_info(access_token: &str) -> Result<GoogleUserInfo, String> {
    let client = Client::new();
    let response = client
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err("Failed to get user info".to_string());
    }

    response.json().await.map_err(|e| e.to_string())
}

/// Keyring에 토큰 저장
fn save_tokens_to_keyring(
    access_token: &str,
    refresh_token: Option<&str>,
    email: &str,
    expires_at: i64,
) -> Result<(), String> {
    let access_entry =
        Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY).map_err(|e| e.to_string())?;
    access_entry
        .set_password(access_token)
        .map_err(|e| e.to_string())?;

    if let Some(refresh) = refresh_token {
        let refresh_entry =
            Entry::new(SERVICE_NAME, REFRESH_TOKEN_KEY).map_err(|e| e.to_string())?;
        refresh_entry
            .set_password(refresh)
            .map_err(|e| e.to_string())?;
    }

    let email_entry = Entry::new(SERVICE_NAME, USER_EMAIL_KEY).map_err(|e| e.to_string())?;
    email_entry.set_password(email).map_err(|e| e.to_string())?;

    let expiry_entry =
        Entry::new(SERVICE_NAME, TOKEN_EXPIRY_KEY).map_err(|e| e.to_string())?;
    expiry_entry
        .set_password(&expires_at.to_string())
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 연결 상태 확인
#[command]
pub async fn get_google_connection_status() -> Result<ConnectionStatus, String> {
    let access_entry = Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY).map_err(|e| e.to_string())?;
    let email_entry = Entry::new(SERVICE_NAME, USER_EMAIL_KEY).map_err(|e| e.to_string())?;
    let expiry_entry = Entry::new(SERVICE_NAME, TOKEN_EXPIRY_KEY).map_err(|e| e.to_string())?;

    let access_token = access_entry.get_password().ok();
    let email = email_entry.get_password().ok();
    let expires_at = expiry_entry
        .get_password()
        .ok()
        .and_then(|s| s.parse::<i64>().ok());

    let is_connected = access_token.is_some() && email.is_some();

    Ok(ConnectionStatus {
        is_connected,
        email,
        expires_at,
    })
}

/// Access token 가져오기 (필요시 갱신)
#[command]
pub async fn get_google_access_token(
    client_id: String,
    client_secret: String,
) -> Result<Option<String>, String> {
    let access_entry = Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY).map_err(|e| e.to_string())?;
    let refresh_entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_KEY).map_err(|e| e.to_string())?;
    let expiry_entry = Entry::new(SERVICE_NAME, TOKEN_EXPIRY_KEY).map_err(|e| e.to_string())?;

    let access_token = match access_entry.get_password() {
        Ok(token) => token,
        Err(_) => return Ok(None),
    };

    let expires_at = expiry_entry
        .get_password()
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let now = chrono::Utc::now().timestamp();

    // 만료 5분 전에 갱신
    if now > expires_at - 300 {
        let refresh_token = match refresh_entry.get_password() {
            Ok(token) => token,
            Err(_) => return Ok(None), // refresh token 없으면 재로그인 필요
        };

        // 토큰 갱신
        match refresh_access_token(&client_id, &client_secret, &refresh_token).await {
            Ok(new_tokens) => {
                let new_expires_at = chrono::Utc::now().timestamp() + new_tokens.expires_in;

                // 새 access token 저장
                access_entry
                    .set_password(&new_tokens.access_token)
                    .map_err(|e| e.to_string())?;
                expiry_entry
                    .set_password(&new_expires_at.to_string())
                    .map_err(|e| e.to_string())?;

                // 새 refresh token이 있으면 저장
                if let Some(new_refresh) = &new_tokens.refresh_token {
                    refresh_entry
                        .set_password(new_refresh)
                        .map_err(|e| e.to_string())?;
                }

                Ok(Some(new_tokens.access_token))
            }
            Err(_) => Ok(None), // 갱신 실패 시 재로그인 필요
        }
    } else {
        Ok(Some(access_token))
    }
}

/// Refresh token으로 access token 갱신
async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<GoogleTokens, String> {
    let client = Client::new();
    let mut params = HashMap::new();
    params.insert("client_id", client_id);
    params.insert("client_secret", client_secret);
    params.insert("refresh_token", refresh_token);
    params.insert("grant_type", "refresh_token");

    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {}", error_text));
    }

    response.json().await.map_err(|e| e.to_string())
}

/// Google 연결 해제
#[command]
pub async fn disconnect_google() -> Result<(), String> {
    let keys = [
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        USER_EMAIL_KEY,
        TOKEN_EXPIRY_KEY,
    ];

    for key in keys {
        if let Ok(entry) = Entry::new(SERVICE_NAME, key) {
            let _ = entry.delete_credential();
        }
    }

    Ok(())
}

/// Google 토큰 취소 (선택적)
#[command]
pub async fn revoke_google_token() -> Result<(), String> {
    let access_entry = Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY).map_err(|e| e.to_string())?;

    if let Ok(token) = access_entry.get_password() {
        let client = Client::new();
        let _ = client
            .post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", token)])
            .send()
            .await;
    }

    disconnect_google().await
}
