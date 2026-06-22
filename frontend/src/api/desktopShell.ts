import type { AudioCaptureUploadInput } from '@honey/api-contracts';
import type { AppSettings, DictationOverlaySnapshot } from '@honey/api-contracts';

export type DesktopWindowMode = 'full' | 'mini';

export interface DesktopShellCapabilities {
  backendTransport: 'http';
  backendBaseUrl: string;
  canManageWindow: boolean;
  canUseTray: boolean;
  canRegisterGlobalHotkey: boolean;
  canInsertText: boolean;
  canPreviewHoldToTalk: boolean;
  canManageBackend: boolean;
}

export interface AudioInputDiagnosticsResult {
  ok: true;
  available: boolean;
  backend: string;
  defaultDeviceName?: string;
  sampleFormat?: string;
  channels?: number;
  sampleRate?: number;
  inputDevices: string[];
  error?: string;
}

export type DesktopBackendProcessStatus = 'stopped' | 'running' | 'error';
export type HoldToTalkCaptureState = 'listening' | 'captured' | 'cancelled';
export type HoldToTalkHotkeyState = 'pressed' | 'released';
export type DesktopTextInsertionMethod = 'paste' | 'typing';
export type DesktopTextInsertionStatus = 'preview' | 'inserted';
export type HoldToTalkHotkeyUnlisten = () => void;
export type HoldToTalkVolumeHandler = (volumeLevel: number) => void;
export type DictationOverlaySnapshotHandler = (event: { snapshot: DictationOverlaySnapshot }) => void;

export interface HoldToTalkHotkeyEvent {
  hotkey: string;
  state: HoldToTalkHotkeyState;
}

export interface RegisterHoldToTalkHotkeyResult {
  ok: true;
  hotkey: string;
  event: string;
}

export interface UnregisterHoldToTalkHotkeyResult {
  ok: true;
  hotkey?: string;
}

export interface HoldToTalkCaptureResult {
  ok: true;
  state: HoldToTalkCaptureState;
  hotkey: string;
  audioPath?: string;
  audioCapture?: AudioCaptureUploadInput;
}

export interface DesktopTextInsertionResult {
  ok: true;
  status: DesktopTextInsertionStatus;
  method: DesktopTextInsertionMethod;
  text: string;
  restoreClipboard: boolean;
}

export interface DesktopBackendProcessResult {
  ok: true;
  status: DesktopBackendProcessStatus;
  baseUrl: string;
  managed: boolean;
  pid?: number;
  detail?: string;
}

export interface DesktopShellClient {
  getCapabilities(): Promise<DesktopShellCapabilities>;
  getAudioInputDiagnostics(): Promise<AudioInputDiagnosticsResult>;
  getBackendProcessStatus(): Promise<DesktopBackendProcessResult>;
  startBackendProcess(): Promise<DesktopBackendProcessResult>;
  stopBackendProcess(): Promise<DesktopBackendProcessResult>;
  pickAudioFile(): Promise<string | undefined>;
  pickDirectory(): Promise<string | undefined>;
  openPath(input: { path: string }): Promise<{ ok: true; path: string }>;
  getWindowMode(): Promise<DesktopWindowMode>;
  setWindowMode(mode: DesktopWindowMode): Promise<{ ok: true; mode: DesktopWindowMode }>;
  setTrayEnabled(enabled: boolean): Promise<{ ok: true; enabled: boolean }>;
  setStartupEnabled(enabled: boolean): Promise<{ ok: true; enabled: boolean }>;
  onWindowModeChange(handler: (mode: DesktopWindowMode) => void): Promise<HoldToTalkHotkeyUnlisten>;
  publishDictationOverlaySnapshot(snapshot: DictationOverlaySnapshot): Promise<{ ok: true }>;
  onDictationOverlaySnapshot(handler: DictationOverlaySnapshotHandler): Promise<HoldToTalkHotkeyUnlisten>;
  setOverlayWindowVisible(visible: boolean, position?: AppSettings['overlayPosition']): Promise<{ ok: true; visible: boolean }>;
  setOverlayCenterOffset(offsetX: number, position?: AppSettings['overlayPosition']): Promise<{ ok: true; offsetX: number }>;
  registerHoldToTalkHotkey(input: { hotkey: string }): Promise<RegisterHoldToTalkHotkeyResult>;
  unregisterHoldToTalkHotkey(): Promise<UnregisterHoldToTalkHotkeyResult>;
  onHoldToTalkHotkey(handler: (event: HoldToTalkHotkeyEvent) => void): Promise<HoldToTalkHotkeyUnlisten>;
  startHoldToTalkCapture(input: { hotkey: string; onVolumeLevel?: HoldToTalkVolumeHandler }): Promise<HoldToTalkCaptureResult>;
  finishHoldToTalkCapture(): Promise<HoldToTalkCaptureResult>;
  cancelHoldToTalkCapture(): Promise<HoldToTalkCaptureResult>;
  insertText(input: {
    text: string;
    method: DesktopTextInsertionMethod;
    restoreClipboard?: boolean;
  }): Promise<DesktopTextInsertionResult>;
}

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
        ) => Promise<HoldToTalkHotkeyUnlisten>;
      };
    };
  }
}

