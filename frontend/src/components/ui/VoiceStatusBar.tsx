import { LoaderCircle, Mic, Sparkles, TriangleAlert } from 'lucide-react';
import {
  useEffect,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

type VoiceStatusBarState = 'listening' | 'silent' | 'recognizing' | 'completed' | 'inserted' | 'failed';

const waveformBars = [0.28, 0.46, 0.68, 0.92, 0.72, 0.52, 1, 0.52, 0.72, 0.92, 0.68, 0.46, 0.28];

function useWaveformTick(isActive: boolean) {
  const [visualTick, setVisualTick] = useState(0);
  useEffect(() => {
    if (!isActive) {
      setVisualTick(0);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setVisualTick((current) => (current + 1) % 240);
    }, 36);

    return () => window.clearInterval(intervalId);
  }, [isActive]);

  return visualTick;
}

function resolveWaveformBarHeight({
  baseHeight,
  index,
  isSpeaking,
  volumeLevel,
  visualTick,
}: {
  baseHeight: number;
  index: number;
  isSpeaking: boolean;
  volumeLevel: number;
  visualTick: number;
}) {
  if (!isSpeaking) {
    return index % 2 === 0 ? 2 : 3;
  }

  const normalizedVolume = Math.max(0.12, Math.min(1, volumeLevel));
  const livePulse = 0.62 + ((Math.sin(visualTick * 0.85 + index * 0.92) + 1) / 2) * 0.5;
  const height = 2 + baseHeight * normalizedVolume * livePulse * 13;

  return Math.round(Math.max(3, Math.min(16, height)));
}

export type VoiceStatusBarProps = HTMLAttributes<HTMLDivElement> & {
  state: VoiceStatusBarState;
  text?: string;
  volumeLevel: number;
};

export function VoiceStatusBar({
  state,
  text,
  volumeLevel,
  className,
  ...props
}: VoiceStatusBarProps) {
  const isAudioState = state === 'listening' || state === 'silent';
  const isSpeaking = state === 'listening' && volumeLevel > 0.01;
  const visualTick = useWaveformTick(isSpeaking);
  const waveformPeak = isSpeaking ? Math.round(Math.min(1, volumeLevel) * 100) : 0;

  const StatusIcon = state === 'recognizing'
    ? LoaderCircle
    : state === 'failed'
      ? TriangleAlert
      : state === 'completed' || state === 'inserted'
        ? Sparkles
        : Mic;

  return (
    <div
      {...props}
      className={cn('voice-status-bar', className)}
      data-layout={isAudioState ? 'audio-tight' : 'text'}
      data-size="micro"
      data-state={state}
      data-testid="voice-status-bar"
      data-text-overflow="ellipsis"
    >
      <span className="voice-status-bar__icon" aria-hidden="true">
        <StatusIcon className={cn(state === 'recognizing' && 'spin')} size={15} strokeWidth={2} />
      </span>

      <span className="voice-status-bar__content">
        {isAudioState ? (
          <span
            className="voice-status-bar__visual"
            data-active={isSpeaking ? 'true' : 'false'}
            data-peak={waveformPeak}
            data-anchor="middle"
            data-testid="voice-waveform"
            aria-label={isSpeaking ? '检测到声音' : '等待声音'}
          >
            {waveformBars.map((baseHeight, index) => {
              const waveHeight = resolveWaveformBarHeight({
                baseHeight,
                index,
                isSpeaking,
                volumeLevel,
                visualTick,
              });

              return (
                <span
                  key={`${baseHeight}-${index}`}
                  style={{
                    '--wave-height': `${waveHeight}px`,
                    '--wave-half-height': `${Math.max(1, Math.round(waveHeight / 2))}px`,
                  } as CSSProperties}
                />
              );
            })}
          </span>
        ) : (
          <span
            className="dictation-overlay__text"
            data-testid="dictation-overlay-text"
            title={text}
          >
            {text}
          </span>
        )}
      </span>
    </div>
  );
}
