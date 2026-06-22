import { spawn } from 'node:child_process';

const withLocalLlm = process.env.HONEY_DESKTOP_WITH_LLM === '1';
const localLlmHost = process.env.HONEY_LLM_HOST || '127.0.0.1';
const localLlmPort = process.env.HONEY_LLM_PORT || '8080';
const localLlmBaseUrl = process.env.HONEY_PERSONA_OPENAI_BASE_URL || `http://${localLlmHost}:${localLlmPort}`;
const localLlmModel = process.env.HONEY_PERSONA_OPENAI_MODEL || 'qwen3-4b-instruct-q4_k_m';

const backendEnv = {
  ...process.env,
  ...(withLocalLlm
    ? {
      HONEY_PERSONA_OPENAI_BASE_URL: localLlmBaseUrl,
      HONEY_PERSONA_OPENAI_MODEL: localLlmModel,
      HONEY_PERSONA_OPENAI_TIMEOUT_MS: process.env.HONEY_PERSONA_OPENAI_TIMEOUT_MS || '30000',
    }
    : {}),
};

const pnpmArgs = (args) => process.platform === 'win32'
  ? ['/d', '/s', '/c', `pnpm ${args.join(' ')}`]
  : args;
const pnpmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';
const spawnPnpm = (args, options) => spawn(pnpmCommand, pnpmArgs(args), options);

const processes = [
  ...(withLocalLlm
    ? [
      {
        name: 'llm',
        child: spawnPnpm(['dev:llm'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        }),
      },
    ]
    : []),
  {
    name: 'backend',
    child: spawnPnpm(['--filter', 'backend', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: backendEnv,
    }),
  },
  {
    name: 'frontend',
    child: spawnPnpm(['--filter', 'frontend', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    }),
  },
];

let shuttingDown = false;

const writePrefixed = (name, stream, chunk) => {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      stream.write(`[${name}] ${line}\n`);
    }
  }
};

const stopAll = (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const { child } of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exitCode = exitCode;
};

for (const { name, child } of processes) {
  child.stdout?.on('data', chunk => writePrefixed(name, process.stdout, chunk));
  child.stderr?.on('data', chunk => writePrefixed(name, process.stderr, chunk));
  child.on('exit', code => {
    if (!shuttingDown) {
      stopAll(code ?? 1);
    }
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
