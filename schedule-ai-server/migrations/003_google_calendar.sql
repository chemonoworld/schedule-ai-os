-- Google Calendar OAuth 토큰 저장 테이블
CREATE TABLE google_calendar_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) NOT NULL DEFAULT 'Bearer',
    expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    google_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 사용자가 선택한 캘린더 목록 테이블
CREATE TABLE user_selected_calendars (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, calendar_id)
);

-- 인덱스
CREATE INDEX idx_calendar_tokens_expires_at ON google_calendar_tokens(expires_at);
CREATE INDEX idx_selected_calendars_user_id ON user_selected_calendars(user_id);
