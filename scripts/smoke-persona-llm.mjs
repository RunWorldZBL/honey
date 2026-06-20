import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const backendDir = join(repoRoot, 'backend');
const backendEntry = join(repoRoot, 'backend', 'dist-test', 'backend', 'src', 'index.js');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const executableName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
const llamaServerPath = process.env.HONEY_LLAMA_SERVER_PATH
  || join(repoRoot, '.tools', 'llama.cpp', executableName);
const llmModelPath = process.env.HONEY_LLM_MODEL_PATH
  || join(repoRoot, 'models', 'Qwen3-0.6B-Q8_0.gguf');
const llmHost = process.env.HONEY_LLM_HOST || '127.0.0.1';
const llmPort = process.env.HONEY_LLM_PORT || '18082';
const llmAlias = process.env.HONEY_PERSONA_OPENAI_MODEL || 'qwen3-0_6b';
const ttsText = process.env.HONEY_SMOKE_TTS_TEXT || '怎么今天加班啊';

const ensurePath = async (path, label) => {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
};

const runProcess = async (command, args, options = {}) => await new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });

  child.on('error', reject);
  child.on('exit', code => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown'}`));
  });
});

const ensureBackendCompiled = async () => {
  try {
    await access(backendEntry);
  } catch {
    await runProcess(pnpmCommand, ['--filter', 'backend', 'test']);
  }
};

const writeTtsAudio = async (audioPath, text, tempDir) => {
  if (process.platform !== 'win32') {
    throw new Error('System.Speech TTS smoke generation is currently Windows-only');
  }

  const scriptPath = join(tempDir, 'generate-tts.ps1');
  await writeFile(scriptPath, `
param(
  [string]$Path,
  [string]$Text
)
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SetOutputToWaveFile($Path)
$speaker.Speak($Text)
$speaker.Dispose()
`, 'utf8');

  await runProcess('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-Path',
    audioPath,
    '-Text',
    text,
  ]);
};

const waitForLlm = async (baseUrl, child) => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`llama-server exited early with ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting until the server binds the port.
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error('llama-server did not become ready in time');
};

await ensurePath(llamaServerPath, 'llama-server executable');
await ensurePath(llmModelPath, 'LLM model');
await ensureBackendCompiled();

const tempDir = await mkdtemp(join(tmpdir(), 'honey-persona-llm-smoke-'));
const audioPath = join(tempDir, 'overtime.wav');
const dataFilePath = join(tempDir, 'honey-data.json');
const llmBaseUrl = `http://${llmHost}:${llmPort}`;
const llamaServer = spawn(llamaServerPath, [
  '--model',
  llmModelPath,
  '--alias',
  llmAlias,
  '--host',
  llmHost,
  '--port',
  llmPort,
  '--ctx-size',
  process.env.HONEY_LLM_CTX_SIZE || '1024',
  '--threads',
  process.env.HONEY_LLM_THREADS || '2',
], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

try {
  await waitForLlm(llmBaseUrl, llamaServer);
  await writeTtsAudio(audioPath, ttsText, tempDir);

  const { createHoneyService, createHoneyServiceOptionsFromEnv } = await import(pathToFileURL(backendEntry).href);
  const previousCwd = process.cwd();
  process.chdir(backendDir);
  try {
    const service = createHoneyService(createHoneyServiceOptionsFromEnv({
      HONEY_DATA_FILE: dataFilePath,
      HONEY_PERSONA_OPENAI_BASE_URL: llmBaseUrl,
      HONEY_PERSONA_OPENAI_MODEL: llmAlias,
      HONEY_PERSONA_OPENAI_TIMEOUT_MS: process.env.HONEY_PERSONA_OPENAI_TIMEOUT_MS || '120000',
    }, 'win32', 'C:/Users/benlin'));
    const session = await service.runPersonaDictationSession({
      audioPath,
      sourceApp: '飞书',
      personaId: 'persona-office',
    });
    const record = session.record;

    if (record.status !== 'completed') {
      throw new Error(`persona session failed with status ${record.status}`);
    }

    if (!record.rawText.trim() || !record.outputText.trim()) {
      throw new Error('persona session returned empty text');
    }

    if (/原因是|可能是因为|\.{3}|……/.test(record.outputText)) {
      throw new Error(`persona output looks answer-like instead of rewrite: ${record.outputText}`);
    }

    console.log(JSON.stringify({
      status: record.status,
      rawText: record.rawText,
      outputText: record.outputText,
      overlayStates: session.overlayStates,
      latencyMs: record.latencyMs,
    }, null, 2));
  } finally {
    process.chdir(previousCwd);
  }
} finally {
  if (llamaServer.exitCode === null) {
    llamaServer.kill();
  }
  await rm(tempDir, { recursive: true, force: true });
}
