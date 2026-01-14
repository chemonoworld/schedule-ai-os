# Google OAuth 2.0 인증 - Progress

## 원본
- 계획: [01_google-oauth.md](../../plans/260114_google-calendar/01_google-oauth.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] Cargo.toml에 의존성 추가 (keyring, rand, sha2, base64, url)
  - [x] google_auth 모듈 생성 (`src-tauri/src/google_auth/mod.rs`)
  - [x] PKCE 기반 OAuth 흐름 구현
    - get_google_auth_url - 인증 URL 생성
    - exchange_google_code - 토큰 교환
    - get_google_connection_status - 상태 확인
    - get_google_access_token - 토큰 조회/갱신
    - disconnect_google - 연결 해제
    - revoke_google_token - 토큰 취소
  - [x] Keyring을 통한 안전한 토큰 저장 (macOS Keychain)
  - [x] lib.rs에 모듈 및 커맨드 등록
  - [x] Frontend calendarStore 구현 (`src/stores/calendarStore.ts`)
  - [x] 환경변수 설정 (.env.example 생성)
  - [x] .gitignore에 .env 추가
  - [x] 빌드 성공 확인 (Rust + TypeScript)

- 블로커:
  - 없음

## 완료율
- [x] 100%

## 구현된 파일

| 파일 | 상태 |
|------|------|
| `src-tauri/Cargo.toml` | 수정됨 |
| `src-tauri/src/lib.rs` | 수정됨 |
| `src-tauri/src/google_auth/mod.rs` | 신규 |
| `src-tauri/capabilities/default.json` | 수정됨 |
| `src/stores/calendarStore.ts` | 신규 |
| `.env.example` | 신규 |
| `.gitignore` | 수정됨 |

## 메모
- 외부 플러그인(tauri-plugin-google-auth) 대신 직접 구현으로 결정
- PKCE S256 방식 사용 (보안 강화)
- 토큰 갱신은 만료 5분 전 자동 수행
- 사용자는 Google Cloud Console에서 OAuth 클라이언트 생성 필요
