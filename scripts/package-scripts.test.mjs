import { access, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tauriConfig = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
const tauriLib = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const funAsrNanoRunner = await readFile(new URL('../backend/src/funAsrNanoRunner.ts', import.meta.url), 'utf8');
const devDesktopServices = await readFile(new URL('./dev-desktop.mjs', import.meta.url), 'utf8');
const devDesktopLlm = await readFile(new URL('./dev-desktop-llm.mjs', import.meta.url), 'utf8');
const personaLlmSmoke = await readFile(new URL('./smoke-persona-llm.mjs', import.meta.url), 'utf8');
const backendSidecarBuild = await readFile(new URL('./build-backend-sidecar.mjs', import.meta.url), 'utf8');

assert.match(
  packageJson.scripts.test,
  /backend test/,
  'root test script should include backend tests',
);
assert.match(
  packageJson.scripts.check,
  /pnpm test/,
  'root check script should run the unified test script',
);
assert.match(
  packageJson.scripts['dev:desktop'],
  /frontend\/node_modules\/\.bin\/tauri(?:\.CMD)?\s+dev/,
  'root desktop dev script should call the frontend Tauri CLI while staying in the repository root',
);
assert.match(
  packageJson.scripts['build:desktop'],
  /frontend\/node_modules\/\.bin\/tauri(?:\.CMD)?\s+build/,
  'root desktop build script should call the frontend Tauri CLI while staying in the repository root',
);
assert.match(
  packageJson.scripts['build:desktop'],
  /--bundles\s+nsis/,
  'root desktop build script should build the NSIS installer for the first Windows release instead of requiring WiX MSI tooling',
);
assert.match(
  packageJson.scripts['build:backend-sidecar'],
  /scripts\/build-backend-sidecar\.mjs/,
  'root scripts should expose a backend sidecar build step',
);
assert.match(
  packageJson.scripts['dev:desktop:services'],
  /scripts\/dev-desktop\.mjs/,
  'root scripts should expose a desktop service launcher',
);
assert.match(
  packageJson.scripts['dev:desktop:llm'],
  /scripts\/dev-desktop-llm\.mjs/,
  'root scripts should expose a desktop launcher with local LLM enabled',
);
assert.match(
  packageJson.scripts['dev:llm'],
  /scripts\/dev-llm\.mjs/,
  'root scripts should expose a local LLM launcher',
);
assert.match(
  packageJson.scripts['smoke:persona-llm'],
  /scripts\/smoke-persona-llm\.mjs/,
  'root scripts should expose a persona LLM smoke test',
);
assert.match(
  tauriConfig.build.beforeDevCommand,
  /dev:desktop:services/,
  'Tauri dev should launch both frontend and backend services',
);
assert.match(
  tauriConfig.build.beforeBuildCommand,
  /build:backend-sidecar/,
  'Tauri build should prepare the backend sidecar before bundling',
);
assert.equal(
  tauriConfig.bundle.icon.includes('icons/icon.ico'),
  true,
  'Tauri Windows bundle should declare an ICO app icon',
);
assert.equal(
  tauriConfig.bundle.externalBin.includes('binaries/honey-backend'),
  true,
  'Tauri bundle should declare the Node backend sidecar binary base name',
);
assert.match(
  gitignore,
  /src-tauri\/binaries\/\*/,
  'generated Tauri sidecar binaries should be ignored',
);
assert.match(
  gitignore,
  /!src-tauri\/binaries\/README\.md/,
  'the sidecar binaries README should stay tracked',
);

await access(new URL('./dev-desktop.mjs', import.meta.url));
await access(new URL('./dev-desktop-llm.mjs', import.meta.url));
await access(new URL('./dev-llm.mjs', import.meta.url));
await access(new URL('./smoke-persona-llm.mjs', import.meta.url));
await access(new URL('./build-backend-sidecar.mjs', import.meta.url));
await access(new URL('../src-tauri/icons/icon.ico', import.meta.url));
await access(new URL('../src-tauri/binaries/README.md', import.meta.url));

assert.match(
  backendSidecarBuild,
  /@yao-pkg\/pkg/,
  'backend sidecar build should use a self-contained Node executable packager',
);
assert.match(
  backendSidecarBuild,
  /honey-backend-\$\{targetTriple\}\$\{extension\}/,
  'backend sidecar build should emit the Tauri target-triple suffixed binary name',
);
assert.match(
  backendSidecarBuild,
  /node22-win-x64/,
  'backend sidecar build should target a prebuilt Windows x64 Node runtime for the first release',
);
assert.match(
  backendSidecarBuild,
  /--fallback-to-source/,
  'backend sidecar build should include modules as source when bytecode generation fails',
);
assert.match(
  backendSidecarBuild,
  /backend\/dist-test\/backend\/src\/\*\*\/\*\.js/,
  'backend sidecar build should explicitly include compiled backend modules for pkg ESM resolution',
);
assert.match(
  backendSidecarBuild,
  /assets:\s*\[/,
  'backend sidecar build should include compiled backend modules as readable snapshot assets for ESM imports',
);
assert.match(
  backendSidecarBuild,
  /backend\/node_modules\/onnxruntime-node\/\*\*\/\*/,
  'backend sidecar build should include onnxruntime-node native runtime assets for local ASR',
);
assert.match(
  backendSidecarBuild,
  /node_modules\/\.pnpm\/onnxruntime-node@\*\/node_modules\/onnxruntime-node\/\*\*\/\*/,
  'backend sidecar build should include pnpm realpath onnxruntime-node native assets',
);
assert.match(
  backendSidecarBuild,
  /onnxruntime-node\/package\.json/,
  'backend sidecar build should resolve the real onnxruntime-node package root before writing pkg assets',
);
assert.match(
  backendSidecarBuild,
  /relative\(buildTempDir,\s*repoRoot\)/,
  'backend sidecar build should write pkg config paths relative to the generated config directory',
);
assert.match(
  backendSidecarBuild,
  /relative\(buildTempDir,\s*onnxruntimeNodeRoot\)/,
  'backend sidecar build should write pkg asset paths from the resolved onnxruntime-node package root relative to the generated config directory',
);
assert.match(
  backendSidecarBuild,
  /publicPackages/,
  'backend sidecar build should mark onnxruntime-node public so pkg keeps it resolvable at runtime',
);
assert.doesNotMatch(
  funAsrNanoRunner,
  /process\.exitCode\s*=\s*await\s+runFunAsrNanoCli\(\)/,
  'Fun-ASR-Nano CLI entrypoint should avoid top-level await so pkg can transform the backend sidecar',
);
assert.doesNotMatch(
  funAsrNanoRunner,
  /createRequire/,
  'Fun-ASR-Nano runner should use static imports so pkg can detect native ASR dependencies',
);

assert.match(
  devDesktopLlm,
  /HONEY_DESKTOP_WITH_LLM/,
  'desktop LLM launcher should enable the LLM service flag for Tauri dev services',
);
assert.match(
  devDesktopServices,
  /HONEY_DESKTOP_WITH_LLM/,
  'desktop service launcher should support optional local LLM startup',
);
assert.match(
  devDesktopServices,
  /dev:llm/,
  'desktop service launcher should start the local LLM service when enabled',
);
assert.match(
  devDesktopServices,
  /HONEY_PERSONA_OPENAI_BASE_URL/,
  'desktop service launcher should point the backend at the local LLM OpenAI-compatible endpoint',
);
assert.match(
  devDesktopServices,
  /HONEY_PERSONA_OPENAI_MODEL/,
  'desktop service launcher should pass the local LLM model alias to the backend',
);
assert.match(
  personaLlmSmoke,
  /System\.Speech/,
  'persona LLM smoke should generate a Windows TTS audio sample',
);
assert.match(
  personaLlmSmoke,
  /runPersonaDictationSession/,
  'persona LLM smoke should run the backend persona dictation session',
);
assert.match(
  personaLlmSmoke,
  /llama-server/,
  'persona LLM smoke should start the local llama-server runtime',
);

for (const legacyCommand of [
  'honey_get_settings',
  'honey_list_transcript_records',
  'honey_list_hotwords',
  'honey_list_rules',
  'honey_list_personas',
  'honey_save_hotword',
  'honey_save_rule',
]) {
  assert.equal(
    tauriLib.includes(legacyCommand),
    false,
    `Tauri shell should not expose legacy business-data mock command ${legacyCommand}`,
  );
}

for (const desktopCommand of [
  'honey_desktop_capabilities',
  'honey_get_backend_process_status',
  'honey_start_backend_process',
  'honey_stop_backend_process',
  'honey_get_desktop_window_mode',
  'honey_set_desktop_window_mode',
  'honey_register_hold_to_talk_hotkey',
  'honey_unregister_hold_to_talk_hotkey',
  'honey_start_hold_to_talk_capture',
  'honey_finish_hold_to_talk_capture',
  'honey_cancel_hold_to_talk_capture',
  'honey_insert_text',
  'honey_preview_text_insertion',
]) {
  assert.equal(
    tauriLib.includes(desktopCommand),
    true,
    `Tauri shell should expose desktop command ${desktopCommand}`,
  );
}

assert.match(
  tauriLib,
  /tauri_plugin_global_shortcut/,
  'Tauri shell should install the global shortcut plugin for real hotkey events',
);
assert.match(
  tauriLib,
  /honey:\/\/hold-to-talk-hotkey/,
  'Tauri shell should emit a stable hold-to-talk hotkey event to the WebView',
);
assert.match(
  tauriLib,
  /ShortcutState::Pressed/,
  'Tauri shell should distinguish hotkey pressed events',
);
assert.match(
  tauriLib,
  /ShortcutState::Released/,
  'Tauri shell should distinguish hotkey released events',
);
assert.match(
  tauriLib,
  /"canRegisterGlobalHotkey": true/,
  'Tauri capabilities should report global hotkey support',
);
assert.match(
  tauriLib,
  /not_listening/,
  'Tauri hold-to-talk finish should reject when capture was not started',
);
assert.match(
  tauriLib,
  /capture\.state\s*!=\s*"listening"/,
  'Tauri hold-to-talk finish should require the listening state',
);
assert.equal(
  tauriLib.includes('mock://tauri-hold-to-talk.wav'),
  false,
  'Tauri hold-to-talk capture should return a local audio file path instead of a mock URI',
);
assert.match(
  tauriLib,
  /"canInsertText": true/,
  'Tauri capabilities should report real text insertion support',
);
assert.match(
  tauriLib,
  /powershell\.exe/,
  'Tauri text insertion should use a Windows system insertion path',
);
