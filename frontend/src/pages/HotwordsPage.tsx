import { Download, Plus, ToggleLeft, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { HotwordEntry } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/StatusBadge';

const splitTerms = (value: string) =>
  value
    .split(/[、,，]/)
    .map(item => item.trim())
    .filter(Boolean);

const makeDraft = (entry?: HotwordEntry) => ({
  canonical: entry?.canonical ?? '',
  aliases: entry?.aliases.join('、') ?? '',
  blacklist: entry?.blacklist.join('、') ?? '',
});

export function HotwordsPage() {
  const [hotwords, setHotwords] = useState<HotwordEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? hotwords.find((item) => item.id === selectedId) : undefined;
  const [draft, setDraft] = useState(makeDraft(selected));

  useEffect(() => {
    let cancelled = false;

    void backendClient.listHotwords().then((items) => {
      if (cancelled) {
        return;
      }

      const first = items[0];
      setHotwords(items);
      setSelectedId(current => current ?? first?.id ?? null);
      setDraft(makeDraft(first));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNew = () => {
    setSelectedId(null);
    setDraft(makeDraft());
  };

  const handleSave = async () => {
    const canonical = draft.canonical.trim();
    if (!canonical) {
      return;
    }

    const next: HotwordEntry = {
      id: selected?.id ?? `hotword-${canonical.toLowerCase().replace(/\s+/g, '-')}`,
      canonical,
      aliases: splitTerms(draft.aliases),
      blacklist: splitTerms(draft.blacklist),
      enabled: selected?.enabled ?? true,
    };
    const saved = await backendClient.saveHotword(next);

    setHotwords(items => {
      const exists = items.some(item => item.id === saved.id);
      return exists ? items.map(item => (item.id === saved.id ? saved : item)) : [saved, ...items];
    });
    setSelectedId(saved.id);
    setDraft(makeDraft(saved));
  };

  const handleToggle = async () => {
    if (!selected) {
      return;
    }

    const saved = await backendClient.saveHotword({ ...selected, enabled: !selected.enabled });
    setHotwords(items =>
      items.map(item => (item.id === selected.id ? saved : item)),
    );
  };

  const handleDelete = async () => {
    if (!selected) {
      return;
    }

    await backendClient.deleteHotword(selected.id);
    const next = hotwords.find(item => item.id !== selected.id);
    setHotwords(items => items.filter(item => item.id !== selected.id));
    setSelectedId(next?.id ?? null);
    setDraft(makeDraft(next));
  };

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">术语识别</span>
          <h2>热词</h2>
          <p>把常用产品名、模型名、英文词和容易听错的词固定成可维护条目。</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button">
            <Upload size={16} />
            导入
          </button>
          <button type="button" className="secondary-button">
            <Download size={16} />
            导出
          </button>
          <button type="button" className="primary-button" onClick={handleNew}>
            <Plus size={16} />
            新增热词
          </button>
        </div>
      </section>

      <section className="split-layout">
        <div className="panel list-panel">
          {hotwords.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="list-row"
              data-active={selected?.id === entry.id}
              onClick={() => {
                setSelectedId(entry.id);
                setDraft(makeDraft(entry));
              }}
            >
              <strong>{entry.canonical}</strong>
              <span>{entry.aliases.join('、')}</span>
              <StatusBadge label={entry.enabled ? '启用' : '停用'} tone={entry.enabled ? 'success' : 'neutral'} />
            </button>
          ))}
        </div>

        <form className="panel form-grid">
          <div className="section-heading">
            <div>
              <h3>热词编辑</h3>
              <p>保存后会写入本机后端服务，后续识别和转写都会复用这些术语。</p>
            </div>
            <button type="button" className="ghost-button" onClick={handleToggle} disabled={!selected}>
              <ToggleLeft size={16} />
              {selected?.enabled ? '停用热词' : '启用热词'}
            </button>
          </div>
          <FormField id="hotword-canonical" label="标准词">
            <input
              id="hotword-canonical"
              value={draft.canonical}
              onChange={(event) => setDraft(current => ({ ...current, canonical: event.target.value }))}
            />
          </FormField>
          <FormField id="hotword-aliases" label="别名" hint="多个别名可用顿号或逗号分隔">
            <input
              id="hotword-aliases"
              value={draft.aliases}
              onChange={(event) => setDraft(current => ({ ...current, aliases: event.target.value }))}
            />
          </FormField>
          <FormField id="hotword-blacklist" label="黑名单" hint="不会被替换成标准词的词">
            <input
              id="hotword-blacklist"
              value={draft.blacklist}
              onChange={(event) => setDraft(current => ({ ...current, blacklist: event.target.value }))}
            />
          </FormField>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={handleSave}>
              保存热词
            </button>
            <button type="button" className="secondary-button" onClick={handleDelete} disabled={!selected}>
              删除
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
