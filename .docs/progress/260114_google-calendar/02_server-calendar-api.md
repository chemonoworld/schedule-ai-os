# 서버 Calendar API 프록시 엔드포인트 - Progress

## 원본
- 계획: [02_server-calendar-api.md](../../plans/260114_google-calendar/02_server-calendar-api.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] 모델 확장 (calendar.rs)
    - GoogleCalendar: 캘린더 정보
    - CalendarEvent: 이벤트 정보
    - EventStatus: 이벤트 상태 (Confirmed, Tentative, Cancelled)
    - Google API 응답 타입들 (내부용)
  - [x] CalendarService 확장
    - list_calendars: 캘린더 목록 조회 (Google API → Schedule AI 포맷)
    - save_selected_calendars: 선택한 캘린더 DB 저장
    - list_events: 선택된 캘린더에서 이벤트 조회
    - convert_event: Google Event → CalendarEvent 변환
  - [x] Calendar 라우트 구현 (calendar.rs)
    - GET /api/calendar/list
    - POST /api/calendar/list/select
    - GET /api/calendar/events
  - [x] main.rs에 라우트 등록
  - [x] 빌드 성공

## 완료율
- [x] 100%

## 생성/수정된 파일

| 파일 | 상태 | 설명 |
|------|------|------|
| `src/models/calendar.rs` | 수정 | 캘린더/이벤트 모델 추가 |
| `src/services/calendar.rs` | 수정 | API 프록시 메서드 추가 |
| `src/routes/calendar.rs` | 신규 | Calendar API 라우트 |
| `src/routes/mod.rs` | 수정 | calendar 모듈 추가 |
| `src/main.rs` | 수정 | /api/calendar 라우트 등록 |

## API 엔드포인트

```
GET  /api/calendar/list         - 캘린더 목록 조회
POST /api/calendar/list/select  - 표시할 캘린더 선택
GET  /api/calendar/events       - 이벤트 조회 (?start=YYYY-MM-DD&end=YYYY-MM-DD)
```

## 메모
- Google API 응답을 Schedule AI 포맷으로 변환하는 로직 구현
- 종일 이벤트와 시간 지정 이벤트 모두 처리
- 개별 캘린더 조회 실패 시 다른 캘린더는 계속 진행 (graceful degradation)
