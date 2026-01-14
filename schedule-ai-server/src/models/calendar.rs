use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================
// OAuth 관련 모델
// ============================================

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

// ============================================
// Calendar API 관련 모델
// ============================================

/// 사용자 캘린더 정보
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleCalendar {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    pub background_color: Option<String>,
    pub is_primary: bool,
    pub is_selected: bool,
}

/// 캘린더 이벤트 상태
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventStatus {
    Confirmed,
    Tentative,
    Cancelled,
}

/// 캘린더 이벤트
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub is_all_day: bool,
    pub status: EventStatus,
    pub color_id: Option<String>,
    pub html_link: Option<String>,
}

// ============================================
// API 응답 모델
// ============================================

/// 캘린더 목록 응답
#[derive(Debug, Serialize)]
pub struct CalendarListResponse {
    pub calendars: Vec<GoogleCalendar>,
}

/// 캘린더 이벤트 목록 응답
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventsResponse {
    pub events: Vec<CalendarEvent>,
    pub synced_at: DateTime<Utc>,
}

/// 캘린더 선택 요청
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCalendarsRequest {
    pub calendar_ids: Vec<String>,
}

/// 캘린더 선택 응답
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCalendarsResponse {
    pub success: bool,
    pub selected_count: usize,
}

/// 이벤트 조회 쿼리 파라미터
#[derive(Debug, Deserialize)]
pub struct EventsQueryParams {
    pub start: NaiveDate,
    pub end: NaiveDate,
}

// ============================================
// Google API 내부 응답 타입 (deserialization용)
// ============================================

/// Google Calendar List API 응답
#[derive(Debug, Deserialize)]
pub struct GoogleCalendarListResponse {
    pub items: Option<Vec<GoogleCalendarItem>>,
}

/// Google Calendar List 아이템
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleCalendarItem {
    pub id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub background_color: Option<String>,
    pub primary: Option<bool>,
}

/// Google Events API 응답
#[derive(Debug, Deserialize)]
pub struct GoogleEventsResponse {
    pub items: Option<Vec<GoogleEvent>>,
}

/// Google Event 아이템
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEvent {
    pub id: Option<String>,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: Option<GoogleEventTime>,
    pub end: Option<GoogleEventTime>,
    pub status: Option<String>,
    pub color_id: Option<String>,
    pub html_link: Option<String>,
}

/// Google Event 시간 정보
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEventTime {
    /// 종일 이벤트 (YYYY-MM-DD)
    pub date: Option<String>,
    /// 시간 지정 이벤트 (RFC3339)
    pub date_time: Option<String>,
}
