# Desktop 통합 테스트

## 개요
- **상위 태스크**: [Google Calendar 테스트](./00_overview.md)
- **목적**: Desktop 앱 컴포넌트의 통합 테스트 작성
- **상태**: 대기
- **우선순위**: 낮음 (단위 테스트 완료 후 진행)

## 목표
- [ ] CalendarEventCard 컴포넌트 테스트
- [ ] EventDetailPopup 컴포넌트 테스트
- [ ] Settings 캘린더 섹션 테스트
- [ ] Today 탭 타임라인 통합 테스트

## 구현 계획

### 1. MSW (Mock Service Worker) 설정

**src/test/mocks/handlers.ts**:
```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  // 연결 상태 조회
  http.get('*/api/auth/calendar/status', () => {
    return HttpResponse.json({
      isConnected: true,
      email: 'test@example.com',
    });
  }),

  // 캘린더 목록 조회
  http.get('*/api/calendar/list', () => {
    return HttpResponse.json({
      calendars: [
        {
          id: 'primary',
          summary: '기본 캘린더',
          backgroundColor: '#4285f4',
          isPrimary: true,
          isSelected: true,
        },
        {
          id: 'work',
          summary: '업무',
          backgroundColor: '#16a765',
          isPrimary: false,
          isSelected: false,
        },
      ],
    });
  }),

  // 이벤트 조회
  http.get('*/api/calendar/events', ({ request }) => {
    const url = new URL(request.url);
    const start = url.searchParams.get('start');

    return HttpResponse.json({
      events: [
        {
          id: 'event1',
          calendarId: 'primary',
          title: '팀 미팅',
          description: '주간 스탠드업',
          location: '회의실 A',
          startTime: `${start}T10:00:00+09:00`,
          endTime: `${start}T11:00:00+09:00`,
          isAllDay: false,
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/calendar/event?eid=xxx',
        },
      ],
      syncedAt: new Date().toISOString(),
    });
  }),

  // 캘린더 선택
  http.post('*/api/calendar/list/select', () => {
    return HttpResponse.json({
      success: true,
      selectedCount: 1,
    });
  }),

  // 연결 해제
  http.post('*/api/auth/calendar/disconnect', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
```

**src/test/mocks/server.ts**:
```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

**src/test/setup.ts (확장)**:
```typescript
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 2. CalendarEventCard 테스트

**src/components/CalendarEventCard.test.tsx**:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarEventCard } from './CalendarEventCard';
import type { CalendarEvent } from '../stores/calendarStore';

