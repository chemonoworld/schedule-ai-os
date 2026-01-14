# 서버 통합 테스트

## 개요
- **상위 태스크**: [Google Calendar 테스트](./00_overview.md)
- **목적**: Calendar API 엔드포인트의 통합 테스트 작성
- **상태**: 대기

## 목표
- [ ] OAuth 라우트 통합 테스트
- [ ] Calendar API 라우트 통합 테스트
- [ ] 인증 미들웨어 테스트
- [ ] 에러 응답 테스트

## 구현 계획

### 1. 테스트 파일 구조
```
schedule-ai-server/
└── tests/
    ├── common/
    │   ├── mod.rs           # 공통 테스트 유틸리티
    │   └── fixtures.rs      # 테스트 데이터
    ├── calendar_auth_test.rs
    └── calendar_api_test.rs
```

### 2. 공통 테스트 유틸리티

```rust
// tests/common/mod.rs

use axum::Router;
use sqlx::PgPool;
use schedule_ai_server::create_app;

pub struct TestApp {
    pub router: Router,
    pub db: PgPool,
}

impl TestApp {
    pub async fn new() -> Self {
        // 테스트용 DB 설정
        let db_url = std::env::var("TEST_DATABASE_URL")
            .unwrap_or_else(|_| "postgres://test:test@localhost/schedule_ai_test".to_string());

        let db = PgPool::connect(&db_url).await.unwrap();

        // 마이그레이션 실행
        sqlx::migrate!("./migrations")
            .run(&db)
            .await
            .unwrap();

        let router = create_app(db.clone()).await;

        Self { router, db }
    }

    pub async fn cleanup(&self) {
        // 테스트 데이터 정리
        sqlx::query("DELETE FROM user_selected_calendars").execute(&self.db).await.ok();
        sqlx::query("DELETE FROM google_calendar_tokens").execute(&self.db).await.ok();
    }
}

// JWT 테스트 토큰 생성
pub fn create_test_jwt(user_id: &str) -> String {
    // 테스트용 JWT 생성
}

// Mock Google OAuth Response
pub fn mock_google_token_response() -> String {
    serde_json::json!({
        "access_token": "test_access_token",
        "refresh_token": "test_refresh_token",
        "expires_in": 3600,
        "token_type": "Bearer",
        "scope": "calendar.readonly"
    }).to_string()
}
```

### 3. OAuth 라우트 테스트

```rust
// tests/calendar_auth_test.rs

use axum_test::TestServer;
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path};

mod common;
use common::*;

#[tokio::test]
async fn test_start_calendar_oauth() {
    // Given
    let app = TestApp::new().await;
    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-123");

    // When: OAuth 시작 요청
    let response = server
        .get("/api/auth/google/calendar")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .await;

    // Then: Google OAuth URL로 리다이렉트
    assert_eq!(response.status_code(), 302);
    let location = response.header("Location");
    assert!(location.contains("accounts.google.com"));
    assert!(location.contains("calendar.readonly"));

    app.cleanup().await;
}

#[tokio::test]
async fn test_calendar_oauth_callback_success() {
    // Given
    let app = TestApp::new().await;
    let server = TestServer::new(app.router).unwrap();

    // Google API Mock
    let mock_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            mock_google_token_response()
        ))
        .mount(&mock_server)
        .await;

    // When: OAuth 콜백 수신
    let response = server
        .get("/api/auth/google/calendar/callback")
        .add_query_param("code", "test_auth_code")
        .add_query_param("state", "valid_csrf_state")
        .await;

    // Then: Deep Link로 리다이렉트
    assert_eq!(response.status_code(), 302);
    let location = response.header("Location");
    assert!(location.contains("scheduleai://auth/calendar/success"));

    app.cleanup().await;
}

#[tokio::test]
async fn test_calendar_oauth_callback_error() {
    // Given
    let app = TestApp::new().await;
    let server = TestServer::new(app.router).unwrap();

    // When: 에러 파라미터와 함께 콜백
    let response = server
        .get("/api/auth/google/calendar/callback")
        .add_query_param("error", "access_denied")
        .await;

    // Then: 에러 Deep Link로 리다이렉트
    assert_eq!(response.status_code(), 302);
    let location = response.header("Location");
    assert!(location.contains("scheduleai://auth/calendar/error"));

    app.cleanup().await;
}

#[tokio::test]
async fn test_get_connection_status_connected() {
    // Given: 토큰이 저장된 상태
    let app = TestApp::new().await;
    // ... 토큰 저장
    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-123");

    // When
    let response = server
        .get("/api/auth/calendar/status")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .await;

    // Then
    assert_eq!(response.status_code(), 200);
    let body: serde_json::Value = response.json();
    assert_eq!(body["isConnected"], true);
    assert!(body["email"].is_string());

    app.cleanup().await;
}

#[tokio::test]
async fn test_get_connection_status_not_connected() {
    // Given: 토큰이 없는 상태
    let app = TestApp::new().await;
    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-456");

    // When
    let response = server
        .get("/api/auth/calendar/status")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .await;

    // Then
    assert_eq!(response.status_code(), 200);
    let body: serde_json::Value = response.json();
    assert_eq!(body["isConnected"], false);

    app.cleanup().await;
}

#[tokio::test]
async fn test_disconnect_calendar() {
    // Given: 연결된 상태
    let app = TestApp::new().await;
    // ... 토큰 저장
    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-123");

    // When
    let response = server
        .post("/api/auth/calendar/disconnect")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .await;

    // Then
    assert_eq!(response.status_code(), 204);

    // DB에서 토큰 삭제 확인
    // ...

    app.cleanup().await;
}

#[tokio::test]
async fn test_auth_required() {
    // Given: JWT 없음
    let app = TestApp::new().await;
    let server = TestServer::new(app.router).unwrap();

    // When
    let response = server
        .get("/api/auth/calendar/status")
        .await;

    // Then: 401 Unauthorized
    assert_eq!(response.status_code(), 401);

    app.cleanup().await;
}
```

