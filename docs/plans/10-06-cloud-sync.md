# 10-06. 기기간 동기화 (Pro)

## 개요

Pro 구독자를 위한 기기간 데이터 동기화 기능 구현.

---

## 목표

- [ ] `sync_data` 테이블 마이그레이션
- [ ] 동기화 API 구현
  - [ ] GET /api/sync/pull
  - [ ] POST /api/sync/push
  - [ ] POST /api/sync/resolve
- [ ] 충돌 감지 및 해결 로직
- [ ] 클라이언트 동기화 로직
- [ ] 자동 동기화 (앱 시작 시, 변경 시)
- [ ] 동기화 상태 UI

---

## 마이그레이션

```sql
-- migrations/005_sync.sql
CREATE TABLE sync_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  data_type VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, data_type)
);

CREATE INDEX idx_sync_data_user_type ON sync_data(user_id, data_type);
CREATE INDEX idx_sync_data_updated_at ON sync_data(updated_at);
```

---

## 데이터 타입

동기화 대상 데이터:

| 타입 | 설명 |
|------|------|
| `plans` | 모든 플랜 목록 |
| `tasks` | 모든 태스크 목록 |
| `recurring_plans` | 반복 일정 목록 |
| `settings` | 앱 설정 (언어, 단축키 등) |

---

## API 엔드포인트

모든 동기화 API는 **Pro 구독자 전용**.

### GET /api/sync/pull

서버에서 최신 데이터 가져오기.

**Query Params**:
- `since`: 마지막 동기화 시간 (ISO 8601)
- `types`: 동기화할 데이터 타입 (콤마 구분)

**Response**:
```json
{
  "data": {
    "plans": {
      "items": [...],
      "version": 5,
      "updated_at": "2026-01-15T10:00:00Z"
    },
    "tasks": {
      "items": [...],
      "version": 12,
      "updated_at": "2026-01-15T10:30:00Z"
    }
  },
  "server_time": "2026-01-15T11:00:00Z"
}
```

### POST /api/sync/push

로컬 변경사항 서버에 푸시.

**Request**:
```json
{
  "changes": {
    "plans": {
      "items": [...],
      "local_version": 4
    },
    "tasks": {
      "items": [...],
      "local_version": 11
    }
  },
  "client_time": "2026-01-15T10:45:00Z"
}
```

**Response (성공)**:
```json
{
  "status": "ok",
  "new_versions": {
    "plans": 5,
    "tasks": 12
  }
}
```

**Response (충돌)**:
```json
{
  "status": "conflict",
  "conflicts": {
    "plans": {
      "server_version": 5,
      "client_version": 4,
      "server_data": [...],
      "client_data": [...]
    }
  }
}
```

### POST /api/sync/resolve

충돌 해결.

**Request**:
```json
{
  "resolutions": {
    "plans": {
      "strategy": "use_server" | "use_client" | "merge",
      "merged_data": [...] // merge인 경우
    }
  }
}
```

---

## 충돌 해결 전략

```
┌─────────────────────────────────────────┐
│  🔄 동기화 충돌 발생                    │
│                                         │
│  Plans에서 충돌이 감지되었습니다.       │
│                                         │
│  서버 버전: 2026-01-15 10:00            │
│  로컬 버전: 2026-01-15 09:30            │
│                                         │
│  ○ 서버 데이터 사용 (이 기기 변경 무시) │
│  ○ 로컬 데이터 사용 (다른 기기 변경 무시)│
│  ○ 수동으로 병합                        │
│                                         │
│  [적용]                                 │
└─────────────────────────────────────────┘
```

---

## 동기화 로직

### 앱 시작 시

```typescript
// src/hooks/useSync.ts

export function useSync() {
  const { isAuthenticated, isPro } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && isPro) {
      syncOnStartup();
    }
  }, [isAuthenticated, isPro]);

  const syncOnStartup = async () => {
    const lastSyncTime = await getLastSyncTime();
    const serverData = await api.request('/api/sync/pull', {
      params: { since: lastSyncTime }
    });

    // 로컬 데이터와 병합
    await mergeServerData(serverData);
  };
}
```

