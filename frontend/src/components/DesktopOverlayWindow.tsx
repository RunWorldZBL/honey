import { useEffect, useRef } from 'react';
import type { AppSettings, DictationOverlaySnapshot } from '@honey/api-contracts';

import { desktopShellClient } from '@/api/desktopShell';
import { DictationOverlay } from '@/components/DictationOverlay';
import { useDictationUiStore } from '@/stores/dictationUiStore';

export function DesktopOverlayWindow() {
  const { overlayEnabled, overlayPosition, overlaySnapshot, setOverlaySnapshot } = useDictationUiStore();
  const stageRef = useRef<HTMLDivElement>(null);
  const lastCenterOffsetXRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void desktopShellClient.onDictationOverlaySnapshot((event) => {
      if (disposed) {
        return;
      }

      setOverlaySnapshot(event.snapshot);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }

      unlisten = dispose;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setOverlaySnapshot]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!overlayEnabled) {
      if (lastCenterOffsetXRef.current !== 0) {
        lastCenterOffsetXRef.current = 0;
        void desktopShellClient.setOverlayCenterOffset(0, overlayPosition).catch(() => undefined);
      }
      return undefined;
    }

    if (!stage || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const publishMeasuredOffset = () => {
      const overlay = stage.querySelector<HTMLElement>('[data-testid="voice-status-bar"]');
      if (!overlay) {
        return;
      }

      const scaleFactor = window.devicePixelRatio || 1;
      const offsetX = Math.round((overlay.getBoundingClientRect().width * scaleFactor) / 2);
      if (offsetX === lastCenterOffsetXRef.current) {
        return;
      }

      lastCenterOffsetXRef.current = offsetX;
      void desktopShellClient.setOverlayCenterOffset(offsetX, overlayPosition).catch(() => undefined);
    };

    publishMeasuredOffset();
    const overlay = stage.querySelector<HTMLElement>('[data-testid="voice-status-bar"]');
    const resizeObserver = new ResizeObserver(publishMeasuredOffset);
    if (overlay) {
      resizeObserver.observe(overlay);
    }

    return () => resizeObserver.disconnect();
  }, [overlayEnabled, overlayPosition, overlaySnapshot]);

  if (!overlayEnabled) {
    return null;
  }

  return (
    <div className="desktop-overlay-stage" ref={stageRef}>
      <DictationOverlay
        position={overlayPosition as AppSettings['overlayPosition']}
        snapshot={overlaySnapshot}
      />
    </div>
  );
}
