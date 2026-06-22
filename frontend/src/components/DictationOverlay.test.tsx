import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DictationOverlay } from './DictationOverlay';

describe('DictationOverlay', () => {
  it('renders a tight live waveform while listening', () => {
    render(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.8 }}
      />,
    );

    expect(screen.getByTestId('voice-status-bar')).toHaveAttribute('data-layout', 'audio-tight');
    expect(screen.getByTestId('voice-waveform')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('voice-waveform')).toHaveAttribute('data-anchor', 'middle');
    expect(screen.queryByText('正在听')).not.toBeInTheDocument();
    expect(screen.queryByText('直接转写')).not.toBeInTheDocument();
  });

  it('keeps waveform bars centered around the middle line', () => {
    render(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.7 }}
      />,
    );

    const barHeights = Array.from(screen.getByTestId('voice-waveform').querySelectorAll('span')).map((node) =>
      Number.parseFloat((node as HTMLElement).style.getPropertyValue('--wave-height') || '0'),
    );

    expect(barHeights[Math.floor(barHeights.length / 2)]).toBeGreaterThan(barHeights[0]);
    expect(barHeights[Math.floor(barHeights.length / 2)]).toBeGreaterThan(barHeights[barHeights.length - 1]);
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

  it('uses the same micro capsule layout across listening and result states', () => {
    const { rerender } = render(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.8 }}
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('data-size', 'micro');

    rerender(
      <DictationOverlay
        snapshot={{
          state: 'completed',
          mode: 'direct',
          volumeLevel: 0,
          previewText: '今天下午把会议纪要发给大家。',
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('data-size', 'micro');
  });

  it('passes captured volume into the voice visualizer data', () => {
    const { rerender } = render(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.2 }}
      />,
    );
    const lowPeak = Number(screen.getByTestId('voice-waveform').getAttribute('data-peak'));

    rerender(
      <DictationOverlay
        snapshot={{ state: 'listening', mode: 'direct', volumeLevel: 0.9 }}
      />,
    );
    const highPeak = Number(screen.getByTestId('voice-waveform').getAttribute('data-peak'));

    expect(highPeak).toBeGreaterThan(lowPeak);
  });

  it('keeps waveform inactive when silent', () => {
    render(
      <DictationOverlay
        snapshot={{ state: 'silent', mode: 'direct', volumeLevel: 0 }}
      />,
    );

    expect(screen.getByTestId('voice-waveform')).toHaveAttribute('data-active', 'false');
  });

  it('shows a compact recognizing message after key release', () => {
    render(
      <DictationOverlay
        snapshot={{
          state: 'recognizing',
          mode: 'direct',
          volumeLevel: 0,
        }}
      />,
    );

    expect(screen.getByText('正在识别中…')).toBeInTheDocument();
    expect(screen.queryByTestId('voice-waveform')).not.toBeInTheDocument();
  });

  it('shows recognized text after transcription finishes', () => {
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

    expect(screen.getByText('今天下午把会议纪要发给大家。')).toBeInTheDocument();
  });

  it('renders result text in a fixed-width single line container', () => {
    render(
      <DictationOverlay
        snapshot={{
          state: 'inserted',
          mode: 'direct',
          volumeLevel: 0,
          previewText: '这是一段很长很长很长很长的识别结果文本，用来验证浮层会在固定尺寸内用省略方式处理超出的部分。',
        }}
      />,
    );

    expect(screen.getByTestId('dictation-overlay-text')).toHaveClass('dictation-overlay__text');
    expect(screen.getByTestId('voice-status-bar')).toHaveAttribute('data-text-overflow', 'ellipsis');
  });

});
