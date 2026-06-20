# 开发规范与技术底座

版本：0.1  
日期：2026-06-19  
状态：第一版开发规范  

## 1. 规范来源

本项目的开发规范以 `RunWorldZBL/agent-kit` 作为底座参考：

- 仓库：https://github.com/RunWorldZBL/agent-kit.git
- 本机参考项目：`C:\Users\benlin\Desktop\solution`

`agent-kit` 用来约束仓库结构、代理开发流程、共享契约、OpenSpec、验证链路和 Node.js 后端底座。本项目不会直接照搬无关业务代码，但后端工程结构应以 agent-kit 的 `backend/` 为基础进行裁剪和扩展。

`solution` 前端项目用来参考具体前端技术选型、UI 包、主题 token、配色系统，以及深浅色切换的波纹动画效果。

## 2. 仓库结构规范

本项目应采用 pnpm workspace 和前后端分层结构。

```text
voice-to-text/
  AGENTS.md
  DOCS/
  openspec/
  frontend/
  backend/
  shared/
    api-contracts/
  tools/
  src-tauri/
```

目录职责：

| 目录 | 职责 |
| --- | --- |
| `frontend/` | React + Tauri WebView 内的前端界面。 |
| `backend/` | 基于 agent-kit 后端底座的 Node.js 本地后端服务，后续承载音频、ASR、人设处理、模型和本地数据能力。 |
| `shared/api-contracts/` | 前后端共享的 Zod schema 和 TypeScript 类型。 |
| `src-tauri/` | Tauri 桌面壳、窗口、托盘、系统权限和 sidecar 生命周期。 |
| `openspec/` | 用户可见行为、跨层能力和重要变更的规格来源。 |
| `tools/` | 仓库检查、脚本和开发辅助工具。 |
| `DOCS/` | 产品设计、开发计划和决策文档。 |

要求：

- 不在前端手写后端响应 shape；涉及 API 字段、枚举、请求体或响应体时，先改 `shared/api-contracts/`。
- 非平凡用户可见行为优先进入 `openspec/changes/<change-name>/`。
- `DOCS/` 保存产品和计划文档；`openspec/` 保存可验证行为契约；两者不要混用。
- Tauri Rust 层保持薄，只负责桌面系统接入，不承载核心业务逻辑。
- Node.js 后端是本项目后端业务主层，不使用 CapsWriter-Offline 的 Python 后端。

## 3. 包管理与基础命令

使用 pnpm，参考 `agent-kit` 的 workspace 管理方式。

建议根命令：

```bash
pnpm install
pnpm dev:be
pnpm dev:fe
pnpm dev:desktop
pnpm build:be
pnpm build:fe
pnpm build:desktop
pnpm typecheck:contracts
pnpm lint
pnpm test
pnpm check
```

`pnpm check` 应作为本地总验证链路，至少包含：

- harness / 仓库结构检查。
- 共享契约 typecheck。
- 后端 typecheck。
- 前端 build。
- 前端测试。
- lint。

第一版 UI 如果还没有真实后端，也必须保证前端 build 和 mock 数据测试可运行。

桌面后端生命周期：

- 开发态仍使用 `pnpm dev:desktop`，Tauri 的 `beforeDevCommand` 会启动前端和 Node 后端服务。
- Tauri 壳层同时提供 `honey_start_backend_process` / `honey_get_backend_process_status` / `honey_stop_backend_process`，前端 backend client 第一次访问本地 HTTP API 前会尝试启动 Node 后端。
- 默认启动命令是 `pnpm --filter backend dev`，可通过 `HONEY_BACKEND_EXECUTABLE`、`HONEY_BACKEND_ARGS`、`HONEY_BACKEND_CWD`、`HONEY_BACKEND_HOST`、`HONEY_BACKEND_PORT` 覆盖。
- 生产安装包不能依赖用户机器已安装 pnpm；后续必须把 Node 后端编译或打包成 Tauri sidecar，并保留 Rust 层只管理生命周期、不承载业务逻辑的边界。

## 4. 前端技术栈

参考 `C:\Users\benlin\Desktop\solution\frontend`，第一版前端采用：

- React 19。
- Vite 8。
- TypeScript。
- Tailwind CSS v4。
- shadcn / Radix 风格组件，`components.json` 使用 `radix-nova` 风格。
- `radix-ui` 作为弹层、菜单、对话框等可访问性基础。
- `lucide-react` 作为图标库。
- `zustand` 管理本地 UI 状态，例如主题和设置。
- `@tanstack/react-query` 管理服务端数据和异步状态。
- `zod` 和 `shared/api-contracts` 管理接口契约。
- Vitest + React Testing Library + jsdom 做 UI 测试。

前端目录建议：

```text
frontend/src/
  api/
  app/
  components/
    ui/
  features/
  hooks/
  lib/
  pages/
  stores/
  styles/
  test/
```

约束：

- 优先复用 `src/components/ui` primitives，再创建业务组件。
- 操作型页面保持紧凑、可扫描、克制，不做营销式 hero。
- 图标按钮统一使用 `lucide-react`。
- 使用 Tailwind token 和 CSS 变量，不在组件中硬编码颜色。
- 不嵌套卡片；重复实体可以用卡片，页面区块不要做成大卡套小卡。
- 固定格式控件必须有稳定尺寸，避免 hover、计数、动态文字导致布局抖动。
- 中文文案必须检查不溢出；如读取中文乱码，使用 UTF-8 重新读取。

