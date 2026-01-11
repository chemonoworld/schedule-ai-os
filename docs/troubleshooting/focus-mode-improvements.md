# Focus Mode 개선

## 변경 사항 (2026-01-02)

### 1. 네비게이터 탭 순서 변경

Focus Mode를 두 번째 탭으로 이동:
- 이전: Today → Plans → Progress → Focus → Settings
- 이후: Today → **Focus** → Plans → Progress → Settings

**파일**: `schedule-ai-tauri/src/App.tsx`

### 2. 네비게이터 레이아웃 시프트 수정

**증상**: 탭 전환 시 네비게이터 탭들이 미세하게 움직임

**원인**: 스크롤바가 나타났다 사라지면서 레이아웃이 흔들림

**해결**:
```css
/* macOS 스타일 오버레이 스크롤바 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
```

**파일**: `schedule-ai-tauri/src/App.css`

### 3. Schedule AI 자기 자신 제외

Focus Mode 앱 목록에서 Schedule AI 제외:

```typescript
// focusStore.ts
const filteredApps = apps.filter(app => app.bundle_id !== 'com.scheduleai.app');
```

**파일**: `schedule-ai-tauri/src/stores/focusStore.ts`

### 4. 하드코딩된 앱 목록 제거

**이전**: Spotify, Twitch 등 하드코딩된 suggestedApps 목록 존재
**이후**: 실제 실행 중인 앱 + 설치된 앱만 표시

**파일**: `schedule-ai-tauri/src/App.tsx`

### 5. 설치된 앱 목록 가져오기 기능 추가

macOS에서 `/Applications` 및 `~/Applications` 폴더를 스캔하여 설치된 앱 목록 가져오기:

```rust
// focus/mod.rs
pub fn get_installed_apps() -> Vec<RunningApp> {
    // /Applications 폴더 스캔
    // ~/Applications 폴더 스캔
    // Info.plist에서 CFBundleIdentifier 읽기
}
```

**파일**:
- `schedule-ai-tauri/src-tauri/src/focus/mod.rs`
- `schedule-ai-tauri/src-tauri/src/lib.rs`

### 6. 검색 및 블랙리스트 기능 추가

앱 목록이 너무 많아서 UI 개선:

#### 검색 기능
- 앱 이름으로 필터링
- 검색창 추가

#### 블랙리스트 저장
- 선택한 앱 목록을 localStorage에 저장
- 다음 실행 시에도 유지

#### UI 동작
- **검색어 없을 때**: 저장된 블랙리스트 + 현재 실행 중인 앱 표시
- **검색어 있을 때**: 전체 앱에서 검색
- 실행 중인 앱은 초록색 점으로 표시

**파일**:
- `schedule-ai-tauri/src/stores/focusStore.ts` - `savedBlocklist`, `addToBlocklist`, `removeFromBlocklist` 추가
- `schedule-ai-tauri/src/App.tsx` - 검색 UI 및 로직
- `schedule-ai-tauri/src/App.css` - `.focus-search`, `.focus-app-hint` 스타일
- `schedule-ai-tauri/src/i18n/locales/ko/focus.json` - 번역 추가
- `schedule-ai-tauri/src/i18n/locales/en/focus.json` - 번역 추가

### 7. 뽀모도로 타이머 기능 추가

Focus Mode에 뽀모도로 타이머 기능 추가:

#### 기능
- **타이머 모드**: 집중(25분), 짧은 휴식(5분), 긴 휴식(15분)
- **자동 전환**: 집중 완료 시 휴식으로, 휴식 완료 시 집중으로 자동 전환
- **긴 휴식 간격**: 4번째 뽀모도로마다 긴 휴식
- **타이머 컨트롤**: 시작/일시정지, 리셋, 건너뛰기
- **설정 커스터마이징**: 각 타이머 시간 설정 가능
- **알림**: 타이머 완료 시 macOS 알림 발송

#### 파일
- `schedule-ai-tauri/src/stores/focusStore.ts` - `timerMode`, `timerSeconds`, `pomodoroCount`, 타이머 액션들 추가
- `schedule-ai-tauri/src/App.tsx` - 뽀모도로 타이머 UI
- `schedule-ai-tauri/src/App.css` - `.focus-pomodoro-*` 스타일
- `schedule-ai-tauri/src/i18n/locales/ko/focus.json` - 타이머 번역
- `schedule-ai-tauri/src/i18n/locales/en/focus.json` - 타이머 번역

---

상태: 완료
우선순위: 중간
생성일: 2026-01-02
업데이트: 2026-01-02
