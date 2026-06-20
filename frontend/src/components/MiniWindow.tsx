import { Maximize2, Settings } from 'lucide-react';
import type { DictationMode, ModelStatus } from '@honey/api-contracts';

import { StatusBadge } from './StatusBadge';

const modeLabel: Record<DictationMode, string> = {
  direct: '直接转写',
  persona: '人设模式',
};

export function MiniWindow({
  mode,
  asrStatus,
  latestText,
  onOpenFull,
}: {
  mode: DictationMode;
  asrStatus: ModelStatus;
  latestText?: string;
  onOpenFull: () => void;
}) {
  return (
    <section className="mini-window" aria-label="honey 迷你窗口">
      <header className="mini-window__header">
        <div>
          <strong>honey</strong>
          <span>甜美</span>
        </div>
        <button className="icon-button" type="button" aria-label="打开设置">
          <Settings size={16} />
        </button>
      </header>

      <div className="mini-window__status">
        <StatusBadge label={modeLabel[mode]} tone={mode === 'direct' ? 'success' : 'info'} />
        <StatusBadge value={asrStatus} />
      </div>

      <p className="mini-window__latest">{latestText || '还没有新的语音转文字结果。'}</p>

      <button className="primary-button mini-window__button" type="button" onClick={onOpenFull}>
        <Maximize2 size={16} />
        打开完整窗口
      </button>
    </section>
  );
}
