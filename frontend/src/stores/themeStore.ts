import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePalette = 'qinghua' | 'zhusha' | 'zhuqing' | 'daimo';

export const MODE_OPTIONS: Array<{ key: ThemeMode; label: string }> = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
  { key: 'system', label: '跟随系统' },
];

export const PALETTE_OPTIONS: Array<{ key: ThemePalette; label: string; description: string }> = [
  { key: 'qinghua', label: '青花', description: '钴蓝和宣白' },
  { key: 'zhusha', label: '朱砂', description: '偏红醒目' },
  { key: 'zhuqing', label: '竹青', description: '低疲劳绿色' },
  { key: 'daimo', label: '黛墨', description: '克制水墨感' },
];

type ThemePoint = { x: number; y: number };

interface ThemeStore {
  mode: ThemeMode;
  palette: ThemePalette;
  setMode: (mode: ThemeMode, origin?: ThemePoint) => void;
  setPalette: (palette: ThemePalette, origin?: ThemePoint) => void;
}

let runtimeStarted = false;
let mediaQuery: MediaQueryList | undefined;

const getSystemMode = () => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const freezeThemeTransitions = () => {
  if (typeof document === 'undefined') {
    return () => undefined;
  }

  document.documentElement.setAttribute('data-theme-changing', 'true');
  const timeout = window.setTimeout(() => {
    document.documentElement.removeAttribute('data-theme-changing');
  }, 360);

  return () => {
    window.clearTimeout(timeout);
    document.documentElement.removeAttribute('data-theme-changing');
  };
};

const paintRippleFallback = (origin?: ThemePoint) => {
  if (!origin || typeof document === 'undefined') {
    return;
  }

  const ripple = document.createElement('span');
  ripple.className = 'theme-ripple';
  ripple.style.left = `${origin.x}px`;
  ripple.style.top = `${origin.y}px`;
  document.body.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 620);
};

const applyTheme = (mode: ThemeMode, palette: ThemePalette) => {
  if (typeof document === 'undefined') {
    return;
  }

  const resolvedMode = mode === 'system' ? getSystemMode() : mode;
  const root = document.documentElement;
  root.dataset.theme = palette;
  root.classList.toggle('dark', resolvedMode === 'dark');
  root.style.colorScheme = resolvedMode;
};

const runThemeChange = (next: { mode?: ThemeMode; palette?: ThemePalette }, origin?: ThemePoint) => {
  const current = useThemeStore.getState();
  const mode = next.mode ?? current.mode;
  const palette = next.palette ?? current.palette;

  if (typeof document === 'undefined') {
    return;
  }

  const cleanup = freezeThemeTransitions();
  const docWithTransition = document as Document & {
    startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> };
  };

  if (docWithTransition.startViewTransition && origin) {
    const transition = docWithTransition.startViewTransition(() => applyTheme(mode, palette));
    transition.finished.finally(cleanup);
    return;
  }

  applyTheme(mode, palette);
  paintRippleFallback(origin);
  window.setTimeout(cleanup, 420);
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'system',
      palette: 'qinghua',
      setMode: (mode, origin) => {
        set({ mode });
        runThemeChange({ mode }, origin);
      },
      setPalette: (palette, origin) => {
        set({ palette });
        runThemeChange({ palette }, origin);
      },
    }),
    {
      name: 'honey-theme',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ mode: state.mode, palette: state.palette }),
    },
  ),
);

export function initThemeRuntime() {
  if (typeof window === 'undefined' || runtimeStarted) {
    return;
  }

  runtimeStarted = true;
  const applyCurrent = () => {
    const { mode, palette } = useThemeStore.getState();
    applyTheme(mode, palette);
  };

  applyCurrent();
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', applyCurrent);
  useThemeStore.subscribe(applyCurrent);
}