### 4. Calendar API 라우트 테스트

```rust
// tests/calendar_api_test.rs

use axum_test::TestServer;
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path, query_param};

mod common;
use common::*;

#[tokio::test]
async fn test_list_calendars() {
    // Given: 연결된 상태 + Google API Mock
    let app = TestApp::new().await;
    // ... 토큰 저장

    let mock_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/calendar/v3/users/me/calendarList"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "items": [
                {
                    "id": "primary",
                    "summary": "기본 캘린더",
                    "backgroundColor": "#4285f4",
                    "primary": true
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-123");

    // When
    let response = server
        .get("/api/calendar/list")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .await;

    // Then
    assert_eq!(response.status_code(), 200);
    let body: serde_json::Value = response.json();
    assert!(body["calendars"].is_array());
    assert_eq!(body["calendars"][0]["id"], "primary");

    app.cleanup().await;
}

#[tokio::test]
async fn test_select_calendars() {
    // Given
    let app = TestApp::new().await;
    // ... 토큰 저장
    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-123");

    // When
    let response = server
        .post("/api/calendar/list/select")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .json(&serde_json::json!({
            "calendarIds": ["primary", "work@example.com"]
        }))
        .await;

    // Then
    assert_eq!(response.status_code(), 200);
    let body: serde_json::Value = response.json();
    assert_eq!(body["success"], true);
    assert_eq!(body["selectedCount"], 2);

    app.cleanup().await;
}

#[tokio::test]
async fn test_list_events() {
    // Given: 연결된 상태 + 선택된 캘린더 + Google API Mock
    let app = TestApp::new().await;
    // ... 토큰 및 선택 저장

    let mock_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/calendar/v3/calendars/primary/events"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "items": [
                {
                    "id": "event1",
                    "summary": "팀 미팅",
                    "start": { "dateTime": "2026-01-14T10:00:00+09:00" },
                    "end": { "dateTime": "2026-01-14T11:00:00+09:00" },
                    "status": "confirmed"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-123");

    // When
    let response = server
        .get("/api/calendar/events")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .add_query_param("start", "2026-01-14")
        .add_query_param("end", "2026-01-14")
        .await;

    // Then
    assert_eq!(response.status_code(), 200);
    let body: serde_json::Value = response.json();
    assert!(body["events"].is_array());
    assert_eq!(body["events"][0]["title"], "팀 미팅");
    assert!(body["syncedAt"].is_string());

    app.cleanup().await;
}

#[tokio::test]
async fn test_list_events_invalid_date() {
    // Given
    let app = TestApp::new().await;
    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-123");

    // When: 잘못된 날짜 형식
    let response = server
        .get("/api/calendar/events")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .add_query_param("start", "invalid-date")
        .add_query_param("end", "2026-01-14")
        .await;

    // Then: 400 Bad Request
    assert_eq!(response.status_code(), 400);

    app.cleanup().await;
}

#[tokio::test]
async fn test_list_events_not_connected() {
    // Given: 연결되지 않은 상태
    let app = TestApp::new().await;
    let server = TestServer::new(app.router).unwrap();
    let jwt = create_test_jwt("user-999");

    // When
    let response = server
        .get("/api/calendar/events")
        .add_header("Authorization", format!("Bearer {}", jwt))
        .add_query_param("start", "2026-01-14")
        .add_query_param("end", "2026-01-14")
        .await;

    // Then: 에러 응답
    assert_eq!(response.status_code(), 400);
    let body: serde_json::Value = response.json();
    assert!(body["error"].as_str().unwrap().contains("not connected"));

    app.cleanup().await;
}
```

## 의존성

```toml
[dev-dependencies]
axum-test = "17"
wiremock = "0.6"
tower = { version = "0.5", features = ["util"] }
```

## 고려사항

### 테스트 DB
- 테스트 전용 PostgreSQL 인스턴스 사용
- `TEST_DATABASE_URL` 환경 변수로 설정
- CI에서 Docker로 자동 실행

### Google API 모킹
- `wiremock`으로 Google Calendar API 응답 모킹
- 다양한 응답 시나리오 테스트 (성공, 에러, Rate Limit)

### 인증 테스트
- JWT 토큰 유효성 검증 테스트
- 만료된 토큰 처리 테스트

## 관련 파일
- `src/routes/calendar.rs` - Calendar API 라우트
- `src/routes/calendar_auth.rs` - OAuth 라우트
