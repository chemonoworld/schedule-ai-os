import { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { useTaskStore } from './stores/taskStore';
import { usePlanStore } from './stores/planStore';
import { useFocusStore } from './stores/focusStore';
import { useSettingsStore, type Language } from './stores/settingsStore';
import { useCalendarStore, type CalendarEvent } from './stores/calendarStore';
import { toTimelineItems, isCalendarEvent } from './types/timeline';
import { formatDate, addDays } from '@schedule-ai/core';
import { getDailyProgressByYear, getRecentDailyProgress } from './db';
import type { DailyProgress as DBDailyProgress } from './db';
import type { Task, SubTask, Plan, RecurringPlan, ParsedRecurrencePattern, RecurrenceType } from '@schedule-ai/core';
import {
  createRecurringPlan,
  getRecurringPlans,
  deleteRecurringPlan,
  generateTasksFromRecurringPlan,
} from './db';
import './App.css';

type Tab = 'today' | 'plans' | 'progress' | 'focus' | 'settings';

// 소요시간 포맷 함수: 280 -> "4h 40m"
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Progress types
interface DailyProgress {
  date: string;
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  completionRate: number;
  streakCount: number;
}

interface HeatmapData {
  date: string;
  level: number;
  completionRate: number;
  taskCount: number;
}

// Swipeable Subtask Component
function SwipeableSubtask({
  subtask,
  onComplete,
  onDelete,
  onEdit,
}: {
  subtask: SubTask;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const startX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (isDeleting) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startX.current = clientX;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || isDeleting) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diffX = clientX - startX.current;

    if (Math.abs(diffX) > 5) {
      setShowActions(true);
    }

    const limitedDiff = Math.max(-80, Math.min(80, diffX));
    setTranslateX(limitedDiff);
  };

  const handleTouchEnd = () => {
    if (!isDragging || isDeleting) return;
    setIsDragging(false);
    const threshold = 50;

    if (translateX > threshold) {
      setTranslateX(0);
      setTimeout(() => setShowActions(false), 200);
      onComplete();
    } else if (translateX < -threshold) {
      setIsDeleting(true);
      setTranslateX(-300);
      setTimeout(() => onDelete(), 200);
    } else {
      setTranslateX(0);
      setTimeout(() => setShowActions(false), 200);
    }
  };

  const isCompleted = subtask.status === 'completed';

  return (
    <div className={`subtask-wrapper ${isDeleting ? 'deleting' : ''}`}>
      <div className="subtask-swipe-container">
        {showActions && (
          <>
            <div className="swipe-action swipe-action-left subtask-action">
              <span>✓</span>
            </div>
            <div className="swipe-action swipe-action-right subtask-action">
              <span>✕</span>
            </div>
          </>
        )}
        <div
          className={`subtask-item ${isCompleted ? 'completed' : ''}`}
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out'
          }}
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          onMouseLeave={() => isDragging && handleTouchEnd()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={onEdit}
        >
          <div
            className="subtask-status"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
          >
            {isCompleted ? '✓' : '○'}
          </div>
          <span className="subtask-title">{subtask.title}</span>
        </div>
      </div>
    </div>
  );
}