const desktopWindowModeEventName = 'honey://desktop-window-mode';
const holdToTalkHotkeyEventName = 'honey://hold-to-talk-hotkey';
const holdToTalkVolumeEventName = 'honey://hold-to-talk-volume';
const dictationOverlaySnapshotEventName = 'honey://dictation-overlay-snapshot';

const fallbackCapabilities: DesktopShellCapabilities = {
  backendTransport: 'http',
  backendBaseUrl: 'http://127.0.0.1:33577',
  canManageWindow: false,
  canUseTray: false,
  canRegisterGlobalHotkey: false,
  canInsertText: false,
  canPreviewHoldToTalk: true,
  canManageBackend: false,
};

const fallbackBackendProcessResult = (): DesktopBackendProcessResult => ({
  ok: true,
  status: 'stopped',
  baseUrl: fallbackCapabilities.backendBaseUrl,
  managed: false,
});

const fallbackAudioInputDiagnosticsResult = (): AudioInputDiagnosticsResult => ({
  ok: true,
  available: false,
  backend: 'browser-preview',
  inputDevices: [],
  error: 'tauri_unavailable',
});

const fallbackCaptureResult = (state: HoldToTalkCaptureState, hotkey = 'F9'): HoldToTalkCaptureResult => ({
  ok: true,
  state,
  hotkey,
  audioPath: state === 'cancelled' ? undefined : 'mock://hold-to-talk.wav',
});

interface BrowserAudioCaptureSession {
  hotkey: string;
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  mimeType: string;
  stopVolumeMeter?: () => void;
}

let activeBrowserAudioCapture: BrowserAudioCaptureSession | undefined;
let activeNativeVolumeUnlisten: HoldToTalkHotkeyUnlisten | undefined;

const recorderMimeTypeCandidates = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/wav',
];

const audioExtensionByMimeType: Record<string, string> = {
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
};

const normalizeMimeType = (mimeType: string) => mimeType.split(';')[0]?.toLowerCase() || 'audio/webm';

const resolveRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }

  return recorderMimeTypeCandidates.find(candidate => MediaRecorder.isTypeSupported?.(candidate)) ?? 'audio/webm';
};

const resolveAudioCaptureFileName = (mimeType: string) =>
  `hold-to-talk${audioExtensionByMimeType[normalizeMimeType(mimeType)] ?? '.webm'}`;

const stopMediaStream = (stream: MediaStream) => {
  stream.getTracks().forEach(track => track.stop());
};

