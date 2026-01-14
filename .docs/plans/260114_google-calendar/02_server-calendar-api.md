# 서버 Calendar API 프록시 엔드포인트

## 개요
- **상위 태스크**: [Google Calendar 연동](./00_overview.md)
- **목적**: Desktop 앱이 서버를 통해 Google Calendar API를 사용할 수 있도록 프록시 엔드포인트 구현
- **상태**: 대기

## 목표
- [ ] 캘린더 목록 조회 API 구현 (`/api/calendar/list`)
- [ ] 캘린더 선택 저장 API 구현 (`/api/calendar/list/select`)
- [ ] 이벤트 조회 API 구현 (`/api/calendar/events`)
- [ ] 응답 데이터 변환 (Google API → Schedule AI 포맷)
- [ ] Rate Limiting 처리

## API 엔드포인트

### 1. 캘린더 목록 조회
```
GET /api/calendar/list
Authorization: Bearer <jwt-token>

Response:
{
  "calendars": [
    {
      "id": "primary",
      "summary": "기본 캘린더",
      "description": null,
      "backgroundColor": "#4285f4",
      "isPrimary": true,
      "isSelected": true
    },
    {
      "id": "en.south_korea#holiday@group.v.calendar.google.com",
      "summary": "대한민국의 휴일",
      "description": null,
      "backgroundColor": "#16a765",
      "isPrimary": false,
      "isSelected": false
    }
  ]
}
```

### 2. 캘린더 선택 저장
```
POST /api/calendar/list/select
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request:
{
  "calendarIds": ["primary", "work@example.com"]
}

Response:
{
  "success": true,
  "selectedCount": 2
}
```

### 3. 이벤트 조회
```
GET /api/calendar/events?start=2026-01-14&end=2026-01-20
Authorization: Bearer <jwt-token>

Response:
{
  "events": [
    {
      "id": "abc123",
      "calendarId": "primary",
      "title": "팀 미팅",
      "description": "주간 스탠드업",
      "location": "회의실 A",
      "startTime": "2026-01-14T10:00:00+09:00",
      "endTime": "2026-01-14T11:00:00+09:00",
      "isAllDay": false,
      "status": "confirmed",
      "colorId": null,
      "htmlLink": "https://calendar.google.com/calendar/event?eid=xxx"
    }
  ],
  "syncedAt": "2026-01-14T09:30:00Z"
}
```

## 구현 계획

### 1. Cargo.toml 의존성 추가

```toml
[dependencies]
google-calendar3 = "5.0"
# 또는 직접 reqwest로 API 호출
```

### 2. 모델 정의

**src/models/calendar.rs (확장)**:
```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendar {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    #[serde(rename = "backgroundColor")]
    pub background_color: Option<String>,
    #[serde(rename = "isPrimary")]
    pub is_primary: bool,
    #[serde(rename = "isSelected")]
    pub is_selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    #[serde(rename = "calendarId")]
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    #[serde(rename = "startTime")]
    pub start_time: DateTime<Utc>,
    #[serde(rename = "endTime")]
    pub end_time: DateTime<Utc>,
    #[serde(rename = "isAllDay")]
    pub is_all_day: bool,
    pub status: EventStatus,
    #[serde(rename = "colorId")]
    pub color_id: Option<String>,
    #[serde(rename = "htmlLink")]
    pub html_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventStatus {
    Confirmed,
    Tentative,
    Cancelled,
}

#[derive(Debug, Serialize)]
pub struct CalendarListResponse {
    pub calendars: Vec<GoogleCalendar>,
}

#[derive(Debug, Serialize)]
pub struct CalendarEventsResponse {
    pub events: Vec<CalendarEvent>,
    #[serde(rename = "syncedAt")]
    pub synced_at: DateTime<Utc>,
}
```

### 3. Calendar 서비스 구현

