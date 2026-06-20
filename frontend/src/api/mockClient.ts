import type {
  AppSettings,
  AudioCaptureUploadInput,
  AudioCaptureUploadResult,
  DictationSessionInput,
  HotwordEntry,
  LocalLlmRuntimeStatus,
  PersonaDictationSessionInput,
  PersonaProfile,
  ReplaceRule,
  RuntimeHealth,
  StartLocalLlmRuntimeRequest,
  TranscriptRecord,
  UpdateAppSettings,
} from '@honey/api-contracts';
import type { BackendClient } from './client';
import {
  mockFileTasks,
  mockHotwords,
  mockModels,
  mockPersonas,
  mockRules,
  mockSettings,
  mockTranscriptRecords,
  mockTrayActions,
} from '@/data/mockData';

const clone = <T>(value: T): T => structuredClone(value);

const applyRules = (input: string, rules: ReplaceRule[]) =>
  rules.reduce((text, rule) => {
    if (!rule.enabled || !text) {
      return text;
    }

    if (rule.isRegex) {
      return text.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
    }

    return text.split(rule.pattern).join(rule.replacement);
  }, input);

const estimateBase64ByteLength = (base64Data: string) => {
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64Data.length * 3) / 4) - padding);
};

export function createMockBackendClient(): BackendClient {
  let transcriptRecords: TranscriptRecord[] = clone(mockTranscriptRecords);
  let hotwords: HotwordEntry[] = clone(mockHotwords);
  let rules: ReplaceRule[] = clone(mockRules);
  let personas: PersonaProfile[] = clone(mockPersonas);
  let settings: AppSettings = clone(mockSettings);
  let llmRuntime: LocalLlmRuntimeStatus = { status: 'stopped' };

  return {
    async listTranscriptRecords() {
      return clone(transcriptRecords);
    },
    async listHotwords() {
      return clone(hotwords);
    },
    async listRules() {
      return clone(rules);
    },
    async listPersonas() {
      return clone(personas);
    },
    async listModels() {
      return clone(mockModels);
    },
    async listFileTranscriptionTasks() {
      return clone(mockFileTasks);
    },
    async listTrayActions() {
      return clone(mockTrayActions);
    },
    async getRuntimeHealth(): Promise<RuntimeHealth> {
      return {
        service: 'honey-backend',
        mode: 'local',
        localDataPath: settings.localDataPath,
        audioCapturePath: `${settings.localDataPath}/audio-captures`,
        modelRoot: settings.asrModelRoot,
        llmModelRoot: settings.llmModelRoot,
        llamaServerPath: settings.llamaServerPath,
        models: [
          {
            id: 'fun-asr-nano',
            name: 'Fun-ASR-Nano',
            kind: 'asr',
            engine: 'fun-asr-nano',
            status: 'installed',
            modelRoot: settings.asrModelRoot,
            requiredFiles: [
              'Fun-ASR-Nano-Encoder-Adaptor.int8.onnx',
              'Fun-ASR-Nano-CTC.int8.onnx',
              'Fun-ASR-Nano-Decoder.q8_0.gguf',
              'tokens.txt',
            ],
            requiredFilesMissing: [],
          },
          {
            id: 'qwen3-0_6b',
            name: 'Qwen3 0.6B GGUF',
            kind: 'llm',
            engine: 'qwen3',
            status: 'missing',
            modelRoot: settings.llmModelRoot,
            requiredFiles: ['Qwen3-0.6B-Q8_0.gguf'],
            requiredFilesMissing: ['Qwen3-0.6B-Q8_0.gguf'],
          },
        ],
        asr: {
          status: 'mock',
          commandConfigured: false,
        },
        personaRewrite: {
          status: 'fallback',
          commandConfigured: false,
          detail: 'local_persona_rewrite_fallback',
        },
        llmRuntime: clone(llmRuntime),
        issues: [
          'asr_command_not_configured',
          'persona_rewrite_running_in_local_fallback',
        ],
      };
    },
    async getLocalLlmRuntimeStatus() {
      return clone(llmRuntime);
    },
    async startLocalLlmRuntime(input?: StartLocalLlmRuntimeRequest) {
      llmRuntime = {
        status: 'running',
        modelPath: input?.modelPath ?? 'D:/products/voice-to-text/models/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
        modelAlias: input?.modelAlias ?? 'qwen3-4b-instruct-q4_k_m',
        host: input?.host ?? '127.0.0.1',
        port: input?.port ?? 8080,
        baseUrl: `http://${input?.host ?? '127.0.0.1'}:${input?.port ?? 8080}`,
        pid: 1234,
      };

      return clone(llmRuntime);
    },
    async stopLocalLlmRuntime() {
      llmRuntime = {
        ...llmRuntime,
        status: 'stopped',
        pid: undefined,
      };

      return clone(llmRuntime);
    },
    async getSettings() {
      return clone(settings);
    },
    async updateSettings(patch: UpdateAppSettings) {
      settings = {
        ...settings,
        ...clone(patch),
      };

      return clone(settings);
    },
    async saveHotword(entry) {
      const next = clone(entry);
      const index = hotwords.findIndex(item => item.id === next.id);
      if (index >= 0) {
        hotwords[index] = next;
      } else {
        hotwords = [next, ...hotwords];
      }

      return clone(next);
    },
    async deleteHotword(id) {
      hotwords = hotwords.filter(item => item.id !== id);
      return { ok: true, id };
    },
    async saveRule(rule) {
      const next = clone(rule);
      const index = rules.findIndex(item => item.id === next.id);
      if (index >= 0) {
        rules[index] = next;
      } else {
        rules = [next, ...rules];
      }

      return clone(next);
    },
    async deleteRule(id) {
      rules = rules.filter(item => item.id !== id);
      return { ok: true, id };
    },
    async previewRules(input) {
      return applyRules(input, rules);
    },
    async deleteTranscriptRecord(id) {
      transcriptRecords = transcriptRecords.filter(item => item.id !== id);
      return { ok: true, id };
    },
    async savePersona(persona) {
      const next = clone(persona);
      const index = personas.findIndex(item => item.id === next.id);
      if (index >= 0) {
        personas[index] = next;
      } else {
        personas = [next, ...personas];
      }

      return clone(next);
    },
    async deletePersona(id) {
      personas = personas.filter(item => item.id !== id);
      return { ok: true, id };
    },
    async clearPersonaMemory(personaId?: string) {
      return personaId ? { ok: true, personaId } : { ok: true };
    },
    async saveAudioCapture(input: AudioCaptureUploadInput): Promise<AudioCaptureUploadResult> {
      return {
        audioPath: `mock://audio-captures/${Date.now()}-${input.fileName ?? 'hold-to-talk.webm'}`,
        byteLength: estimateBase64ByteLength(input.base64Data),
        mimeType: input.mimeType,
        durationMs: input.durationMs,
      };
    },
    async runDirectDictationSession(input: DictationSessionInput) {
      const now = new Date().toISOString();
      const rawText = '今天下午把会议纪要发给大家。';
      const record: TranscriptRecord = {
        id: `mock-rec-${Date.now()}`,
        createdAt: now,
        sourceApp: input.sourceApp,
        mode: 'direct',
        rawText,
        outputText: applyRules(rawText, rules),
        audioPath: input.audioPath,
        durationMs: 1200,
        latencyMs: 0,
        status: 'completed',
      };

      transcriptRecords = [record, ...transcriptRecords];

      return {
        overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
        record: clone(record),
      };
    },
    async runPersonaDictationSession(input: PersonaDictationSessionInput) {
      const now = new Date().toISOString();
      const persona = personas.find(item => item.id === input.personaId && item.enabled);
      const rawText = '怎么今天加班啊？';
      const record: TranscriptRecord = {
        id: `mock-rec-${Date.now()}`,
        createdAt: now,
        sourceApp: input.sourceApp,
        mode: 'persona',
        roleId: input.personaId,
        rawText: persona ? rawText : '',
        outputText: persona
          ? '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。'
          : '',
        audioPath: input.audioPath,
        durationMs: persona ? 1200 : undefined,
        latencyMs: persona ? 480 : 0,
        status: persona ? 'completed' : 'failed',
      };

      transcriptRecords = [record, ...transcriptRecords];

      return {
        overlayStates: persona
          ? ['listening', 'recognizing', 'completed', 'inserted']
          : ['listening', 'recognizing', 'failed'],
        record: clone(record),
      };
    },
  };
}

export const mockBackendClient: BackendClient = createMockBackendClient();
