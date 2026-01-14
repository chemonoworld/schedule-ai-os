import { describe, it, expect } from 'vitest';
import { toTimelineItems, isCalendarEvent, isTask } from './timeline';
import type { Task } from '@schedule-ai/core';
import type { CalendarEvent } from '../stores/calendarStore';

describe('timeline utilities', () => {
  describe('toTimelineItems', () => {
    it('should convert tasks to timeline items', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: '업무 처리',
          description: '',
          date: '2026-01-14',
          scheduledTime: '10:00',
          status: 'pending',
          priority: 'medium',
          tags: [],
          createdAt: '2026-01-14T00:00:00Z',
          updatedAt: '2026-01-14T00:00:00Z',
        },
      ];

      const items = toTimelineItems(tasks, []);

      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('task');
      expect(items[0].title).toBe('업무 처리');
      expect(items[0].startTime).toBe('10:00');
      expect(items[0].isAllDay).toBe(false);
    });

    it('should convert events to timeline items', () => {
      const events: CalendarEvent[] = [
        {
          id: 'event1',
          calendarId: 'primary',
          title: '팀 미팅',
          startTime: '2026-01-14T10:00:00+09:00',
          endTime: '2026-01-14T11:00:00+09:00',
          isAllDay: false,
          status: 'confirmed',
        },
      ];

      const items = toTimelineItems([], events);

      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('event');
      expect(items[0].title).toBe('팀 미팅');
      expect(items[0].startTime).toBe('10:00');
      expect(items[0].endTime).toBe('11:00');
    });

    it('should sort items by start time', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Afternoon Task',
          description: '',
          date: '2026-01-14',
          scheduledTime: '14:00',
          status: 'pending',
          priority: 'medium',
          tags: [],
          createdAt: '2026-01-14T00:00:00Z',
          updatedAt: '2026-01-14T00:00:00Z',
        },
      ];
      const events: CalendarEvent[] = [
        {
          id: 'event1',
          calendarId: 'primary',
          title: 'Morning Event',
          startTime: '2026-01-14T10:00:00+09:00',
          endTime: '2026-01-14T11:00:00+09:00',
          isAllDay: false,
          status: 'confirmed',
        },
      ];

      const items = toTimelineItems(tasks, events);

      expect(items[0].title).toBe('Morning Event'); // 10:00
      expect(items[1].title).toBe('Afternoon Task'); // 14:00
    });

    it('should place all-day events first', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Morning Task',
          description: '',
          date: '2026-01-14',
          scheduledTime: '09:00',
          status: 'pending',
          priority: 'medium',
          tags: [],
          createdAt: '2026-01-14T00:00:00Z',
          updatedAt: '2026-01-14T00:00:00Z',
        },
      ];
      const events: CalendarEvent[] = [
        {
          id: 'event1',
          calendarId: 'primary',
          title: 'All Day Holiday',
          startTime: '2026-01-14',
          endTime: '2026-01-14',
          isAllDay: true,
          status: 'confirmed',
        },
      ];

      const items = toTimelineItems(tasks, events);

      expect(items[0].title).toBe('All Day Holiday');
      expect(items[0].isAllDay).toBe(true);
      expect(items[1].title).toBe('Morning Task');
    });

    it('should handle tasks without scheduled time', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Unscheduled Task',
          description: '',
          date: '2026-01-14',
          scheduledTime: null,
          status: 'pending',
          priority: 'medium',
          tags: [],
          createdAt: '2026-01-14T00:00:00Z',
          updatedAt: '2026-01-14T00:00:00Z',
        },
      ];

      const items = toTimelineItems(tasks, []);

      expect(items[0].startTime).toBeUndefined();
      expect(items[0].isAllDay).toBe(true);
    });

    it('should return empty array when no items', () => {
      const items = toTimelineItems([], []);
      expect(items).toHaveLength(0);
    });

    it('should merge tasks and events and sort together', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task at 12:00',
          description: '',
          date: '2026-01-14',
          scheduledTime: '12:00',
          status: 'pending',
          priority: 'medium',
          tags: [],
          createdAt: '2026-01-14T00:00:00Z',
          updatedAt: '2026-01-14T00:00:00Z',
        },
        {
          id: 'task2',
          title: 'Task at 08:00',
          description: '',
          date: '2026-01-14',
          scheduledTime: '08:00',
          status: 'pending',
          priority: 'medium',
          tags: [],
          createdAt: '2026-01-14T00:00:00Z',
          updatedAt: '2026-01-14T00:00:00Z',
        },
      ];
      const events: CalendarEvent[] = [
        {
          id: 'event1',
          calendarId: 'primary',
          title: 'Event at 10:00',
          startTime: '2026-01-14T10:00:00+09:00',
          endTime: '2026-01-14T11:00:00+09:00',
          isAllDay: false,
          status: 'confirmed',
        },
      ];

      const items = toTimelineItems(tasks, events);

      expect(items).toHaveLength(3);
      expect(items[0].title).toBe('Task at 08:00');
      expect(items[1].title).toBe('Event at 10:00');
      expect(items[2].title).toBe('Task at 12:00');
    });
  });

  describe('isCalendarEvent', () => {
    it('should return true for calendar event', () => {
      const event: CalendarEvent = {
        id: 'event1',
        calendarId: 'primary',
        title: 'Meeting',
        startTime: '2026-01-14T10:00:00Z',
        endTime: '2026-01-14T11:00:00Z',
        isAllDay: false,
        status: 'confirmed',
      };

      expect(isCalendarEvent(event)).toBe(true);
    });

    it('should return false for task', () => {
      const task: Task = {
        id: 'task1',
        title: 'Task',
        description: '',
        date: '2026-01-14',
        scheduledTime: '10:00',
        status: 'pending',
        priority: 'medium',
        tags: [],
        createdAt: '2026-01-14T00:00:00Z',
        updatedAt: '2026-01-14T00:00:00Z',
      };

      expect(isCalendarEvent(task)).toBe(false);
    });
  });

  describe('isTask', () => {
    it('should return true for task', () => {
      const task: Task = {
        id: 'task1',
        title: 'Task',
        description: '',
        date: '2026-01-14',
        scheduledTime: '10:00',
        status: 'pending',
        priority: 'medium',
        tags: [],
        createdAt: '2026-01-14T00:00:00Z',
        updatedAt: '2026-01-14T00:00:00Z',
      };

      expect(isTask(task)).toBe(true);
    });

    it('should return false for calendar event', () => {
      const event: CalendarEvent = {
        id: 'event1',
        calendarId: 'primary',
        title: 'Meeting',
        startTime: '2026-01-14T10:00:00Z',
        endTime: '2026-01-14T11:00:00Z',
        isAllDay: false,
        status: 'confirmed',
      };

      expect(isTask(event)).toBe(false);
    });
  });
});
