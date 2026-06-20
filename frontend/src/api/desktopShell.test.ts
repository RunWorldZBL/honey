import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopShellClient } from './desktopShell';

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: (command: string, args?: unknown) => Promise<unknown>;
      };
      event?: {
        listen?: (
          event: string,
          handler: (event: { payload?: unknown }) => void,
        ) => Promise<() => void>;
      };
    };
  }
}

describe('desktopShell', () => {
  afterEach(() => {
    delete window.__TAURI__;
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
  });

  it('falls back to inert desktop capabilities outside Tauri', async () => {
    const client = createDesktopShellClient();

    await expect(client.getCapabilities()).resolves.toEqual({
      backendTransport: 'http',
      backendBaseUrl: 'http://127.0.0.1:33577',
      canManageWindow: false,
      canUseTray: false,
      canRegisterGlobalHotkey: false,
      canInsertText: false,
      canPreviewHoldToTalk: true,
      canManageBackend: false,
    });
    await expect(client.getBackendProcessStatus()).resolves.toEqual({
      ok: true,
      status: 'stopped',
      baseUrl: 'http://127.0.0.1:33577',
      managed: false,
    });
    await expect(client.startBackendProcess()).resolves.toEqual({
      ok: true,
      status: 'stopped',
      baseUrl: 'http://127.0.0.1:33577',
      managed: false,
    });
    await expect(client.getWindowMode()).resolves.toBe('full');
    await expect(client.setWindowMode('mini')).resolves.toEqual({
      ok: true,
      mode: 'mini',
    });
    await expect(client.setTrayEnabled(true)).resolves.toEqual({
      ok: true,
      enabled: true,
    });
    await expect(client.startHoldToTalkCapture({ hotkey: 'CapsLock' })).resolves.toMatchObject({
      ok: true,
      state: 'listening',
      hotkey: 'CapsLock',
    });
    await expect(client.finishHoldToTalkCapture()).resolves.toMatchObject({
      ok: true,
      state: 'captured',
      audioPath: 'mock://hold-to-talk.wav',
    });
    await expect(client.cancelHoldToTalkCapture()).resolves.toMatchObject({
      ok: true,
      state: 'cancelled',
    });
    await expect(client.insertText({
      text: '今天下午把会议纪要发给大家。',
      method: 'paste',
    })).resolves.toEqual({
      ok: true,
      status: 'preview',
      method: 'paste',
      text: '今天下午把会议纪要发给大家。',
      restoreClipboard: true,
    });
  });

  it('records browser microphone audio as uploadable capture data outside Tauri', async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }],
    }));

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported = vi.fn(() => true);

      readonly mimeType = 'audio/webm';
      state: 'inactive' | 'recording' = 'inactive';

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.dispatchEvent(Object.assign(new Event('dataavailable'), {
          data: new Blob(['honey-audio'], { type: 'audio/webm' }),
        }));
        this.dispatchEvent(new Event('stop'));
      }
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    const client = createDesktopShellClient();

    await expect(client.startHoldToTalkCapture({ hotkey: 'CapsLock' })).resolves.toMatchObject({
      state: 'listening',
      hotkey: 'CapsLock',
    });
    const capture = await client.finishHoldToTalkCapture();
    expect(capture).toMatchObject({
      state: 'captured',
      audioCapture: {
        fileName: 'hold-to-talk.webm',
        mimeType: 'audio/webm',
        base64Data: 'aG9uZXktYXVkaW8=',
        durationMs: expect.any(Number),
      },
    });
    expect(capture.audioPath).toBeUndefined();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('reports browser microphone volume levels while recording', async () => {
    let animationFrame: FrameRequestCallback | undefined;
    const stopTrack = vi.fn();
    const closeAudioContext = vi.fn(async () => undefined);
    const connectSource = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }],
    }));

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported = vi.fn(() => true);

      readonly mimeType = 'audio/webm';
      state: 'inactive' | 'recording' = 'inactive';

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.dispatchEvent(Object.assign(new Event('dataavailable'), {
          data: new Blob(['honey-audio'], { type: 'audio/webm' }),
        }));
        this.dispatchEvent(new Event('stop'));
      }
    }

    class FakeAudioContext {
      createMediaStreamSource() {
        return { connect: connectSource };
      }

      createAnalyser() {
        return {
          fftSize: 256,
          frequencyBinCount: 128,
          getByteTimeDomainData: (data: Uint8Array) => data.fill(255),
        };
      }

      close = closeAudioContext;
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 42;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const onVolumeLevel = vi.fn();
    const client = createDesktopShellClient();

    await client.startHoldToTalkCapture({ hotkey: 'CapsLock', onVolumeLevel });
    animationFrame?.(16);

    expect(connectSource).toHaveBeenCalledOnce();
    expect(onVolumeLevel).toHaveBeenCalledWith(expect.any(Number));
    expect(onVolumeLevel.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.5);

    await client.finishHoldToTalkCapture();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(closeAudioContext).toHaveBeenCalledOnce();
  });

  it('uses Tauri only for desktop shell capabilities, window mode, and hold-to-talk capture state', async () => {
    const captureAudioPath = 'C:\\Users\\benlin\\AppData\\Local\\Temp\\honey\\hold-to-talk.wav';
    const invoke = vi.fn(async (command: string, args?: unknown) => {
      if (command === 'honey_desktop_capabilities') {
        return {
          backendTransport: 'http',
          backendBaseUrl: 'http://127.0.0.1:33577',
          canManageWindow: true,
          canUseTray: true,
          canRegisterGlobalHotkey: false,
          canInsertText: false,
          canPreviewHoldToTalk: true,
          canManageBackend: true,
        };
      }

      if (command === 'honey_get_backend_process_status') {
        return {
          ok: true,
          status: 'stopped',
          baseUrl: 'http://127.0.0.1:33577',
          managed: true,
        };
      }

      if (command === 'honey_start_backend_process') {
        return {
          ok: true,
          status: 'running',
          baseUrl: 'http://127.0.0.1:33577',
          pid: 1234,
          managed: true,
        };
      }

      if (command === 'honey_stop_backend_process') {
        return {
          ok: true,
          status: 'stopped',
          baseUrl: 'http://127.0.0.1:33577',
          managed: true,
        };
      }

      if (command === 'honey_get_desktop_window_mode') {
        return { mode: 'full' };
      }

      if (command === 'honey_set_desktop_window_mode') {
        return { ok: true, mode: (args as { mode: string }).mode };
      }

      if (command === 'honey_set_tray_enabled') {
        return { ok: true, enabled: (args as { enabled: boolean }).enabled };
      }

      if (command === 'honey_start_hold_to_talk_capture') {
        return {
          ok: true,
          state: 'listening',
          hotkey: (args as { hotkey: string }).hotkey,
          audioPath: captureAudioPath,
        };
      }

      if (command === 'honey_finish_hold_to_talk_capture') {
        return {
          ok: true,
          state: 'captured',
          hotkey: 'CapsLock',
          audioPath: captureAudioPath,
        };
      }

      if (command === 'honey_cancel_hold_to_talk_capture') {
        return {
          ok: true,
          state: 'cancelled',
          hotkey: 'CapsLock',
          audioPath: undefined,
        };
      }

      if (command === 'honey_insert_text') {
        const insertion = args as { text: string; method: string; restoreClipboard: boolean };
        return {
          ok: true,
          status: 'inserted',
          method: insertion.method,
          text: insertion.text,
          restoreClipboard: insertion.restoreClipboard,
        };
      }

      throw new Error(`unexpected command ${command}`);
    });

    window.__TAURI__ = { core: { invoke } };
    const client = createDesktopShellClient();

    await expect(client.getCapabilities()).resolves.toMatchObject({
      canManageWindow: true,
      canUseTray: true,
      canManageBackend: true,
    });
    await expect(client.getBackendProcessStatus()).resolves.toEqual({
      ok: true,
      status: 'stopped',
      baseUrl: 'http://127.0.0.1:33577',
      managed: true,
    });
    await expect(client.startBackendProcess()).resolves.toEqual({
      ok: true,
      status: 'running',
      baseUrl: 'http://127.0.0.1:33577',
      pid: 1234,
      managed: true,
    });
    await expect(client.stopBackendProcess()).resolves.toEqual({
      ok: true,
      status: 'stopped',
      baseUrl: 'http://127.0.0.1:33577',
      managed: true,
    });
    await expect(client.getWindowMode()).resolves.toBe('full');
    await expect(client.setWindowMode('mini')).resolves.toEqual({
      ok: true,
      mode: 'mini',
    });
    await expect(client.setTrayEnabled(false)).resolves.toEqual({
      ok: true,
      enabled: false,
    });
    await expect(client.startHoldToTalkCapture({ hotkey: 'CapsLock', onVolumeLevel: vi.fn() })).resolves.toMatchObject({
      state: 'listening',
      audioPath: captureAudioPath,
    });
    await expect(client.finishHoldToTalkCapture()).resolves.toMatchObject({
      state: 'captured',
      audioPath: captureAudioPath,
    });
    await expect(client.cancelHoldToTalkCapture()).resolves.toMatchObject({
      state: 'cancelled',
    });
    await expect(client.insertText({
      text: 'Tauri 转写结果',
      method: 'typing',
    })).resolves.toEqual({
      ok: true,
      status: 'inserted',
      method: 'typing',
      text: 'Tauri 转写结果',
      restoreClipboard: true,
    });

    expect(invoke).toHaveBeenCalledWith('honey_desktop_capabilities');
    expect(invoke).toHaveBeenCalledWith('honey_get_backend_process_status');
    expect(invoke).toHaveBeenCalledWith('honey_start_backend_process');
    expect(invoke).toHaveBeenCalledWith('honey_stop_backend_process');
    expect(invoke).toHaveBeenCalledWith('honey_get_desktop_window_mode');
    expect(invoke).toHaveBeenCalledWith('honey_set_desktop_window_mode', { mode: 'mini' });
    expect(invoke).toHaveBeenCalledWith('honey_set_tray_enabled', { enabled: false });
    expect(invoke).toHaveBeenCalledWith('honey_start_hold_to_talk_capture', { hotkey: 'CapsLock' });
    expect(invoke).toHaveBeenCalledWith('honey_finish_hold_to_talk_capture');
    expect(invoke).toHaveBeenCalledWith('honey_cancel_hold_to_talk_capture');
    expect(invoke).toHaveBeenCalledWith('honey_insert_text', {
      text: 'Tauri 转写结果',
      method: 'typing',
      restoreClipboard: true,
    });
    expect(invoke).not.toHaveBeenCalledWith('honey_get_settings');
  });

  it('does not use browser microphone capture when Tauri native capture is available', async () => {
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    }));
    const invoke = vi.fn(async (command: string, args?: unknown) => {
      if (command === 'honey_start_hold_to_talk_capture') {
        return {
          ok: true,
          state: 'listening',
          hotkey: (args as { hotkey: string }).hotkey,
          audioPath: 'C:\\Users\\benlin\\AppData\\Local\\Temp\\honey\\captures\\hold-to-talk.wav',
        };
      }

      if (command === 'honey_finish_hold_to_talk_capture') {
        return {
          ok: true,
          state: 'captured',
          hotkey: 'CapsLock',
          audioPath: 'C:\\Users\\benlin\\AppData\\Local\\Temp\\honey\\captures\\hold-to-talk.wav',
        };
      }

      throw new Error(`unexpected command ${command}`);
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', class FakeMediaRecorder extends EventTarget {
      static isTypeSupported = vi.fn(() => true);
      readonly mimeType = 'audio/webm';
      state: 'inactive' | 'recording' = 'inactive';

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.dispatchEvent(new Event('stop'));
      }
    });
    window.__TAURI__ = { core: { invoke } };
    const client = createDesktopShellClient();

    await client.startHoldToTalkCapture({ hotkey: 'CapsLock', onVolumeLevel: vi.fn() });
    await client.finishHoldToTalkCapture();

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('honey_start_hold_to_talk_capture', { hotkey: 'CapsLock' });
    expect(invoke).toHaveBeenCalledWith('honey_finish_hold_to_talk_capture');
  });

  it('subscribes to Tauri native capture volume events while recording', async () => {
    let volumeHandler: ((event: { payload?: unknown }) => void) | undefined;
    const unlisten = vi.fn();
    const invoke = vi.fn(async (command: string, args?: unknown) => {
      if (command === 'honey_start_hold_to_talk_capture') {
        return {
          ok: true,
          state: 'listening',
          hotkey: (args as { hotkey: string }).hotkey,
          audioPath: 'C:\\Users\\benlin\\AppData\\Local\\Temp\\honey\\captures\\hold-to-talk.wav',
        };
      }

      if (command === 'honey_finish_hold_to_talk_capture') {
        return {
          ok: true,
          state: 'captured',
          hotkey: 'CapsLock',
          audioPath: 'C:\\Users\\benlin\\AppData\\Local\\Temp\\honey\\captures\\hold-to-talk.wav',
        };
      }

      throw new Error(`unexpected command ${command}`);
    });
    const listen = vi.fn(async (event: string, handler: (event: { payload?: unknown }) => void) => {
      volumeHandler = handler;
      expect(event).toBe('honey://hold-to-talk-volume');
      return unlisten;
    });

    window.__TAURI__ = {
      core: { invoke },
      event: { listen },
    };
    const client = createDesktopShellClient();
    const onVolumeLevel = vi.fn();

    await client.startHoldToTalkCapture({ hotkey: 'CapsLock', onVolumeLevel });
    volumeHandler?.({ payload: { volumeLevel: 0.42 } });
    volumeHandler?.({ payload: { volumeLevel: 2 } });
    volumeHandler?.({ payload: { volumeLevel: -1 } });
    volumeHandler?.({ payload: { volumeLevel: 'loud' } });
    await client.finishHoldToTalkCapture();

    expect(listen).toHaveBeenCalledOnce();
    expect(onVolumeLevel).toHaveBeenNthCalledWith(1, 0.42);
    expect(onVolumeLevel).toHaveBeenNthCalledWith(2, 1);
    expect(onVolumeLevel).toHaveBeenNthCalledWith(3, 0);
    expect(onVolumeLevel).toHaveBeenCalledTimes(3);
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('registers Tauri global hold-to-talk hotkeys and listens for pressed state changes', async () => {
    let hotkeyHandler: ((event: { payload?: unknown }) => void) | undefined;
    const unlisten = vi.fn();
    const invoke = vi.fn(async (command: string, args?: unknown) => {
      if (command === 'honey_register_hold_to_talk_hotkey') {
        return {
          ok: true,
          hotkey: (args as { hotkey: string }).hotkey,
          event: 'honey://hold-to-talk-hotkey',
        };
      }

      if (command === 'honey_unregister_hold_to_talk_hotkey') {
        return {
          ok: true,
          hotkey: 'CapsLock',
        };
      }

      throw new Error(`unexpected command ${command}`);
    });
    const listen = vi.fn(async (event: string, handler: (event: { payload?: unknown }) => void) => {
      hotkeyHandler = handler;
      expect(event).toBe('honey://hold-to-talk-hotkey');
      return unlisten;
    });

    window.__TAURI__ = {
      core: { invoke },
      event: { listen },
    };
    const client = createDesktopShellClient();
    const onHotkey = vi.fn();

    await expect(client.registerHoldToTalkHotkey({ hotkey: 'CapsLock' })).resolves.toEqual({
      ok: true,
      hotkey: 'CapsLock',
      event: 'honey://hold-to-talk-hotkey',
    });
    const dispose = await client.onHoldToTalkHotkey(onHotkey);

    hotkeyHandler?.({ payload: { hotkey: 'CapsLock', state: 'pressed' } });
    hotkeyHandler?.({ payload: { hotkey: 'CapsLock', state: 'released' } });
    hotkeyHandler?.({ payload: { hotkey: 'CapsLock', state: 'stuck' } });
    dispose();
    await expect(client.unregisterHoldToTalkHotkey()).resolves.toEqual({
      ok: true,
      hotkey: 'CapsLock',
    });

    expect(invoke).toHaveBeenCalledWith('honey_register_hold_to_talk_hotkey', { hotkey: 'CapsLock' });
    expect(listen).toHaveBeenCalledOnce();
    expect(onHotkey).toHaveBeenCalledTimes(2);
    expect(onHotkey).toHaveBeenNthCalledWith(1, { hotkey: 'CapsLock', state: 'pressed' });
    expect(onHotkey).toHaveBeenNthCalledWith(2, { hotkey: 'CapsLock', state: 'released' });
    expect(unlisten).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('honey_unregister_hold_to_talk_hotkey');
  });

  it('listens for Tauri desktop window mode changes', async () => {
    let windowModeHandler: ((event: { payload?: unknown }) => void) | undefined;
    const unlisten = vi.fn();
    const listen = vi.fn(async (event: string, handler: (event: { payload?: unknown }) => void) => {
      windowModeHandler = handler;
      expect(event).toBe('honey://desktop-window-mode');
      return unlisten;
    });

    window.__TAURI__ = { event: { listen } };
    const client = createDesktopShellClient();
    const onWindowMode = vi.fn();
    const dispose = await client.onWindowModeChange(onWindowMode);

    windowModeHandler?.({ payload: { mode: 'mini' } });
    windowModeHandler?.({ payload: { mode: 'floating' } });
    windowModeHandler?.({ payload: { mode: 'full' } });
    dispose();

    expect(listen).toHaveBeenCalledOnce();
    expect(onWindowMode).toHaveBeenNthCalledWith(1, 'mini');
    expect(onWindowMode).toHaveBeenNthCalledWith(2, 'full');
    expect(onWindowMode).toHaveBeenCalledTimes(2);
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('uses the Tauri system text insertion command when Tauri is available', async () => {
    const invoke = vi.fn(async (command: string, args?: unknown) => {
      if (command === 'honey_insert_text') {
        const insertion = args as { text: string; method: string; restoreClipboard: boolean };
        return {
          ok: true,
          status: 'inserted',
          method: insertion.method,
          text: insertion.text,
          restoreClipboard: insertion.restoreClipboard,
        };
      }

      throw new Error(`unexpected command ${command}`);
    });

    window.__TAURI__ = { core: { invoke } };
    const client = createDesktopShellClient();

    await expect(client.insertText({
      text: '今天下午把会议纪要发给大家。',
      method: 'paste',
      restoreClipboard: false,
    })).resolves.toEqual({
      ok: true,
      status: 'inserted',
      method: 'paste',
      text: '今天下午把会议纪要发给大家。',
      restoreClipboard: false,
    });
    expect(invoke).toHaveBeenCalledWith('honey_insert_text', {
      text: '今天下午把会议纪要发给大家。',
      method: 'paste',
      restoreClipboard: false,
    });
    expect(invoke).not.toHaveBeenCalledWith('honey_preview_text_insertion', expect.anything());
  });

  it('rejects malformed Tauri window mode responses', async () => {
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async () => ({ ok: false, mode: 'floating' })),
      },
    };
    const client = createDesktopShellClient();

    await expect(client.setWindowMode('mini')).rejects.toThrow('Invalid desktop window mode response');
  });

  it('rejects malformed Tauri hold-to-talk capture responses', async () => {
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async () => ({ ok: true, state: 'recording' })),
      },
    };
    const client = createDesktopShellClient();

    await expect(client.finishHoldToTalkCapture()).rejects.toThrow('Invalid hold-to-talk capture response');
  });

  it('rejects mock audio URIs from Tauri hold-to-talk capture responses', async () => {
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async () => ({
          ok: true,
          state: 'captured',
          hotkey: 'CapsLock',
          audioPath: 'mock://tauri-hold-to-talk.wav',
        })),
      },
    };
    const client = createDesktopShellClient();

    await expect(client.finishHoldToTalkCapture()).rejects.toThrow('Invalid hold-to-talk capture response');
  });

  it('rejects malformed Tauri text insertion responses', async () => {
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async () => ({ ok: true, status: 'queued', method: 'paste', text: '坏响应' })),
      },
    };
    const client = createDesktopShellClient();

    await expect(client.insertText({
      text: '坏响应',
      method: 'paste',
    })).rejects.toThrow('Invalid text insertion response');
  });
});
