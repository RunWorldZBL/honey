import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createHoneyService, type HoneyService } from './honeyService.js';
import { createHoneyHttpServer } from './httpServer.js';
import { createCommandAsrAdapter } from './asrAdapter.js';
import { transcribeWithFunAsrNano } from './funAsrNanoRunner.js';
import { createCommandPersonaRewriteAdapter, createOpenAiCompatiblePersonaRewriteAdapter } from './personaRewriteAdapter.js';

export { createHoneyService, type HoneyService } from './honeyService.js';
export { createHoneyHttpServer } from './httpServer.js';

export interface BackendServiceStatus {
  service: 'honey-backend';
  mode: 'local';
}

export function getBackendServiceStatus(): BackendServiceStatus {
  return {
    service: 'honey-backend',
    mode: 'local',
  };
}

export interface StartHoneyBackendOptions {
  port?: number;
  host?: string;
  dataFilePath?: string;
}

export function resolveDefaultHoneyDataFilePath(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  homeDir = homedir(),
): string {
  if (env.HONEY_DATA_FILE) {
    return env.HONEY_DATA_FILE;
  }

  const dataRoot = platform === 'win32'
    ? env.APPDATA ?? join(homeDir, 'AppData', 'Roaming')
    : env.XDG_DATA_HOME ?? join(homeDir, '.local', 'share');

  return join(dataRoot, 'honey', 'honey-data.json');
}

const parsePositiveInt = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const isBackendWorkspaceDirectory = (cwd: string) =>
  basename(cwd).toLowerCase() === 'backend';

const resolveDefaultModelRoot = (
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  dataRoot = dirname(resolveDefaultHoneyDataFilePath(env)),
) =>
  env.HONEY_MODEL_ROOT?.trim()
  || (isBackendWorkspaceDirectory(cwd)
    ? '../Fun-ASR-Nano-GGUF'
    : join(dataRoot, 'models', 'Fun-ASR-Nano-GGUF'));

const resolveDefaultLlmModelRoot = (
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  dataRoot = dirname(resolveDefaultHoneyDataFilePath(env)),
) =>
  env.HONEY_LLM_MODEL_ROOT?.trim()
  || (isBackendWorkspaceDirectory(cwd) ? '../models' : join(dataRoot, 'models', 'llm'));

const resolveDefaultRepoRoot = (env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) => {
  if (env.HONEY_REPO_ROOT?.trim()) {
    return env.HONEY_REPO_ROOT.trim();
  }

  return isBackendWorkspaceDirectory(cwd) ? resolve(cwd, '..') : cwd;
};

const resolveDefaultLlamaServerPath = (
  env: NodeJS.ProcessEnv,
  repoRoot: string,
  cwd: string,
  dataRoot: string,
) => {
  if (env.HONEY_LLAMA_SERVER_PATH?.trim()) {
    return env.HONEY_LLAMA_SERVER_PATH.trim();
  }

  const executableName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  return isBackendWorkspaceDirectory(cwd)
    ? join(repoRoot, '.tools', 'llama.cpp', executableName)
    : join(dataRoot, 'runtime', 'llama.cpp', executableName);
};

const resolveExplicitLlmModelPath = (env: NodeJS.ProcessEnv) =>
  env.HONEY_LLM_MODEL_PATH?.trim();

const resolveDefaultLlmModelAlias = (env: NodeJS.ProcessEnv = process.env) =>
  env.HONEY_PERSONA_OPENAI_MODEL?.trim() || 'qwen3-4b-instruct-q4_k_m';

const resolveDefaultLlmHost = (env: NodeJS.ProcessEnv = process.env) =>
  env.HONEY_LLM_HOST?.trim() || '127.0.0.1';

