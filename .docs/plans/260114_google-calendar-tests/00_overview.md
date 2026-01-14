# Google Calendar 연동 테스트 코드 작성 - Overview

## 개요
- **목적**: Google Calendar 연동 기능의 품질 보증을 위한 테스트 코드 작성
- **배경**: 7개의 서브태스크로 구현된 Google Calendar 연동 기능에 대한 체계적인 테스트 필요
- **범위**: 서버(Rust) + Desktop(TypeScript) 양쪽 테스트

## 서브태스크 목록

| # | 서브태스크 | 설명 | 상태 |
|---|-----------|------|------|
| 1 | [01_server-unit-tests](./01_server-unit-tests.md) | 서버 단위 테스트 (서비스, 모델) | ✅ 완료 (14개) |
| 2 | [02_server-integration-tests](./02_server-integration-tests.md) | 서버 통합 테스트 (API 엔드포인트) | ⏸️ 보류 |
| 3 | [03_desktop-unit-tests](./03_desktop-unit-tests.md) | Desktop 단위 테스트 (Store, Hook, Utils) | ✅ 완료 (32개) |
| 4 | [04_desktop-integration-tests](./04_desktop-integration-tests.md) | Desktop 통합 테스트 (컴포넌트) | ⏸️ 보류 |

## 전체 목표

### 서버 테스트
- [x] CalendarService 단위 테스트 (이벤트 변환)
- [ ] OAuth 라우트 통합 테스트 (보류 - DB 설정 필요)
- [ ] Calendar API 라우트 통합 테스트 (보류 - DB 설정 필요)
- [x] 에러 처리 테스트

### Desktop 테스트
- [x] calendarStore 단위 테스트
- [x] calendarApi 단위 테스트 (모킹으로 테스트)
- [x] timeline.ts 유틸리티 테스트
- [ ] useDeepLink 훅 테스트 (보류 - 훅 분리 필요)

## 기술 스택

### 서버 (Rust)
| 항목 | 기술 | 용도 |
|------|------|------|
| 테스트 프레임워크 | cargo test | 내장 테스트 |
| HTTP 모킹 | mockall + wiremock | 외부 API 모킹 |
| DB 테스트 | sqlx-test | PostgreSQL 테스트 |
| 비동기 테스트 | tokio-test | async 테스트 |

### Desktop (TypeScript)
| 항목 | 기술 | 용도 |
|------|------|------|
| 테스트 프레임워크 | Vitest | 단위/통합 테스트 |
| 컴포넌트 테스트 | @testing-library/react | React 컴포넌트 |
| API 모킹 | MSW (Mock Service Worker) | HTTP 요청 모킹 |
| 스토어 테스트 | zustand 내장 | Zustand 스토어 |

## 테스트 커버리지 목표

| 영역 | 목표 커버리지 | 우선 테스트 대상 |
|------|-------------|-----------------|
| 서버 서비스 | 80% | CalendarService, 토큰 갱신 |
| 서버 라우트 | 70% | OAuth 콜백, 이벤트 조회 |
| Desktop Store | 70% | calendarStore |
| Desktop Utils | 90% | timeline.ts |

## 의존성 추가

### 서버 (Cargo.toml)
```toml
[dev-dependencies]
mockall = "0.13"
wiremock = "0.6"
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate"] }
tokio-test = "0.4"
tower = { version = "0.5", features = ["util"] }
axum-test = "17"
```

### Desktop (package.json)
```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "msw": "^2.0.0",
    "happy-dom": "^15.0.0"
  }
}
```

## 테스트 실행 명령어

```bash
# 서버 테스트
cd schedule-ai-server && cargo test

# Desktop 테스트
cd schedule-ai-tauri && pnpm test

# 전체 테스트
pnpm test:all
```

## 관련 파일

### 테스트 대상 (서버)
- `src/services/calendar.rs` - CalendarService
- `src/routes/calendar.rs` - Calendar API 라우트
- `src/routes/calendar_auth.rs` - Calendar OAuth 라우트
- `src/models/calendar.rs` - Calendar 모델

### 테스트 대상 (Desktop)
- `src/stores/calendarStore.ts` - 캘린더 스토어
- `src/services/calendarApi.ts` - API 클라이언트
- `src/hooks/useDeepLink.ts` - Deep Link 훅
- `src/types/timeline.ts` - 타임라인 유틸리티

## 수동 테스트

자동화 테스트 외에 직접 앱을 실행하여 확인해야 할 항목:
- [수동 테스트 체크리스트](./manual-testing-checklist.md)

## 참고 사항
- 외부 API(Google Calendar)는 모킹하여 테스트
- DB 테스트는 별도 테스트용 DB 사용
- CI/CD에서 자동 실행 가능하도록 구성
