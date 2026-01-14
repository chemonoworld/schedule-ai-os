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
| 3 | [03_desktop-integration](./03_desktop-integration.md) | ✅ 완료 | 100% |
| 4 | [04_today-integration](./04_today-integration.md) | ✅ 완료 | 100% |
| 5 | [05_progress-integration](./05_progress-integration.md) | ✅ 완료 | 100% |
| 6 | [06_settings-management](./06_settings-management.md) | ✅ 완료 | 100% |
| 7 | [07_cleanup-local-oauth](./07_cleanup-local-oauth.md) | ✅ 완료 | 100% |

## 전체 완료율
- **100%** (7/7 서브태스크 완료) 🎉

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
- **03_desktop-integration 완료**:
  - Tauri deep-link 플러그인 설정 (`scheduleai://` URL scheme)
  - calendarApi.ts 생성 (서버 API 클라이언트)
  - calendarStore.ts 리팩토링 (invoke → 서버 API 호출)
  - useDeepLink.ts 생성 (Deep Link 콜백 처리)
  - .env.example 업데이트 (VITE_API_BASE_URL)
  - TypeScript/Rust 빌드 성공
- **04_today-integration 완료**:
  - timeline.ts 타입 정의 (TimelineItem, toTimelineItems 함수)
  - CalendarEventCard 컴포넌트 (이벤트 카드 UI)
  - EventDetailPopup 컴포넌트 (이벤트 상세 팝업)
  - Today 탭에 Task + Event 통합 타임라인 구현
    - 종일 이벤트 섹션
    - 시간대별 정렬
    - 이벤트 클릭 시 상세 팝업
  - 날짜 변경 시 자동 이벤트 동기화
  - CSS 스타일 추가
  - TypeScript/Rust 빌드 성공
- **05_progress-integration 완료**:
  - HeatmapData 타입 확장 (eventCount, hasEvents 필드)
  - calendarStore에 syncEventsForYear, getEventCountsByDate 메서드 추가
  - Progress 탭 히트맵에 캘린더 이벤트 통합
    - 이벤트가 있는 날짜에 파란색 점 표시
    - 툴팁에 이벤트 수 표시
    - 활성 일수 계산에 이벤트 포함
  - 통계 섹션에 "이벤트" 통계 카드 추가 (캘린더 연결 시)
  - CSS 스타일 추가 (event-dot, has-events)
  - TypeScript/Rust 빌드 성공
- **06_settings-management 완료**:
  - i18n 번역 추가 (ko/en)
  - Google Calendar 연결/해제 UI
  - 캘린더 선택 체크박스 UI
  - 동기화 설정 UI (자동/수동)
  - 마지막 동기화 시간 및 수동 동기화 버튼
  - CSS 스타일 추가
  - TypeScript/Rust 빌드 성공
- **07_cleanup-local-oauth 완료**:
  - google_auth 모듈 삭제 (PKCE, Keyring, OAuth 상태 관리)
  - lib.rs에서 모듈 import 및 커맨드 등록 제거
  - Cargo.toml에서 불필요한 의존성 5개 제거
    - keyring, rand, sha2, base64, url
  - TypeScript/Rust 빌드 성공

## 커밋 히스토리
- `5ca55f0` fix(desktop): Add useDeepLink hook call in App.tsx
- `becd3f2` refactor(desktop): Remove local OAuth code (now handled by server)
- `37f814b` feat(desktop): Add Google Calendar settings UI in Settings tab
- `1cb46de` feat(desktop): Add calendar events to Progress tab heatmap
- `c5d3f6e` feat(desktop): Add calendar events to Today tab timeline
- `ddb7b6d` feat(desktop): Add server Calendar API integration with deep-link support
- `d70fb1e` feat(server): Add Calendar API proxy endpoints
- `0699a69` feat(server): Add Google Calendar OAuth integration

## 스펙 리뷰 및 버그 수정

### 발견된 버그
- **useDeepLink 호출 누락**: `useDeepLink` 훅이 구현되었으나 App.tsx에서 호출되지 않음
  - **영향**: OAuth 콜백이 처리되지 않아 연결 실패
  - **수정**: App.tsx에 `useDeepLink()` 호출 추가
  - **커밋**: `5ca55f0`

### 스펙 적합성
- 서버: 95%+ (프로덕션 개선 사항 일부 남음)
- Desktop: 100% (버그 수정 후)

## 테스트 계획
- 테스트 코드 작성 계획 문서: [260114_google-calendar-tests](../../plans/260114_google-calendar-tests/00_overview.md)
- 수동 테스트 체크리스트: [manual-testing-checklist.md](../../plans/260114_google-calendar-tests/manual-testing-checklist.md)

## 완료!
모든 서브태스크가 완료되었습니다.

### 구현된 기능 요약
- **서버**: Google Calendar OAuth + API 프록시
- **Desktop**: 서버 API 연동 + Deep Link 콜백
- **Today 탭**: Task + Event 통합 타임라인
- **Progress 탭**: 히트맵에 이벤트 표시
- **Settings 탭**: 캘린더 연결/해제/선택 UI
- **코드 정리**: 로컬 OAuth 코드 제거
