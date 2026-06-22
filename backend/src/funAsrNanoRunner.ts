import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ort from 'onnxruntime-node';

import type { AsrTranscriptionInput, AsrTranscriptionResult } from './asrAdapter.js';
import { scanFunAsrNanoModel } from './modelInventory.js';

const targetSampleRate = 16_000;
const minimumInferenceDurationMs = 1_600;
const funAsrNanoEmptyTranscriptIssue = 'fun_asr_nano_empty_transcript';

interface FunAsrNanoTranscriptionInput extends AsrTranscriptionInput {
  modelRoot?: string;
}

interface FunAsrNanoCliOutput {
  error: string;
  message: string;
}

interface FunAsrNanoAudio {
  samples: Float32Array;
  durationMs: number;
}

interface FunAsrNanoTokenVocabulary {
  tokensById: Map<number, Buffer>;
  blankId: number;
}

interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

export async function assertFunAsrNanoModelReady(modelRoot: string) {
  const inventory = await scanFunAsrNanoModel(modelRoot);
  if (inventory.status !== 'installed') {
    throw new Error(`fun_asr_nano_model_missing:${inventory.requiredFilesMissing.join(',')}`);
  }

  return inventory;
}

async function assertFunAsrNanoRuntimeAvailable() {
  if (typeof ort.InferenceSession?.create !== 'function') {
    throw new Error('fun_asr_nano_runtime_unavailable:onnxruntime-node');
  }
}

async function assertFunAsrNanoAudioDecoderAvailable() {
  const ffmpegCommand = resolveFfmpegCommand();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegCommand, ['-version'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error('fun_asr_nano_audio_decoder_unavailable:timeout'));
    }, Number(process.env.HONEY_FFMPEG_PROBE_TIMEOUT_MS ?? 5_000));

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(new Error(`fun_asr_nano_audio_decoder_unavailable:${error.message}`));
    });
    child.on('close', code => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`fun_asr_nano_audio_decoder_unavailable:${stderr.trim() || code}`));
        return;
      }

      resolve();
    });
  });
}

export async function getFunAsrNanoRuntimeIssue(modelRoot: string) {
  try {
    await assertFunAsrNanoModelReady(modelRoot);
    await assertFunAsrNanoRuntimeAvailable();
    await assertFunAsrNanoAudioDecoderAvailable();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'fun_asr_nano_runtime_unavailable';
  }
}

const resolveFfmpegCommand = () => process.env.HONEY_FFMPEG_PATH?.trim() || 'ffmpeg';

const bufferToFloat32Pcm = (buffer: Buffer) => {
  if (buffer.length === 0 || buffer.length % 2 !== 0) {
    throw new Error('fun_asr_nano_audio_empty');
  }

  const samples = new Float32Array(buffer.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2) / 32768;
  }

  return samples;
};

const findWavFormat = (buffer: Buffer): WavFormat => {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('fun_asr_nano_audio_decode_unsupported:wav_header');
  }

  let offset = 12;
  let audioFormat: number | undefined;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let dataOffset: number | undefined;
  let dataSize: number | undefined;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkDataOffset + chunkSize > buffer.length) {
      throw new Error('fun_asr_nano_audio_decode_unsupported:wav_chunk_bounds');
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        throw new Error('fun_asr_nano_audio_decode_unsupported:wav_fmt_chunk');
      }

      audioFormat = buffer.readUInt16LE(chunkDataOffset);
      channels = buffer.readUInt16LE(chunkDataOffset + 2);
      sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
    }

    if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (
    audioFormat === undefined
    || channels === undefined
    || sampleRate === undefined
    || bitsPerSample === undefined
    || dataOffset === undefined
    || dataSize === undefined
  ) {
    throw new Error('fun_asr_nano_audio_decode_unsupported:wav_missing_chunks');
  }

  return {
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    dataOffset,
    dataSize,
  };
};

const readWavSample = (buffer: Buffer, offset: number, format: WavFormat) => {
  if (format.audioFormat === 1 && format.bitsPerSample === 16) {
    return buffer.readInt16LE(offset) / 32768;
  }

  if (format.audioFormat === 1 && format.bitsPerSample === 24) {
    const value = buffer.readIntLE(offset, 3);
    return value / 8388608;
  }

  if (format.audioFormat === 1 && format.bitsPerSample === 32) {
    return buffer.readInt32LE(offset) / 2147483648;
  }

  if (format.audioFormat === 3 && format.bitsPerSample === 32) {
    return buffer.readFloatLE(offset);
  }

  throw new Error(`fun_asr_nano_audio_decode_unsupported:wav_format_${format.audioFormat}_${format.bitsPerSample}`);
};

