# Google Calendar 연동 - Progress Overview

## 원본
- 계획: [00_overview.md](../../plans/260114_google-calendar/00_overview.md)

## 아키텍처
- **Backend Proxy 방식** (2026-01-14 변경)
- Desktop App → schedule-ai-server → Google Calendar API

## 서브태스크 진행 상황

| # | 서브태스크 | 상태 | 완료율 |
|---|-----------|------|--------|
| 1 | [01_server-oauth](./01_server-oauth.md) | ✅ 완료 | 100% |
| 2 | [02_server-calendar-api](./02_server-calendar-api.md) | ✅ 완료 | 100% |
| 3 | 03_desktop-integration | 대기 | 0% |
| 4 | 04_today-integration | 대기 | 0% |
| 5 | 05_progress-integration | 대기 | 0% |
| 6 | 06_settings-management | 대기 | 0% |
| 7 | 07_cleanup-local-oauth | 대기 | 0% |

## 전체 완료율
- **29%** (2/7 서브태스크 완료)

## 최근 업데이트

### 2026-01-14
- **아키텍처 변경**: Desktop 직접 OAuth → Backend Proxy 방식
- **01_server-oauth 완료**:
  - DB 마이그레이션 (003_google_calendar.sql)
  - Calendar 모델 정의 (GoogleCalendarToken, CalendarConnectionStatus)
  - CalendarService 구현 (PKCE OAuth, 토큰 저장/갱신)
  - Calendar OAuth 라우트 구현
    - GET /api/auth/google/calendar
    - GET /api/auth/google/calendar/callback
    - GET /api/auth/calendar/status
    - POST /api/auth/calendar/disconnect
  - 서버 빌드 성공
- **02_server-calendar-api 완료**:
  - Calendar API 모델 확장 (GoogleCalendar, CalendarEvent, EventStatus 등)
  - CalendarService에 API 프록시 메서드 추가
    - list_calendars: 사용자 캘린더 목록 조회
    - save_selected_calendars: 선택한 캘린더 저장
    - list_events: 선택된 캘린더에서 이벤트 조회
  - Calendar 라우트 구현
    - GET /api/calendar/list
    - POST /api/calendar/list/select
    - GET /api/calendar/events
  - 서버 빌드 성공

## 커밋 히스토리
- `2ba1f88` feat(server): Add Calendar API proxy endpoints
- `d027f3e` feat(server): Add Google Calendar OAuth integration

## 다음 단계
1. **03_desktop-integration** - Desktop 앱에서 서버 Calendar API 연동
   - 서버 OAuth 플로우 연동
   - 캘린더 목록/선택 UI
   - 이벤트 조회 및 캐싱
