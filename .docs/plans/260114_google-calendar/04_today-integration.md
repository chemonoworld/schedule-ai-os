# Today 탭에 캘린더 이벤트 표시

## 개요
- **상위 태스크**: [Google Calendar 연동](./00_overview.md)
- **이전 단계**: [03_desktop-integration.md](./03_desktop-integration.md)
- **목적**: Today 탭에서 Task와 캘린더 이벤트를 함께 표시
- **상태**: 대기

## 목표
- [ ] 캘린더 이벤트 UI 컴포넌트 구현
- [ ] Task와 이벤트 통합 타임라인 구현
- [ ] 시간대별 정렬 로직 구현
- [ ] 이벤트 상세 정보 표시 (클릭 시)
- [ ] 이벤트/태스크 구분 UI 구현

## 구현 계획

### 1. 통합 아이템 타입 정의

**src/types/timeline.ts (신규)**:
```typescript
export type TimelineItemType = 'task' | 'event';

export interface TimelineItem {
  type: TimelineItemType;
  id: string;
  title: string;
  startTime?: string;      // HH:mm
  endTime?: string;        // HH:mm (이벤트만)
  isAllDay: boolean;
  data: Task | CalendarEvent;
}

// Task와 Event를 TimelineItem으로 변환하는 유틸
export function toTimelineItems(
  tasks: Task[],
  events: CalendarEvent[]
): TimelineItem[] {
  const taskItems: TimelineItem[] = tasks.map(task => ({
    type: 'task',
    id: task.id,
    title: task.title,
    startTime: task.scheduledTime,
    isAllDay: !task.scheduledTime,
    data: task
  }));

  const eventItems: TimelineItem[] = events.map(event => ({
    type: 'event',
    id: event.id,
    title: event.title,
    startTime: event.startTime.split('T')[1]?.slice(0, 5),
    endTime: event.endTime.split('T')[1]?.slice(0, 5),
    isAllDay: event.isAllDay,
    data: event
  }));

  // 시간순 정렬 (시간 없는 항목은 맨 위)
  return [...taskItems, ...eventItems].sort((a, b) => {
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;
    if (!a.startTime || !b.startTime) return 0;
    return a.startTime.localeCompare(b.startTime);
  });
}
```

### 2. 캘린더 이벤트 컴포넌트

**App.tsx에 추가할 컴포넌트**:
```tsx
interface CalendarEventCardProps {
  event: CalendarEvent;
  onClick?: () => void;
}

function CalendarEventCard({ event, onClick }: CalendarEventCardProps) {
  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  return (
    <div
      className="calendar-event-card"
      onClick={onClick}
      style={{
        borderLeft: `4px solid ${event.colorId || '#4285f4'}`,
      }}
    >
      <div className="event-header">
        <span className="event-icon">📅</span>
        <span className="event-title">{event.title}</span>
      </div>

      <div className="event-time">
        {event.isAllDay ? (
          <span className="all-day-badge">{t('common.allDay')}</span>
        ) : (
          <span>
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </span>
        )}
      </div>

      {event.location && (
        <div className="event-location">
          <span className="location-icon">📍</span>
          {event.location}
        </div>
      )}
    </div>
  );
}
```

### 3. Today 탭 UI 수정

**App.tsx Today 탭 섹션 수정**:
```tsx
// Today 탭 내부
const { events, getEventsForDate, isConnected } = useCalendarStore();
const { tasks } = useTaskStore();

// 현재 날짜의 이벤트와 태스크를 통합
const todayEvents = getEventsForDate(selectedDate);
const timelineItems = useMemo(
  () => toTimelineItems(tasks, todayEvents),
  [tasks, todayEvents]
);

return (
  <div className="today-content">
    {/* 날짜 네비게이션 (기존) */}
    <DateNavigation ... />

    {/* 진행률 바 (기존) */}
    <ProgressBar ... />

    {/* 통합 타임라인 */}
    <div className="timeline-container">
      {/* 종일 이벤트 섹션 */}
      {timelineItems.filter(item => item.isAllDay).length > 0 && (
        <div className="all-day-section">
          <h4 className="section-title">{t('today.allDay')}</h4>
          {timelineItems
            .filter(item => item.isAllDay)
            .map(item => (
              item.type === 'event' ? (
                <CalendarEventCard
                  key={item.id}
                  event={item.data as CalendarEvent}
                />
              ) : (
                <SwipeableTask
                  key={item.id}
                  task={item.data as Task}
                />
              )
            ))}
        </div>
      )}

      {/* 시간대별 이벤트 & 태스크 */}
      <div className="timed-items-section">
        {timelineItems
          .filter(item => !item.isAllDay)
          .map(item => (
            item.type === 'event' ? (
              <CalendarEventCard
                key={item.id}
                event={item.data as CalendarEvent}
              />
            ) : (
              <SwipeableTask
                key={item.id}
                task={item.data as Task}
              />
            )
          ))}
      </div>

      {/* 시간 미지정 태스크 */}
      <div className="unscheduled-section">
        <h4 className="section-title">{t('today.unscheduled')}</h4>
        {tasks
          .filter(task => !task.scheduledTime)
          .map(task => (
            <SwipeableTask key={task.id} task={task} />
          ))}
      </div>
    </div>

    {/* 태스크 추가 폼 (기존) */}
    <TaskAddForm ... />
  </div>
);
```

