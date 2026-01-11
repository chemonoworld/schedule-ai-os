-- Daily progress summary (캐시용)
CREATE TABLE IF NOT EXISTS daily_progress (
    date TEXT PRIMARY KEY NOT NULL,
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    skipped_tasks INTEGER DEFAULT 0,
    total_estimated_minutes INTEGER DEFAULT 0,
    total_actual_minutes INTEGER DEFAULT 0,
    completion_rate REAL DEFAULT 0,
    streak_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- Indexes for progress queries
CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON daily_progress(date);
CREATE INDEX IF NOT EXISTS idx_daily_progress_completion ON daily_progress(completion_rate);