**src/services/calendar.rs (신규)**:
```rust
use reqwest::Client;
use chrono::{NaiveDate, DateTime, Utc};

pub struct CalendarService {
    http_client: Client,
    token_service: CalendarTokenService,
}

impl CalendarService {
    const CALENDAR_API_BASE: &'static str = "https://www.googleapis.com/calendar/v3";

    pub fn new(token_service: CalendarTokenService) -> Self {
        Self {
            http_client: Client::new(),
            token_service,
        }
    }

    /// 캘린더 목록 조회
    pub async fn list_calendars(&self, user_id: Uuid) -> Result<Vec<GoogleCalendar>, Error> {
        let access_token = self.token_service.get_valid_token(user_id).await?;

        let response = self.http_client
            .get(format!("{}/users/me/calendarList", Self::CALENDAR_API_BASE))
            .bearer_auth(&access_token)
            .send()
            .await?
            .json::<GoogleCalendarListResponse>()
            .await?;

        // 사용자가 선택한 캘린더 ID 조회
        let selected_ids = self.get_selected_calendar_ids(user_id).await?;

        // Google 응답을 Schedule AI 포맷으로 변환
        let calendars = response.items
            .into_iter()
            .map(|item| GoogleCalendar {
                id: item.id.clone(),
                summary: item.summary,
                description: item.description,
                background_color: item.background_color,
                is_primary: item.primary.unwrap_or(false),
                is_selected: selected_ids.contains(&item.id),
            })
            .collect();

        Ok(calendars)
    }

    /// 이벤트 조회 (선택된 캘린더에서)
    pub async fn list_events(
        &self,
        user_id: Uuid,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<CalendarEvent>, Error> {
        let access_token = self.token_service.get_valid_token(user_id).await?;
        let selected_ids = self.get_selected_calendar_ids(user_id).await?;

        if selected_ids.is_empty() {
            return Ok(vec![]);
        }

        let time_min = start_date
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .to_rfc3339();
        let time_max = end_date
            .and_hms_opt(23, 59, 59)
            .unwrap()
            .and_utc()
            .to_rfc3339();

        // 병렬로 모든 선택된 캘린더의 이벤트 조회
        let mut all_events = Vec::new();

        for calendar_id in selected_ids {
            let events = self.fetch_calendar_events(
                &access_token,
                &calendar_id,
                &time_min,
                &time_max,
            ).await?;

            all_events.extend(events);
        }

        // 시간순 정렬
        all_events.sort_by(|a, b| a.start_time.cmp(&b.start_time));

        Ok(all_events)
    }

    /// 단일 캘린더 이벤트 조회
    async fn fetch_calendar_events(
        &self,
        access_token: &str,
        calendar_id: &str,
        time_min: &str,
        time_max: &str,
    ) -> Result<Vec<CalendarEvent>, Error> {
        let url = format!(
            "{}/calendars/{}/events",
            Self::CALENDAR_API_BASE,
            urlencoding::encode(calendar_id)
        );

        let response = self.http_client
            .get(&url)
            .bearer_auth(access_token)
            .query(&[
                ("timeMin", time_min),
                ("timeMax", time_max),
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
                ("maxResults", "250"),
            ])
            .send()
            .await?
            .json::<GoogleEventsResponse>()
            .await?;

        // Google 응답을 Schedule AI 포맷으로 변환
        let events = response.items
            .into_iter()
            .filter_map(|item| self.convert_event(calendar_id, item))
            .collect();

        Ok(events)
    }

    /// Google Event를 CalendarEvent로 변환
    fn convert_event(&self, calendar_id: &str, event: GoogleEvent) -> Option<CalendarEvent> {
        let (start_time, is_all_day) = if let Some(date) = event.start.date {
            let dt = NaiveDate::parse_from_str(&date, "%Y-%m-%d").ok()?
                .and_hms_opt(0, 0, 0)?
                .and_utc();
            (dt, true)
        } else {
            let dt = DateTime::parse_from_rfc3339(&event.start.date_time?).ok()?
                .with_timezone(&Utc);
            (dt, false)
        };

        let end_time = if let Some(date) = event.end.date {
            NaiveDate::parse_from_str(&date, "%Y-%m-%d").ok()?
                .and_hms_opt(23, 59, 59)?
                .and_utc()
        } else {
            DateTime::parse_from_rfc3339(&event.end.date_time?).ok()?
                .with_timezone(&Utc)
        };

        Some(CalendarEvent {
            id: event.id?,
            calendar_id: calendar_id.to_string(),
            title: event.summary.unwrap_or_else(|| "(제목 없음)".to_string()),
            description: event.description,
            location: event.location,
            start_time,
            end_time,
            is_all_day,
            status: match event.status.as_deref() {
                Some("tentative") => EventStatus::Tentative,
                Some("cancelled") => EventStatus::Cancelled,
                _ => EventStatus::Confirmed,
            },
            color_id: event.color_id,
            html_link: event.html_link,
        })
    }

    /// 선택된 캘린더 ID 목록 조회
    async fn get_selected_calendar_ids(&self, user_id: Uuid) -> Result<Vec<String>, Error> {
        // DB에서 조회
        let ids = sqlx::query_scalar::<_, String>(
            "SELECT calendar_id FROM user_selected_calendars WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_all(&self.db)
        .await?;

        Ok(ids)
    }

    /// 캘린더 선택 저장
    pub async fn save_selected_calendars(
        &self,
        user_id: Uuid,
        calendar_ids: Vec<String>,
    ) -> Result<(), Error> {
        // 기존 선택 삭제
        sqlx::query("DELETE FROM user_selected_calendars WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db)
            .await?;

        // 새로운 선택 저장
        for calendar_id in &calendar_ids {
            sqlx::query(
                "INSERT INTO user_selected_calendars (user_id, calendar_id) VALUES ($1, $2)"
            )
            .bind(user_id)
            .bind(calendar_id)
            .execute(&self.db)
            .await?;
        }

        Ok(())
    }
}

// Google API 응답 타입 (내부용)
#[derive(Deserialize)]
struct GoogleCalendarListResponse {
    items: Vec<GoogleCalendarItem>,
}

#[derive(Deserialize)]
struct GoogleCalendarItem {
    id: String,
    summary: String,
    description: Option<String>,
    #[serde(rename = "backgroundColor")]
    background_color: Option<String>,
    primary: Option<bool>,
}

#[derive(Deserialize)]
struct GoogleEventsResponse {
    items: Vec<GoogleEvent>,
}

#[derive(Deserialize)]
struct GoogleEvent {
    id: Option<String>,
    summary: Option<String>,
    description: Option<String>,
    location: Option<String>,
    start: GoogleEventTime,
    end: GoogleEventTime,
    status: Option<String>,
    #[serde(rename = "colorId")]
    color_id: Option<String>,
    #[serde(rename = "htmlLink")]
    html_link: Option<String>,
}

#[derive(Deserialize)]
struct GoogleEventTime {
    date: Option<String>,      // 종일 이벤트
    #[serde(rename = "dateTime")]
    date_time: Option<String>, // 시간 지정 이벤트
}
```

