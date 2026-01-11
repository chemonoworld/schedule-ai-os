# 10. 구독 모델 및 백엔드 서버

## 개요

Schedule AI의 유료 구독 모델 및 백엔드 서버 설계. 모든 사용자는 10회 무료 AI 기능 사용 후 Pro 구독 필요.

---

## 주요 변경사항 (2026-01-01)

- ~~사용자 자체 Claude API Key 사용 기능 제거~~ → 모든 AI 호출은 서버 경유
- 무료 티어: 10회 AI 기능 무료 제공 (서버에서 카운팅)
- 회원가입: Google OAuth만 지원 (향후 Google Calendar 연동 대비)

---

## 비즈니스 모델

### 무료 플랜 (Free)

| 기능 | 지원 |
|------|------|
| 로컬 SQLite 데이터베이스 | O |
| 모든 로컬 기능 (태스크, 플랜, 포커스 모드 등) | O |
| AI 기능 (플랜 파싱, 태스크 생성 등) | **10회 무료** |
| 기기간 동기화 | X |
| 클라우드 백업 | X |

### 유료 플랜 (Pro) - $9.99/월

| 기능 | 지원 |
|------|------|
| 무료 플랜 모든 기능 | O |
| AI 기능 무제한 | O |
| 기기간 데이터 동기화 | O |
| 클라우드 백업 | O |
| 우선 지원 | O |

---

## 서브 플랜 목록

구현 순서대로 정리:

| 순서 | 플랜 | 설명 | 상태 |
|------|------|------|------|
| 1 | [10-01-server-init](./10-01-server-init.md) | Axum 서버 초기화 및 기본 구조 | **완료** |
| 2 | [10-02-google-oauth](./10-02-google-oauth.md) | Google OAuth 로그인 | **완료** |
| 3 | [10-03-llm-proxy](./10-03-llm-proxy.md) | LLM Proxy 및 무료 횟수 카운팅 | 미시작 |
| 4 | [10-04-client-integration](./10-04-client-integration.md) | 클라이언트(Tauri) 연동 | 미시작 |
| 5 | [10-05-stripe-subscription](./10-05-stripe-subscription.md) | Stripe 결제 연동 | 미시작 |
| 6 | [10-06-cloud-sync](./10-06-cloud-sync.md) | 기기간 동기화 (Pro) | 미시작 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 웹 프레임워크 | Axum 0.7 |
| 런타임 | Tokio |
| 데이터베이스 | PostgreSQL + SQLx |
| 인증 | Google OAuth 2.0 + JWT |
| 결제 | Stripe |
| 배포 | Docker + fly.io / Railway |

---

## 서버 아키텍처

```
schedule-ai-server/
├── src/
│   ├── main.rs           # 진입점, 라우터 설정
│   ├── config.rs         # 환경 변수 설정
│   ├── error.rs          # 에러 타입 정의
│   ├── routes/           # API 라우트
│   │   ├── mod.rs
│   │   ├── auth.rs       # Google OAuth 인증
│   │   ├── subscription.rs # 구독 관리
│   │   ├── llm.rs        # LLM Proxy
│   │   └── sync.rs       # 기기간 동기화
│   ├── models/           # 데이터 모델
│   │   ├── mod.rs
│   │   ├── user.rs
│   │   ├── subscription.rs
│   │   └── usage.rs      # AI 사용량 추적
│   ├── services/         # 비즈니스 로직
│   │   ├── mod.rs
│   │   ├── auth.rs
│   │   ├── llm_proxy.rs
│   │   ├── usage.rs      # 무료 횟수 카운팅
│   │   └── sync.rs
│   └── middleware/       # 미들웨어
│       ├── mod.rs
│       └── auth.rs       # JWT 검증
├── migrations/           # SQLx 마이그레이션
├── Cargo.toml
├── .env.example
└── README.md
```

---

## 데이터 모델

### users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### subscriptions

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free' | 'pro'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active' | 'canceled' | 'past_due'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### usage

```sql
CREATE TABLE usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ai_calls_used INTEGER NOT NULL DEFAULT 0,
  ai_calls_limit INTEGER NOT NULL DEFAULT 10, -- 무료 티어 제한
  reset_at TIMESTAMPTZ, -- Pro는 NULL (무제한)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### sync_data

```sql
CREATE TABLE sync_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  data_type VARCHAR(50) NOT NULL, -- 'plans' | 'tasks' | 'settings'
  data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API 설계

### 인증 (Google OAuth)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/auth/google | Google OAuth 시작 (리다이렉트) |
| GET | /api/auth/google/callback | Google OAuth 콜백 |
| POST | /api/auth/refresh | JWT 토큰 갱신 |
| GET | /api/auth/me | 현재 사용자 정보 + 사용량 |
| POST | /api/auth/logout | 로그아웃 |

### 사용량

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/usage | 현재 AI 사용량 조회 |

### 구독

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/subscription/status | 구독 상태 확인 |
| POST | /api/subscription/checkout | Stripe 결제 세션 생성 |
| POST | /api/subscription/webhook | Stripe 웹훅 처리 |
| POST | /api/subscription/cancel | 구독 취소 |

### LLM Proxy

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/llm/parse-plan | 플랜 파싱 |
| POST | /api/llm/generate-tasks | 태스크 생성 |
| POST | /api/llm/split-task | 태스크 분할 |
| POST | /api/llm/parse-recurring | 반복 일정 파싱 |

### 동기화 (Pro 전용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/sync/pull | 서버 데이터 가져오기 |
| POST | /api/sync/push | 로컬 변경 사항 푸시 |
| POST | /api/sync/resolve | 충돌 해결 |

---

## 보안 고려사항

1. **인증**: Google OAuth + JWT, refresh token rotation
2. **HTTPS**: 모든 API 통신 암호화
3. **Rate Limiting**: API 요청 제한
4. **CORS**: 허용된 origin만 접근
5. **API Key 보관**: Claude API Key는 서버 환경변수로만 관리

---

## 구현 순서

1. **10-01**: 서버 초기화 (Axum, PostgreSQL, 기본 구조)
2. **10-02**: Google OAuth 로그인
3. **10-03**: LLM Proxy + 무료 횟수 카운팅
4. **10-04**: 클라이언트 연동 (API Key 입력 UI 제거, 서버 연동)
5. **10-05**: Stripe 결제 연동
6. **10-06**: 기기간 동기화

---

## 참고

- [Axum 공식 문서](https://docs.rs/axum/latest/axum/)
- [SQLx 가이드](https://github.com/launchbadge/sqlx)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Stripe API](https://stripe.com/docs/api)

---

마지막 업데이트: 2026-01-01
