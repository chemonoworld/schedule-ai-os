import { create } from 'zustand';
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput, SubTask, CreateSubTaskInput } from '@schedule-ai/core';
import { formatDate } from '@schedule-ai/core';
import * as db from '../db';

interface TaskState {
  tasks: Task[];
  selectedDate: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  setSelectedDate: (date: string) => void;
  loadTasks: (date?: string) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (taskId: string, input: UpdateTaskInput) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  // SubTask actions
  createSubTask: (input: CreateSubTaskInput) => Promise<SubTask>;
  updateSubTaskStatus: (taskId: string, subTaskId: string, status: TaskStatus) => Promise<void>;
  updateSubTask: (taskId: string, subTaskId: string, title: string) => Promise<void>;
  deleteSubTask: (taskId: string, subTaskId: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedDate: formatDate(new Date()),
  isLoading: false,
  error: null,

  setSelectedDate: (date: string) => {
    set({ selectedDate: date });
    get().loadTasks(date);
  },

  loadTasks: async (date?: string) => {
    const targetDate = date ?? get().selectedDate;
    set({ isLoading: true, error: null });

    try {
      const tasks = await db.getTasksByDate(targetDate);
      set({ tasks, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load tasks',
        isLoading: false,
      });
    }
  },

  createTask: async (input: CreateTaskInput) => {
    set({ isLoading: true, error: null });

    try {
      const task = await db.createTask(input);
      const { tasks } = get();
      set({ tasks: [...tasks, task], isLoading: false });
      return task;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create task',
        isLoading: false,
      });
      throw error;
    }
  },

  updateTask: async (taskId: string, input: UpdateTaskInput) => {
    try {
      const updatedTask = await db.updateTask(taskId, input);
      if (updatedTask) {
        const { tasks } = get();
        set({
          tasks: tasks.map((t) => (t.id === taskId ? updatedTask : t)),
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update task',
      });
    }
  },

  updateTaskStatus: async (taskId: string, status: TaskStatus) => {
    try {
      const { tasks } = get();
      const task = tasks.find(t => t.id === taskId);

      // 태스크 완료 시 모든 서브태스크도 완료 처리
      if (status === 'completed' && task?.subtasks && task.subtasks.length > 0) {
        for (const subtask of task.subtasks) {
          if (subtask.status !== 'completed') {
            await db.updateSubTask(subtask.id, { status: 'completed' });
          }
        }
      }

      const updatedTask = await db.updateTask(taskId, { status });
      if (updatedTask) {
        // 서브태스크 상태도 업데이트된 것으로 반영
        const updatedSubtasks = status === 'completed' && task?.subtasks
          ? task.subtasks.map(st => ({ ...st, status: 'completed' as TaskStatus }))
          : task?.subtasks;

        set({
          tasks: tasks.map((t) => (t.id === taskId
            ? { ...updatedTask, subtasks: updatedSubtasks }
            : t)),
        });
      }
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to update task',
      });
    }
  },

  deleteTask: async (taskId: string) => {
    try {
      const { tasks } = get();
      await db.deleteTask(taskId);
      set({ tasks: tasks.filter((t) => t.id !== taskId) });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to delete task',
      });
    }
  },

  createSubTask: async (input: CreateSubTaskInput) => {
    try {
      const subTask = await db.createSubTask(input);
      const { tasks } = get();
      set({
        tasks: tasks.map((t) => {
          if (t.id === input.taskId) {
            return {
              ...t,
              subtasks: [...(t.subtasks || []), subTask],
            };
          }
          return t;
        }),
      });
      return subTask;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create subtask',
      });
      throw error;
    }
  },

  updateSubTaskStatus: async (taskId: string, subTaskId: string, status: TaskStatus) => {
    try {
      const updatedSubTask = await db.updateSubTask(subTaskId, { status });
      if (updatedSubTask) {
        const { tasks } = get();
        let updatedTasks = tasks.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              subtasks: t.subtasks?.map((st) =>
                st.id === subTaskId ? updatedSubTask : st
              ),
            };
          }
          return t;
        });

        // 모든 서브태스크가 완료되었는지 확인
        const task = updatedTasks.find(t => t.id === taskId);
        if (task && task.subtasks && task.subtasks.length > 0) {
          const allCompleted = task.subtasks.every(st => st.status === 'completed');
          const anyIncomplete = task.subtasks.some(st => st.status !== 'completed');

          // 모든 서브태스크 완료 → 태스크도 완료
          if (allCompleted && task.status !== 'completed') {
            const completedTask = await db.updateTask(taskId, { status: 'completed' });
            if (completedTask) {
              updatedTasks = updatedTasks.map(t =>
                t.id === taskId ? { ...completedTask, subtasks: task.subtasks } : t
              );
            }
          }
          // 서브태스크 중 하나라도 미완료 → 태스크도 미완료로 되돌림
          else if (anyIncomplete && task.status === 'completed') {
            const pendingTask = await db.updateTask(taskId, { status: 'pending' });
            if (pendingTask) {
              updatedTasks = updatedTasks.map(t =>
                t.id === taskId ? { ...pendingTask, subtasks: task.subtasks } : t
              );
            }
          }
        }

        set({ tasks: updatedTasks });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update subtask',
      });
    }
  },

  updateSubTask: async (taskId: string, subTaskId: string, title: string) => {
    try {
      const updatedSubTask = await db.updateSubTask(subTaskId, { title });
      if (updatedSubTask) {
        const { tasks } = get();
        set({
          tasks: tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                subtasks: t.subtasks?.map((st) =>
                  st.id === subTaskId ? updatedSubTask : st
                ),
              };
            }
            return t;
          }),
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update subtask',
      });
    }
  },

  deleteSubTask: async (taskId: string, subTaskId: string) => {
    try {
      const database = await db.getDb();
      await database.execute(`DELETE FROM subtasks WHERE id = $1`, [subTaskId]);
      const { tasks } = get();
      set({
        tasks: tasks.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              subtasks: t.subtasks?.filter((st) => st.id !== subTaskId),
            };
          }
          return t;
        }),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete subtask',
      });
    }
  },
}));
