# honey（甜美）Desktop UI V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first desktop UI version for honey（甜美）, a React + Tauri voice input app on top of the `agent-kit`-style workspace and backend base, using mock data and no real ASR/LLM/system input integration.

**Architecture:** The repository follows the `agent-kit` split: `frontend`, `backend`, `shared/api-contracts`, `openspec`, `tools`, and `src-tauri`. The Node.js backend should be based on the agent-kit backend foundation, then trimmed for local desktop use. UI behavior is accessed through shared Zod/TypeScript contracts and a typed frontend adapter that initially returns mock data and later maps to the local backend service. Tauri Rust stays thin and only hosts desktop shell/system integration in this phase.

**Tech Stack:** pnpm workspace, React 19, TypeScript, Vite 8, Tauri, Node.js backend contract, Zod shared contracts, Tailwind CSS v4, shadcn/Radix `radix-nova` primitives, lucide-react, Zustand, TanStack React Query, Vitest, local mock data.

---

## 1. Scope

This plan only covers the UI-first milestone.

Included:

- Scaffold the desktop app.
- Build navigable pages for the full product surface.
- Add mock records, models, hotwords, rules, personas, settings, tray actions, dictation overlay states, mini-window states, and file transcription tasks.
- Define frontend types and backend client interfaces that represent the future Node.js service.
- Adopt the `solution` frontend UI stack, color token system, theme switcher, and dark-mode ripple animation.
- Verify UI layout on desktop-sized windows.

Excluded:

- Real global hotkeys.
- Real microphone recording.
- Real ASR inference.
- Real LLM persona processing.
- Real text insertion into external apps.
- Real model download/import.
- Real file transcription.
- Installer packaging.

## 2. Proposed File Structure

```text
voice-to-text/
  package.json
  pnpm-workspace.yaml
  AGENTS.md
  openspec/
  frontend/
    package.json
    components.json
    index.html
    vite.config.ts
    src/
      main.tsx
      App.tsx
      index.css
      app/
        navigation.ts
        routes.tsx
      api/
        client.ts
        mockClient.ts
      data/
        mockData.ts
      components/
        AppShell.tsx
        ThemeSwitcher.tsx
        DictationOverlay.tsx
        MiniWindow.tsx
        StatusBadge.tsx
        EmptyState.tsx
        ConfirmDialog.tsx
        FormField.tsx
        ui/
      pages/
        HomePage.tsx
        HistoryPage.tsx
        HotwordsPage.tsx
        RulesPage.tsx
        PersonasPage.tsx
        ModelsPage.tsx
        FileTranscriptionPage.tsx
        SettingsPage.tsx
      stores/
        themeStore.ts
      test/
        setup.ts
  backend/
    package.json
  shared/
    api-contracts/
      package.json
      src/
        index.ts
  src-tauri/
    tauri.conf.json
    Cargo.toml
    src/
      main.rs
  DOCS/
    DEVELOPMENT_GUIDELINES.md
    PRODUCT_DESIGN.md
    UI_IMPLEMENTATION_PLAN.md
```

The Node.js backend should start from the agent-kit backend base, but real ASR, LLM, hotkey, file transcription, and model execution are intentionally not wired in this milestone. The frontend contract should still name backend capabilities explicitly so the UI does not couple itself to mock data.

## 3. CapsWriter Feature Coverage Matrix

These features are not optional extras. V1 UI must expose every item below, even when the underlying behavior is still mock, disabled, or marked as not connected.