const decodeWavAudio = async (audioPath: string): Promise<FunAsrNanoAudio> => {
  const buffer = await readFile(audioPath);
  const format = findWavFormat(buffer);

  if (format.sampleRate !== targetSampleRate) {
    throw new Error('fun_asr_nano_audio_requires_resampling');
  }

  if (format.channels < 1) {
    throw new Error('fun_asr_nano_audio_decode_unsupported:wav_channels');
  }

  const bytesPerSample = format.bitsPerSample / 8;
  const bytesPerFrame = bytesPerSample * format.channels;
  const frameCount = Math.floor(format.dataSize / bytesPerFrame);
  if (frameCount <= 0) {
    throw new Error('fun_asr_nano_audio_empty');
  }

  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let mixedSample = 0;
    const frameOffset = format.dataOffset + frame * bytesPerFrame;
    for (let channel = 0; channel < format.channels; channel += 1) {
      mixedSample += readWavSample(buffer, frameOffset + channel * bytesPerSample, format);
    }
    samples[frame] = mixedSample / format.channels;
  }

  return {
    samples,
    durationMs: Math.round(samples.length / targetSampleRate * 1000),
  };
};

const decodeAudioWithFfmpeg = async (audioPath: string): Promise<FunAsrNanoAudio> => {
  const ffmpegCommand = resolveFfmpegCommand();

  return await new Promise<FunAsrNanoAudio>((resolve, reject) => {
    const child = spawn(ffmpegCommand, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      audioPath,
      '-ac',
      '1',
      '-ar',
      String(targetSampleRate),
      '-f',
      's16le',
      'pipe:1',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error('fun_asr_nano_audio_decode_timeout'));
    }, Number(process.env.HONEY_FFMPEG_TIMEOUT_MS ?? 30_000));

    child.stdout.on('data', chunk => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(new Error(`fun_asr_nano_audio_decode_unavailable:${error.message}`));
    });
    child.on('close', code => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`fun_asr_nano_audio_decode_failed:${stderr.trim() || code}`));
        return;
      }

      try {
        const samples = bufferToFloat32Pcm(Buffer.concat(stdoutChunks));
        resolve({
          samples,
          durationMs: Math.round(samples.length / targetSampleRate * 1000),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
};

const loadAudioSamples = async (audioPath: string): Promise<FunAsrNanoAudio> => {
  if (extname(audioPath).toLowerCase() === '.wav') {
    try {
      return await decodeWavAudio(audioPath);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('requires_resampling')) {
        throw error;
      }
    }
  }

  return decodeAudioWithFfmpeg(audioPath);
};

const loadTokenVocabulary = async (modelRoot: string): Promise<FunAsrNanoTokenVocabulary> => {
  const tokensText = await readFile(join(modelRoot, 'tokens.txt'), 'utf8');
  const tokensById = new Map<number, Buffer>();

  for (const line of tokensText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [encodedToken, idText] = trimmed.split(/\s+/);
    const id = Number(idText);
    if (!encodedToken || !Number.isInteger(id)) {
      throw new Error('fun_asr_nano_tokens_invalid');
    }

    tokensById.set(id, Buffer.from(encodedToken, 'base64'));
  }

  if (tokensById.size === 0) {
    throw new Error('fun_asr_nano_tokens_invalid');
  }

  return {
    tokensById,
    blankId: Math.max(...tokensById.keys()),
  };
};

export async function decodeFunAsrNanoCtcIndices(indices: Iterable<number>, modelRoot: string) {
  const { tokensById, blankId } = await loadTokenVocabulary(modelRoot);
  const tokenBuffers: Buffer[] = [];
  let previousId: number | undefined;

  for (const rawIndex of indices) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index)) {
      throw new Error('fun_asr_nano_ctc_indices_invalid');
    }

    if (index === blankId) {
      previousId = index;
      continue;
    }

    if (index === previousId) {
      continue;
    }

    const token = tokensById.get(index);
    if (!token) {
      throw new Error(`fun_asr_nano_token_missing:${index}`);
    }

    tokenBuffers.push(token);
    previousId = index;
  }

  return Buffer.concat(tokenBuffers)
    .toString('utf8')
    .replace(/<\|nospeech\|>/g, '')
    .trim();
}

