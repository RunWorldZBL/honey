import { spawn } from 'node:child_process';

export interface AsrTranscriptionResult {
  text: string;
  durationMs?: number;
}

export interface AsrHotwordHint {
  canonical: string;
  aliases: string[];
}

export interface AsrTranscriptionInput {
  audioPath: string;
  modelId: string;
  modelRoot?: string;
  language?: string;
  hotwords?: AsrHotwordHint[];
}

export interface AsrAdapter {
  transcribe(input: AsrTranscriptionInput): Promise<AsrTranscriptionResult>;
}

export interface CommandAsrAdapterOptions {
  command: string;
  timeoutMs?: number;
}

const parseCommandAsrOutput = (rawOutput: string): AsrTranscriptionResult => {
  const parsed = JSON.parse(rawOutput) as Partial<AsrTranscriptionResult>;

  if (typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
    throw new Error('invalid_asr_command_output');
  }

  if (parsed.durationMs !== undefined && typeof parsed.durationMs !== 'number') {
    throw new Error('invalid_asr_command_output');
  }

  return {
    text: parsed.text,
    durationMs: parsed.durationMs,
  };
};

export function createCommandAsrAdapter(options: CommandAsrAdapterOptions): AsrAdapter {
  return {
    async transcribe(input) {
      return await new Promise<AsrTranscriptionResult>((resolve, reject) => {
        const child = spawn(options.command, {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timeout = options.timeoutMs
          ? setTimeout(() => {
            settled = true;
            child.kill();
            reject(new Error('asr_command_timeout'));
          }, options.timeoutMs)
          : undefined;

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          stdout += chunk;
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
          if (timeout) {
            clearTimeout(timeout);
          }
          reject(error);
        });
        child.on('close', code => {
          if (settled) {
            return;
          }

          settled = true;
          if (timeout) {
            clearTimeout(timeout);
          }

          if (code !== 0) {
            reject(new Error(stderr.trim() || `asr_command_failed:${code}`));
            return;
          }

          try {
            resolve(parseCommandAsrOutput(stdout));
          } catch (error) {
            reject(error);
          }
        });
        child.stdin.end(JSON.stringify(input));
      });
    },
  };
}

export function createMockAsrAdapter(): AsrAdapter {
  return {
    async transcribe() {
      return {
        text: '今天下午把会议纪要发给大家。',
        durationMs: 1200,
      };
    },
  };
}
