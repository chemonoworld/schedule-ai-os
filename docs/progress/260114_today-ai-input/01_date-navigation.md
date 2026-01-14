# 날짜 네비게이션 - Progress

## 원본
- 계획: [링크](../../plans/260114_today-ai-input/01_date-navigation.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] 선택된 날짜가 오늘이 아닐 때 "오늘로" 버튼 표시
  - [x] 버튼 클릭 시 오늘 날짜로 이동
  - [x] i18n 번역 추가 (ko/en)
  - [x] CSS 스타일링

## 완료율
- [x] 100%

## 변경된 파일
- `schedule-ai-tauri/src/App.tsx` - 오늘로 이동 버튼 조건부 렌더링
- `schedule-ai-tauri/src/App.css` - `.goto-today-btn` 스타일
- `schedule-ai-tauri/src/i18n/locales/ko/today.json` - `gotoToday` 번역
- `schedule-ai-tauri/src/i18n/locales/en/today.json` - `gotoToday` 번역
