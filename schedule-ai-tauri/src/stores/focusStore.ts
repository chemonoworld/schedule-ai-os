import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import i18n from '../i18n';
import { recordBlockEvent } from '../db';

// Chrome Extension에서 Focus 제어 명령
interface ExtensionFocusCommand {
  command: 'start' | 'stop';
  blockedUrls: string[];
  timerType: string;
  timerDuration: number;
}

export interface RunningApp {
  bundle_id: string;
  name: string;
}

export interface SavedBlockedApp {
  bundle_id: string;
  name: string;
}

export interface SavedBlockedUrl {
  pattern: string;
  name: string;
  enabled: boolean;
}

// 기본 차단 URL 목록
const DEFAULT_BLOCKED_URLS: SavedBlockedUrl[] = [
  { pattern: 'youtube.com', name: 'YouTube', enabled: true },
  { pattern: 'facebook.com', name: 'Facebook', enabled: true },
  { pattern: 'instagram.com', name: 'Instagram', enabled: true },
  { pattern: 'twitter.com', name: 'Twitter/X', enabled: true },
  { pattern: 'x.com', name: 'X', enabled: true },
  { pattern: 'linkedin.com', name: 'LinkedIn', enabled: false },
  { pattern: 'reddit.com', name: 'Reddit', enabled: true },
  { pattern: 'mail.google.com', name: 'Gmail', enabled: false },
  { pattern: 'tiktok.com', name: 'TikTok', enabled: true },
];

// 뽀모도로 내부 모드 (집중/휴식)
export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';

// Focus Mode 타이머 타입
export type FocusTimerType = 'none' | 'timer' | 'pomodoro';

export interface PomodoroSettings {
  focusDuration: number; // 분
  shortBreakDuration: number; // 분
  longBreakDuration: number; // 분
  longBreakInterval: number; // 몇 번째 뽀모도로 후 긴 휴식
}

const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
};

interface FocusState {
  // 상태
  isActive: boolean;
  blockedApps: string[]; // bundle IDs (현재 세션)
  savedBlocklist: SavedBlockedApp[]; // 저장된 블랙리스트
  blockedUrls: string[]; // URL 패턴 (현재 세션, Chrome Extension용)
  savedBlockedUrls: SavedBlockedUrl[]; // 저장된 차단 URL 목록
  runningApps: RunningApp[];
  installedApps: RunningApp[];
  currentFrontmostApp: RunningApp | null;
  startedAt: number | null; // timestamp
  elapsedSeconds: number;
  terminatedApps: string[]; // 종료된 앱 목록 (중복 알림 방지)

  // 타이머 설정
  focusTimerType: FocusTimerType; // 타이머 타입 선택

  // 일반 타이머
  timerDuration: number; // 일반 타이머 설정 시간 (분)
  timerSeconds: number; // 남은 시간 (초)
  isTimerRunning: boolean;
  isFocusSessionActive: boolean; // 집중 세션 활성화 (뽀모도로에서 pause/reset 시에도 유지)

  // 뽀모도로 타이머
  pomodoroPhase: PomodoroPhase;
  pomodoroCount: number; // 완료한 뽀모도로 수
  pomodoroSettings: PomodoroSettings;

  // 액션
  loadRunningApps: () => Promise<void>;
  loadInstalledApps: () => Promise<void>;
  loadSavedBlocklist: () => void;
  loadSavedBlockedUrls: () => void;
  addToBlocklist: (app: SavedBlockedApp) => void;
  removeFromBlocklist: (bundleId: string) => void;
  addBlockedUrl: (url: SavedBlockedUrl) => void;
  removeBlockedUrl: (pattern: string) => void;
  toggleBlockedUrl: (pattern: string, enabled: boolean) => void;
  startFocus: (blockedApps: string[]) => void;
  stopFocus: () => void;
  checkFrontmostApp: () => Promise<void>;
  tick: () => void;
  notifyFocusStateToExtension: () => Promise<void>;

