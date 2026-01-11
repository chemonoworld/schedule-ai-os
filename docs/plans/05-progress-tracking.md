# 진행률 추적 시스템 (Progress Tracking)

## 목표

- 백로그 관리: 해야 할 일들을 한 곳에서 추적
- 일일/주간/월간 진행률 시각화
- GitHub 잔디처럼 활동량을 한눈에 파악
- 동기 부여 및 패턴 분석

---

## 핵심 기능

### 1. 백로그 관리

할 일을 수집하고 우선순위에 따라 정리하는 시스템

```
┌─────────────────────────────────────────────────────────────┐
│  📋 백로그                                    [+ 새 항목]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔴 High Priority (3)                                       │
│  ├─ □ CI/CD 파이프라인 구축          from: 사이드 프로젝트   │
│  ├─ □ 버그 수정: 로그인 오류          from: 긴급             │
│  └─ □ API 문서 업데이트              from: 이번 주 목표      │
│                                                             │
│  🟡 Medium Priority (5)                                     │
│  ├─ □ 다크모드 지원                  from: UI 개선          │
│  ├─ □ 성능 최적화                   from: Tech Debt        │
│  └─ ... 더보기                                             │
│                                                             │
│  🟢 Low Priority (8)                                        │
│  └─ ...                                                    │
│                                                             │
│  💡 Someday/Maybe (12)                                      │
│  └─ ...                                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. 진행률 캘린더 (GitHub 잔디 스타일)

```
┌─────────────────────────────────────────────────────────────┐
│  📊 2025년 활동                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│       1월        2월        3월        ...                  │
│  월   ▪️▪️▪️🟩▪️    ▪️▪️🟩🟩▪️    ▪️▪️▪️▪️▪️                     │
│  화   ▪️🟩🟩🟩▪️    ▪️🟩🟩🟩🟩    ▪️▪️▪️▪️▪️                     │
│  수   🟩🟩🟨🟩🟩    🟩🟩🟩🟨🟩    ▪️▪️▪️▪️▪️                     │
│  목   🟩🟨🟩🟩▪️    🟩🟩🟩🟩🟩    ▪️▪️▪️▪️▪️                     │
│  금   🟩🟩🟩🟩🟩    🟨🟩🟩🟩🟩    ▪️▪️▪️▪️▪️                     │
│  토   ▪️▪️▪️🟨▪️    ▪️▪️🟨▪️▪️    ▪️▪️▪️▪️▪️                     │
│  일   ▪️▪️▪️▪️▪️    ▪️▪️▪️▪️▪️    ▪️▪️▪️▪️▪️                     │
│                                                             │
│  🟩 75-100%   🟨 50-74%   🟧 25-49%   🟥 1-24%   ▪️ 0%       │
│                                                             │
│  📈 이번 달: 78% 평균 달성률 | 🔥 15일 연속 스트릭          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. 일일 진행률 상세

```
┌─────────────────────────────────────────────────────────────┐
│  📅 2025-01-15 (수)                              진행률 80% │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ████████████████████░░░░░  4/5 완료                        │
│                                                             │
│  ✅ The Rust Book 3장 읽기      35min / 30min  (117%)       │
│  ✅ rustlings 5문제 풀기        40min / 45min  (89%)        │
│  ✅ 점심 운동                   55min / 60min  (92%)        │
│  ⏭️ 이메일 정리                 스킵됨                       │
│  ⏳ 프로젝트 문서 작성           진행 중...                   │
│                                                             │
│  📊 시간 분석                                               │
│  ├─ 예상 총 시간: 3시간 35분                                │
│  ├─ 실제 사용: 2시간 10분                                   │
│  └─ 효율: 61%                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 데이터 모델 확장

### 새로운 테이블

```sql
-- 백로그 아이템
CREATE TABLE backlog_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium',  -- high, medium, low, someday
    source TEXT,                      -- 어디서 왔는지 (plan_id, manual, etc.)
    tags TEXT,                        -- JSON array
    status TEXT DEFAULT 'pending',    -- pending, scheduled, completed, archived
    scheduled_date TEXT,              -- 일정에 배치된 날짜
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 일별 진행률 요약 (캐시용)
CREATE TABLE daily_progress (
    date TEXT PRIMARY KEY,
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    skipped_tasks INTEGER DEFAULT 0,
    total_estimated_minutes INTEGER DEFAULT 0,
    total_actual_minutes INTEGER DEFAULT 0,
    completion_rate REAL DEFAULT 0,   -- 0.0 ~ 1.0
    streak_count INTEGER DEFAULT 0,   -- 연속 달성 일수
    updated_at TEXT NOT NULL
);

