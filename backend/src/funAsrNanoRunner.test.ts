import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertFunAsrNanoModelReady,
  decodeFunAsrNanoCtcIndices,
  getFunAsrNanoRuntimeIssue,
  runFunAsrNanoCli,
  transcribeWithFunAsrNano,
} from './funAsrNanoRunner.js';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const createSilentWav = (sampleRate = 16_000, samples = 16_000) => {
  const bytesPerSample = 2;
  const dataSize = samples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
};

async function testModelReadinessUsesLocalInventory() {
  const ready = await assertFunAsrNanoModelReady('../Fun-ASR-Nano-GGUF');

  assertEqual(ready.status, 'installed', 'Fun-ASR-Nano runner should accept the checked-in model directory');
  assertEqual(ready.requiredFilesMissing.length, 0, 'Fun-ASR-Nano runner should require all runtime model files');
}

async function testModelReadinessRejectsMissingFiles() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-fun-asr-nano-missing-'));

  try {
    await writeFile(join(tempDir, 'tokens.txt'), 'token', 'utf8');

    await assertFunAsrNanoModelReady(tempDir).then(
      () => {
        throw new Error('Fun-ASR-Nano runner should reject incomplete model directories');
      },
      (error: unknown) => {
        assertEqual(
          error instanceof Error && error.message.includes('fun_asr_nano_model_missing'),
          true,
          'Fun-ASR-Nano runner should report missing model files explicitly',
        );
      },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testCtcDecoderCollapsesBlankAndRepeatedTokens() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-fun-asr-nano-tokens-'));

  try {
    await writeFile(join(tempDir, 'tokens.txt'), [
      'YQ== 0',
      'Yg== 1',
      'Yw== 2',
      'IGJsYW5r 3',
    ].join('\n'), 'utf8');

    const text = await decodeFunAsrNanoCtcIndices([0, 0, 3, 1, 1, 2, 3], tempDir);

    assertEqual(text, 'abc', 'Fun-ASR-Nano CTC decoder should collapse repeated tokens and skip blank ids');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testRuntimeIssueReportsMissingAudioDecoder() {
  const originalFfmpegPath = process.env.HONEY_FFMPEG_PATH;

  try {
    process.env.HONEY_FFMPEG_PATH = join(tmpdir(), 'honey-missing-ffmpeg.exe');
    const issue = await getFunAsrNanoRuntimeIssue('../Fun-ASR-Nano-GGUF');

    assertEqual(
      issue?.startsWith('fun_asr_nano_audio_decoder_unavailable'),
      true,
      'Fun-ASR-Nano runtime health should report missing ffmpeg when web audio decoding is unavailable',
    );
  } finally {
    if (originalFfmpegPath === undefined) {
      delete process.env.HONEY_FFMPEG_PATH;
    } else {
      process.env.HONEY_FFMPEG_PATH = originalFfmpegPath;
    }
  }
}

async function testTranscriptionRunsCtcAndReportsEmptyTranscriptForSilence() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-fun-asr-nano-silence-'));
  const audioPath = join(tempDir, 'silence.wav');

  try {
    await writeFile(audioPath, createSilentWav());

    await transcribeWithFunAsrNano({
      audioPath,
      modelId: 'fun-asr-nano',
      modelRoot: '../Fun-ASR-Nano-GGUF',
    }).then(
      () => {
        throw new Error('Fun-ASR-Nano transcription should reject blank CTC output for silence');
      },
      (error: unknown) => {
        assertEqual(
          error instanceof Error && error.message.includes('fun_asr_nano_empty_transcript'),
          true,
          'Fun-ASR-Nano transcription should run inference and report empty CTC text for silence',
        );
      },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testShortAudioIsPaddedBeforeCtcInference() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-fun-asr-nano-short-silence-'));
  const audioPath = join(tempDir, 'short-silence.wav');

  try {
    await writeFile(audioPath, createSilentWav(16_000, 8_000));

    await transcribeWithFunAsrNano({
      audioPath,
      modelId: 'fun-asr-nano',
      modelRoot: '../Fun-ASR-Nano-GGUF',
    }).then(
      () => {
        throw new Error('Fun-ASR-Nano transcription should reject short silence as empty speech');
      },
      (error: unknown) => {
        assertEqual(
          error instanceof Error && error.message.includes('fun_asr_nano_empty_transcript'),
          true,
          'Fun-ASR-Nano transcription should pad short audio and report empty speech instead of ONNX GatherND errors',
        );
      },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testNospeechTokenIsTreatedAsEmptyTranscript() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-fun-asr-nano-nospeech-token-'));

  try {
    await writeFile(join(tempDir, 'tokens.txt'), [
      'PHxub3NwZWVjaHw+ 0',
      '5L2g 1',
      'IGJsYW5r 2',
    ].join('\n'), 'utf8');

    const text = await decodeFunAsrNanoCtcIndices([0, 2, 0], tempDir);

    assertEqual(text, '', 'Fun-ASR-Nano CTC decoder should treat nospeech control tokens as empty text');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function testCliReturnsJsonErrorWhenTranscriptIsEmpty() {
  const tempDir = await mkdtemp(join(tmpdir(), 'honey-fun-asr-nano-cli-silence-'));
  const audioPath = join(tempDir, 'silence.wav');
  let stderr = '';

  try {
    await writeFile(audioPath, createSilentWav());
    const exitCode = await runFunAsrNanoCli([
      '--model-root',
      '../Fun-ASR-Nano-GGUF',
    ], JSON.stringify({
      audioPath,
      modelId: 'fun-asr-nano',
    }), {
      stdout: () => true,
      stderr: (text) => {
        stderr += text;
        return true;
      },
    });

    assertEqual(exitCode, 1, 'Fun-ASR-Nano CLI should return empty transcript error exit code');
    assertEqual(stderr.includes('fun_asr_nano_empty_transcript'), true, 'Fun-ASR-Nano CLI should write structured empty transcript errors');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

await testModelReadinessUsesLocalInventory();
await testModelReadinessRejectsMissingFiles();
await testCtcDecoderCollapsesBlankAndRepeatedTokens();
await testRuntimeIssueReportsMissingAudioDecoder();
await testTranscriptionRunsCtcAndReportsEmptyTranscriptForSilence();
await testShortAudioIsPaddedBeforeCtcInference();
await testNospeechTokenIsTreatedAsEmptyTranscript();
await testCliReturnsJsonErrorWhenTranscriptIsEmpty();