  // 타이머 액션
  setFocusTimerType: (type: FocusTimerType) => void;
  setTimerDuration: (minutes: number) => void;
  loadPomodoroSettings: () => void;
  savePomodoroSettings: (settings: PomodoroSettings) => void;
  startTimer: (blockedApps?: string[]) => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  skipTimer: () => void;
  tickTimer: () => void;
  resetPomodoroCount: () => void;
  stopFocusSession: () => void;

  // Chrome Extension 연동
  setupExtensionListener: () => Promise<UnlistenFn>;
  handleExtensionCommand: (command: ExtensionFocusCommand) => void;
}

// macOS에서 앱을 강제로 활성화 (다른 앱 위로 가져오기)
async function activateApp() {
  try {
    await invoke('activate_app_command');
  } catch (error) {
    console.error('Failed to activate app:', error);
  }
}

// 앱 종료 함수
async function terminateApp(bundleId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('terminate_app_command', { bundleId });
  } catch (error) {
    console.error('Failed to terminate app:', error);
    return false;
  }
}

// 알림 발송 함수 (소리 포함)
async function sendTerminateNotification(appName: string) {
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    if (permissionGranted) {
      await sendNotification({
        title: i18n.t('focus:notification.title'),
        body: i18n.t('focus:notification.terminated', { appName }),
        sound: 'default',
      });
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

// 타이머 완료 알림
async function sendTimerNotification(phase: PomodoroPhase | 'timer') {
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    if (permissionGranted) {
      let title: string;
      let body: string;
      if (phase === 'timer') {
        title = i18n.t('focus:timer.notification.timerComplete');
        body = i18n.t('focus:timer.notification.timerDone');
      } else if (phase === 'focus') {
        title = i18n.t('focus:timer.notification.focusComplete');
        body = i18n.t('focus:timer.notification.takeBreak');
      } else {
        title = i18n.t('focus:timer.notification.breakComplete');
        body = i18n.t('focus:timer.notification.backToWork');
      }
      await sendNotification({ title, body, sound: 'default' });
    }
  } catch (error) {
    console.error('Failed to send timer notification:', error);
  }
}

const BLOCKLIST_STORAGE_KEY = 'focus-blocklist';
const BLOCKED_URLS_STORAGE_KEY = 'focus-blocked-urls';
const POMODORO_SETTINGS_KEY = 'pomodoro-settings';
const FOCUS_TIMER_TYPE_KEY = 'focus-timer-type';
const TIMER_DURATION_KEY = 'timer-duration';

// Chrome Extension에 Focus 상태 알림
async function notifyFocusState(
  isActive: boolean,
  blockedUrls: string[],
  elapsedSeconds: number,
  timerSeconds: number,
  timerType: string
) {
  try {
    await invoke('notify_focus_state', {
      isActive,
      blockedUrls,
      elapsedSeconds,
      timerSeconds,
      timerType,
    });
  } catch (error) {
    // IPC 서버가 아직 시작되지 않았거나 오류 시 무시
    console.debug('Failed to notify focus state:', error);
  }
}

export const useFocusStore = create<FocusState>((set, get) => ({
  isActive: false,
  blockedApps: [],
  savedBlocklist: [],
  blockedUrls: [],
  savedBlockedUrls: DEFAULT_BLOCKED_URLS,
  runningApps: [],
  installedApps: [],
  currentFrontmostApp: null,
  startedAt: null,
  elapsedSeconds: 0,
  terminatedApps: [],

  // 타이머 설정
  focusTimerType: 'none',
  timerDuration: 25, // 기본 25분
  timerSeconds: 25 * 60,
  isTimerRunning: false,
  isFocusSessionActive: false,

  // 뽀모도로 상태
  pomodoroPhase: 'focus',
  pomodoroCount: 0,
  pomodoroSettings: DEFAULT_POMODORO_SETTINGS,

  loadRunningApps: async () => {
    try {
      const apps = await invoke<RunningApp[]>('get_running_apps_command');
      // Schedule AI 자신은 목록에서 제외
      const filteredApps = apps.filter(app => app.bundle_id !== 'com.scheduleai.app');
      set({ runningApps: filteredApps });
    } catch (error) {
      console.error('Failed to load running apps:', error);
    }
  },

  loadInstalledApps: async () => {
    try {
      const apps = await invoke<RunningApp[]>('get_installed_apps_command');
      // Schedule AI 자신은 목록에서 제외
      const filteredApps = apps.filter(app => app.bundle_id !== 'com.scheduleai.app');
      set({ installedApps: filteredApps });
    } catch (error) {
      console.error('Failed to load installed apps:', error);
    }
  },

  loadSavedBlocklist: () => {
    try {
      const saved = localStorage.getItem(BLOCKLIST_STORAGE_KEY);
      if (saved) {
        const blocklist = JSON.parse(saved) as SavedBlockedApp[];
        set({ savedBlocklist: blocklist });
      }
    } catch (error) {
      console.error('Failed to load saved blocklist:', error);
    }
  },

  loadSavedBlockedUrls: () => {
    try {
      const saved = localStorage.getItem(BLOCKED_URLS_STORAGE_KEY);
      if (saved) {
        const urls = JSON.parse(saved) as SavedBlockedUrl[];
        set({ savedBlockedUrls: urls });
      }
    } catch (error) {
      console.error('Failed to load saved blocked URLs:', error);
    }
  },

  addToBlocklist: (app: SavedBlockedApp) => {
    const { savedBlocklist } = get();
    if (savedBlocklist.some(a => a.bundle_id === app.bundle_id)) return;

    const newBlocklist = [...savedBlocklist, app];
    set({ savedBlocklist: newBlocklist });
    localStorage.setItem(BLOCKLIST_STORAGE_KEY, JSON.stringify(newBlocklist));
  },

  removeFromBlocklist: (bundleId: string) => {
    const { savedBlocklist } = get();
    const newBlocklist = savedBlocklist.filter(a => a.bundle_id !== bundleId);
    set({ savedBlocklist: newBlocklist });
    localStorage.setItem(BLOCKLIST_STORAGE_KEY, JSON.stringify(newBlocklist));
  },

  addBlockedUrl: (url: SavedBlockedUrl) => {
    const { savedBlockedUrls } = get();
    if (savedBlockedUrls.some(u => u.pattern === url.pattern)) return;

    const newUrls = [...savedBlockedUrls, url];
    set({ savedBlockedUrls: newUrls });
    localStorage.setItem(BLOCKED_URLS_STORAGE_KEY, JSON.stringify(newUrls));
  },

  removeBlockedUrl: (pattern: string) => {
    const { savedBlockedUrls } = get();
    const newUrls = savedBlockedUrls.filter(u => u.pattern !== pattern);
    set({ savedBlockedUrls: newUrls });
    localStorage.setItem(BLOCKED_URLS_STORAGE_KEY, JSON.stringify(newUrls));
  },

  toggleBlockedUrl: (pattern: string, enabled: boolean) => {
    const { savedBlockedUrls } = get();
    const newUrls = savedBlockedUrls.map(u =>
      u.pattern === pattern ? { ...u, enabled } : u
    );
    set({ savedBlockedUrls: newUrls });
    localStorage.setItem(BLOCKED_URLS_STORAGE_KEY, JSON.stringify(newUrls));
  },

  startFocus: (blockedApps: string[]) => {
    const { savedBlockedUrls, focusTimerType, timerSeconds } = get();
    const enabledUrls = savedBlockedUrls.filter(u => u.enabled).map(u => u.pattern);

    set({
      isActive: true,
      blockedApps,
      blockedUrls: enabledUrls,
      startedAt: Date.now(),
      elapsedSeconds: 0,
      terminatedApps: [],
    });

    // Chrome Extension에 알림
    notifyFocusState(true, enabledUrls, 0, timerSeconds, focusTimerType);
  },

  stopFocus: () => {
    const { focusTimerType, timerSeconds } = get();

    set({
      isActive: false,
      blockedApps: [],
      blockedUrls: [],
      startedAt: null,
      elapsedSeconds: 0,
      currentFrontmostApp: null,
      terminatedApps: [],
    });

    // Chrome Extension에 알림
    notifyFocusState(false, [], 0, timerSeconds, focusTimerType);
  },

  checkFrontmostApp: async () => {
    const { isActive, blockedApps, terminatedApps } = get();
    if (!isActive) return;

    try {
      const frontmost = await invoke<RunningApp | null>('get_frontmost_app_command');
      set({ currentFrontmostApp: frontmost });

      if (frontmost && blockedApps.includes(frontmost.bundle_id)) {
        // 차단된 앱 감지 -> 종료
        const terminated = await terminateApp(frontmost.bundle_id);
        if (terminated) {
          // DB에 차단 이벤트 기록 (항상)
          try {
            await recordBlockEvent(frontmost.bundle_id, frontmost.name);
          } catch (dbError) {
            console.error('Failed to record block event:', dbError);
          }
          // 알림은 세션 내 중복 방지
          if (!terminatedApps.includes(frontmost.bundle_id)) {
            set({ terminatedApps: [...terminatedApps, frontmost.bundle_id] });
            await sendTerminateNotification(frontmost.name);
          }
        }
        // 우리 앱 활성화
        await activateApp();
      }
    } catch (error) {
      console.error('Failed to check frontmost app:', error);
    }
  },

  tick: () => {
    const { isActive, startedAt, blockedUrls, focusTimerType, timerSeconds } = get();
    if (isActive && startedAt) {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      set({ elapsedSeconds: elapsed });

      // 1초마다 Chrome Extension에 상태 알림
      notifyFocusState(true, blockedUrls, elapsed, timerSeconds, focusTimerType);
    }
  },

  notifyFocusStateToExtension: async () => {
    const { isActive, blockedUrls, elapsedSeconds, timerSeconds, focusTimerType } = get();
    await notifyFocusState(isActive, blockedUrls, elapsedSeconds, timerSeconds, focusTimerType);
  },

  // 타이머 타입 설정
  setFocusTimerType: (type: FocusTimerType) => {
    set({ focusTimerType: type, isTimerRunning: false });
    localStorage.setItem(FOCUS_TIMER_TYPE_KEY, type);
    // 타입에 따라 타이머 초기화
    const { timerDuration, pomodoroSettings } = get();
    if (type === 'timer') {
      set({ timerSeconds: timerDuration * 60 });
    } else if (type === 'pomodoro') {
      set({ timerSeconds: pomodoroSettings.focusDuration * 60, pomodoroPhase: 'focus' });
    }
  },

  setTimerDuration: (minutes: number) => {
    set({ timerDuration: minutes, timerSeconds: minutes * 60 });
    localStorage.setItem(TIMER_DURATION_KEY, String(minutes));
  },

  loadPomodoroSettings: () => {
    try {
      // 타이머 타입 로드
      const savedType = localStorage.getItem(FOCUS_TIMER_TYPE_KEY) as FocusTimerType | null;
      if (savedType) {
        set({ focusTimerType: savedType });
      }
      // 일반 타이머 시간 로드
      const savedDuration = localStorage.getItem(TIMER_DURATION_KEY);
      if (savedDuration) {
        const duration = parseInt(savedDuration, 10);
        set({ timerDuration: duration });
      }
      // 뽀모도로 설정 로드
      const saved = localStorage.getItem(POMODORO_SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved) as PomodoroSettings;
        set({ pomodoroSettings: settings });
      }
      // 타이머 초기화
      const { focusTimerType, timerDuration, pomodoroSettings } = get();
      if (focusTimerType === 'timer') {
        set({ timerSeconds: timerDuration * 60 });
      } else if (focusTimerType === 'pomodoro') {
        set({ timerSeconds: pomodoroSettings.focusDuration * 60 });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  savePomodoroSettings: (settings: PomodoroSettings) => {
    set({ pomodoroSettings: settings });
    localStorage.setItem(POMODORO_SETTINGS_KEY, JSON.stringify(settings));
    // 현재 모드에 맞게 타이머 리셋
    const { pomodoroPhase } = get();
    let seconds = settings.focusDuration * 60;
    if (pomodoroPhase === 'shortBreak') seconds = settings.shortBreakDuration * 60;
    if (pomodoroPhase === 'longBreak') seconds = settings.longBreakDuration * 60;
    set({ timerSeconds: seconds, isTimerRunning: false });
  },

  startTimer: (blockedApps?: string[]) => {
    const { focusTimerType, pomodoroPhase, blockedApps: currentBlockedApps, savedBlockedUrls, timerSeconds } = get();
    const appsToBlock = blockedApps ?? currentBlockedApps;
    const enabledUrls = savedBlockedUrls.filter(u => u.enabled).map(u => u.pattern);

    // 뽀모도로 휴식 모드에서는 앱 블로킹 해제
    if (focusTimerType === 'pomodoro' && pomodoroPhase !== 'focus') {
      set({
        isTimerRunning: true,
        isFocusSessionActive: true,
        isActive: false,
        blockedApps: [],
        blockedUrls: [],
      });
      // Chrome Extension에 알림 (휴식 모드)
      notifyFocusState(false, [], 0, timerSeconds, focusTimerType);
    } else if (appsToBlock.length > 0) {
      // 집중 모드 또는 일반 타이머: 앱 블로킹 활성화
      set({
        isTimerRunning: true,
        isFocusSessionActive: true,
        isActive: true,
        blockedApps: appsToBlock,
        blockedUrls: enabledUrls,
        startedAt: Date.now(),
        elapsedSeconds: 0,
        terminatedApps: [],
      });
      // Chrome Extension에 알림
      notifyFocusState(true, enabledUrls, 0, timerSeconds, focusTimerType);
    } else {
      set({ isTimerRunning: true, isFocusSessionActive: true });
    }
  },

  pauseTimer: () => {
    set({ isTimerRunning: false });
  },

  resetTimer: () => {
    const { focusTimerType, timerDuration, pomodoroPhase, pomodoroSettings } = get();
    let seconds: number;
    if (focusTimerType === 'timer') {
      seconds = timerDuration * 60;
    } else {
      seconds = pomodoroSettings.focusDuration * 60;
      if (pomodoroPhase === 'shortBreak') seconds = pomodoroSettings.shortBreakDuration * 60;
      if (pomodoroPhase === 'longBreak') seconds = pomodoroSettings.longBreakDuration * 60;
    }
    set({ timerSeconds: seconds, isTimerRunning: false });
  },

  skipTimer: () => {
    const { focusTimerType, pomodoroPhase, pomodoroCount, pomodoroSettings, timerDuration } = get();

    if (focusTimerType === 'timer') {
      // 일반 타이머는 리셋
      set({ timerSeconds: timerDuration * 60, isTimerRunning: false });
      return;
    }

    // 뽀모도로 모드 - 화면 유지, 타이머만 전환
    if (pomodoroPhase === 'focus') {
      const newCount = pomodoroCount + 1;
      const isLongBreak = newCount % pomodoroSettings.longBreakInterval === 0;
      const nextPhase: PomodoroPhase = isLongBreak ? 'longBreak' : 'shortBreak';
      const nextSeconds = isLongBreak
        ? pomodoroSettings.longBreakDuration * 60
        : pomodoroSettings.shortBreakDuration * 60;
      set({
        pomodoroPhase: nextPhase,
        timerSeconds: nextSeconds,
        pomodoroCount: newCount,
        isTimerRunning: false,
      });
    } else {
      set({
        pomodoroPhase: 'focus',
        timerSeconds: pomodoroSettings.focusDuration * 60,
        isTimerRunning: false,
      });
    }
  },

  tickTimer: () => {
    const { isTimerRunning, timerSeconds, focusTimerType, pomodoroPhase, pomodoroCount, pomodoroSettings, timerDuration } = get();
    if (!isTimerRunning) return;

    if (timerSeconds <= 1) {
      if (focusTimerType === 'timer') {
        // 일반 타이머 완료 - 집중 모드 종료
        sendTimerNotification('timer');
        set({
          timerSeconds: timerDuration * 60,
          isTimerRunning: false,
          isFocusSessionActive: false,
          isActive: false,
          blockedApps: [],
        });
        return;
      }

      // 뽀모도로 타이머 완료 - 화면 유지
      sendTimerNotification(pomodoroPhase);

      if (pomodoroPhase === 'focus') {
        // 집중 완료 -> 휴식으로 (앱 블로킹은 유지하되 타이머만 전환)
        const newCount = pomodoroCount + 1;
        const isLongBreak = newCount % pomodoroSettings.longBreakInterval === 0;
        const nextPhase: PomodoroPhase = isLongBreak ? 'longBreak' : 'shortBreak';
        const nextSeconds = isLongBreak
          ? pomodoroSettings.longBreakDuration * 60
          : pomodoroSettings.shortBreakDuration * 60;
        set({
          pomodoroPhase: nextPhase,
          timerSeconds: nextSeconds,
          pomodoroCount: newCount,
          isTimerRunning: false,
        });
      } else {
        // 휴식 완료 -> 집중으로
        set({
          pomodoroPhase: 'focus',
          timerSeconds: pomodoroSettings.focusDuration * 60,
          isTimerRunning: false,
        });
      }
    } else {
      set({ timerSeconds: timerSeconds - 1 });
    }
  },

  resetPomodoroCount: () => {
    set({ pomodoroCount: 0 });
  },

  stopFocusSession: () => {
    const { focusTimerType, timerDuration, pomodoroSettings } = get();
    const initialSeconds = focusTimerType === 'pomodoro'
      ? pomodoroSettings.focusDuration * 60
      : timerDuration * 60;
    set({
      isFocusSessionActive: false,
      isTimerRunning: false,
      isActive: false,
      blockedApps: [],
      blockedUrls: [],
      timerSeconds: initialSeconds,
      pomodoroPhase: 'focus',
      startedAt: null,
      elapsedSeconds: 0,
      terminatedApps: [],
    });
    // Chrome Extension에 알림
    notifyFocusState(false, [], 0, initialSeconds, focusTimerType);
  },

  // Chrome Extension 이벤트 리스너 설정 (emit + polling 하이브리드)
  setupExtensionListener: async () => {
    console.log('Setting up extension-focus-command listener...');

    // 1. Tauri emit 이벤트 리스너 (작동하면 즉시 반응)
    const unlisten = await listen<ExtensionFocusCommand>('extension-focus-command', (event) => {
      console.log('extension-focus-command event received:', event);
      get().handleExtensionCommand(event.payload);
    });
    console.log('extension-focus-command listener registered');

    // 2. Polling fallback (emit이 안 될 경우 대비)
    const pollInterval = setInterval(async () => {
      try {
        const command = await invoke<ExtensionFocusCommand | null>('poll_extension_command');
        if (command) {
          console.log('Polled extension command:', command);
          get().handleExtensionCommand(command);
        }
      } catch (err) {
        // 무시 (앱 종료 등)
      }
    }, 500); // 0.5초마다 폴링

    // cleanup 함수 반환
    return () => {
      unlisten();
      clearInterval(pollInterval);
    };
  },

  // Chrome Extension 명령 처리
  handleExtensionCommand: (command: ExtensionFocusCommand) => {
    const { savedBlocklist, savedBlockedUrls, isActive } = get();
    console.log('Extension command received:', command.command, 'isActive:', isActive);

    if (command.command === 'start') {
      // Chrome Extension에서 Focus 시작 요청
      // 저장된 앱 블랙리스트 사용
      const blockedApps = savedBlocklist.map(app => app.bundle_id);
      const enabledUrls = savedBlockedUrls.filter(u => u.enabled).map(u => u.pattern);

      set({
        isActive: true,
        blockedApps,
        blockedUrls: enabledUrls,
        startedAt: Date.now(),
        elapsedSeconds: 0,
        terminatedApps: [],
        isFocusSessionActive: true,
      });

      console.log('Focus started from Chrome Extension');
    } else if (command.command === 'stop') {
      // Chrome Extension에서 Focus 종료 요청
      set({
        isActive: false,
        blockedApps: [],
        blockedUrls: [],
        startedAt: null,
        elapsedSeconds: 0,
        currentFrontmostApp: null,
        terminatedApps: [],
        isFocusSessionActive: false,
        isTimerRunning: false,
      });

      console.log('Focus stopped from Chrome Extension');
    }
  },
}));
