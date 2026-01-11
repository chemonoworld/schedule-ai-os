# 10-02. Google OAuth 로그인

## 개요

Google OAuth 2.0을 통한 사용자 인증 시스템 구현.

---

## 목표

- [ ] Google Cloud Console 프로젝트 설정 (사용자 수동 설정 필요)
- [ ] OAuth 2.0 클라이언트 ID 생성 (사용자 수동 설정 필요)
- [x] `users` 테이블 마이그레이션
- [x] Google OAuth 플로우 구현
- [x] JWT 토큰 발급/검증
- [x] Refresh Token 관리
- [x] 인증 미들웨어

---

## Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. OAuth 동의 화면 설정
4. OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
5. 승인된 리디렉션 URI 추가:
   - `http://localhost:3000/api/auth/google/callback` (개발)
   - `https://api.schedule-ai.com/api/auth/google/callback` (프로덕션)

---

## 의존성 추가

```toml
[dependencies]
oauth2 = "4"
reqwest = { version = "0.12", features = ["json"] }
jsonwebtoken = "9"
```

---

## 환경 변수 추가

```env
# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# JWT
JWT_SECRET=your-super-secret-key-at-least-32-chars
JWT_EXPIRES_IN=3600        # 1시간
REFRESH_TOKEN_EXPIRES_IN=604800  # 7일
```

---

## 마이그레이션

```sql
-- migrations/002_users.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

---

## API 엔드포인트

### GET /api/auth/google

OAuth 플로우 시작. Google 로그인 페이지로 리다이렉트.

**Response**: 302 Redirect to Google

### GET /api/auth/google/callback

Google에서 돌아온 후 처리.

**Query Params**:
- `code`: Authorization code
- `state`: CSRF 방지용 state

**Response**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@gmail.com",
    "name": "User Name",
    "avatar_url": "https://..."
  },
  "access_token": "eyJ...",
  "refresh_token": "xxx",
  "expires_in": 3600
}
```

### POST /api/auth/refresh

Access Token 갱신.

**Request**:
```json
{
  "refresh_token": "xxx"
}
```

**Response**:
```json
{
  "access_token": "eyJ...",
  "expires_in": 3600
}
```

### GET /api/auth/me

현재 로그인한 사용자 정보.

**Headers**: `Authorization: Bearer {access_token}`

**Response**:
```json
{
  "id": "uuid",
  "email": "user@gmail.com",
  "name": "User Name",
  "avatar_url": "https://..."
}
```

### POST /api/auth/logout

로그아웃 (Refresh Token 무효화).

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "refresh_token": "xxx"
}
```

---

## OAuth 플로우

```
┌─────────┐     ┌─────────────┐     ┌────────┐
│ Client  │────▶│ /auth/google│────▶│ Google │
└─────────┘     └─────────────┘     └────────┘
                                         │
                                         ▼
┌─────────┐     ┌─────────────────┐  ┌────────┐
│ Client  │◀────│ /auth/callback  │◀─│ Google │
│ (token) │     │ (JWT 발급)      │  │(code)  │
└─────────┘     └─────────────────┘  └────────┘
```

---

## JWT 구조

```rust
#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,      // user_id
    pub email: String,
    pub exp: i64,         // 만료 시간
    pub iat: i64,         // 발급 시간
}
```

---

## 인증 미들웨어

```rust
// middleware/auth.rs
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    let claims = verify_jwt(token, &state.config.jwt_secret)?;

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}
```

---

## 구현 순서

1. 의존성 추가
2. 환경 변수 추가
3. 마이그레이션 실행
4. `models/user.rs` 생성
5. `services/auth.rs` - OAuth, JWT 로직
6. `routes/auth.rs` - 엔드포인트
7. `middleware/auth.rs` - 인증 미들웨어
8. Google Cloud Console 설정
9. 테스트

---

## Tauri 클라이언트 연동

OAuth 콜백을 Tauri 앱에서 처리하기 위한 딥링크 설정 필요:

```
scheduleai://auth/callback?token=xxx
```

이는 10-04 클라이언트 연동에서 구현.

---

상태: 완료 (Google Cloud Console 설정은 배포 시 수동 진행)
우선순위: 높음
완료일: 2026-01-01

## 구현된 파일

- `schedule-ai-server/src/models/user.rs` - User, RefreshToken 모델
- `schedule-ai-server/src/services/auth.rs` - AuthService (OAuth, JWT)
- `schedule-ai-server/src/routes/auth.rs` - 인증 엔드포인트
- `schedule-ai-server/src/middleware/auth.rs` - JWT 인증 미들웨어
- `schedule-ai-server/migrations/002_users.sql` - 사용자 테이블
