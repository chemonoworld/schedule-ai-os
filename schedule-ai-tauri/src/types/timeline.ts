/**
 * Timeline 통합 타입 정의
 * Task와 Calendar Event를 함께 표시하기 위한 타입
 */

import type { Task } from '@schedule-ai/core';
import type { CalendarEvent } from '../stores/calendarStore';

export type TimelineItemType = 'task' | 'event';

export interface TimelineItem {
  type: TimelineItemType;
  id: string;
  title: string;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm (이벤트만)
  isAllDay: boolean;
  data: Task | CalendarEvent;
}

/**
 * ISO 시간 문자열에서 HH:mm 추출
 */
function extractTime(isoString: string): string | undefined {
  if (!isoString) return undefined;
  const timePart = isoString.split('T')[1];
  return timePart?.slice(0, 5); // HH:mm
}

/**
 * Task와 Event를 TimelineItem으로 변환하고 시간순 정렬
 */
export function toTimelineItems(
  tasks: Task[],
  events: CalendarEvent[]
): TimelineItem[] {
  const taskItems: TimelineItem[] = tasks.map((task) => ({
    type: 'task' as const,
    id: task.id,
    title: task.title,
    startTime: task.scheduledTime ?? undefined,
    isAllDay: !task.scheduledTime,
    data: task,
  }));

  const eventItems: TimelineItem[] = events.map((event) => ({
    type: 'event' as const,
    id: event.id,
    title: event.title,
    startTime: event.isAllDay ? undefined : extractTime(event.startTime),
    endTime: event.isAllDay ? undefined : extractTime(event.endTime),
    isAllDay: event.isAllDay,
    data: event,
  }));

  // 시간순 정렬 (시간 없는 항목은 맨 위)
  return [...taskItems, ...eventItems].sort((a, b) => {
    // 종일 이벤트는 가장 위
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;

    // 둘 다 종일이거나 둘 다 시간 있음
    if (!a.startTime || !b.startTime) return 0;
    return a.startTime.localeCompare(b.startTime);
  });
}

/**
 * TimelineItem에서 CalendarEvent 타입가드
 */
export function isCalendarEvent(data: Task | CalendarEvent): data is CalendarEvent {
  return 'calendarId' in data;
}

/**
 * TimelineItem에서 Task 타입가드
 */
export function isTask(data: Task | CalendarEvent): data is Task {
  return 'status' in data && !('calendarId' in data);
}
