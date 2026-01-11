# Phase 6: i18n (다국어 지원)

## 개요

Schedule AI 앱의 다국어 지원 구현. 한국어와 영어를 지원하며 시스템 언어 자동 감지 기능 포함.

## 목표

- [x] 한국어 + 영어 지원
- [x] 영어를 기본/폴백 언어로 설정
- [x] macOS 시스템 언어 자동 감지
- [x] 설정에서 수동 언어 변경
- [x] 모든 UI 텍스트 i18n 적용
- [x] 빌드 테스트 완료

## 구현 내용

### 1. 의존성 설치

```bash
pnpm add i18next react-i18next
```

### 2. i18n 디렉토리 구조

```
src/i18n/
├── index.ts              # i18n 초기화
├── types.ts              # TypeScript 타입
└── locales/
    ├── en/               # 영어 (6개 파일)
    └── ko/               # 한국어 (6개 파일)
```

### 3. 네임스페이스

| 네임스페이스 | 내용 |
|-------------|------|
| common | 탭, 버튼, 날짜, 요일, 월, 상태 메시지 |
| today | Today 탭 UI, 태스크 모달 |
| plans | Plans 탭 UI, 반복 일정, 플랜 모달 |
| progress | Progress 탭 UI, 스트릭, 히트맵 |
| focus | Focus 탭 UI, 알림 메시지 |
| settings | Settings 탭 UI, API 키, 단축키, 내보내기 |

### 4. Rust 커맨드

- `get_system_locale`: macOS 시스템 언어 감지
- `get_language`: 저장된 언어 설정 로드
- `set_language`: 언어 설정 저장

### 5. 프론트엔드 통합

- `settingsStore.ts`: 언어 상태 관리
- `main.tsx`: AppWithI18n 래퍼
- `App.tsx`: 전체 UI 텍스트 번역 적용
- `focusStore.ts`: 알림 메시지 번역

### 6. UI

Settings 탭에 언어 선택 드롭다운:
- English
- 한국어

## 파일 변경 목록

### 새로 생성
- `src/i18n/index.ts`
- `src/i18n/types.ts`
- `src/i18n/locales/en/*.json` (6개)
- `src/i18n/locales/ko/*.json` (6개)
- `src/stores/settingsStore.ts`

### 수정
- `package.json` - i18next 의존성 추가
- `src-tauri/src/lib.rs` - Rust 커맨드 추가
- `src/main.tsx` - i18n 초기화 래퍼
- `src/App.tsx` - 전체 UI 텍스트 번역 적용
- `src/App.css` - 언어 선택 스타일
- `src/stores/focusStore.ts` - 알림 번역

## 번역 적용 범위

### App.tsx
- 네비게이션 탭 (Today, Plans, Progress, Focus, Settings)
- Today 탭: 날짜 표시, 진행률, 빈 상태, 태스크 추가 폼
- Plans 탭: 반복 일정 폼, 데일리 플랜, 플랜 목록
- Progress 탭: 스트릭 배지, 연도 선택, 히트맵, 통계
- Settings 탭: 언어, API 키, 단축키, Plan 규칙, 내보내기/가져오기
- SwipeableTask: 스와이프 액션, 서브태스크 입력
- 모달: 태스크 수정, 태스크 쪼개기, 서브태스크 수정, 플랜 수정

### focusStore.ts
- 알림 제목/내용

## 기술적 세부사항

### 언어 초기화 흐름

1. 앱 시작 시 `initLanguage()` 호출
2. 저장된 언어 설정 확인 (`get_language`)
3. 없으면 시스템 언어 감지 (`get_system_locale`)
4. i18n 언어 변경 및 상태 업데이트

### 번역 사용법

```typescript
const { t } = useTranslation();

// 기본 네임스페이스 (common)
t('common:nav.today')

// 다른 네임스페이스
t('focus:timer.title')
t('settings:language.title')
t('plans:recurring.form.title')

// 변수 보간
t('focus:notification.terminated', { appName })
t('today:progress.completed', { completed: 5, total: 10 })
t('progress:streak.active', { count: 7 })
```

---

시작일: 2026-01-01
완료일: 2026-01-01
상태: 완료
