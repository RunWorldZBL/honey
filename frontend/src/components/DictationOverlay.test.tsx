import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DictationOverlay } from './DictationOverlay';

describe('DictationOverlay', () => {
  it('renders moving waveform while listening', () => {
    render(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.8 }}
      />,
    );

    expect(screen.getByText('正在听')).toBeInTheDocument();
    expect(screen.getByTestId('dictation-waveform')).toHaveAttribute('data-active', 'true');
  });

  it('applies the configured screen position', () => {
    render(
      <DictationOverlay
        position="bottom-right"
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.8 }}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('dictation-overlay--bottom-right');
  });

  it('scales waveform height with the captured volume level', () => {
    const { container, rerender } = render(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.2 }}
      />,
    );
    const lowVolumeHeight = Number.parseFloat(container.querySelector('.dictation-overlay__waveform span')?.getAttribute('style')?.match(/height:\s*([\d.]+)px/)?.[1] ?? '0');

    rerender(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.9 }}
      />,
    );
    const highVolumeHeight = Number.parseFloat(container.querySelector('.dictation-overlay__waveform span')?.getAttribute('style')?.match(/height:\s*([\d.]+)px/)?.[1] ?? '0');

    expect(highVolumeHeight).toBeGreaterThan(lowVolumeHeight);
  });

  it('keeps waveform inactive when silent', () => {
    render(
      <DictationOverlay
        snapshot={{ state: 'silent', mode: 'direct', volumeLevel: 0 }}
      />,
    );

    expect(screen.getByText('等待声音')).toBeInTheDocument();
    expect(screen.getByTestId('dictation-waveform')).toHaveAttribute('data-active', 'false');
  });

  it('shows recognized text after key release', () => {
    render(
      <DictationOverlay
        snapshot={{
          state: 'completed',
          mode: 'direct',
          volumeLevel: 0,
          previewText: '今天下午把会议纪要发给大家。',
        }}
      />,
    );

    expect(screen.getByText('识别完成')).toBeInTheDocument();
    expect(screen.getByText('今天下午把会议纪要发给大家。')).toBeInTheDocument();
  });
});
