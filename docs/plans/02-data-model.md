# 데이터 모델 설계

## ERD 개요

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Plan      │────<│    Task      │────<│   SubTask    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│  CoreTime    │     │  TaskLog     │
└──────────────┘     └──────────────┘
```

## 스키마 정의

### Plan (계획)
사용자가 입력한 장기/중기 계획

```sql
CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    original_input TEXT,          -- 원본 사용자 입력
    parsed_content TEXT,          -- LLM이 파싱한 구조화된 내용 (JSON)
    priority INTEGER DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    recurrence TEXT,              -- 반복 패턴 (JSON: daily, weekly, etc.)
    status TEXT DEFAULT 'active', -- active, paused, completed, archived
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### Task (태스크)
일일 TODO 항목

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES plans(id),
    title TEXT NOT NULL,
    description TEXT,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT,          -- 예정 시간 (HH:MM)
    estimated_duration INTEGER,   -- 예상 소요시간 (분)
    actual_duration INTEGER,      -- 실제 소요시간 (분)
    priority INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending', -- pending, in_progress, completed, skipped
    order_index INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);
```

### SubTask (서브태스크)
태스크를 더 작은 단위로 분해

```sql
CREATE TABLE subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    order_index INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
```

### CoreTime (코어타임 설정)
집중 시간대 설정

```sql
CREATE TABLE core_times (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,     -- HH:MM
    end_time TEXT NOT NULL,       -- HH:MM
    days_of_week TEXT NOT NULL,   -- JSON array [0-6] (0 = Sunday)
    blocked_apps TEXT,            -- JSON array of app identifiers
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### TaskLog (태스크 로그)
태스크 상태 변화 기록 (분석용)

```sql
CREATE TABLE task_logs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    action TEXT NOT NULL,         -- created, started, paused, completed, skipped
    note TEXT,
    created_at TEXT NOT NULL
);
```

### Settings (설정)
앱 설정

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## TypeScript 타입 정의

```typescript
// packages/core/src/types/models.ts

export type PlanStatus = 'active' | 'paused' | 'completed' | 'archived';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface Plan {
  id: string;
  title: string;
  description?: string;
  originalInput?: string;
  parsedContent?: ParsedPlanContent;
  priority: number;
  startDate?: string;
  endDate?: string;
  recurrence?: RecurrencePattern;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  planId?: string;
  title: string;
  description?: string;
  scheduledDate: string;
  scheduledTime?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  priority: number;
  status: TaskStatus;
  orderIndex: number;
  subtasks?: SubTask[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SubTask {
  id: string;
  taskId: string;
  title: string;
  status: TaskStatus;
  orderIndex: number;
  createdAt: string;
  completedAt?: string;
}

export interface CoreTime {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  blockedApps?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: string;
}

export interface ParsedPlanContent {
  goals: string[];
  milestones: Milestone[];
  suggestedTasks: SuggestedTask[];
}

export interface Milestone {
  title: string;
  targetDate?: string;
  tasks: string[];
}

export interface SuggestedTask {
  title: string;
  estimatedDuration?: number;
  priority: number;
  frequency?: RecurrencePattern;
}
```

## 마이그레이션 전략

```rust
// src-tauri/src/db/migrations.rs

pub const MIGRATIONS: &[&str] = &[
    // v1: Initial schema
    include_str!("./migrations/001_initial.sql"),
    // v2: Add task logs
    include_str!("./migrations/002_task_logs.sql"),
    // ... 추가 마이그레이션
];
```
