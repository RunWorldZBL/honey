import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MiniWindow } from './MiniWindow';

describe('MiniWindow', () => {
  it('shows honey identity, latest result, and open full action', () => {
    const onOpenFull = vi.fn();

    render(
      <MiniWindow
        mode="direct"
        asrStatus="installed"
        latestText="刚才的语音已经转成文字。"
        onOpenFull={onOpenFull}
      />,
    );

    expect(screen.getByText('honey')).toBeInTheDocument();
    expect(screen.getByText('甜美')).toBeInTheDocument();
    expect(screen.getByText('刚才的语音已经转成文字。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开完整窗口' })).toBeInTheDocument();
  });
});
