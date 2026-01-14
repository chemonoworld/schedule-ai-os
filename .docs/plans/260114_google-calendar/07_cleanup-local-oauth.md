# 로컬 OAuth 코드 정리

## 개요
- **상위 태스크**: [Google Calendar 연동](./00_overview.md)
- **이전 단계**: [06_settings-management.md](./06_settings-management.md)
- **목적**: 서버 OAuth로 이전 후 더 이상 필요없는 로컬 OAuth 코드 제거
- **상태**: 대기
- **선행 조건**: 01~03 서브태스크 완료 후 진행

## 목표
- [ ] `src-tauri/src/google_auth/` 모듈 전체 제거
- [ ] `src-tauri/src/lib.rs`에서 모듈 import 및 커맨드 등록 제거
- [ ] `Cargo.toml`에서 불필요한 의존성 제거
- [ ] `.env.example`에서 Client Secret 관련 항목 제거
- [ ] `calendarStore.ts`에서 invoke() 호출 코드 정리 확인

## 제거 대상

### 1. Rust 모듈
```
src-tauri/src/google_auth/
└── mod.rs  # 전체 제거
```

**제거할 Tauri 커맨드:**
- `get_google_auth_url`
- `exchange_google_code`
- `get_google_connection_status`
- `get_google_access_token`
- `disconnect_google`
- `revoke_google_token`

### 2. Cargo.toml 의존성
```toml
# 제거 대상
keyring = "3"      # 토큰이 서버 DB에 저장됨
rand = "0.8"       # PKCE가 서버에서 처리됨
sha2 = "0.10"      # PKCE가 서버에서 처리됨
base64 = "0.22"    # PKCE가 서버에서 처리됨
url = "2"          # OAuth URL 생성이 서버에서 처리됨
```

### 3. lib.rs 수정
```rust
// 제거할 내용
mod google_auth;
use google_auth::OAuthState;

// invoke_handler에서 제거
.manage(OAuthState::new())
.invoke_handler(tauri::generate_handler![
    // 제거: google_auth 관련 커맨드들
])
```

### 4. 환경 변수
```env
# .env.example에서 제거
VITE_GOOGLE_CLIENT_ID=xxx
VITE_GOOGLE_CLIENT_SECRET=xxx
```

## 확인 사항

### 제거 전 체크리스트
- [ ] 서버 OAuth 엔드포인트 정상 동작 확인
- [ ] 서버 Calendar API 프록시 정상 동작 확인
- [ ] Desktop 앱에서 서버 API 연동 완료 확인
- [ ] Settings에서 연결/해제 정상 동작 확인

### 제거 후 체크리스트
- [ ] `cargo build` 성공
- [ ] `pnpm tauri dev` 정상 실행
- [ ] Google Calendar 연결 기능 정상 동작
- [ ] 이벤트 조회 정상 동작

## 관련 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src-tauri/src/google_auth/mod.rs` | 삭제 | OAuth 모듈 전체 |
| `src-tauri/src/lib.rs` | 수정 | 모듈/커맨드 등록 제거 |
| `src-tauri/Cargo.toml` | 수정 | 의존성 제거 |
| `.env.example` | 수정 | Client Secret 항목 제거 |

## 주의사항

- 이 작업은 **반드시 서버 연동이 완전히 동작한 후** 진행
- 롤백이 필요할 경우를 대비해 별도 브랜치에서 진행 권장
- 제거 전 모든 기능 테스트 완료 필수
