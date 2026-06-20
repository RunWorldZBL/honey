# honey（甜美）桌面端产品设计文档

版本：0.1  
日期：2026-06-19  
状态：产品与 UI 第一版设计草案  

## 1. 产品定位

`honey`，中文名“甜美”，是一个完全离线优先的桌面端语音输入工具。用户在任意应用的输入框中按住全局热键说话，松开后文字自动上屏，同时在桌面应用内保存识别记录。

技术栈以 React + Tauri + Node.js 为准。开发规范和后端工程以 `RunWorldZBL/agent-kit` 为底座参考，采用 pnpm workspace、前后端分层、共享 API 契约、OpenSpec 工作流和 agent-kit 后端结构。CapsWriter-Offline 只作为功能参考，不沿用它的 Python 客户端/服务端实现方式。Tauri 负责桌面壳、窗口、托盘和系统能力接入；Node.js 作为本产品的后端服务层，后续承载音频处理、ASR 调用、人设处理、模型管理和本地数据读写。

第一版先做桌面端 UI 界面和前后端接口形状，不接真实 ASR、LLM、全局热键和音频采集。所有运行结果先用 mock 数据表达真实产品状态。

## 2. 产品目标

- 默认提供低打扰的“直接转写”体验，像输入法一样随叫随用。
- 保留 CapsWriter-Offline 的核心能力：按键说话上屏、热词、规则替换、文件转录、记录归档、录音保存、托盘入口、人设处理、模型选择。
- 用正式桌面 UI 替代手动编辑配置文件，让非技术用户也能配置热键、模型、热词和人设。
- Windows 作为第一目标平台，UI 和业务结构预留 macOS、Linux 适配空间。
- 所有敏感数据默认留在本机，包括录音、识别文本、改写文本、模型和配置。
- 前端 UI 选型参考本机 `C:\Users\benlin\Desktop\solution\frontend`：React 19、Vite 8、Tailwind CSS v4、shadcn/Radix 风格组件、lucide-react、Zustand、React Query。

## 3. 目标用户与场景

目标用户：

- 办公用户：在微信、钉钉、飞书、邮件、文档中快速输入长句。
- 开发者和专业用户：通过热词确保框架名、产品名、英文术语准确。
- 内容工作者：将语音草稿快速转成文本，并保留历史记录。
- 本地隐私敏感用户：希望不依赖云端服务完成语音输入。

核心场景：

- 用户把光标放在任意输入框，按住 CapsLock 或自定义热键，说完松开，文本自动粘贴到当前位置。
- 用户打开应用历史记录，查看刚才的原始识别文本、处理结果、录音文件和时间。
- 用户添加热词或规则，例如把“扣文”替换为“Qwen”，把“艾特某某点 com”转成邮箱格式。
- 用户选择是否开启“人设模式”。默认关闭，开启后才加载本地 LLM，并按当前人设输出。
- 用户在文件转录页面拖入音视频文件，查看未来要支持的任务队列、输出格式和结果入口。

## 4. 第一版范围

第一版只开发 UI 与 mock 业务状态。

包含：

- 桌面应用主窗口 UI。
- 首页状态面板：当前模式、热键、模型状态、最近一次识别结果。
- 历史记录页：文本记录、音频记录占位、复制、搜索、筛选、删除入口。
- 热词管理页：热词、别名、黑名单、启停状态。
- 规则替换页：简单替换、正则替换、启停状态、测试输入。
- 人设设置页：人设模式总开关、人设列表、人设配置、默认关闭状态。
- 模型页：ASR 模型、LLM 模型、安装状态、推荐配置、低配/质量档说明。
- 文件转录页：批量任务列表、输出格式、进度、结果文件占位。
- 设置页：热键、输出方式、语言、剪贴板恢复、开机启动、隐私存储。
- 托盘菜单的 UI 设计说明与未来接入点。
- 听写状态浮层：按住热键时在屏幕中下方显示横向提示条和音浪波纹，松开后显示识别文本。
- 完整窗口与迷你窗口双形态：用户可在完整控制台和轻量小窗之间切换。
- Node.js 后端接口设计草案和 mock 数据约定。

