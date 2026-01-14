# 서버 OAuth 확장 (Calendar 스코프 추가)

## 개요
- **상위 태스크**: [Google Calendar 연동](./00_overview.md)
- **목적**: 기존 schedule-ai-server의 Google OAuth에 Calendar 스코프 추가
- **상태**: 대기

## 목표
- [ ] Google Calendar 스코프 추가 (`calendar.readonly`, `calendar.events.readonly`)
- [ ] Calendar 전용 OAuth 엔드포인트 구현
- [ ] Google Calendar 토큰 저장 (별도 테이블 또는 기존 확장)
- [ ] 토큰 갱신 로직 확장 (refresh_token 사용)
- [ ] Deep Link 콜백 처리 (scheduleai://auth/calendar/success)

## 현재 서버 OAuth 구현 분석

### 기존 구현 (schedule-ai-server/src/routes/auth.rs)
```rust
// 현재 스코프
const SCOPES: &[&str] = &["openid", "email", "profile"];

// 현재 엔드포인트
GET  /api/auth/google          // OAuth 시작
GET  /api/auth/google/callback // 콜백 처리
```

### 확장 필요 사항
```rust
// Calendar 스코프 추가
const CALENDAR_SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
];

// Calendar 전용 엔드포인트
GET  /api/auth/google/calendar          // Calendar OAuth 시작
GET  /api/auth/google/calendar/callback // Calendar 콜백
GET  /api/auth/calendar/status          // 연결 상태 확인
POST /api/auth/calendar/disconnect      // 연결 해제
```

## 구현 계획

### 1. DB 스키마 확장

**migrations/XXX_google_calendar_tokens.sql**:
```sql
-- Google Calendar 토큰 테이블
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT NOT NULL DEFAULT 'Bearer',
    expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] NOT NULL,
    google_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 선택한 캘린더 목록 테이블
CREATE TABLE IF NOT EXISTS user_selected_calendars (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, calendar_id)
);

-- 인덱스
CREATE INDEX idx_calendar_tokens_user ON google_calendar_tokens(user_id);
CREATE INDEX idx_calendar_tokens_expires ON google_calendar_tokens(expires_at);
```

### 2. 모델 정의

**src/models/calendar.rs (신규)**:
```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarConnectionStatus {
    pub is_connected: bool,
    pub email: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub expires_in: i64,
    pub scope: String,
}
```

### 3. OAuth 라우트 확장

**src/routes/calendar_auth.rs (신규)**:
```rust
use axum::{
    extract::{Query, State},
    response::{IntoResponse, Redirect},
    routing::{get, post},
    Json, Router,
};
use oauth2::{
    AuthorizationCode, CsrfToken, PkceCodeChallenge, PkceCodeVerifier, Scope,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/google/calendar", get(start_calendar_oauth))
        .route("/google/calendar/callback", get(calendar_oauth_callback))
        .route("/calendar/status", get(get_connection_status))
        .route("/calendar/disconnect", post(disconnect_calendar))
}

/// Calendar OAuth 시작
async fn start_calendar_oauth(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    let client = &state.oauth_client;

    // PKCE 생성
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Calendar 스코프로 인증 URL 생성
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("https://www.googleapis.com/auth/calendar.readonly".to_string()))
        .add_scope(Scope::new("https://www.googleapis.com/auth/calendar.events.readonly".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    // PKCE verifier와 user_id를 임시 저장 (Redis 또는 DB)
    state.oauth_state_store
        .set(csrf_token.secret(), (user.id, pkce_verifier))
        .await;

    Redirect::temporary(auth_url.as_str())
}

/// OAuth 콜백 처리
async fn calendar_oauth_callback(
    State(state): State<AppState>,
    Query(params): Query<OAuthCallbackParams>,
) -> impl IntoResponse {
    // CSRF 검증 및 PKCE verifier 조회
    let (user_id, pkce_verifier) = state.oauth_state_store
        .get(&params.state)
        .await
        .ok_or(AuthError::InvalidState)?;

    // Authorization code를 access token으로 교환
    let token_response = state.oauth_client
        .exchange_code(AuthorizationCode::new(params.code))
        .set_pkce_verifier(pkce_verifier)
        .request_async(oauth2::reqwest::async_http_client)
        .await?;

    // Google에서 사용자 이메일 조회
    let email = get_google_email(&token_response.access_token().secret()).await?;

    // DB에 토큰 저장
    save_calendar_token(&state.db, user_id, &token_response, &email).await?;

    // Desktop 앱으로 리다이렉트 (Deep Link)
    Redirect::temporary("scheduleai://auth/calendar/success")
}

/// 연결 상태 확인
async fn get_connection_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Json<CalendarConnectionStatus> {
    let token = sqlx::query_as::<_, GoogleCalendarToken>(
        "SELECT * FROM google_calendar_tokens WHERE user_id = $1"
    )
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .unwrap();

    Json(CalendarConnectionStatus {
        is_connected: token.is_some(),
        email: token.as_ref().map(|t| t.google_email.clone()),
        expires_at: token.map(|t| t.expires_at),
    })
}

/// 연결 해제
async fn disconnect_calendar(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    // Google 토큰 취소 요청
    if let Some(token) = get_user_calendar_token(&state.db, user.id).await? {
        revoke_google_token(&token.access_token).await.ok();
    }

    // DB에서 토큰 삭제
    sqlx::query("DELETE FROM google_calendar_tokens WHERE user_id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    // 선택한 캘린더 정보도 삭제
    sqlx::query("DELETE FROM user_selected_calendars WHERE user_id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    StatusCode::NO_CONTENT
}
```

### 4. 토큰 갱신 서비스

**src/services/calendar_token.rs (신규)**:
```rust
use chrono::{Duration, Utc};

pub struct CalendarTokenService {
    db: PgPool,
    oauth_client: BasicClient,
}

impl CalendarTokenService {
    /// 유효한 access token 가져오기 (필요시 갱신)
    pub async fn get_valid_token(&self, user_id: Uuid) -> Result<String, Error> {
        let token = self.get_token(user_id).await?
            .ok_or(Error::NotConnected)?;

        // 만료 5분 전이면 갱신
        if token.expires_at < Utc::now() + Duration::minutes(5) {
            let refresh_token = token.refresh_token
                .ok_or(Error::NoRefreshToken)?;

            let new_token = self.refresh_token(&refresh_token).await?;
            self.update_token(user_id, &new_token).await?;

            Ok(new_token.access_token)
        } else {
            Ok(token.access_token)
        }
    }

    /// 토큰 갱신
    async fn refresh_token(&self, refresh_token: &str) -> Result<GoogleTokenResponse, Error> {
        let response = self.oauth_client
            .exchange_refresh_token(&RefreshToken::new(refresh_token.to_string()))
            .request_async(oauth2::reqwest::async_http_client)
            .await?;

        Ok(GoogleTokenResponse {
            access_token: response.access_token().secret().to_string(),
            refresh_token: response.refresh_token().map(|t| t.secret().to_string()),
            token_type: "Bearer".to_string(),
            expires_in: response.expires_in()
                .map(|d| d.as_secs() as i64)
                .unwrap_or(3600),
            scope: "calendar.readonly calendar.events.readonly".to_string(),
        })
    }

    /// DB 토큰 업데이트
    async fn update_token(
        &self,
        user_id: Uuid,
        token: &GoogleTokenResponse,
    ) -> Result<(), Error> {
        let expires_at = Utc::now() + Duration::seconds(token.expires_in);

        sqlx::query(r#"
            UPDATE google_calendar_tokens
            SET access_token = $2,
                refresh_token = COALESCE($3, refresh_token),
                expires_at = $4,
                updated_at = NOW()
            WHERE user_id = $1
        "#)
        .bind(user_id)
        .bind(&token.access_token)
        .bind(&token.refresh_token)
        .bind(expires_at)
        .execute(&self.db)
        .await?;

        Ok(())
    }
}
```

### 5. 라우터 등록

**src/routes/mod.rs 수정**:
```rust
pub mod calendar_auth;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/auth", calendar_auth::router())  // Calendar OAuth 추가
        .nest("/calendar", calendar::router())   // Calendar 프록시 (다음 서브태스크)
        // ... 기타 라우트
}
```

## 환경 변수

**.env 확장**:
```env
# 기존 (변경 없음)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://api.scheduleai.app/api/auth/google/callback

# Calendar 전용 (추가)
GOOGLE_CALENDAR_REDIRECT_URI=https://api.scheduleai.app/api/auth/google/calendar/callback
```

## 보안 고려사항

### 토큰 암호화
- access_token, refresh_token은 DB에 저장 전 암호화
- AES-256-GCM 사용 권장

### PKCE 필수
- 모든 OAuth 플로우에 PKCE 적용
- code_verifier는 임시 저장소에 짧은 TTL로 보관

### 스코프 최소화
- `calendar.readonly` - 캘린더 목록 조회
- `calendar.events.readonly` - 이벤트 조회 (읽기 전용)
- 쓰기 권한은 요청하지 않음

## 관련 파일

| 파일 | 상태 | 설명 |
|------|------|------|
| `src/routes/calendar_auth.rs` | 신규 | Calendar OAuth 라우트 |
| `src/services/calendar_token.rs` | 신규 | 토큰 관리 서비스 |
| `src/models/calendar.rs` | 신규 | Calendar 관련 모델 |
| `migrations/XXX_google_calendar_tokens.sql` | 신규 | DB 스키마 |
| `src/routes/mod.rs` | 수정 | 라우터 등록 |

## 다음 단계

이 서브태스크 완료 후:
1. [02_server-calendar-api.md](./02_server-calendar-api.md) - Calendar API 프록시 구현
