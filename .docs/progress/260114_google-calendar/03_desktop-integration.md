# Desktop Integration - Progress

## 원본
- 계획: [03_desktop-integration.md](../../plans/260114_google-calendar/03_desktop-integration.md)
- 상위: [Overview](./00_overview.md)

## 진행 상황

### 2026-01-14
- 완료:
  - [x] Tauri deep-link 플러그인 설정
    - Cargo.toml: `tauri-plugin-deep-link = "2"`
    - tauri.conf.json: `scheduleai://` scheme 설정
    - lib.rs: 플러그인 등록
    - capabilities/default.json: `deep-link:default` 권한 추가
    - package.json: `@tauri-apps/plugin-deep-link` 추가
  - [x] calendarApi.ts 생성
    - 서버 API 클라이언트 구현
    - JWT 토큰 관리 (getAccessToken, setAccessToken)
    - API 메서드: getConnectionStatus, getOAuthUrl, disconnect, listCalendars, selectCalendars, listEvents
  - [x] calendarStore.ts 리팩토링
    - invoke() → calendarApi 호출로 변경
    - handleOAuthSuccess/handleOAuthError 콜백 추가
    - optimistic update로 UI 반응성 개선
  - [x] useDeepLink.ts 생성
    - Deep Link 이벤트 리스너
    - `scheduleai://calendar/callback?success=true` 처리
    - `scheduleai://calendar/callback?error=...` 처리
  - [x] .env.example 업데이트
    - `VITE_API_BASE_URL=http://localhost:3000`
  - [x] 빌드 검증
    - TypeScript: 통과
    - Rust: 통과 (경고만 존재)

## 변경된 파일
- `schedule-ai-tauri/src-tauri/Cargo.toml`
- `schedule-ai-tauri/src-tauri/tauri.conf.json`
- `schedule-ai-tauri/src-tauri/src/lib.rs`
- `schedule-ai-tauri/src-tauri/capabilities/default.json`
- `schedule-ai-tauri/package.json`
- `schedule-ai-tauri/pnpm-lock.yaml`
- `schedule-ai-tauri/src/services/calendarApi.ts` (NEW)
- `schedule-ai-tauri/src/hooks/useDeepLink.ts` (NEW)
- `schedule-ai-tauri/src/stores/calendarStore.ts`
- `schedule-ai-tauri/.env.example`

## 완료율
- [x] 100%

## 메모
- Deep Link 방식으로 OAuth 콜백 처리: 서버에서 `scheduleai://calendar/callback` URL로 리다이렉트
- JWT 토큰은 메모리에 저장 (추후 secure storage로 개선 가능)
- 서버와의 통신은 Bearer 토큰 방식
