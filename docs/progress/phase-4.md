# Phase 4: 진행률 추적 시스템 (Progress Tracking)

> 상태: 완료
> 기간: 2025-12-31

## 목표

- [x] 일일 진행률 계산 및 표시
- [x] GitHub 잔디 스타일 히트맵 캘린더
- [x] 스트릭 시스템
- [x] 통계 대시보드

---

## 완료된 작업

### 1. 데이터 모델 확장

#### 1.1 새로운 마이그레이션 (`src-tauri/src/db/migrations/002_progress_tracking.sql`)
- [x] `daily_progress` 테이블 추가
- [x] 진행률 관련 인덱스 추가

### 2. Rust 백엔드 (`src-tauri/src/progress/mod.rs`)

#### 2.1 데이터 구조
- [x] `DailyProgress` 구조체
- [x] `HeatmapData` 구조체

#### 2.2 계산 로직
- [x] `calculate_daily_progress()` - 일일 진행률 계산
- [x] `get_heatmap_level()` - 히트맵 레벨 (0-4) 계산
- [x] `progress_to_heatmap()` - 진행률 → 히트맵 변환
- [x] `calculate_streak()` - 연속 달성 일수 계산
- [x] `generate_yearly_heatmap()` - 연간 히트맵 데이터 생성

#### 2.3 Tauri 커맨드
- [x] `calculate_daily_progress` - 일일 진행률 계산
- [x] `get_heatmap_data` - 히트맵 데이터 조회
- [x] `calculate_streak` - 스트릭 계산

### 3. UI 구현 (`src/App.tsx`)

#### 3.1 Progress 탭 추가
- [x] 네비게이션에 Progress 탭 추가
- [x] 스트릭 배지 (🔥 active / 💤 inactive)
- [x] 연도 선택기 (← 2025년 →)
- [x] GitHub 스타일 히트맵 캘린더
- [x] 통계 카드 (활동일, 총 태스크, 50%+ 달성률)

#### 3.2 히트맵 기능
- [x] 5단계 색상 레벨 (level-0 ~ level-4)
- [x] 호버 시 상세 정보 표시 (즉시 표시되는 커스텀 툴팁)
- [x] 클릭 시 해당 날짜로 이동
- [x] 월별 레이블
- [x] 요일 레이블 (일~토 전체 표시)
- [x] 범례 (Less ↔ More, 각 레벨별 완료율 툴팁)
- [x] 연도별 첫째 날 요일 정렬 (placeholder 셀로 정확한 요일 위치)
- [x] 연도 이동 범위 확장 (현재 연도 +5년까지)

#### 3.3 스타일링 (`src/App.css`)
- [x] 스트릭 배지 스타일 (활성화 시 그라데이션)
- [x] 히트맵 셀 스타일 (GitHub 색상 팔레트)
- [x] 라이트/다크 모드 지원
- [x] 통계 카드 레이아웃

### 4. 태스크-서브태스크 동기화

#### 4.1 양방향 동기화 (`src/stores/taskStore.ts`)
- [x] 모든 서브태스크 완료 → 부모 태스크 자동 완료
- [x] 서브태스크 미완료로 변경 → 부모 태스크 pending으로 복원
- [x] 부모 태스크 완료 → 모든 서브태스크 자동 완료

### 5. Daily Progress 테이블 활용

#### 5.1 DB 함수 추가 (`src/db/index.ts`)
- [x] `updateDailyProgress(date)` - 태스크 변경 시 자동 UPSERT
- [x] `getDailyProgressByYear(year)` - 연간 진행률 데이터 조회
- [x] `syncDailyProgressFromTasks()` - 기존 태스크 데이터 마이그레이션

#### 5.2 자동 업데이트 트리거
- [x] 태스크 생성 시 daily_progress 업데이트
- [x] 태스크 삭제 시 daily_progress 업데이트
- [x] 태스크 상태 변경 시 daily_progress 업데이트
- [x] 서브태스크 상태 변경 시 daily_progress 업데이트

