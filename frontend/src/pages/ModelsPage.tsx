import { Cpu, FolderOpen, HardDriveDownload, Play, RefreshCw, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LocalLlmRuntimeStatus, LocalModelInventoryItem, ModelProfile, RuntimeHealth } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { desktopShellClient } from '@/api/desktopShell';
import { StatusBadge } from '@/components/StatusBadge';

const tierLabel = {
  low: '低配',
  default: '默认',
  quality: '质量',
  experimental: '实验',
};

const runtimeStatusMeta: Record<LocalLlmRuntimeStatus['status'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  stopped: { label: '未运行', tone: 'neutral' },
  starting: { label: '启动中', tone: 'info' },
  running: { label: '运行中', tone: 'success' },
  error: { label: '异常', tone: 'danger' },
};

const joinModelPath = (modelRoot: string, fileName: string) =>
  `${modelRoot}${/[\\/]$/.test(modelRoot) ? '' : '/'}${fileName}`;

export function ModelsPage() {
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth>();
  const [llmRuntime, setLlmRuntime] = useState<LocalLlmRuntimeStatus>({ status: 'stopped' });
  const [selectedLlmModelId, setSelectedLlmModelId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRuntimeBusy, setIsRuntimeBusy] = useState(false);
  const [isModelDirectoryBusy, setIsModelDirectoryBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      backendClient.listModels(),
      backendClient.getRuntimeHealth(),
      backendClient.getLocalLlmRuntimeStatus(),
    ])
      .then(([nextModels, nextRuntimeHealth, runtimeStatus]) => {
        if (!cancelled) {
          setModels(nextModels);
          setRuntimeHealth(nextRuntimeHealth);
          setLlmRuntime(runtimeStatus);
          setSelectedLlmModelId(current => current || nextRuntimeHealth.models.find(model =>
            model.kind === 'llm'
            && model.status === 'installed'
            && model.requiredFiles.length > 0,
          )?.id || '');
          setErrorMessage(undefined);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('模型清单读取失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshModelState = async () => {
    setIsLoading(true);
    try {
      const [nextModels, nextRuntimeHealth, runtimeStatus] = await Promise.all([
        backendClient.listModels(),
        backendClient.getRuntimeHealth(),
        backendClient.getLocalLlmRuntimeStatus(),
      ]);
      setModels(nextModels);
      setRuntimeHealth(nextRuntimeHealth);
      setLlmRuntime(runtimeStatus);
      setSelectedLlmModelId(current =>
        nextRuntimeHealth.models.some(model =>
          model.id === current
          && model.kind === 'llm'
          && model.status === 'installed'
          && model.requiredFiles.length > 0,
        )
          ? current
          : nextRuntimeHealth.models.find(model =>
            model.kind === 'llm'
            && model.status === 'installed'
            && model.requiredFiles.length > 0,
          )?.id || '',
      );
      setErrorMessage(undefined);
    } catch {
      setErrorMessage('模型清单读取失败');
    } finally {
      setIsLoading(false);
    }
  };

  const chooseModelDirectory = async (kind: 'asr' | 'llm') => {
    setIsModelDirectoryBusy(true);
    try {
      const directory = await desktopShellClient.pickDirectory();
      if (!directory) {
        return;
      }

      await backendClient.updateSettings(kind === 'asr'
        ? { asrModelRoot: directory }
        : { llmModelRoot: directory });
      await refreshModelState();
      setErrorMessage(undefined);
    } catch {
      setErrorMessage(kind === 'asr' ? '语音转文字模型目录保存失败' : '人设模型目录保存失败');
    } finally {
      setIsModelDirectoryBusy(false);
    }
  };

  const refreshRuntimeStatus = async () => {
    setIsRuntimeBusy(true);
    try {
      setLlmRuntime(await backendClient.getLocalLlmRuntimeStatus());
      setErrorMessage(undefined);
    } catch {
      setErrorMessage('人设模型运行状态读取失败');
    } finally {
      setIsRuntimeBusy(false);
    }
  };

  const startRuntime = async () => {
    setIsRuntimeBusy(true);
    try {
      setLlmRuntime(await backendClient.startLocalLlmRuntime());
      setErrorMessage(undefined);
    } catch {
      setErrorMessage('人设模型启动失败');
    } finally {
      setIsRuntimeBusy(false);
    }
  };

  const startSelectedRuntime = async () => {
    const selectedModel = runtimeHealth?.models.find(model =>
      model.id === selectedLlmModelId
      && model.kind === 'llm'
      && model.status === 'installed'
      && model.requiredFiles.length > 0,
    );
    if (!selectedModel) {
      setErrorMessage('请先下载并选择已安装的人设模型');
      return;
    }

    setIsRuntimeBusy(true);
    try {
      setLlmRuntime(await backendClient.startLocalLlmRuntime({
        modelPath: joinModelPath(selectedModel.modelRoot, selectedModel.requiredFiles[0]!),
        modelAlias: selectedModel.id,
      }));
      setErrorMessage(undefined);
    } catch {
      setErrorMessage('人设模型启动失败');
    } finally {
      setIsRuntimeBusy(false);
    }
  };

  const stopRuntime = async () => {
    setIsRuntimeBusy(true);
    try {
      setLlmRuntime(await backendClient.stopLocalLlmRuntime());
      setErrorMessage(undefined);
    } catch {
      setErrorMessage('人设模型停止失败');
    } finally {
      setIsRuntimeBusy(false);
    }
  };

  const asrModels = models.filter((model) => model.kind === 'asr');
  const llmModels = models.filter((model) => model.kind === 'llm');
  const installedLlmInventory = runtimeHealth?.models.filter(model =>
    model.kind === 'llm'
    && model.status === 'installed'
    && model.requiredFiles.length > 0,
  ) ?? [];
  const runtimeStatus = runtimeStatusMeta[llmRuntime.status];

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">本地模型</span>
          <h2>模型</h2>
          <p>ASR 在界面中称为“语音转文字模型”；LLM 只在人设模式开启时使用。</p>
        </div>
        <button type="button" className="primary-button" onClick={refreshModelState} disabled={isLoading || isModelDirectoryBusy}>
          <RefreshCw size={16} />
          刷新清单
        </button>
      </section>

      {isLoading ? (
        <section className="notice-panel">
          <Cpu size={20} />
          <div>
            <strong>正在读取本地模型清单</strong>
            <span>会扫描本机模型目录，并同步语音转文字模型状态。</span>
          </div>
        </section>
      ) : null}

      {errorMessage ? (
        <section className="notice-panel">
          <Cpu size={20} />
          <div>
            <strong>{errorMessage}</strong>
            <span>请确认本地后端服务或 Tauri 命令可用。</span>
          </div>
        </section>
      ) : null}

      <ModelDirectoryPanel
        health={runtimeHealth}
        isBusy={isModelDirectoryBusy}
        onPickAsrDirectory={() => void chooseModelDirectory('asr')}
        onPickLlmDirectory={() => void chooseModelDirectory('llm')}
      />

      <section className="panel runtime-panel">
        <div className="section-heading runtime-panel__heading">
          <div>
            <h3>人设模型运行状态</h3>
            <p>运行中的本地 LLM 会用于人设模式。</p>
          </div>
          <StatusBadge label={runtimeStatus.label} tone={runtimeStatus.tone} />
        </div>
        <div className="runtime-panel__body">
          <div className="runtime-panel__meta">
            <span>模型别名</span>
            <strong>{llmRuntime.modelAlias ?? '未运行'}</strong>
          </div>
          <div className="runtime-panel__meta">
            <span>服务地址</span>
            <strong>{llmRuntime.baseUrl ?? '未运行'}</strong>
          </div>
          <div className="runtime-panel__meta">
            <span>进程</span>
            <strong>{llmRuntime.pid ? String(llmRuntime.pid) : '未运行'}</strong>
          </div>
        </div>
        <div className="runtime-panel__selector">
          <label htmlFor="runtime-llm-model">启动人设模型</label>
          <select
            id="runtime-llm-model"
            value={selectedLlmModelId}
            onChange={(event) => setSelectedLlmModelId(event.target.value)}
            disabled={installedLlmInventory.length === 0 || isRuntimeBusy}
          >
            {installedLlmInventory.length > 0 ? installedLlmInventory.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            )) : (
              <option value="">未发现已安装的人设模型</option>
            )}
          </select>
        </div>
        <div className="runtime-panel__actions">
          <button type="button" className="primary-button" onClick={startRuntime} disabled={isRuntimeBusy || llmRuntime.status === 'running'}>
            <Play size={16} />
            启动默认模型
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={startSelectedRuntime}
            disabled={isRuntimeBusy || llmRuntime.status === 'running' || installedLlmInventory.length === 0}
          >
            <Play size={16} />
            启动所选模型
          </button>
          <button type="button" className="secondary-button" onClick={stopRuntime} disabled={isRuntimeBusy || llmRuntime.status !== 'running'}>
            <Square size={16} />
            停止模型
          </button>
          <button type="button" className="secondary-button" onClick={refreshRuntimeStatus} disabled={isRuntimeBusy}>
            <RefreshCw size={16} />
            刷新状态
          </button>
        </div>
      </section>

      <ModelSection title="语音转文字模型" models={asrModels} />
      <ModelSection title="本地大语言模型" models={llmModels} />
    </div>
  );
}

