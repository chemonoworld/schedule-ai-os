// Database wrapper using tauri-plugin-sql
import Database from '@tauri-apps/plugin-sql';
import type {
  Plan,
  Task,
  SubTask,
  RecurringPlan,
  CreatePlanInput,
  UpdatePlanInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateSubTaskInput,
  UpdateSubTaskInput,
  CreateRecurringPlanInput,
  UpdateRecurringPlanInput,
  RecurrenceType,
} from '@schedule-ai/core';
import { generateId, formatDateTime, formatDate } from '@schedule-ai/core';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    console.log('Loading database...');
    try {
      db = await Database.load('sqlite:schedule.db');
      console.log('Database loaded successfully');
    } catch (error) {
      console.error('Failed to load database:', error);
      throw error;
    }
  }
  return db;
}

// Plan operations
export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const database = await getDb();
  const id = generateId();
  const now = formatDateTime(new Date());

  await database.execute(
    `INSERT INTO plans (id, title, description, original_input, priority, start_date, end_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, $5, $6, 'active', $7, $8)`,
    [
      id,
      input.title,
      input.description ?? null,
      input.originalInput,
      input.startDate ?? null,
      input.endDate ?? null,
      now,
      now,
    ]
  );

  return {
    id,
    title: input.title,
    description: input.description,
    originalInput: input.originalInput,
    priority: 0,
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export async function getPlans(): Promise<Plan[]> {
  const database = await getDb();
  const rows = await database.select<PlanRow[]>(
    `SELECT id, title, description, original_input, parsed_content, priority,
            start_date, end_date, recurrence, status, created_at, updated_at
     FROM plans
     WHERE status != 'archived'
     ORDER BY priority DESC, created_at DESC`
  );

  return rows.map(rowToPlan);
}

export async function getPlan(id: string): Promise<Plan | null> {
  const database = await getDb();
  const rows = await database.select<PlanRow[]>(
    `SELECT id, title, description, original_input, parsed_content, priority,
            start_date, end_date, recurrence, status, created_at, updated_at
     FROM plans WHERE id = $1`,
    [id]
  );

  return rows.length > 0 ? rowToPlan(rows[0]) : null;
}

export async function updatePlan(
  id: string,
  input: UpdatePlanInput
): Promise<Plan | null> {
  const database = await getDb();
  const now = formatDateTime(new Date());

  const updates: string[] = ['updated_at = $1'];
  const values: unknown[] = [now];
  let paramIndex = 2;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIndex++}`);
    values.push(input.priority);
  }
  if (input.startDate !== undefined) {
    updates.push(`start_date = $${paramIndex++}`);
    values.push(input.startDate);
  }
  if (input.endDate !== undefined) {
    updates.push(`end_date = $${paramIndex++}`);
    values.push(input.endDate);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }

  values.push(id);

  await database.execute(
    `UPDATE plans SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  return getPlan(id);
}

export async function deletePlan(id: string): Promise<void> {
  const database = await getDb();
  const now = formatDateTime(new Date());

  await database.execute(
    `UPDATE plans SET status = 'archived', updated_at = $1 WHERE id = $2`,
    [now, id]
  );
}

// Task operations
export async function createTask(input: CreateTaskInput, skipProgressUpdate = false): Promise<Task> {
  const database = await getDb();
  const id = generateId();
  const now = formatDateTime(new Date());
  const priority = input.priority ?? 0;

  await database.execute(
    `INSERT INTO tasks (id, plan_id, title, description, location, scheduled_date, scheduled_time,
                       estimated_duration, priority, status, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 0, $10, $11)`,
    [
      id,
      input.planId ?? null,
      input.title,
      input.description ?? null,
      input.location ?? null,
      input.scheduledDate,
      input.scheduledTime ?? null,
      input.estimatedDuration ?? null,
      priority,
      now,
      now,
    ]
  );

  const task: Task = {
    id,
    planId: input.planId,
    title: input.title,
    description: input.description,
    location: input.location,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    estimatedDuration: input.estimatedDuration,
    priority,
    status: 'pending',
    orderIndex: 0,
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  };

  // daily_progress 자동 업데이트
  if (!skipProgressUpdate) {
    await updateDailyProgress(input.scheduledDate);
  }

  return task;
}

