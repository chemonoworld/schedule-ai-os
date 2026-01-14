# Desktop 앱에서 서버 연동

## 개요
- **상위 태스크**: [Google Calendar 연동](./00_overview.md)
- **목적**: Desktop 앱이 서버 API를 통해 Google Calendar 기능을 사용하도록 구현
- **상태**: 대기

## 목표
- [ ] 기존 로컬 OAuth 코드 제거/비활성화
- [ ] 서버 API 호출로 calendarStore 수정
- [ ] Deep Link 처리로 OAuth 콜백 수신
- [ ] JWT 토큰 기반 인증 연동
- [ ] 오프라인 캐싱 구현

## 현재 상태

### 기존 구현 (제거 대상)
```
schedule-ai-tauri/
├── src-tauri/src/google_auth/mod.rs   # 로컬 OAuth (제거)
├── src/stores/calendarStore.ts         # invoke() 호출 (수정)
└── .env.example                        # Client Secret (제거)
```

### 새로운 구현
```
schedule-ai-tauri/
├── src/stores/calendarStore.ts         # fetch() 서버 API 호출
├── src/services/calendarApi.ts         # API 클라이언트 (신규)
└── src/hooks/useDeepLink.ts            # Deep Link 처리 (신규)
```

## 구현 계획

### 1. Rust 코드 정리

**Cargo.toml에서 제거 가능한 의존성**:
```toml
# 제거 대상 (서버로 이전됨)
# keyring = "3"      # 토큰이 서버 DB에 저장됨
# rand = "0.8"       # PKCE가 서버에서 처리됨
# sha2 = "0.10"
# base64 = "0.22"
# url = "2"
```

**src-tauri/src/google_auth/mod.rs**:
- 모듈 전체 제거 또는 비활성화
- lib.rs에서 모듈 import 및 커맨드 등록 제거

### 2. API 클라이언트 구현

**src/services/calendarApi.ts (신규)**:
```typescript
import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.scheduleai.app';

interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { getAccessToken } = useAuthStore.getState();
  const token = await getAccessToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Calendar API
export const calendarApi = {
  // 연결 상태 확인
  async getConnectionStatus(): Promise<CalendarConnectionStatus> {
    return apiRequest('/api/auth/calendar/status');
  },

  // OAuth 시작 URL 가져오기
  getOAuthUrl(): string {
    const token = useAuthStore.getState().accessToken;
    return `${API_BASE}/api/auth/google/calendar?token=${token}`;
  },

  // 연결 해제
  async disconnect(): Promise<void> {
    return apiRequest('/api/auth/calendar/disconnect', { method: 'POST' });
  },

  // 캘린더 목록 조회
  async listCalendars(): Promise<CalendarListResponse> {
    return apiRequest('/api/calendar/list');
  },

  // 캘린더 선택 저장
  async selectCalendars(calendarIds: string[]): Promise<void> {
    return apiRequest('/api/calendar/list/select', {
      method: 'POST',
      body: JSON.stringify({ calendarIds }),
    });
  },

  // 이벤트 조회
  async listEvents(start: string, end: string): Promise<CalendarEventsResponse> {
    return apiRequest(`/api/calendar/events?start=${start}&end=${end}`);
  },
};

// 타입 정의
export interface CalendarConnectionStatus {
  isConnected: boolean;
  email: string | null;
  expiresAt: string | null;
}

export interface CalendarListResponse {
  calendars: GoogleCalendar[];
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
  syncedAt: string;
}
```

### 3. calendarStore 수정

**src/stores/calendarStore.ts (수정)**:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calendarApi } from '../services/calendarApi';

