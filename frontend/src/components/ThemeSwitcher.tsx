import { Moon, Palette, SunMedium, Monitor } from 'lucide-react';
import type { MouseEvent } from 'react';

import { MODE_OPTIONS, PALETTE_OPTIONS, useThemeStore, type ThemeMode, type ThemePalette } from '@/stores/themeStore';

const modeIcon = {
  light: SunMedium,
  dark: Moon,
  system: Monitor,
};

const getOrigin = (event: MouseEvent<HTMLElement>) => ({ x: event.clientX, y: event.clientY });

export function ThemeSwitcher() {
  const { mode, palette, setMode, setPalette } = useThemeStore();

  return (
    <div className="theme-switcher" aria-label="主题设置">
      <div className="theme-switcher__group" role="group" aria-label="深浅色模式">
        {MODE_OPTIONS.map((option) => {
          const Icon = modeIcon[option.key];
          return (
            <button
              key={option.key}
              type="button"
              className="segmented-button"
              data-active={mode === option.key}
              onClick={(event) => setMode(option.key as ThemeMode, getOrigin(event))}
              title={option.label}
              aria-label={option.label}
            >
              <Icon size={15} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="theme-switcher__palette" role="group" aria-label="配色">
        <Palette size={16} />
        {PALETTE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className="palette-swatch"
            data-palette={option.key}
            data-active={palette === option.key}
            onClick={(event) => setPalette(option.key as ThemePalette, getOrigin(event))}
            title={`${option.label}：${option.description}`}
            aria-label={option.label}
          >
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}
