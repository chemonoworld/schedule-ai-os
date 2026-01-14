# Cleanup Local OAuth - Progress

## 원본
- 계획: [07_cleanup-local-oauth.md](../../plans/260114_google-calendar/07_cleanup-local-oauth.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] `src-tauri/src/google_auth/mod.rs` 삭제
    - PKCE 생성 로직
    - Keyring 토큰 저장/조회
    - OAuth 상태 관리 (OAuthState)
    - 6개의 Tauri 커맨드 제거
  - [x] `src-tauri/src/lib.rs` 수정
    - `mod google_auth;` 제거
    - `use google_auth::OAuthState;` 제거
    - `.manage(OAuthState::new())` 제거
    - invoke_handler에서 google_auth 커맨드 6개 제거
  - [x] `Cargo.toml` 의존성 제거
    - keyring = "3" (Keychain 접근)
    - rand = "0.8" (PKCE verifier 생성)
    - sha2 = "0.10" (PKCE challenge 해시)
    - base64 = "0.22" (PKCE 인코딩)
    - url = "2" (OAuth URL 생성)
  - [x] `.env.example` 확인
    - 이미 정리됨 (Google OAuth 설정 주석 처리됨)
  - [x] 빌드 검증
    - TypeScript: 통과
    - Rust: 통과 (경고만 존재)

## 삭제된 Tauri 커맨드
1. `get_google_auth_url` - OAuth URL 생성
2. `exchange_google_code` - Authorization code 교환
3. `get_google_connection_status` - 연결 상태 확인
4. `get_google_access_token` - Access token 조회/갱신
5. `disconnect_google` - 연결 해제
6. `revoke_google_token` - 토큰 취소

## 변경된 파일
- `schedule-ai-tauri/src-tauri/src/google_auth/mod.rs` (삭제)
- `schedule-ai-tauri/src-tauri/src/lib.rs` (수정)
- `schedule-ai-tauri/src-tauri/Cargo.toml` (수정)

## 완료율
- [x] 100%

## 메모
- OAuth는 이제 서버(schedule-ai-server)에서 처리됨
- Desktop 앱은 서버 API를 통해 Calendar 연동
- 의존성 5개 제거로 바이너리 크기 감소 예상
- 보안 향상: Client Secret이 서버에서만 관리됨
