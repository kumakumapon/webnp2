// Shared launcher for start-linux.sh and start-windows.cmd. No global Vite needed.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, access, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const usage = `WebNP2 local launcher (Node.js 22.12+ and npm)
Usage: start-linux.sh | start-windows.cmd [options]
  --port NUMBER  Local port (default: 5173)
  --no-open      Do not open a browser
  --install      Reinstall dependencies with npm ci
  --help         Show this help
Stop the server with Ctrl+C.`;

function options(args) {
  const result = { port: '5173', open: true, install: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port': {
        const value = args[++i];
        if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) {
          throw new Error('--port requires a number from 1 to 65535');
        }
        result.port = String(Number(value));
        break;
      }
      case '--no-open': result.open = false; break;
      case '--install': result.install = true; break;
      default: throw new Error(`Unknown option: ${args[i]}. Use --help for usage.`);
    }
  }
  return result;
}

function run(command, args, settings = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...settings });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    const cleanup = () => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => {
      cleanup();
      resolve(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : code ?? 1);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return 0;
  }
  const config = options(args);
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error('Install Node.js 22.12 or later with npm: https://nodejs.org/');
  }
  const stamp = join(root, 'node_modules', '.webnp2-local-deps');
  const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const fingerprint = createHash('sha256')
    .update(await readFile(join(root, 'package.json')))
    .update(await readFile(join(root, 'package-lock.json')))
    .update(`${process.platform}:${process.arch}:${major}`)
    .digest('hex');
  const installed = await readFile(stamp, 'utf8').catch(() => '');
  const vitePresent = await access(vite).then(() => true, () => false);
  if (config.install || installed !== fingerprint || !vitePresent) {
    console.log('Preparing WebNP2 dependencies (npm ci)...');
    let code;
    try {
      // The Windows shell command is fixed; user arguments never reach the shell.
      code = process.platform === 'win32'
        ? await run('npm.cmd ci --include=dev', [], { shell: true })
        : await run('npm', ['ci', '--include=dev']);
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('npm was not found. Install Node.js with npm: https://nodejs.org/');
      throw error;
    }
    if (code !== 0) {
      console.error('Dependency installation failed. Check npm/network access and try again.');
      return code;
    }
    await writeFile(stamp, fingerprint);
  }
  console.log(`Starting WebNP2 at http://127.0.0.1:${config.port}/ (Ctrl+C to stop).`);
  // Invoke Vite directly so the server has no intermediate npm/cmd process.
  const viteArgs = [vite, '--host', '127.0.0.1', '--port', config.port, '--strictPort'];
  if (config.open) viteArgs.push('--open');
  return run(process.execPath, viteArgs);
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
