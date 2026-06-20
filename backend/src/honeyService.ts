import type {
  AppSettings,
  AudioCaptureUploadInput,
  AudioCaptureUploadResult,
  DictationSessionInput,
  DictationSessionResult,
  FileTranscriptionTask,
  HotwordEntry,
  LocalModelInventoryItem,
  LocalLlmRuntimeStatus,
  ModelProfile,
  PersonaDictationSessionInput,
  PersonaProfile,
  ReplaceRule,
  RuntimeHealth,
  StartLocalLlmRuntimeInput,
  StartLocalLlmRuntimeRequest,
  TrayAction,
  TranscriptRecord,
  UpdateAppSettings,
} from '@honey/api-contracts';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

import {
  seedFileTranscriptionTasks,
  seedHotwords,
  seedPersonas,
  seedRules,
  seedSettings,
  seedTranscriptRecords,
  seedTrayActions,
} from './seedData.js';
import type { AsrAdapter } from './asrAdapter.js';
import { createMockAsrAdapter } from './asrAdapter.js';
import { getFunAsrNanoRuntimeIssue } from './funAsrNanoRunner.js';
import { createLocalDataStore, type PersistedHoneyData } from './localDataStore.js';
import {
  createNodeLocalLlmRuntimeController,
  createStoppedLocalLlmRuntimeController,
  type LocalLlmRuntimeController,
} from './localLlmRuntime.js';
import { scanLocalModelInventory } from './modelInventory.js';
import type { PersonaRewriteAdapter } from './personaRewriteAdapter.js';
import { createLocalPersonaRewriteAdapter, createOpenAiCompatiblePersonaRewriteAdapter } from './personaRewriteAdapter.js';

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

const applyHotwords = (input: string, hotwords: HotwordEntry[]) =>
  hotwords.reduce((text, hotword) => {
    if (!hotword.enabled || !text) {
      return text;
    }

    return hotword.aliases.reduce(
      (nextText, alias) => nextText.split(alias).join(hotword.canonical),
      text,
    );
  }, input);

const createRecordId = () => `rec-${Date.now()}`;

const allowedAudioExtensions = new Set(['.wav', '.webm', '.ogg', '.mp3', '.m4a', '.flac']);

const audioExtensionByMimeType: Record<string, string> = {
  'audio/flac': '.flac',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-wav': '.wav',
};

const resolveAudioCaptureExtension = (input: AudioCaptureUploadInput) => {
  const fileExtension = input.fileName ? extname(input.fileName).toLowerCase() : '';
  if (allowedAudioExtensions.has(fileExtension)) {
    return fileExtension;
  }

  return audioExtensionByMimeType[input.mimeType.toLowerCase()] ?? '.bin';
};

const createAudioCaptureDirectory = (localDataPath: string) => join(localDataPath, 'audio-captures');

const isPathInsideDirectory = (path: string, directory: string) => {
  const relativePath = relative(resolve(directory), resolve(path));
  return relativePath.length > 0 && !relativePath.startsWith('..') && !isAbsolute(relativePath);
};

const deleteUploadedAudioIfDiscarded = async (audioPath: string, settings: AppSettings) => {
  if (settings.saveAudio) {
    return;
  }

  const captureDirectory = createAudioCaptureDirectory(settings.localDataPath);
  if (!isPathInsideDirectory(audioPath, captureDirectory)) {
    return;
  }

  await unlink(audioPath).catch(() => undefined);
};

const resolveRuntimeIssueStatus = (issue?: string) => {
  if (!issue) {
    return 'ready';
  }

  return issue.startsWith('fun_asr_nano_model_missing')
    || issue.startsWith('fun_asr_nano_runtime_unavailable')
    ? 'missing'
    : 'error';
};

const canUseLocalLlmRuntimeForPersonaRewrite = (status: LocalLlmRuntimeStatus) =>
  status.status === 'running' && Boolean(status.baseUrl && status.modelAlias);

