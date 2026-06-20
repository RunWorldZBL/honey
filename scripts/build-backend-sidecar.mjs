import { spawn } from 'node:child_process';
import { access, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const backendRequire = createRequire(join(repoRoot, 'backend', 'package.json'));
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pkgPackageName = '@yao-pkg/pkg';

const backendEntry = join(repoRoot, 'backend', 'dist-test', 'backend', 'src', 'index.js');
const backendTscBin = join(repoRoot, 'backend', 'node_modules', 'typescript', 'bin', 'tsc');
const pkgBin = join(repoRoot, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
const sidecarDir = join(repoRoot, 'src-tauri', 'binaries');
const buildTempDir = join(repoRoot, '.tmp', 'backend-sidecar');
const pkgConfigPath = join(buildTempDir, 'pkg.config.json');

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  child.on('error', reject);
  child.on('exit', code => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown'}`));
  });
});

const readProcessOutput = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', chunk => {
    stderr += chunk.toString();
  });
  child.on('error', reject);
  child.on('exit', code => {
    if (code === 0) {
      resolve(stdout);
      return;
    }

    reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown'}\n${stderr}`));
  });
});

const resolveRustHostTriple = async () => {
  if (process.env.HONEY_TAURI_TARGET_TRIPLE?.trim()) {
    return process.env.HONEY_TAURI_TARGET_TRIPLE.trim();
  }

  if (process.env.TAURI_TARGET_TRIPLE?.trim()) {
    return process.env.TAURI_TARGET_TRIPLE.trim();
  }

  try {
    const rustcVersion = await readProcessOutput('rustc', ['-vV']);
    const hostLine = rustcVersion
      .split(/\r?\n/)
      .find(line => line.startsWith('host:'));
    const hostTriple = hostLine?.replace('host:', '').trim();
    if (hostTriple) {
      return hostTriple;
    }
  } catch {
    // Fall back below when rustc is unavailable in a packaging environment.
  }

  if (process.platform === 'win32') {
    return 'x86_64-pc-windows-msvc';
  }

  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }

  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }

  throw new Error(`Unsupported sidecar host platform: ${process.platform}/${process.arch}`);
};

const resolvePkgTarget = (targetTriple) => {
  const explicitTarget = process.env.HONEY_BACKEND_SIDECAR_PKG_TARGET?.trim();
  if (explicitTarget) {
    return explicitTarget;
  }

  const targetByTriple = {
    'x86_64-pc-windows-msvc': 'node22-win-x64',
    'aarch64-apple-darwin': 'node22-macos-arm64',
    'x86_64-apple-darwin': 'node22-macos-x64',
    'aarch64-unknown-linux-gnu': 'node22-linux-arm64',
    'x86_64-unknown-linux-gnu': 'node22-linux-x64',
  };
  const pkgTarget = targetByTriple[targetTriple];
  if (!pkgTarget) {
    throw new Error(`Unsupported sidecar target triple: ${targetTriple}`);
  }

  return pkgTarget;
};

const resolveBinaryExtension = (targetTriple) =>
  targetTriple.includes('windows') || targetTriple.includes('pc-windows') ? '.exe' : '';

const ensurePkgIsAvailable = async () => {
  try {
    await run(process.execPath, [pkgBin, '--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      `Missing ${pkgPackageName}. Run "pnpm install" after syncing package.json, then retry pnpm build:backend-sidecar.`,
    );
  }
};

const toPkgPath = (path) => path.split('\\').join('/');

const writePkgConfig = async () => {
  const onnxruntimeNodeRoot = await realpath(dirname(backendRequire.resolve('onnxruntime-node/package.json')));
  const repoRootPkgPath = toPkgPath(relative(buildTempDir, repoRoot));
  const onnxruntimeNodePkgPath = toPkgPath(relative(buildTempDir, onnxruntimeNodeRoot));
  const fromRepoRoot = (glob) => `${repoRootPkgPath}/${glob}`;

  await mkdir(buildTempDir, { recursive: true });
  await writeFile(pkgConfigPath, JSON.stringify({
    pkg: {
      publicPackages: [
        'onnxruntime-node',
      ],
      scripts: [
        fromRepoRoot('backend/dist-test/backend/src/**/*.js'),
        fromRepoRoot('backend/node_modules/onnxruntime-node/dist/**/*.js'),
        fromRepoRoot('node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/dist/**/*.js'),
        `${onnxruntimeNodePkgPath}/dist/**/*.js`,
        fromRepoRoot('shared/api-contracts/src/**/*.js'),
      ],
      assets: [
        fromRepoRoot('backend/dist-test/backend/src/**/*.js'),
        fromRepoRoot('backend/node_modules/onnxruntime-node/**/*'),
        fromRepoRoot('node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/**/*'),
        `${onnxruntimeNodePkgPath}/**/*`,
        fromRepoRoot('shared/api-contracts/src/**/*.js'),
      ],
    },
  }, null, 2), 'utf8');
};

const main = async () => {
  const targetTriple = await resolveRustHostTriple();
  const pkgTarget = resolvePkgTarget(targetTriple);
  const extension = resolveBinaryExtension(targetTriple);
  const outputFileName = `honey-backend-${targetTriple}${extension}`;
  const outputPath = join(sidecarDir, outputFileName);

  await ensurePkgIsAvailable();
  await run(process.execPath, [backendTscBin, '-p', join(repoRoot, 'backend', 'tsconfig.json')]);
  await access(backendEntry);
  await writePkgConfig();
  await mkdir(sidecarDir, { recursive: true });
  await rm(outputPath, { force: true });
  await run(process.execPath, [
    pkgBin,
    backendEntry,
    '--config',
    pkgConfigPath,
    '--target',
    pkgTarget,
    '--output',
    outputPath,
    '--compress',
    'GZip',
    '--fallback-to-source',
  ]);

  const binaryStats = await stat(outputPath);
  if (!binaryStats.isFile() || binaryStats.size === 0) {
    throw new Error(`Backend sidecar was not created at ${outputPath}`);
  }

  console.log(`honey backend sidecar ready: ${outputPath}`);
};

await main();
