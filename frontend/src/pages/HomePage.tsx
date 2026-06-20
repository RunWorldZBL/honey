import { ClipboardCopy, History, Keyboard, MousePointer2, Radio, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, ModelProfile, TranscriptRecord } from '@honey/api-contracts';
import type { AppRouteId } from '@/app/navigation';

import { backendClient } from '@/api/client';
import { DictationOverlay } from '@/components/DictationOverlay';
import { MiniWindow } from '@/components/MiniWindow';
import { StatusBadge } from '@/components/StatusBadge';
import { TrayMenuPreview } from '@/components/TrayMenuPreview';
import { overlaySnapshots } from '@/data/mockData';
import { useDictationUiStore } from '@/stores/dictationUiStore';

export function HomePage({ onRouteChange }: { onRouteChange: (route: AppRouteId) => void }) {
  const [latestRecord, setLatestRecord] = useState<TranscriptRecord>();
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [settings, setSettings] = useState<AppSettings>();
  const installedAsr = models.find((model) => model.kind === 'asr' && model.status === 'installed');
  const { overlaySnapshot, setOverlaySnapshot, setWindowMode } = useDictationUiStore();

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      backendClient.listTranscriptRecords(),
      backendClient.listModels(),
      backendClient.getSettings(),
    ]).then(([records, nextModels, nextSettings]) => {
      if (cancelled) {
        return;
      }

      setLatestRecord(records[0]);
      setModels(nextModels);
      setSettings(nextSettings);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-stack">
      <section className="dashboard-grid">
        <div className="hero-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">当前工作流</span>
              <h2>直接转写是默认模式</h2>
              <p>把光标放在任意输入框，按住热键说话，松开后进入识别并写入历史记录。</p>
              <p className="inline-hint">当前 UI mock 支持在应用窗口内按住 CapsLock 预览听写浮层流程。</p>
            </div>
            <StatusBadge value="direct" />
          </div>

          <div className="metric-row">
            <div>
              <Keyboard size={18} />
              <span>热键</span>
              <strong>{settings?.hotkey ?? '读取中'}</strong>
            </div>
            <div>
              <MousePointer2 size={18} />
              <span>鼠标快捷键</span>
              <strong>{settings?.mouseShortcut ?? '读取中'}</strong>
            </div>
            <div>
              <Radio size={18} />
              <span>语音转文字模型</span>
              <strong>{installedAsr?.name ?? '未选择'}</strong>
            </div>
            <div>
              <Sparkles size={18} />
              <span>人设模式</span>
              <strong>{settings?.personaModeEnabled ? '已开启' : '默认关闭'}</strong>
            </div>
          </div>
        </div>

        <MiniWindow
          mode="direct"
          asrStatus="installed"
          latestText={latestRecord?.outputText}
          onOpenFull={() => setWindowMode('full')}
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>按键听写浮层</h2>
            <p>按住热键时显示实时音量反馈，松开后显示识别结果。</p>
          </div>
          <StatusBadge label="已接入" tone="success" />
        </div>
        <div className="overlay-preview">
          <div className="button-row">
            {overlaySnapshots.filter((item) => item.state !== 'idle').map((snapshot) => (
              <button
                key={snapshot.state}
                type="button"
                className="secondary-button"
                data-active={overlaySnapshot.state === snapshot.state}
                onClick={() => setOverlaySnapshot(snapshot)}
              >
                {snapshot.state}
              </button>
            ))}
          </div>
          <div className="overlay-preview__stage">
            <DictationOverlay snapshot={overlaySnapshot.state === 'idle' ? overlaySnapshots[1] : overlaySnapshot} />
          </div>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid--wide">
        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>最近一次结果</h2>
              <p>本地历史会同时保存原始识别和最终上屏文本。</p>
            </div>
            <StatusBadge value={latestRecord?.status ?? 'completed'} />
          </div>
          {latestRecord ? (
            <div className="record-preview">
              <small>{latestRecord.sourceApp} · {new Date(latestRecord.createdAt).toLocaleString('zh-CN')}</small>
              <strong>{latestRecord.outputText}</strong>
              <p>原文：{latestRecord.rawText}</p>
            </div>
          ) : (
            <div className="record-preview">
              <strong>暂无历史记录</strong>
              <p>完成第一次听写后，这里会显示最近一次上屏文本。</p>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>快捷入口</h2>
              <p>所有 CapsWriter 参考能力都在 UI 中有入口，后续再逐项接真实后端。</p>
            </div>
          </div>
          <div className="quick-actions">
            <button type="button" onClick={() => onRouteChange('history')}>
              <History size={18} />
              历史记录
            </button>
            <button type="button" onClick={() => onRouteChange('hotwords')}>
              <ClipboardCopy size={18} />
              管理热词
            </button>
            <button type="button" onClick={() => onRouteChange('personas')}>
              <Sparkles size={18} />
              人设设置
            </button>
            <button type="button" onClick={() => onRouteChange('settings')}>
              <Keyboard size={18} />
              热键设置
            </button>
          </div>
        </div>
      </section>

      <TrayMenuPreview />
    </div>
  );
}