| Feature | honey UI Surface | V1 Behavior |
| --- | --- | --- |
| Hold hotkey to dictate | Home + Settings | Mock status flow and editable hotkey settings. |
| Mouse side button trigger | Settings | Configurable mock shortcut row. |
| Hold-to-talk and click-to-toggle | Settings | Mode selector with trigger threshold. |
| Insert text at cursor | Home + History | Mock inserted state; no real system input. |
| Direct transcription default | Home | Default mode and primary workflow. |
| Listening status overlay | DictationOverlay | Bottom-center bar with listening/recognizing/completed states. |
| Real waveform feedback | DictationOverlay | Mock volume waveform in V1; later driven by microphone RMS/VAD. |
| No waveform when silent | DictationOverlay | Silent mock state shows flat or near-flat wave. |
| Show recognized text after key release | DictationOverlay | Completed state shows transcript preview before fading. |
| Full and mini window modes | App shell + MiniWindow | Full console plus lightweight mini window mock. |
| Persona processing | 人设设置 + History | Optional, off by default; mock output records. |
| Persona prefix/role trigger | 人设设置 | UI for aliases/triggers and output mode. |
| Hotwords | 热词 page | CRUD UI for canonical word, aliases, blacklist, enable state. |
| Regex/simple replacement rules | 规则 page | CRUD UI plus test input preview. |
| Numeric ITN | Settings | Toggle for Chinese-number formatting. |
| Trailing punctuation cleanup | Settings | Toggle and app-specific option. |
| Audio saving | History + Settings | Mock audio path and save-audio privacy setting. |
| Daily archive/history | History | Date-grouped local record archive. |
| File transcription | 文件转录 page | Drag zone, queue, output format options, mock progress. |
| SRT/TXT/JSON outputs | 文件转录 page | Output format checkboxes and disabled result links. |
| Model selection | Models | ASR/LLM model inventory, tiers, install status. |
| GPU acceleration settings | Models + Settings | Advanced placeholders and resource hints. |
| Tray menu | App shell + Settings | Mock tray action list and startup/tray settings. |
| Copy latest result | Home + Tray mock + History | Copy buttons and mock tray action. |
| Clear LLM/persona memory | 人设设置 + Tray mock | Clear-memory action as disabled/mock. |

## 4. Implementation Tasks

