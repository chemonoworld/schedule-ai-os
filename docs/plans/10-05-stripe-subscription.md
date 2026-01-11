# 10-05. Stripe 결제 연동

## 개요

Stripe를 통한 Pro 구독 결제 시스템 구현.

---

## 목표

- [ ] Stripe 계정 설정
- [ ] `subscriptions` 테이블 마이그레이션
- [ ] Stripe Checkout 세션 생성
- [ ] 웹훅 처리 (결제 성공/실패/취소)
- [ ] 구독 상태 관리
- [ ] Pro 사용자 AI 무제한 처리
- [ ] 클라이언트 결제 플로우 UI

---

## Stripe 설정

1. [Stripe Dashboard](https://dashboard.stripe.com) 접속
2. Product 생성: "Schedule AI Pro"
3. Price 생성: $9.99/month (recurring)
4. Webhook 엔드포인트 설정
5. API 키 복사

---

## 환경 변수 추가

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx
```

---

## 마이그레이션

```sql
-- migrations/004_subscriptions.sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 새 사용자 생성 시 자동으로 free 구독 생성
CREATE OR REPLACE FUNCTION create_subscription_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_user_insert_subscription
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_subscription_for_new_user();

CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
```

---

## 의존성 추가

```toml
[dependencies]
stripe-rust = "0.26"  # 또는 직접 API 호출
```

---

## API 엔드포인트

### GET /api/subscription/status

현재 구독 상태 조회.

**Response (Free)**:
```json
{
  "plan": "free",
  "status": "active",
  "usage": {
    "ai_calls_used": 5,
    "ai_calls_limit": 10,
    "remaining": 5
  }
}
```

**Response (Pro)**:
```json
{
  "plan": "pro",
  "status": "active",
  "current_period_end": "2026-02-01T00:00:00Z",
  "cancel_at_period_end": false,
  "usage": {
    "ai_calls_used": 150,
    "ai_calls_limit": null,
    "remaining": null
  }
}
```

### POST /api/subscription/checkout

Stripe Checkout 세션 생성.

**Response**:
```json
{
  "checkout_url": "https://checkout.stripe.com/xxx"
}
```

### POST /api/subscription/webhook

Stripe 웹훅 수신 (Stripe에서 호출).

처리하는 이벤트:
- `checkout.session.completed` - 결제 성공
- `customer.subscription.updated` - 구독 상태 변경
- `customer.subscription.deleted` - 구독 취소
- `invoice.payment_failed` - 결제 실패

### POST /api/subscription/cancel

구독 취소 (기간 종료 시 취소).

**Response**:
```json
{
  "message": "구독이 2026-02-01에 종료됩니다.",
  "cancel_at_period_end": true
}
```

### POST /api/subscription/reactivate

취소된 구독 재활성화.

---

## Checkout 플로우

```
┌─────────┐     ┌─────────────────┐     ┌────────┐
│ Client  │────▶│ /checkout       │────▶│ Stripe │
│         │     │ (세션 생성)      │     │Checkout│
└─────────┘     └─────────────────┘     └────────┘
                                             │
                                             ▼
┌─────────┐     ┌─────────────────┐     ┌────────┐
│ Server  │◀────│ /webhook        │◀────│ Stripe │
│ (DB)    │     │ (상태 업데이트)  │     │        │
└─────────┘     └─────────────────┘     └────────┘
                                             │
                                             ▼
┌─────────┐     ┌─────────────────┐     ┌────────┐
│ Client  │◀────│ Success Page    │◀────│ Stripe │
│ (완료)  │     │                 │     │        │
└─────────┘     └─────────────────┘     └────────┘
```

---

## 웹훅 처리

```rust
// routes/subscription.rs

pub async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> Result<StatusCode, AppError> {
    let signature = headers
        .get("stripe-signature")
        .ok_or(AppError::BadRequest)?;

    let event = Webhook::construct_event(
        &body,
        signature.to_str()?,
        &state.config.stripe_webhook_secret,
    )?;

    match event.type_ {
        EventType::CheckoutSessionCompleted => {
            // 결제 완료 처리
            handle_checkout_completed(event.data.object).await?;
        }
        EventType::CustomerSubscriptionUpdated => {
            // 구독 상태 업데이트
            handle_subscription_updated(event.data.object).await?;
        }
        EventType::CustomerSubscriptionDeleted => {
            // 구독 취소 완료
            handle_subscription_deleted(event.data.object).await?;
        }
        _ => {}
    }

    Ok(StatusCode::OK)
}
```

---

## Pro 사용자 무제한 처리

```rust
// services/usage.rs

pub async fn check_and_increment_usage(
    db: &PgPool,
    user_id: &Uuid,
) -> Result<(), AppError> {
    // 구독 상태 확인
    let subscription = sqlx::query_as!(
        Subscription,
        "SELECT * FROM subscriptions WHERE user_id = $1",
        user_id
    )
    .fetch_one(db)
    .await?;

    // Pro 사용자는 무제한
    if subscription.plan == "pro" && subscription.status == "active" {
        // 사용량은 기록하되 제한 없음
        sqlx::query!(
            "UPDATE usage SET ai_calls_used = ai_calls_used + 1, updated_at = NOW() WHERE user_id = $1",
            user_id
        )
        .execute(db)
        .await?;
        return Ok(());
    }

    // 무료 사용자 제한 체크
    let usage = sqlx::query_as!(
        Usage,
        "SELECT * FROM usage WHERE user_id = $1",
        user_id
    )
    .fetch_one(db)
    .await?;

    if usage.ai_calls_used >= usage.ai_calls_limit {
        return Err(AppError::UsageLimitExceeded);
    }

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

## 클라이언트 UI

### 업그레이드 버튼

Settings 또는 Usage Indicator에 표시:

```typescript
const handleUpgrade = async () => {
  const { checkout_url } = await api.request('/api/subscription/checkout', {
    method: 'POST',
  });
  // 브라우저에서 Stripe Checkout 열기
  await open(checkout_url);
};
```

### 구독 관리 UI

```
┌────────────────────────────────────┐
│  📊 구독 상태                      │
│                                    │
│  플랜: Pro                         │
│  상태: 활성                        │
│  다음 결제일: 2026-02-01           │
│                                    │
│  [구독 취소]                       │
└────────────────────────────────────┘
```

---

## 구현 순서

1. Stripe 계정 설정 및 Product/Price 생성
2. 환경 변수 추가
3. 마이그레이션 실행
4. `models/subscription.rs` 생성
5. `services/subscription.rs` - Stripe 연동 로직
6. `routes/subscription.rs` - 엔드포인트
7. 웹훅 처리 구현
8. `services/usage.rs` 수정 (Pro 무제한)
9. 클라이언트 결제 플로우 UI
10. 테스트 (Stripe Test Mode)

---

## 테스트 시나리오

1. Checkout 세션 생성 및 결제 성공
2. 웹훅 수신 및 구독 상태 업데이트
3. Pro 사용자 AI 무제한 확인
4. 구독 취소 플로우
5. 결제 실패 시 상태 변경

---

상태: 미시작
우선순위: 중
예상 작업량: 대