### 4. CSS 스타일

**App.css 추가**:
```css
/* 캘린더 이벤트 카드 */
.calendar-event-card {
  background: var(--surface-secondary);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.calendar-event-card:hover {
  background: var(--surface-hover);
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.event-icon {
  font-size: 14px;
  opacity: 0.8;
}

.event-title {
  font-weight: 500;
  color: var(--text-primary);
}

.event-time {
  font-size: 13px;
  color: var(--text-secondary);
  margin-left: 22px;
}

.all-day-badge {
  background: var(--accent-subtle);
  color: var(--accent);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.event-location {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 22px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 섹션 구분 */
.all-day-section,
.timed-items-section,
.unscheduled-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  padding-left: 4px;
}

/* Task와 Event 구분 */
.calendar-event-card {
  position: relative;
}

.calendar-event-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--google-blue, #4285f4);
  border-radius: 4px 0 0 4px;
}
```

### 5. 이벤트 상세 팝업

```tsx
function EventDetailPopup({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return (
    <div className="event-detail-popup">
      <div className="popup-header">
        <h3>{event.title}</h3>
        <button onClick={onClose}>✕</button>
      </div>

      <div className="popup-content">
        <div className="detail-row">
          <span className="icon">🕐</span>
          <span>
            {event.isAllDay
              ? t('common.allDay')
              : `${formatTime(event.startTime)} - ${formatTime(event.endTime)}`
            }
          </span>
        </div>

        {event.location && (
          <div className="detail-row">
            <span className="icon">📍</span>
            <span>{event.location}</span>
          </div>
        )}

        {event.description && (
          <div className="detail-row description">
            <p>{event.description}</p>
          </div>
        )}

        <a
          href={event.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          className="open-in-google"
        >
          Google Calendar에서 열기 →
        </a>
      </div>
    </div>
  );
}
```

### 6. 날짜 변경 시 자동 동기화

```tsx
// useEffect로 날짜 변경 감지
useEffect(() => {
  const { isConnected, syncEvents } = useCalendarStore.getState();

  if (isConnected) {
    // 현재 날짜 기준 ±1일 동기화
    const prevDay = addDays(selectedDate, -1);
    const nextDay = addDays(selectedDate, 1);
    syncEvents(prevDay, nextDay);
  }
}, [selectedDate]);
```

## UI/UX 고려사항

### 시각적 구분
- **Task**: 체크박스 + 스와이프 가능
- **Event**: 캘린더 아이콘 + 왼쪽 색상 바 + 스와이프 불가
- 색상으로 구분 (Event는 Google Calendar 색상 사용)

### 인터랙션
- Event 클릭 → 상세 팝업
- Task 스와이프 → 완료/삭제 (기존 동작)
- Event는 읽기 전용 (Google Calendar에서 수정)

### 반응형
- 모바일에서도 자연스러운 레이아웃
- 긴 제목 말줄임표 처리

### 접근성
- 키보드 네비게이션 지원
- 스크린 리더 레이블

## 관련 파일
- `/src/App.tsx` - Today 탭 UI
- `/src/App.css` - 스타일
- `/src/types/timeline.ts` - 타입 정의 (신규)
- `/src/stores/calendarStore.ts` - 캘린더 상태
- `/src/i18n/` - 다국어 문자열 추가

## 다음 단계

이 서브태스크 완료 후:
1. [05_progress-integration.md](./05_progress-integration.md) - Progress 탭에 캘린더 이벤트 반영
