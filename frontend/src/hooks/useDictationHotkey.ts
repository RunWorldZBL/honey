import { useEffect, useRef } from 'react';
import type { TranscriptRecord } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { desktopShellClient } from '@/api/desktopShell';
import { useDictationUiStore } from '@/stores/dictationUiStore';

interface UseDictationHotkeyOptions {
  enabled: boolean;
  hotkey?: string;
  triggerMode?: 'hold-to-talk' | 'click-to-toggle';
  triggerThresholdMs?: number;
  latestText?: string;
  forcePasteApps?: string[];
  fallbackAudioPath?: string;
  outputMethod?: 'paste' | 'typing';
  restoreClipboard?: boolean;
  personaId?: string;
  sourceApp?: string;
  onSessionCompleted?: (record: TranscriptRecord) => void;
}

const rawErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return undefined;
};

export const formatCaptureStartErrorMessage = (error: unknown) => {
  const detail = rawErrorMessage(error);
  if (!detail) {
    return '听写录音启动失败';
  }

  const reason = (() => {
    if (detail.startsWith('capture_input_device_unavailable')) {
      return '没有找到可用的麦克风输入设备';
    }

    if (detail.startsWith('capture_input_config_unavailable')) {
      return '读取麦克风默认配置失败';
    }

    if (detail.startsWith('capture_stream_unavailable')) {
      return '麦克风录音流创建失败，可能被系统权限拦截或设备被占用';
    }

    if (detail.startsWith('capture_stream_start_failed')) {
      return '麦克风录音流启动失败，可能被系统权限拦截或设备被占用';
    }

    if (detail.startsWith('capture_input_sample_format_unsupported')) {
      return '当前麦克风采样格式暂不支持';
    }

    if (detail.startsWith('capture_dir_unavailable')) {
      return '录音临时目录不可用';
    }

    return detail;
  })();

  return reason === detail
    ? `听写录音启动失败：${detail}`
    : `听写录音启动失败：${reason}（${detail}）`;
};

const formatDictationFailureMessage = (mode: 'direct' | 'persona', errorMessage?: string) => {
  if (errorMessage?.startsWith('fun_asr_nano_empty_transcript')) {
    return '没有听到有效语音';
  }

  if (errorMessage?.startsWith('fun_asr_nano_audio')) {
    return `音频读取失败：${errorMessage}`;
  }

  if (errorMessage?.trim()) {
    return `${mode === 'persona' ? '人设处理失败' : '直接转写失败'}：${errorMessage}`;
  }

  return mode === 'persona' ? '人设处理失败' : '直接转写失败';
};

