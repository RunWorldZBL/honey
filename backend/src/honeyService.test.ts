import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHoneyService } from './honeyService.js';
import type { FileTranscriptionTask, PersonaProfile, TrayAction } from '@honey/api-contracts';

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

async function fileExists(path: string) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function testLocalDataMutations() {
  const service = createHoneyService();

  assertEqual((await service.getSettings()).defaultMode, 'direct', 'direct transcription should be default');
  assertEqual((await service.getSettings()).personaModeEnabled, false, 'persona mode should be disabled by default');

  const updatedSettings = await service.updateSettings({
    hotkey: 'F8',
    personaModeEnabled: true,
    forcePasteApps: ['飞书'],
  });

  assertEqual(updatedSettings.hotkey, 'F8', 'settings update should return changed hotkey');
  assertEqual(updatedSettings.personaModeEnabled, true, 'settings update should return changed persona mode state');
  assertEqual((await service.getSettings()).forcePasteApps.join(','), '飞书', 'settings update should persist list values');

  await service.saveHotword({
    id: 'hotword-openai',
    canonical: 'OpenAI',
    aliases: ['欧盆 AI'],
    blacklist: [],
    enabled: true,
  });

  assertEqual((await service.listHotwords()).some(item => item.canonical === 'OpenAI'), true, 'hotword should be saved');

  await service.saveRule({
    id: 'rule-openai',
    name: 'OpenAI 昵称',
    pattern: '欧盆 AI',
    replacement: 'OpenAI',
    isRegex: false,
    enabled: true,
  });

  assertEqual(await service.previewRules('调用欧盆 AI'), '调用OpenAI', 'rule preview should apply saved rules');
}