### 6. UI/UX 개선

#### 6.1 네비게이션 레이아웃 수정 (`src/App.css`)
- [x] 탭 전환 시 아이템 흔들림 수정
- [x] `transition: all` → `transition: background-color, color`
- [x] `min-width: 70px` 추가로 탭 너비 고정
- [x] `text-align: center` 추가

#### 6.2 Today 탭 Export 버튼 개선 (`src/App.css`, `src/App.tsx`)
- [x] 버튼 가시성 향상 (opacity 제거, 색상 명확화)
- [x] 버튼 레이블 변경 (이모지 → 텍스트: MD, JSON)
- [x] 패딩 및 마진 여유 추가
- [x] 호버 시 box-shadow 추가

---

## 히트맵 레벨 기준

| 레벨 | 달성률 | 색상 |
|------|--------|------|
| 0 | 0% | #ebedf0 (light) / #161b22 (dark) |
| 1 | 1-24% | #9be9a8 (light) / #0e4429 (dark) |
| 2 | 25-49% | #40c463 (light) / #006d32 (dark) |
| 3 | 50-74% | #30a14e (light) / #26a641 (dark) |
| 4 | 75-100% | #216e39 (light) / #39d353 (dark) |

## 스트릭 계산 규칙

- 50% 이상 달성 시 스트릭 유지
- 오늘 태스크가 없으면 어제부터 계산
- 중간에 0% 날이 있으면 스트릭 종료

---

## Phase 4-B: 반복 일정 시스템 (Recurring Plans)

### 7. 반복 일정 데이터 모델

#### 7.1 새로운 마이그레이션 (`003_recurring_plans.sql`)
- [x] `recurring_plans` 테이블 (반복 유형, 요일, 시간, 기간, 장소)
- [x] `generated_tasks` 테이블 (중복 생성 방지)
- [x] `location` 필드 추가 (장소)

### 8. Rust 백엔드 (`src-tauri/src/recurring/mod.rs`)

#### 8.1 자연어 파싱
- [x] `parse_recurrence_pattern()` - 규칙 기반 파싱 (fallback)
- [x] `parse_recurrence_pattern_with_ai()` - LLM 기반 파싱 (권장)
- [x] 반복 유형: 매일, 매주, 격주, 매월
- [x] 요일: 월요일, 토요일, 평일, 주말, 월수금
- [x] 시간: 12-16시, 오후 3시
- [x] 기간: 2026년 1월부터 2월까지
- [x] 장소(location) 자동 추출 (LLM 파싱 시)

#### 8.2 태스크 생성 로직
- [x] `generate_tasks_from_recurring_plan()` - 선제 생성 (모든 태스크 미리 생성)
- [x] `should_generate_on_date()` - 날짜별 생성 여부 확인

#### 8.3 Tauri 커맨드
- [x] `parse_recurrence_pattern` - 규칙 기반 자연어 파싱
- [x] `parse_recurrence_pattern_with_ai` - LLM 기반 자연어 파싱
- [x] `generate_tasks_preview` - 미리보기 생성

### 9. TypeScript 타입 확장

- [x] `RecurringPlan`, `ParsedRecurrencePattern` 인터페이스 (location 포함)
- [x] `CreateRecurringPlanInput`, `UpdateRecurringPlanInput` 타입 (location 포함)

### 10. DB 레이어 확장 (`src/db/index.ts`)

- [x] `createRecurringPlan()`, `getRecurringPlans()`
- [x] `updateRecurringPlan()`, `deleteRecurringPlan()`
- [x] `recordGeneratedTask()` - 생성 기록
- [x] `isTaskAlreadyGenerated()` - 중복 체크
- [x] `generateTasksFromRecurringPlan()` - 일괄 생성

### 11. UI 구현 (Plans 탭)