// Swipeable Task Item Component
function SwipeableTask({
  task,
  onComplete,
  onDelete,
  onEdit,
  onAddSubtask,
  onSubTaskComplete,
  onSubTaskDelete,
  onSubTaskEdit,
}: {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onAddSubtask: (title: string) => Promise<void>;
  onSubTaskComplete: (subTaskId: string) => void;
  onSubTaskDelete: (subTaskId: string) => void;
  onSubTaskEdit: (subtask: SubTask) => void;
}) {
  const { t } = useTranslation();
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDirection, setDragDirection] = useState<'horizontal' | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(task.subtasks && task.subtasks.length > 0);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (isDeleting || showAddSubtask) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startX.current = clientX;
    startY.current = clientY;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || isDeleting) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diffX = clientX - startX.current;

    // Only allow horizontal swipe
    if (!dragDirection && Math.abs(diffX) > 10) {
      setDragDirection('horizontal');
      setShowActions(true);
    }

    if (dragDirection === 'horizontal') {
      const limitedDiff = Math.max(-120, Math.min(120, diffX));
      setTranslateX(limitedDiff);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || isDeleting) return;
    setIsDragging(false);
    const threshold = 80;

    if (dragDirection === 'horizontal') {
      if (translateX > threshold) {
        setTranslateX(0);
        setTimeout(() => setShowActions(false), 200);
        onComplete();
      } else if (translateX < -threshold) {
        setIsDeleting(true);
        setTranslateX(-400);
        setTimeout(() => onDelete(), 200);
      } else {
        setTranslateX(0);
        setTimeout(() => setShowActions(false), 200);
      }
    }
    setDragDirection(null);
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) {
      return; // Don't close on empty, just ignore
    }
    await onAddSubtask(newSubtaskTitle.trim());
    setNewSubtaskTitle('');
    // Keep input open and focused for adding more
    setTimeout(() => subtaskInputRef.current?.focus(), 50);
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddSubtask();
    } else if (e.key === 'Escape') {
      setShowAddSubtask(false);
      setNewSubtaskTitle('');
    }
  };

  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in_progress';
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const completedSubtasks = task.subtasks?.filter(st => st.status === 'completed').length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  return (
    <div className={`task-wrapper ${isDeleting ? 'deleting' : ''}`}>
      <div className="swipe-container">
        {/* Horizontal actions */}
        {showActions && (
          <>
            <div className="swipe-action swipe-action-left">
              <span>✓ {t('common:task.complete')}</span>
            </div>
            <div className="swipe-action swipe-action-right">
              <span>{t('common:buttons.delete')}</span>
            </div>
          </>
        )}

        {/* Task item */}
        <div
          className={`task-item ${isCompleted ? 'completed' : ''} ${isInProgress ? 'in-progress' : ''}`}
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out'
          }}
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          onMouseLeave={() => isDragging && handleTouchEnd()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={onEdit}
        >
          <div
            className="task-status-indicator"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
          >
            {isCompleted ? '✓' : '○'}
          </div>
          <div className="task-content">
            <span className="task-title">{task.title}</span>
            {task.location && (
              <span className="task-location">📍 {task.location}</span>
            )}
            {task.scheduledTime && (
              <span className="task-time">{task.scheduledTime}</span>
            )}
            {task.estimatedDuration && (
              <span className="task-duration">{formatDuration(task.estimatedDuration)}</span>
            )}
            {hasSubtasks && (
              <span className="subtask-count">{completedSubtasks}/{totalSubtasks}</span>
            )}
          </div>
          {/* Add subtask button */}
          <button
            className="add-subtask-inline-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddSubtask(true);
              setIsExpanded(true);
              setTimeout(() => subtaskInputRef.current?.focus(), 100);
            }}
            title={t('common:task.addSubtask')}
          >
            +
          </button>
          {hasSubtasks && (
            <button
              className="expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? '▲' : '▼'}
            </button>
          )}
          {isInProgress && (
            <span className="status-badge">{t('common:task.inProgress')}</span>
          )}
        </div>
      </div>

      {/* Subtasks and inline input */}
      {(isExpanded || showAddSubtask) && (
        <div className="subtask-list">
          {task.subtasks?.map((subtask) => (
            <SwipeableSubtask
              key={subtask.id}
              subtask={subtask}
              onComplete={() => onSubTaskComplete(subtask.id)}
              onDelete={() => onSubTaskDelete(subtask.id)}
              onEdit={() => onSubTaskEdit(subtask)}
            />
          ))}

          {/* Inline subtask input - always show when expanded or adding */}
          {showAddSubtask && (
            <div className="subtask-input-wrapper">
              <span className="subtask-input-indicator">+</span>
              <input
                ref={subtaskInputRef}
                type="text"
                className="subtask-input"
                placeholder={t('common:task.subtaskPlaceholder')}
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={handleSubtaskKeyDown}
              />
              <button
                className="subtask-input-close"
                onClick={() => {
                  setShowAddSubtask(false);
                  setNewSubtaskTitle('');
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Calendar Event Card Component
interface CalendarEventCardProps {
  event: import('./stores/calendarStore').CalendarEvent;
  onClick?: () => void;
}

function CalendarEventCard({ event, onClick }: CalendarEventCardProps) {
  const { t } = useTranslation();

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Google Calendar 색상 코드를 hex 색상으로 변환
  const getEventColor = (colorId: string | null) => {
    const colors: Record<string, string> = {
      '1': '#7986cb', // Lavender
      '2': '#33b679', // Sage
      '3': '#8e24aa', // Grape
      '4': '#e67c73', // Flamingo
      '5': '#f6bf26', // Banana
      '6': '#f4511e', // Tangerine
      '7': '#039be5', // Peacock
      '8': '#616161', // Graphite
      '9': '#3f51b5', // Blueberry
      '10': '#0b8043', // Basil
      '11': '#d50000', // Tomato
    };
    return colors[colorId ?? ''] ?? '#4285f4'; // Default Google Blue
  };

  return (
    <div
      className="calendar-event-card"
      onClick={onClick}
      style={{
        borderLeftColor: getEventColor(event.colorId),
      }}
    >
      <div className="event-header">
        <span className="event-icon">📅</span>
        <span className="event-title">{event.title}</span>
      </div>

      <div className="event-time">
        {event.isAllDay ? (
          <span className="all-day-badge">{t('common:time.allDay', '종일')}</span>
        ) : (
          <span>
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </span>
        )}
      </div>

      {event.location && (
        <div className="event-location">
          <span className="location-icon">📍</span>
          {event.location}
        </div>
      )}
    </div>
  );
}

// Event Detail Popup Component
interface EventDetailPopupProps {
  event: import('./stores/calendarStore').CalendarEvent;
  onClose: () => void;
}

function EventDetailPopup({ event, onClose }: EventDetailPopupProps) {
  const { t } = useTranslation();

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  return (
    <div className="event-detail-overlay" onClick={onClose}>
      <div className="event-detail-popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3>{event.title}</h3>
          <button className="popup-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="popup-content">
          <div className="detail-row">
            <span className="detail-icon">🕐</span>
            <span>
              {event.isAllDay
                ? `${formatDate(event.startTime)} - ${t('common:time.allDay', '종일')}`
                : `${formatDate(event.startTime)} ${formatTime(event.startTime)} - ${formatTime(event.endTime)}`
              }
            </span>
          </div>

          {event.location && (
            <div className="detail-row">
              <span className="detail-icon">📍</span>
              <span>{event.location}</span>
            </div>
          )}

          {event.description && (
            <div className="detail-row description">
              <p>{event.description}</p>
            </div>
          )}

          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="open-in-google-btn"
            >
              {t('calendar:openInGoogle', 'Google Calendar에서 열기')} →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Focus View Component
function FocusView({ onNavigateToToday }: { onNavigateToToday: () => void }) {
  const { t } = useTranslation('focus');
  const {
    isActive,
    blockedApps,
    runningApps,
    installedApps,
    savedBlocklist,
    elapsedSeconds,
    loadRunningApps,
    loadInstalledApps,
    loadSavedBlocklist,
    addToBlocklist,
    removeFromBlocklist,
    // 타이머 설정
    focusTimerType,
    setFocusTimerType,
    timerDuration,
    setTimerDuration,
    timerSeconds,
    isTimerRunning,
    // 뽀모도로
    pomodoroPhase,
    pomodoroCount,
    pomodoroSettings,
    loadPomodoroSettings,
    savePomodoroSettings,
    startTimer,
    pauseTimer,
    resetTimer,
    skipTimer,
    tickTimer,
    resetPomodoroCount,
    isFocusSessionActive,
    stopFocusSession,
  } = useFocusStore();

  const { tasks, loadTasks, updateTaskStatus } = useTaskStore();

  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTimerSettings, setShowTimerSettings] = useState(false);
  const [showAppSelector, setShowAppSelector] = useState(false);
  const [tempSettings, setTempSettings] = useState(pomodoroSettings);

  // 앱 목록 및 블랙리스트 로드
  useEffect(() => {
    // 저장된 블랙리스트는 즉시 로드 (localStorage, 빠름)
    loadSavedBlocklist();
    // 뽀모도로 설정 로드
    loadPomodoroSettings();
    // 실행 중인 앱도 빠르게 로드
    loadRunningApps();
    // 설치된 앱은 약간 지연 후 백그라운드에서 로드 (무거움)
    const timeout = setTimeout(loadInstalledApps, 100);
    // 10초마다 실행 중인 앱 목록 갱신
    const interval = setInterval(loadRunningApps, 10000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [loadRunningApps, loadInstalledApps, loadSavedBlocklist, loadPomodoroSettings]);

  // 뽀모도로 타이머 틱
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(tickTimer, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, tickTimer]);

  // 저장된 블랙리스트로 초기 선택 설정
  useEffect(() => {
    if (savedBlocklist.length > 0 && selectedApps.length === 0) {
      setSelectedApps(savedBlocklist.map(app => app.bundle_id));
    }
  }, [savedBlocklist]);

  // 집중 모드 활성화 시 오늘 태스크 로드
  useEffect(() => {
    if (!isActive) return;
    // 오늘 태스크 로드
    loadTasks(formatDate(new Date()));
  }, [isActive, loadTasks]);

  const handleToggleApp = (bundleId: string, appName: string) => {
    setSelectedApps((prev) => {
      const isCurrentlySelected = prev.includes(bundleId);
      if (isCurrentlySelected) {
        removeFromBlocklist(bundleId);
        return prev.filter((id) => id !== bundleId);
      } else {
        addToBlocklist({ bundle_id: bundleId, name: appName });
        return [...prev, bundleId];
      }
    });
  };

  const handleStopFocus = () => {
    stopFocusSession();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 뽀모도로 타이머 포맷 (MM:SS)
  const formatTimerTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveTimerSettings = () => {
    savePomodoroSettings(tempSettings);
    setShowTimerSettings(false);
  };

  // 실행 중인 앱 + 설치된 앱 합치기 (중복 제거, 실행 중인 앱 우선)
  const allApps = useMemo(() => {
    const runningBundleIds = new Set(runningApps.map(app => app.bundle_id));
    const combined = [
      ...runningApps,
      ...installedApps.filter(app => !runningBundleIds.has(app.bundle_id))
    ];
    return combined;
  }, [runningApps, installedApps]);

  // 검색 필터링
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) {
      // 검색어 없으면 저장된 블랙리스트 + 실행 중인 앱 (중복 제거)
      const blocklistBundleIds = new Set(savedBlocklist.map(b => b.bundle_id));
      const combined = [
        ...allApps.filter(app => blocklistBundleIds.has(app.bundle_id)),
        ...runningApps.filter(app => !blocklistBundleIds.has(app.bundle_id))
      ];
      return combined;
    }
    // 검색어 있으면 이름으로 필터링
    const query = searchQuery.toLowerCase();
    return allApps.filter(app => app.name.toLowerCase().includes(query));
  }, [allApps, runningApps, savedBlocklist, searchQuery]);

  // 오늘의 Pending 태스크
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="focus-view">
      {!isFocusSessionActive ? (
        // 비활성 상태 - 설정 화면
        <div className="focus-setup">
          {/* 타이머 모드 선택 (상단) */}
          <div className="focus-timer-section-setup">
            <div className="focus-timer-header">
              <h3>{t('timerType.title')}</h3>
              {focusTimerType === 'pomodoro' && (
                <button
                  className="focus-pomodoro-settings-btn"
                  onClick={() => {
                    setTempSettings(pomodoroSettings);
                    setShowTimerSettings(!showTimerSettings);
                  }}
                >
                  ⚙
                </button>
              )}
            </div>

            {/* 타이머 모드 탭 */}
            <div className="focus-timer-type-tabs">
              <button
                className={`focus-timer-type-tab ${focusTimerType === 'none' ? 'active' : ''}`}
                onClick={() => setFocusTimerType('none')}
              >
                <span className="focus-timer-type-name">{t('timerType.none')}</span>
                <span className="focus-timer-type-desc">{t('timerType.noneDesc')}</span>
              </button>
              <button
                className={`focus-timer-type-tab ${focusTimerType === 'timer' ? 'active' : ''}`}
                onClick={() => setFocusTimerType('timer')}
              >
                <span className="focus-timer-type-name">{t('timerType.timer')}</span>
                <span className="focus-timer-type-desc">{t('timerType.timerDesc')}</span>
              </button>
              <button
                className={`focus-timer-type-tab ${focusTimerType === 'pomodoro' ? 'active' : ''}`}
                onClick={() => setFocusTimerType('pomodoro')}
              >
                <span className="focus-timer-type-name">{t('timerType.pomodoro')}</span>
                <span className="focus-timer-type-desc">{t('timerType.pomodoroDesc')}</span>
              </button>
            </div>

            {/* 타이머 모드: 시간:분 설정 */}
            {focusTimerType === 'timer' && (
              <div className="focus-timer-inline-setting">
                <input
                  type="text"
                  inputMode="numeric"
                  value={Math.floor(timerDuration / 60)}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    const hours = Math.min(23, parseInt(val) || 0);
                    const minutes = timerDuration % 60;
                    setTimerDuration(hours * 60 + minutes);
                  }}
                  className="focus-timer-inline-input"
                />
                <span className="focus-timer-inline-separator">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(timerDuration % 60).padStart(2, '0')}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    const hours = Math.floor(timerDuration / 60);
                    const minutes = Math.min(59, parseInt(val) || 0);
                    setTimerDuration(hours * 60 + minutes);
                  }}
                  className="focus-timer-inline-input"
                />
              </div>
            )}

            {/* 뽀모도로 설정 패널 */}
            {showTimerSettings && focusTimerType === 'pomodoro' && (
              <div className="focus-pomodoro-settings">
                <div className="focus-pomodoro-setting-row">
                  <label>{t('timer.settings.focusDuration')}</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={tempSettings.focusDuration}
                    onChange={(e) => setTempSettings({ ...tempSettings, focusDuration: parseInt(e.target.value) || 25 })}
                  />
                </div>
                <div className="focus-pomodoro-setting-row">
                  <label>{t('timer.settings.shortBreakDuration')}</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={tempSettings.shortBreakDuration}
                    onChange={(e) => setTempSettings({ ...tempSettings, shortBreakDuration: parseInt(e.target.value) || 5 })}
                  />
                </div>
                <div className="focus-pomodoro-setting-row">
                  <label>{t('timer.settings.longBreakDuration')}</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={tempSettings.longBreakDuration}
                    onChange={(e) => setTempSettings({ ...tempSettings, longBreakDuration: parseInt(e.target.value) || 15 })}
                  />
                </div>
                <div className="focus-pomodoro-setting-row">
                  <label>{t('timer.settings.longBreakInterval')}</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={tempSettings.longBreakInterval}
                    onChange={(e) => setTempSettings({ ...tempSettings, longBreakInterval: parseInt(e.target.value) || 4 })}
                  />
                </div>
                <button className="focus-pomodoro-save-btn" onClick={handleSaveTimerSettings}>
                  {t('timer.settings.save')}
                </button>
              </div>
            )}

            {/* 뽀모도로 미리보기 (설정 패널이 닫혔을 때) */}
            {!showTimerSettings && focusTimerType === 'pomodoro' && (
              <div className="focus-timer-preview">
                <div className="focus-pomodoro-phase-tabs">
                  <span className={`focus-pomodoro-phase ${pomodoroPhase === 'focus' ? 'active' : ''}`}>
                    {t('timer.focus')}
                  </span>
                  <span className={`focus-pomodoro-phase ${pomodoroPhase === 'shortBreak' ? 'active' : ''}`}>
                    {t('timer.shortBreak')}
                  </span>
                  <span className={`focus-pomodoro-phase ${pomodoroPhase === 'longBreak' ? 'active' : ''}`}>
                    {t('timer.longBreak')}
                  </span>
                </div>
                <div className="focus-timer-display-preview">
                  {formatTimerTime(timerSeconds)}
                </div>
                <div className="focus-pomodoro-count-preview">
                  {t('timer.pomodoroCount', { count: pomodoroCount })}
                </div>
              </div>
            )}

            {/* 차단할 앱 (접히는 섹션) */}
            <div className="focus-app-selector">
              <button
                className="focus-app-selector-toggle"
                onClick={() => setShowAppSelector(!showAppSelector)}
              >
                <span>{t('blockedApps.title')}</span>
                <span className="focus-app-selector-count">{t('blockedApps.count', { count: selectedApps.length })}</span>
                <span className={`focus-app-selector-arrow ${showAppSelector ? 'open' : ''}`}>▼</span>
              </button>

              {showAppSelector && (
                <div className="focus-app-selector-content">
                  {/* 검색창 */}
                  <div className="focus-search">
                    <input
                      type="text"
                      className="focus-search-input"
                      placeholder={t('blockedApps.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        className="focus-search-clear"
                        onClick={() => setSearchQuery('')}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="focus-app-grid">
                    {filteredApps.length === 0 && searchQuery && (
                      <p className="focus-app-hint">{t('blockedApps.noResults')}</p>
                    )}
                    {filteredApps.map((app) => {
                      const isSelected = selectedApps.includes(app.bundle_id);
                      const isRunning = runningApps.some((r) => r.bundle_id === app.bundle_id);
                      return (
                        <button
                          key={app.bundle_id}
                          className={`focus-app-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleApp(app.bundle_id, app.name)}
                        >
                          <span className="focus-app-chip-name">{app.name}</span>
                          {isRunning && <span className="focus-app-chip-dot" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 시작 버튼 */}
            <button
              className="focus-start-btn"
              onClick={() => startTimer(selectedApps)}
              disabled={selectedApps.length === 0}
            >
              {t('start')}
            </button>
          </div>
        </div>
      ) : (
        // 활성 상태 - 집중 화면
        <div className="focus-active-view">
          {/* 타이머 영역 */}
          <div className="focus-timer-section">
            {/* 뽀모도로 모드: 페이즈 탭 표시 */}
            {focusTimerType === 'pomodoro' && (
              <div className="focus-pomodoro-mode-tabs active-view">
                <span className={`focus-pomodoro-mode ${pomodoroPhase === 'focus' ? 'active' : ''}`}>
                  {t('timer.focus')}
                </span>
                <span className={`focus-pomodoro-mode ${pomodoroPhase === 'shortBreak' ? 'active' : ''}`}>
                  {t('timer.shortBreak')}
                </span>
                <span className={`focus-pomodoro-mode ${pomodoroPhase === 'longBreak' ? 'active' : ''}`}>
                  {t('timer.longBreak')}
                </span>
              </div>
            )}

            {/* 타이머 있는 모드: 타이머 디스플레이 */}
            {focusTimerType !== 'none' && (
              <>
                <div className="focus-timer-display pomodoro">
                  {formatTimerTime(timerSeconds)}
                </div>
                {focusTimerType === 'pomodoro' && (
                  <div className="focus-pomodoro-count active-view">
                    {t('timer.pomodoroCount', { count: pomodoroCount })}
                    {pomodoroCount > 0 && (
                      <button
                        className="focus-pomodoro-count-reset"
                        onClick={resetPomodoroCount}
                        title={t('timer.resetCount')}
                      >
                        ↺
                      </button>
                    )}
                  </div>
                )}
                <div className="focus-pomodoro-controls active-view">
                  {isTimerRunning ? (
                    <button className="focus-pomodoro-btn pause" onClick={pauseTimer}>
                      {t('timer.pause')}
                    </button>
                  ) : (
                    <button className="focus-pomodoro-btn start" onClick={() => startTimer(selectedApps)}>
                      {t('timer.start')}
                    </button>
                  )}
                  <button className="focus-pomodoro-btn reset" onClick={resetTimer}>
                    {t('timer.reset')}
                  </button>
                  {focusTimerType === 'pomodoro' && (
                    <button className="focus-pomodoro-btn skip" onClick={skipTimer}>
                      {t('timer.skip')}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* 타이머 없는 모드: 경과 시간만 표시 */}
            {focusTimerType === 'none' && (
              <div className="focus-timer-display pomodoro">
                {formatTime(elapsedSeconds)}
              </div>
            )}

            <div className="focus-elapsed-time">
              {focusTimerType === 'pomodoro' && pomodoroPhase !== 'focus'
                ? t('status.breaking')
                : t('status.focusing')}
              {focusTimerType !== 'none' && ` · ${formatTime(elapsedSeconds)}`}
            </div>
            <div className="focus-blocked-summary">
              {blockedApps.map((bundleId) => {
                const app = filteredApps.find((a: { bundle_id: string }) => a.bundle_id === bundleId);
                return (
                  <span key={bundleId} className="focus-blocked-chip">
                    {app?.name || bundleId}
                  </span>
                );
              })}
            </div>
          </div>

          {/* 오늘의 태스크 */}
          <div className="focus-tasks-section" onClick={onNavigateToToday} role="button" tabIndex={0}>
            <div className="focus-tasks-header">
              <h3>{t('tasks.title')}</h3>
              <span className="focus-tasks-progress">
                {t('tasks.progress', { completed: completedTasks.length, total: tasks.length })}
              </span>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="focus-tasks-empty">
                <span>{t('tasks.allDone')}</span>
              </div>
            ) : (
              <div className="focus-tasks-list">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="focus-task-item">
                    <button
                      className="focus-task-check"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTaskStatus(task.id, 'completed');
                      }}
                    >
                      <span>○</span>
                    </button>
                    <span className="focus-task-title">{task.title}</span>
                    {task.scheduledTime && (
                      <span className="focus-task-time">{task.scheduledTime}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {completedTasks.length > 0 && (
              <div className="focus-completed-section">
                <div className="focus-completed-header">
                  <span>{t('tasks.completedSection', { count: completedTasks.length })}</span>
                </div>
                <div className="focus-tasks-list completed">
                  {completedTasks.slice(0, 3).map((task) => (
                    <div key={task.id} className="focus-task-item completed">
                      <span className="focus-task-check done">✓</span>
                      <span className="focus-task-title">{task.title}</span>
                    </div>
                  ))}
                  {completedTasks.length > 3 && (
                    <div className="focus-completed-more">
                      {t('tasks.more', { count: completedTasks.length - 3 })}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="focus-tasks-hint">{t('tasks.navigateHint')}</div>
          </div>

          {/* 종료 버튼 */}
          <button className="focus-stop-btn" onClick={handleStopFocus}>
            {t('stop')}
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const { t } = useTranslation();
  const { language, setLanguage } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const { tasks, selectedDate, isLoading, loadTasks, setSelectedDate, updateTaskStatus, updateTask, deleteTask, createTask, createSubTask, updateSubTaskStatus, updateSubTask, deleteSubTask } = useTaskStore();
  const { plans, loadPlans, createPlan, updatePlan, deletePlan: deletePlanFromStore } = usePlanStore();
  const { isActive, checkFrontmostApp, tick } = useFocusStore();
  const { isConnected: isCalendarConnected, getEventsForDate, syncEvents } = useCalendarStore();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newPlanInput, setNewPlanInput] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editScheduledTime, setEditScheduledTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editingSubtask, setEditingSubtask] = useState<{ taskId: string; subtask: SubTask } | null>(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('');
  const [splittingTask, setSplittingTask] = useState<Task | null>(null);
  const [splitSubtasks, setSplitSubtasks] = useState<string[]>(['', '', '']);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editPlanTitle, setEditPlanTitle] = useState('');
  const [editPlanDescription, setEditPlanDescription] = useState('');

  // Recurring plan state
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringInput, setRecurringInput] = useState('');
  const [_parsedPattern, setParsedPattern] = useState<ParsedRecurrencePattern | null>(null);
  const [recurringPlans, setRecurringPlans] = useState<RecurringPlan[]>([]);
  const [isParsingRecurrence, setIsParsingRecurrence] = useState(false);
  const [isCreatingRecurring, setIsCreatingRecurring] = useState(false);
  const [taskPreview, setTaskPreview] = useState<Array<{ scheduledDate: string; title: string }>>([]);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  // Recurring form fields (for manual editing)
  const [recurringTitle, setRecurringTitle] = useState('');
  const [recurringLocation, setRecurringLocation] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const [currentShortcut, setCurrentShortcut] = useState('Alt+Shift+Space');
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

  // Tab shortcuts state
  const [tabShortcuts, setTabShortcuts] = useState<string[]>(['1', '2', '3', '4', '5']);
  const [recordingTabIndex, setRecordingTabIndex] = useState<number | null>(null);
  const [recordedTabKey, setRecordedTabKey] = useState<string>('');

  // AI input mode state
  const [inputMode, setInputMode] = useState<'manual' | 'ai'>('manual');
  const [aiInputShortcut, setAiInputShortcut] = useState('shift+tab');
  const [isParsingTask, setIsParsingTask] = useState(false);
  const [recordingAiShortcut, setRecordingAiShortcut] = useState(false);
  const [recordedAiShortcutKey, setRecordedAiShortcutKey] = useState('');

  // Focus input shortcut state
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const [focusInputShortcut, setFocusInputShortcut] = useState(isMac ? 'cmd+l' : 'ctrl+l');
  const [recordingFocusShortcut, setRecordingFocusShortcut] = useState(false);
  const [recordedFocusShortcutKey, setRecordedFocusShortcutKey] = useState('');
  const taskInputRef = useRef<HTMLInputElement>(null);

  // API Key state
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'none' | 'saved' | 'validating' | 'valid' | 'invalid'>('none');

  // AI generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [, setAiSplitSuggestions] = useState<string[]>([]);
  const [isParsingPlan, setIsParsingPlan] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);

  // Plan rules state
  const [planRules, setPlanRules] = useState('');
  const [planRulesInput, setPlanRulesInput] = useState('');
  const [planRulesSaved, setPlanRulesSaved] = useState(false);

  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportImportMessage, setExportImportMessage] = useState('');
  const [exportStartDate, setExportStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // 기본값: 30일 전
    return formatDate(date);
  });
  const [exportEndDate, setExportEndDate] = useState(() => formatDate(new Date()));

  // Progress tracking state
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [progressYear, setProgressYear] = useState(new Date().getFullYear());
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [, setSelectedHeatmapDate] = useState<string | null>(null);

  const loadRecurringPlans = async () => {
    try {
      const plans = await getRecurringPlans();
      setRecurringPlans(plans);
    } catch (error) {
      console.error('Failed to load recurring plans:', error);
    }
  };

  useEffect(() => {
    loadTasks();
    loadPlans();
    loadRecurringPlans();
    // Load current shortcut
    invoke<string>('get_current_shortcut').then(setCurrentShortcut).catch(console.error);
    // Load API key
    invoke<string>('get_api_key').then((key) => {
      if (key) {
        setApiKey(key);
        setApiKeyInput(key);
        setApiKeyStatus('saved');
      }
    }).catch(console.error);
    // Load plan rules
    invoke<string>('get_plan_rules').then((rules) => {
      if (rules) {
        setPlanRules(rules);
        setPlanRulesInput(rules);
      }
    }).catch(console.error);
    // Load tab shortcuts
    invoke<string[]>('get_tab_shortcuts').then((shortcuts) => {
      if (shortcuts && shortcuts.length === 5) {
        setTabShortcuts(shortcuts);
      }
    }).catch(console.error);
    // Load AI input shortcut
    invoke<string>('get_ai_input_shortcut').then((shortcut) => {
      if (shortcut) {
        setAiInputShortcut(shortcut);
      }
    }).catch(console.error);
    // Load focus input shortcut
    invoke<string>('get_focus_input_shortcut').then((shortcut) => {
      if (shortcut) {
        setFocusInputShortcut(shortcut);
      }
    }).catch(console.error);

    return () => {};
  }, [loadTasks, loadPlans]);

  // Chrome Extension 연동 이벤트 리스너 (초기화 시 한 번만)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = useFocusStore.getState().setupExtensionListener;
    setup().then(fn => {
      unlisten = fn;
      console.log('Extension listener setup complete');
    }).catch(err => console.error('Extension listener setup failed:', err));

    return () => {
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 캘린더 이벤트 동기화 (날짜 변경 시)
  useEffect(() => {
    if (!isCalendarConnected) return;

    // 선택된 날짜 기준 ±1일 범위로 이벤트 동기화
    const prevDay = formatDate(addDays(new Date(selectedDate), -1));
    const nextDay = formatDate(addDays(new Date(selectedDate), 1));
    syncEvents(prevDay, nextDay);
  }, [selectedDate, isCalendarConnected, syncEvents]);

  // 전역 포커스 모드 폴링 (탭 이동해도 유지)
  useEffect(() => {
    if (!isActive) return;

    // 1초마다 활성 앱 체크 (차단된 앱 감지 시 종료)
    const checkInterval = setInterval(checkFrontmostApp, 1000);
    // 1초마다 타이머 업데이트
    const tickInterval = setInterval(tick, 1000);

    return () => {
      clearInterval(checkInterval);
      clearInterval(tickInterval);
    };
  }, [isActive, checkFrontmostApp, tick]);

  useEffect(() => {
    if (!isRecordingShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const keys: string[] = [];

      if (e.metaKey) keys.push('Cmd');
      if (e.altKey) keys.push('Alt');
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');

      // Add the actual key if it's not a modifier
      if (!['Meta', 'Alt', 'Control', 'Shift'].includes(e.key)) {
        const key = e.key === ' ' ? 'Space' : e.key.toUpperCase();
        keys.push(key);
      }

      setRecordedKeys(keys);
    };

    const handleKeyUp = async (_e: KeyboardEvent) => {
      if (recordedKeys.length > 1) {
        const shortcutStr = recordedKeys.join('+');
        try {
          await invoke('set_shortcut', { shortcutStr });
          setCurrentShortcut(shortcutStr);
        } catch (error) {
          console.error('Failed to set shortcut:', error);
        }
        setIsRecordingShortcut(false);
        setRecordedKeys([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecordingShortcut, recordedKeys]);

  // 탭 전환 단축키: Cmd/Ctrl + 커스텀 키
  useEffect(() => {
    const tabs: Tab[] = ['today', 'focus', 'plans', 'progress', 'settings'];

    const handleTabShortcut = (e: KeyboardEvent) => {
      // 입력 필드에서는 단축키 비활성화
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // 단축키 레코딩 중에는 무시
      if (isRecordingShortcut || recordingTabIndex !== null) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierPressed = isMac ? e.metaKey : e.ctrlKey;

      if (modifierPressed && !e.altKey && !e.shiftKey) {
        const pressedKey = e.key.toUpperCase();
        const tabIndex = tabShortcuts.findIndex(s => s.toUpperCase() === pressedKey);
        if (tabIndex !== -1) {
          e.preventDefault();
          setActiveTab(tabs[tabIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleTabShortcut);
    return () => window.removeEventListener('keydown', handleTabShortcut);
  }, [isRecordingShortcut, recordingTabIndex, tabShortcuts]);

  // 탭 단축키 레코딩
  useEffect(() => {
    if (recordingTabIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      // modifier 키는 무시
      if (['Meta', 'Alt', 'Control', 'Shift'].includes(e.key)) return;

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      setRecordedTabKey(key);
    };

    const handleKeyUp = async () => {
      if (recordedTabKey && recordingTabIndex !== null) {
        const newShortcuts = [...tabShortcuts];
        newShortcuts[recordingTabIndex] = recordedTabKey;
        setTabShortcuts(newShortcuts);

        try {
          await invoke('set_tab_shortcuts', { shortcuts: newShortcuts });
        } catch (error) {
          console.error('Failed to save tab shortcuts:', error);
        }

        setRecordingTabIndex(null);
        setRecordedTabKey('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [recordingTabIndex, recordedTabKey, tabShortcuts]);

  // AI 입력 모드 전환 단축키
  useEffect(() => {
    const checkAiShortcut = (e: KeyboardEvent, shortcut: string) => {
      const parts = shortcut.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const needShift = parts.includes('shift');
      const needCtrl = parts.includes('ctrl');
      const needAlt = parts.includes('alt');
      const needCmd = parts.includes('cmd');

      return (
        e.key.toLowerCase() === key &&
        e.shiftKey === needShift &&
        e.ctrlKey === needCtrl &&
        e.altKey === needAlt &&
        e.metaKey === needCmd
      );
    };

    const handleAiShortcut = (e: KeyboardEvent) => {
      // 레코딩 중에는 무시
      if (isRecordingShortcut || recordingTabIndex !== null || recordingAiShortcut) return;

      // 입력 필드에서만 동작 (Today 탭의 태스크 입력)
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

      if (checkAiShortcut(e, aiInputShortcut)) {
        e.preventDefault();
        setInputMode(prev => prev === 'manual' ? 'ai' : 'manual');
      }
    };

    window.addEventListener('keydown', handleAiShortcut);
    return () => window.removeEventListener('keydown', handleAiShortcut);
  }, [aiInputShortcut, isRecordingShortcut, recordingTabIndex, recordingAiShortcut]);

  // AI 단축키 레코딩
  useEffect(() => {
    if (!recordingAiShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const keys: string[] = [];

      if (e.shiftKey) keys.push('shift');
      if (e.ctrlKey) keys.push('ctrl');
      if (e.altKey) keys.push('alt');
      if (e.metaKey) keys.push('cmd');

      // modifier 키가 아닌 실제 키 추가
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        keys.push(e.key.toLowerCase());
      }

      if (keys.length > 0) {
        setRecordedAiShortcutKey(keys.join('+'));
      }
    };

    const handleKeyUp = async () => {
      if (recordedAiShortcutKey && recordedAiShortcutKey.includes('+')) {
        setAiInputShortcut(recordedAiShortcutKey);
        try {
          await invoke('set_ai_input_shortcut', { shortcut: recordedAiShortcutKey });
        } catch (error) {
          console.error('Failed to save AI input shortcut:', error);
        }
        setRecordingAiShortcut(false);
        setRecordedAiShortcutKey('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [recordingAiShortcut, recordedAiShortcutKey]);

  // 입력창 포커스 단축키
  useEffect(() => {
    const checkFocusShortcut = (e: KeyboardEvent, shortcut: string) => {
      const parts = shortcut.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const needShift = parts.includes('shift');
      const needCtrl = parts.includes('ctrl');
      const needAlt = parts.includes('alt');
      const needCmd = parts.includes('cmd') || parts.includes('meta');

      const pressedKey = e.key.toLowerCase();
      const hasShift = e.shiftKey;
      const hasCtrl = e.ctrlKey;
      const hasAlt = e.altKey;
      const hasCmd = e.metaKey;

      return (
        pressedKey === key &&
        hasShift === needShift &&
        hasCtrl === needCtrl &&
        hasAlt === needAlt &&
        hasCmd === needCmd
      );
    };

    const handleFocusShortcut = (e: KeyboardEvent) => {
      // 단축키 레코딩 중이면 무시
      if (isRecordingShortcut || recordingTabIndex !== null || recordingAiShortcut || recordingFocusShortcut) return;
      // 다른 input에 포커스 되어 있으면 무시
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (activeTab === 'today' && checkFocusShortcut(e, focusInputShortcut)) {
        e.preventDefault();
        taskInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleFocusShortcut);
    return () => window.removeEventListener('keydown', handleFocusShortcut);
  }, [focusInputShortcut, isRecordingShortcut, recordingTabIndex, recordingAiShortcut, recordingFocusShortcut, activeTab]);

  // 포커스 단축키 레코딩
  useEffect(() => {
    if (!recordingFocusShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.metaKey) parts.push('cmd');
      if (e.ctrlKey) parts.push('ctrl');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');

      const key = e.key.toLowerCase();
      if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
        parts.push(key);
      }

      setRecordedFocusShortcutKey(parts.join('+'));
    };

    const handleKeyUp = async () => {
      if (recordedFocusShortcutKey && recordedFocusShortcutKey.includes('+')) {
        setFocusInputShortcut(recordedFocusShortcutKey);
        try {
          await invoke('set_focus_input_shortcut', { shortcut: recordedFocusShortcutKey });
        } catch (error) {
          console.error('Failed to save focus input shortcut:', error);
        }
        setRecordingFocusShortcut(false);
        setRecordedFocusShortcutKey('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [recordingFocusShortcut, recordedFocusShortcutKey]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      console.log('Creating task:', { title: newTaskTitle, scheduledDate: selectedDate });
      const task = await createTask({
        title: newTaskTitle,
        scheduledDate: selectedDate,
      });
      console.log('Task created:', task);
      setNewTaskTitle('');
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  // AI 태스크 파싱 및 생성
  interface ParseTaskResponse {
    title: string;
    scheduledDate?: string;
    scheduledTime?: string;
    endTime?: string;
    location?: string;
    subtasks?: string[];
    priority?: number;
    estimatedDuration?: number;
  }

  const handleAICreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || isParsingTask) return;

    setIsParsingTask(true);
    try {
      const today = formatDate(new Date());
      const parsed = await invoke<ParseTaskResponse>('parse_task_with_ai', {
        input: newTaskTitle,
        currentDate: today,
      });

      console.log('AI parsed task:', parsed);

      // 메인 태스크 생성
      const task = await createTask({
        title: parsed.title,
        scheduledDate: parsed.scheduledDate || selectedDate,
        scheduledTime: parsed.scheduledTime,
        location: parsed.location,
        priority: parsed.priority,
        estimatedDuration: parsed.estimatedDuration,
      });

      // 서브태스크가 있으면 추가
      if (parsed.subtasks && parsed.subtasks.length > 0) {
        for (const subtaskTitle of parsed.subtasks) {
          await createSubTask({ taskId: task.id, title: subtaskTitle });
        }
        // 태스크 다시 로드하여 서브태스크 반영
        await loadTasks(parsed.scheduledDate || selectedDate);
      }

      setNewTaskTitle('');
      setInputMode('manual'); // 성공 후 수동 모드로 전환
    } catch (error) {
      console.error('Failed to parse/create task with AI:', error);
      // AI 파싱 실패 시 일반 태스크로 폴백
      try {
        await createTask({
          title: newTaskTitle,
          scheduledDate: selectedDate,
        });
        setNewTaskTitle('');
      } catch (fallbackError) {
        console.error('Fallback task creation also failed:', fallbackError);
      }
    } finally {
      setIsParsingTask(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanInput.trim()) return;

    await createPlan({
      title: newPlanInput.split('\n')[0] || 'New Plan',
      originalInput: newPlanInput,
    });
    setNewPlanInput('');
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditLocation(task.location || '');
    setEditScheduledTime(task.scheduledTime || '');
    // endTime 계산: scheduledTime + estimatedDuration
    if (task.scheduledTime && task.estimatedDuration) {
      const [hours, minutes] = task.scheduledTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + task.estimatedDuration;
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMins = totalMinutes % 60;
      setEditEndTime(`${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`);
    } else {
      setEditEndTime('');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTask || !editTitle.trim()) return;
    // estimatedDuration 계산: endTime - scheduledTime
    let estimatedDuration: number | undefined;
    if (editScheduledTime && editEndTime) {
      const [startH, startM] = editScheduledTime.split(':').map(Number);
      const [endH, endM] = editEndTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      estimatedDuration = endMinutes >= startMinutes
        ? endMinutes - startMinutes
        : (24 * 60 - startMinutes) + endMinutes; // 자정 넘어가는 경우
    }
    await updateTask(editingTask.id, {
      title: editTitle,
      location: editLocation || undefined,
      scheduledTime: editScheduledTime || undefined,
      estimatedDuration,
    });
    setEditingTask(null);
    setEditTitle('');
    setEditLocation('');
    setEditScheduledTime('');
    setEditEndTime('');
  };

  const handleEditSubtask = (taskId: string, subtask: SubTask) => {
    setEditingSubtask({ taskId, subtask });
    setEditSubtaskTitle(subtask.title);
  };

  const handleSaveSubtaskEdit = async () => {
    if (!editingSubtask || !editSubtaskTitle.trim()) return;
    await updateSubTask(editingSubtask.taskId, editingSubtask.subtask.id, editSubtaskTitle);
    setEditingSubtask(null);
    setEditSubtaskTitle('');
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setEditPlanTitle(plan.title);
    setEditPlanDescription(plan.description || '');
  };

  const handleSavePlanEdit = async () => {
    if (!editingPlan || !editPlanTitle.trim()) return;
    await updatePlan(editingPlan.id, {
      title: editPlanTitle,
      description: editPlanDescription || undefined
    });
    setEditingPlan(null);
    setEditPlanTitle('');
    setEditPlanDescription('');
  };

  const handleDeletePlan = async (planId: string) => {
    await deletePlanFromStore(planId);
  };

  const handleSaveSplit = async () => {
    if (!splittingTask) return;
    const validSubtasks = splitSubtasks.filter(s => s.trim());
    if (validSubtasks.length === 0) return;

    for (const title of validSubtasks) {
      await createSubTask({
        taskId: splittingTask.id,
        title: title.trim(),
      });
    }
    // Reload tasks to ensure subtasks are properly loaded
    await loadTasks();
    setSplittingTask(null);
    setSplitSubtasks(['', '', '']);
  };

  const handleSubTaskComplete = async (taskId: string, subTaskId: string, currentStatus: string) => {
    await updateSubTaskStatus(
      taskId,
      subTaskId,
      currentStatus === 'completed' ? 'pending' : 'completed'
    );
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setApiKeyStatus('validating');
    try {
      await invoke('set_api_key', { apiKey: apiKeyInput.trim() });
      // Validate by making a simple call
      const isValid = await invoke<boolean>('validate_api_key');
      if (isValid) {
        setApiKey(apiKeyInput.trim());
        setApiKeyStatus('valid');
        setTimeout(() => setApiKeyStatus('saved'), 2000);
      } else {
        setApiKeyStatus('invalid');
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      setApiKeyStatus('invalid');
    }
  };

  const handleDeleteApiKey = async () => {
    try {
      await invoke('delete_api_key');
      setApiKey('');
      setApiKeyInput('');
      setApiKeyStatus('none');
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  };

  const handleSavePlanRules = async () => {
    try {
      await invoke('set_plan_rules', { rules: planRulesInput });
      setPlanRules(planRulesInput);
      setPlanRulesSaved(true);
      setTimeout(() => setPlanRulesSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save plan rules:', error);
    }
  };

  const handleAiSplitTask = async () => {
    if (!splittingTask || !apiKey) return;
    setIsGenerating(true);
    try {
      const response = await invoke<{ subtasks: { title: string; estimated_minutes: number }[] }>(
        'split_task_with_ai',
        { taskTitle: splittingTask.title }
      );
      const suggestions = response.subtasks.map(s => s.title);
      setAiSplitSuggestions(suggestions);
      setSplitSubtasks([...suggestions, '']);
    } catch (error) {
      console.error('Failed to generate split suggestions:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiParsePlan = async () => {
    if (!newPlanInput.trim() || !apiKey) return;
    setIsParsingPlan(true);
    try {
      const response = await invoke<{
        parsed_content: {
          goals: string[];
          milestones: unknown[];
          suggested_tasks: { title: string; estimated_duration: number; priority: number }[];
        };
      }>('parse_plan_with_ai', { planInput: newPlanInput, planRules: planRules || null });

      // Create the plan with parsed content
      await createPlan({
        title: response.parsed_content.goals[0] || newPlanInput.split('\n')[0] || 'New Plan',
        originalInput: newPlanInput,
        description: response.parsed_content.goals.join(', '),
      });
      setNewPlanInput('');
    } catch (error) {
      console.error('Failed to parse plan with AI:', error);
      // Fallback to regular plan creation
      await createPlan({
        title: newPlanInput.split('\n')[0] || 'New Plan',
        originalInput: newPlanInput,
      });
      setNewPlanInput('');
    } finally {
      setIsParsingPlan(false);
    }
  };

  const handleGenerateDailyTasks = async (plan: { id: string; title: string; description?: string }) => {
    if (!apiKey) return;
    setIsGeneratingTasks(true);
    try {
      const response = await invoke<{
        tasks: { title: string; description?: string; estimated_duration?: number; priority: number; scheduled_time?: string }[];
        summary: string;
      }>('generate_daily_tasks_with_ai', {
        planTitle: plan.title,
        planDescription: plan.description || '',
        date: selectedDate,
        planRules: planRules || null,
      });

      // Create tasks from AI response
      for (const task of response.tasks) {
        await createTask({
          title: task.title,
          scheduledDate: selectedDate,
          scheduledTime: task.scheduled_time,
          estimatedDuration: task.estimated_duration,
          priority: task.priority,
        });
      }

      // Switch to today tab to see the generated tasks
      setActiveTab('today');
    } catch (error) {
      console.error('Failed to generate daily tasks:', error);
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  // Recurring plan handlers
  const handleParseRecurrence = async () => {
    if (!recurringInput.trim()) return;
    setIsParsingRecurrence(true);

    try {
      // API 키가 있으면 LLM 파싱, 없으면 규칙 기반 파싱
      let pattern: ParsedRecurrencePattern | null;

      if (apiKey) {
        // LLM 기반 파싱
        pattern = await invoke<ParsedRecurrencePattern>('parse_recurrence_pattern_with_ai', {
          input: recurringInput,
        });
      } else {
        // 규칙 기반 파싱 (fallback)
        pattern = await invoke<ParsedRecurrencePattern | null>('parse_recurrence_pattern', {
          input: recurringInput,
        });
      }

      if (pattern) {
        setParsedPattern(pattern);
        // Update form fields from parsed pattern
        setRecurringTitle(pattern.title || '');
        setRecurringLocation(pattern.location || '');
        setRecurrenceType(pattern.recurrenceType);
        setSelectedDays(pattern.daysOfWeek || []);
        setStartDate(pattern.startDate || '');
        setEndDate(pattern.endDate || '');
        setScheduledTime(pattern.scheduledTime || '');
        setEndTime(pattern.endTime || '');

        // Generate preview
        await generateTaskPreview(pattern);
      }
    } catch (error) {
      console.error('Failed to parse recurrence pattern:', error);
      // LLM 실패 시 규칙 기반으로 fallback
      try {
        const pattern = await invoke<ParsedRecurrencePattern | null>('parse_recurrence_pattern', {
          input: recurringInput,
        });
        if (pattern) {
          setParsedPattern(pattern);
          setRecurringTitle(pattern.title || '');
          setRecurringLocation(pattern.location || '');
          setRecurrenceType(pattern.recurrenceType);
          setSelectedDays(pattern.daysOfWeek || []);
          setStartDate(pattern.startDate || '');
          setEndDate(pattern.endDate || '');
          setScheduledTime(pattern.scheduledTime || '');
          setEndTime(pattern.endTime || '');
          await generateTaskPreview(pattern);
        }
      } catch (fallbackError) {
        console.error('Fallback parsing also failed:', fallbackError);
      }
    } finally {
      setIsParsingRecurrence(false);
    }
  };

  const generateTaskPreview = async (pattern: ParsedRecurrencePattern) => {
    // Create a temporary RecurringPlan object for preview
    const tempPlan: RecurringPlan = {
      id: 'preview',
      title: pattern.title || recurringTitle || '반복 일정',
      recurrenceType: pattern.recurrenceType,
      intervalValue: pattern.intervalValue,
      daysOfWeek: pattern.daysOfWeek,
      dayOfMonth: pattern.dayOfMonth,
      scheduledTime: pattern.scheduledTime,
      endTime: pattern.endTime,
      estimatedDuration: pattern.estimatedDuration,
      startDate: pattern.startDate || startDate || formatDate(new Date()),
      endDate: pattern.endDate || endDate,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };

    try {
      const tasks = await invoke<Array<{
        planId?: string;
        title: string;
        description?: string;
        scheduledDate: string;
        scheduledTime?: string;
        estimatedDuration?: number;
        priority: number;
      }>>('generate_tasks_preview', { recurringPlan: tempPlan });

      setTaskPreview(tasks.map(t => ({
        scheduledDate: t.scheduledDate,
        title: t.title,
      })));
    } catch (error) {
      console.error('Failed to generate preview:', error);
    }
  };

  // 수동 입력으로 미리보기 생성
  const handleGeneratePreview = async () => {
    if (!recurringTitle.trim() || !startDate) return;

    const tempPlan: RecurringPlan = {
      id: 'preview',
      title: recurringTitle,
      recurrenceType,
      intervalValue: 1,
      daysOfWeek: selectedDays.length > 0 ? selectedDays : undefined,
      scheduledTime: scheduledTime || undefined,
      endTime: endTime || undefined,
      estimatedDuration: scheduledTime && endTime ? calculateDuration(scheduledTime, endTime) : undefined,
      startDate,
      endDate: endDate || undefined,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };

    try {
      const tasks = await invoke<Array<{
        planId?: string;
        title: string;
        description?: string;
        scheduledDate: string;
        scheduledTime?: string;
        estimatedDuration?: number;
        priority: number;
      }>>('generate_tasks_preview', { recurringPlan: tempPlan });

      setTaskPreview(tasks.map(t => ({
        scheduledDate: t.scheduledDate,
        title: t.title,
      })));
      setIsPreviewExpanded(false);
    } catch (error) {
      console.error('Failed to generate preview:', error);
    }
  };

  const handleCreateRecurringPlan = async () => {
    if (!recurringTitle.trim() || !startDate) return;
    setIsCreatingRecurring(true);

    try {
      // Create the recurring plan
      const newRecurringPlan = await createRecurringPlan({
        title: recurringTitle,
        location: recurringLocation || undefined,
        recurrenceType,
        intervalValue: 1,
        daysOfWeek: selectedDays.length > 0 ? selectedDays : undefined,
        scheduledTime: scheduledTime || undefined,
        endTime: endTime || undefined,
        estimatedDuration: scheduledTime && endTime ? calculateDuration(scheduledTime, endTime) : undefined,
        startDate,
        endDate: endDate || undefined,
      });

      // Generate tasks from the recurring plan
      const tasksToCreate = taskPreview.map(t => ({
        scheduledDate: t.scheduledDate,
        scheduledTime: scheduledTime || undefined,
        title: recurringTitle,
        location: recurringLocation || undefined,
        estimatedDuration: scheduledTime && endTime ? calculateDuration(scheduledTime, endTime) : undefined,
      }));

      await generateTasksFromRecurringPlan(newRecurringPlan, tasksToCreate);

      // Reset form
      setShowRecurringForm(false);
      setRecurringInput('');
      setParsedPattern(null);
      setRecurringTitle('');
      setRecurringLocation('');
      setRecurrenceType('weekly');
      setSelectedDays([]);
      setStartDate('');
      setEndDate('');
      setScheduledTime('');
      setEndTime('');
      setTaskPreview([]);
      setIsPreviewExpanded(false);

      // Reload data
      await loadRecurringPlans();
      await loadTasks();
    } catch (error) {
      console.error('Failed to create recurring plan:', error);
    } finally {
      setIsCreatingRecurring(false);
    }
  };

  const handleDeleteRecurringPlan = async (id: string) => {
    try {
      await deleteRecurringPlan(id);
      await loadRecurringPlans();
      await loadTasks(); // 삭제된 태스크 반영
    } catch (error) {
      console.error('Failed to delete recurring plan:', error);
    }
  };

  const calculateDuration = (start: string, end: string): number => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    return (endH * 60 + endM) - (startH * 60 + startM);
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  // 날짜 범위에 맞는 태스크 필터링
  const getFilteredTasks = () => {
    return tasks.filter(task => {
      const taskDate = task.scheduledDate;
      return taskDate >= exportStartDate && taskDate <= exportEndDate;
    });
  };

  // Export handlers
  const handleExportToJson = async () => {
    setIsExporting(true);
    setExportImportMessage('');
    try {
      const filteredTasks = getFilteredTasks();
      const jsonContent = await invoke<string>('export_all_to_json', { plans, tasks: filteredTasks });

      const filePath = await save({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: `schedule-ai-backup-${exportStartDate}-to-${exportEndDate}.json`,
      });

      if (filePath) {
        await writeTextFile(filePath, jsonContent);
        setExportImportMessage(`✓ ${plans.length}개 Plan, ${filteredTasks.length}개 Task 내보내기 완료 (${exportStartDate} ~ ${exportEndDate})`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      setExportImportMessage(`✕ 내보내기 실패: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportToFolder = async () => {
    setIsExporting(true);
    setExportImportMessage('');
    try {
      const folderPath = await open({
        directory: true,
        title: '내보낼 폴더 선택',
      });

      if (folderPath && typeof folderPath === 'string') {
        const filteredTasks = getFilteredTasks();
        const result = await invoke<{ plansCount: number; tasksCount: number; path: string }>(
          'export_to_folder',
          { folderPath, plans, tasks: filteredTasks }
        );
        setExportImportMessage(`✓ ${result.plansCount}개 Plan, ${result.tasksCount}개 Task를 마크다운으로 내보내기 완료 (${exportStartDate} ~ ${exportEndDate})`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      setExportImportMessage(`✕ 내보내기 실패: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 해당 날짜 마크다운 Export (Today 탭용)
  const handleExportDayToMarkdown = async () => {
    setIsExporting(true);
    try {
      const markdown = await invoke<string>('export_tasks_to_markdown', { date: selectedDate, tasks });

      const filePath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: `${selectedDate}.md`,
      });

      if (filePath) {
        await writeTextFile(filePath, markdown);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // 해당 날짜 JSON Export (Today 탭용)
  const handleExportDayToJson = async () => {
    setIsExporting(true);
    try {
      const jsonContent = await invoke<string>('export_all_to_json', { plans: [], tasks });

      const filePath = await save({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: `tasks-${selectedDate}.json`,
      });

      if (filePath) {
        await writeTextFile(filePath, jsonContent);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Import handlers
  const handleImportFromJson = async () => {
    setIsImporting(true);
    setExportImportMessage('');
    try {
      const filePath = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        title: 'JSON 파일 선택',
      });

      if (filePath && typeof filePath === 'string') {
        const jsonContent = await readTextFile(filePath);
        const importData = await invoke<{ plans: Plan[]; tasks: Task[] }>('import_from_json', { jsonContent });

        // Import plans
        for (const plan of importData.plans) {
          await createPlan({
            title: plan.title,
            description: plan.description,
            originalInput: plan.originalInput || '',
            startDate: plan.startDate,
            endDate: plan.endDate,
          });
        }

        // Import tasks
        for (const task of importData.tasks) {
          await createTask({
            title: task.title,
            scheduledDate: task.scheduledDate,
            scheduledTime: task.scheduledTime,
            estimatedDuration: task.estimatedDuration,
            priority: task.priority,
          });
        }

        await loadPlans();
        await loadTasks();
        setExportImportMessage(`✓ ${importData.plans.length}개 Plan, ${importData.tasks.length}개 Task 가져오기 완료`);
      }
    } catch (error) {
      console.error('Import failed:', error);
      setExportImportMessage(`✕ 가져오기 실패: ${error}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Progress 탭 활성화 시 데이터 로드
  useEffect(() => {
    if (activeTab !== 'progress') return;

    const loadProgressData = async (year: number) => {
      console.log('[Progress] Loading data for year:', year);
      setIsLoadingProgress(true);
      try {
        // DB의 daily_progress 테이블에서 데이터 조회 (각 DB 작업에서 자동 업데이트됨)
        const dbProgress = await getDailyProgressByYear(year);
        console.log('[Progress] DB progress count:', dbProgress.length, 'for year:', year);

        // DailyProgress 형식으로 변환 (null 값을 0으로 변환)
        const allProgress: DailyProgress[] = dbProgress.map((p: DBDailyProgress) => ({
          date: p.date,
          totalTasks: p.totalTasks ?? 0,
          completedTasks: p.completedTasks ?? 0,
          skippedTasks: p.skippedTasks ?? 0,
          totalEstimatedMinutes: p.totalEstimatedMinutes ?? 0,
          totalActualMinutes: p.totalActualMinutes ?? 0,
          completionRate: p.completionRate ?? 0,
          streakCount: p.streakCount ?? 0,
        }));

        // 히트맵 데이터 생성
        console.log('[Progress] Calling get_heatmap_data with year:', year, 'allProgress:', allProgress);
        const heatmap = await invoke<HeatmapData[]>('get_heatmap_data', {
          year,
          allProgress,
        });
        const activeDays = heatmap.filter(d => d.taskCount > 0);
        console.log('[Progress] Heatmap data received:', heatmap.length, 'first date:', heatmap[0]?.date, 'active days:', activeDays.length, activeDays.slice(0, 3));
        setHeatmapData(heatmap);

        // 스트릭 계산 (연도에 관계없이 최근 365일 데이터 사용)
        const recentProgress = await getRecentDailyProgress(365);
        const streakProgress: DailyProgress[] = recentProgress.map((p: DBDailyProgress) => ({
          date: p.date,
          totalTasks: p.totalTasks ?? 0,
          completedTasks: p.completedTasks ?? 0,
          skippedTasks: p.skippedTasks ?? 0,
          totalEstimatedMinutes: p.totalEstimatedMinutes ?? 0,
          totalActualMinutes: p.totalActualMinutes ?? 0,
          completionRate: p.completionRate ?? 0,
          streakCount: p.streakCount ?? 0,
        }));
        const todayStr = formatDate(new Date());
        console.log('[Streak] today:', todayStr);
        console.log('[Streak] recentProgress count:', recentProgress.length);
        console.log('[Streak] recent 5 days:', streakProgress.slice(0, 5).map(p => ({ date: p.date, rate: p.completionRate })));
        const streak = await invoke<number>('calculate_streak', {
          progressHistory: streakProgress,
          today: todayStr,
        });
        console.log('[Streak] result:', streak);
        setCurrentStreak(streak);

      } catch (error) {
        console.error('Failed to load progress data:', error);
      } finally {
        setIsLoadingProgress(false);
      }
    };

    loadProgressData(progressYear);
  }, [activeTab, progressYear]);

  const today = formatDate(new Date());
  const isToday = selectedDate === today;

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalCount = tasks.length;

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-brand">{t('common:nav.brand')}</div>
        <div className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'today' ? 'active' : ''}`}
            onClick={() => setActiveTab('today')}
          >
            {t('common:nav.today')}
          </button>
          <button
            className={`nav-tab ${activeTab === 'focus' ? 'active' : ''}`}
            onClick={() => setActiveTab('focus')}
          >
            {t('common:nav.focus')}
          </button>
          <button
            className={`nav-tab ${activeTab === 'plans' ? 'active' : ''}`}
            onClick={() => setActiveTab('plans')}
          >
            {t('common:nav.plans')}
          </button>
          <button
            className={`nav-tab ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('progress')}
          >
            {t('common:nav.progress')}
          </button>
          <button
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            {t('common:nav.settings')}
          </button>
        </div>
      </nav>

      <main className="main">
        {activeTab === 'today' && (
          <div className="today-view">
            {/* Date Navigation */}
            <div className="date-nav">
              <button
                className="date-btn"
                onClick={() => setSelectedDate(formatDate(addDays(new Date(selectedDate), -1)))}
              >
                &larr;
              </button>
              <div className="date-display">
                <span className="date-label">
                  {isToday ? t('today:dateLabel') : new Date(selectedDate).toLocaleDateString(language === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'long' })}
                </span>
                <span className="date-value">{selectedDate}</span>
              </div>
              <button
                className="date-btn"
                onClick={() => setSelectedDate(formatDate(addDays(new Date(selectedDate), 1)))}
              >
                &rarr;
              </button>
              {!isToday && (
                <button
                  className="goto-today-btn"
                  onClick={() => setSelectedDate(today)}
                  title={t('today:gotoToday')}
                >
                  {t('today:gotoToday')}
                </button>
              )}
            </div>

            {/* Progress */}
            <div className="progress-section">
              <div className="progress-header">
                <div className="progress-text">
                  <span className="progress-percent">{totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%</span>
                  <span className="progress-detail">{t('today:progress.completed', { completed: completedCount, total: totalCount })}</span>
                </div>
                {tasks.length > 0 && (
                  <div className="day-export-buttons">
                    <button
                      className="day-export-btn"
                      onClick={handleExportDayToMarkdown}
                      disabled={isExporting}
                      title={t('today:export.markdown')}
                    >
                      <span>{t('today:export.md')}</span>
                    </button>
                    <button
                      className="day-export-btn"
                      onClick={handleExportDayToJson}
                      disabled={isExporting}
                      title={t('today:export.json')}
                    >
                      <span>{t('today:export.jsonShort')}</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Timeline (Tasks + Calendar Events) */}
            <div className="task-list">
              {isLoading ? (
                <div className="loading">{t('common:status.loading')}</div>
              ) : (() => {
                const todayEvents = getEventsForDate(selectedDate);
                const timelineItems = toTimelineItems(tasks, todayEvents);
                const allDayItems = timelineItems.filter(item => item.isAllDay);
                const timedItems = timelineItems.filter(item => !item.isAllDay);

                if (tasks.length === 0 && todayEvents.length === 0) {
                  return (
                    <div className="empty-state">
                      <p>{t('today:empty.title')}</p>
                      <p className="hint">{t('today:empty.hint')}</p>
                    </div>
                  );
                }

                return (
                  <>
                    {/* 종일 이벤트 섹션 */}
                    {allDayItems.length > 0 && (
                      <div className="all-day-section">
                        <h4 className="timeline-section-title">{t('today:allDay', '종일')}</h4>
                        {allDayItems.map((item) =>
                          isCalendarEvent(item.data) ? (
                            <CalendarEventCard
                              key={`event-${item.id}`}
                              event={item.data}
                              onClick={() => setSelectedEvent(item.data as CalendarEvent)}
                            />
                          ) : (
                            <SwipeableTask
                              key={`task-${item.id}`}
                              task={item.data as Task}
                              onComplete={() =>
                                updateTaskStatus(
                                  item.id,
                                  (item.data as Task).status === 'completed' ? 'pending' : 'completed'
                                )
                              }
                              onDelete={() => deleteTask(item.id)}
                              onEdit={() => handleEditTask(item.data as Task)}
                              onAddSubtask={async (title) => {
                                await createSubTask({ taskId: item.id, title });
                              }}
                              onSubTaskComplete={(subTaskId) => {
                                const task = item.data as Task;
                                const subtask = task.subtasks?.find(st => st.id === subTaskId);
                                if (subtask) {
                                  handleSubTaskComplete(item.id, subTaskId, subtask.status);
                                }
                              }}
                              onSubTaskDelete={(subTaskId) => deleteSubTask(item.id, subTaskId)}
                              onSubTaskEdit={(subtask) => handleEditSubtask(item.id, subtask)}
                            />
                          )
                        )}
                      </div>
                    )}

                    {/* 시간대별 이벤트 & 태스크 */}
                    {timedItems.length > 0 && (
                      <div className="timed-items-section">
                        {allDayItems.length > 0 && (
                          <h4 className="timeline-section-title">{t('today:scheduled', '일정')}</h4>
                        )}
                        {timedItems.map((item) =>
                          isCalendarEvent(item.data) ? (
                            <CalendarEventCard
                              key={`event-${item.id}`}
                              event={item.data}
                              onClick={() => setSelectedEvent(item.data as CalendarEvent)}
                            />
                          ) : (
                            <SwipeableTask
                              key={`task-${item.id}`}
                              task={item.data as Task}
                              onComplete={() =>
                                updateTaskStatus(
                                  item.id,
                                  (item.data as Task).status === 'completed' ? 'pending' : 'completed'
                                )
                              }
                              onDelete={() => deleteTask(item.id)}
                              onEdit={() => handleEditTask(item.data as Task)}
                              onAddSubtask={async (title) => {
                                await createSubTask({ taskId: item.id, title });
                              }}
                              onSubTaskComplete={(subTaskId) => {
                                const task = item.data as Task;
                                const subtask = task.subtasks?.find(st => st.id === subTaskId);
                                if (subtask) {
                                  handleSubTaskComplete(item.id, subTaskId, subtask.status);
                                }
                              }}
                              onSubTaskDelete={(subTaskId) => deleteSubTask(item.id, subTaskId)}
                              onSubTaskEdit={(subtask) => handleEditSubtask(item.id, subtask)}
                            />
                          )
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Event Detail Popup */}
            {selectedEvent && (
              <EventDetailPopup
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
              />
            )}

            {/* Add Task Form */}
            <form className="add-task-form" onSubmit={inputMode === 'manual' ? handleCreateTask : handleAICreateTask}>
              <button
                type="button"
                className={`input-mode-indicator ${inputMode}`}
                data-tooltip={inputMode === 'ai'
                  ? t('today:addTask.switchToManual', { shortcut: aiInputShortcut })
                  : t('today:addTask.switchToAI', { shortcut: aiInputShortcut })}
                onClick={() => setInputMode(inputMode === 'manual' ? 'ai' : 'manual')}
              >
                <span className="mode-icon">{inputMode === 'ai' ? '✨' : '✏️'}</span>
              </button>
              <input
                ref={taskInputRef}
                type="text"
                placeholder={inputMode === 'ai' ? t('today:addTask.aiPlaceholder') : t('today:addTask.placeholder')}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className={`add-task-input ${inputMode === 'ai' ? 'ai-mode' : ''}`}
                disabled={isParsingTask}
              />
              <button
                type="submit"
                className={`add-task-btn ${inputMode === 'ai' ? 'ai-mode' : ''}`}
                disabled={!newTaskTitle.trim() || isParsingTask}
              >
                {isParsingTask ? t('common:status.analyzing') : (inputMode === 'ai' ? t('today:addTask.aiButton') : t('today:addTask.button'))}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'plans' && (
          <div className="plans-view">
            <h2>{t('plans:title')}</h2>
            <p className="subtitle">{t('plans:subtitle')}</p>

            {/* Recurring Plan Section */}
            <div className="plan-section">
              <div className="section-header">
                <h3>🔄 {t('plans:recurring.title')}</h3>
                <button
                  className="section-toggle-btn"
                  onClick={() => setShowRecurringForm(!showRecurringForm)}
                >
                  {showRecurringForm ? t('plans:recurring.collapse') : t('plans:recurring.add')}
                </button>
              </div>

              {showRecurringForm && (
                <div className="recurring-form">
                  {/* 자연어 입력 */}
                  <div className="recurring-input-section">
                    <textarea
                      placeholder={t('plans:recurring.placeholder')}
                      value={recurringInput}
                      onChange={(e) => setRecurringInput(e.target.value)}
                      className="recurring-input"
                      rows={2}
                    />
                    <button
                      className="parse-btn"
                      onClick={handleParseRecurrence}
                      disabled={!recurringInput.trim() || isParsingRecurrence}
                    >
                      {isParsingRecurrence ? t('common:status.analyzing') : `✨ ${t('common:ai.analyze')}`}
                    </button>
                  </div>

                  {/* 구조화된 폼 */}
                  <div className="recurring-fields">
                    <div className="field-row">
                      <label>{t('plans:recurring.form.title')}</label>
                      <input
                        type="text"
                        value={recurringTitle}
                        onChange={(e) => setRecurringTitle(e.target.value)}
                        placeholder={t('plans:recurring.form.titlePlaceholder')}
                      />
                    </div>

                    <div className="field-row">
                      <label>{t('plans:recurring.form.location')}</label>
                      <input
                        type="text"
                        value={recurringLocation}
                        onChange={(e) => setRecurringLocation(e.target.value)}
                        placeholder={t('plans:recurring.form.locationPlaceholder')}
                      />
                    </div>

                    <div className="field-row">
                      <label>{t('plans:recurring.form.repeat')}</label>
                      <select
                        value={recurrenceType}
                        onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
                      >
                        <option value="daily">{t('plans:recurring.form.daily')}</option>
                        <option value="weekly">{t('plans:recurring.form.weekly')}</option>
                        <option value="monthly">{t('plans:recurring.form.monthly')}</option>
                      </select>
                    </div>

                    {recurrenceType === 'weekly' && (
                      <div className="field-row">
                        <label>{t('plans:recurring.form.days')}</label>
                        <div className="day-selector">
                          {[t('common:days.sun'), t('common:days.mon'), t('common:days.tue'), t('common:days.wed'), t('common:days.thu'), t('common:days.fri'), t('common:days.sat')].map((name, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className={`day-btn ${selectedDays.includes(idx) ? 'selected' : ''}`}
                              onClick={() => toggleDay(idx)}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="field-row time-row">
                      <label>{t('plans:recurring.form.time')}</label>
                      <div className="time-inputs">
                        <input
                          type="text"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          placeholder="09:00"
                          pattern="[0-9]{2}:[0-9]{2}"
                        />
                        <span>~</span>
                        <input
                          type="text"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          placeholder="18:00"
                          pattern="[0-9]{2}:[0-9]{2}"
                        />
                      </div>
                    </div>

                    <div className="field-row date-row">
                      <label>{t('plans:recurring.form.period')}</label>
                      <div className="date-inputs">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span>~</span>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* 미리보기 생성 버튼 */}
                    <div className="field-row">
                      <label></label>
                      <button
                        type="button"
                        className="preview-generate-btn"
                        onClick={handleGeneratePreview}
                        disabled={!recurringTitle.trim() || !startDate || (recurrenceType === 'weekly' && selectedDays.length === 0)}
                      >
                        🔍 {t('plans:recurring.preview.generate')}
                      </button>
                    </div>
                  </div>

                  {/* 미리보기 */}
                  {taskPreview.length > 0 && (
                    <div className="task-preview">
                      <h4>{t('plans:recurring.preview.title', { count: taskPreview.length })}</h4>
                      <div className="preview-list">
                        {(isPreviewExpanded ? taskPreview : taskPreview.slice(0, 5)).map((task, idx) => (
                          <div key={idx} className="preview-item">
                            <span className="preview-date">{task.scheduledDate}</span>
                            <span className="preview-title">{task.title}</span>
                          </div>
                        ))}
                        {taskPreview.length > 5 && (
                          <button
                            type="button"
                            className="preview-toggle-btn"
                            onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                          >
                            {isPreviewExpanded
                              ? `▲ ${t('plans:recurring.preview.collapse')}`
                              : `▼ ${t('plans:recurring.preview.showMore', { count: taskPreview.length - 5 })}`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 생성 버튼 */}
                  <div className="recurring-actions">
                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setShowRecurringForm(false);
                        setRecurringInput('');
                        setParsedPattern(null);
                        setTaskPreview([]);
                      }}
                    >
                      {t('common:buttons.cancel')}
                    </button>
                    <button
                      className="create-recurring-btn"
                      onClick={handleCreateRecurringPlan}
                      disabled={!recurringTitle.trim() || !startDate || isCreatingRecurring}
                    >
                      {isCreatingRecurring ? t('plans:recurring.creating') : t('plans:recurring.preview.createTasks', { count: taskPreview.length })}
                    </button>
                  </div>
                </div>
              )}

              {/* 기존 반복 일정 목록 */}
              {recurringPlans.length > 0 && (
                <div className="recurring-list">
                  {recurringPlans.map((rp) => (
                    <div key={rp.id} className="recurring-item">
                      <div className="recurring-info">
                        <span className="recurring-title">{rp.title}</span>
                        {rp.location && (
                          <span className="recurring-location">📍 {rp.location}</span>
                        )}
                        <span className="recurring-pattern">
                          {rp.recurrenceType === 'daily' && t('plans:recurring.form.daily')}
                          {rp.recurrenceType === 'weekly' && `${t('plans:recurring.form.weekly')} ${rp.daysOfWeek?.map(d => [t('common:days.sun'), t('common:days.mon'), t('common:days.tue'), t('common:days.wed'), t('common:days.thu'), t('common:days.fri'), t('common:days.sat')][d]).join(', ')}`}
                          {rp.recurrenceType === 'monthly' && `${t('plans:recurring.form.monthly')} ${rp.dayOfMonth}`}
                          {rp.scheduledTime && ` ${rp.scheduledTime}`}
                          {rp.endTime && `-${rp.endTime}`}
                        </span>
                        <span className="recurring-dates">
                          {rp.startDate} ~ {rp.endDate || t('plans:recurring.list.noEnd')}
                        </span>
                      </div>
                      <button
                        className="delete-recurring-btn"
                        onClick={() => handleDeleteRecurringPlan(rp.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Plan Input */}
            <div className="plan-section">
              <div className="section-header">
                <h3>📋 {t('plans:daily.title')}</h3>
              </div>
              <form className="plan-form" onSubmit={handleCreatePlan}>
                <textarea
                  placeholder={t('plans:daily.placeholder')}
                  value={newPlanInput}
                  onChange={(e) => setNewPlanInput(e.target.value)}
                  className="plan-input"
                  rows={3}
                />
                <div className="plan-form-actions">
                  <button type="submit" className="plan-submit-btn" disabled={!newPlanInput.trim()}>
                    {t('plans:daily.create')}
                  </button>
                  {apiKey && (
                    <button
                      type="button"
                      className="ai-parse-btn"
                      onClick={handleAiParsePlan}
                      disabled={!newPlanInput.trim() || isParsingPlan}
                    >
                      {isParsingPlan ? t('common:status.analyzing') : `✨ ${t('common:ai.analyze')}`}
                    </button>
                  )}
              </div>
            </form>
            </div>

            {/* Plans List */}
            <div className="plans-list">
              {plans.length === 0 ? (
                <div className="empty-state">
                  <p>{t('plans:list.empty.title')}</p>
                  <p className="hint">{t('plans:list.empty.hint')}</p>
                </div>
              ) : (
                plans.map((plan) => (
                  <div key={plan.id} className="plan-card">
                    <div className="plan-header">
                      <h3 className="plan-title">{plan.title}</h3>
                      <div className="plan-actions">
                        <button
                          className="plan-action-btn edit"
                          onClick={() => handleEditPlan(plan)}
                          title={t('common:buttons.edit')}
                        >
                          ✎
                        </button>
                        <button
                          className="plan-action-btn delete"
                          onClick={() => handleDeletePlan(plan.id)}
                          title={t('common:buttons.delete')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {plan.description && (
                      <p className="plan-description">{plan.description}</p>
                    )}
                    <div className="plan-meta">
                      <span className={`plan-status status-${plan.status}`}>
                        {plan.status}
                      </span>
                      {plan.startDate && (
                        <span className="plan-dates">
                          {plan.startDate} {plan.endDate && `- ${plan.endDate}`}
                        </span>
                      )}
                    </div>
                    {apiKey && (
                      <button
                        className="generate-tasks-btn"
                        onClick={() => handleGenerateDailyTasks(plan)}
                        disabled={isGeneratingTasks}
                      >
                        {isGeneratingTasks ? t('common:status.generating') : `✨ ${t('common:ai.generateTasks')}`}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'progress' && (
          <div className="progress-view">
            <h2>{t('progress:title')}</h2>

            {/* Streak Badge */}
            <div className="streak-section">
              <div className={`streak-badge ${currentStreak > 0 ? 'active' : ''}`}>
                <span className="streak-icon">{currentStreak > 0 ? '🔥' : '💤'}</span>
                <span className="streak-count">{currentStreak}</span>
                <span className="streak-label">{t('progress:streak.label')}</span>
              </div>
              <p className="streak-hint">
                {currentStreak > 0
                  ? t('progress:streak.active', { count: currentStreak })
                  : t('progress:streak.inactive')}
              </p>
            </div>

            {/* Year Selector */}
            <div className="year-selector">
              <button
                className="year-nav-btn"
                onClick={() => setProgressYear(y => y - 1)}
              >
                &larr;
              </button>
              <span className="year-display">{t('progress:year', { year: progressYear })}</span>
              <button
                className="year-nav-btn"
                onClick={() => setProgressYear(y => y + 1)}
                disabled={progressYear >= new Date().getFullYear() + 5}
              >
                &rarr;
              </button>
            </div>

            {/* Heatmap Calendar */}
            <div className="heatmap-container">
              {isLoadingProgress ? (
                <div className="loading">{t('common:status.loading')}</div>
              ) : (
                <>
                  <div className="heatmap-months">
                    {[t('common:months.jan'), t('common:months.feb'), t('common:months.mar'), t('common:months.apr'), t('common:months.may'), t('common:months.jun'), t('common:months.jul'), t('common:months.aug'), t('common:months.sep'), t('common:months.oct'), t('common:months.nov'), t('common:months.dec')].map(month => (
                      <span key={month} className="heatmap-month">{month}</span>
                    ))}
                  </div>
                  <div className="heatmap-grid">
                    <div className="heatmap-weekdays">
                      <span>{t('common:days.sun')}</span>
                      <span>{t('common:days.mon')}</span>
                      <span>{t('common:days.tue')}</span>
                      <span>{t('common:days.wed')}</span>
                      <span>{t('common:days.thu')}</span>
                      <span>{t('common:days.fri')}</span>
                      <span>{t('common:days.sat')}</span>
                    </div>
                    <div className="heatmap-cells">
                      {heatmapData.map((day, idx) => (
                        day.taskCount === -1 ? (
                          // Placeholder cell for alignment
                          <div key={`placeholder-${idx}`} className="heatmap-cell placeholder" />
                        ) : (
                          <div
                            key={day.date}
                            className={`heatmap-cell level-${day.level}`}
                            data-tooltip={`${day.date}: ${Math.round(day.completionRate * 100)}% (${day.taskCount})`}
                            onClick={() => {
                              setSelectedHeatmapDate(day.date);
                              setSelectedDate(day.date);
                              setActiveTab('today');
                            }}
                          />
                        )
                      ))}
                    </div>
                  </div>
                  <div className="heatmap-legend">
                    <span className="legend-label">{t('progress:heatmap.legend.less')}</span>
                    <div className="heatmap-cell level-0" data-tooltip={t('progress:heatmap.levels.0')} />
                    <div className="heatmap-cell level-1" data-tooltip={t('progress:heatmap.levels.1')} />
                    <div className="heatmap-cell level-2" data-tooltip={t('progress:heatmap.levels.2')} />
                    <div className="heatmap-cell level-3" data-tooltip={t('progress:heatmap.levels.3')} />
                    <div className="heatmap-cell level-4" data-tooltip={t('progress:heatmap.levels.4')} />
                    <span className="legend-label">{t('progress:heatmap.legend.more')}</span>
                  </div>
                </>
              )}
            </div>

            {/* Stats Summary */}
            <div className="progress-stats">
              <div className="stat-card">
                <span className="stat-value">
                  {heatmapData.filter(d => d.taskCount > 0).length}
                </span>
                <span className="stat-label">{t('progress:stats.activeDays')}</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {heatmapData.filter(d => d.taskCount >= 0).reduce((sum, d) => sum + d.taskCount, 0)}
                </span>
                <span className="stat-label">{t('progress:stats.totalTasks')}</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {heatmapData.length > 0
                    ? Math.round(
                        (heatmapData.filter(d => d.taskCount >= 0 && d.completionRate >= 0.5).length /
                          Math.max(1, heatmapData.filter(d => d.taskCount > 0).length)) * 100
                      )
                    : 0}%
                </span>
                <span className="stat-label">{t('progress:stats.achievementRate')}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'focus' && (
          <FocusView onNavigateToToday={() => {
            setSelectedDate(formatDate(new Date()));
            setActiveTab('today');
          }} />
        )}

        {activeTab === 'settings' && (
          <div className="settings-view">
            <h2>{t('settings:title')}</h2>

            {/* Language Settings */}
            <div className="settings-section">
              <h3>{t('settings:language.title')}</h3>
              <p className="settings-description">
                {t('settings:language.description')}
              </p>
              <div className="language-setting">
                <select
                  className="language-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                >
                  <option value="en">{t('settings:language.options.en')}</option>
                  <option value="ko">{t('settings:language.options.ko')}</option>
                </select>
              </div>
            </div>

            {/* API Key Settings */}
            <div className="settings-section">
              <h3>{t('settings:apiKey.title')}</h3>
              <p className="settings-description">
                {t('settings:apiKey.description')}
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                  {t('settings:apiKey.getKey')}
                </a>
              </p>

              <div className="api-key-setting">
                <div className="api-key-input-wrapper">
                  <input
                    type={isApiKeyVisible ? 'text' : 'password'}
                    className="api-key-input"
                    placeholder={t('settings:apiKey.placeholder')}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                  />
                  <button
                    className="api-key-toggle"
                    onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                    title={isApiKeyVisible ? t('settings:apiKey.hide') : t('settings:apiKey.show')}
                  >
                    {isApiKeyVisible ? '🙈' : '👁'}
                  </button>
                </div>
                <div className="api-key-actions">
                  <button
                    className="api-key-save"
                    onClick={handleSaveApiKey}
                    disabled={!apiKeyInput.trim() || apiKeyStatus === 'validating'}
                  >
                    {apiKeyStatus === 'validating' ? t('common:status.checking') : t('common:buttons.save')}
                  </button>
                  {apiKey && (
                    <button className="api-key-delete" onClick={handleDeleteApiKey}>
                      {t('common:buttons.delete')}
                    </button>
                  )}
                </div>
              </div>
              <div className={`api-key-status status-${apiKeyStatus}`}>
                {apiKeyStatus === 'none' && t('settings:apiKey.status.notSet')}
                {apiKeyStatus === 'saved' && t('settings:apiKey.status.saved')}
                {apiKeyStatus === 'validating' && t('settings:apiKey.status.checking')}
                {apiKeyStatus === 'valid' && t('settings:apiKey.status.valid')}
                {apiKeyStatus === 'invalid' && t('settings:apiKey.status.invalid')}
              </div>
            </div>

            {/* Shortcut Settings */}
            <div className="settings-section">
              <h3>{t('settings:shortcut.title')}</h3>
              <p className="settings-description">{t('settings:shortcut.description')}</p>

              <div className="shortcut-setting">
                <span className="shortcut-label">{t('settings:shortcut.toggle')}</span>
                <button
                  className={`shortcut-input ${isRecordingShortcut ? 'recording' : ''}`}
                  onClick={() => {
                    setIsRecordingShortcut(true);
                    setRecordedKeys([]);
                  }}
                >
                  {isRecordingShortcut
                    ? (recordedKeys.length > 0 ? recordedKeys.join('+') : t('settings:shortcut.placeholder'))
                    : currentShortcut
                  }
                </button>
                {isRecordingShortcut && (
                  <button
                    className="shortcut-cancel"
                    onClick={() => {
                      setIsRecordingShortcut(false);
                      setRecordedKeys([]);
                    }}
                  >
                    {t('common:buttons.cancel')}
                  </button>
                )}
              </div>

              {/* Tab Shortcuts */}
              <div className="tab-shortcuts-section">
                <h4>{t('settings:shortcut.tabShortcuts')}</h4>
                <p className="settings-description-small">{t('settings:shortcut.tabShortcutsDesc')}</p>
                <div className="tab-shortcuts-grid">
                  {['Today', 'Focus', 'Plans', 'Progress', 'Settings'].map((tabName, index) => (
                    <div key={tabName} className="tab-shortcut-item">
                      <span className="tab-shortcut-label">{tabName}</span>
                      <button
                        className={`tab-shortcut-input ${recordingTabIndex === index ? 'recording' : ''}`}
                        onClick={() => {
                          setRecordingTabIndex(index);
                          setRecordedTabKey('');
                        }}
                      >
                        {recordingTabIndex === index
                          ? (recordedTabKey || t('settings:shortcut.placeholder'))
                          : tabShortcuts[index]
                        }
                      </button>
                      {recordingTabIndex === index && (
                        <button
                          className="shortcut-cancel"
                          onClick={() => {
                            setRecordingTabIndex(null);
                            setRecordedTabKey('');
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="tab-shortcuts-hint">
                  {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'Cmd' : 'Ctrl'} + {t('settings:shortcut.tabShortcutsHint')}
                </p>
              </div>

              {/* AI Input Mode Shortcut */}
              <div className="ai-shortcut-section">
                <h4>{t('settings:shortcut.aiInputTitle')}</h4>
                <p className="settings-description-small">{t('settings:shortcut.aiInputDesc')}</p>
                <div className="ai-shortcut-setting">
                  <span className="ai-shortcut-label">{t('settings:shortcut.aiInputLabel')}</span>
                  <button
                    className={`ai-shortcut-input ${recordingAiShortcut ? 'recording' : ''}`}
                    onClick={() => {
                      setRecordingAiShortcut(true);
                      setRecordedAiShortcutKey('');
                    }}
                  >
                    {recordingAiShortcut
                      ? (recordedAiShortcutKey || t('settings:shortcut.placeholder'))
                      : aiInputShortcut
                    }
                  </button>
                  {recordingAiShortcut && (
                    <button
                      className="shortcut-cancel"
                      onClick={() => {
                        setRecordingAiShortcut(false);
                        setRecordedAiShortcutKey('');
                      }}
                    >
                      ✕
                    </button>
                  )}
                  <button
                    className="shortcut-reset"
                    onClick={async () => {
                      setAiInputShortcut('shift+tab');
                      await invoke('set_ai_input_shortcut', { shortcut: 'shift+tab' });
                    }}
                  >
                    {t('common:buttons.reset')}
                  </button>
                </div>
              </div>

              {/* Focus Input Shortcut */}
              <div className="ai-shortcut-section">
                <h4>{t('settings:shortcut.focusInputTitle')}</h4>
                <p className="settings-description-small">{t('settings:shortcut.focusInputDesc')}</p>
                <div className="ai-shortcut-setting">
                  <span className="ai-shortcut-label">{t('settings:shortcut.focusInputLabel')}</span>
                  <button
                    className={`ai-shortcut-input ${recordingFocusShortcut ? 'recording' : ''}`}
                    onClick={() => {
                      setRecordingFocusShortcut(true);
                      setRecordedFocusShortcutKey('');
                    }}
                  >
                    {recordingFocusShortcut
                      ? (recordedFocusShortcutKey || t('settings:shortcut.placeholder'))
                      : focusInputShortcut
                    }
                  </button>
                  {recordingFocusShortcut && (
                    <button
                      className="shortcut-cancel"
                      onClick={() => {
                        setRecordingFocusShortcut(false);
                        setRecordedFocusShortcutKey('');
                      }}
                    >
                      ✕
                    </button>
                  )}
                  <button
                    className="shortcut-reset"
                    onClick={async () => {
                      const defaultShortcut = isMac ? 'cmd+l' : 'ctrl+l';
                      setFocusInputShortcut(defaultShortcut);
                      await invoke('set_focus_input_shortcut', { shortcut: defaultShortcut });
                    }}
                  >
                    {t('common:buttons.reset')}
                  </button>
                </div>
              </div>
            </div>

            {/* Plan Rules Settings */}
            <div className="settings-section">
              <h3>{t('settings:planRules.title')}</h3>
              <p className="settings-description">
                {t('settings:planRules.description')}
                <br />
                {t('settings:planRules.example')}
              </p>

              <textarea
                className="plan-rules-input"
                placeholder={t('settings:planRules.placeholder')}
                value={planRulesInput}
                onChange={(e) => setPlanRulesInput(e.target.value)}
                rows={5}
              />
              <div className="plan-rules-actions">
                <button
                  className="plan-rules-save"
                  onClick={handleSavePlanRules}
                  disabled={planRulesInput === planRules}
                >
                  {planRulesSaved ? t('settings:planRules.saved') : t('common:buttons.save')}
                </button>
              </div>
            </div>

            {/* Export/Import Settings */}
            <div className="settings-section">
              <h3>{t('settings:export.title')}</h3>
              <p className="settings-description">
                {t('settings:export.description')}
                <br />
                {t('settings:export.hint')}
              </p>

              <div className="export-import-section">
                <div className="export-import-group">
                  <h4>{t('settings:export.exportSection')}</h4>

                  {/* 날짜 범위 선택 */}
                  <div className="export-date-range">
                    <label className="date-range-label">{t('settings:export.dateRange')}</label>
                    <div className="date-range-inputs">
                      <input
                        type="date"
                        className="date-input"
                        value={exportStartDate}
                        onChange={(e) => setExportStartDate(e.target.value)}
                      />
                      <span className="date-range-separator">~</span>
                      <input
                        type="date"
                        className="date-input"
                        value={exportEndDate}
                        onChange={(e) => setExportEndDate(e.target.value)}
                      />
                    </div>
                    <div className="date-range-presets">
                      <button
                        type="button"
                        className="date-preset-btn"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 7);
                          setExportStartDate(formatDate(d));
                          setExportEndDate(formatDate(new Date()));
                        }}
                      >
                        {t('settings:export.presets.7days')}
                      </button>
                      <button
                        type="button"
                        className="date-preset-btn"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 30);
                          setExportStartDate(formatDate(d));
                          setExportEndDate(formatDate(new Date()));
                        }}
                      >
                        {t('settings:export.presets.30days')}
                      </button>
                      <button
                        type="button"
                        className="date-preset-btn"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 90);
                          setExportStartDate(formatDate(d));
                          setExportEndDate(formatDate(new Date()));
                        }}
                      >
                        {t('settings:export.presets.90days')}
                      </button>
                    </div>
                  </div>

                  <div className="export-import-buttons">
                    <button
                      className="export-btn"
                      onClick={handleExportToJson}
                      disabled={isExporting || (plans.length === 0 && getFilteredTasks().length === 0)}
                    >
                      {isExporting ? t('common:status.exporting') : `📄 ${t('settings:export.buttons.json')}`}
                    </button>
                    <button
                      className="export-btn markdown"
                      onClick={handleExportToFolder}
                      disabled={isExporting || (plans.length === 0 && getFilteredTasks().length === 0)}
                    >
                      {isExporting ? t('common:status.exporting') : `📁 ${t('settings:export.buttons.markdown')}`}
                    </button>
                  </div>
                  <p className="export-import-hint">
                    {t('settings:export.info', { plans: plans.length, tasks: getFilteredTasks().length })}
                  </p>
                </div>

                <div className="export-import-group">
                  <h4>{t('settings:export.importSection')}</h4>
                  <div className="export-import-buttons">
                    <button
                      className="import-btn"
                      onClick={handleImportFromJson}
                      disabled={isImporting}
                    >
                      {isImporting ? t('common:status.importing') : `📥 ${t('settings:export.buttons.import')}`}
                    </button>
                  </div>
                  <p className="export-import-hint">
                    {t('settings:export.importHint')}
                  </p>
                </div>
              </div>

              {exportImportMessage && (
                <div className={`export-import-message ${exportImportMessage.startsWith('✓') ? 'success' : 'error'}`}>
                  {exportImportMessage}
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="modal edit-task-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('today:editModal.title')}</h3>
            <div className="edit-task-fields">
              <div className="edit-field">
                <label>{t('today:editModal.titleLabel')}</label>
                <input
                  type="text"
                  className="modal-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') setEditingTask(null);
                  }}
                  autoFocus
                />
              </div>
              <div className="edit-field time-range-field">
                <label>{t('today:editModal.timeLabel')}</label>
                <div className="time-range-inputs">
                  <input
                    type="time"
                    className="modal-input time-input"
                    value={editScheduledTime}
                    onChange={(e) => setEditScheduledTime(e.target.value)}
                  />
                  <span className="time-separator">~</span>
                  <input
                    type="time"
                    className="modal-input time-input"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="edit-field">
                <label>{t('today:editModal.locationLabel')}</label>
                <input
                  type="text"
                  className="modal-input"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder={t('today:editModal.locationPlaceholder')}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setEditingTask(null)}>
                {t('common:buttons.cancel')}
              </button>
              <button className="modal-btn save" onClick={handleSaveEdit}>
                {t('common:buttons.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Task Modal */}
      {splittingTask && (
        <div className="modal-overlay" onClick={() => {
          setSplittingTask(null);
          setAiSplitSuggestions([]);
        }}>
          <div className="modal split-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('today:splitModal.title')}</h3>
            <p className="split-task-title">{splittingTask.title}</p>

            {/* AI Suggestion Button */}
            {apiKey && (
              <button
                className="ai-suggest-btn"
                onClick={handleAiSplitTask}
                disabled={isGenerating}
              >
                {isGenerating ? t('common:status.generating') : `✨ ${t('common:ai.split')}`}
              </button>
            )}

            <div className="split-inputs">
              {splitSubtasks.map((subtask, index) => (
                <input
                  key={index}
                  type="text"
                  className="modal-input"
                  placeholder={t('today:splitModal.subtaskPlaceholder', { index: index + 1 })}
                  value={subtask}
                  onChange={(e) => {
                    const newSubtasks = [...splitSubtasks];
                    newSubtasks[index] = e.target.value;
                    setSplitSubtasks(newSubtasks);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && index === splitSubtasks.length - 1) {
                      handleSaveSplit();
                    }
                  }}
                  autoFocus={index === 0}
                />
              ))}
              <button
                className="add-subtask-btn"
                onClick={() => setSplitSubtasks([...splitSubtasks, ''])}
              >
                {t('today:splitModal.addSubtask')}
              </button>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => {
                setSplittingTask(null);
                setAiSplitSuggestions([]);
              }}>
                {t('common:buttons.cancel')}
              </button>
              <button
                className="modal-btn save"
                onClick={handleSaveSplit}
                disabled={!splitSubtasks.some(s => s.trim())}
              >
                {t('today:splitModal.split')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subtask Modal */}
      {editingSubtask && (
        <div className="modal-overlay" onClick={() => setEditingSubtask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('today:subtaskModal.title')}</h3>
            <input
              type="text"
              className="modal-input"
              value={editSubtaskTitle}
              onChange={(e) => setEditSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveSubtaskEdit();
                if (e.key === 'Escape') setEditingSubtask(null);
              }}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setEditingSubtask(null)}>
                {t('common:buttons.cancel')}
              </button>
              <button className="modal-btn save" onClick={handleSaveSubtaskEdit}>
                {t('common:buttons.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="modal-overlay" onClick={() => setEditingPlan(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('plans:editModal.title')}</h3>
            <input
              type="text"
              className="modal-input"
              placeholder={t('plans:editModal.titlePlaceholder')}
              value={editPlanTitle}
              onChange={(e) => setEditPlanTitle(e.target.value)}
              autoFocus
            />
            <textarea
              className="modal-textarea"
              placeholder={t('plans:editModal.descriptionPlaceholder')}
              value={editPlanDescription}
              onChange={(e) => setEditPlanDescription(e.target.value)}
              rows={3}
            />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setEditingPlan(null)}>
                {t('common:buttons.cancel')}
              </button>
              <button
                className="modal-btn save"
                onClick={handleSavePlanEdit}
                disabled={!editPlanTitle.trim()}
              >
                {t('common:buttons.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
