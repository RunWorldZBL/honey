import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LocalLlmRuntimeStatus } from '@honey/api-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listModels = vi.hoisted(() =>
  vi.fn(async () => [
    {
      id: 'test-asr',
      kind: 'asr',
      name: '测试 ASR 模型',
      engine: 'custom',
      status: 'installed',
      sizeLabel: '42 MB',
      recommendedTier: 'low',
      memoryHint: '测试内存提示',
      cpuHint: '测试 CPU 提示',
    },
    {
      id: 'test-llm',
      kind: 'llm',
      name: '测试人设模型',
      engine: 'custom',
      status: 'missing',
      sizeLabel: '1 GB',
      recommendedTier: 'default',
      memoryHint: '测试人设内存提示',
      cpuHint: '测试人设 CPU 提示',
    },
  ]),
);
const getLocalLlmRuntimeStatus = vi.hoisted(() => vi.fn(async (): Promise<LocalLlmRuntimeStatus> => ({ status: 'stopped' })));
const getRuntimeHealth = vi.hoisted(() => vi.fn(async () => ({
  service: 'honey-backend',
  mode: 'local',
  localDataPath: 'E:/honey-data',
  audioCapturePath: 'E:/honey-data/audio-captures',
  modelRoot: 'E:/honey-models/asr/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'E:/honey-models/llm',
  llamaServerPath: 'E:/honey-runtime/llama-server.exe',
  models: [
    {
      id: 'fun-asr-nano',
      name: 'Fun-ASR-Nano',
      kind: 'asr',
      engine: 'fun-asr-nano',
      status: 'missing',
      modelRoot: 'E:/honey-models/asr/Fun-ASR-Nano-GGUF',
      requiredFiles: [
        'Fun-ASR-Nano-Encoder-Adaptor.int8.onnx',
        'Fun-ASR-Nano-CTC.int8.onnx',
        'Fun-ASR-Nano-Decoder.q8_0.gguf',
        'tokens.txt',
      ],
      requiredFilesMissing: ['tokens.txt'],
    },
    {
      id: 'qwen3-0_6b',
      name: 'Qwen3 0.6B GGUF',
      kind: 'llm',
      engine: 'qwen3',
      status: 'missing',
      modelRoot: 'E:/honey-models/llm',
      requiredFiles: ['Qwen3-0.6B-Q8_0.gguf'],
      requiredFilesMissing: ['Qwen3-0.6B-Q8_0.gguf'],
    },
    {
      id: 'qwen3-4b',
      name: 'Qwen3 4B Instruct GGUF',
      kind: 'llm',
      engine: 'qwen3',
      status: 'installed',
      modelRoot: 'E:/honey-models/llm',
      requiredFiles: ['Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf'],
      requiredFilesMissing: [],
    },
  ],
  asr: {
    status: 'missing',
    commandConfigured: true,
    detail: 'fun_asr_nano_model_missing:tokens.txt',
  },
  personaRewrite: {
    status: 'fallback',
    commandConfigured: false,
    detail: 'local_persona_rewrite_fallback',
  },
  llmRuntime: {
    status: 'stopped',
  },
  issues: ['local_models_missing'],
})));
const startLocalLlmRuntime = vi.hoisted(() => vi.fn(async (input?: {
  modelPath?: string;
  modelAlias?: string;
  host?: string;
  port?: number;
}): Promise<LocalLlmRuntimeStatus> => ({
  status: 'running',
  modelPath: input?.modelPath,
  modelAlias: input?.modelAlias ?? 'qwen3-4b-instruct-q4_k_m',
  baseUrl: 'http://127.0.0.1:8080',
})));
const stopLocalLlmRuntime = vi.hoisted(() => vi.fn(async (): Promise<LocalLlmRuntimeStatus> => ({
  status: 'stopped',
  modelAlias: 'qwen3-4b-instruct-q4_k_m',
  baseUrl: 'http://127.0.0.1:8080',
})));

vi.mock('@/api/client', () => ({
  backendClient: {
    listModels,
    getRuntimeHealth,
    getLocalLlmRuntimeStatus,
    startLocalLlmRuntime,
    stopLocalLlmRuntime,
  },
}));