#### 11.1 반복 일정 폼
- [x] 자연어 입력 + AI 분석 버튼 (API 키 있으면 LLM 사용)
- [x] 구조화된 폼 (제목, 장소, 반복유형, 요일, 시간, 기간)
- [x] 요일 선택 버튼 (일~토)
- [x] 장소 입력 필드 추가
- [x] 태스크 미리보기 (펼치기/접기 지원)
- [x] 수동 입력으로 태스크 생성 가능 (AI 없이도 사용 가능)
- [x] AI 분석 후 수정 가능
- [x] 미리보기 생성 버튼

#### 11.2 반복 일정 목록
- [x] 기존 반복 일정 표시 (장소 포함)
- [x] 삭제 기능 (연관된 모든 태스크 cascade 삭제)

### 12. Daily Progress 실시간 업데이트 리팩토링

#### 12.1 DB 레이어 자동 업데이트 (`src/db/index.ts`)
- [x] `createTask()` - 태스크 생성 시 해당 날짜 progress 자동 업데이트
- [x] `deleteTask()` - 삭제 전 날짜 조회 후 progress 업데이트
- [x] `updateTask()` - 상태/날짜 변경 시 progress 업데이트 (날짜 변경 시 이전/새 날짜 모두)
- [x] `deleteRecurringPlan()` - 연관 태스크 삭제 후 영향받은 날짜들 progress 업데이트
- [x] `skipProgressUpdate` 파라미터 - 배치 작업 시 중복 업데이트 방지

#### 12.2 코드 정리
- [x] `taskStore.ts`에서 `updateDailyProgress` 호출 제거 (DB에서 자동 처리)
- [x] Progress 탭에서 `syncDailyProgressFromTasks()` 호출 제거
- [x] `syncDailyProgressFromTasks()`는 마이그레이션 용도로만 유지

### 13. 버그 수정

#### 13.1 Progress 탭 연도 네비게이션
- [x] 2025년/2026년 같은 데이터 표시되던 버그 수정
- [x] `useEffect` 내 `loadProgressData`에 `year` 파라미터 전달
- [x] DB 조회 시 null 값 처리 (`?? 0`)

#### 13.2 히트맵 요일 정렬
- [x] 연도별 첫째 날 요일에 맞게 placeholder 셀 추가
- [x] `chrono::Datelike` 사용하여 `weekday().num_days_from_sunday()` 계산
- [x] placeholder 셀은 `taskCount: -1`로 구분

#### 13.3 통계 계산 버그
- [x] placeholder 셀(`taskCount: -1`)이 총 태스크에 포함되던 버그 수정
- [x] `taskCount >= 0` 필터링 적용

#### 13.4 orphaned daily_progress 레코드
- [x] `syncDailyProgressFromTasks()`에서 태스크 없는 날짜의 레코드 삭제 추가

#### 13.5 스트릭 계산 로직 개선 (2026-01-01)
- [x] 연도 변경 시에도 스트릭이 올바르게 계산되도록 수정
- [x] `getRecentDailyProgress(365)` - 연도에 관계없이 최근 365일 데이터 사용
- [x] 오늘 태스크가 50% 미만이거나 없으면 어제부터 스트릭 계산 시작
- [x] 오늘은 "진행 중"으로 간주하여 스트릭 끊지 않음

### 사용 예시

입력: `2026년 1월부터 2월까지 매주 토요일 12-16시 강남역 근처 토플 학원`

LLM이 자동으로 파싱:
- 제목: 토플 학원
- 장소: 강남역 근처
- 반복: 매주 토요일
- 시간: 12:00-16:00
- 기간: 2026-01-01 ~ 2026-02-28

생성: 8개 태스크 (매주 토요일 12:00-16:00)

---

## 참고 문서

- [05-progress-tracking.md](../plans/05-progress-tracking.md)
- [06-recurring-plans.md](../plans/06-recurring-plans.md)

---

마지막 업데이트: 2026-01-01
