# 탭 전환 키보드 단축키

## 기능 설명

키보드 단축키로 앱의 탭을 빠르게 전환할 수 있습니다.

### 기본 단축키

| 탭 | macOS | Windows/Linux |
|-----|-------|---------------|
| Today | `Cmd + 1` | `Ctrl + 1` |
| Focus | `Cmd + 2` | `Ctrl + 2` |
| Plans | `Cmd + 3` | `Ctrl + 3` |
| Progress | `Cmd + 4` | `Ctrl + 4` |
| Settings | `Cmd + 5` | `Ctrl + 5` |

## 단축키 커스터마이징

Settings > Global Shortcut > Tab Shortcuts에서 각 탭의 단축키를 변경할 수 있습니다.

1. 변경하고 싶은 탭의 버튼 클릭
2. 원하는 키 입력 (예: `A`, `B`, `1`, `F1` 등)
3. 설정이 자동 저장됨

변경 후에는 `Cmd/Ctrl + 설정한 키`로 탭 전환이 가능합니다.

## 구현 위치

- **Rust 백엔드**: `schedule-ai-tauri/src-tauri/src/lib.rs`
  - `get_tab_shortcuts`: 저장된 단축키 로드
  - `set_tab_shortcuts`: 단축키 저장
- **프론트엔드**: `schedule-ai-tauri/src/App.tsx`
  - 탭 전환 useEffect (1112-1141줄)
  - 탭 단축키 레코딩 useEffect (1143-1180줄)
- **UI**: Settings 탭 내 Tab Shortcuts 섹션
- **CSS**: `schedule-ai-tauri/src/App.css` (1117-1182줄)
- **번역**: `src/i18n/locales/{en,ko}/settings.json`

## 구현 세부사항

### 플랫폼 감지

```typescript
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modifierPressed = isMac ? e.metaKey : e.ctrlKey;
```

- macOS: `metaKey` (Command 키)
- Windows/Linux: `ctrlKey` (Control 키)

### 커스텀 단축키 매칭

```typescript
const pressedKey = e.key.toUpperCase();
const tabIndex = tabShortcuts.findIndex(s => s.toUpperCase() === pressedKey);
if (tabIndex !== -1) {
  e.preventDefault();
  setActiveTab(tabs[tabIndex]);
}
```

### 입력 필드 예외 처리

텍스트 입력 중에는 단축키가 비활성화됩니다:

```typescript
const target = e.target as HTMLElement;
if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
  return;
}
```

### 단축키 레코딩 충돌 방지

Settings에서 단축키를 레코딩 중일 때는 탭 전환 단축키가 무시됩니다:

```typescript
if (isRecordingShortcut || recordingTabIndex !== null) return;
```

## 데이터 저장

단축키는 Tauri Store를 통해 `settings.json`에 저장됩니다:

```json
{
  "tab_shortcuts": ["1", "2", "3", "4", "5"]
}
```

## 탭 순서

탭 순서는 UI에 표시되는 순서와 동일합니다:

1. Today (오늘 할 일)
2. Focus (집중 모드)
3. Plans (계획)
4. Progress (진행 현황)
5. Settings (설정)

## 알려진 제한사항

- 숫자 키패드의 숫자는 지원하지 않을 수 있음 (브라우저/OS에 따라 다름)
- 일부 시스템에서 `Ctrl + 숫자` 조합이 다른 앱에 의해 선점될 수 있음
- 같은 키를 여러 탭에 할당하면 첫 번째 탭만 전환됨