async function testLocalDataPersistence() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-service-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    const firstService = createHoneyService({
      dataFilePath,
      asrAdapter: {
        transcribe: async () => ({
          text: '持久化后的历史记录',
          durationMs: 900,
        }),
      },
    });
    const records = await firstService.listTranscriptRecords();
    const deletedRecordId = records[0]!.id;

    await firstService.updateSettings({
      hotkey: 'F7',
      personaModeEnabled: true,
      forcePasteApps: ['飞书'],
    });
    await firstService.saveHotword({
      id: 'hotword-persist',
      canonical: 'Persist',
      aliases: ['泊丝'],
      blacklist: [],
      enabled: true,
    });
    await firstService.saveRule({
      id: 'rule-persist',
      name: '持久化规则',
      pattern: '泊丝',
      replacement: 'Persist',
      isRegex: false,
      enabled: true,
    });
    await firstService.savePersona({
      id: 'persona-persist',
      name: '持久化人设',
      triggerAliases: ['持久化'],
      description: '验证人设可以写入本地数据文件。',
      prompt: '保持稳定表达。',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    });
    await firstService.deleteTranscriptRecord(deletedRecordId);
    const session = await firstService.runDirectDictationSession({
      audioPath: 'D:/tmp/honey-persist.wav',
    });

    const secondService = createHoneyService({ dataFilePath });
    const persistedSettings = await secondService.getSettings();
    const persistedRecords = await secondService.listTranscriptRecords();

    assertEqual(persistedSettings.hotkey, 'F7', 'settings should persist across service instances');
    assertEqual(persistedSettings.personaModeEnabled, true, 'persona mode setting should persist across service instances');
    assertEqual((await secondService.listHotwords()).some(item => item.id === 'hotword-persist'), true, 'hotwords should persist across service instances');
    assertEqual(await secondService.previewRules('测试泊丝'), '测试Persist', 'rules should persist across service instances');
    assertEqual((await secondService.listPersonas()).some(item => item.id === 'persona-persist'), true, 'personas should persist across service instances');
    assertEqual(persistedRecords.some(item => item.id === deletedRecordId), false, 'deleted transcript records should persist across service instances');
    assertEqual(persistedRecords.some(item => item.id === session.record.id), true, 'new dictation records should persist across service instances');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testMalformedLocalDataFallsBackToSeedData() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-service-malformed-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    await writeFile(dataFilePath, '{', 'utf8');

    const service = createHoneyService({ dataFilePath });

    assertEqual((await service.getSettings()).hotkey, 'F9', 'malformed local data should fall back to seed settings');
    assertEqual((await service.listHotwords()).some(item => item.id === 'hotword-honey'), true, 'malformed local data should fall back to seed hotwords');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testSchemaInvalidLocalDataFallsBackToSeedData() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-service-invalid-schema-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    await writeFile(dataFilePath, JSON.stringify({
      records: [],
      hotwords: '坏数据',
      rules: [],
      personas: [],
      settings: {},
    }), 'utf8');

    const service = createHoneyService({ dataFilePath });

    assertEqual((await service.getSettings()).hotkey, 'F9', 'schema-invalid local data should fall back to seed settings');
    assertEqual((await service.listHotwords()).some(item => item.id === 'hotword-honey'), true, 'schema-invalid local data should fall back to seed hotwords');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testFailedPersistenceDoesNotMutateMemory() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-service-failed-write-'));

  try {
    const service = createHoneyService({ dataFilePath: dataDir });

    await service.updateSettings({ hotkey: 'F6' }).then(
      () => {
        throw new Error('settings update should reject when local data cannot be written');
      },
      () => undefined,
    );

    assertEqual((await service.getSettings()).hotkey, 'F9', 'failed persistence should leave settings unchanged in memory');

    await service.deleteTranscriptRecord('rec-001').then(
      () => {
        throw new Error('transcript deletion should reject when local data cannot be written');
      },
      () => undefined,
    );

    assertEqual((await service.listTranscriptRecords()).some(item => item.id === 'rec-001'), true, 'failed persistence should leave transcript records unchanged in memory');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testAudioCaptureUploadWritesLocalAudioFile() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-audio-capture-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    const service = createHoneyService({ dataFilePath });
    await service.updateSettings({ localDataPath: dataDir });
    const audioUploadService = service as typeof service & {
      saveAudioCapture(input: {
        fileName?: string;
        mimeType: string;
        base64Data: string;
        durationMs?: number;
      }): Promise<{
        audioPath: string;
        byteLength: number;
        mimeType: string;
        durationMs?: number;
      }>;
    };
    const audioBytes = Buffer.from('honey-audio-bytes', 'utf8');
    const result = await audioUploadService.saveAudioCapture({
      fileName: 'hold-to-talk.wav',
      mimeType: 'audio/wav',
      base64Data: audioBytes.toString('base64'),
      durationMs: 1234,
    });

    assertEqual(result.mimeType, 'audio/wav', 'audio capture should keep mime type');
    assertEqual(result.byteLength, audioBytes.length, 'audio capture should report written byte length');
    assertEqual(result.durationMs, 1234, 'audio capture should keep duration metadata');
    assertEqual(result.audioPath.includes('audio-captures'), true, 'audio capture should be saved under the local audio capture directory');
    assertEqual((await readFile(result.audioPath)).equals(audioBytes), true, 'audio capture should write uploaded bytes to disk');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testDirectDictationClearsUploadedAudioWhenSaveAudioIsDisabled() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-audio-direct-cleanup-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    const service = createHoneyService({
      dataFilePath,
      asrAdapter: {
        transcribe: async () => ({
          text: '关闭保存录音后只保留文字。',
          durationMs: 900,
        }),
      },
    });
    await service.updateSettings({
      localDataPath: dataDir,
      saveAudio: false,
    });

    const uploadedAudio = await service.saveAudioCapture({
      fileName: 'hold-to-talk.wav',
      mimeType: 'audio/wav',
      base64Data: Buffer.from('direct-audio-bytes', 'utf8').toString('base64'),
      durationMs: 900,
    });

    assertEqual(await fileExists(uploadedAudio.audioPath), true, 'uploaded direct audio should exist before dictation');

    const session = await service.runDirectDictationSession({
      audioPath: uploadedAudio.audioPath,
      sourceApp: '隐私输入框',
    });
    const archivedRecord = (await service.listTranscriptRecords()).find(record => record.id === session.record.id);

    assertEqual(session.record.status, 'completed', 'direct dictation should still complete when audio saving is disabled');
    assertEqual(session.record.audioPath, undefined, 'direct dictation result should not expose audio path when audio saving is disabled');
    assertEqual(archivedRecord?.audioPath, undefined, 'archived direct record should not keep audio path when audio saving is disabled');
    assertEqual(await fileExists(uploadedAudio.audioPath), false, 'uploaded direct audio should be deleted after dictation when audio saving is disabled');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testPersonaDictationClearsUploadedAudioWhenSaveAudioIsDisabled() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-audio-persona-cleanup-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    const service = createHoneyService({
      dataFilePath,
      asrAdapter: {
        transcribe: async () => ({
          text: '怎么今天加班啊？',
          durationMs: 1000,
        }),
      },
      personaRewriteAdapter: {
        rewrite: async () => ({
          text: '今天的工作安排是否需要延长到下班后？',
          latencyMs: 120,
        }),
      },
    });
    await service.updateSettings({
      localDataPath: dataDir,
      saveAudio: false,
    });
    await service.savePersona({
      id: 'persona-privacy',
      name: '隐私人设',
      triggerAliases: ['隐私'],
      description: '验证关闭保存录音时，人设模式也不保留音频。',
      prompt: '改写成稳妥表达。',
      outputMode: 'typing',
      enabled: true,
      keepContext: false,
    });

    const uploadedAudio = await service.saveAudioCapture({
      fileName: 'hold-to-talk.webm',
      mimeType: 'audio/webm',
      base64Data: Buffer.from('persona-audio-bytes', 'utf8').toString('base64'),
      durationMs: 1000,
    });

    assertEqual(await fileExists(uploadedAudio.audioPath), true, 'uploaded persona audio should exist before dictation');

    const session = await service.runPersonaDictationSession({
      audioPath: uploadedAudio.audioPath,
      sourceApp: '隐私人设输入框',
      personaId: 'persona-privacy',
    });
    const archivedRecord = (await service.listTranscriptRecords()).find(record => record.id === session.record.id);

    assertEqual(session.record.status, 'completed', 'persona dictation should still complete when audio saving is disabled');
    assertEqual(session.record.audioPath, undefined, 'persona dictation result should not expose audio path when audio saving is disabled');
    assertEqual(archivedRecord?.audioPath, undefined, 'archived persona record should not keep audio path when audio saving is disabled');
    assertEqual(await fileExists(uploadedAudio.audioPath), false, 'uploaded persona audio should be deleted after dictation when audio saving is disabled');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testDirectDictationSkipsArchiveWhenSaveHistoryIsDisabled() {
  const service = createHoneyService({
    asrAdapter: {
      transcribe: async () => ({
        text: '这次只上屏不要保存。',
        durationMs: 700,
      }),
    },
  });
  const beforeRecords = await service.listTranscriptRecords();

  await service.updateSettings({ saveHistory: false });

  const session = await service.runDirectDictationSession({
    audioPath: 'D:/tmp/honey-direct-no-history.wav',
    sourceApp: '无历史输入框',
  });
  const afterRecords = await service.listTranscriptRecords();

  assertEqual(session.record.status, 'completed', 'direct dictation should still return a completed record when history is disabled');
  assertEqual(session.record.outputText, '这次只上屏不要保存。', 'direct dictation should still return output text when history is disabled');
  assertEqual(afterRecords.some(record => record.id === session.record.id), false, 'direct dictation should not archive a record when history is disabled');
  assertEqual(afterRecords.length, beforeRecords.length, 'direct dictation should leave transcript history unchanged when history is disabled');
}

async function testPersonaDictationSkipsArchiveWhenSaveHistoryIsDisabled() {
  const service = createHoneyService({
    asrAdapter: {
      transcribe: async () => ({
        text: '怎么今天加班啊？',
        durationMs: 1000,
      }),
    },
    personaRewriteAdapter: {
      rewrite: async () => ({
        text: '今天的工作安排是否需要延长到下班后？',
        latencyMs: 120,
      }),
    },
  });
  const beforeRecords = await service.listTranscriptRecords();

  await service.updateSettings({ saveHistory: false });
  await service.savePersona({
    id: 'persona-no-history',
    name: '无历史人设',
    triggerAliases: ['无历史'],
    description: '验证关闭历史记录时，人设模式只返回结果不上档。',
    prompt: '改写成稳妥表达。',
    outputMode: 'typing',
    enabled: true,
    keepContext: false,
  });

  const session = await service.runPersonaDictationSession({
    audioPath: 'D:/tmp/honey-persona-no-history.wav',
    sourceApp: '无历史人设输入框',
    personaId: 'persona-no-history',
  });
  const afterRecords = await service.listTranscriptRecords();

  assertEqual(session.record.status, 'completed', 'persona dictation should still return a completed record when history is disabled');
  assertEqual(session.record.outputText, '今天的工作安排是否需要延长到下班后？', 'persona dictation should still return rewritten output when history is disabled');
  assertEqual(afterRecords.some(record => record.id === session.record.id), false, 'persona dictation should not archive a record when history is disabled');
  assertEqual(afterRecords.length, beforeRecords.length, 'persona dictation should leave transcript history unchanged when history is disabled');
}

async function testPersonaMutations() {
  const service = createHoneyService();
  const persona: PersonaProfile = {
    id: 'persona-director',
    name: '项目负责人',
    triggerAliases: ['项目', '负责人'],
    description: '把口述内容整理成项目推进口吻。',
    prompt: '把用户口述内容改成清晰、稳妥、可执行的项目推进表达。',
    outputMode: 'typing',
    modelId: 'qwen3-1_7b',
    enabled: true,
    keepContext: false,
  };

  const saved = await service.savePersona(persona);

  assertEqual(saved.name, '项目负责人', 'persona should be saved');
  assertEqual((await service.listPersonas()).some(item => item.id === 'persona-director'), true, 'saved persona should be listed');

  const updated = await service.savePersona({ ...persona, enabled: false });

  assertEqual(updated.enabled, false, 'persona save should update existing persona');

  const deleted = await service.deletePersona('persona-director');

  assertEqual(deleted.id, 'persona-director', 'persona delete should return deleted id');
  assertEqual((await service.listPersonas()).some(item => item.id === 'persona-director'), false, 'persona delete should remove persona');
}

async function testTranscriptAndPersonaMemory() {
  const service = createHoneyService();
  const records = await service.listTranscriptRecords();

  assertOk(records.length > 0, 'seed transcripts should exist');

  const firstId = records[0]!.id;
  await service.deleteTranscriptRecord(firstId);

  assertEqual((await service.listTranscriptRecords()).some(item => item.id === firstId), false, 'transcript should be deleted');
  assertEqual(await service.wasPersonaMemoryCleared('persona-office'), false, 'persona memory should start uncleared');

  await service.clearPersonaMemory('persona-office');

  assertEqual(await service.wasPersonaMemoryCleared('persona-office'), true, 'persona memory should be marked cleared');
}

async function testFileTranscriptionTasksAndTrayActions() {
  const service = createHoneyService() as ReturnType<typeof createHoneyService> & {
    listFileTranscriptionTasks(): Promise<FileTranscriptionTask[]>;
    listTrayActions(): Promise<TrayAction[]>;
  };

  const fileTasks = await service.listFileTranscriptionTasks();
  const trayActions = await service.listTrayActions();

  assertOk(fileTasks.length > 0, 'seed file transcription tasks should exist');
  assertEqual(fileTasks[0]?.id, 'file-001', 'file transcription tasks should expose queued task ids');
  assertEqual(fileTasks[0]?.status, 'processing', 'file transcription tasks should expose task status');
  assertEqual(fileTasks[0]?.outputFormats.includes('srt'), true, 'file transcription tasks should expose output formats');

  assertOk(trayActions.length > 0, 'seed tray actions should exist');
  assertEqual(trayActions.some(action => action.id === 'open-settings'), true, 'tray actions should include settings entry');
  assertEqual(trayActions.find(action => action.id === 'copy-latest')?.enabled, true, 'tray actions should expose enabled state');
}

async function testCreateFileTranscriptionTaskUsesAsrAdapter() {
  const transcribeCalls: Array<{ audioPath: string; modelId: string }> = [];
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-file-transcription-adapter-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    const service = createHoneyService({
      dataFilePath,
      asrAdapter: {
        transcribe: async (input) => {
          transcribeCalls.push(input);
          return {
            text: '客户说明天继续推进。',
            durationMs: 2300,
          };
        },
      },
    });
    await service.updateSettings({ localDataPath: dataDir });

    const task = await service.createFileTranscriptionTask({
      filePath: 'D:/recordings/客户访谈.mp3',
      outputFormats: ['txt', 'json'],
      asrModelId: 'fun-asr-nano',
    });
    const tasks = await service.listFileTranscriptionTasks();

    assertEqual(transcribeCalls[0]?.audioPath, 'D:/recordings/客户访谈.mp3', 'file transcription should pass MP3 paths to the ASR adapter');
    assertEqual(transcribeCalls[0]?.modelId, 'fun-asr-nano', 'file transcription should pass the selected ASR model');
    assertEqual(task.fileName, '客户访谈.mp3', 'file transcription should derive file name from the local path');
    assertEqual(task.sourcePath, 'D:/recordings/客户访谈.mp3', 'file transcription should keep the source file path');
    assertEqual(task.status, 'completed', 'file transcription should complete when ASR succeeds');
    assertEqual(task.progress, 100, 'completed file transcription should report full progress');
    assertEqual(task.transcriptText, '客户说明天继续推进。', 'file transcription should expose transcript text on the task');
    assertEqual(task.outputFormats.join(','), 'txt,json', 'file transcription should keep requested output formats');
    assertEqual(tasks[0]?.id, task.id, 'created file transcription tasks should be prepended to the queue');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testCreateFileTranscriptionTaskWritesSelectedOutputFiles() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-file-transcription-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    const service = createHoneyService({
      dataFilePath,
      asrAdapter: {
        transcribe: async () => ({
          text: '客户说明天继续推进。',
          durationMs: 2300,
        }),
      },
    });
    await service.updateSettings({ localDataPath: dataDir });

    const task = await service.createFileTranscriptionTask({
      filePath: 'D:/recordings/客户访谈.mp3',
      outputFormats: ['txt', 'json', 'srt', 'merged-txt'],
    });

    assertEqual(task.status, 'completed', 'file transcription output task should complete');
    assertOk(task.resultPath, 'completed file transcription should expose a result directory');
    assertEqual(task.resultPath?.startsWith(join(dataDir, 'file-transcriptions')), true, 'file transcription outputs should stay under local data path');

    const txt = await readFile(join(task.resultPath ?? '', '客户访谈.txt'), 'utf8');
    const mergedTxt = await readFile(join(task.resultPath ?? '', '客户访谈.merged.txt'), 'utf8');
    const json = JSON.parse(await readFile(join(task.resultPath ?? '', '客户访谈.json'), 'utf8')) as {
      fileName: string;
      sourcePath: string;
      transcriptText: string;
      durationMs?: number;
    };
    const srt = await readFile(join(task.resultPath ?? '', '客户访谈.srt'), 'utf8');

    assertEqual(txt, '客户说明天继续推进。\n', 'TXT output should contain the final transcript text');
    assertEqual(mergedTxt.includes('客户访谈.mp3'), true, 'merged TXT output should include the source file name');
    assertEqual(mergedTxt.includes('客户说明天继续推进。'), true, 'merged TXT output should include the transcript text');
    assertEqual(json.fileName, '客户访谈.mp3', 'JSON output should include the source file name');
    assertEqual(json.sourcePath, 'D:/recordings/客户访谈.mp3', 'JSON output should include the original source path');
    assertEqual(json.transcriptText, '客户说明天继续推进。', 'JSON output should include transcript text');
    assertEqual(json.durationMs, 2300, 'JSON output should include ASR duration when available');
    assertEqual(srt.includes('00:00:00,000 --> 00:00:02,300'), true, 'SRT output should use the ASR duration');
    assertEqual(srt.includes('客户说明天继续推进。'), true, 'SRT output should include transcript text');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testModelDiscoveryAndDictationSession() {
  const transcribeCalls: Array<{
    audioPath: string;
    modelId: string;
    language?: string;
    hotwords?: Array<{ canonical: string; aliases: string[] }>;
  }> = [];
  const service = createHoneyService({
    modelRoot: '../Fun-ASR-Nano-GGUF',
    llmModelRoot: '../models',
    asrAdapter: {
      transcribe: async (input) => {
        transcribeCalls.push(input);
        return {
        text: '今天下午把会议纪要发给甜美。',
        durationMs: 1200,
        };
      },
    },
  });

  const inventory = await service.scanLocalModels();
  const funAsrNano = inventory.find(model => model.id === 'fun-asr-nano');
  const qwen06b = inventory.find(model => model.id === 'qwen3-0_6b');
  const qwen4b = inventory.find(model => model.id === 'qwen3-4b');
  const modelProfiles = await service.listModels();
  const funAsrNanoProfile = modelProfiles.find(model => model.id === 'fun-asr-nano');
  const qwen06bProfile = modelProfiles.find(model => model.id === 'qwen3-0_6b');
  const qwen4bProfile = modelProfiles.find(model => model.id === 'qwen3-4b');

  assertOk(funAsrNano, 'Fun-ASR-Nano should be discovered from local model directory');
  assertEqual(funAsrNano?.status, 'installed', 'Fun-ASR-Nano should be installed when required files exist');
  assertEqual(funAsrNano?.requiredFilesMissing.length, 0, 'Fun-ASR-Nano should not miss required files');
  assertEqual(qwen06b?.status, 'installed', 'Qwen3 0.6B GGUF should be discovered from local models directory');
  assertEqual(qwen4b?.status, 'installed', 'Qwen3 4B GGUF should be discovered from local models directory');
  assertEqual(funAsrNanoProfile?.status, 'installed', 'model profiles should reflect local ASR inventory status');
  assertEqual(qwen06bProfile?.status, 'installed', 'model profiles should reflect installed Qwen3 0.6B GGUF');
  assertEqual(qwen4bProfile?.status, 'installed', 'model profiles should reflect installed Qwen3 4B GGUF');
  assertEqual(funAsrNanoProfile?.memoryHint, '2 GB 可用内存起步', 'model profiles should keep user-facing config hints');

  const missingService = createHoneyService({ modelRoot: '../missing-model-dir' });
  const missingFunAsrNano = (await missingService.scanLocalModels()).find(model => model.id === 'fun-asr-nano');

  assertEqual(missingFunAsrNano?.status, 'missing', 'missing model directories should mark model inventory as missing');
  assertEqual(missingFunAsrNano?.requiredFilesMissing.includes('tokens.txt'), true, 'missing model inventory should report missing token file');

  const session = await service.runDirectDictationSession({
    audioPath: 'D:/tmp/honey-sample.wav',
    sourceApp: 'Mock 输入框',
    asrModelId: 'sensevoice-small',
  });

  assertEqual(session.overlayStates.join('>'), 'listening>recognizing>completed>inserted', 'dictation session should expose overlay flow');
  assertEqual(transcribeCalls[0]?.modelId, 'sensevoice-small', 'dictation session should pass selected ASR model to adapter');
  assertEqual(transcribeCalls[0]?.language, 'zh-CN', 'dictation session should pass configured language to adapter');
  assertEqual(transcribeCalls[0]?.hotwords?.some(item => item.canonical === 'honey'), true, 'dictation session should pass enabled hotwords to adapter');
  assertEqual(session.record.outputText, '今天下午把会议纪要发给honey。', 'dictation session should apply hotwords before archiving final text');
  assertEqual((await service.listTranscriptRecords()).some(record => record.id === session.record.id), true, 'dictation record should be archived');
}

async function testHotwordBlacklistProtectsTermsInDictationOutput() {
  const service = createHoneyService({
    asrAdapter: {
      transcribe: async () => ({
        text: '请打开阿克米，再检查阿克米表。',
        durationMs: 700,
      }),
    },
  });
  await service.saveHotword({
    id: 'hotword-acme-db',
    canonical: 'AcmeDB',
    aliases: ['阿克米'],
    blacklist: ['阿克米表'],
    enabled: true,
  });

  const session = await service.runDirectDictationSession({
    audioPath: 'D:/tmp/honey-hotword-blacklist.wav',
  });

  assertEqual(
    session.record.outputText,
    '请打开AcmeDB，再检查阿克米表。',
    'hotword blacklist should protect matching phrases from alias replacement',
  );
}

async function testRuntimeHealthReportsLocalDependencies() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-runtime-health-'));
  const dataFilePath = join(dataDir, 'honey-data.json');

  try {
    const service = createHoneyService({
      dataFilePath,
      modelRoot: '../Fun-ASR-Nano-GGUF',
      llmModelRoot: '../models',
      runtimeCommands: {
        asrConfigured: true,
        personaRewriteConfigured: false,
      },
    });
    await service.updateSettings({ localDataPath: dataDir });

    const health = await service.getRuntimeHealth();

    assertEqual(health.service, 'honey-backend', 'runtime health should identify the backend service');
    assertEqual(health.mode, 'local', 'runtime health should identify local mode');
    assertEqual(health.localDataPath, dataDir, 'runtime health should expose local data path');
    assertEqual(health.audioCapturePath, join(dataDir, 'audio-captures'), 'runtime health should expose audio capture path');
    assertEqual(health.modelRoot, '../Fun-ASR-Nano-GGUF', 'runtime health should expose model root');
    assertEqual(health.asr.status, 'ready', 'runtime health should report Fun-ASR-Nano CTC runner readiness');
    assertEqual(health.asr.commandConfigured, true, 'runtime health should report ASR command configuration');
    assertEqual(health.asr.detail, undefined, 'runtime health should not report Fun-ASR-Nano implementation issues once CTC runner is available');
    assertEqual(health.personaRewrite.status, 'fallback', 'runtime health should report missing persona rewrite command as local fallback runtime');
    assertEqual(health.personaRewrite.commandConfigured, false, 'runtime health should report persona rewrite command configuration');
    assertEqual(health.personaRewrite.detail, 'local_persona_rewrite_fallback', 'runtime health should describe local persona fallback');
    assertEqual(health.models.some(model => model.id === 'fun-asr-nano' && model.status === 'installed'), true, 'runtime health should include installed local models');
    assertEqual(health.issues.some(issue => issue.startsWith('fun_asr_nano_')), false, 'runtime health should not surface Fun-ASR-Nano issues when CTC runner is available');
    assertEqual(health.issues.includes('persona_rewrite_running_in_local_fallback'), true, 'runtime health should surface local persona fallback as an issue');
    assertEqual(health.issues.includes('local_models_missing'), false, 'runtime health should not report local models missing when usable ASR and LLM models are installed');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testConfiguredModelDirectoriesDriveRuntimeInventory() {
  const dataDir = await mkdtemp(join(tmpdir(), 'honey-configured-models-'));
  const dataFilePath = join(dataDir, 'honey-data.json');
  const asrModelRoot = join(dataDir, 'user-asr', 'Fun-ASR-Nano-GGUF');
  const llmModelRoot = join(dataDir, 'user-llm-models');
  const llamaServerPath = join(dataDir, 'runtime', 'llama-server.exe');

  try {
    await mkdir(asrModelRoot, { recursive: true });
    await mkdir(llmModelRoot, { recursive: true });
    await writeFile(join(asrModelRoot, 'Fun-ASR-Nano-Encoder-Adaptor.int8.onnx'), 'encoder', 'utf8');
    await writeFile(join(asrModelRoot, 'Fun-ASR-Nano-CTC.int8.onnx'), 'ctc', 'utf8');
    await writeFile(join(asrModelRoot, 'Fun-ASR-Nano-Decoder.q8_0.gguf'), 'decoder', 'utf8');
    await writeFile(join(asrModelRoot, 'tokens.txt'), '0 <blank>\n1 甜\n2 美\n', 'utf8');
    await writeFile(join(llmModelRoot, 'Qwen3-0.6B-Q8_0.gguf'), 'gguf', 'utf8');
    await writeFile(join(llmModelRoot, 'MyCompany-Tone-Q4_K_M.gguf'), 'gguf', 'utf8');

    const service = createHoneyService({
      dataFilePath,
      modelRoot: '../constructor-asr-root',
      llmModelRoot: '../constructor-llm-root',
    });
    await service.updateSettings({
      asrModelRoot,
      llmModelRoot,
      llamaServerPath,
    });

    const inventory = await service.scanLocalModels();
    const health = await service.getRuntimeHealth();
    const funAsrNano = inventory.find(model => model.id === 'fun-asr-nano');
    const qwen06b = inventory.find(model => model.id === 'qwen3-0_6b');
    const customGguf = inventory.find(model => model.id === 'local-gguf-mycompany_tone_q4_k_m');

    assertEqual(funAsrNano?.modelRoot, asrModelRoot, 'model scan should use the configured ASR model directory');
    assertEqual(funAsrNano?.status, 'installed', 'configured ASR directory should be scanned for required files');
    assertEqual(qwen06b?.modelRoot, llmModelRoot, 'model scan should use the configured LLM model directory');
    assertEqual(qwen06b?.status, 'installed', 'configured LLM directory should be scanned for GGUF files');
    assertEqual(customGguf?.modelRoot, llmModelRoot, 'model scan should expose user-downloaded GGUF files from the configured LLM directory');
    assertEqual(customGguf?.status, 'installed', 'custom user GGUF models should be ready to launch from the model page');
    assertEqual(customGguf?.requiredFiles[0], 'MyCompany-Tone-Q4_K_M.gguf', 'custom user GGUF models should preserve the real file name');
    assertEqual(health.modelRoot, asrModelRoot, 'runtime health should expose the configured ASR model directory');
    assertEqual(health.llmModelRoot, llmModelRoot, 'runtime health should expose the configured LLM model directory');
    assertEqual(health.llamaServerPath, llamaServerPath, 'runtime health should expose the configured llama.cpp runtime path');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testLocalLlmRuntimeController() {
  const calls: string[] = [];
  const service = createHoneyService({
    localLlmRuntimeController: {
      getStatus: async () => ({
        status: 'stopped',
        modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
        modelAlias: 'qwen3-0_6b',
        host: '127.0.0.1',
        port: 18082,
        baseUrl: 'http://127.0.0.1:18082',
      }),
      start: async (input) => {
        calls.push(`start:${input.modelAlias}:${input.port}`);
        return {
          status: 'running',
          modelPath: input.modelPath,
          modelAlias: input.modelAlias,
          host: input.host,
          port: input.port,
          baseUrl: `http://${input.host}:${input.port}`,
          pid: 1234,
        };
      },
      stop: async () => {
        calls.push('stop');
        return {
          status: 'stopped',
          modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
          modelAlias: 'qwen3-0_6b',
          host: '127.0.0.1',
          port: 18082,
          baseUrl: 'http://127.0.0.1:18082',
        };
      },
    },
  });

  const initialStatus = await service.getLocalLlmRuntimeStatus();
  const runningStatus = await service.startLocalLlmRuntime({
    modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
    modelAlias: 'qwen3-0_6b',
    host: '127.0.0.1',
    port: 18082,
  });
  const stoppedStatus = await service.stopLocalLlmRuntime();
  const health = await service.getRuntimeHealth();

  assertEqual(initialStatus.status, 'stopped', 'LLM runtime should start stopped');
  assertEqual(runningStatus.status, 'running', 'LLM runtime start should return running status');
  assertEqual(runningStatus.pid, 1234, 'LLM runtime start should expose process id');
  assertEqual(stoppedStatus.status, 'stopped', 'LLM runtime stop should return stopped status');
  assertEqual(health.llmRuntime.status, 'stopped', 'runtime health should expose local LLM runtime status');
  assertEqual(calls.join('>'), 'start:qwen3-0_6b:18082>stop', 'LLM runtime controller should receive start and stop calls');
}

async function testLocalLlmRuntimeUsesConfiguredModelDirectoryByDefault() {
  const calls: Array<{ modelPath: string; modelAlias: string }> = [];
  const service = createHoneyService({
    llmModelRoot: 'D:/constructor-models',
    localLlmRuntimeController: {
      getStatus: async () => ({ status: 'stopped' }),
      start: async (input) => {
        calls.push({ modelPath: input.modelPath, modelAlias: input.modelAlias });
        return {
          status: 'running',
          modelPath: input.modelPath,
          modelAlias: input.modelAlias,
          host: input.host,
          port: input.port,
          baseUrl: `http://${input.host}:${input.port}`,
        };
      },
      stop: async () => ({ status: 'stopped' }),
    },
  });
  await service.updateSettings({
    llmModelRoot: 'E:/honey/user-models',
  });

  await service.startLocalLlmRuntime();

  assertEqual(
    calls[0]?.modelPath,
    join('E:/honey/user-models', 'Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf'),
    'default LLM runtime start should use the configured LLM model directory',
  );
  assertEqual(calls[0]?.modelAlias, 'qwen3-4b-instruct-q4_k_m', 'default LLM runtime start should keep the default model alias');
}

async function testPersonaDictationSessionUsesRunningLocalLlmRuntime() {
  let capturedPath = '';
  let capturedBody: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    capturedPath = request.url ?? '';
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
    const service = createHoneyService({
      asrAdapter: {
        transcribe: async () => ({
          text: '怎么今天加班啊？',
          durationMs: 800,
        }),
      },
      localLlmRuntimeController: {
        getStatus: async () => ({
          status: 'running',
          modelPath: 'D:/products/voice-to-text/models/Qwen3-0.6B-Q8_0.gguf',
          modelAlias: 'qwen3-runtime',
          host: '127.0.0.1',
          port: Number(new URL(baseUrl).port),
          baseUrl,
          pid: 1234,
        }),
        start: async (input) => ({
          status: 'running',
          modelPath: input.modelPath,
          modelAlias: input.modelAlias,
          host: input.host,
          port: input.port,
          baseUrl: `http://${input.host}:${input.port}`,
          pid: 1234,
        }),
        stop: async () => ({ status: 'stopped' }),
      },
    });
    const session = await service.runPersonaDictationSession({
      audioPath: 'D:/tmp/honey-runtime-persona.wav',
      personaId: 'persona-office',
      sourceApp: 'Editor',
    });
    const health = await service.getRuntimeHealth();

    assertEqual(capturedPath, '/v1/chat/completions', 'running local LLM runtime should power persona rewrite through chat completions');
    assertEqual(capturedBody?.model, 'qwen3-runtime', 'running local LLM runtime should supply the model alias to persona rewrite');
    assertEqual(session.record.outputText, '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。', 'persona dictation should archive local LLM rewritten output');
    assertEqual(health.personaRewrite.status, 'ready', 'runtime health should mark persona rewrite ready when local LLM runtime is running');
    assertEqual(health.personaRewrite.commandConfigured, true, 'runtime health should treat running local LLM runtime as persona rewrite configured');
    assertEqual(health.issues.includes('persona_rewrite_running_in_local_fallback'), false, 'runtime health should not report fallback while local LLM runtime is running');
  } finally {
    await closeServer(server);
  }
}

async function testPersonaDictationFallsBackWhenRunningLocalLlmRuntimeFails() {
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'llm_unavailable' }));
  });
  const baseUrl = await listenOnRandomPort(server);

  try {
    const service = createHoneyService({
      asrAdapter: {
        transcribe: async () => ({
          text: '怎么今天加班啊？',
          durationMs: 800,
        }),
      },
      localLlmRuntimeController: {
        getStatus: async () => ({
          status: 'running',
          modelAlias: 'qwen3-runtime',
          host: '127.0.0.1',
          port: Number(new URL(baseUrl).port),
          baseUrl,
          pid: 1234,
        }),
        start: async (input) => ({
          status: 'running',
          modelPath: input.modelPath,
          modelAlias: input.modelAlias,
          host: input.host,
          port: input.port,
          baseUrl: `http://${input.host}:${input.port}`,
          pid: 1234,
        }),
        stop: async () => ({ status: 'stopped' }),
      },
    });
    const session = await service.runPersonaDictationSession({
      audioPath: 'D:/tmp/honey-runtime-persona-fallback.wav',
      personaId: 'persona-office',
    });

    assertEqual(session.overlayStates.join('>'), 'listening>recognizing>completed>inserted', 'persona dictation should complete when running local LLM runtime request fails');
    assertEqual(
      session.record.outputText,
      '今天的工作安排是否需要延长到下班后？我这边可以提前协调一下时间。',
      'persona dictation should fall back to local persona rules when running local LLM runtime request fails',
    );
  } finally {
    await closeServer(server);
  }
}

