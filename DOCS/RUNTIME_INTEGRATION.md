# honey Runtime Integration Notes

版本：0.1  
日期：2026-06-20  
状态：开发中

## 当前目标

本文件记录 UI V1 之后的真实运行接入点。`PRODUCT_DESIGN.md` 和 `UI_IMPLEMENTATION_PLAN.md` 仍保留第一版 UI 范围；本文件用于后续实现真实录音、语音转文字模型、本地 LLM 人设处理、全局热键和系统上屏。

## 当前已接入的运行链路

### 1. 录音上传保存

前端或 Tauri WebView 可以把录音结果上传到本地 Node.js 后端：

```http
POST /api/audio-captures
content-type: application/json
```

请求体：

```json
{
  "fileName": "hold-to-talk.webm",
  "mimeType": "audio/webm",
  "base64Data": "base64 audio bytes",
  "durationMs": 1200
}
```

返回体：

```json
{
  "audioPath": "D:/honey/audio-captures/<id>.webm",
  "byteLength": 12345,
  "mimeType": "audio/webm",
  "durationMs": 1200
}
```

后端只使用受控目录和服务端生成的文件名，不使用用户传入的文件名作为真实路径。音频默认保存到当前设置 `localDataPath/audio-captures`。

如果用户在设置中关闭“保存录音”，上传音频仍会先落成本地临时文件供语音转文字模型读取，但直接转写或人设模式会话结束后会删除该文件，并且历史记录不保存 `audioPath`。删除范围只限 `localDataPath/audio-captures` 下由 honey 上传的文件，不会删除用户传入的任意外部路径。

### 2. WebView 麦克风录音

`frontend/src/api/desktopShell.ts` 已提供基于浏览器 `MediaRecorder` 的录音适配：

- 按下热键时调用 `navigator.mediaDevices.getUserMedia({ audio: true })`。
- 松开热键时停止 `MediaRecorder`，将音频 `Blob` 转成 base64。
- 录音过程中使用 Web Audio `AnalyserNode` 采样时域 RMS 音量，并通过 `useMockDictationHotkey` 更新听写浮层的 `volumeLevel`。
- `DictationOverlay` 会根据真实 `volumeLevel` 缩放音浪高度；音量低于阈值时波形保持静止。
- `useMockDictationHotkey` 会先调用 `backendClient.saveAudioCapture` 保存音频，再把返回的 `audioPath` 交给后端听写会话。

这一步让“真实麦克风数据 -> 实时音量反馈 -> 本地音频文件路径 -> ASR 会话输入”的链路具备可测边界。

### 3. Tauri 全局热键桥接

Tauri Rust 壳层已接入 `tauri-plugin-global-shortcut`：

- `honey_register_hold_to_talk_hotkey` 注册按住说话热键。
- `honey_unregister_hold_to_talk_hotkey` 取消当前热键。
- Rust 侧把系统热键 `Pressed` / `Released` 转成稳定 WebView 事件：`honey://hold-to-talk-hotkey`。
- 前端 `desktopShellClient.onHoldToTalkHotkey` 监听该事件，并复用现有按住说话流程。
- 开发环境仍保留浏览器 `keydown` / `keyup` fallback，方便不启动 Tauri 时测试 UI。

当前热键事件已能驱动：

```text
global hotkey pressed -> listening overlay -> MediaRecorder start
global hotkey released -> MediaRecorder stop -> upload audio -> direct/persona session -> insert text
```

这一步已经具备源码级测试和 Windows Tauri 打包验证；仍需要在真实桌面安装包中做人工 E2E 验证，确认不同应用输入框焦点、权限弹窗和系统热键占用场景。

### 4. 直接转写和人设模式会话

直接转写：

```http
POST /api/dictation/direct-session
```

人设模式：

```http
POST /api/dictation/persona-session
```

两种会话都接收 `audioPath`，并写入历史记录。人设模式会先走语音转文字模型，再把原文交给人设处理器。未配置本地 LLM 时，后端会使用内置的本地规则兜底；配置 `HONEY_PERSONA_OPENAI_BASE_URL` 或 `HONEY_PERSONA_REWRITE_COMMAND` 后才会进入真实本地 LLM 改写路径。

### 5. 本地 ASR 和 LLM 适配器

默认后端运行时会直接使用内置 Fun-ASR-Nano CTC runner，不再需要先配置 `HONEY_ASR_COMMAND` 才能进入真实 ASR 路径。

正式安装包不内置 ASR 或 LLM 模型。首次启动时，后端会把模型目录默认指向用户数据区，并在设置页和模型页提示用户把模型下载或移动到这些目录：

```text
%APPDATA%\honey\models\Fun-ASR-Nano-GGUF
%APPDATA%\honey\models\llm
%APPDATA%\honey\runtime\llama.cpp\llama-server.exe
```

