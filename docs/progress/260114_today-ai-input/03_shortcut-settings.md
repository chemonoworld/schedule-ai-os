# 입력 모드 전환 단축키 설정 - Progress

## 원본
- 계획: [링크](../../plans/260114_today-ai-input/03_shortcut-settings.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] Rust 백엔드 `get_ai_input_shortcut`, `set_ai_input_shortcut` 함수
  - [x] Settings UI에 AI 입력 단축키 섹션 추가
  - [x] 단축키 레코딩 기능 구현
  - [x] 초기화(Reset) 버튼
  - [x] i18n 번역 추가 (ko/en)
  - [x] CSS 스타일링

## 완료율
- [x] 100%

## 변경된 파일
- `schedule-ai-tauri/src-tauri/src/lib.rs`
  - `get_ai_input_shortcut` 커맨드
  - `set_ai_input_shortcut` 커맨드
  - invoke_handler 등록
- `schedule-ai-tauri/src/App.tsx`
  - 상태 변수: `aiInputShortcut`, `recordingAiShortcut`, `recordedAiShortcutKey`
  - useEffect: AI 단축키 레코딩
  - Settings UI: AI 단축키 설정 섹션
- `schedule-ai-tauri/src/App.css`
  - `.ai-shortcut-section` 스타일
  - `.ai-shortcut-input` 스타일
  - `.shortcut-reset` 스타일
- `schedule-ai-tauri/src/i18n/locales/ko/settings.json`
- `schedule-ai-tauri/src/i18n/locales/en/settings.json`
- `schedule-ai-tauri/src/i18n/locales/ko/common.json` - `reset` 버튼
- `schedule-ai-tauri/src/i18n/locales/en/common.json` - `reset` 버튼
