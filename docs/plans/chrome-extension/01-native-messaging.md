# Native Messaging 설정

## 개요

Chrome Extension과 Tauri 앱 사이의 통신은 Native Messaging을 사용합니다.
이 방식은 Chrome이 공식 지원하는 방법으로, 보안이 가장 뛰어납니다.

## 통신 흐름

```
Chrome Extension
    │
    │ chrome.runtime.connectNative('com.scheduleai.host')
    ▼
Chrome Browser
    │
    │ spawn (백그라운드)
    ▼
schedule-ai-host (Rust 바이너리)
    │
    │ stdin/stdout JSON
    ▼
Chrome Native Messaging Protocol
    │
    │ Unix Socket IPC
    ▼
Tauri Desktop App
```

## 메시지 프로토콜

### Chrome → Native Host

```json
// 상태 요청
{ "type": "GET_STATE" }

// Focus 시작
{
  "type": "START_FOCUS",
  "payload": {
    "blocked_urls": ["youtube.com", "facebook.com"],
    "timer_type": "pomodoro",
    "timer_duration": 25
  }
}

// Focus 종료
{ "type": "STOP_FOCUS" }

// 차단 URL 업데이트
{
  "type": "UPDATE_BLOCKED_URLS",
  "payload": {
    "blocked_urls": ["youtube.com", "instagram.com"]
  }
}
```

### Native Host → Chrome

```json
// 연결 확인
{ "type": "CONNECTED" }

// Focus 상태
{
  "type": "FOCUS_STATE",
  "payload": {
    "isActive": true,
    "blockedUrls": ["youtube.com"],
    "elapsedSeconds": 120,
    "timerSeconds": 1380,
    "timerType": "pomodoro"
  }
}

// 에러
{
  "type": "ERROR",
  "error": "Tauri app not connected"
}
```

## Native Host Manifest

위치: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.scheduleai.host.json`

```json
{
  "name": "com.scheduleai.host",
  "description": "Schedule AI Focus Mode Native Host",
  "path": "/Applications/Schedule AI.app/Contents/MacOS/schedule-ai-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID/"
  ]
}
```

## 설치 스크립트 사용

### 개발 환경

```bash
# Native Host 빌드
cd schedule-ai-host
cargo build --release

# 설치 (개발 모드)
cd ../chrome-extension
./install-native-host.sh
# Enter 키 눌러 개발 모드 사용
```

### 프로덕션

```bash
# Extension ID 확인 (chrome://extensions)
./install-native-host.sh
# Extension ID 입력: abcdefghijklmnopqrstuvwxyz123456
```

## 디버깅

### Native Host 로그

```bash
tail -f ~/.schedule-ai-host.log
```

### Chrome Extension 로그

1. chrome://extensions 열기
2. Schedule AI Focus 확장 찾기
3. "Service Worker" 클릭
4. Console 탭 확인

### IPC 테스트

```bash
# Tauri 앱 실행 상태에서
echo '{"type":"GetState"}' | nc -U /tmp/schedule-ai.sock
```
