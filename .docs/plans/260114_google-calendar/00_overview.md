# Google Calendar 연동 - Overview

## 개요
- **목적**: Google Calendar 이벤트를 Schedule AI에 연동하여 기존 일정과 함께 통합 관리
- **배경**: ADHD 환자들은 여러 곳에 흩어진 일정을 한 곳에서 보는 것이 중요. 이미 Google Calendar를 사용하는 사용자들의 기존 일정을 가져와 Task와 함께 표시.
- **아키텍처**: **Backend Proxy 방식** - schedule-ai-server를 통한 OAuth 및 Calendar API 처리

## 아키텍처 변경 (2026-01-14)

### 기존 방식 (❌ 폐기)
```
Desktop App ──직접──> Google OAuth / Calendar API
(Client Secret이 앱에 포함되어 보안 취약)
```

### 새로운 방식 (✅ Backend Proxy)
```
Desktop App ──> schedule-ai-server ──> Google OAuth / Calendar API
                (Client Secret 보관)
                (구독 상태 확인)
                (캘린더 데이터 프록시)
```

## 서브태스크 목록

| # | 서브태스크 | 설명 | 상태 |
|---|-----------|------|------|
| 1 | [01_server-oauth.md](./01_server-oauth.md) | 서버 OAuth 확장 (Calendar 스코프 추가) | 대기 |
| 2 | [02_server-calendar-api.md](./02_server-calendar-api.md) | 서버 Calendar API 프록시 엔드포인트 | 대기 |
| 3 | [03_desktop-integration.md](./03_desktop-integration.md) | Desktop 앱에서 서버 연동 | 대기 |
| 4 | [04_today-integration.md](./04_today-integration.md) | Today 탭에 캘린더 이벤트 표시 | 대기 |
| 5 | [05_progress-integration.md](./05_progress-integration.md) | Progress 탭에 캘린더 이벤트 반영 | 대기 |
| 6 | [06_settings-management.md](./06_settings-management.md) | Settings에서 연동 관리 | 대기 |
| 7 | [07_cleanup-local-oauth.md](./07_cleanup-local-oauth.md) | 로컬 OAuth 코드 정리 (서버 이전 후) | 대기 |

## 전체 목표
- [ ] 서버에 Google Calendar 스코프 추가 (기존 OAuth 확장)
- [ ] 서버에 Calendar API 프록시 엔드포인트 추가
- [ ] Desktop 앱에서 서버 통해 OAuth 진행
- [ ] Desktop 앱에서 서버 통해 Calendar 이벤트 조회
- [ ] Today 탭에서 캘린더 이벤트와 Task 통합 표시
- [ ] Progress 탭 히트맵에 캘린더 이벤트 반영
- [ ] Settings에서 연동 관리 (연결/해제, 동기화 설정)
- [ ] 로컬 OAuth 코드 정리 (google_auth 모듈, 불필요한 의존성 제거)

## 새로운 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri)                          │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │  Today  │  │Progress │  │ Settings │  │   CalendarStore   │ │
│  │   Tab   │  │   Tab   │  │   Tab    │  │    (Zustand)      │ │
│  └────┬────┘  └────┬────┘  └────┬─────┘  └─────────┬─────────┘ │
└───────┼────────────┼────────────┼──────────────────┼───────────┘
        │            │            │                  │
        └────────────┴────────────┴──────────────────┘
                                  │ HTTP API
