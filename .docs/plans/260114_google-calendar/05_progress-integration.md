# Progress 탭에 캘린더 이벤트 반영

## 개요
- **상위 태스크**: [Google Calendar 연동](./00_overview.md)
- **이전 단계**: [04_today-integration.md](./04_today-integration.md)
- **목적**: Progress 탭의 히트맵과 통계에 캘린더 이벤트 반영
- **상태**: 대기

## 목표
- [ ] 히트맵에 캘린더 이벤트 반영 로직 구현
- [ ] 통계에 이벤트 수 포함
- [ ] 이벤트 vs Task 구분 표시 옵션
- [ ] 날짜 클릭 시 이벤트 정보 표시

## 구현 계획

### 1. 히트맵 데이터 구조 확장

**현재 구조**:
```typescript
interface HeatmapData {
  date: string;
  level: number;          // 0-4
  completionRate: number; // Task 완료율
  taskCount: number;
}
```

**확장 구조**:
```typescript
interface HeatmapData {
  date: string;
  level: number;
  completionRate: number;
  taskCount: number;
  completedTaskCount: number;
  eventCount: number;        // 추가: 캘린더 이벤트 수
  hasEvents: boolean;        // 추가: 이벤트 존재 여부
}
```

### 2. 레벨 계산 로직 수정

**현재**: Task 완료율만 기준
```typescript
// 현재 로직
const level = Math.floor(completionRate * 4);
```

**변경**: Task 완료율 + 이벤트 참석률 고려
```typescript
function calculateLevel(data: {
  completedTaskCount: number;
  taskCount: number;
  eventCount: number;
}): number {
  const { completedTaskCount, taskCount, eventCount } = data;

  // 총 활동 = 완료된 태스크 + 참석한 이벤트(전부 참석으로 간주)
  const totalActivity = completedTaskCount + eventCount;
  const totalItems = taskCount + eventCount;

  if (totalItems === 0) return 0;

  const activityRate = totalActivity / totalItems;

  // 0-4 레벨로 변환
  if (activityRate === 0) return 0;
  if (activityRate < 0.25) return 1;
  if (activityRate < 0.5) return 2;
  if (activityRate < 0.75) return 3;
  return 4;
}
```

### 3. Progress 데이터 조회 수정

**src/db/index.ts 수정**:
```typescript
export async function getDailyProgressWithEvents(
  year: number
): Promise<HeatmapData[]> {
  const db = await getDb();

  // Task 진행률 조회 (기존)
  const taskProgress = await db.select<DailyProgress[]>(`
    SELECT
      scheduled_date as date,
      COUNT(*) as taskCount,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedTaskCount
    FROM tasks
    WHERE strftime('%Y', scheduled_date) = ?
    GROUP BY scheduled_date
  `, [year.toString()]);

  // 캘린더 이벤트 수 조회
  const eventCounts = await db.select<{ date: string; eventCount: number }[]>(`
    SELECT
      date(start_time) as date,
      COUNT(*) as eventCount
    FROM calendar_events
    WHERE strftime('%Y', start_time) = ?
      AND status != 'cancelled'
    GROUP BY date(start_time)
  `, [year.toString()]);

  // 두 데이터 병합
  const dateMap = new Map<string, HeatmapData>();

  for (const task of taskProgress) {
    dateMap.set(task.date, {
      date: task.date,
      taskCount: task.taskCount,
      completedTaskCount: task.completedTaskCount,
      eventCount: 0,
      hasEvents: false,
      completionRate: task.completedTaskCount / task.taskCount,
      level: 0
    });
  }

  for (const event of eventCounts) {
    const existing = dateMap.get(event.date);
    if (existing) {
      existing.eventCount = event.eventCount;
      existing.hasEvents = true;
    } else {
      dateMap.set(event.date, {
        date: event.date,
        taskCount: 0,
        completedTaskCount: 0,
        eventCount: event.eventCount,
        hasEvents: true,
        completionRate: 0,
        level: 0
      });
    }
  }

  // 레벨 계산
  const result = Array.from(dateMap.values()).map(data => ({
    ...data,
    level: calculateLevel(data)
  }));

  return result;
}
```

### 4. 히트맵 셀 UI 수정

**App.tsx Progress 탭**:
```tsx
function HeatmapCell({ data }: { data: HeatmapData }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`heatmap-cell level-${data.level}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => navigateToDate(data.date)}
    >
      {/* 이벤트가 있으면 작은 점 표시 */}
      {data.hasEvents && <div className="event-indicator" />}

      {showTooltip && (
        <div className="heatmap-tooltip">
          <div className="tooltip-date">{formatDate(data.date)}</div>
          <div className="tooltip-stats">
            <span>📋 {data.completedTaskCount}/{data.taskCount} tasks</span>
            {data.eventCount > 0 && (
              <span>📅 {data.eventCount} events</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 5. 통계 섹션 수정

**현재 통계**:
- 활동 일수
- 총 태스크
- 달성률

**확장 통계**:
```tsx
function ProgressStats({ year }: { year: number }) {
  const stats = useProgressStats(year);

  return (
    <div className="progress-stats">
      <div className="stat-card">
        <span className="stat-value">{stats.activeDays}</span>
        <span className="stat-label">{t('progress.activeDays')}</span>
      </div>

      <div className="stat-card">
        <span className="stat-value">{stats.totalTasks}</span>
        <span className="stat-label">{t('progress.totalTasks')}</span>
      </div>

      <div className="stat-card">
        <span className="stat-value">{stats.completionRate}%</span>
        <span className="stat-label">{t('progress.completionRate')}</span>
      </div>

      {/* 새로운 통계 */}
      <div className="stat-card">
        <span className="stat-value">{stats.totalEvents}</span>
        <span className="stat-label">{t('progress.totalEvents')}</span>
      </div>
    </div>
  );
}
```

### 6. CSS 스타일

**App.css 추가**:
```css
/* 이벤트 인디케이터 */
.heatmap-cell {
  position: relative;
}

.event-indicator {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  background: var(--google-blue, #4285f4);
  border-radius: 50%;
}

/* 히트맵 툴팁 */
.heatmap-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  white-space: nowrap;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tooltip-date {
  font-weight: 600;
  margin-bottom: 4px;
}

.tooltip-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}
```

## 고려사항

### 히트맵 색상 의미
- **기존**: Task 완료율만 반영
- **변경**: Task 완료 + Event 참석 종합 반영
- Event는 "참석함"으로 간주 (완료/미완료 개념 없음)

### 옵션 제공
- Settings에서 "캘린더 이벤트를 Progress에 포함" 토글
- 기본값: 포함

### 성능
- 연간 데이터 조회 시 JOIN으로 한 번에 가져오기
- 캐싱으로 반복 조회 최소화

## 관련 파일
- `/src/App.tsx` - Progress 탭 UI
- `/src/App.css` - 스타일
- `/src/db/index.ts` - 데이터 조회
- `/src-tauri/src/progress/mod.rs` - Rust 커맨드

## 다음 단계

이 서브태스크 완료 후:
1. [06_settings-management.md](./06_settings-management.md) - Settings에서 연동 관리
