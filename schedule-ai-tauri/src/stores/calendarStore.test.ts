import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCalendarStore } from './calendarStore';

// calendarApi 모킹
vi.mock('../services/calendarApi', () => ({
  calendarApi: {
    getConnectionStatus: vi.fn(),
    listCalendars: vi.fn(),
    selectCalendars: vi.fn(),
    listEvents: vi.fn(),
    disconnect: vi.fn(),
    getOAuthUrl: vi.fn(() => 'http://localhost:3000/api/auth/google/calendar'),
  },
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
}));

// openUrl 모킹
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

import { calendarApi, getAccessToken } from '../services/calendarApi';

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
    it('should set connected state when API returns connected', async () => {
      vi.mocked(getAccessToken).mockReturnValue('test-token');
      vi.mocked(calendarApi.getConnectionStatus).mockResolvedValue({
        isConnected: true,
        email: 'test@example.com',
        expiresAt: '2026-01-15T00:00:00Z',
      });

      await useCalendarStore.getState().checkConnection();

      const state = useCalendarStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.userEmail).toBe('test@example.com');
    });

    it('should set disconnected state when no token', async () => {
      vi.mocked(getAccessToken).mockReturnValue(null);

      await useCalendarStore.getState().checkConnection();

      const state = useCalendarStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.userEmail).toBeNull();
      expect(calendarApi.getConnectionStatus).not.toHaveBeenCalled();
    });

    it('should handle API error gracefully', async () => {
      vi.mocked(getAccessToken).mockReturnValue('test-token');
      vi.mocked(calendarApi.getConnectionStatus).mockRejectedValue(
        new Error('Network error')
      );

      await useCalendarStore.getState().checkConnection();

      const state = useCalendarStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.userEmail).toBeNull();
    });
  });

  describe('syncCalendars', () => {
    it('should fetch and store calendars when connected', async () => {
      useCalendarStore.setState({ isConnected: true });
      vi.mocked(calendarApi.listCalendars).mockResolvedValue({
        calendars: [
          {
            id: 'primary',
            summary: '기본 캘린더',
            description: null,
            backgroundColor: '#4285f4',
            isPrimary: true,
            isSelected: true,
          },
          {
            id: 'work',
            summary: '업무',
            description: null,
            backgroundColor: '#16a765',
            isPrimary: false,
            isSelected: false,
          },
        ],
      });

      await useCalendarStore.getState().syncCalendars();

      const state = useCalendarStore.getState();
      expect(state.calendars).toHaveLength(2);
      expect(state.calendars[0].id).toBe('primary');
      expect(state.calendars[0].isPrimary).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should not fetch when not connected', async () => {
      useCalendarStore.setState({ isConnected: false });

      await useCalendarStore.getState().syncCalendars();

      expect(calendarApi.listCalendars).not.toHaveBeenCalled();
    });

    it('should set error on API failure', async () => {
      useCalendarStore.setState({ isConnected: true });
      vi.mocked(calendarApi.listCalendars).mockRejectedValue(
        new Error('Fetch failed')
      );

      await useCalendarStore.getState().syncCalendars();

      const state = useCalendarStore.getState();
      expect(state.error).toBe('Fetch failed');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('syncEvents', () => {
    it('should fetch and store events for date range', async () => {
      useCalendarStore.setState({ isConnected: true });
      vi.mocked(calendarApi.listEvents).mockResolvedValue({
        events: [
          {
            id: 'event1',
            calendarId: 'primary',
            title: '팀 미팅',
            description: null,
            location: '회의실 A',
            startTime: '2026-01-14T10:00:00+09:00',
            endTime: '2026-01-14T11:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            colorId: null,
            htmlLink: null,
          },
        ],
        syncedAt: '2026-01-14T09:00:00Z',
      });

      await useCalendarStore.getState().syncEvents('2026-01-14', '2026-01-14');

      const state = useCalendarStore.getState();
      expect(state.events).toHaveLength(1);
      expect(state.events[0].title).toBe('팀 미팅');
      expect(state.lastSyncAt).toBe('2026-01-14T09:00:00Z');
      expect(state.isLoading).toBe(false);
    });

    it('should not fetch when not connected', async () => {
      useCalendarStore.setState({ isConnected: false });

      await useCalendarStore.getState().syncEvents('2026-01-14', '2026-01-14');

      expect(calendarApi.listEvents).not.toHaveBeenCalled();
    });
  });

  describe('toggleCalendarSelection', () => {
    it('should add calendar to selection', async () => {
      useCalendarStore.setState({
        selectedCalendarIds: ['primary'],
        calendars: [
          {
            id: 'primary',
            summary: '기본',
            description: null,
            backgroundColor: null,
            isPrimary: true,
            isSelected: true,
          },
          {
            id: 'work',
            summary: '업무',
            description: null,
            backgroundColor: null,
            isPrimary: false,
            isSelected: false,
          },
        ],
      });
      vi.mocked(calendarApi.selectCalendars).mockResolvedValue({
        success: true,
        selectedCount: 2,
      });

      await useCalendarStore.getState().toggleCalendarSelection('work');

      const state = useCalendarStore.getState();
      expect(state.selectedCalendarIds).toContain('primary');
      expect(state.selectedCalendarIds).toContain('work');
      expect(state.calendars.find((c) => c.id === 'work')?.isSelected).toBe(true);
    });

    it('should remove calendar from selection', async () => {
      useCalendarStore.setState({
        selectedCalendarIds: ['primary', 'work'],
        calendars: [
          {
            id: 'primary',
            summary: '기본',
            description: null,
            backgroundColor: null,
            isPrimary: true,
            isSelected: true,
          },
          {
            id: 'work',
            summary: '업무',
            description: null,
            backgroundColor: null,
            isPrimary: false,
            isSelected: true,
          },
        ],
      });
      vi.mocked(calendarApi.selectCalendars).mockResolvedValue({
        success: true,
        selectedCount: 1,
      });

      await useCalendarStore.getState().toggleCalendarSelection('work');

      const state = useCalendarStore.getState();
      expect(state.selectedCalendarIds).toContain('primary');
      expect(state.selectedCalendarIds).not.toContain('work');
      expect(state.calendars.find((c) => c.id === 'work')?.isSelected).toBe(false);
    });

    it('should rollback on API failure', async () => {
      useCalendarStore.setState({
        selectedCalendarIds: ['primary'],
        calendars: [
          {
            id: 'primary',
            summary: '기본',
            description: null,
            backgroundColor: null,
            isPrimary: true,
            isSelected: true,
          },
          {
            id: 'work',
            summary: '업무',
            description: null,
            backgroundColor: null,
            isPrimary: false,
            isSelected: false,
          },
        ],
      });
      vi.mocked(calendarApi.selectCalendars).mockRejectedValue(
        new Error('API error')
      );

      await useCalendarStore.getState().toggleCalendarSelection('work');

      const state = useCalendarStore.getState();
      // 롤백됨
      expect(state.selectedCalendarIds).toEqual(['primary']);
      expect(state.calendars.find((c) => c.id === 'work')?.isSelected).toBe(false);
    });
  });

  describe('getEventsForDate', () => {
    it('should filter events by date', () => {
      useCalendarStore.setState({
        events: [
          {
            id: '1',
            calendarId: 'primary',
            title: 'Event 1',
            startTime: '2026-01-14T10:00:00+09:00',
            endTime: '2026-01-14T11:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
          {
            id: '2',
            calendarId: 'primary',
            title: 'Event 2',
            startTime: '2026-01-15T10:00:00+09:00',
            endTime: '2026-01-15T11:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
          {
            id: '3',
            calendarId: 'primary',
            title: 'Event 3',
            startTime: '2026-01-14T14:00:00+09:00',
            endTime: '2026-01-14T15:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
        ],
      });

      const events = useCalendarStore.getState().getEventsForDate('2026-01-14');

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.id)).toEqual(['1', '3']);
    });

    it('should return empty array when no events for date', () => {
      useCalendarStore.setState({ events: [] });

      const events = useCalendarStore.getState().getEventsForDate('2026-01-14');

      expect(events).toHaveLength(0);
    });
  });

  describe('getEventCountsByDate', () => {
    it('should count events by date', () => {
      useCalendarStore.setState({
        events: [
          {
            id: '1',
            calendarId: 'primary',
            title: 'Event 1',
            startTime: '2026-01-14T10:00:00+09:00',
            endTime: '2026-01-14T11:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
          {
            id: '2',
            calendarId: 'primary',
            title: 'Event 2',
            startTime: '2026-01-14T14:00:00+09:00',
            endTime: '2026-01-14T15:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
          {
            id: '3',
            calendarId: 'primary',
            title: 'Event 3',
            startTime: '2026-01-15T10:00:00+09:00',
            endTime: '2026-01-15T11:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
        ],
      });

      const counts = useCalendarStore.getState().getEventCountsByDate();

      expect(counts.get('2026-01-14')).toBe(2);
      expect(counts.get('2026-01-15')).toBe(1);
    });

    it('should exclude cancelled events', () => {
      useCalendarStore.setState({
        events: [
          {
            id: '1',
            calendarId: 'primary',
            title: 'Event 1',
            startTime: '2026-01-14T10:00:00+09:00',
            endTime: '2026-01-14T11:00:00+09:00',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
          {
            id: '2',
            calendarId: 'primary',
            title: 'Cancelled Event',
            startTime: '2026-01-14T14:00:00+09:00',
            endTime: '2026-01-14T15:00:00+09:00',
            isAllDay: false,
            status: 'cancelled',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
        ],
      });

      const counts = useCalendarStore.getState().getEventCountsByDate();

      expect(counts.get('2026-01-14')).toBe(1);
    });
  });

  describe('handleOAuthSuccess', () => {
    it('should refresh connection and calendars', async () => {
      vi.mocked(getAccessToken).mockReturnValue('test-token');
      vi.mocked(calendarApi.getConnectionStatus).mockResolvedValue({
        isConnected: true,
        email: 'test@example.com',
        expiresAt: '2026-01-15T00:00:00Z',
      });
      vi.mocked(calendarApi.listCalendars).mockResolvedValue({
        calendars: [],
      });

      await useCalendarStore.getState().handleOAuthSuccess();

      expect(calendarApi.getConnectionStatus).toHaveBeenCalled();
      expect(calendarApi.listCalendars).toHaveBeenCalled();
      expect(useCalendarStore.getState().isLoading).toBe(false);
      expect(useCalendarStore.getState().error).toBeNull();
    });
  });

  describe('handleOAuthError', () => {
    it('should set error state', () => {
      useCalendarStore.getState().handleOAuthError('Authentication failed');

      const state = useCalendarStore.getState();
      expect(state.error).toBe('Authentication failed');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('setSyncMode', () => {
    it('should update sync mode', () => {
      useCalendarStore.getState().setSyncMode('manual');

      expect(useCalendarStore.getState().syncMode).toBe('manual');

      useCalendarStore.getState().setSyncMode('auto');

      expect(useCalendarStore.getState().syncMode).toBe('auto');
    });
  });

  describe('clearError', () => {
    it('should clear error state', () => {
      useCalendarStore.setState({ error: 'Some error' });

      useCalendarStore.getState().clearError();

      expect(useCalendarStore.getState().error).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should reset state on disconnect', async () => {
      useCalendarStore.setState({
        isConnected: true,
        userEmail: 'test@example.com',
        calendars: [
          {
            id: 'primary',
            summary: '기본',
            description: null,
            backgroundColor: null,
            isPrimary: true,
            isSelected: true,
          },
        ],
        selectedCalendarIds: ['primary'],
        events: [
          {
            id: '1',
            calendarId: 'primary',
            title: 'Event',
            startTime: '2026-01-14T10:00:00Z',
            endTime: '2026-01-14T11:00:00Z',
            isAllDay: false,
            status: 'confirmed',
            description: null,
            location: null,
            colorId: null,
            htmlLink: null,
          },
        ],
        lastSyncAt: '2026-01-14T09:00:00Z',
      });
      vi.mocked(calendarApi.disconnect).mockResolvedValue();

      await useCalendarStore.getState().disconnect();

      const state = useCalendarStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.userEmail).toBeNull();
      expect(state.calendars).toHaveLength(0);
      expect(state.selectedCalendarIds).toHaveLength(0);
      expect(state.events).toHaveLength(0);
      expect(state.lastSyncAt).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should set error on API failure', async () => {
      vi.mocked(calendarApi.disconnect).mockRejectedValue(
        new Error('Disconnect failed')
      );

      await useCalendarStore.getState().disconnect();

      const state = useCalendarStore.getState();
      expect(state.error).toBe('Disconnect failed');
      expect(state.isLoading).toBe(false);
    });
  });
});
