import type { DictationMode, ModelStatus, RecordStatus } from '@honey/api-contracts';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const statusLabels: Record<ModelStatus | RecordStatus | DictationMode, { label: string; tone: BadgeTone }> = {
  installed: { label: '已就绪', tone: 'success' },
  missing: { label: '未安装', tone: 'warning' },
  loading: { label: '加载中', tone: 'info' },
  error: { label: '错误', tone: 'danger' },
  disabled: { label: '已关闭', tone: 'neutral' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'neutral' },
  direct: { label: '直接转写', tone: 'success' },
  persona: { label: '人设模式', tone: 'info' },
};

export function StatusBadge({
  value,
  label,
  tone,
}: {
  value?: ModelStatus | RecordStatus | DictationMode;
  label?: string;
  tone?: BadgeTone;
}) {
  const resolved = value ? statusLabels[value] : { label: label ?? '未知', tone: tone ?? 'neutral' };

  return <span className={`status-badge status-badge--${tone ?? resolved.tone}`}>{label ?? resolved.label}</span>;
}
