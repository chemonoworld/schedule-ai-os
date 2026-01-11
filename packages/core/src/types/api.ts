// API request/response types for Tauri commands

import type { Plan, Task, SubTask, ParsedPlanContent, RecurrenceType } from './models';
export type { CoreTime, RecurringPlan, ParsedRecurrencePattern, GeneratedTaskPreview } from './models';

// Plan API
export interface CreatePlanInput {
  title: string;
  description?: string;
  originalInput: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdatePlanInput {
  title?: string;
  description?: string;
  priority?: number;
  startDate?: string;
  endDate?: string;
  status?: Plan['status'];
}

// Task API
export interface CreateTaskInput {
  planId?: string;
  title: string;
  description?: string;
  location?: string;
  scheduledDate: string;
  scheduledTime?: string;
  estimatedDuration?: number;
  priority?: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  location?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  priority?: number;
  status?: Task['status'];
  orderIndex?: number;
}

// SubTask API
export interface CreateSubTaskInput {
  taskId: string;
  title: string;
}

export interface UpdateSubTaskInput {
  title?: string;
  status?: SubTask['status'];
  orderIndex?: number;
}

// CoreTime API
export interface CreateCoreTimeInput {
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  blockedApps?: string[];
}

export interface UpdateCoreTimeInput {
  id: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
  blockedApps?: string[];
  isActive?: boolean;
}

// LLM API
export interface LLMContext {
  plans?: Plan[];
  recentTasks?: Task[];
  currentDate?: string;
  userPreferences?: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ParsePlanResponse {
  parsedContent: ParsedPlanContent;
}

export interface GenerateDailyTasksResponse {
  tasks: Omit<CreateTaskInput, 'planId'>[];
  summary: string;
}

export interface SplitTaskResponse {
  subtasks: { title: string; estimatedMinutes: number }[];
}

export interface GenerateNotificationResponse {
  title: string;
  body: string;
  urgency: 'low' | 'medium' | 'high';
}

// Focus Mode API
export interface FocusConfig {
  blockedApps: string[];
  duration?: number;
  coreTimeId?: string;
}

export interface FocusStatus {
  isActive: boolean;
  startedAt?: string;
  endsAt?: string;
  currentCoreTimeId?: string;
}

// Recurring Plan API
export interface CreateRecurringPlanInput {
  planId?: string;
  title: string;
  description?: string;
  location?: string;  // 장소
  recurrenceType: RecurrenceType;
  intervalValue?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  scheduledTime?: string;
  endTime?: string;
  estimatedDuration?: number;
  startDate: string;
  endDate?: string;
}

export interface UpdateRecurringPlanInput {
  title?: string;
  description?: string;
  location?: string;  // 장소
  recurrenceType?: RecurrenceType;
  intervalValue?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  scheduledTime?: string;
  endTime?: string;
  estimatedDuration?: number;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}
