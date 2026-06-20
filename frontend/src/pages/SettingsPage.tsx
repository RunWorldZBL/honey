import { FolderCog, Keyboard, LockKeyhole, MonitorCog, MousePointer2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, UpdateAppSettings } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { desktopShellClient, type DesktopWindowMode } from '@/api/desktopShell';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/StatusBadge';
import { TrayMenuPreview } from '@/components/TrayMenuPreview';
import { useDictationUiStore } from '@/stores/dictationUiStore';

const splitList = (value: string) => value
  .split(/[、,，]/)
  .map(item => item.trim())
  .filter(Boolean);

export function SettingsPage() {
  const setCurrentMode = useDictationUiStore(state => state.setCurrentMode);
  const setHotkey = useDictationUiStore(state => state.setHotkey);
  const setOverlayEnabled = useDictationUiStore(state => state.setOverlayEnabled);
  const setOverlayPosition = useDictationUiStore(state => state.setOverlayPosition);
  const setOutputRuntimeSettings = useDictationUiStore(state => state.setOutputRuntimeSettings);
  const setTriggerMode = useDictationUiStore(state => state.setTriggerMode);
  const setTriggerThresholdMs = useDictationUiStore(state => state.setTriggerThresholdMs);
  const setWindowMode = useDictationUiStore(state => state.setWindowMode);
  const [settings, setSettings] = useState<AppSettings>();
  const [settingsPatch, setSettingsPatch] = useState<UpdateAppSettings>({});
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let cancelled = false;

    void backendClient.getSettings().then((nextSettings) => {
      if (!cancelled) {
        setSettings(nextSettings);
        setSettingsPatch({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => {
    setSettings(current => current ? { ...current, [key]: value } : current);
    setSettingsPatch(current => ({ ...current, [key]: value }));
    setFeedback('');
  };

  const saveSettings = async () => {
    if (!settings) {
      return;
    }

    const savedSettings = await backendClient.updateSettings(settingsPatch);
    setSettings(savedSettings);
    setHotkey(savedSettings.hotkey);
    setTriggerMode(savedSettings.triggerMode);
    setTriggerThresholdMs(savedSettings.triggerThresholdMs);
    setCurrentMode(savedSettings.personaModeEnabled ? savedSettings.defaultMode : 'direct');
    setOverlayEnabled(savedSettings.overlayEnabled);
    setOverlayPosition(savedSettings.overlayPosition);
    await desktopShellClient.setTrayEnabled(savedSettings.trayEnabled);
    await desktopShellClient.setStartupEnabled(savedSettings.startupEnabled);
    setOutputRuntimeSettings({
      outputMethod: savedSettings.outputMethod,
      restoreClipboard: savedSettings.restoreClipboard,
      forcePasteApps: savedSettings.forcePasteApps,
    });
    setSettingsPatch({});
    setFeedback('设置已保存到本地后端');
  };

  const applyWindowMode = async (mode: DesktopWindowMode) => {
    try {
      await desktopShellClient.setWindowMode(mode);
      const savedSettings = await backendClient.updateSettings({ defaultWindowMode: mode });
      const { defaultWindowMode: _defaultWindowMode, ...remainingPatch } = settingsPatch;
      setSettings({
        ...savedSettings,
        ...remainingPatch,
      });
      setSettingsPatch(remainingPatch);
      setWindowMode(mode);
      setFeedback('窗口模式已切换');
    } catch {
      setFeedback('窗口模式切换失败');
    }
  };

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">本地配置</span>
          <h2>设置</h2>
          <p>第一版设置保存到本地后端，不写入系统热键、麦克风或剪贴板。</p>
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={saveSettings} disabled={!settings}>
            保存设置
          </button>
          <StatusBadge label="本地保存" tone="neutral" />
        </div>
      </section>
      {feedback ? <p className="inline-feedback">{feedback}</p> : null}

      <section className="settings-grid">
        <SettingsPanel title="热键与触发" icon={Keyboard}>
          <FormField id="settings-hotkey" label="键盘热键">
            <input
              id="settings-hotkey"
              value={settings?.hotkey ?? ''}
              onChange={(event) => updateSettings('hotkey', event.target.value)}
            />
          </FormField>
          <FormField id="settings-mouse" label="鼠标侧键">
            <input
              id="settings-mouse"
              value={settings?.mouseShortcut ?? ''}
              onChange={(event) => updateSettings('mouseShortcut', event.target.value)}
            />
          </FormField>
          <FormField id="settings-trigger" label="触发方式">
            <select
              id="settings-trigger"
              value={settings?.triggerMode ?? 'hold-to-talk'}
              onChange={(event) => updateSettings('triggerMode', event.target.value as AppSettings['triggerMode'])}
            >
              <option value="hold-to-talk">按住说话</option>
              <option value="click-to-toggle">单击开始/停止</option>
            </select>
          </FormField>
          <FormField id="settings-threshold" label="触发阈值">
            <input
              id="settings-threshold"
              type="number"
              value={settings?.triggerThresholdMs ?? 0}
              onChange={(event) => updateSettings('triggerThresholdMs', Number(event.target.value))}
            />
          </FormField>
        </SettingsPanel>

        <SettingsPanel title="输出方式" icon={MousePointer2}>
          <FormField id="settings-output" label="上屏方式">
            <select
              id="settings-output"
              value={settings?.outputMethod ?? 'paste'}
              onChange={(event) => updateSettings('outputMethod', event.target.value as AppSettings['outputMethod'])}
            >
              <option value="paste">剪贴板粘贴</option>
              <option value="typing">模拟键入</option>
            </select>
          </FormField>
          <div className="switch-grid">
            <label>
              <input
                type="checkbox"
                checked={settings?.restoreClipboard ?? false}
                onChange={(event) => updateSettings('restoreClipboard', event.target.checked)}
              />
              粘贴后恢复剪贴板
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.removeTrailingPunctuation ?? false}
                onChange={(event) => updateSettings('removeTrailingPunctuation', event.target.checked)}
              />
              清理末尾标点
            </label>
          </div>
          <FormField id="settings-force-paste" label="强制粘贴应用">
            <input
              id="settings-force-paste"
              value={settings?.forcePasteApps.join('、') ?? ''}
              onChange={(event) => updateSettings('forcePasteApps', splitList(event.target.value))}
            />
          </FormField>
        </SettingsPanel>

        <SettingsPanel title="识别与文本" icon={MonitorCog}>
          <FormField id="settings-language" label="识别语言">
            <select
              id="settings-language"
              value={settings?.language ?? 'zh-CN'}
              onChange={(event) => updateSettings('language', event.target.value as AppSettings['language'])}
            >
              <option value="auto">自动</option>
              <option value="zh-CN">中文普通话</option>
              <option value="en-US">英语</option>
              <option value="ja-JP">日语</option>
            </select>
          </FormField>
          <div className="switch-grid">
            <label>
              <input
                type="checkbox"
                checked={settings?.numericFormatting ?? false}
                onChange={(event) => updateSettings('numericFormatting', event.target.checked)}
              />
              数字格式化
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.overlayEnabled ?? false}
                onChange={(event) => updateSettings('overlayEnabled', event.target.checked)}
              />
              显示听写浮层
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.gpuAcceleration ?? false}
                onChange={(event) => updateSettings('gpuAcceleration', event.target.checked)}
              />
              GPU 加速占位
            </label>
          </div>
          <FormField id="settings-overlay-position" label="浮层位置">
            <select
              id="settings-overlay-position"
              value={settings?.overlayPosition ?? 'bottom-center'}
              onChange={(event) => updateSettings('overlayPosition', event.target.value as AppSettings['overlayPosition'])}
            >
              <option value="bottom-center">屏幕中下</option>
              <option value="bottom-left">左下</option>
              <option value="bottom-right">右下</option>
            </select>
          </FormField>
        </SettingsPanel>

        <SettingsPanel title="模型目录" icon={FolderCog}>
          <FormField
            id="settings-asr-model-root"
            label="语音转文字模型目录"
            hint="下载 Fun-ASR-Nano 后，将模型文件放到这个文件夹。"
          >
            <input
              id="settings-asr-model-root"
              value={settings?.asrModelRoot ?? ''}
              onChange={(event) => updateSettings('asrModelRoot', event.target.value)}
            />
          </FormField>
          <FormField
            id="settings-llm-model-root"
            label="本地大语言模型目录"
            hint="下载 GGUF 人设模型后，将文件放到这个文件夹。"
          >
            <input
              id="settings-llm-model-root"
              value={settings?.llmModelRoot ?? ''}
              onChange={(event) => updateSettings('llmModelRoot', event.target.value)}
            />
          </FormField>
          <FormField
            id="settings-llama-server-path"
            label="llama.cpp 运行时路径"
            hint="需要人设模式调用本地 GGUF 模型时，指向 llama-server 可执行文件。"
          >
            <input
              id="settings-llama-server-path"
              value={settings?.llamaServerPath ?? ''}
              onChange={(event) => updateSettings('llamaServerPath', event.target.value)}
            />
          </FormField>
        </SettingsPanel>

        <SettingsPanel title="隐私与启动" icon={ShieldCheck}>
          <FormField id="settings-data-path" label="本地数据目录">
            <input
              id="settings-data-path"
              value={settings?.localDataPath ?? ''}
              onChange={(event) => updateSettings('localDataPath', event.target.value)}
            />
          </FormField>
          <div className="switch-grid">
            <label>
              <input
                type="checkbox"
                checked={settings?.saveAudio ?? false}
                onChange={(event) => updateSettings('saveAudio', event.target.checked)}
              />
              保存录音
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.saveHistory ?? false}
                onChange={(event) => updateSettings('saveHistory', event.target.checked)}
              />
              保存历史记录
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.trayEnabled ?? false}
                onChange={(event) => updateSettings('trayEnabled', event.target.checked)}
              />
              启用托盘
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.startupEnabled ?? false}
                onChange={(event) => updateSettings('startupEnabled', event.target.checked)}
              />
              开机启动
            </label>
          </div>
        </SettingsPanel>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>窗口模式</h3>
            <p>启动时可打开完整控制台，也可直接进入轻量迷你窗口。</p>
          </div>
          <LockKeyhole size={20} />
        </div>
        <div className="button-row">
          <button
            type="button"
            className="segmented-button"
            data-active={settings?.defaultWindowMode === 'full'}
            onClick={() => void applyWindowMode('full')}
          >
            完整窗口
          </button>
          <button
            type="button"
            className="segmented-button"
            data-active={settings?.defaultWindowMode === 'mini'}
            onClick={() => void applyWindowMode('mini')}
          >
            迷你窗口
          </button>
        </div>
      </section>

      <TrayMenuPreview />
    </div>
  );
}

function SettingsPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Keyboard;
  children: React.ReactNode;
}) {
  return (
    <section className="panel form-grid">
      <div className="section-heading">
        <h3>{title}</h3>
        <Icon size={20} />
      </div>
      {children}
    </section>
  );
}
