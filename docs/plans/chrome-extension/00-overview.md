# Chrome Extension - Focus Mode URL Blocker

## 개요
데스크톱 앱의 Focus Mode와 연동하여 차단 URL의 탭을 자동으로 닫는 Chrome 확장 프로그램

## 핵심 기능
- Focus Mode 활성화 시 차단된 URL 탭 자동 닫기
- 풀 컨트롤 팝업 UI (Focus Mode ON/OFF, URL 설정)
- Chrome 알림 (탭 차단 시)
- Native Messaging으로 데스크톱 앱과 안전하게 통신

## 아키텍처

```
┌─────────────────────┐
│  Chrome Extension   │
│  - background.js    │ ←── 탭 모니터링 & 닫기
│  - popup UI         │
└──────────┬──────────┘
           │ Native Messaging (stdin/stdout)
┌──────────▼──────────┐
│  Native Host        │
│  schedule-ai-host   │ ←── 경량 Rust 바이너리
└──────────┬──────────┘
           │ Unix Socket IPC
┌──────────▼──────────┐
│  Tauri Desktop App  │
│  - Focus Mode 상태  │
│  - 차단 URL 목록    │
└─────────────────────┘
```

## 파일 구조

```
schedule-ai/
├── chrome-extension/
│   ├── manifest.json           # Chrome Extension 설정
│   ├── background.js           # Service Worker
│   ├── popup.html              # 팝업 UI
│   ├── popup.js                # 팝업 로직
│   ├── popup.css               # 팝업 스타일
│   ├── icons/                  # 아이콘
│   ├── install-native-host.sh  # Native Host 설치 스크립트
│   └── uninstall-native-host.sh
├── schedule-ai-host/           # Native Host Rust 프로젝트
│   ├── Cargo.toml
│   └── src/
│       └── main.rs
└── schedule-ai-tauri/
    ├── src/
    │   └── stores/
    │       └── focusStore.ts   # blockedUrls 상태 추가됨
    └── src-tauri/
        └── src/
            ├── lib.rs          # IPC 서버 시작 & notify_focus_state
            └── ipc_server.rs   # Unix Socket IPC 서버
```

## 기본 차단 URL

| 사이트 | 패턴 | 기본 활성화 |
|--------|------|------------|
| YouTube | youtube.com | O |
| Facebook | facebook.com | O |
| Instagram | instagram.com | O |
| Twitter/X | twitter.com, x.com | O |
| Reddit | reddit.com | O |
| TikTok | tiktok.com | O |
| LinkedIn | linkedin.com | X |
| Gmail | mail.google.com | X |

## 설치 방법

[01-native-messaging.md](01-native-messaging.md) 참조

## 향후 확장

- 서버에서 차단 URL 목록 동기화 (소셜 로그인 연동)
- 여러 기기 간 설정 공유
- 통계 및 리포트
