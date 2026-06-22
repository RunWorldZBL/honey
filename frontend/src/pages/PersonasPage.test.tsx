import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPersonas = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'persona-test',
    name: '测试人设',
    triggerAliases: ['测试', '委婉'],
    description: '测试人设描述',
    prompt: '测试提示词',
    outputMode: 'typing',
    modelId: 'llm-test',
    enabled: true,
    keepContext: true,
  },
]));
const listModels = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'llm-test',
    kind: 'llm',
    name: '测试 LLM',
    engine: 'custom',
    status: 'installed',
    recommendedTier: 'default',
  },
]));
const getSettings = vi.hoisted(() => vi.fn(async () => ({
  defaultMode: 'direct',
  personaModeEnabled: false,
  hotkey: 'F9',
  mouseShortcut: '鼠标侧键 1',
  triggerMode: 'hold-to-talk',
  triggerThresholdMs: 0,
  outputMethod: 'paste',
  restoreClipboard: true,
  language: 'zh-CN',
  numericFormatting: true,
  removeTrailingPunctuation: false,
  saveAudio: true,
  saveHistory: true,
  localDataPath: 'D:/honey',
  asrModelRoot: 'D:/honey/models/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'D:/honey/models/llm',
  llamaServerPath: 'D:/honey/runtime/llama.cpp/llama-server.exe',
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
const clearPersonaMemory = vi.hoisted(() => vi.fn(async (personaId?: string) => ({ ok: true as const, personaId })));
const savePersona = vi.hoisted(() => vi.fn(async (persona) => persona));
const deletePersona = vi.hoisted(() => vi.fn(async (id: string) => ({ ok: true as const, id })));
const updateSettings = vi.hoisted(() => vi.fn(async (patch) => ({
  defaultMode: 'direct',
  personaModeEnabled: false,
  hotkey: 'F9',
  mouseShortcut: '鼠标侧键 1',
  triggerMode: 'hold-to-talk',
  triggerThresholdMs: 0,
  outputMethod: 'paste',
  restoreClipboard: true,
  language: 'zh-CN',
  numericFormatting: true,
  removeTrailingPunctuation: false,
  saveAudio: true,
  saveHistory: true,
  localDataPath: 'D:/honey',
  asrModelRoot: 'D:/honey/models/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'D:/honey/models/llm',
  llamaServerPath: 'D:/honey/runtime/llama.cpp/llama-server.exe',
  startupEnabled: false,
  trayEnabled: true,
  defaultWindowMode: 'full',
  overlayEnabled: true,
  overlayPosition: 'bottom-center',
  gpuAcceleration: false,
  forcePasteApps: [],
  autoEnterApps: [],
  punctuationCleanupApps: [],
  ...patch,
})));

vi.mock('@/api/client', () => ({
  backendClient: {
    listPersonas,
    listModels,
    getSettings,
    updateSettings,
    savePersona,
    deletePersona,
    clearPersonaMemory,
  },
}));

import { PersonasPage } from './PersonasPage';
import { useDictationUiStore } from '@/stores/dictationUiStore';

describe('PersonasPage', () => {
  beforeEach(() => {
    useDictationUiStore.setState({
      currentMode: 'direct',
      selectedPersonaId: undefined,
      overlaySnapshot: { state: 'idle', mode: 'direct', volumeLevel: 0 },
    });
    listPersonas.mockClear();
    listModels.mockClear();
    getSettings.mockClear();
    updateSettings.mockClear();
    savePersona.mockClear();
    deletePersona.mockClear();
    clearPersonaMemory.mockClear();
  });

  it('uses backend personas and keeps persona wording', async () => {
    render(<PersonasPage />);

    expect(screen.getByText('人设设置')).toBeInTheDocument();
    expect(await screen.findAllByText('测试人设')).toHaveLength(2);
    expect(useDictationUiStore.getState().selectedPersonaId).toBe('persona-test');
    expect(screen.getAllByText('测试人设描述')).toHaveLength(2);
    expect(screen.queryByText('智能改写')).not.toBeInTheDocument();
    expect(screen.getByLabelText('触发别名')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清除人设记忆' })).toBeInTheDocument();
    expect(listPersonas).toHaveBeenCalledOnce();
    expect(listModels).toHaveBeenCalledOnce();
  });

  it('clears selected persona memory through the backend client', async () => {
    const user = userEvent.setup();
    render(<PersonasPage />);

    expect(await screen.findAllByText('测试人设')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '清除人设记忆' }));

    expect(clearPersonaMemory).toHaveBeenCalledWith('persona-test');
    expect(screen.getByText('人设记忆已清除')).toBeInTheDocument();
  });

  it('saves persona edits through the backend client', async () => {
    const user = userEvent.setup();
    render(<PersonasPage />);

    await screen.findAllByText('测试人设');
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '项目负责人');
    await user.click(screen.getByRole('button', { name: '保存人设' }));

    expect(savePersona).toHaveBeenCalledWith(expect.objectContaining({
      id: 'persona-test',
      name: '项目负责人',
    }));
    expect(screen.getByText('人设已保存')).toBeInTheDocument();
  });

  it('creates a persona after deleting the last persona', async () => {
    const user = userEvent.setup();
    render(<PersonasPage />);

    await screen.findAllByText('测试人设');
    await user.click(screen.getByRole('button', { name: '删除人设' }));
    await user.click(screen.getByRole('button', { name: '新建人设' }));
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '会议纪要');
    await user.click(screen.getByRole('button', { name: '保存人设' }));

    expect(deletePersona).toHaveBeenCalledWith('persona-test');
    expect(savePersona).toHaveBeenCalledWith(expect.objectContaining({
      name: '会议纪要',
      outputMode: 'typing',
      enabled: true,
    }));
  });

  it('creates a new unsaved persona without binding actions to the previous persona', async () => {
    const user = userEvent.setup();
    render(<PersonasPage />);

    await screen.findAllByText('测试人设');
    await user.click(screen.getByRole('button', { name: '新建人设' }));

    expect(screen.getByRole('button', { name: '删除人设' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '清除人设记忆' })).toBeDisabled();

    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '会议纪要');
    await user.click(screen.getByRole('button', { name: '保存人设' }));

    expect(deletePersona).not.toHaveBeenCalled();
    expect(clearPersonaMemory).not.toHaveBeenCalled();
    expect(savePersona).toHaveBeenCalledWith(expect.objectContaining({
      name: '会议纪要',
    }));
  });

  it('clears a bound model from a persona', async () => {
    const user = userEvent.setup();
    render(<PersonasPage />);

    await screen.findAllByText('测试人设');
    await user.selectOptions(screen.getByLabelText('绑定模型'), '');
    await user.click(screen.getByRole('button', { name: '保存人设' }));

    expect(savePersona).toHaveBeenCalledWith(expect.objectContaining({
      id: 'persona-test',
      modelId: undefined,
    }));
  });

  it('toggles persona mode through settings and deletes selected personas', async () => {
    const user = userEvent.setup();
    render(<PersonasPage />);

    await screen.findAllByText('测试人设');
    await user.click(screen.getByRole('button', { name: '开启人设模式' }));
    expect(useDictationUiStore.getState().currentMode).toBe('persona');
    await user.click(screen.getByRole('button', { name: '删除人设' }));

    expect(updateSettings).toHaveBeenCalledWith({ personaModeEnabled: true });
    expect(deletePersona).toHaveBeenCalledWith('persona-test');
  });
});
