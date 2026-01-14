# Desktop 단위 테스트

## 개요
- **상위 태스크**: [Google Calendar 테스트](./00_overview.md)
- **목적**: Desktop 앱의 Store, Hook, 유틸리티 단위 테스트 작성
- **상태**: 대기

## 목표
- [ ] calendarStore 테스트
- [ ] calendarApi 테스트
- [ ] timeline.ts 유틸리티 테스트
- [ ] useDeepLink 훅 테스트

## 구현 계획

### 1. 테스트 환경 설정

**vitest.config.ts**:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

**src/test/setup.ts**:
```typescript
import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// 각 테스트 후 정리
afterEach(() => {
  cleanup();
});

// Tauri API 모킹
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: vi.fn(),
}));
```

### 2. calendarStore 테스트

**src/stores/calendarStore.test.ts**:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCalendarStore } from './calendarStore';
import { calendarApi } from '../services/calendarApi';

// API 모킹
vi.mock('../services/calendarApi', () => ({
  calendarApi: {
    getConnectionStatus: vi.fn(),
    listCalendars: vi.fn(),
    selectCalendars: vi.fn(),
    listEvents: vi.fn(),
    disconnect: vi.fn(),
    getOAuthUrl: vi.fn(),
  },
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
}));

describe('calendarStore', () => {
  beforeEach(() => {
    // 스토어 상태 초기화
    useCalendarStore.setState({
      isConnected: false,
      userEmail: null,
      isLoading: false,
      error: null,
      calendars: [],
      selectedCalendarIds: [],
      events: [],
      lastSyncAt: null,
      syncMode: 'auto',
    });
    vi.clearAllMocks();
  });

  describe('checkConnection', () => {
    it('should set connected state when token exists', async () => {
      // Given
      vi.mocked(calendarApi.getConnectionStatus).mockResolvedValue({
        isConnected: true,
        email: 'test@example.com',
      });

      // When
      await useCalendarStore.getState().checkConnection();

      // Then
      const state = useCalendarStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.userEmail).toBe('test@example.com');
    });

    it('should set disconnected state when no token', async () => {
      // Given: getAccessToken returns null
      vi.mocked(getAccessToken).mockReturnValue(null);

      // When
      await useCalendarStore.getState().checkConnection();

      // Then
      const state = useCalendarStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.userEmail).toBeNull();
    });
  });

  describe('syncCalendars', () => {
    it('should fetch and store calendars', async () => {
      // Given
      useCalendarStore.setState({ isConnected: true });
      vi.mocked(calendarApi.listCalendars).mockResolvedValue({
        calendars: [
          { id: 'primary', summary: '기본', isPrimary: true, isSelected: true },
          { id: 'work', summary: '업무', isPrimary: false, isSelected: false },
        ],
      });

      // When
      await useCalendarStore.getState().syncCalendars();

      // Then
      const state = useCalendarStore.getState();
      expect(state.calendars).toHaveLength(2);
      expect(state.calendars[0].id).toBe('primary');
    });

    it('should not fetch when not connected', async () => {
      // Given
      useCalendarStore.setState({ isConnected: false });

      // When
      await useCalendarStore.getState().syncCalendars();

      // Then
      expect(calendarApi.listCalendars).not.toHaveBeenCalled();
    });
  });

  describe('syncEvents', () => {
    it('should fetch and store events for date range', async () => {
      // Given
      useCalendarStore.setState({ isConnected: true });
      vi.mocked(calendarApi.listEvents).mockResolvedValue({
        events: [
          {
            id: 'event1',
            title: '미팅',
            startTime: '2026-01-14T10:00:00Z',
            endTime: '2026-01-14T11:00:00Z',
            isAllDay: false,
            status: 'confirmed',
          },
        ],
        syncedAt: '2026-01-14T09:00:00Z',
      });

      // When
      await useCalendarStore.getState().syncEvents('2026-01-14', '2026-01-14');

      // Then
      const state = useCalendarStore.getState();
      expect(state.events).toHaveLength(1);
      expect(state.lastSyncAt).toBe('2026-01-14T09:00:00Z');
    });
  });

  describe('toggleCalendarSelection', () => {
    it('should add calendar to selection', async () => {
      // Given
      useCalendarStore.setState({
        selectedCalendarIds: ['primary'],
        calendars: [
          { id: 'primary', isSelected: true },
          { id: 'work', isSelected: false },
        ],
      });
      vi.mocked(calendarApi.selectCalendars).mockResolvedValue({ success: true });

      // When
      await useCalendarStore.getState().toggleCalendarSelection('work');

      // Then
      const state = useCalendarStore.getState();
      expect(state.selectedCalendarIds).toContain('work');
    });

    it('should remove calendar from selection', async () => {
      // Given
      useCalendarStore.setState({
        selectedCalendarIds: ['primary', 'work'],
        calendars: [
          { id: 'primary', isSelected: true },
          { id: 'work', isSelected: true },
        ],
      });
      vi.mocked(calendarApi.selectCalendars).mockResolvedValue({ success: true });

      // When
      await useCalendarStore.getState().toggleCalendarSelection('work');

      // Then
      const state = useCalendarStore.getState();
      expect(state.selectedCalendarIds).not.toContain('work');
    });
  });

  describe('getEventsForDate', () => {
    it('should filter events by date', () => {
      // Given
      useCalendarStore.setState({
        events: [
          { id: '1', startTime: '2026-01-14T10:00:00Z', status: 'confirmed' },
          { id: '2', startTime: '2026-01-15T10:00:00Z', status: 'confirmed' },
          { id: '3', startTime: '2026-01-14T14:00:00Z', status: 'confirmed' },
        ],
      });

      // When
      const events = useCalendarStore.getState().getEventsForDate('2026-01-14');

      // Then
      expect(events).toHaveLength(2);
      expect(events.map(e => e.id)).toEqual(['1', '3']);
    });
  });

  describe('getEventCountsByDate', () => {
    it('should count events by date', () => {
      // Given
      useCalendarStore.setState({
        events: [
          { id: '1', startTime: '2026-01-14T10:00:00Z', status: 'confirmed' },
          { id: '2', startTime: '2026-01-14T14:00:00Z', status: 'confirmed' },
          { id: '3', startTime: '2026-01-15T10:00:00Z', status: 'confirmed' },
        ],
      });

      // When
      const counts = useCalendarStore.getState().getEventCountsByDate();

      // Then
      expect(counts.get('2026-01-14')).toBe(2);
      expect(counts.get('2026-01-15')).toBe(1);
    });

    it('should exclude cancelled events', () => {
      // Given
      useCalendarStore.setState({
        events: [
          { id: '1', startTime: '2026-01-14T10:00:00Z', status: 'confirmed' },
          { id: '2', startTime: '2026-01-14T14:00:00Z', status: 'cancelled' },
        ],
      });

      // When
      const counts = useCalendarStore.getState().getEventCountsByDate();

      // Then
      expect(counts.get('2026-01-14')).toBe(1);
    });
  });

  describe('handleOAuthSuccess', () => {
    it('should refresh connection and calendars', async () => {
      // Given
      vi.mocked(calendarApi.getConnectionStatus).mockResolvedValue({
        isConnected: true,
        email: 'test@example.com',
      });
      vi.mocked(calendarApi.listCalendars).mockResolvedValue({
        calendars: [],
      });

      // When
      await useCalendarStore.getState().handleOAuthSuccess();

      // Then
      expect(calendarApi.getConnectionStatus).toHaveBeenCalled();
      expect(calendarApi.listCalendars).toHaveBeenCalled();
    });
  });

  describe('handleOAuthError', () => {
    it('should set error state', () => {
      // When
      useCalendarStore.getState().handleOAuthError('Authentication failed');

      // Then
      const state = useCalendarStore.getState();
      expect(state.error).toBe('Authentication failed');
      expect(state.isLoading).toBe(false);
    });
  });
});
```

### 3. timeline.ts 유틸리티 테스트

**src/types/timeline.test.ts**:
```typescript
import { describe, it, expect } from 'vitest';
import { toTimelineItems, isCalendarEvent, isTask } from './timeline';
import type { Task } from '@schedule-ai/core';
import type { CalendarEvent } from '../stores/calendarStore';

