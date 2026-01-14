import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

// 타입 정의
export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  isSelected: boolean;
  isPrimary: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  colorId?: string;
  htmlLink?: string;
  syncedAt: string;
}

export type SyncMode = 'auto' | 'manual';

interface ConnectionStatus {
  isConnected: boolean;
  email: string | null;
  expiresAt: number | null;
}

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
  getAccessToken: () => Promise<string | null>;

  // 캘린더 관리
  syncCalendars: () => Promise<void>;
  toggleCalendarSelection: (calendarId: string) => void;

  // 이벤트 관리
  syncEvents: (startDate: string, endDate: string) => Promise<void>;
  getEventsForDate: (date: string) => CalendarEvent[];

  // 설정
  setSyncMode: (mode: SyncMode) => void;
  clearError: () => void;
}

// OAuth 콜백을 처리하기 위한 로컬 서버 포트
const OAUTH_REDIRECT_PORT = 9876;

// 환경변수에서 Client ID/Secret 가져오기
const getClientCredentials = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
  return { clientId, clientSecret };
};

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

      // 연결 상태 확인
      checkConnection: async () => {
        try {
          const status = await invoke<ConnectionStatus>('get_google_connection_status');
          set({
            isConnected: status.isConnected,
            userEmail: status.email,
          });
        } catch (error) {
          console.error('Failed to check connection:', error);
          set({ isConnected: false, userEmail: null });
        }
      },

      // Google 계정 연결
      connect: async () => {
        const { clientId, clientSecret } = getClientCredentials();

        if (!clientId || !clientSecret) {
          set({ error: 'Google OAuth credentials not configured' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          // 1. 인증 URL 생성
          const authUrl = await invoke<string>('get_google_auth_url', {
            clientId,
            redirectPort: OAUTH_REDIRECT_PORT,
          });

          // 2. 로컬 서버 시작 및 브라우저 열기
          // 브라우저에서 인증 후 콜백 URL로 리다이렉트
          await openUrl(authUrl);

          // 3. 사용자에게 콜백 URL의 code를 입력받아야 함
          // 이 부분은 실제로는 로컬 서버로 콜백을 받아 처리해야 함
          // 일단 수동으로 code를 입력받는 방식으로 구현
          // (실제 구현에서는 tauri-plugin-oauth 또는 직접 로컬 서버 구현 필요)

          set({ isLoading: false });

          // Note: 실제 OAuth 콜백 처리는 별도의 로직 필요
          // 현재는 handleOAuthCallback 함수를 통해 수동으로 처리

        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to connect',
          });
        }
      },

      // Google 계정 연결 해제
      disconnect: async () => {
        set({ isLoading: true, error: null });

        try {
          await invoke('disconnect_google');
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

      // Access token 가져오기 (필요시 갱신)
      getAccessToken: async () => {
        const { clientId, clientSecret } = getClientCredentials();

        if (!clientId || !clientSecret) {
          return null;
        }

        try {
          const token = await invoke<string | null>('get_google_access_token', {
            clientId,
            clientSecret,
          });
          return token;
        } catch (error) {
          console.error('Failed to get access token:', error);
          return null;
        }
      },

      // 캘린더 목록 동기화 (추후 Calendar API 연동 시 구현)
      syncCalendars: async () => {
        // TODO: Calendar API 연동 시 구현
        console.log('syncCalendars - to be implemented with Calendar API');
      },

      // 캘린더 선택 토글
      toggleCalendarSelection: (calendarId: string) => {
        const { selectedCalendarIds } = get();
        const newSelection = selectedCalendarIds.includes(calendarId)
          ? selectedCalendarIds.filter((id) => id !== calendarId)
          : [...selectedCalendarIds, calendarId];
        set({ selectedCalendarIds: newSelection });
      },

      // 이벤트 동기화 (추후 Calendar API 연동 시 구현)
      syncEvents: async (_startDate: string, _endDate: string) => {
        // TODO: Calendar API 연동 시 구현
        console.log('syncEvents - to be implemented with Calendar API');
      },

      // 특정 날짜의 이벤트 조회
      getEventsForDate: (date: string) => {
        const { events } = get();
        return events.filter((event) => {
          const eventDate = event.startTime.split('T')[0];
          return eventDate === date;
        });
      },

      // 동기화 모드 설정
      setSyncMode: (mode: SyncMode) => {
        set({ syncMode: mode });
      },

      // 에러 초기화
      clearError: () => {
        set({ error: null });
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

// OAuth 콜백 처리 함수 (외부에서 호출)
export async function handleOAuthCallback(code: string): Promise<boolean> {
  const { clientId, clientSecret } = getClientCredentials();

  if (!clientId || !clientSecret) {
    console.error('Google OAuth credentials not configured');
    return false;
  }

  try {
    const result = await invoke<{ success: boolean; email: string | null; error: string | null }>(
      'exchange_google_code',
      {
        code,
        clientId,
        clientSecret,
        redirectPort: OAUTH_REDIRECT_PORT,
      }
    );

    if (result.success && result.email) {
      useCalendarStore.setState({
        isConnected: true,
        userEmail: result.email,
        isLoading: false,
        error: null,
      });
      return true;
    } else {
      useCalendarStore.setState({
        isLoading: false,
        error: result.error || 'Authentication failed',
      });
      return false;
    }
  } catch (error) {
    useCalendarStore.setState({
      isLoading: false,
      error: error instanceof Error ? error.message : 'Failed to exchange code',
    });
    return false;
  }
}
