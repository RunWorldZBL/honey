import { Copy, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PersonaProfile, TranscriptRecord } from '@honey/api-contracts';

import { backendClient } from '@/api/client';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';

const filterOptions = [
  { key: 'all', label: '全部' },
  { key: 'direct', label: '直接转写' },
  { key: 'persona', label: '人设模式' },
  { key: 'failed', label: '失败' },
] as const;

type FilterKey = (typeof filterOptions)[number]['key'];

export function HistoryPage() {
  const [allRecords, setAllRecords] = useState<TranscriptRecord[]>([]);
  const [personas, setPersonas] = useState<PersonaProfile[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      backendClient.listTranscriptRecords(),
      backendClient.listPersonas(),
    ]).then(([records, nextPersonas]) => {
      if (!cancelled) {
        setAllRecords(records);
        setPersonas(nextPersonas);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const records = useMemo(() => {
    return allRecords.filter((record) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'failed' ? record.status === 'failed' : record.mode === filter);
      const matchesQuery =
        !query.trim() ||
        record.rawText.includes(query.trim()) ||
        record.outputText.includes(query.trim()) ||
        record.sourceApp?.includes(query.trim());

      return matchesFilter && matchesQuery;
    });
  }, [allRecords, filter, query]);

  const groups = records.reduce<Record<string, typeof records>>((acc, record) => {
    const date = record.createdAt.slice(0, 10);
    acc[date] = [...(acc[date] ?? []), record];
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="eyebrow">本地归档</span>
          <h2>历史记录</h2>
          <p>搜索原文、上屏文本、目标应用，并查看保存的录音占位。</p>
        </div>
        <StatusBadge label={`${allRecords.length} 条`} tone="info" />
      </section>

      <section className="toolbar-panel">
        <input
          aria-label="搜索历史记录"
          placeholder="搜索原文或输出文本"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="button-row">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className="segmented-button"
              data-active={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {records.length === 0 ? (
        <EmptyState title="没有匹配记录" description="换一个关键词或筛选条件再试。" />
      ) : (
        Object.entries(groups).map(([date, items]) => (
          <section className="panel" key={date}>
            <div className="section-heading">
              <h3>{date}</h3>
              <span>{items.length} 条</span>
            </div>
            <div className="record-list">
              {items.map((record) => {
                const persona = personas.find((item) => item.id === record.roleId);
                return (
                  <article className="record-card" key={record.id}>
                    <div className="record-card__meta">
                      <StatusBadge
                        label={record.mode === 'direct' ? '直接转写记录' : '人设模式记录'}
                        tone={record.mode === 'direct' ? 'success' : 'info'}
                      />
                      <span>{record.sourceApp ?? '未知应用'}</span>
                      <span>{record.durationMs ? `${(record.durationMs / 1000).toFixed(1)}s` : '无时长'}</span>
                      <span>{record.latencyMs ? `${record.latencyMs}ms` : '无延迟'}</span>
                      {persona ? <span>{persona.name}</span> : null}
                    </div>
                    <strong>{record.outputText}</strong>
                    <p>原文：{record.rawText}</p>
                    {record.audioPath ? (
                      <span className="audio-path">
                        <Volume2 size={14} />
                        {record.audioPath}
                      </span>
                    ) : null}
                    <div className="record-card__actions">
                      <button type="button" className="ghost-button">
                        <Copy size={15} />
                        复制输出
                      </button>
                      <button type="button" className="ghost-button">
                        <Copy size={15} />
                        复制原文
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger"
                        onClick={() => setPendingDeleteId(record.id)}
                      >
                        <Trash2 size={15} />
                        删除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}

      {pendingDeleteId ? (
        <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-record-title">
          <div className="confirm-dialog__panel">
            <h3 id="delete-record-title">确认删除这条记录？</h3>
            <p>这会从本机历史记录中移除该条文本记录，录音文件删除策略后续会单独确认。</p>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={async () => {
                  await backendClient.deleteTranscriptRecord(pendingDeleteId);
                  setAllRecords(items => items.filter(item => item.id !== pendingDeleteId));
                  setPendingDeleteId(null);
                }}
              >
                确认删除
              </button>
              <button type="button" className="secondary-button" onClick={() => setPendingDeleteId(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
