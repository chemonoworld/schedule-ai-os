# Chrome Extension 설치 가이드

## 개발 환경 설치

### 1. Native Host 빌드

```bash
cd schedule-ai-host
cargo build --release
```

### 2. Native Host 등록

```bash
cd chrome-extension
./install-native-host.sh
# Enter 키 눌러 개발 모드 사용
```

### 3. Chrome에 확장 로드

1. Chrome에서 `chrome://extensions` 열기
2. 우측 상단 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `chrome-extension` 폴더 선택

### 4. Tauri 앱 실행

```bash
cd schedule-ai-tauri
pnpm tauri dev
```

### 5. 테스트

1. Chrome 확장 아이콘 클릭
2. 연결 상태 확인 (녹색 점)
3. Focus Mode 시작
4. YouTube 접속 시도 → 탭 자동 닫힘 확인

## 프로덕션 설치

### 1. Extension ID 확인

Chrome에 확장 로드 후:
1. `chrome://extensions` 열기
2. "Schedule AI Focus" 확장의 ID 복사

### 2. Native Host 재등록

```bash
./install-native-host.sh
# Extension ID 입력: (복사한 ID)
```

### 3. 아이콘 추가

`icons/` 폴더에 다음 파일 필요:
- icon16.png (16x16)
- icon48.png (48x48)
- icon128.png (128x128)

## 배포 시 고려사항

### Tauri 앱 번들에 포함

```rust
// tauri.conf.json 또는 빌드 스크립트에서
// schedule-ai-host 바이너리를 앱 번들에 포함

// 경로: /Applications/Schedule AI.app/Contents/MacOS/schedule-ai-host
```

### 자동 등록

앱 설치 시 Native Host manifest 자동 등록:
- macOS: 앱 최초 실행 시 등록
- 권한 요청 불필요

## 트러블슈팅

### "Native host has exited"

1. Native Host 바이너리 확인
```bash
ls -la ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

2. manifest의 path 확인
```bash
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.scheduleai.host.json
```

### "Tauri app not connected"

1. Tauri 앱 실행 확인
2. IPC 소켓 확인
```bash
ls -la /tmp/schedule-ai.sock
```

### 팝업에서 연결 끊김

1. Chrome 확장 재로드
2. Service Worker 재시작 (chrome://extensions에서)
