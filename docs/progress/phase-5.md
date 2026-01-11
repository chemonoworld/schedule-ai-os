# Phase 5: 포커스 모드 (Focus Mode)

> 상태: **완료**
> 완료일: 2026-01-01

## 목표

- [x] 실행 중인 앱 목록 조회
- [x] 차단할 앱 선택 UI
- [x] 수동 집중 모드 시작/종료
- [x] 차단 앱 감지 시 강제 종료 (NSRunningApplication.terminate)
- [x] 알림 시스템 (소리 포함)
- [x] 경과 시간 타이머
- [x] 집중 모드 중 오늘의 할 일 표시
- [x] 탭 이동 시에도 블로킹 유지

---

## 완료된 작업

### 1. macOS 앱 모니터링 및 종료 (Rust)

**파일: `src-tauri/src/focus/mod.rs`**

- [x] NSWorkspace API로 실행 중인 앱 목록 조회
- [x] `get_running_apps()` - 일반 앱만 필터링 (백그라운드 프로세스 제외)
- [x] `get_frontmost_app()` - 현재 활성화된 앱 조회
- [x] `activate_our_app()` - Cocoa `activateIgnoringOtherApps` 사용
- [x] `terminate_app_by_bundle_id()` - 차단된 앱 강제 종료
- [x] Tauri 커맨드 등록

**의존성 (Cargo.toml)**
```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-app-kit = { version = "0.2", features = ["NSWorkspace", "NSRunningApplication", "NSWindow", "NSApplication"] }
objc2-foundation = "0.2"
cocoa = "0.26"
```

### 2. Focus Store (TypeScript)

**파일: `src/stores/focusStore.ts`**

- [x] Zustand 기반 상태 관리
- [x] 차단 앱 감지 시 `terminate_app_command` 호출
- [x] 알림 발송 (중복 방지 로직 포함)
- [x] 경과 시간 타이머 (`tick`)

**상태 구조:**
```typescript
interface FocusState {
  isActive: boolean;
  blockedApps: string[];        // bundle IDs
  runningApps: RunningApp[];
  currentFrontmostApp: RunningApp | null;
  startedAt: number | null;
  elapsedSeconds: number;
  terminatedApps: string[];     // 종료된 앱 목록 (중복 알림 방지)
}
```

### 3. Focus UI (React)

**파일: `src/App.tsx` (FocusView 컴포넌트)**

- [x] 앱 선택 칩(chip) 스타일 UI
- [x] 선택된 앱 개수 표시
- [x] 실행 중인 앱 표시 (녹색 점)
- [x] 집중 모드 시작/종료 버튼
- [x] 다크 그라디언트 타이머 섹션
- [x] 실시간 경과 시간 표시
- [x] 차단된 앱 태그 표시
- [x] 오늘의 할 일 (Pending 태스크) 표시
- [x] 태스크 완료 체크 기능
- [x] 태스크 섹션 클릭 시 Today 탭으로 이동

### 4. 전역 블로킹 (App 레벨)

**파일: `src/App.tsx` (App 컴포넌트)**

- [x] 탭 이동 시에도 블로킹 유지
- [x] App 컴포넌트에서 1초 폴링 실행
- [x] `checkFrontmostApp` - 차단 앱 감지/종료
- [x] `tick` - 타이머 업데이트

### 5. 알림 시스템

- [x] Tauri notification plugin 사용
- [x] 차단 앱 종료 시 알림 발송
- [x] 알림 소리 (`sound: 'default'`)
- [x] 같은 앱에 대한 중복 알림 방지

---

## 기술적 결정

### 앱 강제 종료 방식 채택

CGEventTap(이벤트 차단) 대신 `NSRunningApplication.terminate()` 방식 채택:

**장점:**
- 특별한 권한 불필요 (Accessibility 권한 불필요)
- 확실한 차단 (앱 자체가 종료됨)
- 구현 간단

**동작 방식:**
1. 1초마다 현재 활성 앱 체크
2. 차단 목록에 있는 앱이 활성화되면 `terminate()` 호출
3. 종료 실패 시 `forceTerminate()` 호출
4. 알림 발송 후 Schedule AI 활성화

### 오늘의 할 일 통합

집중 모드 활성화 시 Today 탭의 태스크를 함께 표시:
- Pending 태스크 목록
- 체크 버튼으로 바로 완료 처리
- 완료된 태스크 축약 표시
- 섹션 클릭 시 Today 탭으로 이동

---

## 파일 구조

```
apps/desktop/
├── src-tauri/
│   ├── Cargo.toml              # macOS 의존성
│   └── src/
│       ├── focus/
│       │   └── mod.rs          # NSWorkspace + terminate
│       └── lib.rs              # 커맨드 등록
└── src/
    ├── stores/
    │   └── focusStore.ts       # Focus 상태 관리
    ├── App.tsx                 # FocusView + 전역 폴링
    └── App.css                 # Focus UI 스타일
```

---

## 테스트 방법

1. `pnpm tauri dev`로 앱 실행
2. Focus 탭 이동
3. 차단할 앱 선택 (예: Safari, Discord)
4. "집중 모드 시작" 클릭
5. 차단한 앱 실행 시도
6. 앱이 자동으로 종료되는지 확인
7. 알림이 소리와 함께 발송되는지 확인
8. 다른 탭으로 이동해도 블로킹 유지되는지 확인

---

## 향후 개선 사항

- [ ] Core Time 스케줄 기반 자동 시작
- [ ] 집중 시간 통계/리포트
- [ ] Pomodoro 타이머 통합
- [ ] 차단 앱 프리셋 저장
- [ ] Windows 지원

---

## 참고 문서

- [07-focus-mode.md](../plans/07-focus-mode.md)

---

마지막 업데이트: 2026-01-01
