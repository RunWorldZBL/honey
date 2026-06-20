import { z } from 'zod';

export const DictationModeSchema = z.enum(['direct', 'persona']);
export type DictationMode = z.infer<typeof DictationModeSchema>;

export const DictationOverlayStateSchema = z.enum([
  'idle',
  'listening',
  'silent',
  'recognizing',
  'completed',
  'inserted',
  'failed',
]);
export type DictationOverlayState = z.infer<typeof DictationOverlayStateSchema>;

export const AppWindowModeSchema = z.enum(['full', 'mini']);
export type AppWindowMode = z.infer<typeof AppWindowModeSchema>;

export const RecordStatusSchema = z.enum(['completed', 'failed', 'cancelled']);
export type RecordStatus = z.infer<typeof RecordStatusSchema>;

export const ModelKindSchema = z.enum(['asr', 'llm']);
export type ModelKind = z.infer<typeof ModelKindSchema>;

export const ModelStatusSchema = z.enum(['installed', 'missing', 'loading', 'error', 'disabled']);
export type ModelStatus = z.infer<typeof ModelStatusSchema>;

export const OutputModeSchema = z.enum(['typing', 'toast']);
export type OutputMode = z.infer<typeof OutputModeSchema>;

export const RecommendedTierSchema = z.enum(['low', 'default', 'quality', 'experimental']);
export type RecommendedTier = z.infer<typeof RecommendedTierSchema>;

export const TranscriptRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  sourceApp: z.string().optional(),
  mode: DictationModeSchema,
  rawText: z.string(),
  outputText: z.string(),
  roleId: z.string().optional(),
  audioPath: z.string().optional(),
  durationMs: z.number().optional(),
  latencyMs: z.number().optional(),
  status: RecordStatusSchema,
});
export type TranscriptRecord = z.infer<typeof TranscriptRecordSchema>;

export const DictationSessionInputSchema = z.object({
  audioPath: z.string().min(1),
  sourceApp: z.string().optional(),
  asrModelId: z.string().optional(),
});
export type DictationSessionInput = z.infer<typeof DictationSessionInputSchema>;

export const PersonaDictationSessionInputSchema = DictationSessionInputSchema.extend({
  personaId: z.string().min(1),
  llmModelId: z.string().optional(),
});
export type PersonaDictationSessionInput = z.infer<typeof PersonaDictationSessionInputSchema>;

export const AudioCaptureUploadInputSchema = z.object({
  fileName: z.string().optional(),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
  durationMs: z.number().optional(),
});
export type AudioCaptureUploadInput = z.infer<typeof AudioCaptureUploadInputSchema>;

export const AudioCaptureUploadResultSchema = z.object({
  audioPath: z.string(),
  byteLength: z.number(),
  mimeType: z.string(),
  durationMs: z.number().optional(),
});
export type AudioCaptureUploadResult = z.infer<typeof AudioCaptureUploadResultSchema>;

export const DictationSessionResultSchema = z.object({
  overlayStates: z.array(DictationOverlayStateSchema),
  record: TranscriptRecordSchema,
});
export type DictationSessionResult = z.infer<typeof DictationSessionResultSchema>;

export const HotwordEntrySchema = z.object({
  id: z.string(),
  canonical: z.string(),
  aliases: z.array(z.string()),
  blacklist: z.array(z.string()),
  enabled: z.boolean(),
});
export type HotwordEntry = z.infer<typeof HotwordEntrySchema>;

export const ReplaceRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  pattern: z.string(),
  replacement: z.string(),
  isRegex: z.boolean(),
  enabled: z.boolean(),
});
export type ReplaceRule = z.infer<typeof ReplaceRuleSchema>;

export const PersonaProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  triggerAliases: z.array(z.string()),
  description: z.string(),
  prompt: z.string(),
  outputMode: OutputModeSchema,
  modelId: z.string().optional(),
  enabled: z.boolean(),
  keepContext: z.boolean(),
});
export type PersonaProfile = z.infer<typeof PersonaProfileSchema>;

export const ModelProfileSchema = z.object({
  id: z.string(),
  kind: ModelKindSchema,
  name: z.string(),
  engine: z.enum(['fun-asr-nano', 'sensevoice', 'qwen3-asr', 'qwen3', 'custom']),
  status: ModelStatusSchema,
  sizeLabel: z.string().optional(),
  recommendedTier: RecommendedTierSchema,
  memoryHint: z.string().optional(),
  cpuHint: z.string().optional(),
});
export type ModelProfile = z.infer<typeof ModelProfileSchema>;

export const LocalModelInventoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: ModelKindSchema,
  engine: z.string(),
  status: z.enum(['installed', 'missing']),
  modelRoot: z.string(),
  requiredFiles: z.array(z.string()),
  requiredFilesMissing: z.array(z.string()),
});
export type LocalModelInventoryItem = z.infer<typeof LocalModelInventoryItemSchema>;

export const RuntimeDependencyStatusSchema = z.enum(['ready', 'mock', 'fallback', 'missing', 'error']);
export type RuntimeDependencyStatus = z.infer<typeof RuntimeDependencyStatusSchema>;

