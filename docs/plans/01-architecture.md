# 아키텍처 설계

## 모노레포 구조 상세

```
schedule-ai/
├── apps/
│   └── desktop/                    # Tauri 앱 (데스크톱 + 모바일)
│       ├── src/                    # React 프론트엔드
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── pages/
│       │   ├── stores/             # Zustand 상태관리
│       │   └── utils/
│       ├── src-tauri/              # Rust 백엔드
│       │   ├── src/
│       │   │   ├── commands/       # Tauri 커맨드
│       │   │   ├── db/             # SQLite 연동
│       │   │   ├── focus/          # 집중모드 (OS별)
│       │   │   └── notifications/  # 알림 시스템
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── ui/                         # 공유 UI 컴포넌트
│   │   ├── src/
│   │   │   ├── Button/
│   │   │   ├── Card/
│   │   │   ├── TaskItem/
│   │   │   └── ...
│   │   └── package.json
│   │
│   ├── core/                       # 공유 비즈니스 로직
│   │   ├── src/
│   │   │   ├── types/              # 공통 타입
│   │   │   ├── utils/
│   │   │   └── constants/
│   │   └── package.json
│   │
│   └── llm-client/                 # LLM 추상화 레이어
│       ├── src/
│       │   ├── types.ts            # LLM 공통 인터페이스
│       │   ├── claude.ts           # Claude 구현
│       │   ├── ollama.ts           # Ollama 구현 (추후)
│       │   └── index.ts
│       └── package.json
│
├── plans/                          # 프로젝트 계획
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## 레이어 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                      UI Layer                            │
│              (React Components, Pages)                   │
├─────────────────────────────────────────────────────────┤
│                    State Layer                           │
│                 (Zustand Stores)                         │
├─────────────────────────────────────────────────────────┤
│                   Bridge Layer                           │
│              (Tauri invoke/listen)                       │
├─────────────────────────────────────────────────────────┤
│                   Rust Backend                           │
│     ┌─────────────┬──────────────┬─────────────┐        │
│     │  Commands   │   Services   │   System    │        │
│     │  (IPC API)  │  (Business)  │  (OS APIs)  │        │
│     └─────────────┴──────────────┴─────────────┘        │
├─────────────────────────────────────────────────────────┤
│                   Data Layer                             │
│              (SQLite + Migrations)                       │
└─────────────────────────────────────────────────────────┘
```

## Tauri 커맨드 설계

```rust
// src-tauri/src/commands/mod.rs

// Plan 관련
#[tauri::command]
async fn create_plan(input: CreatePlanInput) -> Result<Plan, Error>;

#[tauri::command]
async fn get_plans() -> Result<Vec<Plan>, Error>;

// Task 관련
#[tauri::command]
async fn get_daily_tasks(date: String) -> Result<Vec<Task>, Error>;

#[tauri::command]
async fn update_task(id: String, update: TaskUpdate) -> Result<Task, Error>;

#[tauri::command]
async fn split_task(id: String) -> Result<Vec<SubTask>, Error>;

// 집중 모드
#[tauri::command]
async fn start_focus_mode(config: FocusConfig) -> Result<(), Error>;

#[tauri::command]
async fn stop_focus_mode() -> Result<(), Error>;

// LLM
#[tauri::command]
async fn process_with_llm(prompt: String, context: LLMContext) -> Result<LLMResponse, Error>;
```

## 플랫폼별 고려사항

### macOS
- 앱 블로킹: `NSWorkspace`, Accessibility API
- 알림: `UserNotifications` framework
- 권한: 접근성, 알림 권한 필요

### iOS
- 앱 블로킹: 불가 (샌드박스)
- 대안: 집중 유도 UI, Screen Time API 연동 안내
- 알림: `UNUserNotificationCenter`
- 위젯: iOS 위젯 지원 고려

### Android
- 앱 블로킹: 제한적 (UsageStatsManager)
- 알림: `NotificationManager`
- 오버레이: `SYSTEM_ALERT_WINDOW` 권한

### Windows (추후)
- 앱 블로킹: Win32 API
- 알림: Windows Notification Center
