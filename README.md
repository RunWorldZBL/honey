# honey（甜美）

honey 是一个本地优先的桌面端语音输入工具。用户把光标放在任意输入框，按住全局热键说话，松开后将识别文本一次性上屏，并在应用内保存听写记录。

当前优先支持 Windows，后续预留 macOS 和 Linux。技术栈为 React + Vite + TypeScript + Tauri，后端使用 Node.js/TypeScript，本地数据和模型默认留在用户电脑上。

## 当前定位

- 默认模式是“直接转写”：语音转文字后直接上屏，不调用 LLM。
- “人设模式”是可选能力：先做语音转文字，再把完整原文交给本地 LLM 按人设处理。
- 模型不打进安装包，用户自行下载并在软件中配置模型目录。
- CapsWriter-Offline 只作为功能参考，本项目不沿用它的 Python 技术栈。

## 已覆盖的核心能力

- Windows 原生录音和全局按住说话热键链路。
- 屏幕底部听写状态 bar：音频可视化、识别中、结果展示和自动隐藏。
- 系统文本插入：支持粘贴或模拟输入方式。
- 直接转写和人设模式会话。
- 历史记录、热词、规则替换、人设设置、模型管理、设置页。
- 本地 LLM runtime 启停和 OpenAI-compatible 人设处理入口。
- 文件转录、托盘、迷你窗口等桌面能力的产品与接口设计。
- 长按期间分段识别预览方案文档。

## 项目结构

```text
frontend/              React/Vite/TypeScript UI
backend/               Node.js 本地后端服务
shared/api-contracts/  Zod schemas 和共享 TypeScript 类型
src-tauri/             Tauri 桌面壳、系统热键、录音、窗口和上屏能力
DOCS/                  产品设计、运行接入、实施计划和专项设计文档
scripts/               开发、桌面启动、LLM runtime 和 smoke 脚本
models/                本机 LLM 模型目录，已被 git 忽略
Fun-ASR-Nano-GGUF/     本机 ASR 模型目录，已被 git 忽略
```

## 模型目录

正式安装包不会内置 ASR 或 LLM 模型。默认建议用户把模型放在用户数据目录：

```text
%APPDATA%\honey\models\Fun-ASR-Nano-GGUF
%APPDATA%\honey\models
%APPDATA%\honey\runtime\llama.cpp\llama-server.exe
```

开发态可以把模型放在仓库根目录下：

```text
Fun-ASR-Nano-GGUF/
models/
```

这两个目录已写入 `.gitignore`，不会提交到 Git，也不会被打进安装包。

## 开发环境

需要准备：

- Node.js 和 pnpm
- Rust/Cargo 和 Tauri 2 所需 Windows 构建环境
- 可选：ffmpeg，用于解码非 WAV 音频或文件转录
- 可选：本地 GGUF LLM 模型，用于人设模式

安装依赖：

```powershell
pnpm install
```

启动前端：

```powershell
pnpm dev:fe
```

启动本地后端：

```powershell
pnpm dev:be
```

启动桌面开发环境：

```powershell
pnpm dev:desktop
```

启动桌面开发环境并拉起本地 LLM runtime：

```powershell
pnpm dev:desktop:llm
```

## 常用命令

```powershell
pnpm build:fe
pnpm build:be
pnpm typecheck:contracts
pnpm test
pnpm check
pnpm build:desktop
```

## 关键文档

- [产品设计](DOCS/PRODUCT_DESIGN.md)
- [UI 实施计划](DOCS/UI_IMPLEMENTATION_PLAN.md)
- [运行接入说明](DOCS/RUNTIME_INTEGRATION.md)
- [开发规范](DOCS/DEVELOPMENT_GUIDELINES.md)
- [长按语音分段识别预览设计](DOCS/STREAMING_SEGMENT_PREVIEW_DESIGN.md)

## 开发约定

- 使用 pnpm workspace 命令从仓库根目录运行。
- UI 可见文案使用“人设模式”“人设设置”，不要使用“智能改写”。
- UI 文案优先使用“语音转文字模型”，需要时再补充 ASR。
- 直接转写是默认模式，人设模式默认关闭。
- 本地模型、构建产物、缓存、临时文件和日志不提交到 Git。

## 当前重点

短期重点是把 Windows 端按住说话的完整体验做稳：热键监听、原生录音、音量 bar、语音转文字、最终上屏和历史记录。长语音场景会按设计推进“分段识别预览，松开统一上屏”，标点符号能力需要单独参考 CapsWriter-Offline 的模型和解码链路。