export async function getTasksByDate(date: string): Promise<Task[]> {
  const database = await getDb();

  const taskRows = await database.select<TaskRow[]>(
    `SELECT id, plan_id, title, description, location, scheduled_date, scheduled_time,
            estimated_duration, actual_duration, priority, status, order_index,
            created_at, updated_at, completed_at
     FROM tasks
     WHERE scheduled_date = $1
     ORDER BY order_index ASC, scheduled_time ASC NULLS LAST, priority DESC`,
    [date]
  );

  const tasks: Task[] = [];

  for (const row of taskRows) {
    const subtaskRows = await database.select<SubTaskRow[]>(
      `SELECT id, task_id, title, status, order_index, created_at, completed_at
       FROM subtasks
       WHERE task_id = $1
       ORDER BY order_index ASC`,
      [row.id]
    );

    const task = rowToTask(row);
    task.subtasks = subtaskRows.map(rowToSubTask);
    tasks.push(task);
  }

  return tasks;
}

export async function getTasksByDateRange(startDate: string, endDate: string): Promise<Task[]> {
  const database = await getDb();

  const taskRows = await database.select<TaskRow[]>(
    `SELECT id, plan_id, title, description, location, scheduled_date, scheduled_time,
            estimated_duration, actual_duration, priority, status, order_index,
            created_at, updated_at, completed_at
     FROM tasks
     WHERE scheduled_date >= $1 AND scheduled_date <= $2
     ORDER BY scheduled_date ASC, order_index ASC`,
    [startDate, endDate]
  );

  return taskRows.map(rowToTask);
}

// Daily Progress operations
export interface DailyProgressRow {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  skipped_tasks: number;
  total_estimated_minutes: number;
  total_actual_minutes: number;
  completion_rate: number;
  streak_count: number;
  updated_at: string;
}

export interface DailyProgress {
  date: string;
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  completionRate: number;
  streakCount: number;
}