const padAudioForInference = (audio: FunAsrNanoAudio): FunAsrNanoAudio => {
  const minimumSampleCount = Math.ceil(targetSampleRate * minimumInferenceDurationMs / 1000);
  if (audio.samples.length >= minimumSampleCount) {
    return audio;
  }

  const samples = new Float32Array(minimumSampleCount);
  samples.set(audio.samples);

  return {
    ...audio,
    samples,
  };
};

const runFunAsrNanoCtc = async (audio: FunAsrNanoAudio, modelRoot: string) => {
  const encoderSession = await ort.InferenceSession.create(join(modelRoot, 'Fun-ASR-Nano-Encoder-Adaptor.int8.onnx'));
  const ctcSession = await ort.InferenceSession.create(join(modelRoot, 'Fun-ASR-Nano-CTC.int8.onnx'));
  const encoderOutput = await encoderSession.run({
    audio: new ort.Tensor('float32', audio.samples, [1, 1, audio.samples.length]),
    ilens: new ort.Tensor('int64', BigInt64Array.from([BigInt(audio.samples.length)]), [1]),
  });
  const ctcOutput = await ctcSession.run({
    enc_output: encoderOutput.enc_output,
  });

  if (!ctcOutput.indices?.data) {
    throw new Error('fun_asr_nano_ctc_output_invalid');
  }

  return Array.from(ctcOutput.indices.data as Iterable<number>);
};

export async function transcribeWithFunAsrNano(
  input: FunAsrNanoTranscriptionInput,
): Promise<AsrTranscriptionResult> {
  const modelRoot = input.modelRoot ?? '../Fun-ASR-Nano-GGUF';
  await assertFunAsrNanoModelReady(modelRoot);
  await assertFunAsrNanoRuntimeAvailable();

  const audio = await loadAudioSamples(input.audioPath);
  const inferenceAudio = padAudioForInference(audio);
  const indices = await runFunAsrNanoCtc(inferenceAudio, modelRoot);
  const text = await decodeFunAsrNanoCtcIndices(indices, modelRoot);
  if (!text) {
    throw new Error(funAsrNanoEmptyTranscriptIssue);
  }

  return {
    text,
    durationMs: audio.durationMs,
  };
}

const parseModelRootArg = (args: string[]) => {
  const index = args.indexOf('--model-root');
  return index >= 0 ? args[index + 1] : undefined;
};

const readStdin = async () => {
  let input = '';
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
};

export async function runFunAsrNanoCli(
  args = process.argv.slice(2),
  stdinText?: string,
  writers = {
    stdout: (text: string) => process.stdout.write(text),
    stderr: (text: string) => process.stderr.write(text),
  },
) {
  try {
    const rawInput = stdinText ?? await readStdin();
    const payload = JSON.parse(rawInput) as FunAsrNanoTranscriptionInput;
    const result = await transcribeWithFunAsrNano({
      ...payload,
      modelRoot: parseModelRootArg(args) ?? payload.modelRoot,
    });
    writers.stdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const output: FunAsrNanoCliOutput = {
      error: error instanceof Error ? error.message.split(':')[0] ?? 'fun_asr_nano_error' : 'fun_asr_nano_error',
      message: error instanceof Error ? error.message : 'Unknown Fun-ASR-Nano runner error',
    };
    writers.stderr(`${JSON.stringify(output)}\n`);
    return error instanceof Error && error.message.startsWith('fun_asr_nano_runtime_unavailable') ? 2 : 1;
  }
}

export function isFunAsrNanoCliEntrypoint(moduleUrl: string, entryPath?: string) {
  return Boolean(entryPath && moduleUrl === pathToFileURL(entryPath).href);
}

if (isFunAsrNanoCliEntrypoint(import.meta.url, process.argv[1])) {
  void runFunAsrNanoCli()
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      process.stderr.write(`${JSON.stringify({
        error: 'fun_asr_nano_unhandled_error',
        message: error instanceof Error ? error.message : 'Unknown Fun-ASR-Nano runner error',
      })}\n`);
      process.exitCode = 1;
    });
}