describe('CalendarEventCard', () => {
  const mockEvent: CalendarEvent = {
    id: 'event1',
    calendarId: 'primary',
    title: '팀 미팅',
    description: '주간 스탠드업',
    location: '회의실 A',
    startTime: '2026-01-14T10:00:00+09:00',
    endTime: '2026-01-14T11:00:00+09:00',
    isAllDay: false,
    status: 'confirmed',
  };

  it('should render event title', () => {
    render(<CalendarEventCard event={mockEvent} onClick={() => {}} />);

    expect(screen.getByText('팀 미팅')).toBeInTheDocument();
  });

  it('should render event time', () => {
    render(<CalendarEventCard event={mockEvent} onClick={() => {}} />);

    expect(screen.getByText(/10:00/)).toBeInTheDocument();
  });

  it('should render location if provided', () => {
    render(<CalendarEventCard event={mockEvent} onClick={() => {}} />);

    expect(screen.getByText('회의실 A')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<CalendarEventCard event={mockEvent} onClick={handleClick} />);

    fireEvent.click(screen.getByText('팀 미팅'));

    expect(handleClick).toHaveBeenCalledWith(mockEvent);
  });

  it('should show all-day indicator for all-day events', () => {
    const allDayEvent = { ...mockEvent, isAllDay: true };
    render(<CalendarEventCard event={allDayEvent} onClick={() => {}} />);

    expect(screen.getByText(/종일/)).toBeInTheDocument();
  });

  it('should apply correct color based on colorId', () => {
    const coloredEvent = { ...mockEvent, colorId: '1' };
    const { container } = render(<CalendarEventCard event={coloredEvent} onClick={() => {}} />);

    // Google Calendar 색상 1번 (#7986cb) 확인
    expect(container.querySelector('.event-card')).toHaveStyle({
      borderLeftColor: '#7986cb',
    });
  });
});
```

### 3. EventDetailPopup 테스트

**src/components/EventDetailPopup.test.tsx**:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventDetailPopup } from './EventDetailPopup';
import type { CalendarEvent } from '../stores/calendarStore';

describe('EventDetailPopup', () => {
  const mockEvent: CalendarEvent = {
    id: 'event1',
    calendarId: 'primary',
    title: '팀 미팅',
    description: '주간 스탠드업 회의입니다.',
    location: '회의실 A',
    startTime: '2026-01-14T10:00:00+09:00',
    endTime: '2026-01-14T11:00:00+09:00',
    isAllDay: false,
    status: 'confirmed',
    htmlLink: 'https://calendar.google.com/calendar/event?eid=xxx',
  };

  it('should render event details', () => {
    render(<EventDetailPopup event={mockEvent} onClose={() => {}} />);

    expect(screen.getByText('팀 미팅')).toBeInTheDocument();
    expect(screen.getByText('주간 스탠드업 회의입니다.')).toBeInTheDocument();
    expect(screen.getByText('회의실 A')).toBeInTheDocument();
  });

  it('should render formatted time', () => {
    render(<EventDetailPopup event={mockEvent} onClose={() => {}} />);

    expect(screen.getByText(/10:00 - 11:00/)).toBeInTheDocument();
  });

  it('should call onClose when overlay clicked', () => {
    const handleClose = vi.fn();
    render(<EventDetailPopup event={mockEvent} onClose={handleClose} />);

    fireEvent.click(screen.getByTestId('popup-overlay'));

    expect(handleClose).toHaveBeenCalled();
  });

  it('should render Google Calendar link', () => {
    render(<EventDetailPopup event={mockEvent} onClose={() => {}} />);

    const link = screen.getByText(/Google Calendar에서 열기/);
    expect(link).toHaveAttribute('href', mockEvent.htmlLink);
  });

  it('should not render link if htmlLink is undefined', () => {
    const eventWithoutLink = { ...mockEvent, htmlLink: undefined };
    render(<EventDetailPopup event={eventWithoutLink} onClose={() => {}} />);

    expect(screen.queryByText(/Google Calendar에서 열기/)).not.toBeInTheDocument();
  });
});
```

### 4. Settings 캘린더 섹션 테스트

**src/components/SettingsCalendarSection.test.tsx**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsCalendarSection } from './SettingsCalendarSection';
import { useCalendarStore } from '../stores/calendarStore';

