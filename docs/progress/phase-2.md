# Phase 2: LLM 통합 및 스마트 태스크

> 상태: 완료
> 기간: 2025-12-29

## 목표

- [x] Claude API 실제 연동 (API 키 설정)
- [x] Plan 파싱 및 태스크 자동 생성
- [x] 태스크 자동 분할 (LLM 기반)

---

## 완료된 작업

### 1. API 키 설정
- [x] Settings 탭에 API 키 입력 UI
- [x] 보안 저장 (tauri-plugin-store를 사용한 settings.json)
- [x] API 키 검증 (실제 API 호출로 확인)
- [x] API 키 표시/숨기기 토글
- [x] API 키 삭제 기능

### 2. Claude API 연동
- [x] `ClaudeProvider` 구현 (Rust)
  - Anthropic API 호출
  - 에러 핸들링
  - JSON 응답 파싱 (마크다운 코드 블록 처리)
- [x] API 키 상태 관리 (`ApiKeyState`)
- [x] 연결 검증 명령 (`validate_api_key`)

### 3. Plan 파싱 (AI)
- [x] `parse_plan_with_ai` 커맨드 구현
- [x] 자연어 Plan → 구조화된 데이터 변환
- [x] 목표, 마일스톤, 제안 태스크 추출
- [x] Plans 탭에 "AI로 분석하기" 버튼 추가

### 4. Daily Task 생성 (AI)
- [x] `generate_daily_tasks_with_ai` 커맨드 구현
- [x] Plan 기반 일일 태스크 자동 생성
- [x] ADHD 친화적인 작은 단위(15-45분)로 분할
- [x] 각 Plan 카드에 "오늘 할 일 생성" 버튼 추가
- [x] 생성 후 Today 탭으로 자동 이동

### 5. 스마트 태스크 분할 (AI)
- [x] `split_task_with_ai` 커맨드 구현
- [x] 큰 태스크 → 작은 서브태스크 자동 분할 (5-15분)
- [x] 태스크 쪼개기 모달에 "AI로 쪼개기" 버튼 추가
- [x] AI 제안을 입력 필드에 자동 채우기

### 6. Plan Rules (AI 컨텍스트) - 2025-12-30 추가
- [x] `get_plan_rules`, `set_plan_rules` 커맨드 구현
- [x] Settings 탭에 Plan Rules 입력 UI
- [x] Plan Rules를 AI 프롬프트에 추가 컨텍스트로 전달
- [x] `parse_plan_with_ai`에 plan_rules 파라미터 추가
- [x] `generate_daily_tasks_with_ai`에 plan_rules 파라미터 추가
- [x] tauri-plugin-store로 settings.json에 저장

---

## 주요 파일 변경

### Rust 백엔드
- `src-tauri/src/lib.rs`
  - `ApiKeyState` 상태 관리
  - `get_api_key`, `set_api_key`, `delete_api_key` 커맨드
  - `validate_api_key` 커맨드
  - `split_task_with_ai` 커맨드
  - `parse_plan_with_ai` 커맨드 (plan_rules 지원)
  - `generate_daily_tasks_with_ai` 커맨드 (plan_rules 지원)
  - `get_plan_rules`, `set_plan_rules` 커맨드

- `src-tauri/src/llm/mod.rs`
  - `ClaudeProvider` 구현 (Anthropic API 연동)
  - `LLMProvider` trait
  - `LLMRequest`, `LLMResponse`, `LLMMessage` 타입

### React 프론트엔드
- `src/App.tsx`
  - API 키 설정 UI (Settings 탭)
  - Plan AI 분석 기능
  - Daily Task AI 생성 기능
  - 태스크 AI 분할 기능
  - Plan Rules 설정 UI (Settings 탭)

- `src/App.css`
  - API 키 입력 스타일
  - AI 버튼 스타일 (보라색 그라데이션)
  - Generate Tasks 버튼 스타일
  - Plan Rules 입력 스타일

---

## AI 프롬프트 설계

### 태스크 분할 프롬프트
```
당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
주어진 태스크를 ADHD 친화적인 작은 단위(5-15분)로 분해해주세요.

원칙:
- 각 서브태스크는 명확하고 구체적으로
- 시작하기 쉬운 작은 첫 단계
- 완료 기준이 명확해야 함
- 3-5개의 서브태스크로 분해
```

### Plan 파싱 프롬프트
```
당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
사용자의 계획을 분석하여 구조화된 JSON으로 변환해주세요.

원칙:
- 목표는 구체적이고 측정 가능하게
- 마일스톤은 중간 목표로 설정
- 일일 태스크는 15-45분 단위로
```

### Daily Task 생성 프롬프트
```
당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
주어진 계획을 기반으로 오늘 할 태스크를 생성해주세요.

원칙:
- ADHD 친화적인 작은 단위(15-45분)
- 시작하기 쉬운 간단한 태스크부터
- 3-5개의 태스크 생성
- 구체적이고 실행 가능한 태스크
```

### Plan Rules (사용자 정의 컨텍스트)
```
사용자가 Settings에서 설정한 Plan Rules가 AI 프롬프트에 추가됩니다.
예시:
- "나는 오전에 집중이 잘 됨"
- "회의는 보통 오후에 있음"
- "점심시간은 12-1시"

이 규칙들은 Plan 파싱과 Daily Task 생성 시 컨텍스트로 활용됩니다.
```

---

## 다음 단계

Phase 3에서 구현 예정:
- Focus Mode (Core time 설정)
- macOS 앱 블로킹
- 알림 시스템

---

마지막 업데이트: 2025-12-30
