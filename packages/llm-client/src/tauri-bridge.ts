// Bridge to Tauri backend LLM commands
// Note: This will be used in the Tauri app context

import type {
  LLMContext,
  LLMResponse,
  ParsePlanResponse,
  GenerateDailyTasksResponse,
  SplitTaskResponse,
  GenerateNotificationResponse,
} from '@schedule-ai/core';

// Type for Tauri invoke function
type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let invoke: InvokeFn | null = null;

export function setInvoke(fn: InvokeFn): void {
  invoke = fn;
}

function getInvoke(): InvokeFn {
  if (!invoke) {
    throw new Error(
      'Tauri invoke not initialized. Call setInvoke() first.'
    );
  }
  return invoke;
}

export async function processWithLLM(
  prompt: string,
  context: LLMContext
): Promise<LLMResponse> {
  return getInvoke()('process_with_llm', { prompt, context });
}

export async function parsePlan(input: string): Promise<ParsePlanResponse> {
  return getInvoke()('parse_plan', { input });
}

export async function generateDailyTasks(
  planIds: string[],
  date: string
): Promise<GenerateDailyTasksResponse> {
  return getInvoke()('generate_daily_tasks', { planIds, date });
}

export async function splitTask(taskId: string): Promise<SplitTaskResponse> {
  return getInvoke()('split_task', { taskId });
}

export async function generateNotification(
  taskId: string,
  type: 'reminder' | 'start' | 'overdue'
): Promise<GenerateNotificationResponse> {
  return getInvoke()('generate_notification', { taskId, type });
}