function ModelDirectoryPanel({
  health,
  isBusy,
  onPickAsrDirectory,
  onPickLlmDirectory,
}: {
  health?: RuntimeHealth;
  isBusy: boolean;
  onPickAsrDirectory: () => void;
  onPickLlmDirectory: () => void;
}) {
  if (!health) {
    return null;
  }

  const asrInventory = health.models.filter(model => model.kind === 'asr');
  const llmInventory = health.models.filter(model => model.kind === 'llm');

  return (
    <section className="panel model-directory-panel">
      <div className="section-heading">
        <div>
          <h3>模型下载目录</h3>
          <p>模型不会打进安装包；请按这里的目录下载或移动模型文件。</p>
        </div>
        <HardDriveDownload size={20} />
      </div>
      <div className="model-directory-grid">
        <ModelDirectoryCard
          title="语音转文字模型"
          directory={health.modelRoot}
          inventory={asrInventory}
          isBusy={isBusy}
          onPickDirectory={onPickAsrDirectory}
        />
        <ModelDirectoryCard
          title="本地大语言模型"
          directory={health.llmModelRoot}
          inventory={llmInventory}
          isBusy={isBusy}
          onPickDirectory={onPickLlmDirectory}
        />
      </div>
    </section>
  );
}

function ModelDirectoryCard({
  title,
  directory,
  inventory,
  isBusy,
  onPickDirectory,
}: {
  title: string;
  directory: string;
  inventory: LocalModelInventoryItem[];
  isBusy: boolean;
  onPickDirectory: () => void;
}) {
  const requiredFiles = Array.from(new Set(inventory.flatMap(model => model.requiredFiles)));

  return (
    <article className="model-directory-card">
      <div className="model-directory-card__head">
        <span>{title}</span>
        <button type="button" className="secondary-button" onClick={onPickDirectory} disabled={isBusy}>
          <FolderOpen size={16} />
          选择目录
        </button>
      </div>
      <strong>{directory}</strong>
      {requiredFiles.length > 0 ? (
        <ul>
          {requiredFiles.map(file => (
            <li key={file}>
              <code>{file}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>当前没有可展示的文件清单。</p>
      )}
    </article>
  );
}

function ModelSection({ title, models }: { title: string; models: ModelProfile[] }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h3>{title}</h3>
          <p>查看模型清单、状态和配置提示。</p>
        </div>
      </div>
      <div className="model-grid">
        {models.length > 0 ? models.map((model) => (
          <article className="model-card" key={model.id}>
            <div className="model-card__head">
              <Cpu size={20} />
              <StatusBadge value={model.status} />
            </div>
            <h4>{model.name}</h4>
            <span>{model.sizeLabel}</span>
            <div className="model-card__tags">
              <StatusBadge label={tierLabel[model.recommendedTier]} tone="info" />
              <StatusBadge label={model.engine} tone="neutral" />
            </div>
            <p>{model.memoryHint}</p>
            <p>{model.cpuHint}</p>
            <button type="button" className="secondary-button" disabled={model.status !== 'installed'}>
              切换到该模型
            </button>
          </article>
        )) : (
          <div className="empty-state">
            <strong>暂无模型</strong>
            <span>选择模型目录后刷新清单，软件会扫描用户下载的本地模型。</span>
          </div>
        )}
      </div>
    </section>
  );
}
