import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSettings = vi.hoisted(() => vi.fn(async () => ({
  defaultMode: 'direct',
  personaModeEnabled: false,
  hotkey: 'F9',
  mouseShortcut: '鼠标侧键 3',
  triggerMode: 'click-to-toggle',
  triggerThresholdMs: 240,
  outputMethod: 'typing',
  restoreClipboard: false,
  language: 'en-US',
  numericFormatting: false,
  removeTrailingPunctuation: true,
  saveAudio: false,
  saveHistory: true,
  localDataPath: 'E:/honey-data',
  asrModelRoot: 'E:/honey-models/asr/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'E:/honey-models/llm',
  llamaServerPath: 'E:/honey-runtime/llama-server.exe',
  startupEnabled: true,
  trayEnabled: false,
  defaultWindowMode: 'mini',
  overlayEnabled: false,
  overlayPosition: 'bottom-right',
  gpuAcceleration: true,
  forcePasteApps: ['测试应用'],
  autoEnterApps: [],
  punctuationCleanupApps: [],
})));

const listTrayActions = vi.hoisted(() => vi.fn(async () => []));
const setWindowMode = vi.hoisted(() => vi.fn(async (mode: 'full' | 'mini') => ({ ok: true as const, mode })));
const updateSettings = vi.hoisted(() => vi.fn(async (patch) => ({
  defaultMode: 'direct',
  personaModeEnabled: false,
  hotkey: 'F9',
  mouseShortcut: '鼠标侧键 3',
  triggerMode: 'click-to-toggle',
  triggerThresholdMs: 240,
  outputMethod: 'typing',
  restoreClipboard: false,
  language: 'en-US',
  numericFormatting: false,
  removeTrailingPunctuation: true,
  saveAudio: false,
  saveHistory: true,
  localDataPath: 'E:/honey-data',
  asrModelRoot: 'E:/honey-models/asr/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'E:/honey-models/llm',
  llamaServerPath: 'E:/honey-runtime/llama-server.exe',
  startupEnabled: true,
  trayEnabled: false,
  defaultWindowMode: 'mini',
  overlayEnabled: false,
  overlayPosition: 'bottom-right',
  gpuAcceleration: true,
  forcePasteApps: ['测试应用'],
  autoEnterApps: [],
  punctuationCleanupApps: [],
  ...patch,
})));

vi.mock('@/api/client', () => ({
  backendClient: {
    getSettings,
    updateSettings,
    listTrayActions,
  },
}));
vi.mock('@/api/desktopShell', () => ({
  desktopShellClient: {
    setWindowMode,
  },
}));

import { SettingsPage } from './SettingsPage';
import { useDictationUiStore } from '@/stores/dictationUiStore';

describe('SettingsPage', () => {
  beforeEach(() => {
    useDictationUiStore.setState(state => ({
      ...state,
      windowMode: 'mini',
      currentMode: 'direct',
      overlayEnabled: false,
      triggerMode: 'click-to-toggle',
      outputMethod: 'paste',
      forcePasteApps: [],
    }));
    getSettings.mockClear();
    updateSettings.mockClear();
    listTrayActions.mockClear();
    setWindowMode.mockClear();
  });

  it('loads setting defaults from the backend client', async () => {
    render(<SettingsPage />);

    expect(await screen.findByDisplayValue('F9')).toBeInTheDocument();
    expect(screen.getByDisplayValue('鼠标侧键 3')).toBeInTheDocument();
    expect(screen.getByDisplayValue('240')).toBeInTheDocument();
    expect(screen.getByDisplayValue('E:/honey-data')).toBeInTheDocument();
    expect(screen.getByDisplayValue('E:/honey-models/asr/Fun-ASR-Nano-GGUF')).toBeInTheDocument();
    expect(screen.getByDisplayValue('E:/honey-models/llm')).toBeInTheDocument();
    expect(screen.getByDisplayValue('E:/honey-runtime/llama-server.exe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '迷你窗口' })).toHaveAttribute('data-active', 'true');
    expect(getSettings).toHaveBeenCalledOnce();
  });

  it('saves edited local settings through the backend client', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.clear(screen.getByLabelText('键盘热键'));
    await user.type(screen.getByLabelText('键盘热键'), 'F10');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(updateSettings).toHaveBeenCalledWith({
      hotkey: 'F10',
    });
    expect(screen.getByText('设置已保存到本地后端')).toBeInTheDocument();
  });

  it('saves edited model directory settings through the backend client', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.clear(screen.getByLabelText('本地大语言模型目录'));
    await user.type(screen.getByLabelText('本地大语言模型目录'), 'F:/HoneyModels/llm');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(updateSettings).toHaveBeenCalledWith({
      llmModelRoot: 'F:/HoneyModels/llm',
    });
  });

  it('syncs saved output settings to the dictation runtime state', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(useDictationUiStore.getState().outputMethod).toBe('typing');
    expect(useDictationUiStore.getState().forcePasteApps).toEqual(['测试应用']);
  });

  it('syncs saved hotkey settings to the dictation runtime state', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.clear(screen.getByLabelText('键盘热键'));
    await user.type(screen.getByLabelText('键盘热键'), 'F10');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(useDictationUiStore.getState()).toMatchObject({
      hotkey: 'F10',
    });
  });

  it('syncs saved trigger mode to the dictation runtime state', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.selectOptions(screen.getByLabelText('触发方式'), 'hold-to-talk');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(useDictationUiStore.getState()).toMatchObject({
      triggerMode: 'hold-to-talk',
    });
  });

  it('syncs saved overlay visibility to the dictation runtime state', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.click(screen.getByLabelText('显示听写浮层'));
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(useDictationUiStore.getState()).toMatchObject({
      overlayEnabled: true,
    });
  });

  it('syncs saved overlay position to the dictation runtime state', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.selectOptions(screen.getByLabelText('浮层位置'), 'bottom-left');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(useDictationUiStore.getState()).toMatchObject({
      overlayPosition: 'bottom-left',
    });
  });

  it('applies desktop window mode immediately through the desktop shell', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.click(screen.getByRole('button', { name: '完整窗口' }));

    expect(setWindowMode).toHaveBeenCalledWith('full');
    expect(updateSettings).toHaveBeenCalledWith({
      defaultWindowMode: 'full',
    });
    expect(useDictationUiStore.getState().windowMode).toBe('full');
    expect(screen.getByText('窗口模式已切换')).toBeInTheDocument();
  });

  it('does not save window mode when the desktop shell rejects the change', async () => {
    const user = userEvent.setup();
    setWindowMode.mockRejectedValueOnce(new Error('window mode failed'));
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.click(screen.getByRole('button', { name: '完整窗口' }));

    expect(setWindowMode).toHaveBeenCalledWith('full');
    expect(updateSettings).not.toHaveBeenCalledWith({
      defaultWindowMode: 'full',
    });
    expect(await screen.findByText('窗口模式切换失败')).toBeInTheDocument();
  });

  it('keeps unsaved setting edits visible after applying window mode immediately', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByDisplayValue('F9');
    await user.clear(screen.getByLabelText('键盘热键'));
    await user.type(screen.getByLabelText('键盘热键'), 'F10');
    await user.click(screen.getByRole('button', { name: '完整窗口' }));

    expect(screen.getByDisplayValue('F10')).toBeInTheDocument();
    expect(updateSettings).toHaveBeenCalledWith({
      defaultWindowMode: 'full',
    });

    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(updateSettings).toHaveBeenCalledWith({
      hotkey: 'F10',
    });
  });
});
