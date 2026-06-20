import { Power, Radio, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TrayAction } from '@honey/api-contracts';

import { backendClient } from '@/api/client';

import { StatusBadge } from './StatusBadge';

const iconByAction: Record<string, typeof Radio> = {
  'toggle-listening': Radio,
  'open-settings': Settings,
  quit: Power,
};

export function TrayMenuPreview() {
  const [trayActions, setTrayActions] = useState<TrayAction[]>([]);

  useEffect(() => {
    let cancelled = false;

    void backendClient.listTrayActions().then((actions) => {
      if (!cancelled) {
        setTrayActions(actions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>托盘菜单预览</h2>
          <p>系统级托盘还未接入，第一版先固定菜单能力和状态。</p>
        </div>
        <StatusBadge label="mock" tone="neutral" />
      </div>
      <div className="tray-list">
        {trayActions.map((action) => {
          const Icon = iconByAction[action.id] ?? Radio;
          return (
            <div className="tray-item" key={action.id}>
              <Icon size={16} />
              <div>
                <strong>{action.label}</strong>
                <span>{action.description}</span>
              </div>
              <StatusBadge label={action.enabled ? '可用' : '未接入'} tone={action.enabled ? 'success' : 'neutral'} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
