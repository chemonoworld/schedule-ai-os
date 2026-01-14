# 서버 단위 테스트

## 개요
- **상위 태스크**: [Google Calendar 테스트](./00_overview.md)
- **목적**: CalendarService 및 관련 유틸리티의 단위 테스트 작성
- **상태**: 대기

## 목표
- [ ] CalendarService 테스트
- [ ] 토큰 갱신 로직 테스트
- [ ] 이벤트 변환 로직 테스트
- [ ] 에러 처리 테스트

## 구현 계획

### 1. 테스트 파일 구조
```
schedule-ai-server/
├── src/
│   └── services/
│       ├── calendar.rs
│       └── calendar_tests.rs  # 신규
└── tests/
    └── calendar_service_test.rs  # 신규 (통합 테스트)
```

### 2. CalendarService 단위 테스트

**테스트 케이스:**

```rust
// src/services/calendar_tests.rs

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;
    use mockall::mock;

    // Mock HTTP Client
    mock! {
        HttpClient {}
        impl Clone for HttpClient {
            fn clone(&self) -> Self;
        }
    }

    #[tokio::test]
    async fn test_get_valid_token_not_expired() {
        // 만료되지 않은 토큰 반환 테스트
        // Given: 유효한 토큰 (30분 이상 남음)
        // When: get_valid_token() 호출
        // Then: 기존 토큰 그대로 반환
    }

    #[tokio::test]
    async fn test_get_valid_token_needs_refresh() {
        // 만료 임박 토큰 갱신 테스트
        // Given: 5분 미만 남은 토큰
        // When: get_valid_token() 호출
        // Then: 토큰 갱신 후 새 토큰 반환
    }

    #[tokio::test]
    async fn test_get_valid_token_no_token() {
        // 토큰 없는 경우 에러 테스트
        // Given: DB에 토큰 없음
        // When: get_valid_token() 호출
        // Then: CalendarNotConnected 에러
    }

    #[tokio::test]
    async fn test_refresh_token_success() {
        // 토큰 갱신 성공 테스트
        // Given: 유효한 refresh_token
        // When: refresh_token() 호출
        // Then: 새 access_token 반환
    }

    #[tokio::test]
    async fn test_refresh_token_invalid() {
        // 만료된 refresh_token 테스트
        // Given: 만료된 refresh_token
        // When: refresh_token() 호출
        // Then: 에러 및 재인증 필요 표시
    }
}
```

### 3. 이벤트 변환 테스트

```rust
#[cfg(test)]
mod event_conversion_tests {
    use super::*;

    #[test]
    fn test_convert_timed_event() {
        // 시간 지정 이벤트 변환
        let google_event = GoogleEvent {
            id: Some("event1".to_string()),
            summary: Some("Meeting".to_string()),
            start: GoogleEventTime {
                date: None,
                date_time: Some("2026-01-14T10:00:00+09:00".to_string()),
            },
            end: GoogleEventTime {
                date: None,
                date_time: Some("2026-01-14T11:00:00+09:00".to_string()),
            },
            // ...
        };

        let result = convert_event("primary", google_event);

        assert!(result.is_some());
        let event = result.unwrap();
        assert_eq!(event.title, "Meeting");
        assert!(!event.is_all_day);
    }

    #[test]
    fn test_convert_all_day_event() {
        // 종일 이벤트 변환
        let google_event = GoogleEvent {
            id: Some("event2".to_string()),
            summary: Some("Holiday".to_string()),
            start: GoogleEventTime {
                date: Some("2026-01-15".to_string()),
                date_time: None,
            },
            end: GoogleEventTime {
                date: Some("2026-01-16".to_string()),
                date_time: None,
            },
            // ...
        };

        let result = convert_event("primary", google_event);

        assert!(result.is_some());
        let event = result.unwrap();
        assert!(event.is_all_day);
    }

    #[test]
    fn test_convert_event_no_title() {
        // 제목 없는 이벤트 (기본값 적용)
        let google_event = GoogleEvent {
            id: Some("event3".to_string()),
            summary: None,  // 제목 없음
            // ...
        };

        let result = convert_event("primary", google_event);

        assert!(result.is_some());
        assert_eq!(result.unwrap().title, "(제목 없음)");
    }

    #[test]
    fn test_convert_cancelled_event() {
        // 취소된 이벤트 상태 처리
        let google_event = GoogleEvent {
            status: Some("cancelled".to_string()),
            // ...
        };

        let result = convert_event("primary", google_event);

        assert!(result.is_some());
        assert_eq!(result.unwrap().status, EventStatus::Cancelled);
    }
}
```

### 4. 캘린더 선택 테스트

```rust
#[cfg(test)]
mod calendar_selection_tests {
    #[tokio::test]
    async fn test_save_selected_calendars() {
        // 캘린더 선택 저장 테스트
        // Given: user_id, calendar_ids
        // When: save_selected_calendars() 호출
        // Then: DB에 저장 확인
    }

    #[tokio::test]
    async fn test_get_selected_calendar_ids() {
        // 선택된 캘린더 조회 테스트
        // Given: DB에 저장된 선택 정보
        // When: get_selected_calendar_ids() 호출
        // Then: 저장된 ID 목록 반환
    }

    #[tokio::test]
    async fn test_save_replaces_existing() {
        // 기존 선택 대체 테스트
        // Given: 기존 선택 ["cal1", "cal2"]
        // When: save_selected_calendars(["cal3"]) 호출
        // Then: ["cal3"]만 저장됨
    }
}
```

### 5. 에러 처리 테스트

```rust
#[cfg(test)]
mod error_tests {
    #[tokio::test]
    async fn test_google_api_401_triggers_refresh() {
        // Google API 401 응답 시 토큰 갱신 시도
    }

    #[tokio::test]
    async fn test_google_api_403_returns_error() {
        // Google API 403 응답 시 적절한 에러 반환
    }

    #[tokio::test]
    async fn test_google_api_429_rate_limit() {
        // Rate Limit 에러 처리
    }
}
```

## 의존성

```toml
[dev-dependencies]
mockall = "0.13"
tokio-test = "0.4"
```

## 고려사항

### 모킹 전략
- HTTP 요청: `mockall`로 reqwest 모킹
- DB 쿼리: SQLite in-memory DB 사용
- 시간 의존 테스트: `chrono::Utc::now()` 대신 주입 가능한 시간 사용

### 테스트 격리
- 각 테스트는 독립적으로 실행 가능해야 함
- DB 상태는 테스트 전후로 초기화

## 관련 파일
- `src/services/calendar.rs` - 테스트 대상
- `src/models/calendar.rs` - 모델 정의
