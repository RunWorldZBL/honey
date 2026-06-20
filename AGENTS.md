# AGENTS.md

## Project

This is `honey`（甜美）, a local-first desktop voice input app.

- `frontend/`: React/Vite/TypeScript UI rendered inside Tauri.
- `backend/`: Node.js local backend service, based on the agent-kit backend foundation and trimmed for desktop use.
- `shared/api-contracts/`: shared Zod schemas and TypeScript types.
- `src-tauri/`: Tauri desktop shell and system integration.
- `DOCS/`: product design and implementation plans.

If Chinese text appears garbled, re-read the file with UTF-8.

## Development Rules

- Use pnpm workspace commands from the repository root.
- Keep visible product wording aligned with `DOCS/PRODUCT_DESIGN.md`.
- Use “人设模式” and “人设设置” in the UI; do not use “智能改写” as visible product copy.
- Keep direct transcription as the default mode.
- Do not wire real ASR, LLM, hotkeys, recording, or system text insertion in UI V1.

## Commands

```bash
pnpm install
pnpm dev:fe
pnpm build:fe
pnpm typecheck:contracts
pnpm test
pnpm check
```