不包含：

- 真实全局热键监听。
- 真实麦克风录音。
- 真实 ASR 推理。
- 真实 LLM 改写。
- 真实上屏输入。
- 真实模型下载。
- 真实文件转录。
- 自动更新和安装包构建。

## 5. 模式设计

### 直接转写

默认模式。用户按住热键说话，松开后走 ASR，识别出的原文直接上屏。UI 中应突出“快、轻、默认不调用 LLM”。

第一版 UI 用 mock 状态表达流程：

```text
空闲 -> 按住说话 -> 识别中 -> 已上屏 -> 写入历史记录
```

### 人设模式

用户手动开启后才生效。流程是 ASR 先得到原文，再把原文交给本地 LLM 按当前人设处理，最终上屏处理后的文本。UI 必须明确提示：该模式会增加内存占用和等待时间。

默认行为：

- 默认关闭。
- 开启后需要选择 LLM 模型。
- 可选择或创建人设，例如“职场老油条”“正式邮件”“客服语气”“翻译助手”。
- 每个人设可以绑定不同模型、提示词、输出方式和是否保留上下文。
- 历史记录同时保存原文和人设处理结果。

### 文件转录

第一版只做 UI。未来支持拖入音视频文件，生成 `.srt`、`.txt`、`.json`。参考 CapsWriter-Offline 的文件转录能力，但在 UI 中表现为任务队列和结果列表。

### 浮窗/Toast 助手

作为后续增强。用于翻译选中文字、总结文本、问答等不一定直接上屏的结果。第一版只在人设设置页保留输出方式选项，不实现浮窗系统能力。

### 听写状态浮层

听写状态浮层是用户按住热键时最重要的即时反馈。它不属于主窗口，而是一个覆盖在屏幕中下方的轻量横条，用来告诉用户 honey 正在听、是否检测到声音，以及松开按键后识别到了什么。

状态设计：

```text
空闲：不显示
按下热键：显示横条，状态为“正在听”
说话中：横条中显示随音量变化的音浪波纹
安静中：横条保留，但音浪归零或几乎静止
松开热键：切换为“识别中”
识别完成：短暂显示刚才识别到的文本
上屏完成：显示“已输入”并自动淡出
失败：显示错误提示和重试入口
```

实时按键说话链路使用原生桌面录音能力采集 `16kHz / mono / PCM16 WAV`，并用麦克风 RMS 音量驱动音浪；用户不说话时波形保持静止。MP3 不作为实时上屏主格式，后续只用于已有文件导入或历史音频压缩归档，进入语音转文字模型前统一转成 PCM。

视觉要求：

- 位置：屏幕中下方，避开输入框和任务栏。
- 形态：一条轻量横条，不遮挡主要工作内容。
- 内容：左侧显示状态，中央显示音浪或识别文本，右侧显示当前模式。
- 识别文本可能较长，横条只显示前几行或单行截断，完整内容进入历史记录。
- 不使用营销式大弹窗，不抢焦点。

### 完整窗口与迷你窗口

honey 应支持两种窗口形态：

- 完整窗口：用于设置、历史、热词、规则、人设、模型和文件转录，是完整控制台。
- 迷你窗口：用于日常轻量使用，只显示当前状态、最近一次结果、模式切换、打开完整窗口入口。

迷你窗口目标是让不想打开重型控制台的用户也能确认 honey 是否工作。它不替代听写状态浮层；听写浮层负责“按键过程中的即时反馈”，迷你窗口负责“常驻轻量控制”。

迷你窗口第一版内容：

- honey / 甜美 标识。
- 当前模式：直接转写 / 人设模式。
- 当前语音转文字模型状态。
- 最近一次识别结果。
- 开始/停止监听的 mock 状态按钮。
- 打开完整窗口按钮。
- 设置入口。