const createBrowserVolumeMeter = (
  stream: MediaStream,
  onVolumeLevel?: HoldToTalkVolumeHandler,
) => {
  if (!onVolumeLevel || typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return undefined;
  }

  const AudioContextCtor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return undefined;
  }

  try {
    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let frameId: number | undefined;
    let stopped = false;
    const sampleVolume = () => {
      if (stopped) {
        return;
      }

      analyser.getByteTimeDomainData(samples);
      const meanSquare = samples.reduce((sum, value) => {
        const centered = (value - 128) / 128;
        return sum + centered * centered;
      }, 0) / samples.length;
      onVolumeLevel(Math.min(1, Math.sqrt(meanSquare)));
      frameId = requestAnimationFrame(sampleVolume);
    };

    frameId = requestAnimationFrame(sampleVolume);

    return () => {
      stopped = true;
      if (frameId !== undefined && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameId);
      }

      void audioContext.close().catch(() => undefined);
    };
  } catch {
    return undefined;
  }
};

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer) => {
  if (typeof btoa !== 'function') {
    throw new Error('Browser base64 encoder unavailable');
  }

  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const blobToArrayBuffer = async (blob: Blob) => {
  const blobWithArrayBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof blobWithArrayBuffer.arrayBuffer === 'function') {
    return await blobWithArrayBuffer.arrayBuffer();
  }

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', () => {
      if (reader.error) {
        reject(reader.error);
        return;
      }

      resolve(reader.result as ArrayBuffer);
    }, { once: true });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read audio capture'));
    }, { once: true });
    reader.readAsArrayBuffer(blob);
  });
};

const cancelBrowserAudioCapture = () => {
  const session = activeBrowserAudioCapture;
  activeBrowserAudioCapture = undefined;

  if (!session) {
    return;
  }

  try {
    if (session.recorder.state !== 'inactive') {
      session.recorder.stop();
    }
  } catch {
    // The recorder may already be stopping; track cleanup below is the important part.
  }

  session.stopVolumeMeter?.();
  stopMediaStream(session.stream);
};

const startBrowserAudioCapture = async (hotkey: string, onVolumeLevel?: HoldToTalkVolumeHandler) => {
  cancelBrowserAudioCapture();

  if (
    typeof navigator === 'undefined'
    || !navigator.mediaDevices?.getUserMedia
    || typeof MediaRecorder === 'undefined'
  ) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = resolveRecorderMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    const stopVolumeMeter = createBrowserVolumeMeter(stream, onVolumeLevel);
    recorder.addEventListener('dataavailable', (event) => {
      const audioData = (event as Event & { data?: Blob }).data;
      if (audioData && audioData.size > 0) {
        chunks.push(audioData);
      }
    });
    recorder.start();
    activeBrowserAudioCapture = {
      hotkey,
      recorder,
      stream,
      chunks,
      startedAt: Date.now(),
      mimeType,
      stopVolumeMeter,
    };

    return true;
  } catch {
    return false;
  }
};

const finishBrowserAudioCapture = async (): Promise<AudioCaptureUploadInput | undefined> => {
  const session = activeBrowserAudioCapture;
  activeBrowserAudioCapture = undefined;

  if (!session) {
    return undefined;
  }

  return await new Promise<AudioCaptureUploadInput | undefined>((resolve, reject) => {
    const finalizeCapture = async () => {
      try {
        session.stopVolumeMeter?.();
        stopMediaStream(session.stream);
        const mimeType = normalizeMimeType(session.recorder.mimeType || session.mimeType);
        const audioBlob = new Blob(session.chunks, { type: mimeType });
        const arrayBuffer = await blobToArrayBuffer(audioBlob);
        if (arrayBuffer.byteLength === 0) {
          resolve(undefined);
          return;
        }

        resolve({
          fileName: resolveAudioCaptureFileName(mimeType),
          mimeType,
          base64Data: arrayBufferToBase64(arrayBuffer),
          durationMs: Math.max(0, Date.now() - session.startedAt),
        });
      } catch (error) {
        reject(error);
      }
    };

    session.recorder.addEventListener('stop', () => {
      void finalizeCapture();
    }, { once: true });

    if (session.recorder.state === 'inactive') {
      void finalizeCapture();
      return;
    }

    session.recorder.stop();
  });
};