export const RuntimeDependencyHealthSchema = z.object({
  status: RuntimeDependencyStatusSchema,
  commandConfigured: z.boolean(),
  detail: z.string().optional(),
});
export type RuntimeDependencyHealth = z.infer<typeof RuntimeDependencyHealthSchema>;

export const LocalLlmRuntimeStatusSchema = z.object({
  status: z.enum(['stopped', 'starting', 'running', 'error']),
  modelPath: z.string().optional(),
  modelAlias: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  baseUrl: z.string().optional(),
  pid: z.number().optional(),
  message: z.string().optional(),
});
export type LocalLlmRuntimeStatus = z.infer<typeof LocalLlmRuntimeStatusSchema>;

export const StartLocalLlmRuntimeInputSchema = z.object({
  modelPath: z.string().min(1),
  modelAlias: z.string().min(1),
  host: z.string().min(1).default('127.0.0.1'),
  port: z.number().int().positive().default(8080),
  contextSize: z.number().int().positive().optional(),
  threads: z.number().int().positive().optional(),
});
export type StartLocalLlmRuntimeInput = z.infer<typeof StartLocalLlmRuntimeInputSchema>;

export const StartLocalLlmRuntimeRequestSchema = z.object({
  modelPath: z.string().min(1).optional(),
  modelAlias: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
  contextSize: z.number().int().positive().optional(),
  threads: z.number().int().positive().optional(),
});
export type StartLocalLlmRuntimeRequest = z.infer<typeof StartLocalLlmRuntimeRequestSchema>;

export const RuntimeHealthSchema = z.object({
  service: z.literal('honey-backend'),
  mode: z.literal('local'),
  localDataPath: z.string(),
  audioCapturePath: z.string(),
  modelRoot: z.string(),
  llmModelRoot: z.string(),
  llamaServerPath: z.string(),
  models: z.array(LocalModelInventoryItemSchema),
  asr: RuntimeDependencyHealthSchema,
  personaRewrite: RuntimeDependencyHealthSchema,
  llmRuntime: LocalLlmRuntimeStatusSchema,
  issues: z.array(z.string()),
});
export type RuntimeHealth = z.infer<typeof RuntimeHealthSchema>;

export const DictationOverlaySnapshotSchema = z.object({
  state: DictationOverlayStateSchema,
  mode: DictationModeSchema,
  volumeLevel: z.number().min(0).max(1),
  previewText: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type DictationOverlaySnapshot = z.infer<typeof DictationOverlaySnapshotSchema>;

export const MiniWindowStateSchema = z.object({
  windowMode: AppWindowModeSchema,
  currentMode: DictationModeSchema,
  asrModelStatus: ModelStatusSchema,
  latestRecordId: z.string().optional(),
});
export type MiniWindowState = z.infer<typeof MiniWindowStateSchema>;

export const FileTranscriptionTaskSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: z.enum(['waiting', 'processing', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  outputFormats: z.array(z.enum(['srt', 'txt', 'json', 'merged-txt'])),
  resultPath: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type FileTranscriptionTask = z.infer<typeof FileTranscriptionTaskSchema>;

export const TrayActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  enabled: z.boolean(),
});
export type TrayAction = z.infer<typeof TrayActionSchema>;

export const AppSettingsSchema = z.object({
  defaultMode: DictationModeSchema,
  personaModeEnabled: z.boolean(),
  hotkey: z.string(),
  mouseShortcut: z.string(),
  triggerMode: z.enum(['hold-to-talk', 'click-to-toggle']),
  triggerThresholdMs: z.number(),
  outputMethod: z.enum(['paste', 'typing']),
  restoreClipboard: z.boolean(),
  language: z.enum(['auto', 'zh-CN', 'en-US', 'ja-JP']),
  numericFormatting: z.boolean(),
  removeTrailingPunctuation: z.boolean(),
  saveAudio: z.boolean(),
  saveHistory: z.boolean(),
  localDataPath: z.string(),
  asrModelRoot: z.string(),
  llmModelRoot: z.string(),
  llamaServerPath: z.string(),
  startupEnabled: z.boolean(),
  trayEnabled: z.boolean(),
  defaultWindowMode: AppWindowModeSchema,
  overlayEnabled: z.boolean(),
  overlayPosition: z.enum(['bottom-center', 'bottom-left', 'bottom-right']),
  gpuAcceleration: z.boolean(),
  forcePasteApps: z.array(z.string()),
  autoEnterApps: z.array(z.string()),
  punctuationCleanupApps: z.array(z.string()),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const UpdateAppSettingsSchema = AppSettingsSchema.partial();
export type UpdateAppSettings = z.infer<typeof UpdateAppSettingsSchema>;

export const HoneySnapshotSchema = z.object({
  records: z.array(TranscriptRecordSchema),
  hotwords: z.array(HotwordEntrySchema),
  rules: z.array(ReplaceRuleSchema),
  personas: z.array(PersonaProfileSchema),
  models: z.array(ModelProfileSchema),
  tasks: z.array(FileTranscriptionTaskSchema),
  trayActions: z.array(TrayActionSchema),
  settings: AppSettingsSchema,
});
export type HoneySnapshot = z.infer<typeof HoneySnapshotSchema>;