### 변경 시 동기화

```typescript
// Debounced push on local changes
const debouncedPush = useMemo(
  () => debounce(async (changes) => {
    if (!isPro) return;

    try {
      const result = await api.request('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify({ changes })
      });

      if (result.status === 'conflict') {
        showConflictResolutionModal(result.conflicts);
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }, 5000),
  [isPro]
);
```

---

## 버전 관리

Optimistic Locking을 사용한 버전 관리:

```rust
// services/sync.rs

pub async fn push_changes(
    db: &PgPool,
    user_id: &Uuid,
    changes: SyncChanges,
) -> Result<SyncResult, AppError> {
    let mut conflicts = HashMap::new();

    for (data_type, change) in changes.iter() {
        // 현재 서버 버전 확인
        let current = sqlx::query_as!(
            SyncData,
            "SELECT * FROM sync_data WHERE user_id = $1 AND data_type = $2",
            user_id,
            data_type
        )
        .fetch_optional(db)
        .await?;

        if let Some(existing) = current {
            if existing.version != change.local_version {
                // 충돌 발생
                conflicts.insert(data_type.clone(), Conflict {
                    server_version: existing.version,
                    client_version: change.local_version,
                    server_data: existing.data,
                    client_data: change.items.clone(),
                });
                continue;
            }
        }

        // 버전 증가 및 저장
        sqlx::query!(
            r#"
            INSERT INTO sync_data (user_id, data_type, data, version)
            VALUES ($1, $2, $3, 1)
            ON CONFLICT (user_id, data_type)
            DO UPDATE SET data = $3, version = sync_data.version + 1, updated_at = NOW()
            "#,
            user_id,
            data_type,
            serde_json::to_value(&change.items)?
        )
        .execute(db)
        .await?;
    }

    if !conflicts.is_empty() {
        return Ok(SyncResult::Conflict(conflicts));
    }

    Ok(SyncResult::Ok)
}
```

---

## 클라이언트 UI

### 동기화 상태 표시

```
┌─────────────────────┐
│ ☁️ 동기화 완료      │
│ 마지막: 방금 전     │
└─────────────────────┘

┌─────────────────────┐
│ 🔄 동기화 중...     │
└─────────────────────┘

┌─────────────────────┐
│ ⚠️ 동기화 실패      │
│ [재시도]            │
└─────────────────────┘
```

### Settings > 동기화 설정

```
┌────────────────────────────────────┐
│  🔄 동기화                         │
│                                    │
│  상태: 활성                        │
│  마지막 동기화: 2026-01-15 10:30   │
│                                    │
│  [수동 동기화]                     │
│  [동기화 기록 보기]                │
└────────────────────────────────────┘
```

---

## 구현 순서

1. 마이그레이션 실행
2. `models/sync.rs` 생성
3. `services/sync.rs` - 동기화 로직
4. `routes/sync.rs` - API 엔드포인트
5. Pro 구독 체크 미들웨어 추가
6. 클라이언트 `useSync.ts` 훅 생성
7. 충돌 해결 UI 구현
8. 동기화 상태 UI 구현
9. 테스트

---

## 테스트 시나리오

1. 앱 시작 시 자동 pull 동작
2. 로컬 변경 시 자동 push 동작
3. 충돌 발생 시 해결 UI 표시
4. 각 해결 전략 동작 확인
5. Pro 아닌 사용자 접근 시 에러
6. 오프라인 시 큐잉 및 재연결 시 동기화

---

## 향후 개선

- 실시간 동기화 (WebSocket)
- 오프라인 큐잉
- 부분 동기화 (변경된 항목만)
- 동기화 이력 조회

---

상태: 미시작
우선순위: 낮음 (Stripe 이후)
예상 작업량: 대
