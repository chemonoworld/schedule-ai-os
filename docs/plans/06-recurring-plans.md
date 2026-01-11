# 06. 반복 일정 시스템 (Recurring Plans)

> 상태: 완료
> 구현일: 2025-12-31

## 개요

반복 태스크를 결정론적으로 생성하는 시스템.

- **LLM 파싱**: 자연어 입력을 구조화된 패턴으로 변환 (API 키 있을 때)
- **규칙 기반 파싱**: LLM 없이도 동작하는 fallback
- **선제 생성**: 반복 플랜 저장 시 모든 태스크를 미리 생성

## 데이터 모델

### RecurringPlan 테이블

```sql
CREATE TABLE recurring_plans (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,

    -- 기본 정보
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,                           -- 장소 (선택)

    -- 반복 패턴 (구조화됨)
    recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('daily', 'weekly', 'monthly')),
    interval_value INTEGER DEFAULT 1,        -- 매 N일/주/월
    days_of_week TEXT,                       -- JSON: [0,1,2,3,4,5,6] (일~토)
    day_of_month INTEGER,                    -- 월간 반복 시 날짜

    -- 시간 정보
    scheduled_time TEXT,                     -- "12:00"
    end_time TEXT,                           -- "16:00" (optional)
    estimated_duration INTEGER,              -- 분 단위

    -- 기간
    start_date TEXT NOT NULL,                -- "2026-01-01"
    end_date TEXT,                           -- "2026-02-28" (null = 무기한)

    -- 상태
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 생성된 태스크 추적 (중복 생성 방지)
CREATE TABLE generated_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    recurring_plan_id TEXT NOT NULL REFERENCES recurring_plans(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    created_at TEXT NOT NULL,

    UNIQUE(recurring_plan_id, scheduled_date)
);
```

### 예시 데이터

```json
{
  "id": "rp_001",
  "planId": "plan_001",
  "title": "토플 학원",
  "location": "강남역 근처",
  "recurrenceType": "weekly",
  "intervalValue": 1,
  "daysOfWeek": [6],
  "scheduledTime": "12:00",
  "endTime": "16:00",
  "estimatedDuration": 240,
  "startDate": "2026-01-01",
  "endDate": "2026-02-28",
  "isActive": true
}
```

## 자연어 파싱

### LLM 기반 파싱 (권장)

Claude API를 사용하여 자연어를 구조화된 패턴으로 변환:

```
입력: "2026년 1월부터 2월까지 매주 토요일 12-16시 강남역 근처 토플 학원"

LLM 출력:
{
  "recurrenceType": "weekly",
  "intervalValue": 1,
  "daysOfWeek": [6],
  "scheduledTime": "12:00",
  "endTime": "16:00",
  "estimatedDuration": 240,
  "startDate": "2026-01-01",
  "endDate": "2026-02-28",
  "title": "토플 학원",
  "location": "강남역 근처"
}
```

- 낮은 temperature(0.3)로 결정론적 결과 유도
- 장소 필드도 자동 추출

### 규칙 기반 파싱 (Fallback)

API 키가 없을 때 사용되는 규칙 기반 파싱:

```
"매일" → daily, interval=1
"매주" → weekly, interval=1
"격주" → weekly, interval=2
"매월" → monthly, interval=1
"매주 토요일" → weekly, daysOfWeek=[6]
"월수금" → weekly, daysOfWeek=[1,3,5]
"평일" → weekly, daysOfWeek=[1,2,3,4,5]
"주말" → weekly, daysOfWeek=[0,6]
```

#### 시간 파싱
```
"12시" → 12:00
"오후 3시" → 15:00
"12-16시" → scheduledTime=12:00, endTime=16:00, duration=240
```

#### 기간 파싱
```
"1월부터 2월까지" → startDate=2026-01-01, endDate=2026-02-28
"다음주부터" → startDate=다음주 월요일
```

## Rust 구현

