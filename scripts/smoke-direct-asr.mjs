import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const backendDir = join(repoRoot, 'backend');
const backendEntry = join(repoRoot, 'backend', 'dist-test', 'backend', 'src', 'index.js');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const asrModelRoot = process.env.HONEY_MODEL_ROOT || join(repoRoot, 'Fun-ASR-Nano-GGUF');
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
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$speaker.SetOutputToWaveFile($Path, $format)
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

await ensurePath(asrModelRoot, 'Fun-ASR-Nano-GGUF model directory');
await ensureBackendCompiled();

const tempDir = await mkdtemp(join(tmpdir(), 'honey-direct-asr-smoke-'));
const audioPath = join(tempDir, 'dictation.wav');
const dataFilePath = join(tempDir, 'honey-data.json');

try {
  await writeTtsAudio(audioPath, ttsText, tempDir);

  const { createHoneyService, createHoneyServiceOptionsFromEnv } = await import(pathToFileURL(backendEntry).href);
  const previousCwd = process.cwd();
  process.chdir(backendDir);
  try {
    const service = createHoneyService(createHoneyServiceOptionsFromEnv({
      HONEY_DATA_FILE: dataFilePath,
      HONEY_MODEL_ROOT: asrModelRoot,
    }, 'win32', 'C:/Users/benlin'));
    const session = await service.runDirectDictationSession({
      audioPath,
      sourceApp: 'smoke-direct-asr',
    });
    const record = session.record;
    const history = await service.listTranscriptRecords();

    if (record.status !== 'completed') {
      throw new Error(`direct ASR session failed with status ${record.status}`);
    }

    if (!record.rawText.trim() || !record.outputText.trim()) {
      throw new Error('direct ASR session returned empty text');
    }

    if (!history.some(item => item.id === record.id && item.status === 'completed')) {
      throw new Error('direct ASR session was not archived to transcript history');
    }

    console.log(JSON.stringify({
      status: record.status,
      rawText: record.rawText,
      outputText: record.outputText,
      overlayStates: session.overlayStates,
      historyCount: history.length,
      durationMs: record.durationMs,
    }, null, 2));
  } finally {
    process.chdir(previousCwd);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
