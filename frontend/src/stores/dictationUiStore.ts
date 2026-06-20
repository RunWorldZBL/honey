import { create } from 'zustand';
import type {
  AppWindowMode,
  AppSettings,
  DictationMode,
  DictationOverlaySnapshot,
  ModelStatus,
} from '@honey/api-contracts';

interface DictationUiStore {
  windowMode: AppWindowMode;
  currentMode: DictationMode;
  hotkey: string;
  selectedPersonaId?: string;
  outputMethod: AppSettings['outputMethod'];
  restoreClipboard: AppSettings['restoreClipboard'];
  forcePasteApps: string[];
  asrModelStatus: ModelStatus;
  overlayEnabled: boolean;
  overlaySnapshot: DictationOverlaySnapshot;
  setWindowMode: (mode: AppWindowMode) => void;
  setCurrentMode: (mode: DictationMode) => void;
  setHotkey: (hotkey: string) => void;
  setSelectedPersonaId: (personaId?: string) => void;
  setOutputRuntimeSettings: (settings: {
    outputMethod: AppSettings['outputMethod'];
    restoreClipboard: AppSettings['restoreClipboard'];
    forcePasteApps: string[];
  }) => void;
  setOverlayEnabled: (enabled: boolean) => void;
  setOverlaySnapshot: (snapshot: DictationOverlaySnapshot) => void;
}

export const useDictationUiStore = create<DictationUiStore>((set) => ({
  windowMode: 'full',
  currentMode: 'direct',
  hotkey: 'CapsLock',
  selectedPersonaId: 'persona-office',
  outputMethod: 'paste',
  restoreClipboard: true,
  forcePasteApps: [],
  asrModelStatus: 'installed',
  overlayEnabled: true,
  overlaySnapshot: { state: 'idle', mode: 'direct', volumeLevel: 0 },
  setWindowMode: (windowMode) => set({ windowMode }),
  setCurrentMode: (currentMode) => set({ currentMode }),
  setHotkey: (hotkey) => set({ hotkey }),
  setSelectedPersonaId: (selectedPersonaId) => set({ selectedPersonaId }),
  setOutputRuntimeSettings: ({ outputMethod, restoreClipboard, forcePasteApps }) => set({
    outputMethod,
    restoreClipboard,
    forcePasteApps,
  }),
  setOverlayEnabled: (overlayEnabled) => set({ overlayEnabled }),
  setOverlaySnapshot: (overlaySnapshot) => set({ overlaySnapshot }),
}));
