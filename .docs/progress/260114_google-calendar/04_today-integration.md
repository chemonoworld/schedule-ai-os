# Today Tab Integration - Progress

## 원본
- 계획: [04_today-integration.md](../../plans/260114_google-calendar/04_today-integration.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] timeline.ts 타입 정의 생성
    - TimelineItem 인터페이스 정의
    - toTimelineItems() 함수 - Task + Event를 시간순 정렬
    - isCalendarEvent(), isTask() 타입가드
  - [x] CalendarEventCard 컴포넌트 구현
    - Google Calendar 색상 코드 지원 (colorId → hex)
    - 시간/종일 표시
    - 장소 표시
    - 클릭 시 상세 팝업 열기
  - [x] EventDetailPopup 컴포넌트 구현
    - 날짜/시간 정보
    - 장소 정보
    - 설명 표시
    - "Google Calendar에서 열기" 링크
  - [x] Today 탭 UI 통합
    - useCalendarStore 훅 연동
    - toTimelineItems로 Task + Event 병합
    - 종일 이벤트 섹션 분리
    - 시간대별 정렬
  - [x] 날짜 변경 시 자동 동기화
    - useEffect로 selectedDate 감지
    - syncEvents(prevDay, nextDay) 호출
  - [x] CSS 스타일 추가
    - .calendar-event-card 스타일
    - .event-detail-popup 스타일
    - .timeline-section-title 스타일
    - 반응형 레이아웃
  - [x] 빌드 검증
    - TypeScript: 통과
    - Rust: 통과 (경고만 존재)

## 변경된 파일
- `schedule-ai-tauri/src/types/timeline.ts` (NEW)
- `schedule-ai-tauri/src/App.tsx`
  - CalendarEventCard 컴포넌트 추가
  - EventDetailPopup 컴포넌트 추가
  - Today 탭 타임라인 통합
  - useCalendarStore 훅 사용
  - 날짜 변경 시 이벤트 동기화 useEffect
- `schedule-ai-tauri/src/App.css`
  - 캘린더 이벤트 카드 스타일
  - 이벤트 상세 팝업 스타일

## 완료율
- [x] 100%

## 메모
- Task와 Event는 시간순으로 정렬됨
- 종일 이벤트는 별도 섹션에 표시
- Event는 읽기 전용 (스와이프 불가)
- Task는 기존과 동일하게 스와이프로 완료/삭제 가능
- Google Calendar 색상 11가지 지원
