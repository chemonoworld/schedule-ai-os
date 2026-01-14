# 입력 모드 전환 단축키 설정

## 개요
- **상위 태스크**: [Today 탭 개선](./00_overview.md)
- **목적**: 사용자가 AI 입력 모드 전환 단축키를 커스터마이징할 수 있도록 함

## 목표
- [ ] Settings 탭에 입력 모드 전환 단축키 설정 UI 추가
- [ ] Rust 백엔드에 단축키 저장/로드 함수 추가
- [ ] 단축키 변경 시 즉시 적용

## 구현 계획

### 1단계: Rust 백엔드 함수 추가
```rust
// lib.rs에 추가

#[tauri::command]
fn get_ai_input_shortcut(app: AppHandle) -> String {
    let store = app.store("settings.json").expect("Failed to get store");
    store
        .get("ai_input_shortcut")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "shift+tab".to_string())
}

#[tauri::command]
fn set_ai_input_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let store = app.store("settings.json").expect("Failed to get store");
    store.set("ai_input_shortcut", json!(shortcut));
    store.save().map_err(|e| e.to_string())
}
```

### 2단계: Tauri 커맨드 등록
```rust
// lib.rs의 invoke_handler에 추가
.invoke_handler(tauri::generate_handler![
    // 기존 핸들러들...
    get_ai_input_shortcut,
    set_ai_input_shortcut,
])
```

### 3단계: Frontend 설정 UI
```tsx
// Settings 탭 (라인 2577 근처)에 추가

// 상태 추가
const [aiInputShortcut, setAiInputShortcut] = useState('shift+tab');
const [recordingAiShortcut, setRecordingAiShortcut] = useState(false);

// UI
<div className="settings-item">
  <label>AI 입력 모드 전환</label>
  <div className="shortcut-recorder">
    <input
      value={recordingAiShortcut ? recordedKey : aiInputShortcut}
      onFocus={() => setRecordingAiShortcut(true)}
      onKeyDown={(e) => {
        e.preventDefault();
        const keys = [];
        if (e.shiftKey) keys.push('shift');
        if (e.ctrlKey) keys.push('ctrl');
        if (e.altKey) keys.push('alt');
        if (e.metaKey) keys.push('cmd');
        if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
          keys.push(e.key.toLowerCase());
        }
        if (keys.length > 1) {
          const shortcut = keys.join('+');
          setAiInputShortcut(shortcut);
          invoke('set_ai_input_shortcut', { shortcut });
          setRecordingAiShortcut(false);
        }
      }}
      onBlur={() => setRecordingAiShortcut(false)}
      readOnly
    />
    <button onClick={() => {
      setAiInputShortcut('shift+tab');
      invoke('set_ai_input_shortcut', { shortcut: 'shift+tab' });
    }}>
      초기화
    </button>
  </div>
</div>
```

### 4단계: 단축키 핸들러 동적 적용
```tsx
// handleKeyDown 함수 수정
const checkShortcut = (e: KeyboardEvent, shortcut: string) => {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const needShift = parts.includes('shift');
  const needCtrl = parts.includes('ctrl');
  const needAlt = parts.includes('alt');
  const needCmd = parts.includes('cmd');

  return (
    e.key.toLowerCase() === key &&
    e.shiftKey === needShift &&
    e.ctrlKey === needCtrl &&
    e.altKey === needAlt &&
    e.metaKey === needCmd
  );
};

// 사용
if (checkShortcut(e, aiInputShortcut)) {
  e.preventDefault();
  setInputMode(prev => prev === 'manual' ? 'ai' : 'manual');
}
```

## 고려사항
- 기존 탭 전환 단축키와 충돌 방지
- 시스템 단축키 (Cmd+C, Cmd+V 등)와 충돌 방지
- 단축키 충돌 시 경고 메시지 표시
- 다국어 지원 (설정 라벨)

## 관련 파일
- `schedule-ai-tauri/src/App.tsx` - Settings UI (라인 2577-2614)
- `schedule-ai-tauri/src-tauri/src/lib.rs` - 단축키 저장 함수
