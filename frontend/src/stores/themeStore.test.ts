import { describe, expect, it } from 'vitest';

import { PALETTE_OPTIONS, useThemeStore } from './themeStore';

describe('themeStore', () => {
  it('stores mode and palette independently', () => {
    useThemeStore.getState().setMode('dark');
    useThemeStore.getState().setPalette('zhuqing');

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(useThemeStore.getState().palette).toBe('zhuqing');
    expect(PALETTE_OPTIONS.map(option => option.key)).toEqual([
      'qinghua',
      'zhusha',
      'zhuqing',
      'daimo',
    ]);
  });
});