export async function updateDailyProgress(date: string): Promise<DailyProgress> {
  const database = await getDb();
  const now = formatDateTime(new Date());

  // 해당 날짜의 태스크 통계 계산
  const stats = await database.select<{
    total: number;
    completed: number;
    skipped: number;
    estimated: number;
    actual: number;
  }[]>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
      COALESCE(SUM(estimated_duration), 0) as estimated,
      COALESCE(SUM(actual_duration), 0) as actual
     FROM tasks WHERE scheduled_date = $1`,
    [date]
  );

  const { total, completed, skipped, estimated, actual } = stats[0] || {
    total: 0, completed: 0, skipped: 0, estimated: 0, actual: 0
  };

  const denominator = total - skipped;
  const completionRate = denominator > 0 ? completed / denominator : 0;

  // UPSERT: 있으면 업데이트, 없으면 삽입
  await database.execute(
    `INSERT INTO daily_progress (date, total_tasks, completed_tasks, skipped_tasks,
                                  total_estimated_minutes, total_actual_minutes,
                                  completion_rate, streak_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
     ON CONFLICT(date) DO UPDATE SET
       total_tasks = $2,
       completed_tasks = $3,
       skipped_tasks = $4,
       total_estimated_minutes = $5,
       total_actual_minutes = $6,
       completion_rate = $7,
       updated_at = $8`,
    [date, total, completed, skipped, estimated, actual, completionRate, now]
  );

  return {
    date,
    totalTasks: total,
    completedTasks: completed,
    skippedTasks: skipped,
    totalEstimatedMinutes: estimated,
    totalActualMinutes: actual,
    completionRate,
    streakCount: 0,
  };
}

export async function getDailyProgressByYear(year: number): Promise<DailyProgress[]> {
  const database = await getDb();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const rows = await database.select<DailyProgressRow[]>(
    `SELECT date, total_tasks, completed_tasks, skipped_tasks,
            total_estimated_minutes, total_actual_minutes,
            completion_rate, streak_count, updated_at
     FROM daily_progress
     WHERE date >= $1 AND date <= $2
     ORDER BY date ASC`,
    [startDate, endDate]
  );

  return rows.map(row => ({
    date: row.date,
    totalTasks: row.total_tasks,
    completedTasks: row.completed_tasks,
    skippedTasks: row.skipped_tasks,
    totalEstimatedMinutes: row.total_estimated_minutes,
    totalActualMinutes: row.total_actual_minutes,
    completionRate: row.completion_rate,
    streakCount: row.streak_count,
  }));
}

// 스트릭 계산을 위해 최근 N일간의 progress 가져오기
export async function getRecentDailyProgress(days: number = 365): Promise<DailyProgress[]> {
  const database = await getDb();
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);

  const rows = await database.select<DailyProgressRow[]>(
    `SELECT date, total_tasks, completed_tasks, skipped_tasks,
            total_estimated_minutes, total_actual_minutes,
            completion_rate, streak_count, updated_at
     FROM daily_progress
     WHERE date >= $1 AND date <= $2
     ORDER BY date DESC`,
    [formatDate(startDate), formatDate(today)]
  );

  return rows.map(row => ({
    date: row.date,
    totalTasks: row.total_tasks,
    completedTasks: row.completed_tasks,
    skippedTasks: row.skipped_tasks,
    totalEstimatedMinutes: row.total_estimated_minutes,
    totalActualMinutes: row.total_actual_minutes,
    completionRate: row.completion_rate,
    streakCount: row.streak_count,
  }));
}

// 기존 태스크 데이터로부터 daily_progress 테이블 동기화
export async function syncDailyProgressFromTasks(): Promise<number> {
  const database = await getDb();
  const now = formatDateTime(new Date());

  // 태스크가 없는 날짜의 daily_progress 레코드 삭제
  await database.execute(
    `DELETE FROM daily_progress
     WHERE date NOT IN (SELECT DISTINCT scheduled_date FROM tasks)`
  );

  // 모든 태스크가 있는 날짜 조회
  const dates = await database.select<{ scheduled_date: string }[]>(
    `SELECT DISTINCT scheduled_date FROM tasks ORDER BY scheduled_date`
  );

  let synced = 0;
  for (const { scheduled_date } of dates) {
    // 해당 날짜의 통계 계산
    const stats = await database.select<{
      total: number;
      completed: number;
      skipped: number;
      estimated: number;
      actual: number;
    }[]>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
        COALESCE(SUM(estimated_duration), 0) as estimated,
        COALESCE(SUM(actual_duration), 0) as actual
       FROM tasks WHERE scheduled_date = $1`,
      [scheduled_date]
    );

    const { total, completed, skipped, estimated, actual } = stats[0] || {
      total: 0, completed: 0, skipped: 0, estimated: 0, actual: 0
    };

    const denominator = total - skipped;
    const completionRate = denominator > 0 ? completed / denominator : 0;

    // UPSERT
    await database.execute(
      `INSERT INTO daily_progress (date, total_tasks, completed_tasks, skipped_tasks,
                                    total_estimated_minutes, total_actual_minutes,
                                    completion_rate, streak_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
       ON CONFLICT(date) DO UPDATE SET
         total_tasks = $2,
         completed_tasks = $3,
         skipped_tasks = $4,
         total_estimated_minutes = $5,
         total_actual_minutes = $6,
         completion_rate = $7,
         updated_at = $8`,
      [scheduled_date, total, completed, skipped, estimated, actual, completionRate, now]
    );
    synced++;
  }

  return synced;
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
  skipProgressUpdate = false
): Promise<Task | null> {
  const database = await getDb();
  const now = formatDateTime(new Date());

  // 업데이트 전 기존 날짜 조회 (날짜 변경 시 두 날짜 모두 업데이트 필요)
  const oldRows = await database.select<{ scheduled_date: string }[]>(
    `SELECT scheduled_date FROM tasks WHERE id = $1`,
    [id]
  );
  const oldDate = oldRows[0]?.scheduled_date;

  const updates: string[] = ['updated_at = $1'];
  const values: unknown[] = [now];
  let paramIndex = 2;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.location !== undefined) {
    updates.push(`location = $${paramIndex++}`);
    values.push(input.location);
  }
  if (input.scheduledDate !== undefined) {
    updates.push(`scheduled_date = $${paramIndex++}`);
    values.push(input.scheduledDate);
  }
  if (input.scheduledTime !== undefined) {
    updates.push(`scheduled_time = $${paramIndex++}`);
    values.push(input.scheduledTime);
  }
  if (input.estimatedDuration !== undefined) {
    updates.push(`estimated_duration = $${paramIndex++}`);
    values.push(input.estimatedDuration);
  }
  if (input.actualDuration !== undefined) {
    updates.push(`actual_duration = $${paramIndex++}`);
    values.push(input.actualDuration);
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIndex++}`);
    values.push(input.priority);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
    if (input.status === 'completed') {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(now);
    }
  }
  if (input.orderIndex !== undefined) {
    updates.push(`order_index = $${paramIndex++}`);
    values.push(input.orderIndex);
  }

  values.push(id);

  await database.execute(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  // Fetch updated task with subtasks
  const taskRows = await database.select<TaskRow[]>(
    `SELECT id, plan_id, title, description, location, scheduled_date, scheduled_time,
            estimated_duration, actual_duration, priority, status, order_index,
            created_at, updated_at, completed_at
     FROM tasks WHERE id = $1`,
    [id]
  );

  if (taskRows.length === 0) return null;

  const subtaskRows = await database.select<SubTaskRow[]>(
    `SELECT id, task_id, title, status, order_index, created_at, completed_at
     FROM subtasks WHERE task_id = $1 ORDER BY order_index ASC`,
    [id]
  );

  const task = rowToTask(taskRows[0]);
  task.subtasks = subtaskRows.map(rowToSubTask);

  // daily_progress 업데이트 (상태 변경 또는 날짜 변경 시)
  if (!skipProgressUpdate && (input.status !== undefined || input.scheduledDate !== undefined)) {
    // 현재 날짜 업데이트
    await updateDailyProgress(task.scheduledDate);
    // 날짜가 변경된 경우 이전 날짜도 업데이트
    if (input.scheduledDate !== undefined && oldDate && oldDate !== input.scheduledDate) {
      await updateDailyProgress(oldDate);
    }
  }

  return task;
}

export async function deleteTask(id: string, skipProgressUpdate = false): Promise<void> {
  const database = await getDb();

  // 삭제 전 날짜 조회
  const rows = await database.select<{ scheduled_date: string }[]>(
    `SELECT scheduled_date FROM tasks WHERE id = $1`,
    [id]
  );
  const scheduledDate = rows[0]?.scheduled_date;

  // 서브태스크 먼저 삭제
  await database.execute(`DELETE FROM subtasks WHERE task_id = $1`, [id]);
  // 태스크 삭제
  await database.execute(`DELETE FROM tasks WHERE id = $1`, [id]);

  // daily_progress 업데이트
  if (!skipProgressUpdate && scheduledDate) {
    await updateDailyProgress(scheduledDate);
  }
}

// SubTask operations
export async function createSubTask(input: CreateSubTaskInput): Promise<SubTask> {
  const database = await getDb();
  const id = generateId();
  const now = formatDateTime(new Date());

  const maxOrderResult = await database.select<{ max_order: number | null }[]>(
    `SELECT MAX(order_index) as max_order FROM subtasks WHERE task_id = $1`,
    [input.taskId]
  );
  const orderIndex = (maxOrderResult[0]?.max_order ?? -1) + 1;

  await database.execute(
    `INSERT INTO subtasks (id, task_id, title, status, order_index, created_at)
     VALUES ($1, $2, $3, 'pending', $4, $5)`,
    [id, input.taskId, input.title, orderIndex, now]
  );

  return {
    id,
    taskId: input.taskId,
    title: input.title,
    status: 'pending',
    orderIndex,
    createdAt: now,
  };
}

export async function updateSubTask(
  id: string,
  input: UpdateSubTaskInput
): Promise<SubTask | null> {
  const database = await getDb();
  const now = formatDateTime(new Date());

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(input.title);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
    if (input.status === 'completed') {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(now);
    }
  }
  if (input.orderIndex !== undefined) {
    updates.push(`order_index = $${paramIndex++}`);
    values.push(input.orderIndex);
  }

  if (updates.length === 0) {
    const rows = await database.select<SubTaskRow[]>(
      `SELECT * FROM subtasks WHERE id = $1`,
      [id]
    );
    return rows.length > 0 ? rowToSubTask(rows[0]) : null;
  }

  values.push(id);

  await database.execute(
    `UPDATE subtasks SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  const rows = await database.select<SubTaskRow[]>(
    `SELECT id, task_id, title, status, order_index, created_at, completed_at
     FROM subtasks WHERE id = $1`,
    [id]
  );

  return rows.length > 0 ? rowToSubTask(rows[0]) : null;
}