开发态从 `backend/` 目录启动时仍默认扫描仓库内的本地目录，便于调试：

```powershell
$env:HONEY_MODEL_ROOT = '../Fun-ASR-Nano-GGUF'
$env:HONEY_LLM_MODEL_ROOT = '../models'
```

模型页会展示当前设置中的目录和每个模型需要的文件名。当前本机开发目录可放入：

```text
models/Qwen3-0.6B-Q8_0.gguf
models/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

后端会把它们识别为 `qwen3-0_6b` 和 `qwen3-4b` 已安装模型。用户放入 LLM 目录的其它 `.gguf` 文件会按本地自定义人设模型扫描出来，并可在模型页选择启动。`models/` 已加入 `.gitignore`，这些 GGUF 大文件只保留在本机，不提交到 Git，也不会被打进安装包。

如需替换成其它本地 ASR runner，可以用 `HONEY_ASR_COMMAND` 覆盖默认内置 runner。人设模式可以使用后端托管的 llama.cpp server，也可以外接 LM Studio 或其它兼容 `/v1/chat/completions` 的本地服务：

```powershell
$env:HONEY_PERSONA_OPENAI_BASE_URL = 'http://127.0.0.1:8080'
$env:HONEY_PERSONA_OPENAI_MODEL = 'qwen3-4b-instruct-q4_k_m'
$env:HONEY_PERSONA_OPENAI_TIMEOUT_MS = '30000'
```

项目内已经提供 llama.cpp Windows CPU 版启动入口：

```powershell
pnpm dev:llm
```

默认加载：

```text
models/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

低配机器可以改用 0.6B 模型：

```powershell
$env:HONEY_LLM_MODEL_PATH = 'D:\products\voice-to-text\models\Qwen3-0.6B-Q8_0.gguf'
$env:HONEY_PERSONA_OPENAI_MODEL = 'qwen3-0_6b'
pnpm dev:llm
```

`pnpm dev:llm` 会启动 `.tools/llama.cpp/llama-server.exe`，默认监听 `http://127.0.0.1:8080`。如果使用独立启动脚本，需要让后端连接这个 OpenAI-compatible 地址：

```powershell
$env:HONEY_PERSONA_OPENAI_BASE_URL = 'http://127.0.0.1:8080'
$env:HONEY_PERSONA_OPENAI_MODEL = 'qwen3-4b-instruct-q4_k_m'
```

桌面开发有两个入口：

```powershell
pnpm dev:desktop
```

这个入口只启动桌面壳、前端和后端；人设模式在没有额外环境变量时使用本地规则兜底。

```powershell
pnpm dev:desktop:llm
```

这个入口会在 Tauri dev 启动时额外拉起 `pnpm dev:llm`，并自动给后端注入：

```powershell
$env:HONEY_PERSONA_OPENAI_BASE_URL = 'http://127.0.0.1:8080'
$env:HONEY_PERSONA_OPENAI_MODEL = 'qwen3-4b-instruct-q4_k_m'
$env:HONEY_PERSONA_OPENAI_TIMEOUT_MS = '30000'
```

如需低配模式，可在启动前改用 0.6B：

```powershell
$env:HONEY_LLM_MODEL_PATH = 'D:\products\voice-to-text\models\Qwen3-0.6B-Q8_0.gguf'
$env:HONEY_PERSONA_OPENAI_MODEL = 'qwen3-0_6b'
pnpm dev:desktop:llm
```

也可以用命令式 runner 接入自定义本地 LLM：

```powershell
$env:HONEY_ASR_COMMAND = 'node D:\path\to\asr-runner.mjs'
$env:HONEY_ASR_TIMEOUT_MS = '30000'
$env:HONEY_PERSONA_REWRITE_COMMAND = 'node D:\path\to\persona-runner.mjs'
$env:HONEY_PERSONA_REWRITE_TIMEOUT_MS = '30000'
$env:HONEY_DATA_FILE = 'D:\honey\honey-data.json'
```

如果没有配置 `HONEY_PERSONA_OPENAI_BASE_URL` 或 `HONEY_PERSONA_REWRITE_COMMAND`，人设模式不会失败，而是进入 `local_persona_rewrite_fallback`。这个兜底只覆盖少量明确规则，例如“职场老油条”会把“怎么今天加班啊？”转成更稳妥的职场表达。它不是完整 LLM 能力，只用于模型下载和真实 runner 接入前保证流程可用。

Node 后端现在也提供本地 LLM runtime 进程托管 API，不再只能依赖外部脚本手动启动：

```http
GET /api/runtime/llm
POST /api/runtime/llm/start
POST /api/runtime/llm/stop
```

`POST /api/runtime/llm/start` 可以传入完整配置：

