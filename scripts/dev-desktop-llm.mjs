import { spawn } from 'node:child_process';

const pnpmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';
const pnpmArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'pnpm dev:desktop']
  : ['dev:desktop'];

const child = spawn(pnpmCommand, pnpmArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    HONEY_DESKTOP_WITH_LLM: '1',
  },
});

child.on('exit', code => {
  process.exit(code ?? 0);
});
