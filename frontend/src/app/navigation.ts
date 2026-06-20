import {
  BookOpenText,
  Bot,
  FileAudio,
  History,
  Home,
  Keyboard,
  ListChecks,
  Settings,
  Sparkles,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type AppRouteId =
  | 'home'
  | 'history'
  | 'hotwords'
  | 'rules'
  | 'personas'
  | 'models'
  | 'files'
  | 'settings';

export interface NavigationItem {
  id: AppRouteId;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const navigationItems: NavigationItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'history', label: '历史记录', icon: History },
  { id: 'hotwords', label: '热词', icon: BookOpenText },
  { id: 'rules', label: '规则', icon: ListChecks },
  { id: 'personas', label: '人设设置', icon: Sparkles },
  { id: 'models', label: '模型', icon: Bot },
  { id: 'files', label: '文件转录', icon: FileAudio },
  { id: 'settings', label: '设置', icon: Settings },
];

export const quickActionRoutes: AppRouteId[] = ['history', 'hotwords', 'models', 'settings'];

export const shortcutIcon = Keyboard;