### 4. 라우트 구현

**src/routes/calendar.rs (신규)**:
```rust
use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/list", get(list_calendars))
        .route("/list/select", post(select_calendars))
        .route("/events", get(list_events))
        // 모든 라우트에 인증 필요
        .route_layer(middleware::from_fn(auth_middleware))
}

/// 캘린더 목록 조회
async fn list_calendars(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<CalendarListResponse>, AppError> {
    let calendars = state.calendar_service
        .list_calendars(user.id)
        .await?;

    Ok(Json(CalendarListResponse { calendars }))
}

/// 캘린더 선택 저장
async fn select_calendars(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(request): Json<SelectCalendarsRequest>,
) -> Result<Json<SelectCalendarsResponse>, AppError> {
    state.calendar_service
        .save_selected_calendars(user.id, request.calendar_ids.clone())
        .await?;

    Ok(Json(SelectCalendarsResponse {
        success: true,
        selected_count: request.calendar_ids.len(),
    }))
}

#[derive(Deserialize)]
struct SelectCalendarsRequest {
    #[serde(rename = "calendarIds")]
    calendar_ids: Vec<String>,
}

#[derive(Serialize)]
struct SelectCalendarsResponse {
    success: bool,
    #[serde(rename = "selectedCount")]
    selected_count: usize,
}

/// 이벤트 조회
async fn list_events(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(params): Query<EventsQueryParams>,
) -> Result<Json<CalendarEventsResponse>, AppError> {
    let start_date = NaiveDate::parse_from_str(&params.start, "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("Invalid start date".to_string()))?;
    let end_date = NaiveDate::parse_from_str(&params.end, "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("Invalid end date".to_string()))?;

    let events = state.calendar_service
        .list_events(user.id, start_date, end_date)
        .await?;

    Ok(Json(CalendarEventsResponse {
        events,
        synced_at: Utc::now(),
    }))
}

#[derive(Deserialize)]
struct EventsQueryParams {
    start: String,
    end: String,
}
```

## 에러 처리

### Google API 에러 코드
| 코드 | 설명 | 대응 |
|------|------|------|
| 401 | 토큰 만료 | 자동 갱신 후 재시도 |
| 403 | 권한 없음 | 사용자에게 재인증 요청 |
| 404 | 캘린더 없음 | 선택 목록에서 제거 |
| 429 | Rate Limit | 백오프 후 재시도 |

### 클라이언트 에러 응답
```rust
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: String,
    message: String,
}

// 예시
{
  "error": "calendar_not_connected",
  "code": "CALENDAR_001",
  "message": "Google Calendar가 연결되지 않았습니다"
}
```

## Rate Limiting

### Google Calendar API 제한
- 하루 1,000,000 queries
- 분당 180 queries per user

### 서버 측 대응
```rust
// Rate limiter 미들웨어
async fn rate_limit_middleware(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    request: Request,
    next: Next,
) -> Response {
    let key = format!("calendar_rate_limit:{}", user.id);

    if state.rate_limiter.check(&key, 30, Duration::from_secs(60)).await.is_err() {
        return (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded").into_response();
    }

    next.run(request).await
}
```

## 관련 파일

| 파일 | 상태 | 설명 |
|------|------|------|
| `src/routes/calendar.rs` | 신규 | Calendar 프록시 라우트 |
| `src/services/calendar.rs` | 신규 | Calendar 비즈니스 로직 |
| `src/models/calendar.rs` | 확장 | Calendar 모델 추가 |
| `Cargo.toml` | 수정 | 의존성 추가 |

## 다음 단계

이 서브태스크 완료 후:
1. [03_desktop-integration.md](./03_desktop-integration.md) - Desktop 앱에서 서버 연동
