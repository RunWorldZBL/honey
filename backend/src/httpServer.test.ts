import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHoneyService } from './honeyService.js';
import { createHoneyHttpServer } from './httpServer.js';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertOk(value: unknown, message: string) {
  if (!value) {
    throw new Error(message);
  }
}

async function listenOnRandomPort(server: ReturnType<typeof createHoneyHttpServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('HTTP server did not expose a TCP address');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createHoneyHttpServer>) {
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

async function readJson<T>(response: Response): Promise<T> {
  assertEqual(response.ok, true, `HTTP ${response.url} should respond successfully`);
  return await response.json() as T;
}

async function testHoneyHttpServer() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-http-audio-'));
  const service = createHoneyService({ modelRoot: '../Fun-ASR-Nano-GGUF' });
  await service.updateSettings({ localDataPath: dataDir });
  const server = createHoneyHttpServer(service);
  const baseUrl = await listenOnRandomPort(server);

  try {
    const health = await readJson<{ service: string; mode: string }>(await fetch(`${baseUrl}/api/health`));
    assertEqual(health.service, 'honey-backend', 'health endpoint should identify the backend service');
    assertEqual(health.mode, 'local', 'health endpoint should identify local mode');

    const runtimeHealth = await readJson<{
      service: string;
      mode: string;
      localDataPath: string;
      audioCapturePath: string;
      modelRoot: string;
      models: Array<{ id: string; status: string }>;
      asr: { status: string; commandConfigured: boolean };
      personaRewrite: { status: string; commandConfigured: boolean };
      llmRuntime: { status: string };
      issues: string[];
    }>(await fetch(`${baseUrl}/api/runtime/health`));
    assertEqual(runtimeHealth.service, 'honey-backend', 'runtime health endpoint should identify the backend service');
    assertEqual(runtimeHealth.mode, 'local', 'runtime health endpoint should identify local mode');
    assertEqual(runtimeHealth.localDataPath, dataDir, 'runtime health endpoint should expose local data path');
    assertEqual(runtimeHealth.audioCapturePath, join(dataDir, 'audio-captures'), 'runtime health endpoint should expose audio capture path');
    assertEqual(runtimeHealth.modelRoot, '../Fun-ASR-Nano-GGUF', 'runtime health endpoint should expose model root');
    assertEqual(runtimeHealth.models.some(model => model.id === 'fun-asr-nano' && model.status === 'installed'), true, 'runtime health endpoint should expose local model inventory');
    assertEqual(runtimeHealth.asr.commandConfigured, false, 'runtime health endpoint should expose ASR command configuration');
    assertEqual(runtimeHealth.asr.status, 'mock', 'runtime health endpoint should expose ASR runtime status');
    assertEqual(runtimeHealth.personaRewrite.commandConfigured, false, 'runtime health endpoint should expose persona rewrite command configuration');
    assertEqual(runtimeHealth.llmRuntime.status, 'stopped', 'runtime health endpoint should expose local LLM runtime status');
    assertEqual(runtimeHealth.issues.includes('asr_command_not_configured'), true, 'runtime health endpoint should expose missing ASR command issue');

    const llmStatus = await readJson<{ status: string }>(await fetch(`${baseUrl}/api/runtime/llm`));
    assertEqual(llmStatus.status, 'stopped', 'LLM runtime status endpoint should expose stopped state');

    const startedLlm = await readJson<{ status: string; modelAlias?: string; port?: number }>(await fetch(`${baseUrl}/api/runtime/llm/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
        modelAlias: 'qwen3-0_6b',
        host: '127.0.0.1',
        port: 18082,
      }),
    }));
    assertEqual(startedLlm.status, 'running', 'LLM runtime start endpoint should return running status');
    assertEqual(startedLlm.modelAlias, 'qwen3-0_6b', 'LLM runtime start endpoint should keep model alias');
    assertEqual(startedLlm.port, 18082, 'LLM runtime start endpoint should keep port');

    const invalidLlmStart = await fetch(`${baseUrl}/api/runtime/llm/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelPath: '',
        modelAlias: 'qwen3-0_6b',
      }),
    });
    assertEqual(invalidLlmStart.status, 400, 'LLM runtime start endpoint should reject invalid payloads');

    const stoppedLlm = await readJson<{ status: string }>(await fetch(`${baseUrl}/api/runtime/llm/stop`, {
      method: 'POST',
    }));
    assertEqual(stoppedLlm.status, 'stopped', 'LLM runtime stop endpoint should return stopped status');

    const defaultStartedLlm = await readJson<{ status: string; modelAlias?: string; port?: number }>(await fetch(`${baseUrl}/api/runtime/llm/start`, {
      method: 'POST',
    }));
    assertEqual(defaultStartedLlm.status, 'running', 'LLM runtime start endpoint should support default startup settings');
    assertEqual(defaultStartedLlm.modelAlias, 'qwen3-4b-instruct-q4_k_m', 'LLM runtime default start should use the default model alias');
    assertEqual(defaultStartedLlm.port, 8080, 'LLM runtime default start should use the default port');

    const settings = await readJson<{ defaultMode: string }>(await fetch(`${baseUrl}/api/settings`));
    assertEqual(settings.defaultMode, 'direct', 'settings endpoint should expose direct transcription as default');

    const patchedSettings = await readJson<{ hotkey: string; personaModeEnabled: boolean }>(await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hotkey: 'F8',
        personaModeEnabled: true,
      }),
    }));
    assertEqual(patchedSettings.hotkey, 'F8', 'settings endpoint should update hotkey');
    assertEqual(patchedSettings.personaModeEnabled, true, 'settings endpoint should update persona mode state');

    const invalidSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hotkey: 88,
        forcePasteApps: '飞书',
      }),
    });
    assertEqual(invalidSettingsResponse.status, 400, 'settings endpoint should reject invalid patch payloads');

    const settingsAfterInvalidPatch = await readJson<{ hotkey: string; forcePasteApps: string[] }>(await fetch(`${baseUrl}/api/settings`));
    assertEqual(settingsAfterInvalidPatch.hotkey, 'F8', 'invalid settings payload should not overwrite existing hotkey');
    assertEqual(Array.isArray(settingsAfterInvalidPatch.forcePasteApps), true, 'invalid settings payload should not corrupt list values');

    const malformedSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assertEqual(malformedSettingsResponse.status, 400, 'settings endpoint should reject malformed JSON payloads');

    const audioBytes = Buffer.from('honey-http-audio', 'utf8');
    const uploadedAudio = await readJson<{
      audioPath: string;
      byteLength: number;
      mimeType: string;
      durationMs?: number;
    }>(await fetch(`${baseUrl}/api/audio-captures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: 'hold-to-talk.wav',
        mimeType: 'audio/wav',
        base64Data: audioBytes.toString('base64'),
        durationMs: 1200,
      }),
    }));
    assertEqual(uploadedAudio.mimeType, 'audio/wav', 'audio capture endpoint should keep mime type');
    assertEqual(uploadedAudio.byteLength, audioBytes.length, 'audio capture endpoint should return written byte length');
    assertEqual(uploadedAudio.durationMs, 1200, 'audio capture endpoint should keep duration metadata');
    assertEqual(uploadedAudio.audioPath.includes('audio-captures'), true, 'audio capture endpoint should save under the capture directory');
    assertEqual((await readFile(uploadedAudio.audioPath)).equals(audioBytes), true, 'audio capture endpoint should write the uploaded bytes');

    const invalidAudioCapture = await fetch(`${baseUrl}/api/audio-captures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: 'hold-to-talk.wav',
        mimeType: 'audio/wav',
      }),
    });
    assertEqual(invalidAudioCapture.status, 400, 'audio capture endpoint should reject missing audio data');

    const deletePreflight = await fetch(`${baseUrl}/api/personas/memory`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:1420' },
    });
    assertEqual(
      deletePreflight.headers.get('access-control-allow-methods')?.includes('DELETE'),
      true,
      'CORS preflight should allow DELETE methods used by the frontend client',
    );
    assertEqual(
      deletePreflight.headers.get('access-control-allow-origin'),
      'http://localhost:1420',
      'CORS preflight should allow the Tauri dev origin',
    );
    const loopbackPreflight = await fetch(`${baseUrl}/api/personas/memory`, {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:1420' },
    });
    assertEqual(
      loopbackPreflight.headers.get('access-control-allow-origin'),
      'http://127.0.0.1:1420',
      'CORS preflight should keep supporting the loopback frontend origin',
    );
    assertEqual(
      loopbackPreflight.headers.get('access-control-allow-methods')?.includes('PATCH'),
      true,
      'CORS preflight should allow PATCH methods used by settings',
    );

    const models = await readJson<Array<{ id: string; status: string }>>(await fetch(`${baseUrl}/api/models`));
    const funAsrNano = models.find(model => model.id === 'fun-asr-nano');
    assertOk(funAsrNano, 'models endpoint should include Fun-ASR-Nano');
    assertEqual(funAsrNano?.status, 'installed', 'models endpoint should reflect local model inventory');

    const preview = await readJson<{ output: string }>(await fetch(`${baseUrl}/api/rules/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: '调用欧盆 AI' }),
    }));

    assertEqual(preview.output, '调用欧盆 AI', 'rules preview endpoint should return preview output');

    const savedHotword = await readJson<{ canonical: string }>(await fetch(`${baseUrl}/api/hotwords`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'hotword-openai',
        canonical: 'OpenAI',
        aliases: ['欧盆 AI'],
        blacklist: [],
        enabled: true,
      }),
    }));
    assertEqual(savedHotword.canonical, 'OpenAI', 'hotword endpoint should save a hotword');

    const invalidHotword = await fetch(`${baseUrl}/api/hotwords`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'hotword-invalid',
        canonical: 'Bad',
        aliases: '坏数据',
        blacklist: [],
        enabled: true,
      }),
    });
    assertEqual(invalidHotword.status, 400, 'hotword endpoint should reject invalid payloads');

    const hotwords = await readJson<Array<{ id: string }>>(await fetch(`${baseUrl}/api/hotwords`));
    assertEqual(hotwords.some(item => item.id === 'hotword-openai'), true, 'hotword endpoint should list saved hotwords');
    assertEqual(hotwords.some(item => item.id === 'hotword-invalid'), false, 'hotword endpoint should not persist invalid payloads');

    const savedRule = await readJson<{ name: string }>(await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'rule-openai',
        name: 'OpenAI 昵称',
        pattern: '欧盆 AI',
        replacement: 'OpenAI',
        isRegex: false,
        enabled: true,
      }),
    }));
    assertEqual(savedRule.name, 'OpenAI 昵称', 'rule endpoint should save a rule');

    const invalidRule = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'rule-invalid',
        name: '坏规则',
        pattern: '[',
        replacement: 'bad',
        isRegex: true,
        enabled: true,
      }),
    });
    assertEqual(invalidRule.status, 400, 'rule endpoint should reject invalid regular expressions');

    const updatedPreview = await readJson<{ output: string }>(await fetch(`${baseUrl}/api/rules/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: '调用欧盆 AI' }),
    }));
    assertEqual(updatedPreview.output, '调用OpenAI', 'rules preview endpoint should use saved rules');

    const records = await readJson<Array<{ id: string }>>(await fetch(`${baseUrl}/api/transcripts`));
    const firstRecordId = records[0]?.id;
    assertOk(firstRecordId, 'transcript endpoint should list seeded records');

    const deletedRecord = await readJson<{ ok: true; id: string }>(await fetch(`${baseUrl}/api/transcripts/${firstRecordId}`, {
      method: 'DELETE',
    }));
    assertEqual(deletedRecord.id, firstRecordId, 'transcript delete endpoint should return deleted id');

    const recordsAfterDelete = await readJson<Array<{ id: string }>>(await fetch(`${baseUrl}/api/transcripts`));
    assertEqual(recordsAfterDelete.some(item => item.id === firstRecordId), false, 'transcript delete endpoint should remove records');

    const directSession = await readJson<{
      overlayStates: string[];
      record: {
        id: string;
        audioPath?: string;
        mode: string;
        outputText: string;
        sourceApp?: string;
        status: string;
      };
    }>(await fetch(`${baseUrl}/api/dictation/direct-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audioPath: 'D:/tmp/honey-http.wav',
        sourceApp: 'HTTP 输入框',
      }),
    }));
    assertEqual(directSession.overlayStates.join('>'), 'listening>recognizing>completed>inserted', 'direct dictation endpoint should expose overlay flow');
    assertEqual(directSession.record.audioPath, 'D:/tmp/honey-http.wav', 'direct dictation endpoint should keep audio path');
    assertEqual(directSession.record.sourceApp, 'HTTP 输入框', 'direct dictation endpoint should keep source app');
    assertEqual(directSession.record.mode, 'direct', 'direct dictation endpoint should archive direct mode records');
    assertEqual(directSession.record.status, 'completed', 'direct dictation endpoint should return completed record');

    const recordsAfterDirectSession = await readJson<Array<{ id: string }>>(await fetch(`${baseUrl}/api/transcripts`));
    assertEqual(
      recordsAfterDirectSession.some(item => item.id === directSession.record.id),
      true,
      'direct dictation endpoint should archive the generated transcript record',
    );

    const invalidDirectSession = await fetch(`${baseUrl}/api/dictation/direct-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audioPath: 88,
      }),
    });
    assertEqual(invalidDirectSession.status, 400, 'direct dictation endpoint should reject invalid payloads');

    const fileTasks = await readJson<Array<{
      id: string;
      status: string;
      outputFormats: string[];
    }>>(await fetch(`${baseUrl}/api/file-tasks`));
    assertOk(fileTasks.length > 0, 'file tasks endpoint should list seeded tasks');
    assertEqual(fileTasks[0]?.id, 'file-001', 'file tasks endpoint should expose queued task ids');
    assertEqual(fileTasks[0]?.status, 'processing', 'file tasks endpoint should expose task status');
    assertEqual(fileTasks[0]?.outputFormats.includes('txt'), true, 'file tasks endpoint should expose output formats');

    const createdFileTask = await readJson<{
      fileName: string;
      sourcePath?: string;
      status: string;
      progress: number;
      outputFormats: string[];
      transcriptText?: string;
    }>(await fetch(`${baseUrl}/api/file-tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: 'D:/recordings/客户访谈.mp3',
        outputFormats: ['txt', 'json'],
      }),
    }));
    assertEqual(createdFileTask.fileName, '客户访谈.mp3', 'file tasks endpoint should derive file name from local path');
    assertEqual(createdFileTask.sourcePath, 'D:/recordings/客户访谈.mp3', 'file tasks endpoint should keep source path');
    assertEqual(createdFileTask.status, 'completed', 'file tasks endpoint should run ASR and complete the task');
    assertEqual(createdFileTask.progress, 100, 'file tasks endpoint should report completed progress');
    assertEqual(createdFileTask.outputFormats.join(','), 'txt,json', 'file tasks endpoint should keep requested output formats');
    assertOk(createdFileTask.transcriptText, 'file tasks endpoint should expose transcript text');

    const invalidFileTask = await fetch(`${baseUrl}/api/file-tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: '',
        outputFormats: [],
      }),
    });
    assertEqual(invalidFileTask.status, 400, 'file tasks endpoint should reject invalid create payloads');

    const trayActions = await readJson<Array<{
      id: string;
      enabled: boolean;
    }>>(await fetch(`${baseUrl}/api/tray-actions`));
    assertOk(trayActions.length > 0, 'tray actions endpoint should list seeded actions');
    assertEqual(trayActions.some(action => action.id === 'open-settings'), true, 'tray actions endpoint should include settings entry');
    assertEqual(trayActions.find(action => action.id === 'copy-latest')?.enabled, true, 'tray actions endpoint should expose enabled state');

    const savedPersona = await readJson<{ id: string; name: string }>(await fetch(`${baseUrl}/api/personas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'persona-director',
        name: '项目负责人',
        triggerAliases: ['项目', '负责人'],
        description: '把口述内容整理成项目推进口吻。',
        prompt: '把用户口述内容改成清晰、稳妥、可执行的项目推进表达。',
        outputMode: 'typing',
        modelId: 'qwen3-1_7b',
        enabled: true,
        keepContext: false,
      }),
    }));
    assertEqual(savedPersona.id, 'persona-director', 'persona endpoint should save a persona');

    const personasAfterSave = await readJson<Array<{ id: string }>>(await fetch(`${baseUrl}/api/personas`));
    assertEqual(personasAfterSave.some(item => item.id === 'persona-director'), true, 'persona endpoint should list saved personas');

    const personaSession = await readJson<{
      overlayStates: string[];
      record: {
        id: string;
        audioPath?: string;
        mode: string;
        roleId?: string;
        sourceApp?: string;
        status: string;
      };
    }>(await fetch(`${baseUrl}/api/dictation/persona-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audioPath: 'D:/tmp/honey-persona-http.wav',
        sourceApp: 'HTTP Editor',
        personaId: 'persona-director',
      }),
    }));
    assertEqual(personaSession.overlayStates.join('>'), 'listening>recognizing>completed>inserted', 'persona dictation endpoint should expose overlay flow');
    assertEqual(personaSession.record.audioPath, 'D:/tmp/honey-persona-http.wav', 'persona dictation endpoint should keep audio path');
    assertEqual(personaSession.record.sourceApp, 'HTTP Editor', 'persona dictation endpoint should keep source app');
    assertEqual(personaSession.record.mode, 'persona', 'persona dictation endpoint should archive persona mode records');
    assertEqual(personaSession.record.roleId, 'persona-director', 'persona dictation endpoint should archive selected persona id');
    assertEqual(personaSession.record.status, 'completed', 'persona dictation endpoint should return completed record');

    const invalidPersonaSession = await fetch(`${baseUrl}/api/dictation/persona-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audioPath: 'D:/tmp/honey-persona-http.wav',
      }),
    });
    assertEqual(invalidPersonaSession.status, 400, 'persona dictation endpoint should reject missing persona id');

    const invalidPersonaResponse = await fetch(`${baseUrl}/api/personas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'persona-invalid',
        name: '坏数据',
        triggerAliases: '项目',
        description: '非法人设',
        prompt: '非法',
        outputMode: 'typing',
        enabled: true,
        keepContext: false,
      }),
    });
    assertEqual(invalidPersonaResponse.status, 400, 'persona endpoint should reject invalid payloads');

    const personasAfterInvalidSave = await readJson<Array<{ id: string }>>(await fetch(`${baseUrl}/api/personas`));
    assertEqual(personasAfterInvalidSave.some(item => item.id === 'persona-invalid'), false, 'invalid persona payload should not be persisted');

    const deletedPersona = await readJson<{ ok: true; id: string }>(await fetch(`${baseUrl}/api/personas/persona-director`, {
      method: 'DELETE',
    }));
    assertEqual(deletedPersona.id, 'persona-director', 'persona endpoint should delete saved personas');

    const clearedAllPersonas = await readJson<{ ok: true; personaId?: string }>(await fetch(`${baseUrl}/api/personas/memory`, {
      method: 'DELETE',
    }));
    assertEqual(clearedAllPersonas.personaId, undefined, 'persona memory endpoint should support clearing all personas');
    assertEqual(await service.wasPersonaMemoryCleared('persona-office'), true, 'persona memory endpoint should clear seeded personas');

    const clearedPersona = await readJson<{ ok: true; personaId?: string }>(await fetch(`${baseUrl}/api/personas/persona-office/memory`, {
      method: 'DELETE',
    }));
    assertEqual(clearedPersona.personaId, 'persona-office', 'persona memory endpoint should clear one persona');
  } finally {
    await closeServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
}

await testHoneyHttpServer();