const getTauriInvoke = () => window.__TAURI__?.core?.invoke;
const getTauriListen = () => window.__TAURI__?.event?.listen;

const stopNativeVolumeListener = () => {
  activeNativeVolumeUnlisten?.();
  activeNativeVolumeUnlisten = undefined;
};

const isDesktopWindowMode = (value: unknown): value is DesktopWindowMode => value === 'full' || value === 'mini';
const isHoldToTalkCaptureState = (value: unknown): value is HoldToTalkCaptureState =>
  value === 'listening' || value === 'captured' || value === 'cancelled';
const isDesktopBackendProcessStatus = (value: unknown): value is DesktopBackendProcessStatus =>
  value === 'stopped' || value === 'running' || value === 'error';
const isHoldToTalkHotkeyState = (value: unknown): value is HoldToTalkHotkeyState =>
  value === 'pressed' || value === 'released';
const isDictationOverlayState = (value: unknown): value is DictationOverlaySnapshot['state'] =>
  value === 'idle'
  || value === 'listening'
  || value === 'silent'
  || value === 'recognizing'
  || value === 'completed'
  || value === 'inserted'
  || value === 'failed';
const isDesktopTextInsertionMethod = (value: unknown): value is DesktopTextInsertionMethod =>
  value === 'paste' || value === 'typing';
const isDesktopTextInsertionStatus = (value: unknown): value is DesktopTextInsertionStatus =>
  value === 'preview' || value === 'inserted';
const isLocalCaptureAudioPath = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !value.includes('://');
const isAudioCaptureUploadInput = (value: unknown): value is AudioCaptureUploadInput => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const audioCapture = value as Partial<AudioCaptureUploadInput>;
  return (
    (audioCapture.fileName === undefined || typeof audioCapture.fileName === 'string')
    && typeof audioCapture.mimeType === 'string'
    && audioCapture.mimeType.trim().length > 0
    && typeof audioCapture.base64Data === 'string'
    && audioCapture.base64Data.trim().length > 0
    && (audioCapture.durationMs === undefined || typeof audioCapture.durationMs === 'number')
  );
};

const parseAudioFilePickerResult = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid audio file picker response');
  }

  const result = value as Partial<{ ok: unknown; path: unknown }>;
  if (result.ok !== true) {
    throw new Error('Invalid audio file picker response');
  }

  if (result.path === undefined || result.path === null) {
    return undefined;
  }

  if (typeof result.path !== 'string' || result.path.trim().length === 0) {
    throw new Error('Invalid audio file picker response');
  }

  return result.path;
};

const parseDirectoryPickerResult = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid directory picker response');
  }

  const result = value as Partial<{ ok: unknown; path: unknown }>;
  if (result.ok !== true) {
    throw new Error('Invalid directory picker response');
  }

  if (result.path === undefined || result.path === null) {
    return undefined;
  }

  if (typeof result.path !== 'string' || result.path.trim().length === 0) {
    throw new Error('Invalid directory picker response');
  }

  return result.path;
};

const parseOpenPathResult = (value: unknown): { ok: true; path: string } => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid open path response');
  }

  const result = value as Partial<{ ok: unknown; path: unknown }>;
  if (result.ok !== true || typeof result.path !== 'string' || result.path.trim().length === 0) {
    throw new Error('Invalid open path response');
  }

  return {
    ok: true,
    path: result.path,
  };
};

