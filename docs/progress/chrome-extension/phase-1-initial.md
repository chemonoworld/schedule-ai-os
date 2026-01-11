# Chrome Extension - Phase 1: 초기 구현

**날짜**: 2026-01-04
**상태**: 완료

## 구현 완료 항목

### 1. Chrome Extension 기본 구조 ✅

| 파일 | 설명 |
|------|------|
| `manifest.json` | Manifest V3, permissions: tabs, nativeMessaging, notifications, storage |
| `background.js` | Service Worker - 탭 모니터링, Native Messaging 연결 |
| `popup.html` | 풀 컨트롤 UI |
| `popup.js` | 상태 관리, Focus Mode 제어 |
| `popup.css` | 다크 테마 스타일 |
| `icons/icon16.png` | 툴바 아이콘 |
| `icons/icon48.png` | 확장 관리 페이지 아이콘 |
| `icons/icon128.png` | 스토어/알림 아이콘 |

**기능:**
- Focus Mode ON/OFF
- 차단 URL 목록 관리 (추가/삭제/토글)
- 연결 상태 표시 ("데스크톱 연결됨" / "단독 모드")
- 타이머 표시
- 탭 차단 시 Chrome 알림
- **양방향 동기화**: 데스크톱 ↔ 확장 상태 실시간 동기화
- **단독 모드**: 데스크톱 미연결 시 확장만 독립 실행

### 2. Native Host (schedule-ai-host) ✅

| 파일 | 설명 |
|------|------|
| `Cargo.toml` | tokio, serde, tracing 의존성 |
| `src/main.rs` | Chrome ↔ Tauri IPC 브릿지 |

**기능:**
- Chrome Native Messaging 프로토콜 구현 (4바이트 길이 + JSON)
- Unix Socket으로 Tauri 앱과 통신
- 자동 재연결 로직
- 로그 파일 출력 (`~/.schedule-ai-host.log`)
- **양방향 통신**: Tauri → Chrome push + Chrome → Tauri 명령

### 3. Tauri 앱 IPC 서버 ✅

| 파일 | 설명 |
|------|------|
| `src/ipc_server.rs` | Unix Socket 서버 (새 파일) |
| `src/lib.rs` | IPC 서버 시작, `notify_focus_state` 커맨드 |

**기능:**
- `/tmp/schedule-ai.sock`에서 연결 대기
- Focus 상태 변경 시 연결된 클라이언트에 push
- 양방향 통신 (요청/응답 + 상태 push)

### 4. focusStore 확장 ✅

**추가된 상태:**
```typescript
blockedUrls: string[];           // 현재 세션 차단 URL
savedBlockedUrls: SavedBlockedUrl[];  // 저장된 차단 URL 목록
```

**추가된 액션:**
- `loadSavedBlockedUrls()`
- `addBlockedUrl()`
- `removeBlockedUrl()`
- `toggleBlockedUrl()`
- `notifyFocusStateToExtension()`

**기본 차단 URL:**
- YouTube, Facebook, Instagram, Twitter/X, Reddit, TikTok (활성화)
- LinkedIn, Gmail (비활성화)

### 5. 설치 스크립트 ✅

| 파일 | 설명 |
|------|------|
| `install-native-host.sh` | Native Host manifest 등록 |
| `uninstall-native-host.sh` | manifest 제거 |

## 아키텍처

```
Chrome Extension ←── Native Messaging ──→ schedule-ai-host
                                                │
                                          Unix Socket
                                                │
                                          Tauri App
                                                │
                                          focusStore
```

## 남은 작업

- [x] 아이콘 추가 (16/48/128px) ✅ 2026-01-04
- [x] 양방향 동기화 구현 ✅ 2026-01-04
- [x] 단독 모드 구현 ✅ 2026-01-04
- [ ] Chrome Web Store 배포 준비
- [ ] Tauri 빌드 시 Native Host 포함
- [ ] 소셜 로그인 연동 시 서버 동기화

## 테스트 방법

```bash
# 1. Native Host 빌드
cd schedule-ai-host && cargo build --release

# 2. 설치
cd chrome-extension && ./install-native-host.sh

# 3. Chrome에 확장 로드
# chrome://extensions → 개발자 모드 → 폴더 선택

# 4. Tauri 앱 실행
cd schedule-ai-tauri && pnpm tauri dev

# 5. Focus Mode 시작 후 YouTube 접속 테스트
```
