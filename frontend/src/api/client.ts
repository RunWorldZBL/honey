import type {
  AppSettings,
  AudioCaptureUploadInput,
  AudioCaptureUploadResult,
  CreateFileTranscriptionTaskInput,
  DictationSessionInput,
  DictationSessionResult,
  FileTranscriptionTask,
  HotwordEntry,
  LocalLlmRuntimeStatus,
  ModelProfile,
  PersonaDictationSessionInput,
  PersonaProfile,
  ReplaceRule,
  RuntimeHealth,
  StartLocalLlmRuntimeRequest,
  TrayAction,
  TranscriptRecord,
  UpdateAppSettings,
} from '@honey/api-contracts';

import { createDesktopBridgeClient } from './desktopBridge';

export interface BackendClient {
  listTranscriptRecords(): Promise<TranscriptRecord[]>;
  listHotwords(): Promise<HotwordEntry[]>;
  listRules(): Promise<ReplaceRule[]>;
  listPersonas(): Promise<PersonaProfile[]>;
  listModels(): Promise<ModelProfile[]>;
  listFileTranscriptionTasks(): Promise<FileTranscriptionTask[]>;
  createFileTranscriptionTask(input: CreateFileTranscriptionTaskInput): Promise<FileTranscriptionTask>;
  listTrayActions(): Promise<TrayAction[]>;
  getRuntimeHealth(): Promise<RuntimeHealth>;
  getLocalLlmRuntimeStatus(): Promise<LocalLlmRuntimeStatus>;
  startLocalLlmRuntime(input?: StartLocalLlmRuntimeRequest): Promise<LocalLlmRuntimeStatus>;
  stopLocalLlmRuntime(): Promise<LocalLlmRuntimeStatus>;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: UpdateAppSettings): Promise<AppSettings>;
  saveHotword(entry: HotwordEntry): Promise<HotwordEntry>;
  deleteHotword(id: string): Promise<{ ok: true; id: string }>;
  saveRule(rule: ReplaceRule): Promise<ReplaceRule>;
  deleteRule(id: string): Promise<{ ok: true; id: string }>;
  previewRules(input: string): Promise<string>;
  deleteTranscriptRecord(id: string): Promise<{ ok: true; id: string }>;
  savePersona(persona: PersonaProfile): Promise<PersonaProfile>;
  deletePersona(id: string): Promise<{ ok: true; id: string }>;
  clearPersonaMemory(personaId?: string): Promise<{ ok: true; personaId?: string }>;
  saveAudioCapture(input: AudioCaptureUploadInput): Promise<AudioCaptureUploadResult>;
  runDirectDictationSession(input: DictationSessionInput): Promise<DictationSessionResult>;
  runPersonaDictationSession(input: PersonaDictationSessionInput): Promise<DictationSessionResult>;
}

export const backendClient: BackendClient = createDesktopBridgeClient();
