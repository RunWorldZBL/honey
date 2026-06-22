import type {
  AppSettings,
  FileTranscriptionTask,
  HotwordEntry,
  PersonaProfile,
  ReplaceRule,
  TrayAction,
  TranscriptRecord,
} from '@honey/api-contracts';

export const seedTranscriptRecords: TranscriptRecord[] = [
  {
    id: 'rec-001',
    createdAt: '2026-06-19T09:42:00+08:00',
    sourceApp: '飞书',
    mode: 'direct',
    rawText: '今天下午把会议纪要发给大家。',
    outputText: '今天下午把会议纪要发给大家。',
    audioPath: 'D:/honey/audio/2026-06-19/rec-001.wav',
    durationMs: 4200,
    latencyMs: 680,
    status: 'completed',
  },
  {
    id: 'rec-002',
    createdAt: '2026-06-19T10:08:00+08:00',
    sourceApp: '企业微信',
    mode: 'persona',
    roleId: 'persona-office',
    rawText: '怎么今天加班啊？',
    outputText: '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
    audioPath: 'D:/honey/audio/2026-06-19/rec-002.wav',
    durationMs: 3600,
    latencyMs: 1880,
    status: 'completed',
  },
];

export const seedHotwords: HotwordEntry[] = [
  {
    id: 'hotword-qwen',
    canonical: 'Qwen',
    aliases: ['扣文', '千问', '通义千问'],
    blacklist: ['扣问'],
    enabled: true,
  },
  {
    id: 'hotword-honey',
    canonical: 'honey',
    aliases: ['甜美', '哈尼'],
    blacklist: [],
    enabled: true,
  },
];

export const seedRules: ReplaceRule[] = [
  {
    id: 'rule-email',
    name: '邮箱口述格式',
    pattern: '艾特',
    replacement: '@',
    isRegex: false,
    enabled: true,
  },
  {
    id: 'rule-dot-com',
    name: '网址点号清理',
    pattern: '\\s*点\\s*com',
    replacement: '.com',
    isRegex: true,
    enabled: true,
  },
];

export const seedPersonas: PersonaProfile[] = [
  {
    id: 'persona-office',
    name: '职场老油条',
    triggerAliases: ['职场', '老油条', '委婉'],
    description: '把直接表达转成更稳妥、友好的职场表达。',
    prompt: '将用户口述内容改成礼貌、清晰、保留真实意图的职场表达。',
    outputMode: 'typing',
    modelId: 'qwen3-1_7b',
    enabled: true,
    keepContext: true,
  },
];

export const seedFileTranscriptionTasks: FileTranscriptionTask[] = [
  {
    id: 'file-001',
    fileName: '产品例会录音.m4a',
    status: 'processing',
    progress: 64,
    outputFormats: ['srt', 'txt', 'json'],
  },
  {
    id: 'file-002',
    fileName: '客户访谈.mp3',
    status: 'completed',
    progress: 100,
    outputFormats: ['txt', 'merged-txt'],
    resultPath: 'D:/honey/transcripts/客户访谈.txt',
  },
  {
    id: 'file-003',
    fileName: '临时语音.wav',
    status: 'waiting',
    progress: 0,
    outputFormats: ['srt', 'txt'],
  },
];

export const seedTrayActions: TrayAction[] = [
  {
    id: 'toggle-listening',
    label: '开始/停止监听',
    description: '切换全局热键监听状态',
    enabled: false,
  },
  {
    id: 'copy-latest',
    label: '复制最新结果',
    description: '复制最近一次上屏文本',
    enabled: true,
  },
  {
    id: 'add-hotword',
    label: '添加热词',
    description: '快速打开热词表单',
    enabled: true,
  },
  {
    id: 'open-history',
    label: '打开历史记录',
    description: '查看本地归档',
    enabled: true,
  },
  {
    id: 'open-settings',
    label: '打开设置',
    description: '配置热键、模型和隐私',
    enabled: true,
  },
  {
    id: 'clear-persona-memory',
    label: '清除人设记忆',
    description: '清理本地人设上下文',
    enabled: false,
  },
  {
    id: 'quit',
    label: '退出 honey',
    description: '关闭本地服务和桌面壳',
    enabled: false,
  },
];

export const seedSettings: AppSettings = {
  defaultMode: 'direct',
  personaModeEnabled: false,
  hotkey: 'F9',
  mouseShortcut: '鼠标侧键 1',
  triggerMode: 'hold-to-talk',
  triggerThresholdMs: 0,
  outputMethod: 'paste',
  restoreClipboard: true,
  language: 'zh-CN',
  numericFormatting: true,
  removeTrailingPunctuation: false,
  saveAudio: true,
  saveHistory: true,
  localDataPath: 'D:/honey',
  asrModelRoot: 'D:/honey/models/Fun-ASR-Nano-GGUF',
  llmModelRoot: 'D:/honey/models',
  llamaServerPath: 'D:/honey/runtime/llama.cpp/llama-server.exe',
  startupEnabled: false,
  trayEnabled: true,
  defaultWindowMode: 'full',
  overlayEnabled: true,
  overlayPosition: 'bottom-center',
  gpuAcceleration: false,
  forcePasteApps: ['企业微信', '飞书', '钉钉'],
  autoEnterApps: [],
  punctuationCleanupApps: ['微信', '企业微信'],
};
