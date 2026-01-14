# 날짜 지남 알림 및 오늘로 이동 기능

## 개요
- **상위 태스크**: [Today 탭 개선](./00_overview.md)
- **목적**: 사용자가 과거/미래 날짜를 보고 있을 때 오늘로 빠르게 돌아올 수 있도록 함

## 목표
- [ ] 선택된 날짜가 오늘이 아닐 때 시각적 표시 추가
- [ ] "오늘로 이동" 버튼 표시
- [ ] 버튼 클릭 시 오늘 날짜로 이동 및 태스크 로드

## 구현 계획

### 1단계: UI 조건부 렌더링
```tsx
// App.tsx의 Date Navigation 영역 (라인 1920-1940)
const today = formatDate(new Date());
const isToday = selectedDate === today;

// 날짜 표시 옆에 조건부 버튼 추가
{!isToday && (
  <button
    onClick={() => {
      setSelectedDate(today);
      load(today);
    }}
    className="today-button"
  >
    오늘로 →
  </button>
)}
```

### 2단계: 스타일링
- 버튼 스타일: 작고 눈에 띄는 색상 (teal 테마 활용)
- 현재 날짜와의 차이 표시 (예: "3일 전", "내일")

### 3단계: 날짜 차이 표시 (선택적)
```tsx
const getDayDifference = (date: string) => {
  const diff = differenceInDays(new Date(date), new Date(today));
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  return diff > 0 ? `${diff}일 후` : `${Math.abs(diff)}일 전`;
};
```

## 고려사항
- 기존 날짜 네비게이션 (←, →) 버튼과 조화롭게 배치
- 모바일/작은 화면에서의 레이아웃 고려
- 다국어 지원 (한글/영어)

## 관련 파일
- `schedule-ai-tauri/src/App.tsx` - 라인 1918-1940 (Date Navigation)
- `schedule-ai-tauri/src/stores/taskStore.ts` - `setSelectedDate`, `load` 함수
