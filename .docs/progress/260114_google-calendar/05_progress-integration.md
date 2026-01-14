# Progress Integration - Progress

## 원본
- 계획: [05_progress-integration.md](../../plans/260114_google-calendar/05_progress-integration.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] HeatmapData 타입 확장
    - eventCount: number (optional)
    - hasEvents: boolean (optional)
  - [x] calendarStore 메서드 추가
    - syncEventsForYear(year): 연간 이벤트 동기화
    - getEventCountsByDate(): 날짜별 이벤트 수 맵
  - [x] Progress 탭 데이터 로드 로직 수정
    - 캘린더 연결 시 연간 이벤트 동기화
    - 이벤트 수를 히트맵 데이터에 병합
    - useEffect 의존성에 isCalendarConnected 추가
  - [x] 히트맵 셀 UI 업데이트
    - has-events 클래스로 테두리 강조
    - event-dot 컴포넌트로 파란색 점 표시
    - 툴팁에 이벤트 수 표시
  - [x] 통계 섹션 업데이트
    - 활성 일수: 태스크 또는 이벤트가 있는 날 포함
    - 총 이벤트 통계 카드 추가 (캘린더 연결 시)
    - progress-stats 그리드 auto-fit으로 변경
  - [x] CSS 스타일 추가
    - .heatmap-cell.has-events
    - .event-dot
  - [x] 빌드 검증
    - TypeScript: 통과
    - Rust: 통과 (경고만 존재)

## 변경된 파일
- `schedule-ai-tauri/src/App.tsx`
  - HeatmapData 타입 확장
  - useCalendarStore 훅 확장 (syncEventsForYear, getEventCountsByDate)
  - Progress 탭 데이터 로드에 캘린더 이벤트 병합
  - 히트맵 셀에 이벤트 인디케이터 추가
  - 통계 섹션에 이벤트 카드 추가
- `schedule-ai-tauri/src/stores/calendarStore.ts`
  - syncEventsForYear 메서드 추가
  - getEventCountsByDate 메서드 추가
- `schedule-ai-tauri/src/App.css`
  - .heatmap-cell.has-events 스타일
  - .event-dot 스타일
  - .progress-stats 그리드 반응형 변경

## 완료율
- [x] 100%

## 메모
- 히트맵 레벨 계산은 기존 로직 유지 (태스크 완료율 기준)
- 이벤트는 시각적 인디케이터로만 표시 (레벨 계산에 미포함)
- cancelled 상태 이벤트는 카운트에서 제외
- 캘린더 미연결 시 기존 동작 유지
