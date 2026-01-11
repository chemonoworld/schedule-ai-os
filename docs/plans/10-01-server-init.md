# 10-01. 서버 초기화

## 개요

Axum 기반 백엔드 서버 프로젝트 초기화 및 기본 구조 설정.

---

## 목표

- [x] Axum 프로젝트 생성 (`schedule-ai-server`)
- [x] 기본 디렉토리 구조 설정
- [x] PostgreSQL + SQLx 연동
- [x] 환경 변수 설정 (`config.rs`)
- [x] 에러 핸들링 (`error.rs`)
- [x] 헬스체크 엔드포인트
- [x] Docker 개발 환경 (PostgreSQL)
- [x] CORS 미들웨어 설정

---

## 디렉토리 구조

```
schedule-ai-server/
├── src/
│   ├── main.rs           # 진입점
│   ├── config.rs         # 환경 변수
│   ├── error.rs          # 에러 타입
│   ├── routes/
│   │   ├── mod.rs
│   │   └── health.rs     # GET /health
│   ├── models/
│   │   └── mod.rs
│   ├── services/
│   │   └── mod.rs
│   └── middleware/
│       └── mod.rs
├── migrations/
│   └── 001_initial.sql
├── Cargo.toml
├── .env.example
├── docker-compose.yml    # 개발용 PostgreSQL
└── README.md
```

---

## 의존성

```toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.7", features = ["runtime-tokio", "postgres", "uuid", "chrono"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tower-http = { version = "0.5", features = ["cors", "trace"] }
thiserror = "1"
```

---

## 환경 변수

```env
# .env.example
DATABASE_URL=postgres://postgres:postgres@localhost:5432/schedule_ai
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
RUST_LOG=info,schedule_ai_server=debug
```

---

## 초기 마이그레이션

```sql
-- migrations/001_initial.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 추후 마이그레이션에서 테이블 추가
```

---

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: schedule_ai
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 구현 순서

1. `cargo new schedule-ai-server` 프로젝트 생성
2. `Cargo.toml` 의존성 추가
3. `docker-compose.yml` 생성 및 PostgreSQL 실행
4. `.env` 및 `config.rs` 설정
5. `error.rs` 에러 타입 정의
6. `main.rs` 기본 Axum 서버 설정
7. `routes/health.rs` 헬스체크 엔드포인트
8. SQLx 마이그레이션 설정
9. CORS 미들웨어 추가
10. 테스트 실행

---

## 예상 결과

```bash
# 서버 실행
cargo run

# 헬스체크
curl http://localhost:3000/health
# {"status": "ok"}
```

---

상태: 완료
우선순위: 높음
완료일: 2026-01-01