const resolvePersonaRewriteAdapter = (env: NodeJS.ProcessEnv) => {
  if (env.HONEY_PERSONA_REWRITE_COMMAND) {
    return createCommandPersonaRewriteAdapter({
      command: env.HONEY_PERSONA_REWRITE_COMMAND,
      timeoutMs: parsePositiveInt(env.HONEY_PERSONA_REWRITE_TIMEOUT_MS),
    });
  }

  if (env.HONEY_PERSONA_OPENAI_BASE_URL) {
    return createOpenAiCompatiblePersonaRewriteAdapter({
      baseUrl: env.HONEY_PERSONA_OPENAI_BASE_URL,
      model: env.HONEY_PERSONA_OPENAI_MODEL?.trim() || 'qwen3-4b-instruct-q4_k_m',
      timeoutMs: parsePositiveInt(env.HONEY_PERSONA_OPENAI_TIMEOUT_MS)
        ?? parsePositiveInt(env.HONEY_PERSONA_REWRITE_TIMEOUT_MS),
    });
  }

  return undefined;
};

export function createHoneyServiceOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  homeDir = homedir(),
  cwd = process.cwd(),
): Parameters<typeof createHoneyService>[0] {
  const dataFilePath = resolveDefaultHoneyDataFilePath(env, platform, homeDir);
  const dataRoot = dirname(dataFilePath);
  const modelRoot = resolveDefaultModelRoot(env, cwd, dataRoot);
  const llmModelRoot = resolveDefaultLlmModelRoot(env, cwd, dataRoot);
  const repoRoot = resolveDefaultRepoRoot(env, cwd);
  const llamaServerPath = resolveDefaultLlamaServerPath(env, repoRoot, cwd, dataRoot);
  const explicitLlmModelPath = resolveExplicitLlmModelPath(env);
  const personaRewriteConfigured = Boolean(
    env.HONEY_PERSONA_REWRITE_COMMAND || env.HONEY_PERSONA_OPENAI_BASE_URL,
  );

  return {
    dataFilePath,
    modelRoot,
    llmModelRoot,
    asrAdapter: env.HONEY_ASR_COMMAND
      ? createCommandAsrAdapter({
        command: env.HONEY_ASR_COMMAND,
        timeoutMs: parsePositiveInt(env.HONEY_ASR_TIMEOUT_MS),
      })
      : {
        transcribe: input => transcribeWithFunAsrNano({
          ...input,
          modelRoot: input.modelRoot ?? modelRoot,
        }),
      },
    personaRewriteAdapter: resolvePersonaRewriteAdapter(env),
    localLlmRuntimeExecutablePath: llamaServerPath,
    localLlmRuntimeCwd: repoRoot,
    llamaServerPath,
    localLlmRuntimeDefaults: {
      ...(explicitLlmModelPath ? { modelPath: explicitLlmModelPath } : {}),
      modelAlias: resolveDefaultLlmModelAlias(env),
      host: resolveDefaultLlmHost(env),
      port: parsePositiveInt(env.HONEY_LLM_PORT) ?? 8080,
      contextSize: parsePositiveInt(env.HONEY_LLM_CTX_SIZE) ?? 4096,
      threads: parsePositiveInt(env.HONEY_LLM_THREADS),
    },
    runtimeCommands: {
      asrConfigured: true,
      personaRewriteConfigured,
    },
  };
}

export function startHoneyBackend(options: StartHoneyBackendOptions = {}) {
  const service = createHoneyService({
    ...createHoneyServiceOptionsFromEnv(),
    dataFilePath: options.dataFilePath ?? resolveDefaultHoneyDataFilePath(),
  });
  const server = createHoneyHttpServer(service);
  const port = options.port ?? 33577;
  const host = options.host ?? '127.0.0.1';

  server.listen(port, host, () => {
    console.log(`honey backend listening on http://${host}:${port}`);
  });

  return server;
}

export function isHoneyBackendCliEntrypoint(moduleUrl: string, entryPath?: string): boolean {
  return Boolean(entryPath && moduleUrl === pathToFileURL(entryPath).href);
}

if (isHoneyBackendCliEntrypoint(import.meta.url, process.argv[1])) {
  startHoneyBackend();
}
