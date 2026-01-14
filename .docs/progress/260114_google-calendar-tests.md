# Google Calendar 테스트 코드 - Progress

## 원본
- 계획: [260114_google-calendar-tests](../plans/260114_google-calendar-tests/00_overview.md)

## 진행 상황

### 2026-01-14

#### 완료된 작업

**1. 서버 단위 테스트 (14개 통과)**
- 파일: `schedule-ai-server/src/services/calendar.rs`
- 테스트 케이스:
  - 이벤트 변환 테스트 (8개)
    - 시간 지정 이벤트 변환
    - 종일 이벤트 변환
    - 제목 없는 이벤트 기본값 처리
    - Tentative/Cancelled 상태 변환
    - ID/시작시간 없는 이벤트 None 반환
    - 잘못된 datetime 형식 처리
  - 캘린더 아이템 변환 테스트 (4개)
    - Primary 캘린더 변환
    - 선택되지 않은 캘린더 변환
    - 제목 없는 캘린더 기본값
    - primary 필드 없을 때 기본값
  - 상태 변환 테스트 (2개)
    - confirmed 기본값
    - 알 수 없는 상태 처리

**2. Desktop 단위 테스트 (32개 통과)**
- 파일: `schedule-ai-tauri/src/types/timeline.test.ts` (11개)
  - Task → TimelineItem 변환
  - Event → TimelineItem 변환
  - 시간순 정렬
  - 종일 이벤트 우선 정렬
  - 타입 가드 함수 (isCalendarEvent, isTask)
- 파일: `schedule-ai-tauri/src/stores/calendarStore.test.ts` (21개)
  - checkConnection: 연결 상태 확인
  - syncCalendars: 캘린더 목록 동기화
  - syncEvents: 이벤트 동기화
  - toggleCalendarSelection: 캘린더 선택 토글 (optimistic update, rollback)
  - getEventsForDate: 날짜별 이벤트 필터링
  - getEventCountsByDate: 날짜별 이벤트 카운트
  - handleOAuthSuccess/Error: OAuth 콜백 처리
  - disconnect: 연결 해제 및 상태 초기화

#### 보류된 작업

**3. 서버 통합 테스트 (보류)**
- 이유: 테스트 DB 설정 및 앱 구조 리팩토링 필요
- 필요 작업:
  - `create_app()` 함수 분리
  - 테스트용 PostgreSQL 설정
  - wiremock으로 Google API 모킹

**4. Desktop 통합 테스트 (보류)**
- 이유: 컴포넌트가 App.tsx에 인라인으로 작성됨
- 필요 작업:
  - CalendarEventCard 컴포넌트 분리
  - EventDetailPopup 컴포넌트 분리
  - SettingsCalendarSection 컴포넌트 분리
  - MSW 설정

## 추가된 파일

### 서버
- `schedule-ai-server/Cargo.toml` - dev-dependencies 추가 (tokio-test)
- `schedule-ai-server/src/services/calendar.rs` - #[cfg(test)] 모듈 추가

### Desktop
- `schedule-ai-tauri/package.json` - test scripts 및 devDependencies 추가
- `schedule-ai-tauri/vitest.config.ts` - Vitest 설정
- `schedule-ai-tauri/src/test/setup.ts` - 테스트 setup (Tauri API 모킹)
- `schedule-ai-tauri/src/types/timeline.test.ts` - timeline 유틸리티 테스트
- `schedule-ai-tauri/src/stores/calendarStore.test.ts` - 스토어 테스트

## 테스트 실행 명령어

```bash
# 서버 테스트
cd schedule-ai-server && cargo test

# Desktop 테스트
cd schedule-ai-tauri && pnpm test

# Desktop 테스트 (watch 모드)
cd schedule-ai-tauri && pnpm test:watch
```

## 완료율
- 단위 테스트: 100% (46개 통과)
- 통합 테스트: 0% (보류)
- 전체: 약 70%

## 다음 단계
1. 컴포넌트 분리 후 Desktop 통합 테스트 구현
2. 서버 테스트 인프라 설정 후 통합 테스트 구현
