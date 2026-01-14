use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Google Calendar OAuth 토큰 (DB 모델)
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct GoogleCalendarToken {
    pub user_id: Uuid,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub expires_at: DateTime<Utc>,
    pub scopes: Vec<String>,
    pub google_email: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Calendar 연결 상태 응답
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarConnectionStatus {
    pub is_connected: bool,
    pub email: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Google OAuth 토큰 응답 (Google API에서 받는 형태)
#[derive(Debug, Clone, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub expires_in: i64,
    pub scope: Option<String>,
}
