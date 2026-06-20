import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HoldToTalkCaptureResult, HoldToTalkHotkeyEvent } from '@/api/desktopShell';

import { useDictationUiStore } from '@/stores/dictationUiStore';

const runDirectDictationSession = vi.hoisted(() => vi.fn(async () => ({
  overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
  record: {
    id: 'rec-hook-direct',
    createdAt: '2026-06-20T00:00:00.000Z',
    sourceApp: 'Mock 输入框',
    mode: 'direct',
    rawText: '后端会话返回的文字',
    outputText: '后端会话返回的文字',
    audioPath: 'mock://hold-to-talk.wav',
    durationMs: 1200,
    latencyMs: 0,
    status: 'completed',
  },
})));
const runPersonaDictationSession = vi.hoisted(() => vi.fn(async () => ({
  overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
  record: {
    id: 'rec-hook-persona',
    createdAt: '2026-06-20T00:00:00.000Z',
    sourceApp: 'Mock 输入框',
    mode: 'persona',
    roleId: 'persona-office',
    rawText: '怎么今天加班啊？',
    outputText: '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
    audioPath: 'mock://hold-to-talk.wav',
    durationMs: 1200,
    latencyMs: 480,
    status: 'completed',
  },
})));
const saveAudioCapture = vi.hoisted(() => vi.fn(async (input: {
  fileName?: string;
  mimeType: string;
  base64Data: string;
  durationMs?: number;
}) => ({
  audioPath: 'D:/honey/audio-captures/uploaded.wav',
  byteLength: 12,
  mimeType: input.mimeType,
  durationMs: input.durationMs,
})));
const startHoldToTalkCapture = vi.hoisted(() => vi.fn(async ({ hotkey }: {
  hotkey: string;
  onVolumeLevel?: (volumeLevel: number) => void;
}) => ({
  ok: true as const,
  state: 'listening' as const,
  hotkey,
  audioPath: 'mock://desktop-start.wav',
})));
const finishHoldToTalkCapture = vi.hoisted(() => vi.fn<() => Promise<HoldToTalkCaptureResult>>(async () => ({
  ok: true as const,
  state: 'captured' as const,
  hotkey: 'CapsLock',
  audioPath: 'mock://desktop-captured.wav',
})));
const cancelHoldToTalkCapture = vi.hoisted(() => vi.fn(async () => ({
  ok: true as const,
  state: 'cancelled' as const,
  hotkey: 'CapsLock',
})));
const insertText = vi.hoisted(() => vi.fn(async ({ text, method }: {
  text: string;
  method: 'paste' | 'typing';
  restoreClipboard?: boolean;
}) => ({
  ok: true as const,
  status: 'preview' as const,
  method,
  text,
})));
const hotkeyEventHarness = vi.hoisted(() => {
  const unlisten = vi.fn();

  return {
    unlisten,
    listener: undefined as undefined | ((event: HoldToTalkHotkeyEvent) => void),
    registerHoldToTalkHotkey: vi.fn(async ({ hotkey }: { hotkey: string }) => ({
      ok: true as const,
      hotkey,
      event: 'honey://hold-to-talk-hotkey',
    })),
    unregisterHoldToTalkHotkey: vi.fn(async () => ({
      ok: true as const,
      hotkey: 'CapsLock',
    })),
    onHoldToTalkHotkey: vi.fn(async (handler: (event: HoldToTalkHotkeyEvent) => void) => {
      hotkeyEventHarness.listener = handler;
      return unlisten;
    }),
  };
});

vi.mock('@/api/client', () => ({
  backendClient: {
    saveAudioCapture,
    runDirectDictationSession,
    runPersonaDictationSession,
  },
}));
vi.mock('@/api/desktopShell', () => ({
  desktopShellClient: {
    startHoldToTalkCapture,
    finishHoldToTalkCapture,
    cancelHoldToTalkCapture,
    insertText,
    registerHoldToTalkHotkey: hotkeyEventHarness.registerHoldToTalkHotkey,
    unregisterHoldToTalkHotkey: hotkeyEventHarness.unregisterHoldToTalkHotkey,
    onHoldToTalkHotkey: hotkeyEventHarness.onHoldToTalkHotkey,
  },
}));

