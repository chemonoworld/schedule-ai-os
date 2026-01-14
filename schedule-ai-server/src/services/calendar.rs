use chrono::{DateTime, Duration, NaiveDate, Utc};
use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenUrl,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    models::{
        CalendarConnectionStatus, CalendarEvent, EventStatus, GoogleCalendar,
        GoogleCalendarItem, GoogleCalendarListResponse, GoogleCalendarToken, GoogleEvent,
        GoogleEventsResponse, GoogleTokenResponse,
    },
};

/// Calendar OAuth scopes
const CALENDAR_SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "email", // 이메일 정보도 필요
];

/// Google Calendar API base URL
const CALENDAR_API_BASE: &str = "https://www.googleapis.com/calendar/v3";

pub struct CalendarService {
    db: PgPool,
    config: Config,
    oauth_client: BasicClient,
    http_client: reqwest::Client,
}

impl CalendarService {
    pub fn new(db: PgPool, config: Config) -> Self {
        // Calendar용 redirect URI 사용 (또는 기존 것 재사용)
        let redirect_uri = config
            .google_calendar_redirect_uri
            .clone()
            .unwrap_or_else(|| {
                // 기본값: 기존 redirect URI에 /calendar 추가
                config
                    .google_redirect_uri
                    .replace("/callback", "/calendar/callback")
            });

        let oauth_client = BasicClient::new(
            ClientId::new(config.google_client_id.clone()),
            Some(ClientSecret::new(config.google_client_secret.clone())),
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string()).unwrap(),
            Some(TokenUrl::new("https://oauth2.googleapis.com/token".to_string()).unwrap()),
        )
        .set_redirect_uri(RedirectUrl::new(redirect_uri).unwrap());