async function testPersonaDictationSessionUsesPersonaAdapter() {
  const transcribeCalls: Array<{ audioPath: string; modelId: string }> = [];
  const rewriteCalls: Array<{
    text: string;
    modelId?: string;
    persona: PersonaProfile;
    sourceApp?: string;
  }> = [];
  const service = createHoneyService({
    asrAdapter: {
      transcribe: async (input) => {
        transcribeCalls.push(input);
        return {
          text: 'why are we working overtime today',
          durationMs: 800,
        };
      },
    },
    personaRewriteAdapter: {
      rewrite: async (input) => {
        rewriteCalls.push(input);
        return {
          text: 'Could we align on the overtime plan for today?',
          latencyMs: 45,
        };
      },
    },
  } as Parameters<typeof createHoneyService>[0] & {
    personaRewriteAdapter: {
      rewrite(input: {
        text: string;
        modelId?: string;
        persona: PersonaProfile;
        sourceApp?: string;
      }): Promise<{ text: string; latencyMs?: number }>;
    };
  });

  await service.savePersona({
    id: 'persona-office-veteran',
    name: 'Office veteran',
    triggerAliases: ['office'],
    description: 'Turns blunt workplace speech into a softer expression.',
    prompt: 'Rewrite into a friendly workplace tone.',
    outputMode: 'typing',
    modelId: 'qwen3-0_6b',
    enabled: true,
    keepContext: false,
  });

  const personaService = service as typeof service & {
    runPersonaDictationSession(input: {
      audioPath: string;
      sourceApp?: string;
      asrModelId?: string;
      personaId: string;
    }): Promise<{
      overlayStates: string[];
      record: {
        mode: string;
        roleId?: string;
        rawText: string;
        outputText: string;
        audioPath?: string;
        sourceApp?: string;
        durationMs?: number;
        latencyMs?: number;
        status: string;
      };
    }>;
  };
  const session = await personaService.runPersonaDictationSession({
    audioPath: 'D:/tmp/honey-persona.wav',
    sourceApp: 'Editor',
    asrModelId: 'fun-asr-nano',
    personaId: 'persona-office-veteran',
  });

  assertEqual(transcribeCalls[0]?.audioPath, 'D:/tmp/honey-persona.wav', 'persona dictation should transcribe the captured audio');
  assertEqual(transcribeCalls[0]?.modelId, 'fun-asr-nano', 'persona dictation should pass selected ASR model');
  assertEqual(rewriteCalls[0]?.text, 'why are we working overtime today', 'persona dictation should send ASR text to the persona adapter');
  assertEqual(rewriteCalls[0]?.persona.id, 'persona-office-veteran', 'persona dictation should use the selected persona');
  assertEqual(rewriteCalls[0]?.modelId, 'qwen3-0_6b', 'persona dictation should use the persona-bound LLM model');
  assertEqual(rewriteCalls[0]?.sourceApp, 'Editor', 'persona dictation should pass source app context to the persona adapter');
  assertEqual(session.overlayStates.join('>'), 'listening>recognizing>completed>inserted', 'persona dictation should expose overlay flow');
  assertEqual(session.record.mode, 'persona', 'persona dictation should archive persona mode records');
  assertEqual(session.record.roleId, 'persona-office-veteran', 'persona dictation should archive the selected persona id');
  assertEqual(session.record.rawText, 'why are we working overtime today', 'persona dictation should archive raw ASR text');
  assertEqual(session.record.outputText, 'Could we align on the overtime plan for today?', 'persona dictation should archive rewritten output');
  assertEqual(session.record.audioPath, 'D:/tmp/honey-persona.wav', 'persona dictation should keep audio path');
  assertEqual(session.record.sourceApp, 'Editor', 'persona dictation should keep source app');
  assertEqual(session.record.durationMs, 800, 'persona dictation should keep ASR duration');
  assertEqual(session.record.latencyMs, 45, 'persona dictation should keep rewrite latency');
  assertEqual(session.record.status, 'completed', 'persona dictation should return a completed record');
  assertEqual((await service.listTranscriptRecords()).some(record => record.outputText === session.record.outputText), true, 'persona dictation record should be archived');
}