const parseCapabilities = (value: unknown): DesktopShellCapabilities => {
  if (!value || typeof value !== 'object') {
    return fallbackCapabilities;
  }

  const capabilities = value as Partial<DesktopShellCapabilities>;
  return {
    backendTransport: 'http',
    backendBaseUrl: typeof capabilities.backendBaseUrl === 'string' && capabilities.backendBaseUrl.trim().length > 0
      ? capabilities.backendBaseUrl
      : fallbackCapabilities.backendBaseUrl,
    canManageWindow: Boolean(capabilities.canManageWindow),
    canUseTray: Boolean(capabilities.canUseTray),
    canRegisterGlobalHotkey: Boolean(capabilities.canRegisterGlobalHotkey),
    canInsertText: Boolean(capabilities.canInsertText),
    canPreviewHoldToTalk: Boolean(capabilities.canPreviewHoldToTalk),
    canManageBackend: Boolean(capabilities.canManageBackend),
  };
};

const parseBackendProcessResult = (value: unknown): DesktopBackendProcessResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid backend process response');
  }

  const result = value as Partial<DesktopBackendProcessResult>;
  if (
    result.ok !== true
    || !isDesktopBackendProcessStatus(result.status)
    || typeof result.baseUrl !== 'string'
    || result.baseUrl.trim().length === 0
    || typeof result.managed !== 'boolean'
  ) {
    throw new Error('Invalid backend process response');
  }

  return {
    ok: true,
    status: result.status,
    baseUrl: result.baseUrl,
    managed: result.managed,
    pid: typeof result.pid === 'number' ? result.pid : undefined,
    detail: typeof result.detail === 'string' ? result.detail : undefined,
  };
};

const parseAudioInputDiagnosticsResult = (value: unknown): AudioInputDiagnosticsResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid audio input diagnostics response');
  }

  const result = value as Partial<AudioInputDiagnosticsResult>;
  if (
    result.ok !== true
    || typeof result.available !== 'boolean'
    || typeof result.backend !== 'string'
    || !Array.isArray(result.inputDevices)
    || result.inputDevices.some(device => typeof device !== 'string')
  ) {
    throw new Error('Invalid audio input diagnostics response');
  }

  return {
    ok: true,
    available: result.available,
    backend: result.backend,
    defaultDeviceName: typeof result.defaultDeviceName === 'string' ? result.defaultDeviceName : undefined,
    sampleFormat: typeof result.sampleFormat === 'string' ? result.sampleFormat : undefined,
    channels: typeof result.channels === 'number' ? result.channels : undefined,
    sampleRate: typeof result.sampleRate === 'number' ? result.sampleRate : undefined,
    inputDevices: result.inputDevices,
    error: typeof result.error === 'string' ? result.error : undefined,
  };
};

const parseHoldToTalkCaptureResult = (value: unknown): HoldToTalkCaptureResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid hold-to-talk capture response');
  }

  const result = value as Partial<HoldToTalkCaptureResult>;
  if (result.ok !== true || !isHoldToTalkCaptureState(result.state) || typeof result.hotkey !== 'string') {
    throw new Error('Invalid hold-to-talk capture response');
  }

  const audioCapture = isAudioCaptureUploadInput(result.audioCapture) ? result.audioCapture : undefined;

  if (result.state !== 'cancelled' && !isLocalCaptureAudioPath(result.audioPath) && !audioCapture) {
    throw new Error('Invalid hold-to-talk capture response');
  }

  if (result.state === 'cancelled' && result.audioPath !== undefined && typeof result.audioPath !== 'string') {
    throw new Error('Invalid hold-to-talk capture response');
  }

  return {
    ok: true,
    state: result.state,
    hotkey: result.hotkey,
    audioPath: result.audioPath,
    audioCapture,
  };
};

const parseRegisterHoldToTalkHotkeyResult = (value: unknown): RegisterHoldToTalkHotkeyResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid hold-to-talk hotkey registration response');
  }

  const result = value as Partial<RegisterHoldToTalkHotkeyResult>;
  if (
    result.ok !== true
    || typeof result.hotkey !== 'string'
    || result.hotkey.trim().length === 0
    || result.event !== holdToTalkHotkeyEventName
  ) {
    throw new Error('Invalid hold-to-talk hotkey registration response');
  }

  return {
    ok: true,
    hotkey: result.hotkey,
    event: result.event,
  };
};