### Task 1: Scaffold Agent-Kit-Style Workspace

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `AGENTS.md`
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `backend/package.json`
- Create: `shared/api-contracts/package.json`
- Create: `shared/api-contracts/src/index.ts`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/main.rs`

- [ ] Create a pnpm workspace with `frontend`, `backend`, and `shared/*`.
- [ ] Add root scripts matching the `agent-kit` style: `dev:be`, `dev:fe`, `build:be`, `build:fe`, `typecheck:contracts`, `lint`, `test`, `check`.
- [ ] Create a Vite React TypeScript app under `frontend/`.
- [ ] Create backend package from the agent-kit backend base and trim it to a local-service skeleton; do not implement real ASR/LLM behavior yet.
- [ ] Create shared Zod contract package under `shared/api-contracts/`.
- [ ] Add Tauri config for a Windows-first desktop window.
- [ ] Run `pnpm install`.
- [ ] Run `pnpm build:fe`.
- [ ] Run `pnpm typecheck:contracts`.
- [ ] Run the Tauri dev script and confirm the blank shell opens.

Expected result: a desktop window launches with a minimal React app.

### Task 2: Add Theme System and App Shell

**Files:**

- Create: `frontend/components.json`
- Create: `frontend/src/index.css`
- Create: `frontend/src/stores/themeStore.ts`
- Create: `frontend/src/components/ThemeSwitcher.tsx`
- Create: `frontend/src/components/AppShell.tsx`
- Create: `frontend/src/app/navigation.ts`
- Modify: `frontend/src/App.tsx`

- [ ] Configure shadcn with `radix-nova`, Tailwind CSS variables, neutral base color, and lucide icons.
- [ ] Define the two-axis theme system: `mode` (`light`, `dark`, `system`) and `palette` (`qinghua`, `zhusha`, `zhuqing`, `daimo`).
- [ ] Port the `solution` approach for `oklch()` token blocks, including semantic, sidebar, card, popover, and chart tokens.
- [ ] Implement `ThemeSwitcher` with Radix Popover, lucide icons, segmented mode control, and palette swatches.
- [ ] Implement View Transitions API reveal from click origin, plus `.theme-ripple` fallback.
- [ ] Freeze normal transitions during theme swap with `html[data-theme-changing]`.
- [ ] Build a left navigation shell with pages: Home, History, Hotwords, Rules, Personas, Models, File Transcription, Settings.
- [ ] Use fixed sidebar width and responsive content constraints.
- [ ] Avoid landing-page layout; the first screen must be the actual tool dashboard.
- [ ] Run `pnpm build:fe`.

Expected result: the user sees a practical desktop app layout with persistent navigation, theme palettes, and ripple dark-mode switching.

### Task 3: Define Backend Contract and Mock Data

**Files:**

- Create: `shared/api-contracts/src/index.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/mockClient.ts`
- Create: `frontend/src/data/mockData.ts`

- [ ] Define Zod schemas and inferred TypeScript types for transcript records, modes, overlay states, window modes, hotwords, rules, personas, models, tray actions, settings, and transcription tasks in `shared/api-contracts`.
- [ ] Define `BackendClient` methods for list/update operations used by the UI.
- [ ] Implement `MockBackendClient` with deterministic local mock data.
- [ ] Export a singleton `backendClient` from `client.ts`.
- [ ] Run `pnpm typecheck:contracts`.
- [ ] Run `pnpm build:fe`.

Expected result: pages can depend on a stable backend interface that later maps to Node.js.

### Task 4: Build Home Dashboard

**Files:**

- Create: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/components/StatusBadge.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] Show current mode: Direct Transcription as default.
- [ ] Show hotkey status: CapsLock and mouse side button as configurable examples.
- [ ] Show ASR model status and persona mode disabled status.
- [ ] Show latest mock transcript record.
- [ ] Add quick actions for History, Hotwords, Models, Settings.
- [ ] Add a mock recording state preview: idle, listening, recognizing, inserted.
- [ ] Run `pnpm build:fe`.

Expected result: the dashboard explains the product without needing marketing text.

### Task 5: Build Dictation Overlay and Mini Window

**Files:**

- Create: `frontend/src/components/DictationOverlay.tsx`
- Create: `frontend/src/components/MiniWindow.tsx`
- Create: `frontend/src/stores/dictationUiStore.ts`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `shared/api-contracts/src/index.ts`

- [ ] Add `DictationOverlayState`: idle, listening, silent, recognizing, completed, inserted, failed.
- [ ] Add mock `volumeLevel` series for speaking and silent states.
- [ ] Render a bottom-center horizontal overlay bar.
- [ ] In listening state, show “正在听” and animated waveform bars.
- [ ] In silent state, keep overlay visible but make waveform flat or nearly still.
- [ ] In recognizing state, show “正在识别”.
- [ ] In completed state, show the recognized text preview from mock data.
- [ ] In inserted state, show “已输入” then fade-out behavior in mock UI.
- [ ] In failed state, show concise error text and retry affordance.
- [ ] Build `MiniWindow` with honey/甜美 identity, current mode, model status, latest result, settings, and open-full-window action.
- [ ] Add controls on Home to preview overlay states and full/mini modes.
- [ ] Run `pnpm typecheck:contracts`.
- [ ] Run `pnpm build:fe`.

Expected result: V1 UI demonstrates the key input feedback flow without real hotkey or microphone integration.

### Task 6: Build History Page

**Files:**

- Create: `frontend/src/pages/HistoryPage.tsx`
- Create: `frontend/src/components/EmptyState.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] Render mock transcript records grouped by date.
- [ ] Support search over raw text and output text.
- [ ] Support filters: all, direct transcription, persona mode, failed.
- [ ] Show record metadata: source app, duration, latency, persona, audio saved state.
- [ ] Add buttons for copy output, copy raw text, delete.
- [ ] Use modal confirmation for delete.
- [ ] Run `pnpm build:fe`.

Expected result: history looks like a real local archive even though data is mocked.

### Task 7: Build Hotword and Rule Management

**Files:**

- Create: `frontend/src/pages/HotwordsPage.tsx`
- Create: `frontend/src/pages/RulesPage.tsx`
- Create: `frontend/src/components/FormField.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] Hotwords page supports list, add, edit, delete, enable/disable.
- [ ] Hotword form includes canonical word, aliases, blacklist.
- [ ] Rules page supports simple replacement and regex replacement.
- [ ] Rules page includes a test input area showing mock transformed output.
- [ ] Use clear labels instead of raw file names like `hot.txt` as primary UI.
- [ ] Run `pnpm build:fe`.

Expected result: CapsWriter hotword and rule concepts are represented as user-friendly UI.

### Task 8: Build Personas Page

**Files:**

- Create: `frontend/src/pages/PersonasPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] Show Persona Mode master switch as disabled by default.
- [ ] Use Chinese product copy: “人设模式” and “人设设置”; do not use “智能改写” in visible UI.
- [ ] Show warning copy that persona processing uses a local LLM and may increase memory use and latency.
- [ ] List personas: 职场老油条, 正式邮件, 客服语气, 翻译助手, 小助理.
- [ ] Persona editor includes name, trigger aliases, description, prompt, output mode, model selector, enabled state, keep-context setting.
- [ ] Distinguish “处理后上屏” from “浮窗回复”.
- [ ] Add mock action to clear persona memory.
- [ ] Run `pnpm build:fe`.

Expected result: users can understand optional persona behavior without making it the default path.

### Task 9: Build Models Page

**Files:**

- Create: `frontend/src/pages/ModelsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] Show ASR model section: Fun-ASR-Nano, SenseVoiceSmall, Qwen3-ASR 0.6B, Qwen3-ASR 1.7B.
- [ ] Show LLM model section: Qwen3 0.6B, Qwen3 1.7B, Qwen3 4B, Qwen3 8B.
- [ ] Display tiers: low config, default, quality, experimental.
- [ ] Show installed/missing/loading/error status.
- [ ] Include import and switch buttons as disabled or mock actions.
- [ ] Run `pnpm build:fe`.

Expected result: model selection is understandable to non-expert users and honest about resource cost.

### Task 10: Build File Transcription Page

**Files:**

- Create: `frontend/src/pages/FileTranscriptionPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] Add a drag-and-drop visual zone.
- [ ] Show mock queue items with status: waiting, processing, completed, failed.
- [ ] Show output format checkboxes: SRT, TXT, JSON, merged TXT.
- [ ] Show per-task progress and result file links as disabled mock UI.
- [ ] Run `pnpm build:fe`.

Expected result: the file transcription feature is present in UI but clearly not wired to real processing yet.

### Task 11: Build Settings Page

**Files:**

- Create: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] Add hotkey settings: hold-to-talk, click-to-toggle, trigger threshold.
- [ ] Add output settings: paste, simulated typing, restore clipboard, force paste apps.
- [ ] Add recognition settings: language, numeric formatting, remove trailing punctuation.
- [ ] Add privacy settings: save audio, save history, local data path.
- [ ] Add startup and tray settings.
- [ ] Add window mode setting: open full console or mini window by default.
- [ ] Add overlay setting: show/hide dictation overlay and overlay position preview.
- [ ] Add advanced placeholders for GPU acceleration and logs.
- [ ] Add mouse side button shortcut configuration.
- [ ] Add app-specific behavior placeholders: force paste apps, auto-enter apps, punctuation cleanup apps.
- [ ] Run `pnpm build:fe`.

Expected result: settings cover the CapsWriter-inspired behavior in a productized UI.

### Task 12: Build Tray Menu and Quick Actions Mock

**Files:**

- Create: `frontend/src/components/TrayMenuPreview.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/components/MiniWindow.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/pages/PersonasPage.tsx`

- [ ] Add a tray menu preview section showing expected tray actions.
- [ ] Include actions: Start/stop listening, copy latest result, add hotword, open history, open settings, clear persona memory, quit.
- [ ] Mark system-level tray integration as not connected in UI copy.
- [ ] Mirror tray/startup settings in Settings page.
- [ ] Run `pnpm build:fe`.

Expected result: CapsWriter-style tray behavior is represented in V1 UI and ready for later Tauri integration.

### Task 13: Add Basic Tests

**Files:**

- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/api/mockClient.test.ts`
- Create: `frontend/src/pages/HistoryPage.test.tsx`
- Create: `frontend/src/pages/HotwordsPage.test.tsx`
- Create: `frontend/src/pages/PersonasPage.test.tsx`
- Create: `frontend/src/components/DictationOverlay.test.tsx`
- Create: `frontend/src/components/MiniWindow.test.tsx`
- Create: `frontend/src/stores/themeStore.test.ts`
- Modify: `frontend/package.json`

- [ ] Add Vitest and React Testing Library.
- [ ] Test mock client returns transcript records.
- [ ] Test history search filters records.
- [ ] Test persona mode default setting is disabled.
- [ ] Test hotword CRUD UI renders canonical word, aliases, and blacklist fields.
- [ ] Test persona page renders trigger aliases and clear-memory action.
- [ ] Test overlay listening state renders waveform.
- [ ] Test overlay silent state renders flat or inactive waveform.
- [ ] Test overlay completed state renders transcript preview.
- [ ] Test mini window renders latest result and open-full action.
- [ ] Test theme store persists `mode` and `palette`.
- [ ] Run `pnpm --filter frontend test --run`.
- [ ] Run `pnpm build:fe`.

Expected result: the UI foundation has minimal regression coverage before real backend integration.

### Task 14: UI Verification Pass

**Files:**

- Modify as needed: `frontend/src/index.css`
- Modify as needed: affected page files

- [ ] Run app in Tauri dev mode.
- [ ] Check desktop viewport around 1280x800.
- [ ] Check narrow desktop window around 900x700.
- [ ] Verify no text overlaps, no button labels overflow, and navigation remains usable.
- [ ] Verify all pages have realistic mock data.
- [ ] Verify “direct transcription” is visibly the default mode.
- [ ] Verify “人设模式” is visibly optional and off by default.
- [ ] Verify no visible UI uses “智能改写”.
- [ ] Verify bottom-center dictation overlay displays listening, silent, recognizing, completed, inserted, and failed states.
- [ ] Verify waveform moves in speaking mock state and stops in silent mock state.
- [ ] Verify completed overlay displays the mock recognized text after key-release simulation.
- [ ] Verify mini window is visually lighter than the full console and has an entry back to the full window.
- [ ] Verify hotwords, rules, file transcription, model selection, audio saving, history archive, tray mock, and persona settings are all reachable from navigation or Home quick actions.
- [ ] Verify theme switcher has four palettes and mode choices.
- [ ] Verify dark-mode/theme ripple expands from the clicked control and does not produce staggered color changes.
- [ ] Run `pnpm build:fe`.

Expected result: the UI is ready for product review before backend implementation.

## 5. Acceptance Criteria

- The app opens as a desktop UI through Tauri.
- The visible app name is `honey` and Chinese name is `甜美`.
- The first screen is the functional dashboard, not a landing page.
- Every planned product page is reachable from navigation.
- The app uses the `agent-kit`-style workspace split.
- Frontend UI stack matches `solution`: Tailwind CSS v4, shadcn/Radix `radix-nova`, lucide-react, Zustand, React Query.
- Theme system supports light/dark/system plus `qinghua`, `zhusha`, `zhuqing`, `daimo`.
- Dark-mode/theme switching uses the ripple reveal behavior.
- Direct transcription is the default visible mode.
- Dictation overlay exists and demonstrates the press/speak/release/result flow.
- Waveform is active only in speaking/listening state and inactive in silent state.
- Mini window exists as a lightweight alternative to the full console.
- Persona mode is optional and disabled by default.
- No visible UI uses “智能改写”; visible terminology is “人设模式” and “人设设置”.
- CapsWriter-inspired features are represented: hotkey input, mouse side button, hold/click modes, history, audio saving, date archive, hotwords, regex rules, numeric ITN, punctuation cleanup, personas, model selection, file transcription, tray/startup settings.
- UI text uses product language: “语音转文字模型” before “ASR”.
- No page depends on a real ASR/LLM backend.
- Build and tests pass.

## 6. Backend Contract Notes

The real Node.js backend should later expose these capability groups:

- `dictation`: recording state, hotkey events, current mode.
- `overlay`: dictation overlay state, volume level, recognized preview text, error message.
- `window`: full/mini mode and current visible window state.
- `transcripts`: history list, detail, delete, copy payload.
- `hotwords`: CRUD and import/export.
- `rules`: CRUD and test transform.
- `personas`: CRUD, enable/disable, trigger aliases, prompt configuration, model binding, memory clearing.
- `models`: list, import, select, health check.
- `files`: transcription task queue and output files.
- `tray`: tray menu actions and current status.
- `settings`: read/update app settings.

During UI v1, the `BackendClient` interface should be written as if these groups already exist, but implemented by `MockBackendClient`.

## 7. Review Checklist

- Confirm product wording matches the design document.
- Confirm no implementation assumes Python backend compatibility.
- Confirm Node.js uses the agent-kit backend base and is named as the local backend service layer.
- Confirm Tauri is only used for desktop shell/system integration in this milestone.
- Confirm UI-first scope does not accidentally include real model execution.
- Confirm all future backend-dependent controls have mock or disabled states.
- Confirm every row in the CapsWriter Feature Coverage Matrix is represented in the UI.
