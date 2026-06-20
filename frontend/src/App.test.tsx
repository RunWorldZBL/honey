import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTranscriptRecords = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'rec-latest',
    createdAt: '2026-06-20T00:00:00.000Z',
    mode: 'direct',
    rawText: 'latest raw',
    outputText: 'latest output',
    latencyMs: 0,
    status: 'completed',
  },
]));
const appSettings = vi.hoisted(() => ({
  defaultMode: 'direct',
  personaModeEnabled: false,
  hotkey: 'CapsLock',
  mouseShortcut: '鼠标侧键 1',
  triggerMode: 'hold-to-talk',
  triggerThresholdMs: 180,
  outputMethod: 'typing',
  restoreClipboard: true,
  language: 'zh-CN',
  numericFormatting: true,
  removeTrailingPunctuation: false,
  saveAudio: true,
  saveHistory: true,
  localDataPath: 'D:/honey',
  asrModelRoot: 'D:/honey/models/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'D:/honey/models/llm',
  llamaServerPath: 'D:/honey/runtime/llama.cpp/llama-server.exe',
  startupEnabled: false,
  trayEnabled: true,
  defaultWindowMode: 'full',
  overlayEnabled: true,
  overlayPosition: 'bottom-center',
  gpuAcceleration: false,
  forcePasteApps: ['企业微信'],
  autoEnterApps: [],
  punctuationCleanupApps: [],
}));
const getSettings = vi.hoisted(() => vi.fn(async () => appSettings));
const dictationOverlay = vi.hoisted(() => vi.fn());
const useMockDictationHotkey = vi.hoisted(() => vi.fn());
const desktopShell = vi.hoisted(() => {
  let windowModeHandler: ((mode: 'full' | 'mini') => void) | undefined;
  const unlistenWindowMode = vi.fn();
  const setTrayEnabled = vi.fn(async (enabled: boolean) => ({ ok: true as const, enabled }));
  const onWindowModeChange = vi.fn(async (handler: (mode: 'full' | 'mini') => void) => {
    windowModeHandler = handler;
    return unlistenWindowMode;
  });

  return {
    emitWindowMode(mode: 'full' | 'mini') {
      windowModeHandler?.(mode);
    },
    reset() {
      windowModeHandler = undefined;
      onWindowModeChange.mockClear();
      unlistenWindowMode.mockClear();
      setTrayEnabled.mockClear();
    },
    onWindowModeChange,
    setTrayEnabled,
    unlistenWindowMode,
  };
});

vi.mock('@/api/client', () => ({
  backendClient: {
    listTranscriptRecords,
    getSettings,
  },
}));
vi.mock('@/hooks/useMockDictationHotkey', () => ({
  useMockDictationHotkey,
}));
vi.mock('@/api/desktopShell', () => ({
  desktopShellClient: {
    onWindowModeChange: desktopShell.onWindowModeChange,
    setTrayEnabled: desktopShell.setTrayEnabled,
  },
}));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/DictationOverlay', () => ({
  DictationOverlay: (props: unknown) => {
    dictationOverlay(props);
    return <div data-testid="dictation-overlay" />;
  },
}));
vi.mock('@/components/MiniWindow', () => ({
  MiniWindow: () => null,
}));
vi.mock('@/pages/HomePage', () => ({
  HomePage: () => <div>home</div>,
}));
vi.mock('@/pages/HistoryPage', () => ({
  HistoryPage: () => null,
}));
vi.mock('@/pages/HotwordsPage', () => ({
  HotwordsPage: () => null,
}));
vi.mock('@/pages/RulesPage', () => ({
  RulesPage: () => null,
}));
vi.mock('@/pages/PersonasPage', () => ({
  PersonasPage: () => null,
}));
vi.mock('@/pages/ModelsPage', () => ({
  ModelsPage: () => null,
}));
vi.mock('@/pages/FileTranscriptionPage', () => ({
  FileTranscriptionPage: () => null,
}));
vi.mock('@/pages/SettingsPage', () => ({
  SettingsPage: () => null,
}));

import App from './App';
import { useDictationUiStore } from '@/stores/dictationUiStore';

describe('App', () => {
  beforeEach(() => {
    useDictationUiStore.setState({
      windowMode: 'full',
      currentMode: 'direct',
      overlayEnabled: true,
      overlaySnapshot: { state: 'idle', mode: 'direct', volumeLevel: 0 },
    });
    listTranscriptRecords.mockClear();
    getSettings.mockClear();
    dictationOverlay.mockClear();
    useMockDictationHotkey.mockClear();
    desktopShell.reset();
  });

  it('passes the configured output method to the dictation hotkey hook', async () => {
    render(<App />);

    await waitFor(() => {
      expect(useMockDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
        outputMethod: 'typing',
        forcePasteApps: ['企业微信'],
      }));
    });
    expect(getSettings).toHaveBeenCalledOnce();
  });

  it('uses the configured keyboard hotkey for hold-to-talk', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      hotkey: 'F9',
      outputMethod: 'paste',
      forcePasteApps: [],
    });

    render(<App />);

    await waitFor(() => {
      expect(useMockDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
        hotkey: 'F9',
      }));
    });
  });

  it('passes the configured trigger mode to the dictation hotkey hook', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      triggerMode: 'click-to-toggle',
    });

    render(<App />);

    await waitFor(() => {
      expect(useMockDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
        triggerMode: 'click-to-toggle',
      }));
    });
  });

  it('passes the configured trigger threshold to the dictation hotkey hook', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      triggerThresholdMs: 320,
    });

    render(<App />);

    await waitFor(() => {
      expect(useMockDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
        triggerThresholdMs: 320,
      }));
    });
  });

  it('syncs default window mode and persona mode from settings into runtime UI state', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      defaultMode: 'persona',
      personaModeEnabled: true,
      defaultWindowMode: 'mini',
    });

    render(<App />);

    await waitFor(() => {
      expect(useDictationUiStore.getState()).toMatchObject({
        currentMode: 'persona',
        windowMode: 'mini',
      });
    });
    expect(useMockDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: false,
    }));
  });

  it('syncs desktop shell window mode events into runtime UI state', async () => {
    render(<App />);

    await waitFor(() => {
      expect(desktopShell.onWindowModeChange).toHaveBeenCalledOnce();
    });

    desktopShell.emitWindowMode('mini');

    await waitFor(() => {
      expect(useDictationUiStore.getState().windowMode).toBe('mini');
    });
    expect(useMockDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: false,
    }));
  });

  it('syncs tray preference from settings into the desktop shell', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      trayEnabled: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(desktopShell.setTrayEnabled).toHaveBeenCalledWith(false);
    });
  });

  it('hides the dictation overlay when settings disable it', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      overlayEnabled: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('dictation-overlay')).not.toBeInTheDocument();
    });
  });

  it('passes the configured overlay position to the dictation overlay', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      overlayPosition: 'bottom-right',
    });

    render(<App />);

    await waitFor(() => {
      expect(dictationOverlay).toHaveBeenLastCalledWith(expect.objectContaining({
        position: 'bottom-right',
      }));
    });
  });
});