-- 주간/월간 통계 (빠른 조회용)
CREATE TABLE period_stats (
    period_type TEXT NOT NULL,        -- 'week' or 'month'
    period_key TEXT NOT NULL,         -- '2025-W03' or '2025-01'
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    avg_completion_rate REAL DEFAULT 0,
    most_productive_day TEXT,
    total_focus_minutes INTEGER DEFAULT 0,
    PRIMARY KEY (period_type, period_key)
);
```

### TypeScript 타입

```typescript
// packages/core/src/types/progress.ts

export type BacklogPriority = 'high' | 'medium' | 'low' | 'someday';
export type BacklogStatus = 'pending' | 'scheduled' | 'completed' | 'archived';

export interface BacklogItem {
  id: string;
  title: string;
  description?: string;
  priority: BacklogPriority;
  source?: string;
  tags: string[];
  status: BacklogStatus;
  scheduledDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyProgress {
  date: string;
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  completionRate: number;  // 0-1
  streakCount: number;
}

export interface HeatmapData {
  date: string;
  level: 0 | 1 | 2 | 3 | 4;  // 0=none, 1=low, 2=medium, 3=high, 4=max
  completionRate: number;
  taskCount: number;
}

export interface PeriodStats {
  periodType: 'week' | 'month';
  periodKey: string;
  totalTasks: number;
  completedTasks: number;
  avgCompletionRate: number;
  mostProductiveDay?: string;
  totalFocusMinutes: number;
}
```

---

## 진행률 계산 로직

### 일일 진행률

```rust
// src-tauri/src/progress/calculator.rs

pub fn calculate_daily_progress(tasks: &[Task]) -> DailyProgress {
    let total = tasks.len();
    let completed = tasks.iter().filter(|t| t.status == "completed").count();
    let skipped = tasks.iter().filter(|t| t.status == "skipped").count();

    let completion_rate = if total > 0 {
        completed as f64 / (total - skipped) as f64
    } else {
        0.0
    };

    DailyProgress {
        total_tasks: total,
        completed_tasks: completed,
        skipped_tasks: skipped,
        completion_rate,
        // ...
    }
}
```

### 히트맵 레벨

```rust
pub fn get_heatmap_level(completion_rate: f64) -> u8 {
    match completion_rate {
        r if r >= 0.75 => 4,  // 🟩 75-100%
        r if r >= 0.50 => 3,  // 🟨 50-74%
        r if r >= 0.25 => 2,  // 🟧 25-49%
        r if r > 0.0 => 1,    // 🟥 1-24%
        _ => 0,               // ▪️ 0%
    }
}
```

### 스트릭 계산

```rust
pub fn calculate_streak(progress_history: &[DailyProgress]) -> i32 {
    let mut streak = 0;
    let today = chrono::Local::now().date_naive();

    for day_offset in 0.. {
        let date = today - chrono::Duration::days(day_offset);
        let date_str = date.format("%Y-%m-%d").to_string();

        if let Some(p) = progress_history.iter().find(|p| p.date == date_str) {
            if p.completion_rate >= 0.5 {  // 50% 이상이면 스트릭 유지
                streak += 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    streak
}
```

---

## 마크다운 Export 형식

### 월간 리포트 (자동 생성)

```markdown
<!-- reports/2025-01.md -->
---
period: 2025-01
type: monthly_report
generated_at: 2025-02-01T00:00:00Z
---

# 📊 2025년 1월 리포트

## 요약

| 지표 | 값 |
|------|-----|
| 총 태스크 | 150개 |
| 완료 | 120개 (80%) |
| 스킵 | 15개 (10%) |
| 미완료 | 15개 (10%) |
| 평균 일일 달성률 | 78% |
| 최장 스트릭 | 12일 |
| 총 집중 시간 | 45시간 30분 |

## 주간 추이

| 주차 | 달성률 | 태스크 |
|------|--------|--------|
| W01 | 75% | 35/47 |
| W02 | 82% | 38/46 |
| W03 | 78% | 29/37 |
| W04 | 80% | 32/40 |

## 카테고리별

- 🎯 학습: 40개 완료 (85%)
- 💼 업무: 50개 완료 (78%)
- 🏃 운동: 20개 완료 (90%)
- 🏠 기타: 10개 완료 (65%)

## 히트맵

```
    1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 ...
월  ▪️  ▪️  ▪️  ▪️  ▪️  🟩  🟩  🟩  🟩  🟩  🟨  🟩  🟩  🟩  🟩  🟩
화  ▪️  ▪️  ▪️  ▪️  ▪️  🟩  🟩  🟨  🟩  🟩  🟩  🟩  🟩  🟩  🟩  🟨
...
```

## 인사이트

- 화요일이 가장 생산적 (평균 85%)
- 주말 활동량 저조 - 휴식으로 설정 권장
- 오후 3-5시 집중력 저하 패턴 발견
```

---

## UI 컴포넌트

### React 컴포넌트 구조

```typescript
// packages/ui/src/components/progress/

// 히트맵 캘린더
export const HeatmapCalendar: React.FC<{
  data: HeatmapData[];
  year: number;
  onDayClick?: (date: string) => void;
}>;

// 일일 진행률 카드
export const DailyProgressCard: React.FC<{
  progress: DailyProgress;
  tasks: Task[];
}>;

// 스트릭 배지
export const StreakBadge: React.FC<{
  count: number;
  isActive: boolean;
}>;

// 백로그 뷰
export const BacklogView: React.FC<{
  items: BacklogItem[];
  onPriorityChange: (id: string, priority: BacklogPriority) => void;
  onSchedule: (id: string, date: string) => void;
}>;

// 통계 대시보드
export const StatsDashboard: React.FC<{
  daily: DailyProgress;
  weekly: PeriodStats;
  monthly: PeriodStats;
}>;
```

### 히트맵 스타일

```css
/* 히트맵 셀 색상 (다크모드 대응) */
.heatmap-cell {
  --level-0: #161b22;  /* 없음 */
  --level-1: #0e4429;  /* 낮음 */
  --level-2: #006d32;  /* 중간 */
  --level-3: #26a641;  /* 높음 */
  --level-4: #39d353;  /* 최대 */
}
```

---

## Tauri 커맨드

```rust
// src-tauri/src/commands/progress.rs

#[tauri::command]
pub async fn get_daily_progress(
    db: State<'_, DbPool>,
    date: String,
) -> Result<DailyProgress, Error>;

#[tauri::command]
pub async fn get_heatmap_data(
    db: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<HeatmapData>, Error>;

#[tauri::command]
pub async fn get_current_streak(
    db: State<'_, DbPool>,
) -> Result<i32, Error>;

#[tauri::command]
pub async fn get_period_stats(
    db: State<'_, DbPool>,
    period_type: String,  // "week" or "month"
    period_key: String,   // "2025-W03" or "2025-01"
) -> Result<PeriodStats, Error>;

// 백로그 관련
#[tauri::command]
pub async fn get_backlog_items(
    db: State<'_, DbPool>,
    priority: Option<String>,
) -> Result<Vec<BacklogItem>, Error>;

#[tauri::command]
pub async fn create_backlog_item(
    db: State<'_, DbPool>,
    input: CreateBacklogInput,
) -> Result<BacklogItem, Error>;

#[tauri::command]
pub async fn schedule_backlog_item(
    db: State<'_, DbPool>,
    id: String,
    date: String,
) -> Result<Task, Error>;

#[tauri::command]
pub async fn generate_monthly_report(
    db: State<'_, DbPool>,
    year: i32,
    month: i32,
) -> Result<String, Error>;  // 마크다운 반환
```

---

## 구현 순서

### Phase 1: 기본 진행률
1. [ ] daily_progress 테이블 및 자동 계산
2. [ ] 일일 진행률 카드 UI
3. [ ] 기본 통계 (완료/스킵/미완료 비율)

### Phase 2: 히트맵 캘린더
1. [ ] HeatmapCalendar 컴포넌트
2. [ ] 연간 뷰 데이터 조회 최적화
3. [ ] 날짜 클릭 시 상세 보기

### Phase 3: 스트릭 시스템
1. [ ] 스트릭 계산 로직
2. [ ] StreakBadge 컴포넌트
3. [ ] 스트릭 알림 (깨지기 전 경고)

### Phase 4: 백로그 관리
1. [ ] backlog_items 테이블
2. [ ] BacklogView UI (드래그 정렬)
3. [ ] 백로그 → 일정 배치 기능

### Phase 5: 리포트
1. [ ] 주간/월간 통계 집계
2. [ ] 마크다운 리포트 자동 생성
3. [ ] 리포트 Export

---

## 관련 문서

- [02-data-model.md](./02-data-model.md) - 데이터 모델
- [04-markdown-data-portability.md](./04-markdown-data-portability.md) - 마크다운 Export

---

마지막 업데이트: 2025-12-31
