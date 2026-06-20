import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';

import type {
  LocalLlmRuntimeStatus,
  StartLocalLlmRuntimeInput,
} from '@honey/api-contracts';

export interface LocalLlmRuntimeController {
  getStatus(): Promise<LocalLlmRuntimeStatus>;
  start(input: StartLocalLlmRuntimeInput): Promise<LocalLlmRuntimeStatus>;
  stop(): Promise<LocalLlmRuntimeStatus>;
}

export interface NodeLocalLlmRuntimeControllerOptions {
  executablePath: string;
  getExecutablePath?: () => string;
  cwd?: string;
}

const stoppedStatus = (): LocalLlmRuntimeStatus => ({
  status: 'stopped',
});

const createStatusFromInput = (
  input: StartLocalLlmRuntimeInput,
  status: LocalLlmRuntimeStatus['status'],
  pid?: number,
  message?: string,
): LocalLlmRuntimeStatus => ({
  status,
  modelPath: input.modelPath,
  modelAlias: input.modelAlias,
  host: input.host,
  port: input.port,
  baseUrl: `http://${input.host}:${input.port}`,
  pid,
  message,
});

export function createStoppedLocalLlmRuntimeController(): LocalLlmRuntimeController {
  let lastStatus = stoppedStatus();

  return {
    async getStatus() {
      return { ...lastStatus };
    },
    async start(input) {
      lastStatus = createStatusFromInput(input, 'running');
      return { ...lastStatus };
    },
    async stop() {
      lastStatus = {
        ...lastStatus,
        status: 'stopped',
        pid: undefined,
      };
      return { ...lastStatus };
    },
  };
}

export function createNodeLocalLlmRuntimeController({
  executablePath,
  getExecutablePath,
  cwd,
}: NodeLocalLlmRuntimeControllerOptions): LocalLlmRuntimeController {
  let child: ChildProcess | undefined;
  let lastStatus = stoppedStatus();

  const isRunning = () => Boolean(child && child.exitCode === null && !child.killed);

  const refreshStatus = () => {
    if (isRunning()) {
      return lastStatus;
    }

    if (lastStatus.status === 'running' || lastStatus.status === 'starting') {
      lastStatus = {
        ...lastStatus,
        status: 'stopped',
        pid: undefined,
      };
    }

    return lastStatus;
  };

  return {
    async getStatus() {
      return { ...refreshStatus() };
    },
    async start(input) {
      if (isRunning()) {
        return { ...lastStatus };
      }

      const activeExecutablePath = getExecutablePath?.() ?? executablePath;

      try {
        await access(activeExecutablePath);
        await access(input.modelPath);
      } catch (error) {
        lastStatus = createStatusFromInput(
          input,
          'error',
          undefined,
          error instanceof Error ? error.message : 'local_llm_runtime_unavailable',
        );

        return { ...lastStatus };
      }

      const args = [
        '--model',
        input.modelPath,
        '--alias',
        input.modelAlias,
        '--host',
        input.host,
        '--port',
        String(input.port),
        '--ctx-size',
        String(input.contextSize ?? 4096),
      ];

      if (input.threads) {
        args.push('--threads', String(input.threads));
      }

      child = spawn(activeExecutablePath, args, {
        cwd,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      lastStatus = createStatusFromInput(input, 'running', child.pid);

      child.stderr?.on('data', chunk => {
        const message = chunk.toString().trim();
        if (message) {
          lastStatus = {
            ...lastStatus,
            message,
          };
        }
      });
      child.once('error', error => {
        lastStatus = createStatusFromInput(input, 'error', undefined, error.message);
      });
      child.once('exit', code => {
        lastStatus = {
          ...lastStatus,
          status: code === 0 || code === null ? 'stopped' : 'error',
          pid: undefined,
          message: code === 0 || code === null ? lastStatus.message : `llama-server exited with ${code}`,
        };
        child = undefined;
      });

      return { ...lastStatus };
    },
    async stop() {
      if (isRunning()) {
        child?.kill();
      }

      child = undefined;
      lastStatus = {
        ...lastStatus,
        status: 'stopped',
        pid: undefined,
      };

      return { ...lastStatus };
    },
  };
}
