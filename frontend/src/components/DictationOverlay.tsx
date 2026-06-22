import type { AppSettings, DictationOverlaySnapshot } from '@honey/api-contracts';

import { VoiceStatusBar } from '@/components/ui/VoiceStatusBar';

const compactStatusText: Partial<Record<DictationOverlaySnapshot['state'], string>> = {
  recognizing: '正在识别中…',
  failed: '识别失败',
};

const visibleStates = [
  'listening',
  'silent',
  'recognizing',
  'completed',
  'inserted',
  'failed',
] as const;

type VisibleOverlayState = (typeof visibleStates)[number];

const isVisibleOverlayState = (
  state: DictationOverlaySnapshot['state'],
): state is VisibleOverlayState => visibleStates.includes(state as VisibleOverlayState);

export function DictationOverlay({
  snapshot,
  position = 'bottom-center',
}: {
  snapshot: DictationOverlaySnapshot;
  position?: AppSettings['overlayPosition'];
}) {
  if (!isVisibleOverlayState(snapshot.state)) {
    return null;
  }

  const displayText = snapshot.previewText
    || snapshot.errorMessage
    || compactStatusText[snapshot.state]
    || '';

  return (
    <VoiceStatusBar
      className={`dictation-overlay dictation-overlay--${position} dictation-overlay--${snapshot.state}`}
      data-state={snapshot.state}
      state={snapshot.state}
      text={displayText}
      volumeLevel={snapshot.volumeLevel}
      role="status"
      aria-label="语音输入音量浮层"
      aria-live="off"
    />
  );
}