const candidateModels: ModelProfile[] = [
  {
    id: 'fun-asr-nano',
    kind: 'asr',
    name: 'Fun-ASR-Nano',
    engine: 'fun-asr-nano',
    status: 'missing',
    sizeLabel: '约 200 MB',
    recommendedTier: 'low',
    memoryHint: '2 GB 可用内存起步',
    cpuHint: '普通笔记本 CPU 可运行',
  },
  {
    id: 'sensevoice-small',
    kind: 'asr',
    name: 'SenseVoiceSmall',
    engine: 'sensevoice',
    status: 'missing',
    sizeLabel: '约 900 MB',
    recommendedTier: 'default',
    memoryHint: '建议 4 GB 可用内存',
    cpuHint: 'CPU 可运行，GPU 更稳',
  },
  {
    id: 'qwen3-asr-0_6b',
    kind: 'asr',
    name: 'Qwen3-ASR 0.6B',
    engine: 'qwen3-asr',
    status: 'missing',
    sizeLabel: '约 1.2 GB',
    recommendedTier: 'quality',
    memoryHint: '建议 6 GB 可用内存',
    cpuHint: '更适合有 NPU/GPU 的机器',
  },
  {
    id: 'qwen3-0_6b',
    kind: 'llm',
    name: 'Qwen3 0.6B',
    engine: 'qwen3',
    status: 'missing',
    sizeLabel: '约 500 MB - 1 GB',
    recommendedTier: 'low',
    memoryHint: '适合轻量人设处理',
    cpuHint: 'CPU 可用，速度取决于量化格式',
  },
  {
    id: 'qwen3-1_7b',
    kind: 'llm',
    name: 'Qwen3 1.7B',
    engine: 'qwen3',
    status: 'missing',
    sizeLabel: '约 1.2 GB - 2.5 GB',
    recommendedTier: 'default',
    memoryHint: '建议 6 GB 可用内存',
    cpuHint: '适合默认人设模式',
  },
  {
    id: 'qwen3-4b',
    kind: 'llm',
    name: 'Qwen3 4B',
    engine: 'qwen3',
    status: 'missing',
    sizeLabel: '约 3 GB - 5 GB',
    recommendedTier: 'quality',
    memoryHint: '建议 10 GB 可用内存',
    cpuHint: '人设质量更好，但不适合低配常驻',
  },
];

const createModelProfiles = async (modelRoot: string, llmModelRoot: string): Promise<ModelProfile[]> => {
  const inventory = await scanLocalModelInventory(modelRoot, llmModelRoot);
  const statusById = new Map(inventory.map(model => [model.id, model.status]));

  return candidateModels.map(model => ({
    ...model,
    status: statusById.get(model.id) ?? model.status,
  }));
};

const hasInstalledLocalModel = (models: LocalModelInventoryItem[]) =>
  models.some(model => model.status === 'installed');

const defaultLlmModelFile = 'Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf';
const defaultLlmModelAlias = 'qwen3-4b-instruct-q4_k_m';

export interface HoneyService {
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: UpdateAppSettings): Promise<AppSettings>;
  listTranscriptRecords(): Promise<TranscriptRecord[]>;
  deleteTranscriptRecord(id: string): Promise<{ ok: true; id: string }>;
  listHotwords(): Promise<HotwordEntry[]>;
  saveHotword(entry: HotwordEntry): Promise<HotwordEntry>;
  deleteHotword(id: string): Promise<{ ok: true; id: string }>;
  listRules(): Promise<ReplaceRule[]>;
  saveRule(rule: ReplaceRule): Promise<ReplaceRule>;
  deleteRule(id: string): Promise<{ ok: true; id: string }>;
  previewRules(input: string): Promise<string>;
  listPersonas(): Promise<PersonaProfile[]>;
  savePersona(persona: PersonaProfile): Promise<PersonaProfile>;
  deletePersona(id: string): Promise<{ ok: true; id: string }>;
  listModels(): Promise<ModelProfile[]>;
  listFileTranscriptionTasks(): Promise<FileTranscriptionTask[]>;
  listTrayActions(): Promise<TrayAction[]>;
  clearPersonaMemory(personaId?: string): Promise<{ ok: true; personaId?: string }>;
  wasPersonaMemoryCleared(personaId: string): Promise<boolean>;
  scanLocalModels(): Promise<LocalModelInventoryItem[]>;
  getRuntimeHealth(): Promise<RuntimeHealth>;
  getLocalLlmRuntimeStatus(): Promise<LocalLlmRuntimeStatus>;
  startLocalLlmRuntime(input?: StartLocalLlmRuntimeRequest): Promise<LocalLlmRuntimeStatus>;
  stopLocalLlmRuntime(): Promise<LocalLlmRuntimeStatus>;
  saveAudioCapture(input: AudioCaptureUploadInput): Promise<AudioCaptureUploadResult>;
  runDirectDictationSession(input: DictationSessionInput): Promise<DictationSessionResult>;
  runPersonaDictationSession(input: PersonaDictationSessionInput): Promise<DictationSessionResult>;
}