async function testFailedDictationSessionIsArchived() {
  const service = createHoneyService({
    asrAdapter: {
      transcribe: async () => {
        throw new Error('ASR runtime unavailable');
      },
    },
  });

  const session = await service.runDirectDictationSession({
    audioPath: 'D:/tmp/honey-failed.wav',
    sourceApp: '失败输入框',
  });

  assertEqual(session.overlayStates.join('>'), 'listening>recognizing>failed', 'failed dictation session should expose failed overlay flow');
  assertEqual(session.record.status, 'failed', 'failed dictation session should return a failed transcript record');
  assertEqual(session.record.audioPath, 'D:/tmp/honey-failed.wav', 'failed dictation record should keep audio path');
  assertEqual(session.record.sourceApp, '失败输入框', 'failed dictation record should keep source app');
  assertEqual(session.record.errorMessage, 'ASR runtime unavailable', 'failed dictation record should expose the ASR failure reason');
  assertEqual((await service.listTranscriptRecords()).some(record => record.id === session.record.id), true, 'failed dictation record should be archived');
}

await testLocalDataMutations();
await testLocalDataPersistence();
await testMalformedLocalDataFallsBackToSeedData();
await testSchemaInvalidLocalDataFallsBackToSeedData();
await testFailedPersistenceDoesNotMutateMemory();
await testAudioCaptureUploadWritesLocalAudioFile();
await testDirectDictationClearsUploadedAudioWhenSaveAudioIsDisabled();
await testPersonaDictationClearsUploadedAudioWhenSaveAudioIsDisabled();
await testDirectDictationSkipsArchiveWhenSaveHistoryIsDisabled();
await testPersonaDictationSkipsArchiveWhenSaveHistoryIsDisabled();
await testPersonaMutations();
await testTranscriptAndPersonaMemory();
await testFileTranscriptionTasksAndTrayActions();
await testCreateFileTranscriptionTaskUsesAsrAdapter();
await testCreateFileTranscriptionTaskWritesSelectedOutputFiles();
await testModelDiscoveryAndDictationSession();
await testHotwordBlacklistProtectsTermsInDictationOutput();
await testRuntimeHealthReportsLocalDependencies();
await testConfiguredModelDirectoriesDriveRuntimeInventory();
await testLocalLlmRuntimeController();
await testLocalLlmRuntimeUsesConfiguredModelDirectoryByDefault();
await testPersonaDictationSessionUsesRunningLocalLlmRuntime();
await testPersonaDictationFallsBackWhenRunningLocalLlmRuntimeFails();
await testPersonaDictationSessionUsesPersonaAdapter();
await testFailedDictationSessionIsArchived();
