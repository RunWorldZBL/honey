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
  selectedPersonaId?: string;
  outputMethod: AppSettings['outputMethod'];
  restoreClipboard: AppSettings['restoreClipboard'];
  forcePasteApps: string[];
  asrModelStatus: ModelStatus;
  overlaySnapshot: DictationOverlaySnapshot;
  setWindowMode: (mode: AppWindowMode) => void;
  setCurrentMode: (mode: DictationMode) => void;
  setSelectedPersonaId: (personaId?: string) => void;
  setOutputRuntimeSettings: (settings: {
    outputMethod: AppSettings['outputMethod'];
    restoreClipboard: AppSettings['restoreClipboard'];
    forcePasteApps: string[];
  }) => void;
  setOverlaySnapshot: (snapshot: DictationOverlaySnapshot) => void;
}

export const useDictationUiStore = create<DictationUiStore>((set) => ({
  windowMode: 'full',
  currentMode: 'direct',
  selectedPersonaId: 'persona-office',
  outputMethod: 'paste',
  restoreClipboard: true,
  forcePasteApps: [],
  asrModelStatus: 'installed',
  overlaySnapshot: { state: 'idle', mode: 'direct', volumeLevel: 0 },
  setWindowMode: (windowMode) => set({ windowMode }),
  setCurrentMode: (currentMode) => set({ currentMode }),
  setSelectedPersonaId: (selectedPersonaId) => set({ selectedPersonaId }),
  setOutputRuntimeSettings: ({ outputMethod, restoreClipboard, forcePasteApps }) => set({
    outputMethod,
    restoreClipboard,
    forcePasteApps,
  }),
  setOverlaySnapshot: (overlaySnapshot) => set({ overlaySnapshot }),
}));