describe('SettingsCalendarSection', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      isConnected: false,
      userEmail: null,
      isLoading: false,
      calendars: [],
    });
  });

  describe('when not connected', () => {
    it('should render connect button', () => {
      render(<SettingsCalendarSection />);

      expect(screen.getByText(/Google 계정 연결/)).toBeInTheDocument();
    });

    it('should call connect when button clicked', async () => {
      const connect = vi.fn();
      useCalendarStore.setState({ connect });

      render(<SettingsCalendarSection />);
      fireEvent.click(screen.getByText(/Google 계정 연결/));

      expect(connect).toHaveBeenCalled();
    });
  });

  describe('when connected', () => {
    beforeEach(() => {
      useCalendarStore.setState({
        isConnected: true,
        userEmail: 'test@example.com',
        calendars: [
          { id: 'primary', summary: '기본', isPrimary: true, isSelected: true },
          { id: 'work', summary: '업무', isPrimary: false, isSelected: false },
        ],
      });
    });

    it('should render connected email', () => {
      render(<SettingsCalendarSection />);

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('should render disconnect button', () => {
      render(<SettingsCalendarSection />);

      expect(screen.getByText(/연결 해제/)).toBeInTheDocument();
    });

    it('should render calendar list', () => {
      render(<SettingsCalendarSection />);

      expect(screen.getByText('기본')).toBeInTheDocument();
      expect(screen.getByText('업무')).toBeInTheDocument();
    });

    it('should toggle calendar selection', async () => {
      const toggleCalendarSelection = vi.fn();
      useCalendarStore.setState({ toggleCalendarSelection });

      render(<SettingsCalendarSection />);
      fireEvent.click(screen.getByLabelText('업무'));

      expect(toggleCalendarSelection).toHaveBeenCalledWith('work');
    });

    it('should show primary badge for primary calendar', () => {
      render(<SettingsCalendarSection />);

      expect(screen.getByText('Primary')).toBeInTheDocument();
    });

    it('should confirm before disconnect', async () => {
      const disconnect = vi.fn();
      useCalendarStore.setState({ disconnect });
      window.confirm = vi.fn(() => true);

      render(<SettingsCalendarSection />);
      fireEvent.click(screen.getByText(/연결 해제/));

      expect(window.confirm).toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should disable buttons when loading', () => {
      useCalendarStore.setState({ isLoading: true });

      render(<SettingsCalendarSection />);

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('error state', () => {
    it('should render error message', () => {
      useCalendarStore.setState({ error: 'Connection failed' });

      render(<SettingsCalendarSection />);

      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });
});
```

### 5. Today 탭 타임라인 통합 테스트

**src/components/TodayTimeline.test.tsx**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TodayTimeline } from './TodayTimeline';
import { useTaskStore } from '../stores/taskStore';
import { useCalendarStore } from '../stores/calendarStore';

describe('TodayTimeline', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [
        {
          id: 'task1',
          title: '업무 처리',
          scheduledTime: '14:00',
          status: 'pending',
        },
      ],
    });

    useCalendarStore.setState({
      isConnected: true,
      events: [
        {
          id: 'event1',
          title: '팀 미팅',
          startTime: '2026-01-14T10:00:00+09:00',
          endTime: '2026-01-14T11:00:00+09:00',
          isAllDay: false,
          status: 'confirmed',
        },
      ],
    });
  });

  it('should render both tasks and events', () => {
    render(<TodayTimeline date="2026-01-14" />);

    expect(screen.getByText('업무 처리')).toBeInTheDocument();
    expect(screen.getByText('팀 미팅')).toBeInTheDocument();
  });

  it('should render items in time order', () => {
    render(<TodayTimeline date="2026-01-14" />);

    const items = screen.getAllByTestId(/timeline-item/);

    // 10:00 이벤트가 14:00 태스크보다 먼저
    expect(items[0]).toHaveTextContent('팀 미팅');
    expect(items[1]).toHaveTextContent('업무 처리');
  });

  it('should render all-day events section', () => {
    useCalendarStore.setState({
      events: [
        {
          id: 'allday1',
          title: '공휴일',
          isAllDay: true,
          startTime: '2026-01-14',
          status: 'confirmed',
        },
      ],
    });

    render(<TodayTimeline date="2026-01-14" />);

    expect(screen.getByText('공휴일')).toBeInTheDocument();
  });

  it('should not render calendar events when not connected', () => {
    useCalendarStore.setState({ isConnected: false });

    render(<TodayTimeline date="2026-01-14" />);

    expect(screen.queryByText('팀 미팅')).not.toBeInTheDocument();
  });
});
```

## 의존성

```json
{
  "devDependencies": {
    "msw": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0"
  }
}
```

## 고려사항

### 컴포넌트 분리
- 현재 App.tsx에 있는 컴포넌트들을 별도 파일로 분리 필요
- 테스트 가능성을 높이기 위함

### i18n 처리
- 테스트에서 i18n provider 래핑 필요
- 또는 번역 키 직접 테스트

### MSW 설정
- 네트워크 요청을 인터셉트하여 일관된 테스트 환경 제공
- 다양한 응답 시나리오 테스트 가능

## 관련 파일
- `src/App.tsx` - 컴포넌트 정의 (분리 필요)
- `src/stores/calendarStore.ts`
- `src/stores/taskStore.ts`
