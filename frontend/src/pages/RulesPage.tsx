import { FlaskConical, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReplaceRule } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/StatusBadge';

export function RulesPage() {
  const [rules, setRules] = useState<ReplaceRule[]>([]);
  const [testInput, setTestInput] = useState('请发到 honey 艾特 runworld 点 com。');
  const [output, setOutput] = useState('');
  const [draft, setDraft] = useState({
    name: '',
    pattern: '',
    replacement: '',
    isRegex: false,
  });

  useEffect(() => {
    let cancelled = false;

    void backendClient.listRules().then((items) => {
      if (!cancelled) {
        setRules(items);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void backendClient.previewRules(testInput).then((nextOutput) => {
      if (!cancelled) {
        setOutput(nextOutput);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [testInput, rules]);

  const handleSaveRule = async () => {
    const name = draft.name.trim();
    const pattern = draft.pattern.trim();
    if (!name || !pattern) {
      return;
    }

    const next: ReplaceRule = {
      id: `rule-${Date.now()}`,
      name,
      pattern,
      replacement: draft.replacement,
      isRegex: draft.isRegex,
      enabled: true,
    };

    const saved = await backendClient.saveRule(next);

    setRules(items => [saved, ...items]);
    setDraft({ name: '', pattern: '', replacement: '', isRegex: false });
  };

  const toggleRule = async (id: string) => {
    const target = rules.find(item => item.id === id);
    if (!target) {
      return;
    }

    const saved = await backendClient.saveRule({ ...target, enabled: !target.enabled });
    setRules(items => items.map(item => (item.id === id ? saved : item)));
  };

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">文本处理</span>
          <h2>规则</h2>
          <p>把简单替换和正则替换做成可测试的规则，不要求用户直接编辑配置文件。</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setDraft({ name: '', pattern: '', replacement: '', isRegex: false })}>
          <Plus size={16} />
          新增规则
        </button>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="record-list">
            {rules.map((rule) => (
              <article className="record-card" key={rule.id}>
                <div className="record-card__meta">
                  <StatusBadge label={rule.isRegex ? '正则' : '简单替换'} tone={rule.isRegex ? 'info' : 'success'} />
                  <StatusBadge label={rule.enabled ? '启用' : '停用'} tone={rule.enabled ? 'success' : 'neutral'} />
                </div>
                <strong>{rule.name}</strong>
                <p>
                  {rule.pattern} → {rule.replacement}
                </p>
                <button type="button" className="ghost-button" onClick={() => toggleRule(rule.id)}>
                  {rule.enabled ? '停用规则' : '启用规则'}
                </button>
              </article>
            ))}
          </div>
        </div>

        <form className="panel form-grid">
          <div className="section-heading">
            <div>
              <h3>规则测试</h3>
              <p>输入一段文本，预览本机后端规则处理后的结果。</p>
            </div>
            <FlaskConical size={20} />
          </div>
          <FormField id="rules-test-input" label="测试输入">
            <textarea id="rules-test-input" value={testInput} onChange={(event) => setTestInput(event.target.value)} />
          </FormField>
          <div className="rule-form-grid">
            <FormField id="rule-name" label="规则名称">
              <input
                id="rule-name"
                value={draft.name}
                onChange={(event) => setDraft(current => ({ ...current, name: event.target.value }))}
              />
            </FormField>
            <FormField id="rule-pattern" label="匹配内容">
              <input
                id="rule-pattern"
                value={draft.pattern}
                onChange={(event) => setDraft(current => ({ ...current, pattern: event.target.value }))}
              />
            </FormField>
            <FormField id="rule-replacement" label="替换为">
              <input
                id="rule-replacement"
                value={draft.replacement}
                onChange={(event) => setDraft(current => ({ ...current, replacement: event.target.value }))}
              />
            </FormField>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={draft.isRegex}
                onChange={(event) => setDraft(current => ({ ...current, isRegex: event.target.checked }))}
              />
              正则规则
            </label>
          </div>
          <button type="button" className="primary-button" onClick={handleSaveRule}>
            保存规则
          </button>
          <div className="result-box">
            <small>处理结果</small>
            <strong>{output}</strong>
          </div>
        </form>
      </section>
    </div>
  );
}
