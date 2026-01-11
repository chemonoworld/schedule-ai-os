# 10-03. LLM Proxy 및 무료 횟수 카운팅

## 개요

서버를 통한 Claude API 호출 및 무료 사용량 관리 시스템 구현.

---

## 목표

- [ ] `usage` 테이블 마이그레이션
- [ ] Claude API Proxy 구현
- [ ] 무료 사용량 카운팅 (10회)
- [ ] 사용량 초과 시 에러 응답
- [ ] LLM 엔드포인트들 구현
  - [ ] POST /api/llm/parse-plan
  - [ ] POST /api/llm/generate-tasks
  - [ ] POST /api/llm/split-task
  - [ ] POST /api/llm/parse-recurring
- [ ] 사용량 조회 API

---

## 마이그레이션

```sql
-- migrations/003_usage.sql
CREATE TABLE usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ai_calls_used INTEGER NOT NULL DEFAULT 0,
  ai_calls_limit INTEGER NOT NULL DEFAULT 10,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 새 사용자 생성 시 자동으로 usage 레코드 생성하는 트리거
CREATE OR REPLACE FUNCTION create_usage_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO usage (user_id, ai_calls_used, ai_calls_limit)
  VALUES (NEW.id, 0, 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_usage_for_new_user();
```

---

## 환경 변수 추가

```env
# Claude API
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_MODEL=claude-sonnet-4-20250514
```

---

## API 엔드포인트

모든 LLM 엔드포인트는 인증 필수 (`Authorization: Bearer {token}`).

### GET /api/usage

현재 사용량 조회.

**Response**:
```json
{
  "ai_calls_used": 3,
  "ai_calls_limit": 10,
  "is_pro": false,
  "remaining": 7
}
```

### POST /api/llm/parse-plan

플랜 텍스트를 구조화된 데이터로 파싱.

**Request**:
```json
{
  "plan_input": "1월에 토플 시험 준비...",
  "plan_rules": "optional user rules"
}
```

**Response**:
```json
{
  "goals": ["토플 100점 달성"],
  "milestones": [],
  "suggested_tasks": [
    {
      "title": "토플 단어 암기",
      "estimated_duration": 30,
      "priority": 1
    }
  ]
}
```

### POST /api/llm/generate-tasks

플랜 기반 일일 태스크 생성.

**Request**:
```json
{
  "plan_title": "토플 준비",
  "plan_description": "...",
  "date": "2026-01-15",
  "plan_rules": "optional"
}
```

**Response**:
```json
{
  "tasks": [
    {
      "title": "리딩 연습",
      "description": "...",
      "estimated_duration": 25,
      "priority": 1,
      "scheduled_time": "09:00"
    }
  ],
  "summary": "오늘의 요약"
}
```

### POST /api/llm/split-task

태스크를 작은 서브태스크로 분할.

**Request**:
```json
{
  "task_title": "블로그 글 작성"
}
```

**Response**:
```json
{
  "subtasks": [
    {"title": "주제 선정", "estimated_minutes": 5},
    {"title": "개요 작성", "estimated_minutes": 10}
  ]
}
```

### POST /api/llm/parse-recurring

자연어를 반복 일정 패턴으로 파싱.

**Request**:
```json
{
  "input": "매주 토요일 2시에 토플 학원"
}
```

**Response**:
```json
{
  "recurrence_type": "weekly",
  "interval_value": 1,
  "days_of_week": [6],
  "scheduled_time": "14:00",
  "title": "토플 학원"
}
```

---

## 사용량 체크 로직

```rust
// services/usage.rs

pub async fn check_and_increment_usage(
    db: &PgPool,
    user_id: &Uuid,
) -> Result<(), AppError> {
    // 1. 현재 사용량 조회
    let usage = sqlx::query_as!(
        Usage,
        "SELECT * FROM usage WHERE user_id = $1",
        user_id
    )
    .fetch_one(db)
    .await?;

    // 2. Pro 사용자는 무제한
    // (subscription 테이블 확인 - 10-05에서 구현)

    // 3. 무료 사용자 제한 체크
    if usage.ai_calls_used >= usage.ai_calls_limit {
        return Err(AppError::UsageLimitExceeded);
    }

    // 4. 사용량 증가
    sqlx::query!(
        "UPDATE usage SET ai_calls_used = ai_calls_used + 1, updated_at = NOW() WHERE user_id = $1",
        user_id
    )
    .execute(db)
    .await?;

    Ok(())
}
```

---

## 에러 응답

### 사용량 초과

```json
{
  "error": "usage_limit_exceeded",
  "message": "무료 AI 사용 횟수(10회)를 모두 사용했습니다. Pro 플랜으로 업그레이드하세요.",
  "usage": {
    "used": 10,
    "limit": 10
  }
}
```

HTTP Status: 402 Payment Required

---

## Claude API Proxy 로직

```rust
// services/llm_proxy.rs

pub struct LLMProxy {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl LLMProxy {
    pub async fn complete(&self, messages: Vec<Message>) -> Result<String, AppError> {
        let response = self.client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": self.model,
                "max_tokens": 2048,
                "messages": messages
            }))
            .send()
            .await?;

        // 응답 파싱
        let data: ClaudeResponse = response.json().await?;
        Ok(data.content[0].text.clone())
    }
}
```

---

## 구현 순서

1. 마이그레이션 실행
2. `models/usage.rs` 생성
3. `services/usage.rs` - 사용량 체크/증가 로직
4. `services/llm_proxy.rs` - Claude API 호출
5. `routes/usage.rs` - GET /api/usage
6. `routes/llm.rs` - LLM 엔드포인트들
7. 에러 타입 추가 (UsageLimitExceeded)
8. 테스트

---

## 테스트 시나리오

1. 새 사용자 생성 시 usage 레코드 자동 생성 확인
2. AI 호출 시 사용량 증가 확인
3. 10회 초과 시 402 에러 확인
4. 사용량 조회 API 동작 확인

---

상태: 미시작
우선순위: 높음
예상 작업량: 대
