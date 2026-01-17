-- Focus 앱 차단 이벤트 기록
CREATE TABLE IF NOT EXISTS focus_block_events (
    id TEXT PRIMARY KEY NOT NULL,
    bundle_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    blocked_at TEXT NOT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_block_events_bundle_id ON focus_block_events(bundle_id);
CREATE INDEX IF NOT EXISTS idx_block_events_blocked_at ON focus_block_events(blocked_at);