describe('timeline utilities', () => {
  describe('toTimelineItems', () => {
    it('should convert tasks to timeline items', () => {
      // Given
      const tasks: Task[] = [
        {
          id: 'task1',
          title: '업무 처리',
          scheduledTime: '10:00',
          endTime: '11:00',
          status: 'pending',
        },
      ];

      // When
      const items = toTimelineItems(tasks, []);

      // Then
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('task');
      expect(items[0].title).toBe('업무 처리');
      expect(items[0].isAllDay).toBe(false);
    });

    it('should convert events to timeline items', () => {
      // Given
      const events: CalendarEvent[] = [
        {
          id: 'event1',
          title: '팀 미팅',
          startTime: '2026-01-14T10:00:00Z',
          endTime: '2026-01-14T11:00:00Z',
          isAllDay: false,
          status: 'confirmed',
        },
      ];

      // When
      const items = toTimelineItems([], events);

      // Then
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('event');
      expect(items[0].title).toBe('팀 미팅');
    });

    it('should sort items by start time', () => {
      // Given
      const tasks: Task[] = [
        { id: 'task1', title: 'Task', scheduledTime: '14:00' },
      ];
      const events: CalendarEvent[] = [
        { id: 'event1', title: 'Event', startTime: '2026-01-14T10:00:00Z', isAllDay: false },
      ];

      // When
      const items = toTimelineItems(tasks, events);

      // Then
      expect(items[0].title).toBe('Event');  // 10:00
      expect(items[1].title).toBe('Task');   // 14:00
    });

    it('should handle all-day events', () => {
      // Given
      const events: CalendarEvent[] = [
        { id: 'event1', title: 'Holiday', isAllDay: true, startTime: '2026-01-14' },
      ];

      // When
      const items = toTimelineItems([], events);

      // Then
      expect(items[0].isAllDay).toBe(true);
    });

    it('should handle tasks without scheduled time', () => {
      // Given
      const tasks: Task[] = [
        { id: 'task1', title: 'Unscheduled Task', scheduledTime: null },
      ];

      // When
      const items = toTimelineItems(tasks, []);

      // Then
      expect(items[0].startTime).toBeUndefined();
    });
  });

  describe('isCalendarEvent', () => {
    it('should return true for calendar event', () => {
      const event: CalendarEvent = {
        id: 'event1',
        calendarId: 'primary',
        title: 'Meeting',
        isAllDay: false,
        status: 'confirmed',
      };

      expect(isCalendarEvent(event)).toBe(true);
    });

    it('should return false for task', () => {
      const task: Task = {
        id: 'task1',
        title: 'Task',
        status: 'pending',
      };

      expect(isCalendarEvent(task)).toBe(false);
    });
  });

  describe('isTask', () => {
    it('should return true for task', () => {
      const task: Task = {
        id: 'task1',
        title: 'Task',
        status: 'pending',
      };

      expect(isTask(task)).toBe(true);
    });

    it('should return false for calendar event', () => {
      const event: CalendarEvent = {
        id: 'event1',
        calendarId: 'primary',
        title: 'Meeting',
        status: 'confirmed',
      };

      expect(isTask(event)).toBe(false);
    });
  });
});
```

### 4. useDeepLink 훅 테스트

**src/hooks/useDeepLink.test.ts**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDeepLink } from './useDeepLink';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { useCalendarStore } from '../stores/calendarStore';

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: vi.fn(),
}));

describe('useDeepLink', () => {
  let mockUnlisten: vi.Mock;

  beforeEach(() => {
    mockUnlisten = vi.fn();
    vi.mocked(onOpenUrl).mockResolvedValue(mockUnlisten);

    // 스토어 초기화
    useCalendarStore.setState({
      isLoading: false,
      error: null,
    });
  });

  it('should register deep link listener on mount', async () => {
    // When
    renderHook(() => useDeepLink());

    // Then
    expect(onOpenUrl).toHaveBeenCalled();
  });

  it('should unregister listener on unmount', async () => {
    // When
    const { unmount } = renderHook(() => useDeepLink());
    unmount();

    // Then (비동기로 실행되므로 약간의 대기 필요)
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it('should handle success deep link', async () => {
    // Given
    let deepLinkCallback: ((urls: string[]) => void) | null = null;
    vi.mocked(onOpenUrl).mockImplementation(async (cb) => {
      deepLinkCallback = cb;
      return mockUnlisten;
    });

    const handleOAuthSuccess = vi.fn();
    useCalendarStore.setState({ handleOAuthSuccess });

    // When
    renderHook(() => useDeepLink());
    await new Promise(resolve => setTimeout(resolve, 10));

    // Simulate deep link
    deepLinkCallback?.(['scheduleai://auth/calendar/success']);

    // Then
    expect(useCalendarStore.getState().isLoading).toBe(false);
  });

  it('should handle error deep link', async () => {
    // Given
    let deepLinkCallback: ((urls: string[]) => void) | null = null;
    vi.mocked(onOpenUrl).mockImplementation(async (cb) => {
      deepLinkCallback = cb;
      return mockUnlisten;
    });

    // When
    renderHook(() => useDeepLink());
    await new Promise(resolve => setTimeout(resolve, 10));

    // Simulate error deep link
    deepLinkCallback?.(['scheduleai://auth/calendar/error?message=access_denied']);

    // Then
    expect(useCalendarStore.getState().error).toBe('access_denied');
  });
});
```

## 의존성

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "happy-dom": "^15.0.0"
  }
}
```

## 고려사항

### Tauri API 모킹
- `@tauri-apps/api/*` 모듈들은 모두 모킹 필요
- `vi.mock()`을 사용하여 전역 모킹

### Zustand 스토어 테스트
- `useStore.setState()`로 상태 직접 설정
- `useStore.getState()`로 상태 검증

### 비동기 테스트
- `async/await` 사용
- `vi.waitFor()` 또는 `setTimeout` 활용

## 관련 파일
- `src/stores/calendarStore.ts`
- `src/services/calendarApi.ts`
- `src/types/timeline.ts`
- `src/hooks/useDeepLink.ts`