┌─────────────────────────────────┴───────────────────────────────┐
│                    schedule-ai-server (Axum)                    │
│  ┌──────────────────┐  ┌────────────────────┐  ┌─────────────┐ │
│  │   OAuth Module   │  │  Calendar Proxy    │  │ PostgreSQL  │ │
│  │ /api/auth/google │  │ /api/calendar/*    │  │  (토큰 저장) │ │
│  │   (기존 확장)     │  │   (신규 추가)       │  │             │ │
│  └────────┬─────────┘  └─────────┬──────────┘  └─────────────┘ │
└───────────┼──────────────────────┼──────────────────────────────┘
            │                      │
            ▼                      ▼
┌───────────────────────┐  ┌───────────────────────┐
│   Google OAuth 2.0    │  │  Google Calendar API  │
│   (토큰 발급/갱신)      │  │    (이벤트 조회)       │
└───────────────────────┘  └───────────────────────┘
```

## 데이터 흐름

### 1. 인증 흐름 (Backend Proxy)
```
User clicks "Connect Google Calendar"
    ↓
Desktop App opens browser: server/api/auth/google/calendar
    ↓
Server redirects to Google OAuth consent (Calendar scope 포함)
    ↓
User approves calendar scope
    ↓
Google redirects to server callback
    ↓
Server exchanges code for tokens (with Client Secret)
    ↓
Server stores Google tokens in PostgreSQL (encrypted)
    ↓
Server redirects to Desktop App (deep link: scheduleai://auth/calendar/success)
    ↓
Desktop App refreshes connection status
```

### 2. 캘린더 조회 흐름
```
Desktop App: GET server/api/calendar/events?start=2026-01-14&end=2026-01-14
    ↓
Server: Authenticate request (JWT)
    ↓
Server: Get user's Google tokens from DB
    ↓
Server: If expired, refresh tokens with Google
    ↓
Server: GET Google Calendar API /events
    ↓
Server: Transform response & return to Desktop
    ↓
Desktop App: Update calendarStore
    ↓
UI: Render events with tasks
```

## 기술 스택

### 서버 (schedule-ai-server) - 기존 활용
| 항목 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Axum | 이미 사용 중 |
| OAuth | oauth2 크레이트 | 이미 구현됨 |
| HTTP Client | reqwest | Calendar API 호출용 |
| DB | PostgreSQL + SQLx | 토큰 저장 |
| Calendar API | google-calendar3 | 추가 필요 |

### Desktop (schedule-ai-tauri) - 단순화
| 항목 | 기술 | 비고 |
|------|------|------|
| HTTP Client | fetch (JS) | 서버 API 호출 |
| 상태 관리 | Zustand | calendarStore |
| Deep Link | Tauri plugin | OAuth 콜백 수신 |

## 보안 이점

| 항목 | 기존 (직접 연동) | 새로운 (Backend Proxy) |
|------|-----------------|----------------------|
| Client Secret | 앱에 포함 (노출 위험) | 서버에만 저장 (안전) |
| Token 저장 | 로컬 Keyring | 서버 DB (암호화) |
| Token 갱신 | 앱에서 직접 | 서버에서 처리 |
| 구독 연동 | 불가 | 가능 (서버에서 확인) |
| 다중 기기 | 각각 인증 필요 | 한 번 인증으로 모든 기기 |

## 서버 API 엔드포인트 (신규)

### OAuth 확장
```
GET  /api/auth/google/calendar     # Calendar OAuth 시작
GET  /api/auth/google/calendar/callback  # OAuth 콜백
GET  /api/auth/calendar/status     # 캘린더 연결 상태
POST /api/auth/calendar/disconnect # 캘린더 연결 해제
```

### Calendar 프록시
```
GET  /api/calendar/list           # 캘린더 목록 조회
POST /api/calendar/list/select    # 표시할 캘린더 선택
GET  /api/calendar/events         # 이벤트 조회 (date range)
```

## 의존성 변경

### 서버 추가
```toml
# schedule-ai-server/Cargo.toml
google-calendar3 = "5.0"
```

### Desktop 제거 가능
```toml
# schedule-ai-tauri/src-tauri/Cargo.toml
# 다음 의존성 제거 가능 (토큰을 서버에서 관리)
# keyring = "3"  # 제거
# rand, sha2, base64, url  # OAuth용이었으므로 제거
```

## 관련 파일

### 서버 (신규/수정)
| 파일 | 상태 | 설명 |
|------|------|------|
| `src/routes/auth.rs` | 수정 | Calendar OAuth 추가 |
| `src/routes/calendar.rs` | 신규 | Calendar 프록시 |
| `src/services/calendar.rs` | 신규 | Calendar 서비스 |
| `src/models/calendar.rs` | 신규 | Calendar 모델 |
| `migrations/xxx_google_calendar.sql` | 신규 | DB 스키마 |

### Desktop (수정)
| 파일 | 상태 | 설명 |
|------|------|------|
| `src/stores/calendarStore.ts` | 수정 | 서버 API 호출로 변경 |
| `src-tauri/src/google_auth/` | 제거 | 서버로 이전 |

## 참고 자료
- [Google OAuth 2.0 for Web Server Apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [기존 서버 OAuth 구현](/schedule-ai-server/src/routes/auth.rs)