export interface HoneyServiceOptions {
  modelRoot?: string;
  llmModelRoot?: string;
  asrAdapter?: AsrAdapter;
  personaRewriteAdapter?: PersonaRewriteAdapter;
  localLlmRuntimeController?: LocalLlmRuntimeController;
  localLlmRuntimeDefaults?: Partial<StartLocalLlmRuntimeInput>;
  localLlmRuntimeExecutablePath?: string;
  localLlmRuntimeCwd?: string;
  llamaServerPath?: string;
  dataFilePath?: string;
  runtimeCommands?: {
    asrConfigured?: boolean;
    personaRewriteConfigured?: boolean;
  };
}

export function createHoneyService(options: HoneyServiceOptions = {}): HoneyService {
  const dataStore = createLocalDataStore(options.dataFilePath);
  const defaultAsrModelRoot = options.modelRoot ?? seedSettings.asrModelRoot;
  const defaultLlmModelRoot = options.llmModelRoot ?? seedSettings.llmModelRoot;
  const defaultLlamaServerPath = options.llamaServerPath
    ?? options.localLlmRuntimeExecutablePath
    ?? seedSettings.llamaServerPath;
  const defaultData: PersistedHoneyData = {
    records: clone(seedTranscriptRecords),
    hotwords: clone(seedHotwords),
    rules: clone(seedRules),
    personas: clone(seedPersonas),
    settings: {
      ...clone(seedSettings),
      asrModelRoot: defaultAsrModelRoot,
      llmModelRoot: defaultLlmModelRoot,
      llamaServerPath: defaultLlamaServerPath,
    },
  };
  const persistedData = dataStore.load(defaultData);
  let transcriptRecords = clone(persistedData.records);
  let hotwords = clone(persistedData.hotwords);
  let rules = clone(persistedData.rules);
  let personas = clone(persistedData.personas);
  let fileTranscriptionTasks = clone(seedFileTranscriptionTasks);
  let trayActions = clone(seedTrayActions);
  let settings = clone(persistedData.settings);
  const clearedPersonaMemoryIds = new Set<string>();
  const asrAdapter = options.asrAdapter ?? createMockAsrAdapter();
  const configuredPersonaRewriteAdapter = options.personaRewriteAdapter;
  const localPersonaRewriteAdapter = createLocalPersonaRewriteAdapter();
  const getAsrModelRoot = () => settings.asrModelRoot || defaultAsrModelRoot;
  const getLlmModelRoot = () => settings.llmModelRoot || defaultLlmModelRoot;
  const getLlamaServerPath = () => settings.llamaServerPath || defaultLlamaServerPath;
  const localLlmRuntimeController = options.localLlmRuntimeController
    ?? (options.localLlmRuntimeExecutablePath
      ? createNodeLocalLlmRuntimeController({
        executablePath: options.localLlmRuntimeExecutablePath,
        getExecutablePath: getLlamaServerPath,
        cwd: options.localLlmRuntimeCwd,
      })
      : createStoppedLocalLlmRuntimeController());
  const createLocalLlmRuntimeDefaults = (): StartLocalLlmRuntimeInput => {
    const defaults = options.localLlmRuntimeDefaults ?? {};

    return {
      ...defaults,
      modelPath: defaults.modelPath ?? join(getLlmModelRoot(), defaultLlmModelFile),
      modelAlias: defaults.modelAlias ?? defaultLlmModelAlias,
      host: defaults.host ?? '127.0.0.1',
      port: defaults.port ?? 8080,
      contextSize: defaults.contextSize ?? 4096,
    };
  };
  const runtimeCommands = {
    asrConfigured: options.runtimeCommands?.asrConfigured ?? Boolean(options.asrAdapter),
    personaRewriteConfigured: options.runtimeCommands?.personaRewriteConfigured ?? Boolean(options.personaRewriteAdapter),
  };
  const resolvePersonaRewriteAdapter = async (requestedModelId?: string) => {
    if (configuredPersonaRewriteAdapter) {
      return configuredPersonaRewriteAdapter;
    }

    const runtimeStatus = await localLlmRuntimeController.getStatus();
    if (canUseLocalLlmRuntimeForPersonaRewrite(runtimeStatus) && runtimeStatus.baseUrl) {
      return createOpenAiCompatiblePersonaRewriteAdapter({
        baseUrl: runtimeStatus.baseUrl,
        model: runtimeStatus.modelAlias ?? requestedModelId ?? createLocalLlmRuntimeDefaults().modelAlias,
      });
    }

    return localPersonaRewriteAdapter;
  };
  const createPersistedData = (overrides: Partial<PersistedHoneyData> = {}): PersistedHoneyData => ({
    records: transcriptRecords,
    hotwords,
    rules,
    personas,
    settings,
    ...overrides,
  });
  const commitLocalData = (nextData: PersistedHoneyData) => {
    dataStore.save(nextData);
    transcriptRecords = clone(nextData.records);
    hotwords = clone(nextData.hotwords);
    rules = clone(nextData.rules);
    personas = clone(nextData.personas);
    settings = clone(nextData.settings);
  };

  return {
    async getSettings() {
      return clone(settings);
    },
    async updateSettings(patch) {
      const nextSettings = {
        ...settings,
        ...clone(patch),
      };
      commitLocalData(createPersistedData({ settings: nextSettings }));

      return clone(settings);
    },
    async listTranscriptRecords() {
      return clone(transcriptRecords);
    },
    async deleteTranscriptRecord(id) {
      const nextRecords = transcriptRecords.filter(record => record.id !== id);
      commitLocalData(createPersistedData({ records: nextRecords }));
      return { ok: true, id };
    },
    async listHotwords() {
      return clone(hotwords);
    },
    async saveHotword(entry) {
      const next = clone(entry);
      const index = hotwords.findIndex(item => item.id === next.id);
      const nextHotwords = index >= 0
        ? hotwords.map(item => (item.id === next.id ? next : item))
        : [next, ...hotwords];
      commitLocalData(createPersistedData({ hotwords: nextHotwords }));

      return clone(next);
    },
    async deleteHotword(id) {
      const nextHotwords = hotwords.filter(item => item.id !== id);
      commitLocalData(createPersistedData({ hotwords: nextHotwords }));
      return { ok: true, id };
    },
    async listRules() {
      return clone(rules);
    },
    async saveRule(rule) {
      const next = clone(rule);
      const index = rules.findIndex(item => item.id === next.id);
      const nextRules = index >= 0
        ? rules.map(item => (item.id === next.id ? next : item))
        : [next, ...rules];
      commitLocalData(createPersistedData({ rules: nextRules }));

      return clone(next);
    },
    async deleteRule(id) {
      const nextRules = rules.filter(item => item.id !== id);
      commitLocalData(createPersistedData({ rules: nextRules }));
      return { ok: true, id };
    },
    async previewRules(input) {
      return applyRules(input, rules);
    },
    async listPersonas() {
      return clone(personas);
    },
    async savePersona(persona) {
      const next = clone(persona);
      const index = personas.findIndex(item => item.id === next.id);
      const nextPersonas = index >= 0
        ? personas.map(item => (item.id === next.id ? next : item))
        : [next, ...personas];
      commitLocalData(createPersistedData({ personas: nextPersonas }));

      return clone(next);
    },
    async deletePersona(id) {
      const nextPersonas = personas.filter(item => item.id !== id);
      commitLocalData(createPersistedData({ personas: nextPersonas }));
      clearedPersonaMemoryIds.delete(id);
      return { ok: true, id };
    },
    async listModels() {
      return createModelProfiles(getAsrModelRoot(), getLlmModelRoot());
    },
    async listFileTranscriptionTasks() {
      return clone(fileTranscriptionTasks);
    },
    async listTrayActions() {
      return clone(trayActions);
    },
    async clearPersonaMemory(personaId) {
      if (personaId) {
        clearedPersonaMemoryIds.add(personaId);
        return { ok: true, personaId };
      }

      personas.forEach(persona => clearedPersonaMemoryIds.add(persona.id));
      return { ok: true };
    },
    async wasPersonaMemoryCleared(personaId) {
      return clearedPersonaMemoryIds.has(personaId);
    },
    async scanLocalModels() {
      return scanLocalModelInventory(getAsrModelRoot(), getLlmModelRoot());
    },
    async getLocalLlmRuntimeStatus() {
      return localLlmRuntimeController.getStatus();
    },
    async startLocalLlmRuntime(input) {
      return localLlmRuntimeController.start({
        ...createLocalLlmRuntimeDefaults(),
        ...input,
      });
    },
    async stopLocalLlmRuntime() {
      return localLlmRuntimeController.stop();
    },
    async getRuntimeHealth() {
      const activeAsrModelRoot = getAsrModelRoot();
      const activeLlmModelRoot = getLlmModelRoot();
      const activeLlamaServerPath = getLlamaServerPath();
      const models = await scanLocalModelInventory(activeAsrModelRoot, activeLlmModelRoot);
      const llmRuntime = await localLlmRuntimeController.getStatus();
      const personaRewriteReady = runtimeCommands.personaRewriteConfigured
        || canUseLocalLlmRuntimeForPersonaRewrite(llmRuntime);
      const funAsrNanoRuntimeIssue = runtimeCommands.asrConfigured
        ? await getFunAsrNanoRuntimeIssue(activeAsrModelRoot)
        : undefined;
      const issues = [
        ...(!runtimeCommands.asrConfigured ? ['asr_command_not_configured'] : []),
        ...(funAsrNanoRuntimeIssue ? [funAsrNanoRuntimeIssue] : []),
        ...(!personaRewriteReady ? ['persona_rewrite_running_in_local_fallback'] : []),
        ...(!hasInstalledLocalModel(models) ? ['local_models_missing'] : []),
      ];

      return {
        service: 'honey-backend',
        mode: 'local',
        localDataPath: settings.localDataPath,
        audioCapturePath: createAudioCaptureDirectory(settings.localDataPath),
        modelRoot: activeAsrModelRoot,
        llmModelRoot: activeLlmModelRoot,
        llamaServerPath: activeLlamaServerPath,
        models,
        asr: {
          status: runtimeCommands.asrConfigured
            ? resolveRuntimeIssueStatus(funAsrNanoRuntimeIssue)
            : 'mock',
          commandConfigured: runtimeCommands.asrConfigured,
          detail: funAsrNanoRuntimeIssue,
        },
        personaRewrite: {
          status: personaRewriteReady ? 'ready' : 'fallback',
          commandConfigured: personaRewriteReady,
          detail: personaRewriteReady ? undefined : 'local_persona_rewrite_fallback',
        },
        llmRuntime,
        issues,
      };
    },
    async saveAudioCapture(input) {
      const audioBytes = Buffer.from(input.base64Data, 'base64');
      if (audioBytes.length === 0) {
        throw new Error('empty_audio_capture');
      }

      const extension = resolveAudioCaptureExtension(input);
      const captureDirectory = createAudioCaptureDirectory(settings.localDataPath);
      const audioPath = join(captureDirectory, `${Date.now()}-${randomUUID()}${extension}`);
      await mkdir(captureDirectory, { recursive: true });
      await writeFile(audioPath, audioBytes);

      return {
        audioPath,
        byteLength: audioBytes.length,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
      };
    },
    async runDirectDictationSession(input) {
      const now = new Date().toISOString();
      try {
        const transcription = await asrAdapter.transcribe({
          audioPath: input.audioPath,
          modelId: input.asrModelId ?? 'fun-asr-nano',
          modelRoot: getAsrModelRoot(),
          language: settings.language === 'auto' ? undefined : settings.language,
          hotwords: hotwords
            .filter(hotword => hotword.enabled)
            .map(hotword => ({
              canonical: hotword.canonical,
              aliases: [...hotword.aliases],
            })),
        });
        const outputText = applyRules(applyHotwords(transcription.text, hotwords), rules);
        const record: TranscriptRecord = {
          id: createRecordId(),
          createdAt: now,
          sourceApp: input.sourceApp,
          mode: 'direct',
          rawText: transcription.text,
          outputText,
          audioPath: settings.saveAudio ? input.audioPath : undefined,
          durationMs: transcription.durationMs,
          latencyMs: 0,
          status: 'completed',
        };

        commitLocalData(createPersistedData({ records: [record, ...transcriptRecords] }));
        await deleteUploadedAudioIfDiscarded(input.audioPath, settings);

        return {
          overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
          record: clone(record),
        };
      } catch {
        const record: TranscriptRecord = {
          id: createRecordId(),
          createdAt: now,
          sourceApp: input.sourceApp,
          mode: 'direct',
          rawText: '',
          outputText: '',
          audioPath: settings.saveAudio ? input.audioPath : undefined,
          latencyMs: 0,
          status: 'failed',
        };

        commitLocalData(createPersistedData({ records: [record, ...transcriptRecords] }));
        await deleteUploadedAudioIfDiscarded(input.audioPath, settings);

        return {
          overlayStates: ['listening', 'recognizing', 'failed'],
          record: clone(record),
        };
      }
    },
    async runPersonaDictationSession(input) {
      const now = new Date().toISOString();
      try {
        const persona = personas.find(item => item.id === input.personaId && item.enabled);
        if (!persona) {
          throw new Error('persona_unavailable');
        }

        const transcription = await asrAdapter.transcribe({
          audioPath: input.audioPath,
          modelId: input.asrModelId ?? 'fun-asr-nano',
          modelRoot: getAsrModelRoot(),
          language: settings.language === 'auto' ? undefined : settings.language,
          hotwords: hotwords
            .filter(hotword => hotword.enabled)
            .map(hotword => ({
              canonical: hotword.canonical,
              aliases: [...hotword.aliases],
            })),
        });
        const normalizedText = applyRules(applyHotwords(transcription.text, hotwords), rules);
        const personaRewriteAdapter = await resolvePersonaRewriteAdapter(input.llmModelId ?? persona.modelId);
        const rewriteInput = {
          text: normalizedText,
          persona: clone(persona),
          modelId: input.llmModelId ?? persona.modelId,
          sourceApp: input.sourceApp,
        };
        const rewrite = await personaRewriteAdapter.rewrite(rewriteInput).catch(() =>
          localPersonaRewriteAdapter.rewrite(rewriteInput),
        );
        const record: TranscriptRecord = {
          id: createRecordId(),
          createdAt: now,
          sourceApp: input.sourceApp,
          mode: 'persona',
          rawText: transcription.text,
          outputText: rewrite.text,
          roleId: persona.id,
          audioPath: settings.saveAudio ? input.audioPath : undefined,
          durationMs: transcription.durationMs,
          latencyMs: rewrite.latencyMs ?? 0,
          status: 'completed',
        };

        commitLocalData(createPersistedData({ records: [record, ...transcriptRecords] }));
        await deleteUploadedAudioIfDiscarded(input.audioPath, settings);

        return {
          overlayStates: ['listening', 'recognizing', 'completed', 'inserted'],
          record: clone(record),
        };
      } catch {
        const record: TranscriptRecord = {
          id: createRecordId(),
          createdAt: now,
          sourceApp: input.sourceApp,
          mode: 'persona',
          rawText: '',
          outputText: '',
          roleId: input.personaId,
          audioPath: settings.saveAudio ? input.audioPath : undefined,
          latencyMs: 0,
          status: 'failed',
        };

        commitLocalData(createPersistedData({ records: [record, ...transcriptRecords] }));
        await deleteUploadedAudioIfDiscarded(input.audioPath, settings);

        return {
          overlayStates: ['listening', 'recognizing', 'failed'],
          record: clone(record),
        };
      }
    },
  };
}