        Self {
            db,
            config,
            oauth_client,
            http_client: reqwest::Client::new(),
        }
    }

    /// Generate Calendar OAuth authorization URL
    pub fn get_calendar_auth_url(&self) -> (String, CsrfToken, PkceCodeVerifier) {
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        let mut auth_builder = self
            .oauth_client
            .authorize_url(CsrfToken::new_random)
            .set_pkce_challenge(pkce_challenge);

        // Calendar 스코프 추가
        for scope in CALENDAR_SCOPES {
            auth_builder = auth_builder.add_scope(Scope::new(scope.to_string()));
        }

        // access_type=offline으로 refresh_token 받기
        let (auth_url, csrf_token) = auth_builder
            .add_extra_param("access_type", "offline")
            .add_extra_param("prompt", "consent") // 항상 동의 화면 표시 (refresh_token 보장)
            .url();

        (auth_url.to_string(), csrf_token, pkce_verifier)
    }

    /// Exchange authorization code for Calendar tokens
    pub async fn exchange_calendar_code(
        &self,
        user_id: Uuid,
        code: String,
        pkce_verifier: PkceCodeVerifier,
    ) -> AppResult<CalendarConnectionStatus> {
        // 1. Google 토큰 엔드포인트에 코드 교환 요청
        let redirect_uri = self
            .config
            .google_calendar_redirect_uri
            .clone()
            .unwrap_or_else(|| {
                self.config
                    .google_redirect_uri
                    .replace("/callback", "/calendar/callback")
            });

        let token_response = self
            .http_client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code.as_str()),
                ("client_id", &self.config.google_client_id),
                ("client_secret", &self.config.google_client_secret),
                ("redirect_uri", &redirect_uri),
                ("grant_type", "authorization_code"),
                ("code_verifier", pkce_verifier.secret()),
            ])
            .send()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to exchange code: {}", e)))?;

        if !token_response.status().is_success() {
            let error_text = token_response.text().await.unwrap_or_default();
            return Err(AppError::ExternalApi(format!(
                "Failed to exchange calendar code: {}",
                error_text
            )));
        }

        let google_tokens: GoogleTokenResponse = token_response
            .json()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to parse token response: {}", e)))?;

        // 2. 사용자 이메일 정보 조회
        let email = self
            .get_google_email(&google_tokens.access_token)
            .await?;

        // 3. 토큰 만료 시간 계산
        let expires_at = Utc::now() + Duration::seconds(google_tokens.expires_in);

        // 4. 스코프 파싱
        let scopes: Vec<String> = google_tokens
            .scope
            .unwrap_or_default()
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        // 5. DB에 토큰 저장 (upsert)
        sqlx::query(
            r#"
            INSERT INTO google_calendar_tokens
                (user_id, access_token, refresh_token, token_type, expires_at, scopes, google_email)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id) DO UPDATE SET
                access_token = EXCLUDED.access_token,
                refresh_token = COALESCE(EXCLUDED.refresh_token, google_calendar_tokens.refresh_token),
                token_type = EXCLUDED.token_type,
                expires_at = EXCLUDED.expires_at,
                scopes = EXCLUDED.scopes,
                google_email = EXCLUDED.google_email,
                updated_at = NOW()
            "#,
        )
        .bind(user_id)
        .bind(&google_tokens.access_token)
        .bind(&google_tokens.refresh_token)
        .bind(&google_tokens.token_type)
        .bind(expires_at)
        .bind(&scopes)
        .bind(&email)
        .execute(&self.db)
        .await?;

        Ok(CalendarConnectionStatus {
            is_connected: true,
            email: Some(email),
            expires_at: Some(expires_at),
        })
    }

    /// Get Google email from access token
    async fn get_google_email(&self, access_token: &str) -> AppResult<String> {
        let response = self
            .http_client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to get user info: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalApi(
                "Failed to get user info from Google".to_string(),
            ));
        }

        #[derive(serde::Deserialize)]
        struct UserInfo {
            email: String,
        }

        let user_info: UserInfo = response
            .json()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to parse user info: {}", e)))?;

        Ok(user_info.email)
    }

    /// Get calendar connection status for a user
    pub async fn get_connection_status(&self, user_id: Uuid) -> AppResult<CalendarConnectionStatus> {
        let token = sqlx::query_as::<_, GoogleCalendarToken>(
            "SELECT * FROM google_calendar_tokens WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.db)
        .await?;

        match token {
            Some(t) => Ok(CalendarConnectionStatus {
                is_connected: true,
                email: Some(t.google_email),
                expires_at: Some(t.expires_at),
            }),
            None => Ok(CalendarConnectionStatus {
                is_connected: false,
                email: None,
                expires_at: None,
            }),
        }
    }

    /// Get valid access token (refresh if needed)
    pub async fn get_valid_token(&self, user_id: Uuid) -> AppResult<String> {
        let token = sqlx::query_as::<_, GoogleCalendarToken>(
            "SELECT * FROM google_calendar_tokens WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("Calendar not connected".to_string()))?;

        // 만료 5분 전이면 갱신
        if token.expires_at < Utc::now() + Duration::minutes(5) {
            let refresh_token = token
                .refresh_token
                .ok_or_else(|| AppError::BadRequest("No refresh token available".to_string()))?;

            let new_token = self.refresh_token(&refresh_token).await?;
            self.update_token(user_id, &new_token).await?;

            Ok(new_token.access_token)
        } else {
            Ok(token.access_token)
        }
    }

    /// Refresh Google access token
    async fn refresh_token(&self, refresh_token: &str) -> AppResult<GoogleTokenResponse> {
        let response = self
            .http_client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.config.google_client_id.as_str()),
                ("client_secret", self.config.google_client_secret.as_str()),
                ("refresh_token", refresh_token),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to refresh token: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::ExternalApi(format!(
                "Failed to refresh token: {}",
                error_text
            )));
        }

        response
            .json()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to parse refresh response: {}", e)))
    }

    /// Update token in database
    async fn update_token(&self, user_id: Uuid, token: &GoogleTokenResponse) -> AppResult<()> {
        let expires_at = Utc::now() + Duration::seconds(token.expires_in);

        sqlx::query(
            r#"
            UPDATE google_calendar_tokens
            SET access_token = $2,
                refresh_token = COALESCE($3, refresh_token),
                expires_at = $4,
                updated_at = NOW()
            WHERE user_id = $1
            "#,
        )
        .bind(user_id)
        .bind(&token.access_token)
        .bind(&token.refresh_token)
        .bind(expires_at)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    /// Disconnect calendar (revoke and delete tokens)
    pub async fn disconnect(&self, user_id: Uuid) -> AppResult<()> {
        // 1. 토큰 조회
        let token = sqlx::query_as::<_, GoogleCalendarToken>(
            "SELECT * FROM google_calendar_tokens WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.db)
        .await?;

        // 2. Google에서 토큰 취소 시도 (실패해도 계속 진행)
        if let Some(t) = token {
            let _ = self.revoke_google_token(&t.access_token).await;
        }

        // 3. 선택한 캘린더 정보 삭제
        sqlx::query("DELETE FROM user_selected_calendars WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db)
            .await?;

        // 4. 토큰 삭제
        sqlx::query("DELETE FROM google_calendar_tokens WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    /// Revoke Google token
    async fn revoke_google_token(&self, token: &str) -> AppResult<()> {
        let response = self
            .http_client
            .post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", token)])
            .send()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to revoke token: {}", e)))?;

        if !response.status().is_success() {
            tracing::warn!("Failed to revoke Google token (may already be revoked)");
        }

        Ok(())
    }

    // ============================================
    // Calendar API Proxy 메서드
    // ============================================

    /// 캘린더 목록 조회
    pub async fn list_calendars(&self, user_id: Uuid) -> AppResult<Vec<GoogleCalendar>> {
        let access_token = self.get_valid_token(user_id).await?;

        let response = self
            .http_client
            .get(format!("{}/users/me/calendarList", CALENDAR_API_BASE))
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to list calendars: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::ExternalApi(format!(
                "Google Calendar API error ({}): {}",
                status, error_text
            )));
        }

        let calendar_list: GoogleCalendarListResponse = response
            .json()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to parse calendar list: {}", e)))?;

        // 사용자가 선택한 캘린더 ID 조회
        let selected_ids = self.get_selected_calendar_ids(user_id).await?;

        // Google 응답을 Schedule AI 포맷으로 변환
        let calendars = calendar_list
            .items
            .unwrap_or_default()
            .into_iter()
            .map(|item| self.convert_calendar_item(item, &selected_ids))
            .collect();

        Ok(calendars)
    }

    /// Google Calendar Item을 GoogleCalendar로 변환
    fn convert_calendar_item(
        &self,
        item: GoogleCalendarItem,
        selected_ids: &[String],
    ) -> GoogleCalendar {
        GoogleCalendar {
            id: item.id.clone(),
            summary: item.summary.unwrap_or_else(|| "(제목 없음)".to_string()),
            description: item.description,
            background_color: item.background_color,
            is_primary: item.primary.unwrap_or(false),
            is_selected: selected_ids.contains(&item.id),
        }
    }

    /// 선택된 캘린더 ID 목록 조회
    async fn get_selected_calendar_ids(&self, user_id: Uuid) -> AppResult<Vec<String>> {
        let ids = sqlx::query_scalar::<_, String>(
            "SELECT calendar_id FROM user_selected_calendars WHERE user_id = $1",
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
    ) -> AppResult<usize> {
        // 기존 선택 삭제
        sqlx::query("DELETE FROM user_selected_calendars WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db)
            .await?;

        // 새로운 선택 저장
        for calendar_id in &calendar_ids {
            sqlx::query(
                "INSERT INTO user_selected_calendars (user_id, calendar_id) VALUES ($1, $2)",
            )
            .bind(user_id)
            .bind(calendar_id)
            .execute(&self.db)
            .await?;
        }

        Ok(calendar_ids.len())
    }

    /// 이벤트 조회 (선택된 캘린더에서)
    pub async fn list_events(
        &self,
        user_id: Uuid,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> AppResult<Vec<CalendarEvent>> {
        let access_token = self.get_valid_token(user_id).await?;
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

        // 모든 선택된 캘린더의 이벤트 조회
        let mut all_events = Vec::new();

        for calendar_id in selected_ids {
            match self
                .fetch_calendar_events(&access_token, &calendar_id, &time_min, &time_max)
                .await
            {
                Ok(events) => all_events.extend(events),
                Err(e) => {
                    // 개별 캘린더 에러는 로그만 남기고 계속 진행
                    tracing::warn!(
                        "Failed to fetch events from calendar {}: {:?}",
                        calendar_id,
                        e
                    );
                }
            }
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
    ) -> AppResult<Vec<CalendarEvent>> {
        let url = format!(
            "{}/calendars/{}/events",
            CALENDAR_API_BASE,
            urlencoding::encode(calendar_id)
        );

        let response = self
            .http_client
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
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to fetch events: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::ExternalApi(format!(
                "Google Calendar events API error ({}): {}",
                status, error_text
            )));
        }

        let events_response: GoogleEventsResponse = response
            .json()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to parse events: {}", e)))?;

        // Google 응답을 Schedule AI 포맷으로 변환
        let events = events_response
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| self.convert_event(calendar_id, item))
            .collect();

        Ok(events)
    }

    /// Google Event를 CalendarEvent로 변환
    fn convert_event(&self, calendar_id: &str, event: GoogleEvent) -> Option<CalendarEvent> {
        let start = event.start.as_ref()?;
        let end = event.end.as_ref()?;

        let (start_time, is_all_day) = if let Some(ref date) = start.date {
            let dt = NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .ok()?
                .and_hms_opt(0, 0, 0)?
                .and_utc();
            (dt, true)
        } else {
            let dt = DateTime::parse_from_rfc3339(start.date_time.as_ref()?)
                .ok()?
                .with_timezone(&Utc);
            (dt, false)
        };

        let end_time = if let Some(ref date) = end.date {
            // 종일 이벤트의 종료일은 exclusive이므로 하루 전으로 설정
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .ok()?
                .pred_opt()?
                .and_hms_opt(23, 59, 59)?
                .and_utc()
        } else {
            DateTime::parse_from_rfc3339(end.date_time.as_ref()?)
                .ok()?
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
}
