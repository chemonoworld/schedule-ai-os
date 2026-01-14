import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

// Tauri API 모킹
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  Store: vi.fn(),
}));