import { ModelsPage } from './ModelsPage';

describe('ModelsPage', () => {
  beforeEach(() => {
    listModels.mockClear();
    getRuntimeHealth.mockClear();
    getLocalLlmRuntimeStatus.mockClear();
    getLocalLlmRuntimeStatus.mockResolvedValue({ status: 'stopped' });
    startLocalLlmRuntime.mockClear();
    startLocalLlmRuntime.mockImplementation(async (input?: {
      modelPath?: string;
      modelAlias?: string;
      host?: string;
      port?: number;
    }) => ({
      status: 'running',
      modelPath: input?.modelPath,
      modelAlias: input?.modelAlias ?? 'qwen3-4b-instruct-q4_k_m',
      baseUrl: 'http://127.0.0.1:8080',
    }));
    stopLocalLlmRuntime.mockClear();
    stopLocalLlmRuntime.mockResolvedValue({
      status: 'stopped',
      modelAlias: 'qwen3-4b-instruct-q4_k_m',
      baseUrl: 'http://127.0.0.1:8080',
    });
  });

  it('loads local model inventory from the backend client', async () => {
    render(<ModelsPage />);

    expect(await screen.findByText('测试 ASR 模型')).toBeInTheDocument();
    expect(screen.getByText('测试人设模型')).toBeInTheDocument();
    expect(screen.queryByText('Fun-ASR-Nano')).not.toBeInTheDocument();
    expect(listModels).toHaveBeenCalledOnce();
  });

  it('controls the local LLM runtime from the model page', async () => {
    const user = userEvent.setup();

    render(<ModelsPage />);

    expect(await screen.findByText('人设模型运行状态')).toBeInTheDocument();
    expect(screen.getAllByText('未运行').length).toBeGreaterThan(0);
    expect(getLocalLlmRuntimeStatus).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: '启动默认模型' }));

    expect(startLocalLlmRuntime).toHaveBeenCalledWith();
    expect(await screen.findByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('qwen3-4b-instruct-q4_k_m')).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:8080')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '停止模型' }));

    expect(stopLocalLlmRuntime).toHaveBeenCalledOnce();
    expect(screen.getAllByText('未运行').length).toBeGreaterThan(0);

    getLocalLlmRuntimeStatus.mockResolvedValueOnce({
      status: 'running',
      modelAlias: 'qwen3-4b-instruct-q4_k_m',
      baseUrl: 'http://127.0.0.1:8080',
    });
    await user.click(screen.getByRole('button', { name: '刷新状态' }));

    expect(getLocalLlmRuntimeStatus).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('运行中')).toBeInTheDocument();
  });

  it('shows model download folders and required files', async () => {
    render(<ModelsPage />);

    expect(await screen.findByText('模型下载目录')).toBeInTheDocument();
    expect(screen.getByText('E:/honey-models/asr/Fun-ASR-Nano-GGUF')).toBeInTheDocument();
    expect(screen.getByText('E:/honey-models/llm')).toBeInTheDocument();
    expect(screen.getByText('Fun-ASR-Nano-Encoder-Adaptor.int8.onnx')).toBeInTheDocument();
    expect(screen.getByText('Qwen3-0.6B-Q8_0.gguf')).toBeInTheDocument();
    expect(screen.getByText('模型不会打进安装包；请按这里的目录下载或移动模型文件。')).toBeInTheDocument();
    expect(getRuntimeHealth).toHaveBeenCalledOnce();
  });

  it('starts the selected installed LLM model from the configured model directory', async () => {
    const user = userEvent.setup();

    render(<ModelsPage />);

    await screen.findByText('人设模型运行状态');
    await user.selectOptions(screen.getByLabelText('启动人设模型'), 'qwen3-4b');
    await user.click(screen.getByRole('button', { name: '启动所选模型' }));

    expect(startLocalLlmRuntime).toHaveBeenCalledWith({
      modelPath: 'E:/honey-models/llm/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
      modelAlias: 'qwen3-4b',
    });
    expect(await screen.findByText('qwen3-4b')).toBeInTheDocument();
  });
});
