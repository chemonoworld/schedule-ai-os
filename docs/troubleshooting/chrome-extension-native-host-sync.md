# Chrome Extension ↔ Desktop 양방향 동기화 버그

> 상태: 부분 해결 (추가 작업 필요)
> 날짜: 2026-01-05

## 증상

Chrome Extension에서 Focus Mode 시작 버튼을 누르면:
1. Chrome Extension 로그에서는 `postMessage completed for START_FOCUS` 성공
2. Native Host 로그에서는 `START_FOCUS` 메시지를 받지 못함
3. Desktop 앱에 Focus Mode가 동기화되지 않음
4. 반대 방향(Desktop → Chrome)은 정상 작동

## 원인 분석

### 1. 데드락 문제 (해결됨)
**원인**: Native Host에서 하나의 Tauri IPC 연결을 공유하면서 발생
- `push_task`: 락을 잡고 `read_push().await`에서 영원히 대기
- `chrome_task`: `rt.block_on(async { tauri_conn.lock().await })` 에서 락 획득 불가

**해결**: Chrome 요청용과 Push 수신용으로 별도의 Tauri 연결 사용
```rust
// Chrome 요청 처리용 Tauri 연결 (별도)
let tauri_conn_for_chrome: Arc<Mutex<Option<TauriConnection>>> = ...;

// Push 수신용 별도 연결
let push_task = tokio::spawn(async move {
    let mut push_conn: Option<TauriConnection> = None;
    // push_conn은 별도로 관리
});
```

### 2. 여러 Service Worker 인스턴스 문제 (부분 해결)
**증상**: Chrome Extension 리로드 시 여러 Service Worker가 동시에 시작되어 여러 Native Host 프로세스가 생성됨

**시도한 해결책**:
- `isConnecting` 플래그로 중복 연결 방지
- `isPortReady` 플래그로 CONNECTED 응답 후에만 메시지 전송
- 지연 연결 (1초 후 connectNative 호출)
- Service Worker 인스턴스 ID 로깅

### 3. 메시지 손실 문제 (미해결)
**증상**: 처음에는 동기화가 되다가 나중에 안 됨

**추정 원인**:
- Chrome의 Service Worker가 idle 상태로 전환되면서 연결이 끊어질 수 있음
- `onDisconnect` 이벤트가 제대로 발생하지 않아 죽은 포트로 메시지 전송

## 수정된 파일

### Native Host (`schedule-ai-host/src/main.rs`)
1. Tauri 연결을 Chrome 요청용/Push 수신용으로 분리
2. `send_request`에 5초 타임아웃 추가
3. 상세 디버그 로깅 추가

### Chrome Extension (`chrome-extension/background.js`)
1. `isPortReady` 플래그 추가 - CONNECTED 응답 후에만 true
2. `pendingMessages` 큐 - 연결 준비 전 메시지 저장
3. `flushPendingMessages()` - 연결 후 대기 메시지 전송
4. `isConnecting` 플래그로 중복 연결 방지
5. Service Worker 인스턴스 ID 로깅
6. 지연 연결 (1초)

### Chrome Extension (`chrome-extension/popup.js`)
1. `ignoreStateUpdatesUntil` - 버튼 클릭 후 1.5초간 상태 업데이트 무시
2. `isToggling` - 더블클릭 방지
3. 낙관적 UI 업데이트

### IPC Server (`schedule-ai-tauri/src-tauri/src/ipc_server.rs`)
1. `pending_commands`를 `Vec`으로 변경 (덮어씌움 방지)
2. `take_pending_command()`에서 마지막 명령만 반환

## 남은 문제 및 향후 작업

### 1. 연결 안정성 개선 (높은 우선순위)
- [ ] Service Worker가 idle 전환 후 재활성화 시 연결 복구 로직
- [ ] 메시지 전송 실패 시 자동 재연결 및 재시도
- [ ] Heartbeat 메커니즘으로 연결 상태 주기적 확인

### 2. 디버깅 개선
- [ ] Native Host에서 Chrome 메시지 수신 로그 더 상세히
- [ ] 연결 끊김 시점과 원인 추적

### 3. 레이스 컨디션 추가 방지
- [ ] Chrome Extension 리로드 시 이전 Native Host 프로세스 정리
- [ ] 단일 연결 보장 메커니즘

### 4. 테스트
- [ ] 장시간 실행 후 동기화 테스트
- [ ] Service Worker 재시작 후 동기화 테스트
- [ ] 빠른 연속 클릭 테스트

## 아키텍처

```
┌─────────────────────┐
│  Chrome Extension   │
│  - background.js    │ ←── Service Worker (수명 주기 관리됨)
│  - popup.js         │
└──────────┬──────────┘
           │ Native Messaging (stdin/stdout)
┌──────────▼──────────┐
│  Native Host        │
│  schedule-ai-host   │ ←── Chrome당 1개 프로세스
└──────────┬──────────┘
           │ Unix Socket IPC (2개 연결)
           │  ├── Chrome 요청용
           │  └── Push 수신용
┌──────────▼──────────┐
│  Tauri Desktop App  │
│  - ipc_server.rs    │
└─────────────────────┘
```

## 참고

- Chrome Native Messaging 문서: https://developer.chrome.com/docs/extensions/mv3/nativeMessaging/
- Manifest V3 Service Worker 수명 주기: https://developer.chrome.com/docs/extensions/mv3/service_workers/
