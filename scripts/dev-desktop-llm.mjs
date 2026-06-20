import { spawn } from 'node:child_process';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const child = spawn(pnpmCommand, ['dev:desktop'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HONEY_DESKTOP_WITH_LLM: '1',
  },
});

child.on('exit', code => {
  process.exit(code ?? 0);
});
