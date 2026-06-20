import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHoneyService, createHoneyServiceOptionsFromEnv, isHoneyBackendCliEntrypoint, resolveDefaultHoneyDataFilePath } from './index.js';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function listenOnRandomPort(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test server did not expose a TCP address');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function testCliEntrypointDetection() {
  assertEqual(
    isHoneyBackendCliEntrypoint(
      'file:///D:/products/voice-to-text/backend/dist-test/backend/src/index.js',
      'D:\\products\\voice-to-text\\backend\\dist-test\\backend\\src\\index.js',
    ),
    true,
    'CLI detection should support Windows absolute paths',
  );

  assertEqual(
    isHoneyBackendCliEntrypoint(
      'file:///D:/products/voice-to-text/backend/dist-test/backend/src/index.js',
      'D:\\products\\voice-to-text\\backend\\dist-test\\backend\\src\\httpServer.test.js',
    ),
    false,
    'CLI detection should reject other entry files',
  );
}

function testDefaultDataFilePathResolution() {
  assertEqual(
    resolveDefaultHoneyDataFilePath(
      { APPDATA: 'C:\\Users\\benlin\\AppData\\Roaming' },
      'win32',
      'C:\\Users\\benlin',
    ),
    'C:\\Users\\benlin\\AppData\\Roaming\\honey\\honey-data.json',
    'default Windows data file should live under APPDATA',
  );

  assertEqual(
    resolveDefaultHoneyDataFilePath(
      { HONEY_DATA_FILE: 'D:\\portable\\honey-data.json' },
      'win32',
      'C:\\Users\\benlin',
    ),
    'D:\\portable\\honey-data.json',
    'explicit HONEY_DATA_FILE should override the platform default',
  );
}