const parseUnregisterHoldToTalkHotkeyResult = (value: unknown): UnregisterHoldToTalkHotkeyResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid hold-to-talk hotkey unregistration response');
  }

  const result = value as Partial<UnregisterHoldToTalkHotkeyResult>;
  if (result.ok !== true || (result.hotkey !== undefined && typeof result.hotkey !== 'string')) {
    throw new Error('Invalid hold-to-talk hotkey unregistration response');
  }

  return {
    ok: true,
    hotkey: result.hotkey,
  };
};

const parseHoldToTalkHotkeyEvent = (value: unknown): HoldToTalkHotkeyEvent | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const event = value as Partial<HoldToTalkHotkeyEvent>;
  if (typeof event.hotkey !== 'string' || !isHoldToTalkHotkeyState(event.state)) {
    return undefined;
  }

  return {
    hotkey: event.hotkey,
    state: event.state,
  };
};

const parseDesktopWindowModeEvent = (value: unknown): DesktopWindowMode | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const event = value as Partial<{ mode: unknown }>;
  return isDesktopWindowMode(event.mode) ? event.mode : undefined;
};

const isDictationOverlaySnapshot = (value: unknown): value is DictationOverlaySnapshot => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<DictationOverlaySnapshot>;
  return (
    isDictationOverlayState(snapshot.state)
    && (snapshot.mode === 'direct' || snapshot.mode === 'persona')
    && typeof snapshot.volumeLevel === 'number'
  );
};

const parseDictationOverlaySnapshotEvent = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const event = value as Partial<{ snapshot: unknown }>;
  return isDictationOverlaySnapshot(event.snapshot)
    ? { snapshot: event.snapshot }
    : undefined;
};

const parseHoldToTalkVolumeLevel = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const event = value as Partial<{ volumeLevel: unknown }>;
  if (typeof event.volumeLevel !== 'number' || Number.isNaN(event.volumeLevel)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, event.volumeLevel));
};

const startNativeVolumeListener = async (onVolumeLevel?: HoldToTalkVolumeHandler) => {
  stopNativeVolumeListener();
  const listen = getTauriListen();
  if (!listen || !onVolumeLevel) {
    return;
  }

  activeNativeVolumeUnlisten = await listen(holdToTalkVolumeEventName, (event) => {
    const volumeLevel = parseHoldToTalkVolumeLevel(event.payload);
    if (volumeLevel !== undefined) {
      onVolumeLevel(volumeLevel);
    }
  });
};

const parseDesktopTextInsertionResult = (value: unknown): DesktopTextInsertionResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid text insertion response');
  }

  const result = value as Partial<DesktopTextInsertionResult>;
  if (
    result.ok !== true
    || !isDesktopTextInsertionStatus(result.status)
    || !isDesktopTextInsertionMethod(result.method)
    || typeof result.text !== 'string'
  ) {
    throw new Error('Invalid text insertion response');
  }

  return {
    ok: true,
    status: result.status,
    method: result.method,
    text: result.text,
    restoreClipboard: typeof result.restoreClipboard === 'boolean' ? result.restoreClipboard : true,
  };
};

