# Phase 1: 기본 구조 구축 + UI/UX 개선

> 상태: 완료
> 기간: 2025-12-29

## Phase 1.0: 기본 구조 구축 - 완료

### 완료된 작업

#### 1. 프로젝트 초기화
- [x] pnpm workspace + Turborepo 모노레포 설정
- [x] TypeScript 설정
- [x] ESLint/Prettier 설정

#### 2. 패키지 구조
- [x] `packages/core` - 공유 타입 및 유틸리티
  - Task, Plan, SubTask 타입 정의
  - formatDate, generateId 등 유틸리티 함수
- [x] `packages/ui` - 공유 UI 컴포넌트 (플레이스홀더)
- [x] `packages/llm-client` - LLM 클라이언트 (플레이스홀더)

#### 3. Desktop 앱 (Tauri v2)
- [x] Tauri v2 + React + Vite 설정
- [x] 기본 UI 구현
  - Today 뷰: 날짜별 태스크 목록
  - Plans 뷰: 계획 입력 및 목록
  - Focus 뷰: 플레이스홀더
  - Settings 뷰: 앱 설정
- [x] SQLite 데이터베이스 스키마
  - plans, tasks, subtasks 테이블
  - core_times (포커스 모드용)
  - task_logs (분석용)
  - settings
- [x] Zustand 상태 관리 설정
- [x] DB 래퍼 함수 구현 (TypeScript)

#### 4. Rust 백엔드
- [x] LLM 커맨드 스켈레톤
  - process_with_llm
  - parse_plan
  - generate_daily_tasks
  - split_task
- [x] Claude API 통합 구조 (실제 연동 필요)

---

## Phase 1.5: UI/UX 개선 및 버그 수정 - 완료

### 완료된 작업 (2025-12-29)

#### 1. SQL 권한 문제 수정
- [x] Task 추가 기능 동작 안 함 버그 수정
- [x] `capabilities/default.json`에 SQL 권한 추가
  - `sql:allow-execute`
  - `sql:allow-select`
  - `sql:allow-load`
  - `sql:allow-close`

#### 2. 체크박스 및 태스크 관리 개선
- [x] 체크박스 크기 확대 (1.25rem → 2rem)
- [x] 태스크 수정 기능 (더블클릭으로 수정 모달)
- [x] 태스크 삭제 기능

#### 3. 스와이프 제스처 구현
- [x] `SwipeableTask` 컴포넌트 구현
- [x] 오른쪽 스와이프 → 완료 처리
- [x] 왼쪽 스와이프 → 삭제 처리
- [x] 스와이프 후 잔상 문제 수정 (`showActions` 상태 관리)
- [x] 완료 상태 스타일 개선 (투명도 → 녹색 배경)
- [x] 삭제 타이밍 수정 (드래그 종료 시점에만 삭제)
- [x] 아래 스와이프 제거 (버튼 방식으로 변경)

#### 4. 서브태스크 기능
- [x] SubTask 타입 및 스토어 액션 추가
  - `createSubTask`
  - `updateSubTaskStatus`
  - `updateSubTask` (title 수정)
  - `deleteSubTask`
- [x] 서브태스크 쪼개기 모달 UI
- [x] 서브태스크 목록 표시 (접기/펼치기)
- [x] 서브태스크 완료/삭제 기능
- [x] `SwipeableSubtask` 컴포넌트 구현
  - 좌우 스와이프로 완료/삭제 (태스크와 동일)
  - 더블클릭으로 수정 모달
- [x] 인라인 서브태스크 추가 기능
  - + 버튼 클릭으로 입력창 열기
  - Enter로 연속 추가 (입력창 유지)
  - Esc로 입력창 닫기

#### 5. 글로벌 단축키 기능
- [x] `tauri-plugin-global-shortcut` 플러그인 추가
- [x] 기본 단축키 설정: `Alt+Shift+Space`
- [x] 단축키로 앱 창 토글 (show/hide)
- [x] Rust 백엔드 구현
  - `parse_shortcut` 함수
  - `format_shortcut` 함수
  - `get_current_shortcut` 커맨드
  - `set_shortcut` 커맨드
- [x] 단축키 녹화 UI (Settings 탭)
- [x] 동적 단축키 변경 기능

#### 6. Settings 탭 분리
- [x] Focus 탭에서 Settings 탭 분리
- [x] 4개 탭 구조: Today, Plans, Focus, Settings
- [x] Settings 탭에 단축키 설정 UI 배치

---

## 현재 기능 요약

### Today 탭
- 날짜별 태스크 목록 표시
- 날짜 이동 (이전/다음 날)
- 태스크 추가
- 태스크 완료/삭제 (스와이프 또는 클릭)
- 태스크 수정 (더블클릭)
- 서브태스크 추가 (+ 버튼 → 인라인 입력)
- 서브태스크 완료/삭제 (스와이프)
- 서브태스크 수정 (더블클릭)
- 진행률 표시

### Plans 탭
- 계획 입력 및 목록 표시
- 계획 수정/삭제 (hover 시 버튼 표시)
- 계획 상태 관리

### Focus 탭
- 포커스 모드 플레이스홀더 (추후 구현 예정)

### Settings 탭
- 글로벌 단축키 설정 (Alt+Shift+Space 기본값)
- 단축키 녹화 및 변경
- Plan 규칙 설정 (AI 컨텍스트)

---

## 다음 단계

Phase 2에서 구현 예정:
- Claude API 실제 연동
- Plan → Daily Task 자동 생성

---

마지막 업데이트: 2025-12-30