```json
{
  "modelPath": "D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf",
  "modelAlias": "qwen3-0_6b",
  "host": "127.0.0.1",
  "port": 18082,
  "contextSize": 4096,
  "threads": 6
}
```

也可以不传请求体，后端会使用默认配置：

```text
.tools/llama.cpp/llama-server.exe
models/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
http://127.0.0.1:8080
qwen3-4b-instruct-q4_k_m
```

默认配置可通过这些环境变量覆盖：

```powershell
$env:HONEY_LLAMA_SERVER_PATH = 'D:\products\voice-to-text\.tools\llama.cpp\llama-server.exe'
$env:HONEY_LLM_MODEL_PATH = 'D:\products\voice-to-text\models\Qwen3-0.6B-Q8_0.gguf'
$env:HONEY_LLM_HOST = '127.0.0.1'
$env:HONEY_LLM_PORT = '18082'
$env:HONEY_PERSONA_OPENAI_MODEL = 'qwen3-0_6b'
$env:HONEY_LLM_CTX_SIZE = '4096'
$env:HONEY_LLM_THREADS = '6'
```

当 `llmRuntime.status` 为 `running` 且带有 `baseUrl` / `modelAlias` 时，人设模式会自动用该 runtime 的 `/v1/chat/completions` 完成人设改写。若本地 LLM runtime 请求失败，会退回本地人设规则，保证本次听写流程仍能完成；显式配置 `HONEY_PERSONA_OPENAI_BASE_URL` 或 `HONEY_PERSONA_REWRITE_COMMAND` 时仍优先使用显式配置。

Tauri 桌面壳现在也提供 Node 后端进程管理命令，前端的 `desktopBridge` 会在第一次 HTTP backend 调用前尝试启动本地后端：

```text
honey_get_backend_process_status
honey_start_backend_process
honey_stop_backend_process
```

默认后端地址为 `http://127.0.0.1:33577`。开发态下如果 `pnpm dev:desktop` 的 `beforeDevCommand` 已经启动后端，`honey_start_backend_process` 会先检测端口并复用已存在的服务；如果没有服务，默认用 `pnpm --filter backend dev` 启动。可通过这些环境变量覆盖启动方式：

```powershell
$env:HONEY_BACKEND_EXECUTABLE = 'node.exe'
$env:HONEY_BACKEND_ARGS = 'backend/dist/index.js'
$env:HONEY_BACKEND_CWD = 'D:\products\voice-to-text'
$env:HONEY_BACKEND_HOST = '127.0.0.1'
$env:HONEY_BACKEND_PORT = '33577'
```

这一步解决的是桌面壳层对 Node 后端生命周期的托管入口；正式安装包还需要把 Node 后端编译或打包为可随 Tauri 分发的 sidecar。

Fun-ASR-Nano 仍保留命令式 runner 入口，方便单独调试或外部进程复用：

```powershell
$env:HONEY_ASR_COMMAND = 'pnpm --filter backend asr:fun-nano'
```

当前 `asr:fun-nano` 已能完成模型文件检查、`onnxruntime-node` 依赖探测、`ffmpeg` 音频解码器探测、stdin JSON 解析、16k mono PCM 解码、Fun-ASR-Nano Encoder ONNX 推理、CTC ONNX 推理和 tokens 直出解码。

当前实现的是 CTC 直出路径：

```text
audio file -> ffmpeg or WAV decoder -> 16k mono PCM -> Encoder-Adaptor.int8.onnx -> CTC.int8.onnx -> tokens.txt CTC collapse
```

WebView `MediaRecorder` 录出来通常是 `webm/opus`，需要本机 PATH 里有 `ffmpeg`，或者显式设置：

```powershell
$env:HONEY_FFMPEG_PATH = 'D:\app\DownVideo\ffmpeg.exe'
```

如果音频没有可解码语音内容，CTC 结果为空，会返回：

```json
{
  "error": "fun_asr_nano_empty_transcript",
  "message": "fun_asr_nano_empty_transcript"
}
```

注意：`Fun-ASR-Nano-Decoder.q8_0.gguf` 尚未接入。当前输出质量依赖 CTC 直出，后续需要继续补 GGUF decoder 或替换为更完整的本地 ASR runner。

ASR 命令从 stdin 接收 JSON：

```json
{
  "audioPath": "D:/honey/audio-captures/xxx.webm",
  "modelId": "fun-asr-nano",
  "language": "zh-CN",
  "hotwords": [
    { "canonical": "Qwen", "aliases": ["扣文", "千问"] }
  ]
}
```

ASR 命令向 stdout 输出 JSON：

```json
{
  "text": "识别出来的文字",
  "durationMs": 1200
}
```

人设命令从 stdin 接收 JSON：

