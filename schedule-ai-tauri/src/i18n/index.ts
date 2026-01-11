import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// English translations
import enCommon from './locales/en/common.json';
import enToday from './locales/en/today.json';
import enPlans from './locales/en/plans.json';
import enProgress from './locales/en/progress.json';
import enFocus from './locales/en/focus.json';
import enSettings from './locales/en/settings.json';

// Korean translations
import koCommon from './locales/ko/common.json';
import koToday from './locales/ko/today.json';
import koPlans from './locales/ko/plans.json';
import koProgress from './locales/ko/progress.json';
import koFocus from './locales/ko/focus.json';
import koSettings from './locales/ko/settings.json';

export const defaultNS = 'common';
export const resources = {
  en: {
    common: enCommon,
    today: enToday,
    plans: enPlans,
    progress: enProgress,
    focus: enFocus,
    settings: enSettings,
  },
  ko: {
    common: koCommon,
    today: koToday,
    plans: koPlans,
    progress: koProgress,
    focus: koFocus,
    settings: koSettings,
  },
} as const;

export type Language = 'en' | 'ko';
export const supportedLanguages: Language[] = ['en', 'ko'];

i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // 초기값, settingsStore에서 오버라이드
  fallbackLng: 'en',
  defaultNS,
  ns: ['common', 'today', 'plans', 'progress', 'focus', 'settings'],
  interpolation: {
    escapeValue: false, // React는 XSS 방어가 기본 내장
  },
  react: {
    useSuspense: false, // Tauri 환경에서는 끄는 것이 안정적
  },
});

export default i18n;
