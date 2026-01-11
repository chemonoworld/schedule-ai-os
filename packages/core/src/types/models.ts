// Domain models - synced with Rust backend

export type PlanStatus = 'active' | 'paused' | 'completed' | 'archived';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface Plan {
  id: string;
  title: string;
  description?: string;
  originalInput?: string;
  parsedContent?: ParsedPlanContent;
  priority: number;
  startDate?: string;
  endDate?: string;
  recurrence?: RecurrencePattern;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  planId?: string;
  title: string;
  description?: string;
  location?: string;
  scheduledDate: string;
  scheduledTime?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  priority: number;
  status: TaskStatus;
  orderIndex: number;
  subtasks?: SubTask[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SubTask {
  id: string;
  taskId: string;
  title: string;
  status: TaskStatus;
  orderIndex: number;
  createdAt: string;
  completedAt?: string;
}

export interface CoreTime {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  blockedApps?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: string;
}

// 반복 플랜 (구조화된 반복 태스크 생성용)
export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface RecurringPlan {
  id: string;
  planId?: string;
  title: string;
  description?: string;
  location?: string;  // 장소
  recurrenceType: RecurrenceType;
  intervalValue: number;
  daysOfWeek?: number[];  // 0=일, 1=월, ..., 6=토
  dayOfMonth?: number;
  scheduledTime?: string;
  endTime?: string;
  estimatedDuration?: number;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedRecurrencePattern {
  recurrenceType: RecurrenceType;
  intervalValue: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  scheduledTime?: string;
  endTime?: string;
  estimatedDuration?: number;
  startDate?: string;
  endDate?: string;
  title?: string;
  location?: string;  // 장소
}

export interface GeneratedTaskPreview {
  scheduledDate: string;
  scheduledTime?: string;
  title: string;
}

export interface ParsedPlanContent {
  goals: string[];
  milestones: Milestone[];
  suggestedTasks: SuggestedTask[];
}

export interface Milestone {
  title: string;
  targetDate?: string;
  tasks: string[];
}

export interface SuggestedTask {
  title: string;
  estimatedDuration?: number;
  priority: number;
  frequency?: RecurrencePattern;
}

export interface TaskLog {
  id: string;
  taskId: string;
  action: 'created' | 'started' | 'paused' | 'completed' | 'skipped';
  note?: string;
  createdAt: string;
}