## 5. UI 组件与 shadcn 配置

`components.json` 参考配置：

```json
{
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

组件策略：

- Button、Input、Dialog、Popover、Tooltip、Checkbox、Slider、Tabs、Switch、ScrollArea 等基础控件从 shadcn/Radix 风格 primitives 建立。
- 产品页面只组合 primitives 和业务组件，不在页面里临时写复杂基础控件。
- 所有陌生图标按钮必须有 `aria-label` 和 tooltip。

## 6. 配色系统

参考 `solution` 的双轴主题系统：

```text
mode: light / dark / system
palette: qinghua / zhusha / zhuqing / daimo
```

主题状态写入 `<html>`：

```text
class="dark"
data-theme="qinghua"
```

第一版应保留四套中国传统色主题：

| key | 名称 | 定位 |
| --- | --- | --- |
| `qinghua` | 青花 | 默认主题，钴蓝和宣白，适合作为产品主视觉。 |
| `zhusha` | 朱砂 | 偏红，适合作为醒目主题。 |
| `zhuqing` | 竹青 | 低疲劳绿色，适合长时间使用。 |
| `daimo` | 黛墨 | 克制的水墨感，适合深色和专注场景。 |

Token 规范：

- 使用 `oklch()` 定义主题色。
- 必须定义 `--background`、`--foreground`、`--card`、`--popover`、`--muted`、`--accent`、`--secondary`、`--border`、`--input`、`--ring`、`--primary`、`--primary-foreground`。
- 必须定义语义色：`--success`、`--warning`、`--danger`、`--info`、`--destructive`。
- 必须定义 sidebar token，保证桌面工具侧栏稳定。
- 组件只能消费语义 token，不直接使用十六进制颜色。

## 7. 暗色模式波纹动画

深浅色和配色切换必须参考 `solution` 的实现：

- 使用 `zustand + persist` 保存 `mode` 和 `palette`。
- 用户点击主题控件时，记录点击坐标 `{ x, y }`。
- 支持 `document.startViewTransition` 时，用 View Transitions API 做从点击位置扩散的圆形 reveal。
- 不支持 View Transitions API 时，创建 `.theme-ripple` DOM 元素作为 fallback。
- 切换期间在 `<html>` 设置 `data-theme-changing`。
- CSS 中用 unlayered rule 强制冻结普通元素 transition/animation，避免背景、卡片、文本分批变色。
- 首次加载持久化主题时必须即时应用，不播放波纹动画。

主题运行时建议文件：

```text
frontend/src/stores/themeStore.ts
frontend/src/components/ThemeSwitcher.tsx
frontend/src/index.css
```

验收标准：

- 从浅色切深色时，页面只出现一个从点击点扩散的整体波纹。
- 主题切换时没有卡片、边框、文字分阶段变色的阶梯感。
- 跟随系统模式能响应 `prefers-color-scheme`。
- 主题选择能持久化到本地。

## 8. 后端与契约规范

后端使用 Node.js。正式实现时可以参考 `agent-kit` 后端组织方式，但本产品不需要一开始就启用所有重型能力。

后端能力分组：

- `dictation`：录音状态、热键事件、直接转写/人设模式。
- `overlay`：听写状态浮层状态、音量等级、识别文本预览、错误提示。
- `window`：完整窗口/迷你窗口模式、当前显示状态、窗口切换。
- `transcripts`：历史记录、详情、删除、复制 payload。
- `hotwords`：热词 CRUD、别名、黑名单、导入导出。
- `rules`：替换规则 CRUD、测试转换。
- `personas`：人设 CRUD、启用状态、提示词、输出模式、绑定模型、上下文记忆。
- `models`：模型列表、导入、选择、健康检查。
- `files`：文件转录任务队列和输出文件。
- `settings`：应用设置读写。

契约要求：

- 请求、响应、枚举和错误码必须先落在 `shared/api-contracts`。
- 前端页面只通过 API client 或 mock client 读写数据。
- mock 数据必须符合共享契约，不能为了页面方便发明临时字段。
- 未来真实 Node.js 后端替换 mock client 时，页面结构不应大改。

## 9. 代理开发纪律

参考 `agent-kit` 的代理 harness：

- 根 `AGENTS.md` 作为路由规则。
- 前端、后端、共享契约分别有自己的 `AGENTS.md`。
- 重要行为变更先写 OpenSpec。
- 行为改动、bugfix、复杂校验使用 TDD。
- 实现前先读对应领域规则和本地 skill。
- 使用最小验证命令先证明变更，再扩大到 `pnpm check`。

推荐验证顺序：

```bash
pnpm --filter @voice-to-text/api-contracts typecheck
pnpm --filter frontend test --run
pnpm --filter frontend build
pnpm --filter backend typecheck
pnpm lint
pnpm check
```

## 10. 第一版 UI 特别约束

- 第一版只做 UI 和 mock 状态，不接真实 ASR/LLM。
- 默认模式是“直接转写”，人设模式默认关闭。
- 页面必须体现完整产品能力，但不可暗示真实模型已可运行。
- 模型、文件转录、上屏输入、录音等真实能力用 disabled、mock 或“即将接入”状态表达。
- UI 必须使用上面的主题系统和 ThemeSwitcher。
- 不再使用“CSS modules or lightweight design system”作为开放选项；前端 UI 方案固定为 Tailwind CSS v4 + shadcn/Radix 风格 primitives。