import { useMockDictationHotkey } from './useMockDictationHotkey';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

const createSessionResult = (id: string, outputText: string) => ({
  overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
  record: {
    id,
    createdAt: '2026-06-20T00:00:00.000Z',
    sourceApp: 'Mock 输入框',
    mode: 'direct',
    rawText: outputText,
    outputText,
    audioPath: 'mock://hold-to-talk.wav',
    durationMs: 1200,
    latencyMs: 0,
    status: 'completed',
  },
});

const flushAsyncWork = async () => {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
};

describe('useMockDictationHotkey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDictationUiStore.setState({
      currentMode: 'direct',
      overlaySnapshot: { state: 'idle', mode: 'direct', volumeLevel: 0 },
    });
    runDirectDictationSession.mockReset();
    runPersonaDictationSession.mockReset();
    saveAudioCapture.mockReset();
    startHoldToTalkCapture.mockReset();
    finishHoldToTalkCapture.mockReset();
    cancelHoldToTalkCapture.mockReset();
    insertText.mockReset();
    hotkeyEventHarness.unlisten.mockReset();
    hotkeyEventHarness.listener = undefined;
    hotkeyEventHarness.registerHoldToTalkHotkey.mockReset();
    hotkeyEventHarness.unregisterHoldToTalkHotkey.mockReset();
    hotkeyEventHarness.onHoldToTalkHotkey.mockReset();

    runDirectDictationSession.mockImplementation(async () => createSessionResult('rec-hook-direct', '后端会话返回的文字'));
    runPersonaDictationSession.mockImplementation(async () => ({
      overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
      record: {
        id: 'rec-hook-persona',
        createdAt: '2026-06-20T00:00:00.000Z',
        sourceApp: 'Mock 输入框',
        mode: 'persona',
        roleId: 'persona-office',
        rawText: '怎么今天加班啊？',
        outputText: '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
        audioPath: 'mock://hold-to-talk.wav',
        durationMs: 1200,
        latencyMs: 480,
        status: 'completed',
      },
    }));
    saveAudioCapture.mockImplementation(async (input: {
      fileName?: string;
      mimeType: string;
      base64Data: string;
      durationMs?: number;
    }) => ({
      audioPath: 'D:/honey/audio-captures/uploaded.wav',
      byteLength: 12,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
    }));
    startHoldToTalkCapture.mockImplementation(async ({ hotkey }: {
      hotkey: string;
      onVolumeLevel?: (volumeLevel: number) => void;
    }) => ({
      ok: true,
      state: 'listening',
      hotkey,
      audioPath: 'mock://desktop-start.wav',
    }));
    finishHoldToTalkCapture.mockImplementation(async () => ({
      ok: true,
      state: 'captured',
      hotkey: 'CapsLock',
      audioPath: 'mock://desktop-captured.wav',
    }));
    cancelHoldToTalkCapture.mockImplementation(async () => ({
      ok: true,
      state: 'cancelled',
      hotkey: 'CapsLock',
    }));
    insertText.mockImplementation(async ({ text, method }: {
      text: string;
      method: 'paste' | 'typing';
      restoreClipboard?: boolean;
    }) => ({
      ok: true,
      status: 'preview',
      method,
      text,
    }));
    hotkeyEventHarness.registerHoldToTalkHotkey.mockImplementation(async ({ hotkey }: { hotkey: string }) => ({
      ok: true,
      hotkey,
      event: 'honey://hold-to-talk-hotkey',
    }));
    hotkeyEventHarness.unregisterHoldToTalkHotkey.mockImplementation(async () => ({
      ok: true,
      hotkey: 'CapsLock',
    }));
    hotkeyEventHarness.onHoldToTalkHotkey.mockImplementation(async (handler: (event: HoldToTalkHotkeyEvent) => void) => {
      hotkeyEventHarness.listener = handler;
      return hotkeyEventHarness.unlisten;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a backend direct dictation session from CapsLock release', async () => {
    const onSessionCompleted = vi.fn();
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      latestText: '旧的历史文本不应该覆盖后端结果。',
      onSessionCompleted,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'listening',
      volumeLevel: 0,
    });
    expect(startHoldToTalkCapture).toHaveBeenCalledWith(expect.objectContaining({
      hotkey: 'CapsLock',
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    expect(useDictationUiStore.getState().overlaySnapshot.state).toBe('recognizing');
    await flushAsyncWork();
    expect(finishHoldToTalkCapture).toHaveBeenCalledOnce();
    expect(runDirectDictationSession).toHaveBeenCalledWith({
      audioPath: 'mock://desktop-captured.wav',
      sourceApp: 'Mock 输入框',
    });

    await act(async () => {
      vi.advanceTimersByTime(520);
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'completed',
      previewText: '后端会话返回的文字',
    });
    expect(insertText).toHaveBeenCalledWith({
      text: '后端会话返回的文字',
      method: 'paste',
      restoreClipboard: true,
    });
    expect(onSessionCompleted).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rec-hook-direct',
      outputText: '后端会话返回的文字',
    }));

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(useDictationUiStore.getState().overlaySnapshot.state).toBe('inserted');

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(useDictationUiStore.getState().overlaySnapshot.state).toBe('idle');
  });

  it('toggles listening with repeated key presses in click-to-toggle mode', async () => {
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      triggerMode: 'click-to-toggle',
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'listening',
      volumeLevel: 0,
    });
    expect(startHoldToTalkCapture).toHaveBeenCalledOnce();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    expect(finishHoldToTalkCapture).not.toHaveBeenCalled();
    expect(useDictationUiStore.getState().overlaySnapshot.state).toBe('listening');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
    });

    expect(useDictationUiStore.getState().overlaySnapshot.state).toBe('recognizing');
    await flushAsyncWork();
    expect(finishHoldToTalkCapture).toHaveBeenCalledOnce();
    expect(runDirectDictationSession).toHaveBeenCalledWith({
      audioPath: 'mock://desktop-captured.wav',
      sourceApp: 'Mock 输入框',
    });
  });

  it('cancels hold-to-talk when the key is released before the trigger threshold', async () => {
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      triggerThresholdMs: 240,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
    });

    expect(useDictationUiStore.getState().overlaySnapshot.state).toBe('listening');

    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(cancelHoldToTalkCapture).toHaveBeenCalledOnce();
    expect(finishHoldToTalkCapture).not.toHaveBeenCalled();
    expect(runDirectDictationSession).not.toHaveBeenCalled();
    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'idle',
      volumeLevel: 0,
    });
  });

  it('runs a backend direct dictation session from Tauri global hotkey release', async () => {
    const onSessionCompleted = vi.fn();
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      onSessionCompleted,
    }));
    await flushAsyncWork();

    expect(hotkeyEventHarness.registerHoldToTalkHotkey).toHaveBeenCalledWith({
      hotkey: 'CapsLock',
    });
    expect(hotkeyEventHarness.onHoldToTalkHotkey).toHaveBeenCalledOnce();

    act(() => {
      hotkeyEventHarness.listener?.({ hotkey: 'CapsLock', state: 'pressed' });
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'listening',
      volumeLevel: 0,
    });
    expect(startHoldToTalkCapture).toHaveBeenCalledWith(expect.objectContaining({
      hotkey: 'CapsLock',
    }));

    act(() => {
      hotkeyEventHarness.listener?.({ hotkey: 'CapsLock', state: 'released' });
    });

    await flushAsyncWork();

    expect(finishHoldToTalkCapture).toHaveBeenCalledOnce();
    expect(runDirectDictationSession).toHaveBeenCalledWith({
      audioPath: 'mock://desktop-captured.wav',
      sourceApp: 'Mock 输入框',
    });

    await act(async () => {
      vi.advanceTimersByTime(520);
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'completed',
      previewText: '后端会话返回的文字',
    });
    expect(onSessionCompleted).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rec-hook-direct',
    }));
  });

  it('uploads captured audio bytes before running direct dictation', async () => {
    finishHoldToTalkCapture.mockResolvedValueOnce({
      ok: true,
      state: 'captured',
      hotkey: 'CapsLock',
      audioCapture: {
        fileName: 'hold-to-talk.webm',
        mimeType: 'audio/webm',
        base64Data: 'aG9uZXktYXVkaW8=',
        durationMs: 900,
      },
    });

    renderHook(() => useMockDictationHotkey({
      enabled: true,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(saveAudioCapture).toHaveBeenCalledWith({
      fileName: 'hold-to-talk.webm',
      mimeType: 'audio/webm',
      base64Data: 'aG9uZXktYXVkaW8=',
      durationMs: 900,
    });
    expect(runDirectDictationSession).toHaveBeenCalledWith({
      audioPath: 'D:/honey/audio-captures/uploaded.wav',
      sourceApp: 'Mock 输入框',
    });
  });

  it('ignores repeated keydown events while the key is held', () => {
    renderHook(() => useMockDictationHotkey({ enabled: true }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock', repeat: true }));
    });

    expect(useDictationUiStore.getState().overlaySnapshot.state).toBe('listening');
  });

  it('updates the listening overlay from captured microphone volume levels', () => {
    renderHook(() => useMockDictationHotkey({ enabled: true }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
    });

    const onVolumeLevel = startHoldToTalkCapture.mock.calls[0]?.[0].onVolumeLevel;
    expect(onVolumeLevel).toEqual(expect.any(Function));

    act(() => {
      onVolumeLevel?.(0.31);
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'listening',
      volumeLevel: 0.31,
    });

    act(() => {
      onVolumeLevel?.(0);
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'listening',
      volumeLevel: 0,
    });
  });

  it('uses the configured output method when inserting text', async () => {
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      outputMethod: 'typing',
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(insertText).toHaveBeenCalledWith({
      text: '后端会话返回的文字',
      method: 'typing',
      restoreClipboard: true,
    });
  });

  it('passes the clipboard restore setting to desktop text insertion', async () => {
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      restoreClipboard: false,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(insertText).toHaveBeenCalledWith({
      text: '后端会话返回的文字',
      method: 'paste',
      restoreClipboard: false,
    });
  });

  it('forces paste insertion for configured source apps', async () => {
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      outputMethod: 'typing',
      forcePasteApps: ['Mock 输入框'],
      sourceApp: 'Mock 输入框',
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(insertText).toHaveBeenCalledWith({
      text: '后端会话返回的文字',
      method: 'paste',
      restoreClipboard: true,
    });
  });

  it('runs a backend persona dictation session when the current mode is persona', async () => {
    useDictationUiStore.setState({
      currentMode: 'persona',
      overlaySnapshot: { state: 'idle', mode: 'persona', volumeLevel: 0 },
    });
    const onSessionCompleted = vi.fn();
    renderHook(() => useMockDictationHotkey({
      enabled: true,
      personaId: 'persona-office',
      onSessionCompleted,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(runPersonaDictationSession).toHaveBeenCalledWith({
      audioPath: 'mock://desktop-captured.wav',
      sourceApp: 'Mock 输入框',
      personaId: 'persona-office',
    });
    expect(runDirectDictationSession).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(520);
    });

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'completed',
      mode: 'persona',
      previewText: '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
    });
    expect(insertText).toHaveBeenCalledWith({
      text: '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
      method: 'paste',
      restoreClipboard: true,
    });
    expect(onSessionCompleted).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rec-hook-persona',
      mode: 'persona',
    }));
  });

  it('uses the selected persona from dictation state when no persona id option is provided', async () => {
    useDictationUiStore.setState({
      currentMode: 'persona',
      overlaySnapshot: { state: 'idle', mode: 'persona', volumeLevel: 0 },
      selectedPersonaId: 'persona-mail',
    } as Parameters<typeof useDictationUiStore.setState>[0]);

    renderHook(() => useMockDictationHotkey({
      enabled: true,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(runPersonaDictationSession).toHaveBeenCalledWith(expect.objectContaining({
      personaId: 'persona-mail',
    }));
  });

  it('ignores stale direct session results after a new key press starts', async () => {
    const firstFinish = createDeferred<Awaited<ReturnType<typeof finishHoldToTalkCapture>>>();
    const onSessionCompleted = vi.fn();
    finishHoldToTalkCapture
      .mockReturnValueOnce(firstFinish.promise)
      .mockResolvedValueOnce({
        ok: true,
        state: 'captured',
        hotkey: 'CapsLock',
        audioPath: 'mock://second-capture.wav',
      });
    runDirectDictationSession.mockResolvedValueOnce(createSessionResult('rec-second', '第二次语音结果'));

    renderHook(() => useMockDictationHotkey({
      enabled: true,
      onSessionCompleted,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });
    await flushAsyncWork();
    expect(finishHoldToTalkCapture).toHaveBeenCalledOnce();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    await act(async () => {
      vi.advanceTimersByTime(520);
    });
    await flushAsyncWork();

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'completed',
      previewText: '第二次语音结果',
    });
    expect(onSessionCompleted).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rec-second',
    }));
    expect(runDirectDictationSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstFinish.resolve({
        ok: true,
        state: 'captured',
        hotkey: 'CapsLock',
        audioPath: 'mock://first-capture.wav',
      });
    });

    expect(runDirectDictationSession).toHaveBeenCalledTimes(1);
    expect(onSessionCompleted).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'rec-first',
    }));
    expect(useDictationUiStore.getState().overlaySnapshot.previewText).toBe('第二次语音结果');
  });

  it('shows a failed overlay when the backend direct session rejects', async () => {
    const onSessionCompleted = vi.fn();
    runDirectDictationSession.mockRejectedValueOnce(new Error('backend offline'));

    renderHook(() => useMockDictationHotkey({
      enabled: true,
      onSessionCompleted,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'failed',
      errorMessage: '直接转写失败',
    });
    expect(onSessionCompleted).not.toHaveBeenCalled();
  });

  it('shows a failed overlay when the backend returns a failed direct session record', async () => {
    const onSessionCompleted = vi.fn();
    runDirectDictationSession.mockResolvedValueOnce({
      overlayStates: ['listening', 'recognizing', 'failed'],
      record: {
        id: 'rec-failed',
        createdAt: '2026-06-20T00:00:00.000Z',
        sourceApp: 'Mock 输入框',
        mode: 'direct',
        rawText: '',
        outputText: '',
        audioPath: 'mock://desktop-captured.wav',
        durationMs: 1200,
        latencyMs: 0,
        status: 'failed',
      },
    });

    renderHook(() => useMockDictationHotkey({
      enabled: true,
      latestText: '旧结果不能上屏',
      onSessionCompleted,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await flushAsyncWork();

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'failed',
      errorMessage: '直接转写失败',
    });
    expect(insertText).not.toHaveBeenCalled();
    expect(onSessionCompleted).not.toHaveBeenCalled();
  });

  it('does not finish capture or run dictation when desktop capture fails to start', async () => {
    startHoldToTalkCapture.mockRejectedValueOnce(new Error('capture start failed'));

    renderHook(() => useMockDictationHotkey({
      enabled: true,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
    });

    await act(async () => {});

    expect(useDictationUiStore.getState().overlaySnapshot).toMatchObject({
      state: 'failed',
      errorMessage: '听写录音启动失败',
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    expect(finishHoldToTalkCapture).not.toHaveBeenCalled();
    expect(runDirectDictationSession).not.toHaveBeenCalled();
  });

  it('waits for desktop capture start before finishing and running dictation', async () => {
    const startCapture = createDeferred<Awaited<ReturnType<typeof startHoldToTalkCapture>>>();
    startHoldToTalkCapture.mockReturnValueOnce(startCapture.promise);

    renderHook(() => useMockDictationHotkey({
      enabled: true,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock' }));
    });

    await act(async () => {});

    expect(finishHoldToTalkCapture).not.toHaveBeenCalled();
    expect(runDirectDictationSession).not.toHaveBeenCalled();

    await act(async () => {
      startCapture.resolve({
        ok: true,
        state: 'listening',
        hotkey: 'CapsLock',
        audioPath: 'mock://desktop-start.wav',
      });
    });

    expect(finishHoldToTalkCapture).toHaveBeenCalledOnce();
    await flushAsyncWork();
    expect(runDirectDictationSession).toHaveBeenCalledOnce();
  });
});
