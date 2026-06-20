import { useEffect, useRef } from 'react';
import type { TranscriptRecord } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { desktopShellClient } from '@/api/desktopShell';
import { useDictationUiStore } from '@/stores/dictationUiStore';

interface UseMockDictationHotkeyOptions {
  enabled: boolean;
  hotkey?: string;
  triggerMode?: 'hold-to-talk' | 'click-to-toggle';
  latestText?: string;
  forcePasteApps?: string[];
  mockAudioPath?: string;
  outputMethod?: 'paste' | 'typing';
  restoreClipboard?: boolean;
  personaId?: string;
  sourceApp?: string;
  onSessionCompleted?: (record: TranscriptRecord) => void;
}

export function useMockDictationHotkey({
  enabled,
  hotkey = 'CapsLock',
  triggerMode = 'hold-to-talk',
  latestText,
  forcePasteApps = [],
  mockAudioPath = 'mock://hold-to-talk.wav',
  outputMethod = 'paste',
  restoreClipboard = true,
  personaId,
  sourceApp = 'Mock 输入框',
  onSessionCompleted,
}: UseMockDictationHotkeyOptions) {
  const pressedRef = useRef(false);
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

    const startListening = () => {
      if (pressedRef.current) {
        return;
      }

      pressedRef.current = true;
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

      void startPromise.catch(() => {
        if (sessionId !== sessionRef.current) {
          return;
        }

        pressedRef.current = false;
        activeSessionRef.current = undefined;
        sessionRef.current += 1;
        setOverlaySnapshot({
          state: 'failed',
          mode: currentMode,
          volumeLevel: 0,
          errorMessage: '听写录音启动失败',
        });
      });
    };

    const finishListening = () => {
      if (!pressedRef.current) {
        return;
      }

      pressedRef.current = false;
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

          const uploadedAudio = capture.audioCapture
            ? await backendClient.saveAudioCapture(capture.audioCapture)
            : undefined;
          if (sessionId !== sessionRef.current) {
            return undefined;
          }

          const audioPath = uploadedAudio?.audioPath ?? capture.audioPath ?? mockAudioPath;
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
              errorMessage: currentMode === 'persona' ? '人设处理失败' : '直接转写失败',
            });
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
        } catch {
          if (sessionId !== sessionRef.current) {
            return undefined;
          }

          const mode = useDictationUiStore.getState().currentMode;
          setOverlaySnapshot({
            state: 'failed',
            mode,
            volumeLevel: 0,
            errorMessage: currentMode === 'persona' ? '人设处理失败' : '直接转写失败',
          });
          return undefined;
        }
      })();

      const showResultState = (state: 'completed' | 'inserted') => {
        void previewTextRequest.then((previewText) => {
          if (!previewText) {
            return;
          }

          const mode = useDictationUiStore.getState().currentMode;
          setOverlaySnapshot({
            state,
            mode,
            volumeLevel: 0,
            previewText,
          });
        });
      };

      pushTimer(() => {
        showResultState('completed');
      }, 520);

      pushTimer(() => {
        showResultState('inserted');
      }, 1420);

      pushTimer(() => {
        void previewTextRequest.then((previewText) => {
          if (!previewText) {
            return;
          }

          const mode = useDictationUiStore.getState().currentMode;
          setOverlaySnapshot({
            state: 'idle',
            mode,
            volumeLevel: 0,
          });
        });
      }, 2320);
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
        finishListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    let disposed = false;
    let unlistenHoldToTalkHotkey: (() => void) | undefined;

    void desktopShellClient.registerHoldToTalkHotkey({ hotkey }).then(() =>
      desktopShellClient.onHoldToTalkHotkey((event) => {
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
          finishListening();
        }
      }),
    ).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      unlistenHoldToTalkHotkey = unlisten;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      sessionRef.current += 1;
      unlistenHoldToTalkHotkey?.();
      void desktopShellClient.unregisterHoldToTalkHotkey().catch(() => undefined);
      void desktopShellClient.cancelHoldToTalkCapture().catch(() => undefined);
      clearTimers();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, forcePasteApps, hotkey, latestText, mockAudioPath, onSessionCompleted, outputMethod, personaId, restoreClipboard, sourceApp, triggerMode]);
}