```json
{
  "text": "语音转文字模型输出并经过热词/规则处理后的文本",
  "persona": {
    "id": "persona-office",
    "name": "职场老油条",
    "prompt": "..."
  },
  "modelId": "qwen3-1_7b",
  "sourceApp": "飞书"
}
```

人设命令向 stdout 输出 JSON：

```json
{
  "text": "按当前人设处理后的文本",
  "latencyMs": 480
}
```

OpenAI-compatible 本地 LLM 适配器会向 `/v1/chat/completions` 发送非流式请求：

```json
{
  "model": "qwen3-4b-instruct-q4_k_m",
  "messages": [
    { "role": "system", "content": "人设与输出规则..." },
    { "role": "user", "content": "请改写下面这段话..." }
  ],
  "temperature": 0.2,
  "stream": false
}
```

适配器只读取 `choices[0].message.content`，并拒绝空输出。

### 6. 运行时健康检查

后端提供运行时健康检查接口：

```http
GET /api/runtime/health
```

该接口用于桌面端联调和排错，返回：

- `localDataPath`：当前本地数据目录。
- `audioCapturePath`：录音上传目录。
- `modelRoot`：本地 ASR 模型扫描目录。
- `llmModelRoot`：本地 GGUF 人设模型扫描目录。
- `llamaServerPath`：当前配置的 llama.cpp server 可执行文件路径。
- `models`：本地模型文件清单和缺失文件。
- `asr.commandConfigured`：本地 ASR 是否可用；默认内置 Fun-ASR-Nano runner 也会显示为 `true`。
- `personaRewrite.commandConfigured`：是否已有真实人设处理能力；显式配置 `HONEY_PERSONA_OPENAI_BASE_URL` / `HONEY_PERSONA_REWRITE_COMMAND` 或本地 LLM runtime 处于 `running` 时为 `true`。
- `personaRewrite.status`：配置真实本地 LLM 或本地 LLM runtime 正在运行时为 `ready`；未配置且 runtime 未运行时为 `fallback`，表示使用本地规则兜底。
- `llmRuntime`：Node 后端托管的 llama.cpp server 状态，包含 `status`、`modelPath`、`modelAlias`、`baseUrl` 和 `pid`。
- `issues`：当前需要关注的运行缺口，例如 `persona_rewrite_running_in_local_fallback` 或 `fun_asr_nano_audio_decoder_unavailable:*`。

示例：

```json
{
  "service": "honey-backend",
  "mode": "local",
  "localDataPath": "D:/honey",
  "audioCapturePath": "D:/honey/audio-captures",
  "modelRoot": "C:/Users/benlin/AppData/Roaming/honey/models/Fun-ASR-Nano-GGUF",
  "llmModelRoot": "C:/Users/benlin/AppData/Roaming/honey/models/llm",
  "llamaServerPath": "C:/Users/benlin/AppData/Roaming/honey/runtime/llama.cpp/llama-server.exe",
  "asr": {
    "status": "ready",
    "commandConfigured": true
  },
  "personaRewrite": {
    "status": "ready",
    "commandConfigured": true
  },
  "llmRuntime": {
    "status": "running",
    "modelPath": "D:/products/voice-to-text/models/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    "modelAlias": "qwen3-4b-instruct-q4_k_m",
    "host": "127.0.0.1",
    "port": 8080,
    "baseUrl": "http://127.0.0.1:8080",
    "pid": 1234
  },
  "issues": []
}
```

## 尚未完成

- Windows 端完整桌面 E2E 手测：安装包启动、按住全局热键、录音、识别、上屏、历史记录。
- Tauri/Rust 侧原生录音实现；当前可走 WebView `MediaRecorder`。
- Fun-ASR-Nano GGUF decoder 接入；当前只完成 ONNX Encoder + CTC 直出。
- 模型页 UI 已接入本地 LLM runtime 的状态查看、启动默认模型、停止模型、刷新状态，并支持选择已扫描到的本地 GGUF 人设模型启动；尚未支持从文件选择器临时选择任意路径。
- Tauri/Rust 侧已具备 Node 后端进程管理入口；正式安装包仍需补 Node 后端 sidecar 打包和安装后自启动验证。
- Tauri/Rust 侧不托管 llama.cpp 子进程；当前由 Node 后端托管 `.tools/llama.cpp/llama-server.exe`。
- macOS 和 Linux 的权限、热键、录音、输入模拟适配。

## 验证状态

当前 Node/TypeScript 验证命令：

```bash
pnpm check
```

当前 Rust/Tauri 验证命令：

```powershell
cmd.exe /c "call C:\BuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64 && pnpm build:desktop"
```

当前环境状态：

- Rust/Cargo 已安装到当前用户目录。
- Microsoft Visual Studio Build Tools C++ workload 已安装到 `C:\BuildTools`。
- Windows Tauri release 构建、MSI 和 NSIS 安装包生成已验证通过。