export function useDictationHotkey({
  enabled,
  hotkey = 'F9',
  triggerMode = 'hold-to-talk',
  triggerThresholdMs = 0,
  latestText,
  forcePasteApps = [],
  fallbackAudioPath = 'mock://hold-to-talk.wav',
  outputMethod = 'paste',
  restoreClipboard = true,
  personaId,
  sourceApp = '当前输入框',
  onSessionCompleted,
}: UseDictationHotkeyOptions) {
  const pressedRef = useRef(false);
  const pressedAtRef = useRef<number | undefined>(undefined);
  const timersRef = useRef<number[]>([]);
  const sessionRef = useRef(0);
  const activeSessionRef = useRef<{
    id: number;
    startPromise: ReturnType<typeof desktopShellClient.startHoldToTalkCapture>;
  } | undefined>(undefined);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const clearTimers = () => {
      timersRef.current.forEach(timer => window.clearTimeout(timer));
      timersRef.current = [];
    };

    const pushTimer = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      timersRef.current.push(timer);
    };

    const scheduleOverlayIdle = (mode: 'direct' | 'persona', delay: number) => {
      pushTimer(() => {
        useDictationUiStore.getState().setOverlaySnapshot({
          state: 'idle',
          mode,
          volumeLevel: 0,
        });
      }, delay);
    };

    const startListening = () => {
      if (pressedRef.current) {
        return;
      }

      console.info('[honey] startListening', { hotkey, triggerMode });
      pressedRef.current = true;
      pressedAtRef.current = Date.now();
      sessionRef.current += 1;
      clearTimers();
      const { currentMode, setOverlaySnapshot } = useDictationUiStore.getState();
      const sessionId = sessionRef.current;
      setOverlaySnapshot({
        state: 'listening',
        mode: currentMode,
        volumeLevel: 0,
      });

      const startPromise = desktopShellClient.startHoldToTalkCapture({
        hotkey,
        onVolumeLevel: (volumeLevel) => {
          if (sessionId !== sessionRef.current || !pressedRef.current) {
            return;
          }

          const mode = useDictationUiStore.getState().currentMode;
          setOverlaySnapshot({
            state: 'listening',
            mode,
            volumeLevel: Math.max(0, Math.min(1, volumeLevel)),
          });
        },
      });
      activeSessionRef.current = {
        id: sessionId,
        startPromise,
      };

      void startPromise.catch((error: unknown) => {
        console.error('hold-to-talk native capture start failed', error);
        if (sessionId !== sessionRef.current) {
          return;
        }

        pressedRef.current = false;
        pressedAtRef.current = undefined;
        activeSessionRef.current = undefined;
        sessionRef.current += 1;
        setOverlaySnapshot({
          state: 'failed',
          mode: currentMode,
          volumeLevel: 0,
          errorMessage: formatCaptureStartErrorMessage(error),
        });
        scheduleOverlayIdle(currentMode, 1600);
      });
    };

    const cancelListening = () => {
      if (!pressedRef.current) {
        return;
      }

      console.info('[honey] cancelListening', { hotkey });
      pressedRef.current = false;
      pressedAtRef.current = undefined;
      activeSessionRef.current = undefined;
      sessionRef.current += 1;
      clearTimers();
      const { currentMode, setOverlaySnapshot } = useDictationUiStore.getState();
      setOverlaySnapshot({
        state: 'idle',
        mode: currentMode,
        volumeLevel: 0,
      });
      void desktopShellClient.cancelHoldToTalkCapture().catch(() => undefined);
    };

    const finishListening = () => {
      if (!pressedRef.current) {
        return;
      }

      console.info('[honey] finishListening', { hotkey });
      pressedRef.current = false;
      pressedAtRef.current = undefined;
      clearTimers();
      const { currentMode, selectedPersonaId, setOverlaySnapshot } = useDictationUiStore.getState();
      const sessionId = sessionRef.current;
      const activeSession = activeSessionRef.current;
      setOverlaySnapshot({
        state: 'recognizing',
        mode: currentMode,
        volumeLevel: 0,
      });

      const previewTextRequest = (async () => {
        try {
          await activeSession?.startPromise;
          if (sessionId !== sessionRef.current) {
            return undefined;
          }

          const capture = await desktopShellClient.finishHoldToTalkCapture();
          if (sessionId !== sessionRef.current) {
            return undefined;
          }

          const uploadedAudio = !capture.audioPath && capture.audioCapture
            ? await backendClient.saveAudioCapture(capture.audioCapture)
            : undefined;
          if (sessionId !== sessionRef.current) {
            return undefined;
          }

          const audioPath = capture.audioPath ?? uploadedAudio?.audioPath ?? fallbackAudioPath;
          const session = currentMode === 'persona'
            ? await backendClient.runPersonaDictationSession({
              audioPath,
              sourceApp,
              personaId: personaId ?? selectedPersonaId ?? 'persona-office',
            })
            : await backendClient.runDirectDictationSession({
              audioPath,
              sourceApp,
            });
          if (sessionId !== sessionRef.current) {
            return undefined;
          }

          if (session.record.status !== 'completed') {
            const mode = useDictationUiStore.getState().currentMode;
            setOverlaySnapshot({
              state: 'failed',
              mode,
              volumeLevel: 0,
              errorMessage: formatDictationFailureMessage(currentMode, session.record.errorMessage),
            });
            scheduleOverlayIdle(mode, 1600);
            return undefined;
          }

          onSessionCompleted?.(session.record);
          const previewText = session.record.outputText || latestText || '刚才的语音已经转成文字。';
          const insertionMethod = forcePasteApps.includes(sourceApp) ? 'paste' : outputMethod;
          void desktopShellClient.insertText({
            text: previewText,
            method: insertionMethod,
            restoreClipboard,
          }).catch(() => undefined);
          return previewText;
        } catch (error: unknown) {
          if (sessionId !== sessionRef.current) {
            return undefined;
          }

          const mode = useDictationUiStore.getState().currentMode;
          setOverlaySnapshot({
            state: 'failed',
            mode,
            volumeLevel: 0,
            errorMessage: formatDictationFailureMessage(currentMode, rawErrorMessage(error)),
          });
          scheduleOverlayIdle(mode, 1600);
          return undefined;
        }
      })();

      const showResultState = () => {
        void previewTextRequest.then((previewText) => {
          if (!previewText) {
            return;
          }

          const mode = useDictationUiStore.getState().currentMode;
          setOverlaySnapshot({
            state: 'completed',
            mode,
            volumeLevel: 0,
            previewText,
          });
        });
      };

      pushTimer(() => {
        showResultState();
      }, 520);

      pushTimer(() => {
        void previewTextRequest.then((previewText) => {
          if (!previewText) {
            return;
          }

          const mode = useDictationUiStore.getState().currentMode;
          useDictationUiStore.getState().setOverlaySnapshot({
            state: 'idle',
            mode,
            volumeLevel: 0,
          });
        });
      }, 820);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== hotkey || event.repeat) {
        return;
      }

      if (triggerMode === 'click-to-toggle') {
        if (pressedRef.current) {
          finishListening();
          return;
        }

        startListening();
        return;
      }

      startListening();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== hotkey) {
        return;
      }

      if (triggerMode === 'hold-to-talk') {
        const pressedAt = pressedAtRef.current;
        if (pressedAt !== undefined && Date.now() - pressedAt < triggerThresholdMs) {
          cancelListening();
          return;
        }

        finishListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    let disposed = false;
    let unlistenHoldToTalkHotkey: (() => void) | undefined;

    void desktopShellClient.registerHoldToTalkHotkey({ hotkey }).then(() =>
      desktopShellClient.onHoldToTalkHotkey((event) => {
        console.info('[honey] hold-to-talk hotkey event', event);
        if (disposed || event.hotkey !== hotkey) {
          return;
        }

        if (event.state === 'pressed') {
          if (triggerMode === 'click-to-toggle' && pressedRef.current) {
            finishListening();
            return;
          }

          startListening();
          return;
        }

        if (triggerMode === 'hold-to-talk') {
          const pressedAt = pressedAtRef.current;
          if (pressedAt !== undefined && Date.now() - pressedAt < triggerThresholdMs) {
            cancelListening();
            return;
          }

          finishListening();
        }
      }),
    ).then((unlisten) => {
      console.info('[honey] hold-to-talk hotkey listener ready', { hotkey, triggerMode });
      if (disposed) {
        unlisten();
        return;
      }

      unlistenHoldToTalkHotkey = unlisten;
    }).catch((error) => {
      console.error('[honey] hold-to-talk hotkey listener failed', error);
    });

    return () => {
      disposed = true;
      sessionRef.current += 1;
      pressedAtRef.current = undefined;
      unlistenHoldToTalkHotkey?.();
      void desktopShellClient.unregisterHoldToTalkHotkey().catch(() => undefined);
      void desktopShellClient.cancelHoldToTalkCapture().catch(() => undefined);
      clearTimers();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, fallbackAudioPath, forcePasteApps, hotkey, latestText, onSessionCompleted, outputMethod, personaId, restoreClipboard, sourceApp, triggerMode, triggerThresholdMs]);
}
