# AI 기반 태스크 작성 기능

## 개요
- **상위 태스크**: [Today 탭 개선](./00_overview.md)
- **목적**: 자연어 입력을 AI가 파싱하여 구조화된 태스크 자동 생성

## 목표
- [ ] AI 입력 모드 토글 UI 추가
- [ ] Shift+Tab으로 일반 ↔ AI 모드 전환
- [ ] 자연어 입력 → 구조화된 태스크 변환
- [ ] AI 파싱 결과 미리보기 및 확인

## 구현 계획

### 1단계: 입력 모드 상태 관리
```tsx
// App.tsx에 상태 추가
const [inputMode, setInputMode] = useState<'manual' | 'ai'>('manual');
const [aiInputShortcut, setAiInputShortcut] = useState('shift+tab');
```

### 2단계: 단축키 핸들러 추가
```tsx
// handleKeyDown에 추가 (라인 1116 근처)
if (e.shiftKey && e.key === 'Tab') {
  e.preventDefault();
  setInputMode(prev => prev === 'manual' ? 'ai' : 'manual');
}
```

### 3단계: AI 입력 UI
```tsx
// Add Task Form 영역 (라인 2016-2028)
<form onSubmit={inputMode === 'manual' ? handleCreateTask : handleAICreateTask}>
  <div className="input-mode-indicator">
    {inputMode === 'ai' ? '🤖 AI' : '✏️ Manual'}
  </div>
  <input
    type="text"
    placeholder={inputMode === 'ai'
      ? "예: 내일 오후 3시 카페에서 미팅, 준비물 챙기기"
      : "새 태스크 추가..."}
    value={newTaskTitle}
    onChange={(e) => setNewTaskTitle(e.target.value)}
  />
</form>
```

### 4단계: AI 파싱 함수
```tsx
const handleAICreateTask = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newTaskTitle.trim()) return;

  try {
    // LLM 클라이언트를 통해 파싱 요청
    const parsed = await parseTaskWithAI(newTaskTitle);

    // 파싱 결과:
    // {
    //   title: "카페에서 미팅",
    //   scheduledDate: "2026-01-15",
    //   scheduledTime: "15:00",
    //   location: "카페",
    //   subtasks: ["준비물 챙기기"]
    // }

    // 태스크 생성
    await createTaskWithSubtasks(parsed);
    setNewTaskTitle('');
  } catch (error) {
    console.error('AI parsing failed:', error);
  }
};
```

### 5단계: LLM 프롬프트 설계
```
시스템 프롬프트:
당신은 태스크 파싱 전문가입니다. 사용자의 자연어 입력을 다음 JSON 형식으로 변환하세요:

{
  "title": "태스크 제목",
  "scheduledDate": "YYYY-MM-DD (없으면 오늘)",
  "scheduledTime": "HH:MM (없으면 null)",
  "location": "장소 (없으면 null)",
  "subtasks": ["서브태스크1", "서브태스크2"],
  "priority": 0-3 (기본값 0)
}

오늘 날짜: ${today}
```

## 고려사항
- AI 호출 중 로딩 상태 표시
- 파싱 실패 시 폴백 (일반 태스크로 생성)
- API 비용 최소화 (간단한 입력은 로컬 파싱 시도)
- 오프라인 모드 대응

## 관련 파일
- `schedule-ai-tauri/src/App.tsx` - 태스크 입력 폼
- `packages/llm-client/` - LLM 클라이언트
- `schedule-ai-tauri/src/db/index.ts` - `createTask` 함수 확장 필요