### 핵심 구조체

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringPlan {
    pub id: String,
    pub plan_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub recurrence_type: RecurrenceType,
    pub interval_value: i32,
    pub days_of_week: Option<Vec<i32>>,
    pub day_of_month: Option<i32>,
    pub scheduled_time: Option<String>,
    pub end_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub start_date: String,
    pub end_date: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedRecurrencePattern {
    pub recurrence_type: RecurrenceType,
    pub interval_value: i32,
    pub days_of_week: Option<Vec<i32>>,
    pub day_of_month: Option<i32>,
    pub scheduled_time: Option<String>,
    pub end_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub title: Option<String>,
    pub location: Option<String>,
}
```

### Tauri 커맨드

```rust
// 규칙 기반 파싱
#[tauri::command]
async fn parse_recurrence_pattern(input: String)
    -> Result<Option<ParsedRecurrencePattern>, String>

// LLM 기반 파싱
#[tauri::command]
async fn parse_recurrence_pattern_with_ai(
    state: State<'_, ApiKeyState>,
    input: String
) -> Result<ParsedRecurrencePattern, String>

// 태스크 미리보기 생성
#[tauri::command]
async fn generate_tasks_preview(recurring_plan: RecurringPlan)
    -> Result<Vec<GeneratedTaskInput>, String>
```

## UI Flow

### 1. 자연어 입력

```
┌──────────────────────────────────────────────────┐
│ 반복 일정 추가                                    │
├──────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐ │
│ │ 2026년 1월부터 2월까지 매주 토요일 12-16시   │ │
│ │ 강남역 근처 토플 학원                         │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [파싱하기]  (API 키 있으면 LLM 사용)             │
└──────────────────────────────────────────────────┘
```

### 2. 구조화된 폼

```
┌──────────────────────────────────────────────────┐
│ 반복 일정 확인                                    │
├──────────────────────────────────────────────────┤
│ 제목: [토플 학원                              ]  │
│ 장소: [강남역 근처                            ]  │
│                                                  │
│ 반복: [매주 ▼] [토 ✓] [ ] [ ] [ ] [ ] [ ] [ ]   │
│                일  월  화  수  목  금  토        │
│                                                  │
│ 시간: [12:00] ~ [16:00]  (4시간)                 │
│                                                  │
│ 기간: [2026-01-01] ~ [2026-02-28]               │
│                                                  │
│ ──────────────────────────────────────────────── │
│ 미리보기: 총 8개 태스크 생성 예정                 │
│   • 2026-01-04 (토) 12:00-16:00                 │
│   • 2026-01-11 (토) 12:00-16:00                 │
│   • 2026-01-18 (토) 12:00-16:00                 │
│   • ... 5개 더                                   │
│                                                  │
│ [취소]                        [8개 태스크 생성]  │
└──────────────────────────────────────────────────┘
```

### 3. 반복 일정 목록

```
┌──────────────────────────────────────────────────┐
│ 토플 학원                                    [✕] │
│ 📍 강남역 근처                                    │
│ 매주 토 12:00-16:00                              │
│ 2026-01-01 ~ 2026-02-28                          │
└──────────────────────────────────────────────────┘
```

## 구현 파일

| 파일 | 설명 |
|------|------|
| `src-tauri/src/db/migrations/003_recurring_plans.sql` | DB 마이그레이션 |
| `src-tauri/src/recurring/mod.rs` | Rust 백엔드 로직 |
| `packages/core/src/types/models.ts` | TypeScript 타입 |
| `packages/core/src/types/api.ts` | API 타입 |
| `apps/desktop/src/db/index.ts` | DB 레이어 |
| `apps/desktop/src/App.tsx` | UI 구현 |

## 고려사항

- 이미 생성된 태스크 수정 시 개별 처리 (recurring_plan과 분리)
- 삭제된 태스크 재생성 방지 (generated_tasks로 추적)
- 시간대 처리 (로컬 타임존 사용)
- 종료일 없는 무기한 반복 (최대 1년치만 미리 생성)

---

마지막 업데이트: 2025-12-31
