import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { openUrl } from '@tauri-apps/plugin-opener';
import { calendarApi, getAccessToken, setAccessToken } from '../services/calendarApi';
import type {
  GoogleCalendar as ApiGoogleCalendar,
  CalendarEvent as ApiCalendarEvent,
} from '../services/calendarApi';

// 타입 정의 (calendarApi 타입을 재사용하되 로컬 확장)
export interface GoogleCalendar extends ApiGoogleCalendar {}

export interface CalendarEvent extends ApiCalendarEvent {
  syncedAt?: string;
}

export type SyncMode = 'auto' | 'manual';

interface CalendarState {
  // 연결 상태
  isConnected: boolean;
  userEmail: string | null;
  isLoading: boolean;
  error: string | null;

  // 캘린더 목록
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];

  // 이벤트
  events: CalendarEvent[];
  lastSyncAt: string | null;

  // 설정
  syncMode: SyncMode;

  // Actions
  checkConnection: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // 캘린더 관리
  syncCalendars: () => Promise<void>;
  toggleCalendarSelection: (calendarId: string) => Promise<void>;

  // 이벤트 관리
  syncEvents: (startDate: string, endDate: string) => Promise<void>;
  syncEventsForYear: (year: number) => Promise<void>;
  getEventsForDate: (date: string) => CalendarEvent[];
  getEventCountsByDate: () => Map<string, number>;

  // 설정
  setSyncMode: (mode: SyncMode) => void;
  clearError: () => void;

  // OAuth 콜백 처리
  handleOAuthSuccess: () => Promise<void>;
  handleOAuthError: (message: string) => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      // 초기 상태
      isConnected: false,
      userEmail: null,
      isLoading: false,
      error: null,
      calendars: [],
      selectedCalendarIds: [],
      events: [],
      lastSyncAt: null,
      syncMode: 'auto',

      // 연결 상태 확인 (서버 API)
      checkConnection: async () => {
        // JWT 토큰이 없으면 연결 안 됨
        if (!getAccessToken()) {
          set({ isConnected: false, userEmail: null });
          return;
        }

        try {
          const status = await calendarApi.getConnectionStatus();
          set({
            isConnected: status.isConnected,
            userEmail: status.email,
          });
        } catch (error) {
          console.error('Failed to check connection:', error);
          set({ isConnected: false, userEmail: null });
        }
      },

      // Google 계정 연결 (서버 OAuth)
      connect: async () => {
        // JWT 토큰 확인
        if (!getAccessToken()) {
          set({ error: 'Please login first to connect Google Calendar' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          // 서버 OAuth URL로 브라우저 열기
          const oauthUrl = calendarApi.getOAuthUrl();
          await openUrl(oauthUrl);

          // Deep Link 콜백 대기 (handleOAuthSuccess/handleOAuthError에서 처리)
          // isLoading은 OAuth 완료 후 해제됨
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to connect',
          });
        }
      },

      // 연결 해제 (서버 API)
      disconnect: async () => {
        set({ isLoading: true, error: null });

        try {
          await calendarApi.disconnect();
          set({
            isConnected: false,
            userEmail: null,
            calendars: [],
            selectedCalendarIds: [],
            events: [],
            lastSyncAt: null,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to disconnect',
          });
        }
      },

      // 캘린더 목록 동기화 (서버 API)
      syncCalendars: async () => {
        if (!get().isConnected) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await calendarApi.listCalendars();
          const { selectedCalendarIds } = get();

          // 서버에서 받은 isSelected 상태를 사용하되, 로컬 선택도 병합
          const calendars = response.calendars.map((cal) => ({
            ...cal,
            isSelected: cal.isSelected || selectedCalendarIds.includes(cal.id),
          }));

          // 선택된 캘린더 ID 업데이트
          const newSelectedIds = calendars
            .filter((cal) => cal.isSelected)
            .map((cal) => cal.id);

          set({
            calendars,
            selectedCalendarIds: newSelectedIds,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to sync calendars',
          });
        }
      },

      // 캘린더 선택 토글 (서버에 저장)
      toggleCalendarSelection: async (calendarId: string) => {
        const { selectedCalendarIds, calendars } = get();

        const newSelection = selectedCalendarIds.includes(calendarId)
          ? selectedCalendarIds.filter((id) => id !== calendarId)
          : [...selectedCalendarIds, calendarId];

        // UI 즉시 업데이트 (optimistic update)
        set({
          selectedCalendarIds: newSelection,
          calendars: calendars.map((cal) => ({
            ...cal,
            isSelected: newSelection.includes(cal.id),
          })),
        });

        // 서버에 저장 (비동기)
        try {
          await calendarApi.selectCalendars(newSelection);
        } catch (error) {
          console.error('Failed to save calendar selection:', error);
          // 실패 시 롤백
          set({
            selectedCalendarIds,
            calendars: calendars.map((cal) => ({
              ...cal,
              isSelected: selectedCalendarIds.includes(cal.id),
            })),
          });
        }
      },

      // 이벤트 동기화 (서버 API)
      syncEvents: async (startDate: string, endDate: string) => {
        if (!get().isConnected) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await calendarApi.listEvents(startDate, endDate);
          set({
            events: response.events.map((event) => ({
              ...event,
              syncedAt: response.syncedAt,
            })),
            lastSyncAt: response.syncedAt,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to sync events',
          });
        }
      },

      // 연간 이벤트 동기화 (Progress 탭용)
      syncEventsForYear: async (year: number) => {
        if (!get().isConnected) {
          return;
        }

        // 연도의 시작일과 종료일
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        set({ isLoading: true, error: null });

        try {
          const response = await calendarApi.listEvents(startDate, endDate);
          set({
            events: response.events.map((event) => ({
              ...event,
              syncedAt: response.syncedAt,
            })),
            lastSyncAt: response.syncedAt,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to sync events',
          });
        }
      },

      // 특정 날짜의 이벤트 조회
      getEventsForDate: (date: string) => {
        const { events } = get();
        return events.filter((event) => {
          const eventDate = event.startTime.split('T')[0];
          return eventDate === date;
        });
      },

      // 날짜별 이벤트 수 집계 (Progress 히트맵용)
      getEventCountsByDate: () => {
        const { events } = get();
        const countMap = new Map<string, number>();

        for (const event of events) {
          // cancelled 이벤트는 제외
          if (event.status === 'cancelled') continue;

          const eventDate = event.startTime.split('T')[0];
          const currentCount = countMap.get(eventDate) || 0;
          countMap.set(eventDate, currentCount + 1);
        }

        return countMap;
      },

      // 동기화 모드 설정
      setSyncMode: (mode: SyncMode) => {
        set({ syncMode: mode });
      },

      // 에러 초기화
      clearError: () => {
        set({ error: null });
      },

      // OAuth 성공 콜백 (Deep Link에서 호출)
      handleOAuthSuccess: async () => {
        console.log('Calendar OAuth successful');
        set({ isLoading: false, error: null });

        // 연결 상태 확인 및 캘린더 동기화
        const { checkConnection, syncCalendars } = get();
        await checkConnection();
        await syncCalendars();
      },

      // OAuth 에러 콜백 (Deep Link에서 호출)
      handleOAuthError: (message: string) => {
        console.error('Calendar OAuth failed:', message);
        set({
          isLoading: false,
          error: message,
        });
      },
    }),
    {
      name: 'calendar-settings',
      partialize: (state) => ({
        selectedCalendarIds: state.selectedCalendarIds,
        syncMode: state.syncMode,
      }),
    }
  )
);

// JWT 토큰 설정 유틸리티 (외부에서 호출)
export { setAccessToken, getAccessToken };