async function testRuntimeAdapterResolutionFromEnv() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-runtime-env-'));
  const asrScriptPath = join(tempDir, 'asr-runner.mjs');
  const personaScriptPath = join(tempDir, 'persona-runner.mjs');

  try {
    await writeFile(asrScriptPath, `
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        const payload = JSON.parse(input);
        process.stdout.write(JSON.stringify({
          text: payload.modelId + ' transcribed ' + payload.audioPath,
          durationMs: 500
        }));
      });
    `, 'utf8');
    await writeFile(personaScriptPath, `
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        const payload = JSON.parse(input);
        process.stdout.write(JSON.stringify({
          text: payload.persona.id + ' rewrote ' + payload.text,
          latencyMs: 120
        }));
      });
    `, 'utf8');

    const service = createHoneyService(createHoneyServiceOptionsFromEnv({
      HONEY_DATA_FILE: join(tempDir, 'honey-data.json'),
      HONEY_ASR_COMMAND: `"${process.execPath}" "${asrScriptPath}"`,
      HONEY_PERSONA_REWRITE_COMMAND: `"${process.execPath}" "${personaScriptPath}"`,
    }, 'win32', 'C:\\Users\\benlin'));
    const directSession = await service.runDirectDictationSession({
      audioPath: 'D:/tmp/honey-env.wav',
      asrModelId: 'fun-asr-nano',
    });
    const personaSession = await service.runPersonaDictationSession({
      audioPath: 'D:/tmp/honey-env-persona.wav',
      asrModelId: 'fun-asr-nano',
      personaId: 'persona-office',
    });

    assertEqual(directSession.record.outputText, 'fun-asr-nano transcribed D:/tmp/honey-env.wav', 'env ASR command should power direct dictation');
    assertEqual(personaSession.record.outputText.includes('persona-office rewrote fun-asr-nano transcribed D:/tmp/honey-env-persona.wav'), true, 'env persona command should power persona dictation');
    assertEqual(personaSession.record.latencyMs, 120, 'env persona command should provide rewrite latency');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testDefaultRuntimeUsesBuiltInFunAsrNanoAdapter() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-runtime-default-'));

  try {
    const options = createHoneyServiceOptionsFromEnv({
      HONEY_DATA_FILE: join(tempDir, 'honey-data.json'),
    }, 'win32', 'C:\\Users\\benlin');
    if (!options) {
      throw new Error('default runtime options should be defined');
    }

    assertEqual(typeof options.asrAdapter?.transcribe, 'function', 'default runtime should provide a built-in ASR adapter');
    assertEqual(options.modelRoot, '../Fun-ASR-Nano-GGUF', 'default runtime should point at the local Fun-ASR-Nano model root');
    assertEqual(options.runtimeCommands?.asrConfigured, true, 'default runtime should report local ASR as configured');
    assertEqual(options.runtimeCommands?.personaRewriteConfigured, false, 'default runtime should not report persona rewrite configured without a local LLM command');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function testPackagedRuntimeUsesAppDirectoryModelDefaults() {
  const options = createHoneyServiceOptionsFromEnv({
    APPDATA: 'C:\\Users\\benlin\\AppData\\Roaming',
  }, 'win32', 'C:\\Users\\benlin', 'D:\\Apps\\honey');
  if (!options) {
    throw new Error('packaged runtime options should be defined');
  }

  assertEqual(options.modelRoot, 'C:\\Users\\benlin\\AppData\\Roaming\\honey\\models\\Fun-ASR-Nano-GGUF', 'packaged runtime should default ASR models to the user data model directory');
  assertEqual(options.llmModelRoot, 'C:\\Users\\benlin\\AppData\\Roaming\\honey\\models\\llm', 'packaged runtime should default LLM models to the user data model directory');
  assertEqual(
    options.localLlmRuntimeDefaults?.modelPath,
    undefined,
    'packaged runtime should not hard-code an installer-bundled LLM model path',
  );
}

async function testDefaultRuntimeProvidesLocalLlmController() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-runtime-llm-'));

  try {
    const service = createHoneyService(createHoneyServiceOptionsFromEnv({
      HONEY_DATA_FILE: join(tempDir, 'honey-data.json'),
      HONEY_LLAMA_SERVER_PATH: join(tempDir, 'llama-server.exe'),
    }, 'win32', 'C:\\Users\\benlin'));
    const status = await service.startLocalLlmRuntime({
      modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
      modelAlias: 'qwen3-0_6b',
      host: '127.0.0.1',
      port: 18082,
    });

    assertEqual(status.status, 'error', 'default runtime should wire a Node-managed local LLM controller instead of the stopped test controller');
    assertEqual(status.modelAlias, 'qwen3-0_6b', 'local LLM runtime controller should keep the requested model alias');
    assertEqual(status.baseUrl, 'http://127.0.0.1:18082', 'local LLM runtime controller should expose an OpenAI-compatible base URL');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testOpenAiCompatiblePersonaRuntimeResolutionFromEnv() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-runtime-openai-persona-'));
  const asrScriptPath = join(tempDir, 'asr-runner.mjs');
  let capturedBody: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    capturedBody = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
          },
        },
      ],
    }));
  });
  const baseUrl = await listenOnRandomPort(server);

  try {
    await writeFile(asrScriptPath, `
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({
          text: '怎么今天加班啊？',
          durationMs: 500
        }));
      });
    `, 'utf8');

    const service = createHoneyService(createHoneyServiceOptionsFromEnv({
      HONEY_DATA_FILE: join(tempDir, 'honey-data.json'),
      HONEY_ASR_COMMAND: `"${process.execPath}" "${asrScriptPath}"`,
      HONEY_PERSONA_OPENAI_BASE_URL: baseUrl,
      HONEY_PERSONA_OPENAI_MODEL: 'qwen3-4b-instruct-q4_k_m',
    }, 'win32', 'C:\\Users\\benlin'));
    const personaSession = await service.runPersonaDictationSession({
      audioPath: 'D:/tmp/honey-openai-persona.wav',
      asrModelId: 'fun-asr-nano',
      personaId: 'persona-office',
    });
    const health = await service.getRuntimeHealth();

    assertEqual(personaSession.record.outputText, '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。', 'OpenAI-compatible persona env should power persona dictation');
    assertEqual(capturedBody?.model, 'qwen3-4b-instruct-q4_k_m', 'OpenAI-compatible persona env should send configured model');
    assertEqual(health.personaRewrite.status, 'ready', 'OpenAI-compatible persona env should mark persona rewrite ready');
    assertEqual(health.personaRewrite.commandConfigured, true, 'OpenAI-compatible persona env should mark persona rewrite configured');
  } finally {
    await closeServer(server);
    await rm(tempDir, { recursive: true, force: true });
  }
}

testCliEntrypointDetection();
testDefaultDataFilePathResolution();
await testRuntimeAdapterResolutionFromEnv();
await testDefaultRuntimeUsesBuiltInFunAsrNanoAdapter();
testPackagedRuntimeUsesAppDirectoryModelDefaults();
await testDefaultRuntimeProvidesLocalLlmController();
await testOpenAiCompatiblePersonaRuntimeResolutionFromEnv();
