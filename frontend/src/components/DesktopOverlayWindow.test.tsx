import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopOverlayWindow } from './DesktopOverlayWindow';
import { useDictationUiStore } from '@/stores/dictationUiStore';

const desktopShell = vi.hoisted(() => ({
  onDictationOverlaySnapshot: vi.fn(async () => () => undefined),
  setOverlayCenterOffset: vi.fn(async (offsetX: number) => ({ ok: true as const, offsetX })),
}));

vi.mock('@/api/desktopShell', () => ({
  desktopShellClient: desktopShell,
}));

describe('DesktopOverlayWindow', () => {
  beforeEach(() => {
    desktopShell.onDictationOverlaySnapshot.mockClear();
    desktopShell.setOverlayCenterOffset.mockClear();
    useDictationUiStore.setState({
      overlayEnabled: true,
      overlayPosition: 'bottom-center',
      overlaySnapshot: {
        state: 'listening',
        mode: 'direct',
        volumeLevel: 0.5,
      },
    });
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });
  });

  it('reports half of the measured bar width as a physical-pixel center offset', async () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function getBoundingClientRect(this: HTMLElement) {
      if (this.dataset.testid === 'voice-status-bar') {
        return {
          width: 82,
          height: 28,
          top: 0,
          right: 82,
          bottom: 28,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        };
      }

      return originalGetBoundingClientRect.call(this);
    });

    try {
      render(<DesktopOverlayWindow />);

      await waitFor(() => {
        expect(desktopShell.setOverlayCenterOffset).toHaveBeenCalledWith(82, 'bottom-center');
      });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });
});
