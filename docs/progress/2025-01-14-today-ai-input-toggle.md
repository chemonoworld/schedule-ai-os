# Today 탭 AI 입력 모드 토글 개선

**날짜**: 2025-01-14
**브랜치**: `jinwoo/today-ai-input`
**상태**: 완료

## 작업 내용

Today 탭의 태스크 입력 폼에서 AI 모드 토글 버튼 UX 개선

### 변경 사항

#### 1. 토글 기능 추가
- 연필 버튼(input-mode-indicator) 클릭 시 `manual` ↔ `ai` 모드 토글
- 기존: `div` (클릭 불가) → 변경: `button` (클릭 가능)

#### 2. 커스텀 툴팁
- 기본 `title` 속성 → `data-tooltip` + CSS `::after` 방식
- 즉시 표시 (0.1초 transition, 기존 브라우저 기본 0.5~1초 딜레이 제거)
- 모드별 다른 툴팁 메시지:
  - manual 모드: "AI 모드로 전환 (shift+tab)"
  - AI 모드: "수동 모드로 전환 (shift+tab)"

#### 3. 버튼 크기/정렬 조정
- 크기: `2.25rem` → `2.75rem` (input 높이와 일치)
- 아이콘 크기: `1rem` → `1.125rem`
- `add-task-form`에 `align-items: center` 추가 (세로 중앙 정렬)
- hover/active scale 효과 미묘하게 조정 (1.05→1.03, 0.95→0.97)

#### 4. 버튼 텍스트 변경
- 영어: "AI Add" → "Create"
- 한국어: "AI 추가" → "생성"

## 수정된 파일

| 파일 | 변경 내용 |
|------|-----------|
| `schedule-ai-tauri/src/App.tsx` | 버튼 요소 변경, data-tooltip 속성 |
| `schedule-ai-tauri/src/App.css` | 버튼 스타일, 커스텀 툴팁 CSS |
| `schedule-ai-tauri/src/i18n/locales/en/today.json` | switchToAI, switchToManual 키 추가, aiButton 변경 |
| `schedule-ai-tauri/src/i18n/locales/ko/today.json` | switchToAI, switchToManual 키 추가, aiButton 변경 |

## 다음 단계

- [ ] 테스트: 토글 기능 정상 동작 확인
- [ ] 테스트: 단축키(shift+tab)와 버튼 클릭 동기화 확인
