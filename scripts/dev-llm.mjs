import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const env = process.env;
const executableName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
const defaultExecutablePath = join(repoRoot, '.tools', 'llama.cpp', executableName);
const defaultModelPath = join(repoRoot, 'models', 'Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf');

const executablePath = env.HONEY_LLAMA_SERVER_PATH || defaultExecutablePath;
const modelPath = env.HONEY_LLM_MODEL_PATH || defaultModelPath;
const host = env.HONEY_LLM_HOST || '127.0.0.1';
const port = env.HONEY_LLM_PORT || '8080';
const alias = env.HONEY_PERSONA_OPENAI_MODEL || 'qwen3-4b-instruct-q4_k_m';
const threads = env.HONEY_LLM_THREADS;
const contextSize = env.HONEY_LLM_CTX_SIZE || '4096';

const ensurePath = async (path, label) => {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
};

await ensurePath(executablePath, 'llama-server executable');
await ensurePath(modelPath, 'LLM model');

const args = [
  '--model',
  modelPath,
  '--alias',
  alias,
  '--host',
  host,
  '--port',
  port,
  '--ctx-size',
  contextSize,
];

if (threads) {
  args.push('--threads', threads);
}

console.log(`Starting honey local LLM at http://${host}:${port}`);
console.log(`Model: ${modelPath}`);
console.log(`Backend env: HONEY_PERSONA_OPENAI_BASE_URL=http://${host}:${port}`);
console.log(`Backend env: HONEY_PERSONA_OPENAI_MODEL=${alias}`);

const child = spawn(executablePath, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', code => {
  process.exit(code ?? 0);
});
