# Focus → Today 탭 이동 시 날짜 미갱신

## 증상

Focus 모드에서 "Today's Tasks" 섹션 클릭 시 Today 탭으로 이동하면:
- 태스크 목록은 오늘 날짜 기준으로 로드됨
- 상단 날짜 표시는 이전에 선택한 날짜 그대로 유지됨

## 원인

`onNavigateToToday` 콜백에서 `setActiveTab('today')`만 호출하고 `setSelectedDate`를 오늘로 설정하지 않음.

**수정 전:**
```tsx
<FocusView onNavigateToToday={() => setActiveTab('today')} />
```

## 해결

`setSelectedDate(formatDate(new Date()))`를 추가하여 오늘 날짜로 설정.

**수정 후:**
```tsx
<FocusView onNavigateToToday={() => {
  setSelectedDate(formatDate(new Date()));
  setActiveTab('today');
}} />
```

## 수정 파일

- `src/App.tsx` (line ~2059)

---

수정일: 2026-01-01
