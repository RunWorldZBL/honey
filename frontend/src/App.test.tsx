import { act, render, screen, waitFor } from '@testing-library/react';
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
  hotkey: 'F9',
  mouseShortcut: '鼠标侧键 1',
  triggerMode: 'hold-to-talk',
  triggerThresholdMs: 0,
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
const useDictationHotkey = vi.hoisted(() => vi.fn());
const desktopShell = vi.hoisted(() => {
  let windowModeHandler: ((mode: 'full' | 'mini') => void) | undefined;
  const unlistenWindowMode = vi.fn();
  const publishDictationOverlaySnapshot = vi.fn(async () => ({ ok: true as const }));
  const setOverlayWindowVisible = vi.fn(async (visible: boolean) => ({ ok: true as const, visible }));
  const setOverlayCenterOffset = vi.fn(async (offsetX: number) => ({ ok: true as const, offsetX }));
  const setStartupEnabled = vi.fn(async (enabled: boolean) => ({ ok: true as const, enabled }));
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
      publishDictationOverlaySnapshot.mockClear();
      setOverlayWindowVisible.mockClear();
      setOverlayCenterOffset.mockClear();
      setStartupEnabled.mockClear();
      setTrayEnabled.mockClear();
    },
    onWindowModeChange,
    publishDictationOverlaySnapshot,
    setOverlayWindowVisible,
    setOverlayCenterOffset,
    setStartupEnabled,
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
vi.mock('@/hooks/useDictationHotkey', () => ({
  useDictationHotkey,
}));
vi.mock('@/api/desktopShell', () => ({
  desktopShellClient: {
    onWindowModeChange: desktopShell.onWindowModeChange,
    publishDictationOverlaySnapshot: desktopShell.publishDictationOverlaySnapshot,
    setOverlayWindowVisible: desktopShell.setOverlayWindowVisible,
    setOverlayCenterOffset: desktopShell.setOverlayCenterOffset,
    setStartupEnabled: desktopShell.setStartupEnabled,
    setTrayEnabled: desktopShell.setTrayEnabled,
  },
}));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
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
    useDictationHotkey.mockClear();
    desktopShell.reset();
  });

  it('passes the configured output method to the dictation hotkey hook', async () => {
    render(<App />);

    await waitFor(() => {
      expect(useDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
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
      expect(useDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
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
      expect(useDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
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
      expect(useDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
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
    expect(useDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: true,
    }));
  });

  it('syncs desktop shell window mode events into runtime UI state', async () => {
    render(<App />);

    await waitFor(() => {
      expect(desktopShell.onWindowModeChange).toHaveBeenCalledOnce();
    });

    act(() => {
      desktopShell.emitWindowMode('mini');
    });

    await waitFor(() => {
      expect(useDictationUiStore.getState().windowMode).toBe('mini');
    });
    expect(useDictationHotkey).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: true,
    }));
  });

  it('keeps the desktop dictation overlay visible in mini window mode', async () => {
    useDictationUiStore.setState({
      overlaySnapshot: {
        state: 'listening',
        mode: 'direct',
        volumeLevel: 0.6,
      },
    });
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      defaultWindowMode: 'mini',
    });

    render(<App />);

    await waitFor(() => {
      expect(useDictationUiStore.getState().windowMode).toBe('mini');
    });
    expect(desktopShell.publishDictationOverlaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      state: 'listening',
      mode: 'direct',
      volumeLevel: 0.6,
    }));
    expect(desktopShell.setOverlayWindowVisible).toHaveBeenCalledWith(true, 'bottom-center');
  });

  it('publishes overlay snapshot changes to the desktop overlay window', async () => {
    render(<App />);

    act(() => {
      useDictationUiStore.getState().setOverlaySnapshot({
        state: 'listening',
        mode: 'direct',
        volumeLevel: 0.34,
      });
    });

    await waitFor(() => {
      expect(desktopShell.publishDictationOverlaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
        state: 'listening',
        volumeLevel: 0.34,
      }));
    });
    expect(desktopShell.setOverlayWindowVisible).toHaveBeenCalledWith(true, 'bottom-center');
  });

  it('keeps the desktop overlay visible while recognizing and showing the result', async () => {
    useDictationUiStore.setState({
      overlaySnapshot: {
        state: 'recognizing',
        mode: 'direct',
        volumeLevel: 0,
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(desktopShell.setOverlayWindowVisible).toHaveBeenCalledWith(true, 'bottom-center');
    });

    act(() => {
      useDictationUiStore.getState().setOverlaySnapshot({
        state: 'completed',
        mode: 'direct',
        volumeLevel: 0,
        previewText: '今天下午把会议纪要发给大家。',
      });
    });

    await waitFor(() => {
      expect(desktopShell.setOverlayWindowVisible).toHaveBeenCalledWith(true, 'bottom-center');
    });
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

  it('syncs startup preference from settings into the desktop shell', async () => {
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      startupEnabled: true,
    });

    render(<App />);

    await waitFor(() => {
      expect(desktopShell.setStartupEnabled).toHaveBeenCalledWith(true);
    });
  });

  it('hides the dictation overlay when settings disable it', async () => {
    useDictationUiStore.setState({
      overlaySnapshot: {
        state: 'listening',
        mode: 'direct',
        volumeLevel: 0.6,
      },
    });
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      overlayEnabled: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(desktopShell.setOverlayWindowVisible).toHaveBeenCalledWith(false, 'bottom-center');
    });
  });

  it('passes the configured overlay position to the desktop overlay window', async () => {
    useDictationUiStore.setState({
      overlaySnapshot: {
        state: 'listening',
        mode: 'direct',
        volumeLevel: 0.6,
      },
    });
    getSettings.mockResolvedValueOnce({
      ...appSettings,
      overlayPosition: 'bottom-right',
    });

    render(<App />);

    await waitFor(() => {
      expect(desktopShell.setOverlayWindowVisible).toHaveBeenCalledWith(true, 'bottom-right');
    });
  });
});
