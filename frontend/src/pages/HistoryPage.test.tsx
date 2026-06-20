import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const historyStore = vi.hoisted(() => ({
  records: [
    {
      id: 'rec-test',
      createdAt: '2026-06-19T10:08:00+08:00',
      sourceApp: '测试输入框',
      mode: 'persona',
      roleId: 'persona-test',
      rawText: '怎么今天加班啊？',
      outputText: '测试后端历史输出',
      durationMs: 3600,
      latencyMs: 1880,
      status: 'completed',
    },
  ],
  personas: [
    {
      id: 'persona-test',
      name: '测试人设',
      triggerAliases: ['测试'],
      description: '测试描述',
      prompt: '测试提示词',
      outputMode: 'typing',
      enabled: true,
      keepContext: true,
    },
  ],
}));

const listTranscriptRecords = vi.hoisted(() => vi.fn(async () => historyStore.records));
const listPersonas = vi.hoisted(() => vi.fn(async () => historyStore.personas));
const deleteTranscriptRecord = vi.hoisted(() => vi.fn(async (id: string) => {
  historyStore.records = historyStore.records.filter(record => record.id !== id);
  return { ok: true as const, id };
}));

vi.mock('@/api/client', () => ({
  backendClient: {
    listTranscriptRecords,
    listPersonas,
    deleteTranscriptRecord,
  },
}));

import { HistoryPage } from './HistoryPage';
import { useDictationUiStore } from '@/stores/dictationUiStore';

describe('HistoryPage', () => {
  beforeEach(() => {
    useDictationUiStore.setState({
      latestCompletedRecord: undefined,
    } as Parameters<typeof useDictationUiStore.setState>[0]);
    historyStore.records = [
      {
        id: 'rec-test',
        createdAt: '2026-06-19T10:08:00+08:00',
        sourceApp: '测试输入框',
        mode: 'persona',
        roleId: 'persona-test',
        rawText: '怎么今天加班啊？',
        outputText: '测试后端历史输出',
        durationMs: 3600,
        latencyMs: 1880,
        status: 'completed',
      },
    ];
    listTranscriptRecords.mockClear();
    listPersonas.mockClear();
    deleteTranscriptRecord.mockClear();
  });

  it('renders records and persona labels from the backend client', async () => {
    render(<HistoryPage />);

    expect(screen.getByText('历史记录')).toBeInTheDocument();
    expect(await screen.findByText('测试后端历史输出')).toBeInTheDocument();
    expect(screen.getByText('测试人设')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索原文或输出文本')).toBeInTheDocument();
    expect(listTranscriptRecords).toHaveBeenCalledOnce();
    expect(listPersonas).toHaveBeenCalledOnce();
  });

  it('confirms deletion before removing a backend record', async () => {
    const user = userEvent.setup();
    render(<HistoryPage />);

    const record = (await screen.findByText('测试后端历史输出')).closest('article');
    expect(record).not.toBeNull();

    await user.click(within(record as HTMLElement).getByRole('button', { name: '删除' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    expect(deleteTranscriptRecord).toHaveBeenCalledWith('rec-test');
    expect(screen.queryByText('测试后端历史输出')).not.toBeInTheDocument();
  });

  it('prepends a newly completed dictation record while the page is open', async () => {
    render(<HistoryPage />);

    expect(await screen.findByText('测试后端历史输出')).toBeInTheDocument();

    useDictationUiStore.getState().publishCompletedRecord?.({
      id: 'rec-live',
      createdAt: '2026-06-20T12:00:00+08:00',
      sourceApp: '当前输入框',
      mode: 'direct',
      rawText: '刚说完的新语音',
      outputText: '刚说完的新语音',
      durationMs: 1200,
      latencyMs: 0,
      status: 'completed',
    });

    expect(await screen.findByText('刚说完的新语音')).toBeInTheDocument();
    expect(screen.getByText('2 条')).toBeInTheDocument();
  });
});