## 6. UI 风格与主题系统

第一版 UI 必须采用 `solution` 前端项目的主题方向：Tailwind CSS v4 + shadcn/Radix 风格 primitives + lucide-react 图标。

主题系统采用双轴设计：

```text
mode: light / dark / system
palette: qinghua / zhusha / zhuqing / daimo
```

要求：

- 默认主题为 `qinghua`（青花）。
- 配色 token 使用 CSS 变量和 `oklch()`，组件不硬编码颜色。
- `<html>` 使用 `.dark` 表示深色模式，使用 `data-theme="<palette>"` 表示配色。
- 主题切换器提供“浅色 / 深色 / 跟随系统”和四种配色选择。
- 深浅色或配色切换时使用从点击位置扩散的波纹动画。优先使用 View Transitions API，fallback 使用 `.theme-ripple` DOM 动画。
- 主题切换期间用 `data-theme-changing` 冻结普通元素 transition/animation，避免页面分层阶梯式变色。

## 7. CapsWriter 功能对齐表

参考项目：HaujetZhao/CapsWriter-Offline  
参考链接：https://github.com/HaujetZhao/CapsWriter-Offline

| CapsWriter 功能 | 我们的产品设计 | 第一版 UI 状态 |
| --- | --- | --- |
| 按住 CapsLock 或鼠标侧键说话，松开上屏 | 全局热键语音输入 | 展示配置和模拟状态 |
| 对讲机模式、单击录音模式 | 按住说话、点击开始/停止 | 设置页可选 |
| 文件转录生成 srt/txt/json | 文件转录任务页面 | UI 占位和 mock 队列 |
| 数字 ITN | 数字格式化开关 | 设置页开关 |
| 热词替换 | 热词管理页 | 可增删改查 mock 数据 |
| 正则替换 | 规则替换页 | 可编辑规则和测试 |
| LLM 人设 | 人设模式和人设设置页 | 默认关闭，可配置 |
| 托盘菜单 | Tauri 托盘入口 | 文档设计，后续实现 |
| C/S 架构 | Tauri UI + Node.js 后端服务 | 接口先 mock |
| 日记归档 | 历史记录页 | mock 数据展示 |
| 录音保存 | 历史记录关联音频 | 文件路径占位 |
| 模型选择 | 模型管理页 | 展示已安装/推荐模型 |
| GPU 加速配置 | 模型高级设置 | UI 预留，不执行 |
| 录音状态提示 | 屏幕中下听写状态浮层 | mock 音浪和状态流转 |
| 轻量窗口 | 迷你窗口 | mock 状态和最近结果 |

## 8. 需求评分

评分说明：

- 用户价值：5 表示对核心体验非常关键。
- 实现复杂度：5 表示实现难度高。
- 技术风险：5 表示跨平台、权限或性能风险高。
- 优先级：P0 必须做，P1 应该做，P2 后续做。

| 需求点 | 用户价值 | 实现复杂度 | 技术风险 | 优先级 | 说明 |
| --- | ---: | ---: | ---: | --- | --- |
| 按住热键显示屏幕中下横条 | 5 | 3 | 3 | P0 | 用户需要明确知道已经开始听写；第一版可用 mock 浮层。 |
| 真实音浪波纹 | 5 | 4 | 4 | P0 | 对“正在说话”的可信反馈很关键；第一版用 mock，接入音频后必须按真实音量驱动。 |
| 安静时音浪停止 | 4 | 3 | 3 | P0 | 防止用户误以为录到了声音；依赖后续 VAD/RMS。 |
| 松开后显示刚才说的话 | 5 | 2 | 2 | P0 | 证明语音已转文字，是输入闭环的关键反馈。 |
| 上屏完成后自动淡出 | 4 | 2 | 2 | P0 | 保持输入法式轻量体验。 |
| 完整窗口 | 5 | 3 | 2 | P0 | 所有配置和管理功能依赖完整控制台。 |
| 迷你窗口 | 4 | 3 | 3 | P1 | 适合日常轻量使用；需要和完整窗口、托盘、浮层协调。 |
| 完整/迷你窗口切换 | 4 | 3 | 3 | P1 | 用户可按使用场景切换重量级界面。 |
| 迷你窗口显示最近识别结果 | 4 | 2 | 2 | P1 | 低成本提升确认感。 |
| 迷你窗口中快速切换模式 | 3 | 2 | 2 | P2 | 有用但不是第一闭环必需，避免误触。 |

