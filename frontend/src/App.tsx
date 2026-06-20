import { useCallback, useEffect, useMemo, useState } from 'react';

import { type AppRouteId } from '@/app/navigation';
import { backendClient } from '@/api/client';
import { desktopShellClient } from '@/api/desktopShell';
import { AppShell } from '@/components/AppShell';
import { DictationOverlay } from '@/components/DictationOverlay';
import { MiniWindow } from '@/components/MiniWindow';
import { useMockDictationHotkey } from '@/hooks/useMockDictationHotkey';
import { FileTranscriptionPage } from '@/pages/FileTranscriptionPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { HomePage } from '@/pages/HomePage';
import { HotwordsPage } from '@/pages/HotwordsPage';
import { ModelsPage } from '@/pages/ModelsPage';
import { PersonasPage } from '@/pages/PersonasPage';
import { RulesPage } from '@/pages/RulesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { useDictationUiStore } from '@/stores/dictationUiStore';

export default function App() {
  const [activeRoute, setActiveRoute] = useState<AppRouteId>('home');
  const [latestText, setLatestText] = useState<string>();
  const {
    windowMode,
    setWindowMode,
    currentMode,
    hotkey,
    triggerMode,
    triggerThresholdMs,
    asrModelStatus,
    overlayEnabled,
    overlayPosition,
    overlaySnapshot,
    forcePasteApps,
    outputMethod,
    restoreClipboard,
    setCurrentMode,
    setHotkey,
    setOverlayEnabled,
    setOverlayPosition,
    setTriggerMode,
    setTriggerThresholdMs,
    setOutputRuntimeSettings,
  } = useDictationUiStore();
  const handleSessionCompleted = useCallback((record: { outputText: string }) => {
    setLatestText(record.outputText);
  }, []);
  useMockDictationHotkey({
    enabled: windowMode === 'full',
    forcePasteApps,
    hotkey,
    latestText,
    outputMethod,
    restoreClipboard,
    triggerMode,
    triggerThresholdMs,
    onSessionCompleted: handleSessionCompleted,
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void desktopShellClient.onWindowModeChange((mode) => {
      setWindowMode(mode);
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
  }, [setWindowMode]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      backendClient.listTranscriptRecords(),
      backendClient.getSettings(),
    ]).then(([records, settings]) => {
      if (!cancelled) {
        setLatestText(records[0]?.outputText);
        setHotkey(settings.hotkey);
        setTriggerMode(settings.triggerMode);
        setTriggerThresholdMs(settings.triggerThresholdMs);
        setCurrentMode(settings.personaModeEnabled ? settings.defaultMode : 'direct');
        setOverlayEnabled(settings.overlayEnabled);
        setOverlayPosition(settings.overlayPosition);
        setWindowMode(settings.defaultWindowMode);
        setOutputRuntimeSettings({
          outputMethod: settings.outputMethod,
          restoreClipboard: settings.restoreClipboard,
          forcePasteApps: settings.forcePasteApps,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [setCurrentMode, setHotkey, setOverlayEnabled, setOverlayPosition, setOutputRuntimeSettings, setTriggerMode, setTriggerThresholdMs, setWindowMode]);

  const page = useMemo(() => {
    switch (activeRoute) {
      case 'history':
        return <HistoryPage />;
      case 'hotwords':
        return <HotwordsPage />;
      case 'rules':
        return <RulesPage />;
      case 'personas':
        return <PersonasPage />;
      case 'models':
        return <ModelsPage />;
      case 'files':
        return <FileTranscriptionPage />;
      case 'settings':
        return <SettingsPage />;
      case 'home':
      default:
        return <HomePage onRouteChange={setActiveRoute} />;
    }
  }, [activeRoute]);

  if (windowMode === 'mini') {
    return (
      <div className="mini-stage">
        <MiniWindow
          mode={currentMode}
          asrStatus={asrModelStatus}
          latestText={latestText}
          onOpenFull={() => setWindowMode('full')}
        />
      </div>
    );
  }

  return (
    <>
      <AppShell activeRoute={activeRoute} onRouteChange={setActiveRoute} onOpenMini={() => setWindowMode('mini')}>
        {page}
      </AppShell>
      {overlayEnabled ? <DictationOverlay position={overlayPosition} snapshot={overlaySnapshot} /> : null}
    </>
  );
}
