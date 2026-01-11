import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import i18n from '../i18n';

export type Language = 'en' | 'ko';

interface SettingsState {
  language: Language;
  isInitialized: boolean;

  // Actions
  initLanguage: () => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: 'en',
  isInitialized: false,

  initLanguage: async () => {
    try {
      // 1. 저장된 설정에서 언어 로드 시도
      const savedLang = await invoke<string | null>('get_language');

      if (savedLang && (savedLang === 'en' || savedLang === 'ko')) {
        await i18n.changeLanguage(savedLang);
        set({ language: savedLang as Language, isInitialized: true });
        return;
      }

      // 2. 저장된 설정이 없으면 시스템 언어 감지
      const systemLang = await invoke<string>('get_system_locale');
      const detectedLang: Language = systemLang === 'ko' ? 'ko' : 'en';

      await i18n.changeLanguage(detectedLang);
      set({ language: detectedLang, isInitialized: true });
    } catch (error) {
      console.error('Failed to init language:', error);
      await i18n.changeLanguage('en');
      set({ language: 'en', isInitialized: true });
    }
  },

  setLanguage: async (lang: Language) => {
    try {
      await invoke('set_language', { language: lang });
      await i18n.changeLanguage(lang);
      set({ language: lang });
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  },
}));