// 기존 invoke() 호출을 서버 API로 변경
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
        set({ isLoading: true, error: null });

        try {
          // 서버 OAuth URL로 브라우저 열기
          const oauthUrl = calendarApi.getOAuthUrl();
          await openUrl(oauthUrl);

          // Deep Link 콜백 대기
          // handleOAuthCallback에서 처리
          set({ isLoading: false });
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
        set({ isLoading: true });

        try {
          const response = await calendarApi.listCalendars();

          // 선택된 캘린더 ID 유지
          const { selectedCalendarIds } = get();
          const calendars = response.calendars.map(cal => ({
            ...cal,
            isSelected: selectedCalendarIds.includes(cal.id),
          }));

          set({ calendars, isLoading: false });
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

        // UI 즉시 업데이트
        set({
          selectedCalendarIds: newSelection,
          calendars: calendars.map(cal => ({
            ...cal,
            isSelected: newSelection.includes(cal.id),
          })),
        });

        // 서버에 저장 (비동기)
        try {
          await calendarApi.selectCalendars(newSelection);
        } catch (error) {
          console.error('Failed to save calendar selection:', error);
        }
      },

      // 이벤트 동기화 (서버 API)
      syncEvents: async (startDate: string, endDate: string) => {
        set({ isLoading: true });

        try {
          const response = await calendarApi.listEvents(startDate, endDate);
          set({
            events: response.events,
            lastSyncAt: response.syncedAt,
            isLoading: false,
          });

          // 로컬 캐시 저장
          await saveEventsToCache(response.events, startDate, endDate);
        } catch (error) {
          set({ isLoading: false });

          // 오프라인 시 캐시에서 로드
          const cachedEvents = await loadEventsFromCache(startDate, endDate);
          if (cachedEvents.length > 0) {
            set({ events: cachedEvents });
          }
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

      // 설정
      setSyncMode: (mode: SyncMode) => set({ syncMode: mode }),
      clearError: () => set({ error: null }),
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
```

### 4. Deep Link 처리

**src/hooks/useDeepLink.ts (신규)**:
```typescript
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useCalendarStore } from '../stores/calendarStore';

export function useDeepLink() {
  const { checkConnection, syncCalendars } = useCalendarStore();

  useEffect(() => {
    // Tauri deep link 이벤트 리스너
    const unlisten = listen<string>('deep-link', async (event) => {
      const url = event.payload;

      // scheduleai://auth/calendar/success
      if (url.includes('auth/calendar/success')) {
        console.log('Calendar OAuth successful');

        // 연결 상태 확인 및 캘린더 동기화
        await checkConnection();
        await syncCalendars();
      }

      // scheduleai://auth/calendar/error?message=xxx
      if (url.includes('auth/calendar/error')) {
        const urlObj = new URL(url);
        const errorMessage = urlObj.searchParams.get('message') || 'OAuth failed';
        console.error('Calendar OAuth failed:', errorMessage);

        useCalendarStore.setState({
          error: errorMessage,
          isLoading: false,
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [checkConnection, syncCalendars]);
}
```

**src-tauri/tauri.conf.json 수정**:
```json
{
  "app": {
    "deeplink": {
      "protocol": "scheduleai"
    }
  }
}
```

### 5. 오프라인 캐싱

**src/services/calendarCache.ts (신규)**:
```typescript
import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:schedule-ai.db');
  }
  return db;
}

// 이벤트 캐시 저장
export async function saveEventsToCache(
  events: CalendarEvent[],
  startDate: string,
  endDate: string
): Promise<void> {
  const database = await getDb();

  // 해당 날짜 범위의 기존 캐시 삭제
  await database.execute(
    `DELETE FROM cached_calendar_events
     WHERE date(start_time) >= date($1) AND date(start_time) <= date($2)`,
    [startDate, endDate]
  );

  // 새로운 이벤트 저장
  for (const event of events) {
    await database.execute(
      `INSERT OR REPLACE INTO cached_calendar_events
       (id, calendar_id, title, description, location, start_time, end_time,
        is_all_day, status, color_id, html_link, cached_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, datetime('now'))`,
      [
        event.id,
        event.calendarId,
        event.title,
        event.description,
        event.location,
        event.startTime,
        event.endTime,
        event.isAllDay ? 1 : 0,
        event.status,
        event.colorId,
        event.htmlLink,
      ]
    );
  }
}

// 캐시에서 이벤트 로드
export async function loadEventsFromCache(
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  const database = await getDb();

  const rows = await database.select<CachedEvent[]>(
    `SELECT * FROM cached_calendar_events
     WHERE date(start_time) >= date($1) AND date(start_time) <= date($2)
     ORDER BY start_time`,
    [startDate, endDate]
  );

  return rows.map((row) => ({
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: row.start_time,
    endTime: row.end_time,
    isAllDay: row.is_all_day === 1,
    status: row.status,
    colorId: row.color_id,
    htmlLink: row.html_link,
    syncedAt: row.cached_at,
  }));
}

interface CachedEvent {
  id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  is_all_day: number;
  status: string;
  color_id: string | null;
  html_link: string | null;
  cached_at: string;
}
```

**SQLite 마이그레이션 추가**:
```sql
-- 캐시 테이블
CREATE TABLE IF NOT EXISTS cached_calendar_events (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_all_day INTEGER DEFAULT 0,
    status TEXT DEFAULT 'confirmed',
    color_id TEXT,
    html_link TEXT,
    cached_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cached_events_date
    ON cached_calendar_events(start_time);
```

### 6. 환경 변수 업데이트

**.env.example (수정)**:
```env
# 서버 API 주소
VITE_API_BASE_URL=https://api.scheduleai.app

# Google OAuth는 서버에서 처리하므로 Client ID/Secret 제거
# VITE_GOOGLE_CLIENT_ID=xxx (제거)
# VITE_GOOGLE_CLIENT_SECRET=xxx (제거)
```

## 데이터 흐름

### OAuth 연결 흐름
```
User: "Connect Google Calendar" 클릭
    ↓
Desktop: 서버 OAuth URL로 브라우저 열기
    (https://api.scheduleai.app/api/auth/google/calendar?token=xxx)
    ↓
Server: Google OAuth 진행
    ↓
Server: 토큰 저장 후 Deep Link로 리다이렉트
    (scheduleai://auth/calendar/success)
    ↓
Desktop: Deep Link 수신, checkConnection() 호출
    ↓
Desktop: isConnected = true, UI 업데이트
```

### 이벤트 조회 흐름
```
User: Today 탭 접근 또는 날짜 변경
    ↓
Desktop: syncEvents(startDate, endDate) 호출
    ↓
Desktop → Server: GET /api/calendar/events?start=xxx&end=xxx
    ↓
Server: Google Calendar API 호출 (토큰 자동 갱신)
    ↓
Server → Desktop: 이벤트 목록 반환
    ↓
Desktop: calendarStore 업데이트, 로컬 캐시 저장
    ↓
UI: 이벤트 렌더링
```

## 관련 파일

| 파일 | 상태 | 설명 |
|------|------|------|
| `src/services/calendarApi.ts` | 신규 | 서버 API 클라이언트 |
| `src/services/calendarCache.ts` | 신규 | 오프라인 캐싱 |
| `src/hooks/useDeepLink.ts` | 신규 | Deep Link 처리 |
| `src/stores/calendarStore.ts` | 수정 | 서버 API 호출로 변경 |
| `src-tauri/src/google_auth/` | 제거 | 로컬 OAuth 모듈 |
| `src-tauri/Cargo.toml` | 수정 | 불필요한 의존성 제거 |
| `.env.example` | 수정 | 서버 URL로 변경 |

## 다음 단계

이 서브태스크 완료 후:
1. [04_today-integration.md](./04_today-integration.md) - Today 탭에 캘린더 이벤트 표시
