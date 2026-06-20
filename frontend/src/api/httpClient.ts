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

import type { BackendClient } from './client';
import { createMockBackendClient } from './mockClient';

const defaultBaseUrl = 'http://127.0.0.1:33577';

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '');

class HttpResponseError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

const requestJson = async <T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, init);

  if (!response.ok) {
    throw new HttpResponseError(response.status);
  }

  return await response.json() as T;
};

const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function createHttpBackendClient(baseUrl = defaultBaseUrl): BackendClient {
  const fallback = createMockBackendClient();

  const withReadFallback = async <T>(request: () => Promise<T>, fallbackRequest: () => Promise<T>) => {
    try {
      return await request();
    } catch (error) {
      if (error instanceof HttpResponseError) {
        throw error;
      }

      return await fallbackRequest();
    }
  };

  return {
    listTranscriptRecords: () => withReadFallback(
      () => requestJson<TranscriptRecord[]>(baseUrl, '/api/transcripts'),
      () => fallback.listTranscriptRecords(),
    ),
    listHotwords: () => withReadFallback(
      () => requestJson<HotwordEntry[]>(baseUrl, '/api/hotwords'),
      () => fallback.listHotwords(),
    ),
    listRules: () => withReadFallback(
      () => requestJson<ReplaceRule[]>(baseUrl, '/api/rules'),
      () => fallback.listRules(),
    ),
    listPersonas: () => withReadFallback(
      () => requestJson<PersonaProfile[]>(baseUrl, '/api/personas'),
      () => fallback.listPersonas(),
    ),
    listModels: () => withReadFallback(
      () => requestJson<ModelProfile[]>(baseUrl, '/api/models'),
      () => fallback.listModels(),
    ),
    listFileTranscriptionTasks: () => withReadFallback(
      () => requestJson<FileTranscriptionTask[]>(baseUrl, '/api/file-tasks'),
      () => fallback.listFileTranscriptionTasks(),
    ),
    createFileTranscriptionTask: (input: CreateFileTranscriptionTaskInput) =>
      requestJson<FileTranscriptionTask>(baseUrl, '/api/file-tasks', jsonRequest('POST', input)),
    listTrayActions: () => withReadFallback(
      () => requestJson<TrayAction[]>(baseUrl, '/api/tray-actions'),
      () => fallback.listTrayActions(),
    ),
    getRuntimeHealth: () => withReadFallback(
      () => requestJson<RuntimeHealth>(baseUrl, '/api/runtime/health'),
      () => fallback.getRuntimeHealth(),
    ),
    getLocalLlmRuntimeStatus: () => withReadFallback(
      () => requestJson<LocalLlmRuntimeStatus>(baseUrl, '/api/runtime/llm'),
      () => fallback.getLocalLlmRuntimeStatus(),
    ),
    startLocalLlmRuntime: (input?: StartLocalLlmRuntimeRequest) =>
      requestJson<LocalLlmRuntimeStatus>(baseUrl, '/api/runtime/llm/start', jsonRequest('POST', input)),
    stopLocalLlmRuntime: () =>
      requestJson<LocalLlmRuntimeStatus>(baseUrl, '/api/runtime/llm/stop', jsonRequest('POST')),
    getSettings: () => withReadFallback(
      () => requestJson<AppSettings>(baseUrl, '/api/settings'),
      () => fallback.getSettings(),
    ),
    updateSettings: (patch: UpdateAppSettings) =>
      requestJson<AppSettings>(baseUrl, '/api/settings', jsonRequest('PATCH', patch)),
    saveHotword: (entry) =>
      requestJson<HotwordEntry>(baseUrl, '/api/hotwords', jsonRequest('POST', entry)),
    deleteHotword: (id) =>
      requestJson<{ ok: true; id: string }>(baseUrl, `/api/hotwords/${encodeURIComponent(id)}`, jsonRequest('DELETE')),
    saveRule: (rule) =>
      requestJson<ReplaceRule>(baseUrl, '/api/rules', jsonRequest('POST', rule)),
    deleteRule: (id) =>
      requestJson<{ ok: true; id: string }>(baseUrl, `/api/rules/${encodeURIComponent(id)}`, jsonRequest('DELETE')),
    previewRules: (input) => withReadFallback(
      async () => {
        const result = await requestJson<{ output: string }>(baseUrl, '/api/rules/preview', {
          ...jsonRequest('POST', { input }),
        });
        return result.output;
      },
      () => fallback.previewRules(input),
    ),
    deleteTranscriptRecord: (id) =>
      requestJson<{ ok: true; id: string }>(baseUrl, `/api/transcripts/${encodeURIComponent(id)}`, jsonRequest('DELETE')),
    savePersona: (persona) =>
      requestJson<PersonaProfile>(baseUrl, '/api/personas', jsonRequest('POST', persona)),
    deletePersona: (id) =>
      requestJson<{ ok: true; id: string }>(baseUrl, `/api/personas/${encodeURIComponent(id)}`, jsonRequest('DELETE')),
    clearPersonaMemory: (personaId) =>
      requestJson<{ ok: true; personaId?: string }>(
        baseUrl,
        personaId
          ? `/api/personas/${encodeURIComponent(personaId)}/memory`
          : '/api/personas/memory',
        jsonRequest('DELETE'),
      ),
    saveAudioCapture: (input: AudioCaptureUploadInput) =>
      requestJson<AudioCaptureUploadResult>(baseUrl, '/api/audio-captures', jsonRequest('POST', input)),
    runDirectDictationSession: (input: DictationSessionInput) =>
      requestJson<DictationSessionResult>(baseUrl, '/api/dictation/direct-session', jsonRequest('POST', input)),
    runPersonaDictationSession: (input: PersonaDictationSessionInput) =>
      requestJson<DictationSessionResult>(baseUrl, '/api/dictation/persona-session', jsonRequest('POST', input)),
  };
}
