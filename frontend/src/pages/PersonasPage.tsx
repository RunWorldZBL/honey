import { Brain, Eraser, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, ModelProfile, PersonaProfile } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/StatusBadge';
import { useDictationUiStore } from '@/stores/dictationUiStore';

const splitAliases = (value: string) => value
  .split(/[、,，]/)
  .map(item => item.trim())
  .filter(Boolean);

const createBlankPersona = (): PersonaProfile => ({
  id: `persona-${Date.now()}`,
  name: '新建人设',
  triggerAliases: [],
  description: '',
  prompt: '',
  outputMode: 'typing',
  enabled: true,
  keepContext: false,
});

export function PersonasPage() {
  const setCurrentMode = useDictationUiStore(state => state.setCurrentMode);
  const setSelectedPersonaId = useDictationUiStore(state => state.setSelectedPersonaId);
  const [personas, setPersonas] = useState<PersonaProfile[]>([]);
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [settings, setSettings] = useState<AppSettings>();
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<PersonaProfile>();
  const [feedback, setFeedback] = useState('');
  const selected = personas.find((item) => item.id === selectedId);
  const llmModels = models.filter((model) => model.kind === 'llm');

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      backendClient.listPersonas(),
      backendClient.listModels(),
      backendClient.getSettings(),
    ]).then(([nextPersonas, nextModels, nextSettings]) => {
      if (cancelled) {
        return;
      }

      setPersonas(nextPersonas);
      setModels(nextModels);
      setSettings(nextSettings);
      setCurrentMode(nextSettings.personaModeEnabled ? 'persona' : 'direct');
      setSelectedPersonaId(nextPersonas[0]?.id);
      setSelectedId(current => current ?? nextPersonas[0]?.id);
      setDraft(current => current ?? nextPersonas[0]);
    });

    return () => {
      cancelled = true;
    };
  }, [setCurrentMode, setSelectedPersonaId]);

  useEffect(() => {
    if (selected) {
      setDraft({ ...selected });
      setFeedback('');
    }
  }, [selected?.id]);

  const updateDraft = <Key extends keyof PersonaProfile>(key: Key, value: PersonaProfile[Key]) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setFeedback('');
  };

  const selectPersona = (persona: PersonaProfile) => {
    setSelectedId(persona.id);
    setSelectedPersonaId(persona.id);
    setDraft({ ...persona });
    setFeedback('');
  };

  const createPersona = () => {
    const nextPersona = createBlankPersona();
    setSelectedId(nextPersona.id);
    setSelectedPersonaId(undefined);
    setDraft(nextPersona);
    setFeedback('');
  };

  const savePersona = async () => {
    if (!draft) {
      return;
    }

    const savedPersona = await backendClient.savePersona(draft);
    setPersonas(current => {
      const index = current.findIndex(item => item.id === savedPersona.id);
      return index >= 0
        ? current.map(item => (item.id === savedPersona.id ? savedPersona : item))
        : [savedPersona, ...current];
    });
    setDraft(savedPersona);
    setSelectedId(savedPersona.id);
    setSelectedPersonaId(savedPersona.id);
    setFeedback('人设已保存');
  };

  const togglePersonaMode = async () => {
    const savedSettings = await backendClient.updateSettings({
      personaModeEnabled: !(settings?.personaModeEnabled ?? false),
    });
    setSettings(savedSettings);
    setCurrentMode(savedSettings.personaModeEnabled ? 'persona' : 'direct');
    setFeedback(savedSettings.personaModeEnabled ? '人设模式已开启' : '人设模式已关闭');
  };

  const deletePersona = async () => {
    if (!selected) {
      return;
    }

    await backendClient.deletePersona(selected.id);
    const remainingPersonas = personas.filter(item => item.id !== selected.id);
    setPersonas(remainingPersonas);
    setSelectedId(remainingPersonas[0]?.id);
    setSelectedPersonaId(remainingPersonas[0]?.id);
    setDraft(remainingPersonas[0]);
    setFeedback('人设已删除');
  };

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">可选本地 LLM 处理</span>
          <h2>人设设置</h2>
          <p>人设模式默认关闭。开启后会先语音转文字，再交给本地大语言模型按角色处理。</p>
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={togglePersonaMode} disabled={!settings}>
            {settings?.personaModeEnabled ? '关闭人设模式' : '开启人设模式'}
          </button>
          <StatusBadge label={settings?.personaModeEnabled ? '已开启' : '默认关闭'} tone={settings?.personaModeEnabled ? 'success' : 'warning'} />
        </div>
      </section>

      <section className="notice-panel">
        <Brain size={20} />
        <div>
          <strong>人设模式会增加内存占用和等待时间</strong>
          <span>建议用户明确选择模型和角色后再开启，避免把输入法式体验变重。</span>
        </div>
      </section>

      <section className="split-layout">
        <div className="panel list-panel">
          <div className="section-heading">
            <h3>人设模式</h3>
            <button type="button" className="secondary-button" onClick={createPersona}>
              <Plus size={16} />
              新建人设
            </button>
          </div>
          {personas.map((persona) => (
            <button
              key={persona.id}
              type="button"
              className="list-row"
              data-active={selected?.id === persona.id}
              onClick={() => selectPersona(persona)}
            >
              <strong>{persona.name}</strong>
              <span>{persona.description}</span>
              <StatusBadge label={persona.enabled ? '启用' : '停用'} tone={persona.enabled ? 'success' : 'neutral'} />
            </button>
          ))}
        </div>

        <form className="panel form-grid" key={selected?.id ?? 'empty-persona'}>
          <div className="section-heading">
            <div>
              <h3>{draft?.name}</h3>
              <p>{draft?.description}</p>
            </div>
            <Sparkles size={20} />
          </div>
          <FormField id="persona-name" label="名称">
            <input
              id="persona-name"
              value={draft?.name ?? ''}
              onChange={(event) => updateDraft('name', event.target.value)}
              disabled={!draft}
            />
          </FormField>
          <FormField id="persona-description" label="描述">
            <input
              id="persona-description"
              value={draft?.description ?? ''}
              onChange={(event) => updateDraft('description', event.target.value)}
              disabled={!draft}
            />
          </FormField>
          <FormField id="persona-trigger-aliases" label="触发别名" hint="例如：职场、委婉、邮件">
            <input
              id="persona-trigger-aliases"
              value={draft?.triggerAliases.join('、') ?? ''}
              onChange={(event) => updateDraft('triggerAliases', splitAliases(event.target.value))}
              disabled={!draft}
            />
          </FormField>
          <FormField id="persona-prompt" label="提示词">
            <textarea
              id="persona-prompt"
              value={draft?.prompt ?? ''}
              onChange={(event) => updateDraft('prompt', event.target.value)}
              disabled={!draft}
            />
          </FormField>
          <FormField id="persona-output-mode" label="输出方式">
            <select
              id="persona-output-mode"
              value={draft?.outputMode ?? 'typing'}
              onChange={(event) => updateDraft('outputMode', event.target.value as PersonaProfile['outputMode'])}
              disabled={!draft}
            >
              <option value="typing">处理后上屏</option>
              <option value="toast">浮窗回复</option>
            </select>
          </FormField>
          <FormField id="persona-model" label="绑定模型">
            <select
              id="persona-model"
              value={draft?.modelId ?? ''}
              onChange={(event) => updateDraft('modelId', event.target.value || undefined)}
              disabled={!draft}
            >
              <option value="">未绑定</option>
              {llmModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.status === 'installed' ? '已就绪' : '未安装'}
                </option>
              ))}
            </select>
          </FormField>
          <div className="switch-grid">
            <label>
              <input
                type="checkbox"
                checked={draft?.enabled ?? false}
                onChange={(event) => updateDraft('enabled', event.target.checked)}
                disabled={!draft}
              />
              启用该人设
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft?.keepContext ?? false}
                onChange={(event) => updateDraft('keepContext', event.target.checked)}
                disabled={!draft}
              />
              保留上下文记忆
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={savePersona} disabled={!draft}>
              保存人设
            </button>
            <button type="button" className="secondary-button" onClick={deletePersona} disabled={!selected}>
              删除人设
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={async () => {
                await backendClient.clearPersonaMemory(selected?.id);
                setFeedback('人设记忆已清除');
              }}
              disabled={!selected}
            >
              <Eraser size={16} />
              清除人设记忆
            </button>
          </div>
          {feedback ? <p className="inline-feedback">{feedback}</p> : null}
        </form>
      </section>
    </div>
  );
}
