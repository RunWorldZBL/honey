import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCommandAsrAdapter } from './asrAdapter.js';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function testCommandAsrAdapter() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-asr-adapter-'));
  const scriptPath = join(tempDir, 'asr-runner.mjs');

  try {
    await writeFile(scriptPath, `
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        const payload = JSON.parse(input);
        process.stdout.write(JSON.stringify({
          text: [payload.audioPath, payload.modelId, payload.language, payload.hotwords[0].canonical].join('|'),
          durationMs: 321
        }));
      });
    `, 'utf8');

    const adapter = createCommandAsrAdapter({
      command: `"${process.execPath}" "${scriptPath}"`,
    });
    const result = await adapter.transcribe({
      audioPath: 'D:/tmp/honey.wav',
      modelId: 'fun-asr-nano',
      language: 'zh-CN',
      hotwords: [{ canonical: 'Qwen', aliases: ['扣文'] }],
    });

    assertEqual(result.text, 'D:/tmp/honey.wav|fun-asr-nano|zh-CN|Qwen', 'command ASR adapter should pass transcription input through stdin');
    assertEqual(result.durationMs, 321, 'command ASR adapter should parse duration from stdout JSON');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testCommandAsrAdapterRejectsInvalidOutput() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-asr-adapter-invalid-'));
  const scriptPath = join(tempDir, 'asr-runner-invalid.mjs');

  try {
    await writeFile(scriptPath, 'process.stdout.write(JSON.stringify({ text: "" }));', 'utf8');

    const adapter = createCommandAsrAdapter({
      command: `"${process.execPath}" "${scriptPath}"`,
    });
    await adapter.transcribe({
      audioPath: 'D:/tmp/honey.wav',
      modelId: 'fun-asr-nano',
    }).then(
      () => {
        throw new Error('command ASR adapter should reject empty text output');
      },
      () => undefined,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

await testCommandAsrAdapter();
await testCommandAsrAdapterRejectsInvalidOutput();