export function createDesktopShellClient(): DesktopShellClient {
  return {
    async getCapabilities() {
      const invoke = getTauriInvoke();
      return invoke ? parseCapabilities(await invoke('honey_desktop_capabilities')) : fallbackCapabilities;
    },
    async getAudioInputDiagnostics() {
      const invoke = getTauriInvoke();
      return invoke
        ? parseAudioInputDiagnosticsResult(await invoke('honey_get_audio_input_diagnostics'))
        : fallbackAudioInputDiagnosticsResult();
    },
    async getBackendProcessStatus() {
      const invoke = getTauriInvoke();
      return invoke
        ? parseBackendProcessResult(await invoke('honey_get_backend_process_status'))
        : fallbackBackendProcessResult();
    },
    async startBackendProcess() {
      const invoke = getTauriInvoke();
      return invoke
        ? parseBackendProcessResult(await invoke('honey_start_backend_process'))
        : fallbackBackendProcessResult();
    },
    async stopBackendProcess() {
      const invoke = getTauriInvoke();
      return invoke
        ? parseBackendProcessResult(await invoke('honey_stop_backend_process'))
        : fallbackBackendProcessResult();
    },
    async pickAudioFile() {
      const invoke = getTauriInvoke();
      return invoke
        ? parseAudioFilePickerResult(await invoke('honey_pick_audio_file'))
        : undefined;
    },
    async pickDirectory() {
      const invoke = getTauriInvoke();
      return invoke
        ? parseDirectoryPickerResult(await invoke('honey_pick_directory'))
        : undefined;
    },
    async openPath(input) {
      if (input.path.trim().length === 0) {
        throw new Error('Invalid open path response');
      }

      const invoke = getTauriInvoke();
      return invoke
        ? parseOpenPathResult(await invoke('honey_open_path', input))
        : { ok: true, path: input.path };
    },
    async getWindowMode() {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return 'full';
      }

      const result = await invoke('honey_get_desktop_window_mode') as { mode?: unknown };
      return isDesktopWindowMode(result.mode) ? result.mode : 'full';
    },
    async setWindowMode(mode) {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return { ok: true, mode };
      }

      const result = await invoke('honey_set_desktop_window_mode', { mode }) as { ok?: unknown; mode?: unknown };
      if (result.ok !== true || !isDesktopWindowMode(result.mode)) {
        throw new Error('Invalid desktop window mode response');
      }

      return {
        ok: true,
        mode: result.mode,
      };
    },
    async setTrayEnabled(enabled) {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return { ok: true, enabled };
      }

      const result = await invoke('honey_set_tray_enabled', { enabled }) as { ok?: unknown; enabled?: unknown };
      if (result.ok !== true || typeof result.enabled !== 'boolean') {
        throw new Error('Invalid tray preference response');
      }

      return {
        ok: true,
        enabled: result.enabled,
      };
    },
    async setStartupEnabled(enabled) {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return { ok: true, enabled };
      }

      const result = await invoke('honey_set_startup_enabled', { enabled }) as { ok?: unknown; enabled?: unknown };
      if (result.ok !== true || typeof result.enabled !== 'boolean') {
        throw new Error('Invalid startup preference response');
      }

      return {
        ok: true,
        enabled: result.enabled,
      };
    },
    async onWindowModeChange(handler) {
      const listen = getTauriListen();
      if (!listen) {
        return () => undefined;
      }

      return listen(desktopWindowModeEventName, (event) => {
        const mode = parseDesktopWindowModeEvent(event.payload);
        if (mode) {
          handler(mode);
        }
      });
    },
    async publishDictationOverlaySnapshot(snapshot) {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return { ok: true };
      }

      const result = await invoke('honey_publish_dictation_overlay_snapshot', { snapshot }) as { ok?: unknown };
      if (result.ok !== true) {
        throw new Error('Invalid overlay snapshot publish response');
      }

      return { ok: true };
    },
    async onDictationOverlaySnapshot(handler) {
      const listen = getTauriListen();
      if (!listen) {
        return () => undefined;
      }

      return listen(dictationOverlaySnapshotEventName, (event) => {
        const payload = parseDictationOverlaySnapshotEvent(event.payload);
        if (payload) {
          handler(payload);
        }
      });
    },
    async setOverlayWindowVisible(visible, position = 'bottom-center') {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return { ok: true, visible };
      }

      const result = await invoke('honey_set_overlay_window_visible', { visible, position }) as { ok?: unknown; visible?: unknown };
      if (result.ok !== true || typeof result.visible !== 'boolean') {
        throw new Error('Invalid overlay visibility response');
      }

      return {
        ok: true,
        visible: result.visible,
      };
    },
    async setOverlayCenterOffset(offsetX, position = 'bottom-center') {
      const invoke = getTauriInvoke();
      const normalizedOffsetX = Math.round(offsetX);
      if (!invoke) {
        return { ok: true, offsetX: normalizedOffsetX };
      }

      const result = await invoke('honey_set_overlay_center_offset', {
        offsetX: normalizedOffsetX,
        position,
      }) as { ok?: unknown; offsetX?: unknown };
      if (result.ok !== true || typeof result.offsetX !== 'number') {
        throw new Error('Invalid overlay center offset response');
      }

      return {
        ok: true,
        offsetX: result.offsetX,
      };
    },
    async registerHoldToTalkHotkey(input) {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return {
          ok: true,
          hotkey: input.hotkey,
          event: holdToTalkHotkeyEventName,
        };
      }

      return parseRegisterHoldToTalkHotkeyResult(await invoke('honey_register_hold_to_talk_hotkey', input));
    },
    async unregisterHoldToTalkHotkey() {
      const invoke = getTauriInvoke();
      if (!invoke) {
        return { ok: true };
      }

      return parseUnregisterHoldToTalkHotkeyResult(await invoke('honey_unregister_hold_to_talk_hotkey'));
    },
    async onHoldToTalkHotkey(handler) {
      const listen = getTauriListen();
      if (!listen) {
        return () => undefined;
      }

      return listen(holdToTalkHotkeyEventName, (event) => {
        const payload = parseHoldToTalkHotkeyEvent(event.payload);
        if (payload) {
          handler(payload);
        }
      });
    },
    async startHoldToTalkCapture(input) {
      const invoke = getTauriInvoke();
      if (invoke) {
        await startNativeVolumeListener(input.onVolumeLevel).catch((error: unknown) => {
          console.warn('hold-to-talk native volume listener unavailable', error);
        });
        try {
          return parseHoldToTalkCaptureResult(await invoke('honey_start_hold_to_talk_capture', { hotkey: input.hotkey }));
        } catch (error) {
          stopNativeVolumeListener();
          throw error;
        }
      }

      await startBrowserAudioCapture(input.hotkey, input.onVolumeLevel);
      return fallbackCaptureResult('listening', input.hotkey);
    },
    async finishHoldToTalkCapture() {
      const invoke = getTauriInvoke();
      if (invoke) {
        try {
          return parseHoldToTalkCaptureResult(await invoke('honey_finish_hold_to_talk_capture'));
        } finally {
          stopNativeVolumeListener();
        }
      }

      const audioCapture = await finishBrowserAudioCapture();
      return audioCapture
        ? {
          ok: true,
          state: 'captured',
          hotkey: 'F9',
          audioCapture,
        }
        : fallbackCaptureResult('captured');
    },
    async cancelHoldToTalkCapture() {
      const invoke = getTauriInvoke();
      if (invoke) {
        try {
          return parseHoldToTalkCaptureResult(await invoke('honey_cancel_hold_to_talk_capture'));
        } finally {
          stopNativeVolumeListener();
        }
      }

      cancelBrowserAudioCapture();
      return fallbackCaptureResult('cancelled');
    },
    async insertText(input) {
      const restoreClipboard = input.restoreClipboard ?? true;
      const invoke = getTauriInvoke();
      if (!invoke) {
        return {
          ok: true,
          status: 'preview',
          method: input.method,
          text: input.text,
          restoreClipboard,
        };
      }

      return parseDesktopTextInsertionResult(await invoke('honey_insert_text', {
        ...input,
        restoreClipboard,
      }));
    },
  };
}

export const desktopShellClient = createDesktopShellClient();
