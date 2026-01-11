import type { Task, TaskStatus } from '@schedule-ai/core';
import { Checkbox } from './Checkbox';
import { Card } from './Card';

export interface TaskItemProps {
  task: Task;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onEdit?: (task: Task) => void;
  onSplit?: (taskId: string) => void;
}

export function TaskItem({
  task,
  onStatusChange,
  onEdit,
  onSplit,
}: TaskItemProps) {
  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in_progress';

  const handleCheckboxChange = () => {
    if (!onStatusChange) return;

    if (isCompleted) {
      onStatusChange(task.id, 'pending');
    } else {
      onStatusChange(task.id, 'completed');
    }
  };

  const priorityColors: Record<number, string> = {
    0: 'border-l-gray-300',
    1: 'border-l-blue-400',
    2: 'border-l-yellow-400',
    3: 'border-l-red-400',
  };

  const priorityColor = priorityColors[task.priority] ?? priorityColors[0];

  return (
    <Card
      padding="sm"
      className={`border-l-4 ${priorityColor} ${
        isCompleted ? 'opacity-60' : ''
      } ${isInProgress ? 'ring-2 ring-blue-200' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Checkbox checked={isCompleted} onChange={handleCheckboxChange} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4
              className={`font-medium ${
                isCompleted ? 'line-through text-gray-400' : 'text-gray-900'
              }`}
            >
              {task.title}
            </h4>
            {isInProgress && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                진행 중
              </span>
            )}
          </div>

          {task.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
            {task.scheduledTime && <span>{task.scheduledTime}</span>}
            {task.estimatedDuration && <span>{task.estimatedDuration}분</span>}
            {task.subtasks && task.subtasks.length > 0 && (
              <span>
                {task.subtasks.filter((s) => s.status === 'completed').length}/
                {task.subtasks.length} 완료
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {onSplit && !isCompleted && (
            <button
              onClick={() => onSplit(task.id)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="태스크 분해"
            >
              <SplitIcon />
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(task)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="편집"
            >
              <EditIcon />
            </button>
          )}
        </div>
      </div>

      {task.subtasks && task.subtasks.length > 0 && (
        <div className="mt-3 pl-8 space-y-2">
          {task.subtasks.map((subtask) => (
            <div key={subtask.id} className="flex items-center gap-2">
              <Checkbox
                checked={subtask.status === 'completed'}
                className="scale-90"
              />
              <span
                className={`text-sm ${
                  subtask.status === 'completed'
                    ? 'line-through text-gray-400'
                    : 'text-gray-600'
                }`}
              >
                {subtask.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SplitIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 3h5v5" />
      <path d="M8 3H3v5" />
      <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
      <path d="m15 9 6-6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}
