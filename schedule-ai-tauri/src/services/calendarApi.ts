/**
 * Calendar API 클라이언트
 * 서버 API를 통해 Google Calendar 기능을 사용합니다.
 */

// 서버 API 베이스 URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// 토큰 저장 (간단한 메모리 저장 - 실제 앱에서는 secure storage 사용 권장)
let accessToken: string | null = null;

/**
 * 토큰 설정
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * 토큰 가져오기
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * API 요청 헬퍼
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================
// 타입 정의
// ============================================

export interface CalendarConnectionStatus {
  isConnected: boolean;
  email: string | null;
  expiresAt: string | null;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description: string | null;
  backgroundColor: string | null;
  isPrimary: boolean;
  isSelected: boolean;
}

export interface CalendarListResponse {
  calendars: GoogleCalendar[];
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  colorId: string | null;
  htmlLink: string | null;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
  syncedAt: string;
}

export interface SelectCalendarsResponse {
  success: boolean;
  selectedCount: number;
}

// ============================================
// API 메서드
// ============================================

export const calendarApi = {
  /**
   * 연결 상태 확인
   */
  async getConnectionStatus(): Promise<CalendarConnectionStatus> {
    return apiRequest<CalendarConnectionStatus>('/api/auth/calendar/status');
  },

  /**
   * OAuth 시작 URL 가져오기
   * 사용자가 이 URL로 브라우저에서 이동하면 OAuth 플로우가 시작됩니다.
   */
  getOAuthUrl(): string {
    // JWT 토큰을 쿼리 파라미터로 전달 (서버에서 사용자 식별용)
    // 서버에서 Authorization 헤더 대신 쿼리 파라미터로 토큰을 받을 수도 있음
    return `${API_BASE}/api/auth/google/calendar`;
  },

  /**
   * 연결 해제
   */
  async disconnect(): Promise<void> {
    await apiRequest<{ message: string }>('/api/auth/calendar/disconnect', {
      method: 'POST',
    });
  },

  /**
   * 캘린더 목록 조회
   */
  async listCalendars(): Promise<CalendarListResponse> {
    return apiRequest<CalendarListResponse>('/api/calendar/list');
  },

  /**
   * 캘린더 선택 저장
   */
  async selectCalendars(calendarIds: string[]): Promise<SelectCalendarsResponse> {
    return apiRequest<SelectCalendarsResponse>('/api/calendar/list/select', {
      method: 'POST',
      body: JSON.stringify({ calendarIds }),
    });
  },

  /**
   * 이벤트 조회
   * @param start 시작 날짜 (YYYY-MM-DD)
   * @param end 종료 날짜 (YYYY-MM-DD)
   */
  async listEvents(start: string, end: string): Promise<CalendarEventsResponse> {
    return apiRequest<CalendarEventsResponse>(
      `/api/calendar/events?start=${start}&end=${end}`
    );
  },
};

export default calendarApi;