## 9. 信息架构

主导航建议采用左侧栏，面向工具型桌面应用，避免做成营销页。

页面结构：

- 首页：当前状态、快捷操作、最近记录、模型健康状态。
- 迷你窗口：轻量状态、最近结果、模式指示、打开完整窗口。
- 历史记录：语音输入记录、搜索、筛选、复制、删除、查看详情。
- 热词：热词列表、别名、黑名单、启用状态、导入导出。
- 规则：正则和简单替换规则、测试区、启用状态。
- 人设设置：人设模式开关、人设列表、提示词、输出方式、模型选择。
- 模型：语音转文字模型、LLM 模型、推荐配置、下载目录提示、缺失文件清单、切换模型。
- 文件转录：拖拽区、任务队列、输出格式、结果入口。
- 设置：热键、输入方式、语言、输出方式、模型目录、隐私、启动项、日志。

首页关键元素：

- 当前模式：直接转写 / 人设模式。
- 当前热键：默认 CapsLock，可显示鼠标侧键。
- ASR 模型状态：已就绪 / 未安装 / 加载中 / 错误。
- LLM 状态：关闭 / 已选择 / 加载中。
- 最近一次结果：原文、上屏文本、耗时、目标应用。
- 快捷按钮：打开历史、管理热词、切换模式、打开设置。

听写状态浮层关键元素：

- 当前状态：正在听 / 识别中 / 已输入 / 失败。
- 音浪波形：有声音时动态变化，无声音时静止。
- 当前模式：直接转写 / 人设模式。
- 识别结果预览：松开按键后显示。

迷你窗口关键元素：

- 当前模式和模型状态。
- 最近一次识别结果。
- 打开完整窗口。
- 进入设置。

## 10. 数据模型草案

UI 第一版使用 TypeScript 类型和 mock 数据。

```ts
type DictationMode = 'direct' | 'persona';
type DictationOverlayState = 'idle' | 'listening' | 'silent' | 'recognizing' | 'completed' | 'inserted' | 'failed';
type AppWindowMode = 'full' | 'mini';
type RecordStatus = 'completed' | 'failed' | 'cancelled';
type ModelKind = 'asr' | 'llm';
type ModelStatus = 'installed' | 'missing' | 'loading' | 'error';

interface TranscriptRecord {
  id: string;
  createdAt: string;
  sourceApp?: string;
  mode: DictationMode;
  rawText: string;
  outputText: string;
  roleId?: string;
  audioPath?: string;
  durationMs?: number;
  latencyMs?: number;
  status: RecordStatus;
}

interface HotwordEntry {
  id: string;
  canonical: string;
  aliases: string[];
  blacklist: string[];
  enabled: boolean;
}

interface ReplaceRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  enabled: boolean;
}

interface PersonaProfile {
  id: string;
  name: string;
  description: string;
  prompt: string;
  outputMode: 'typing' | 'toast';
  modelId?: string;
  enabled: boolean;
  keepContext: boolean;
}

interface ModelProfile {
  id: string;
  kind: ModelKind;
  name: string;
  engine: 'fun-asr-nano' | 'sensevoice' | 'qwen3-asr' | 'qwen3' | 'custom';
  status: ModelStatus;
  sizeLabel?: string;
  recommendedTier: 'low' | 'default' | 'quality' | 'experimental';
}

interface DictationOverlaySnapshot {
  state: DictationOverlayState;
  mode: DictationMode;
  volumeLevel: number;
  previewText?: string;
  errorMessage?: string;
}

interface MiniWindowState {
  windowMode: AppWindowMode;
  currentMode: DictationMode;
  asrModelStatus: ModelStatus;
  latestRecordId?: string;
}
```

