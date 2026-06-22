import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTranscriptRecords = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'record-home',
    createdAt: '2026-06-20T00:00:00+08:00',
    sourceApp: '测试应用',
    mode: 'direct',
    rawText: '首页后端原文',
    outputText: '首页后端最近结果',
    durationMs: 1000,
    latencyMs: 120,
    status: 'completed',
  },
]));

const listModels = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'model-home',
    kind: 'asr',
    name: '首页后端语音模型',
    engine: 'custom',
    status: 'installed',
    recommendedTier: 'low',
  },
]));

const getSettings = vi.hoisted(() => vi.fn(async () => ({
  defaultMode: 'direct',
  personaModeEnabled: false,
  hotkey: 'F8',
  mouseShortcut: '鼠标侧键 2',
  triggerMode: 'hold-to-talk',
  triggerThresholdMs: 0,
  outputMethod: 'paste',
  restoreClipboard: true,
  language: 'zh-CN',
  numericFormatting: true,
  removeTrailingPunctuation: false,
  saveAudio: true,
  saveHistory: true,
  localDataPath: 'D:/honey-test',
  asrModelRoot: 'D:/honey-test/models/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'D:/honey-test/models/llm',
  llamaServerPath: 'D:/honey-test/runtime/llama.cpp/llama-server.exe',
  startupEnabled: false,
  trayEnabled: true,
  defaultWindowMode: 'full',
  overlayEnabled: true,
  overlayPosition: 'bottom-center',
  gpuAcceleration: false,
  forcePasteApps: [],
  autoEnterApps: [],
  punctuationCleanupApps: [],
})));

const listTrayActions = vi.hoisted(() => vi.fn(async () => []));

vi.mock('@/api/client', () => ({
  backendClient: {
    listTranscriptRecords,
    listModels,
    getSettings,
    listTrayActions,
  },
}));

import { HomePage } from './HomePage';

describe('HomePage', () => {
  beforeEach(() => {
    listTranscriptRecords.mockClear();
    listModels.mockClear();
    getSettings.mockClear();
    listTrayActions.mockClear();
  });

  it('loads dashboard metrics from the backend client', async () => {
    render(<HomePage onRouteChange={vi.fn()} />);

    expect(await screen.findByText('F8')).toBeInTheDocument();
    expect(screen.getByText('鼠标侧键 2')).toBeInTheDocument();
    expect(screen.getByText('首页后端语音模型')).toBeInTheDocument();
    expect(screen.getAllByText('首页后端最近结果').length).toBeGreaterThan(0);
    expect(screen.getByText('原文：首页后端原文')).toBeInTheDocument();
    expect(listTranscriptRecords).toHaveBeenCalledOnce();
    expect(listModels).toHaveBeenCalledOnce();
    expect(getSettings).toHaveBeenCalledOnce();
  });
});
