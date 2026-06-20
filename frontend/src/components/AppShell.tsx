import { Minimize2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { navigationItems, type AppRouteId } from '@/app/navigation';
import { ThemeSwitcher } from './ThemeSwitcher';

export function AppShell({
  activeRoute,
  onRouteChange,
  onOpenMini,
  children,
}: {
  activeRoute: AppRouteId;
  onRouteChange: (route: AppRouteId) => void;
  onOpenMini: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">h</div>
          <div>
            <strong>honey</strong>
            <span>甜美</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                data-active={activeRoute === item.id}
                onClick={() => onRouteChange(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">本地优先桌面语音输入</span>
            <h1>honey 甜美</h1>
          </div>
          <div className="topbar__actions">
            <ThemeSwitcher />
            <button className="secondary-button" type="button" onClick={onOpenMini}>
              <Minimize2 size={16} />
              迷你窗口
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