## 11. 技术架构原则

第一版 UI 架构：

```text
pnpm workspace
  -> frontend: React UI and mock backend adapter
  -> shared/api-contracts: Zod schemas and shared types
  -> src-tauri: desktop shell and system integration
  -> backend: future Node.js local service
```

正式后端架构：

```text
Tauri app
  -> desktop shell commands
      -> global hotkey
      -> text insertion
      -> Node backend process lifecycle
  -> Node.js local backend service
      -> audio service
      -> ASR engine adapter
      -> persona engine adapter
      -> overlay/window state service
      -> hotword/rule processor
      -> history store
      -> model manager
```

约束：

- 不采用 CapsWriter 的 Python 配置文件交互。
- 后端业务逻辑归 Node.js，Tauri Rust 层尽量薄，只处理桌面系统能力和 sidecar 生命周期。
- 前端通过统一 backend client 调用服务；开发态允许读接口降级到 mock，但听写、设置保存、模型运行时等关键动作应优先走本地 Node 后端。
- Tauri 桌面壳负责在桌面环境中尝试启动 Node 后端进程；正式安装包阶段需要把 Node 后端作为 sidecar 一起分发。
- 历史记录、热词、规则、人设、模型配置都按本地数据设计，不依赖云端。
- 涉及 API 字段、枚举、请求体或响应体时，先更新 `shared/api-contracts`，前端和后端不得各自手写一份类型。
- 听写状态浮层和迷你窗口共享同一份状态源，避免主窗口、迷你窗口、浮层显示互相矛盾。

## 12. 隐私与权限

- 默认所有录音和文本只存本地。
- UI 必须提供“是否保存录音”的开关。
- 输出到其他应用时默认使用剪贴板粘贴，并提供“粘贴后恢复剪贴板”开关。
- 历史记录可以按条删除，后续可增加自动清理策略。
- 人设模式默认关闭，避免用户误以为每次输入都会调用大模型。
- 未来 macOS 和 Linux 需要单独处理麦克风、辅助功能、全局热键、输入模拟权限、无焦点浮层窗口权限。

## 13. 第一版 UI 验收标准

- 应用能展示完整桌面主界面，而不是落地页。
- 左侧导航和全部核心页面可访问。
- UI 使用 Tailwind CSS v4 + shadcn/Radix 风格 primitives，不使用临时自定义基础控件替代成熟组件。
- 主题切换器、四套配色和暗色模式波纹动画可见。
- 首页能清楚表达当前模式、热键、模型状态和最近记录。
- 听写状态浮层能展示 listening、silent、recognizing、completed、inserted、failed 状态。
- 听写状态浮层在 listening 状态显示音浪，silent 状态音浪停止或接近静止。
- 松开热键后的 completed 状态能显示刚才识别到的文本预览。
- 迷你窗口能显示 honey 标识、当前模式、模型状态、最近一次识别结果和打开完整窗口入口。
- 历史记录页能展示直接转写和人设模式两种记录形态。
- 热词和规则页面能完成 mock 数据的增删改查交互。
- 人设设置页默认展示人设模式关闭，并能表达开启后的资源成本。
- 模型页能展示低配、默认、质量、实验四档推荐，并明确提示模型不会打进安装包，用户应把模型下载到当前配置目录。
- 文件转录页能展示拖拽区、任务队列和输出格式。
- 设置页能覆盖热键、语言、输出方式、模型目录、隐私和启动项。
- UI 文案避免使用只有开发者懂的术语；必须把 ASR 解释为“语音转文字模型”。