// Row types
interface PlanRow {
  id: string;
  title: string;
  description: string | null;
  original_input: string | null;
  parsed_content: string | null;
  priority: number;
  start_date: string | null;
  end_date: string | null;
  recurrence: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  plan_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  estimated_duration: number | null;
  actual_duration: number | null;
  priority: number;
  status: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface SubTaskRow {
  id: string;
  task_id: string;
  title: string;
  status: string;
  order_index: number;
  created_at: string;
  completed_at: string | null;
}

function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    originalInput: row.original_input ?? undefined,
    parsedContent: row.parsed_content
      ? JSON.parse(row.parsed_content)
      : undefined,
    priority: row.priority,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    recurrence: row.recurrence ? JSON.parse(row.recurrence) : undefined,
    status: row.status as Plan['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    planId: row.plan_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time ?? undefined,
    estimatedDuration: row.estimated_duration ?? undefined,
    actualDuration: row.actual_duration ?? undefined,
    priority: row.priority,
    status: row.status as Task['status'],
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function rowToSubTask(row: SubTaskRow): SubTask {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    status: row.status as SubTask['status'],
    orderIndex: row.order_index,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

// RecurringPlan operations

interface RecurringPlanRow {
  id: string;
  plan_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  recurrence_type: string;
  interval_value: number;
  days_of_week: string | null;
  day_of_month: number | null;
  scheduled_time: string | null;
  end_time: string | null;
  estimated_duration: number | null;
  start_date: string;
  end_date: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToRecurringPlan(row: RecurringPlanRow): RecurringPlan {
  return {
    id: row.id,
    planId: row.plan_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    recurrenceType: row.recurrence_type as RecurrenceType,
    intervalValue: row.interval_value,
    daysOfWeek: row.days_of_week ? JSON.parse(row.days_of_week) : undefined,
    dayOfMonth: row.day_of_month ?? undefined,
    scheduledTime: row.scheduled_time ?? undefined,
    endTime: row.end_time ?? undefined,
    estimatedDuration: row.estimated_duration ?? undefined,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createRecurringPlan(input: CreateRecurringPlanInput): Promise<RecurringPlan> {
  const database = await getDb();
  const id = generateId();
  const now = formatDateTime(new Date());

  await database.execute(
    `INSERT INTO recurring_plans (
      id, plan_id, title, description, location, recurrence_type, interval_value,
      days_of_week, day_of_month, scheduled_time, end_time,
      estimated_duration, start_date, end_date, is_active, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, $15, $16)`,
    [
      id,
      input.planId ?? null,
      input.title,
      input.description ?? null,
      input.location ?? null,
      input.recurrenceType,
      input.intervalValue ?? 1,
      input.daysOfWeek ? JSON.stringify(input.daysOfWeek) : null,
      input.dayOfMonth ?? null,
      input.scheduledTime ?? null,
      input.endTime ?? null,
      input.estimatedDuration ?? null,
      input.startDate,
      input.endDate ?? null,
      now,
      now,
    ]
  );

  return {
    id,
    planId: input.planId,
    title: input.title,
    description: input.description,
    location: input.location,
    recurrenceType: input.recurrenceType,
    intervalValue: input.intervalValue ?? 1,
    daysOfWeek: input.daysOfWeek,
    dayOfMonth: input.dayOfMonth,
    scheduledTime: input.scheduledTime,
    endTime: input.endTime,
    estimatedDuration: input.estimatedDuration,
    startDate: input.startDate,
    endDate: input.endDate,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getRecurringPlans(): Promise<RecurringPlan[]> {
  const database = await getDb();
  const rows = await database.select<RecurringPlanRow[]>(
    `SELECT * FROM recurring_plans WHERE is_active = 1 ORDER BY created_at DESC`
  );
  return rows.map(rowToRecurringPlan);
}

export async function getRecurringPlansByPlanId(planId: string): Promise<RecurringPlan[]> {
  const database = await getDb();
  const rows = await database.select<RecurringPlanRow[]>(
    `SELECT * FROM recurring_plans WHERE plan_id = $1 AND is_active = 1 ORDER BY created_at DESC`,
    [planId]
  );
  return rows.map(rowToRecurringPlan);
}

export async function updateRecurringPlan(
  id: string,
  input: UpdateRecurringPlanInput
): Promise<RecurringPlan | null> {
  const database = await getDb();
  const now = formatDateTime(new Date());

  const updates: string[] = ['updated_at = $1'];
  const values: unknown[] = [now];
  let paramIndex = 2;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.location !== undefined) {
    updates.push(`location = $${paramIndex++}`);
    values.push(input.location);
  }
  if (input.recurrenceType !== undefined) {
    updates.push(`recurrence_type = $${paramIndex++}`);
    values.push(input.recurrenceType);
  }
  if (input.intervalValue !== undefined) {
    updates.push(`interval_value = $${paramIndex++}`);
    values.push(input.intervalValue);
  }
  if (input.daysOfWeek !== undefined) {
    updates.push(`days_of_week = $${paramIndex++}`);
    values.push(JSON.stringify(input.daysOfWeek));
  }
  if (input.dayOfMonth !== undefined) {
    updates.push(`day_of_month = $${paramIndex++}`);
    values.push(input.dayOfMonth);
  }
  if (input.scheduledTime !== undefined) {
    updates.push(`scheduled_time = $${paramIndex++}`);
    values.push(input.scheduledTime);
  }
  if (input.endTime !== undefined) {
    updates.push(`end_time = $${paramIndex++}`);
    values.push(input.endTime);
  }
  if (input.estimatedDuration !== undefined) {
    updates.push(`estimated_duration = $${paramIndex++}`);
    values.push(input.estimatedDuration);
  }
  if (input.startDate !== undefined) {
    updates.push(`start_date = $${paramIndex++}`);
    values.push(input.startDate);
  }
  if (input.endDate !== undefined) {
    updates.push(`end_date = $${paramIndex++}`);
    values.push(input.endDate);
  }
  if (input.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(input.isActive ? 1 : 0);
  }

  values.push(id);

  await database.execute(
    `UPDATE recurring_plans SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  const rows = await database.select<RecurringPlanRow[]>(
    `SELECT * FROM recurring_plans WHERE id = $1`,
    [id]
  );

  return rows.length > 0 ? rowToRecurringPlan(rows[0]) : null;
}

export async function deleteRecurringPlan(id: string): Promise<void> {
  const database = await getDb();

  // 해당 반복 일정에서 생성된 태스크들의 ID와 날짜 조회
  const generatedTasks = await database.select<{ task_id: string; scheduled_date: string }[]>(
    `SELECT gt.task_id, t.scheduled_date
     FROM generated_tasks gt
     JOIN tasks t ON gt.task_id = t.id
     WHERE gt.recurring_plan_id = $1`,
    [id]
  );

  // 영향받는 날짜들 수집
  const affectedDates = new Set<string>();

  // 생성된 태스크들 삭제
  for (const { task_id, scheduled_date } of generatedTasks) {
    affectedDates.add(scheduled_date);
    // 서브태스크 먼저 삭제
    await database.execute(`DELETE FROM subtasks WHERE task_id = $1`, [task_id]);
    // 태스크 삭제
    await database.execute(`DELETE FROM tasks WHERE id = $1`, [task_id]);
  }

  // generated_tasks 레코드 삭제
  await database.execute(`DELETE FROM generated_tasks WHERE recurring_plan_id = $1`, [id]);

  // 반복 일정 삭제
  await database.execute(`DELETE FROM recurring_plans WHERE id = $1`, [id]);

  // 영향받은 날짜들의 daily_progress 업데이트
  for (const date of affectedDates) {
    await updateDailyProgress(date);
  }
}

// generated_tasks 테이블에 기록 (중복 생성 방지)
export async function recordGeneratedTask(
  recurringPlanId: string,
  taskId: string,
  scheduledDate: string
): Promise<void> {
  const database = await getDb();
  const id = generateId();
  const now = formatDateTime(new Date());

  await database.execute(
    `INSERT OR IGNORE INTO generated_tasks (id, recurring_plan_id, task_id, scheduled_date, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, recurringPlanId, taskId, scheduledDate, now]
  );
}

// 이미 생성된 태스크인지 확인
export async function isTaskAlreadyGenerated(
  recurringPlanId: string,
  scheduledDate: string
): Promise<boolean> {
  const database = await getDb();
  const rows = await database.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM generated_tasks
     WHERE recurring_plan_id = $1 AND scheduled_date = $2`,
    [recurringPlanId, scheduledDate]
  );
  return (rows[0]?.count ?? 0) > 0;
}

// 반복 플랜에서 태스크 일괄 생성
export async function generateTasksFromRecurringPlan(
  recurringPlan: RecurringPlan,
  tasksToGenerate: Array<{
    scheduledDate: string;
    scheduledTime?: string;
    title: string;
    description?: string;
    location?: string;
    estimatedDuration?: number;
  }>
): Promise<Task[]> {
  const createdTasks: Task[] = [];

  for (const taskInput of tasksToGenerate) {
    // 이미 생성된 태스크인지 확인
    const alreadyGenerated = await isTaskAlreadyGenerated(
      recurringPlan.id,
      taskInput.scheduledDate
    );

    if (alreadyGenerated) continue;

    // 태스크 생성 (location은 taskInput 또는 recurringPlan에서 가져옴)
    const task = await createTask({
      planId: recurringPlan.planId,
      title: taskInput.title,
      description: taskInput.description,
      location: taskInput.location || recurringPlan.location,
      scheduledDate: taskInput.scheduledDate,
      scheduledTime: taskInput.scheduledTime,
      estimatedDuration: taskInput.estimatedDuration,
      priority: 0,
    });

    // 생성 기록
    await recordGeneratedTask(
      recurringPlan.id,
      task.id,
      taskInput.scheduledDate
    );

    createdTasks.push(task);
  }

  return createdTasks;
}

// Focus Block Stats operations

export interface BlockEvent {
  id: string;
  bundleId: string;
  appName: string;
  blockedAt: string;
}

export interface BlockStat {
  bundleId: string;
  appName: string;
  count: number;
}

export interface DailyBlockStat {
  date: string;
  count: number;
}

interface BlockEventRow {
  id: string;
  bundle_id: string;
  app_name: string;
  blocked_at: string;
}

export async function recordBlockEvent(bundleId: string, appName: string): Promise<BlockEvent> {
  const database = await getDb();
  const id = generateId();
  const now = formatDateTime(new Date());

  await database.execute(
    `INSERT INTO focus_block_events (id, bundle_id, app_name, blocked_at)
     VALUES ($1, $2, $3, $4)`,
    [id, bundleId, appName, now]
  );

  return {
    id,
    bundleId,
    appName,
    blockedAt: now,
  };
}

export async function getBlockStatsByApp(): Promise<BlockStat[]> {
  const database = await getDb();
  const rows = await database.select<{ bundle_id: string; app_name: string; count: number }[]>(
    `SELECT bundle_id, app_name, COUNT(*) as count
     FROM focus_block_events
     GROUP BY bundle_id
     ORDER BY count DESC`
  );

  return rows.map(row => ({
    bundleId: row.bundle_id,
    appName: row.app_name,
    count: row.count,
  }));
}

export async function getBlockStatsByDate(days: number = 7): Promise<DailyBlockStat[]> {
  const database = await getDb();
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);

  const rows = await database.select<{ date: string; count: number }[]>(
    `SELECT DATE(blocked_at) as date, COUNT(*) as count
     FROM focus_block_events
     WHERE DATE(blocked_at) >= $1
     GROUP BY DATE(blocked_at)
     ORDER BY date ASC`,
    [formatDate(startDate)]
  );

  return rows.map(row => ({
    date: row.date,
    count: row.count,
  }));
}

export async function getTotalBlockCount(): Promise<number> {
  const database = await getDb();
  const rows = await database.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM focus_block_events`
  );
  return rows[0]?.count ?? 0;
}

export async function getRecentBlockEvents(limit: number = 10): Promise<BlockEvent[]> {
  const database = await getDb();
  const rows = await database.select<BlockEventRow[]>(
    `SELECT id, bundle_id, app_name, blocked_at
     FROM focus_block_events
     ORDER BY blocked_at DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map(row => ({
    id: row.id,
    bundleId: row.bundle_id,
    appName: row.app_name,
    blockedAt: row.blocked_at,
  }));
}
