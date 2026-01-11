-- Recurring Plans table
CREATE TABLE IF NOT EXISTS recurring_plans (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,

    -- 기본 정보
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,                  -- 장소

    -- 반복 패턴
    recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('daily', 'weekly', 'monthly')),
    interval_value INTEGER DEFAULT 1,
    days_of_week TEXT,              -- JSON array: [0,1,2,3,4,5,6] (일~토)
    day_of_month INTEGER,           -- 월간 반복 시 날짜 (1-31)

    -- 시간 정보
    scheduled_time TEXT,            -- "HH:MM"
    end_time TEXT,                  -- "HH:MM" (optional)
    estimated_duration INTEGER,     -- minutes

    -- 기간
    start_date TEXT NOT NULL,
    end_date TEXT,                  -- null = 무기한 (1년치만 생성)

    -- 상태
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 생성된 태스크 추적 (중복 생성 방지)
CREATE TABLE IF NOT EXISTS generated_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    recurring_plan_id TEXT NOT NULL REFERENCES recurring_plans(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    created_at TEXT NOT NULL,

    UNIQUE(recurring_plan_id, scheduled_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recurring_plans_plan_id ON recurring_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_active ON recurring_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_generated_tasks_recurring_plan_id ON generated_tasks(recurring_plan_id);
CREATE INDEX IF NOT EXISTS idx_generated_tasks_task_id ON generated_tasks(task_id);
