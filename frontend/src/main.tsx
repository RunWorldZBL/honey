import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { DesktopOverlayWindow } from './components/DesktopOverlayWindow';
import './index.css';
import { initThemeRuntime } from './stores/themeStore';

initThemeRuntime();

const queryClient = new QueryClient();
declare global {
  interface Window {
    __HONEY_WINDOW_LABEL__?: string;
  }
}

const queryLabel = new URLSearchParams(window.location.search).get('window');
const windowLabel = window.__HONEY_WINDOW_LABEL__ ?? queryLabel ?? window.name;
const isOverlayWindow = windowLabel === 'overlay' || windowLabel === 'dictation-overlay';
const RootComponent = isOverlayWindow ? DesktopOverlayWindow : App;

if (isOverlayWindow) {
  document.documentElement.dataset.window = 'overlay';
  document.body.dataset.window = 'overlay';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RootComponent />
    </QueryClientProvider>
  </StrictMode>,
);
