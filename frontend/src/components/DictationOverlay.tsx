import { AlertCircle, CheckCircle2, Loader2, Mic2 } from 'lucide-react';
import type { DictationOverlaySnapshot } from '@honey/api-contracts';

import { mockWaveform } from '@/data/mockData';

const statusText: Record<DictationOverlaySnapshot['state'], string> = {
  idle: '',
  listening: '正在听',
  silent: '等待声音',
  recognizing: '正在识别',
  completed: '识别完成',
  inserted: '已输入',
  failed: '出现问题',
};

const modeText = {
  direct: '直接转写',
  persona: '人设模式',
};

const iconForState = (state: DictationOverlaySnapshot['state']) => {
  if (state === 'recognizing') {
    return <Loader2 className="spin" size={18} />;
  }
  if (state === 'completed' || state === 'inserted') {
    return <CheckCircle2 size={18} />;
  }
  if (state === 'failed') {
    return <AlertCircle size={18} />;
  }

  return <Mic2 size={18} />;
};

export function DictationOverlay({ snapshot }: { snapshot: DictationOverlaySnapshot }) {
  if (snapshot.state === 'idle') {
    return null;
  }

  const waveformActive = snapshot.state === 'listening' && snapshot.volumeLevel > 0.05;

  return (
    <div className={`dictation-overlay dictation-overlay--${snapshot.state}`} role="status" aria-live="polite">
      <div className="dictation-overlay__status">
        {iconForState(snapshot.state)}
        <span>{statusText[snapshot.state]}</span>
      </div>

      <div
        className="dictation-overlay__waveform"
        data-testid="dictation-waveform"
        data-active={waveformActive ? 'true' : 'false'}
        aria-label={waveformActive ? '检测到声音' : '未检测到声音'}
      >
        {mockWaveform.map((height, index) => (
          <span
            key={`${height}-${index}`}
            style={{
              height: `${waveformActive ? 10 + height * snapshot.volumeLevel * 34 : 10}px`,
              animationDelay: `${index * 42}ms`,
            }}
          />
        ))}
      </div>

      {snapshot.previewText ? <p className="dictation-overlay__preview">{snapshot.previewText}</p> : null}
      {snapshot.errorMessage ? <p className="dictation-overlay__error">{snapshot.errorMessage}</p> : null}

      <span className="dictation-overlay__mode">{modeText[snapshot.mode]}</span>
    </div>
  );
}
