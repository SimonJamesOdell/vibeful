// dev.mjs — starts agent-engine + management console for local dev.
// Cross-platform: works on Windows (pwsh/cmd), macOS, and Linux.
// Usage: npm run dev

import { spawn, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const isWin = process.platform === 'win32';

// Prefer virtualenv Python if available (matches setup.sh / setup.ps1)
const venvPython = isWin
  ? join(root, 'packages', 'agent-engine', '.venv', 'Scripts', 'python.exe')
  : join(root, 'packages', 'agent-engine', '.venv', 'bin', 'python');
const pythonCmd = existsSync(venvPython) ? venvPython : (isWin ? 'python' : 'python3');

// ═══════════════════════════════════════════════════════════════
// Startup banner
// ═══════════════════════════════════════════════════════════════

console.log('');
console.log('════════════════════════════════════════');
console.log('  Vibeful — Local Dev');
console.log('════════════════════════════════════════');
console.log('');
console.log(`  Python:  ${pythonCmd}`);
console.log(`  Storage: SQLite (no Docker)`);
console.log('');
console.log('  Starting agent engine (port 50052)...');

// ═══════════════════════════════════════════════════════════════
// Agent Engine (REST, SQLite)
// ═══════════════════════════════════════════════════════════════

const engine = spawn(pythonCmd, [
  '-m', 'uvicorn',
  'src.rest_server:app',
  '--host', '127.0.0.1',
  '--port', '50052',
  '--log-level', 'warning',
], {
  cwd: join(root, 'packages', 'agent-engine'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VIBEFUL_STORAGE: 'sqlite' },
});

let engineStarted = false;
let engineOutput = '';

function onEngineOutput(text) {
  engineOutput += text;
  if (!engineStarted && (text.includes('startup complete') || text.includes('Uvicorn running'))) {
    engineStarted = true;
    console.log('  ✓ Agent engine ready');
    console.log('');
    console.log('  Starting management console (port 5174)...');
  }
}

engine.stdout.on('data', (data) => {
  onEngineOutput(data.toString());
});

engine.stderr.on('data', (data) => {
  const text = data.toString();
  onEngineOutput(text);
  // Forward vibeful prefixed messages
  if (text.includes('[vibeful]')) {
    process.stderr.write(text);
  }
});

// Health-probe fallback: if stdout/stderr detection missed the startup message
// (e.g. uvicorn at --log-level warning suppresses "Uvicorn running"),
// poll /health until the engine responds.
const healthProbe = setInterval(async () => {
  if (engineStarted) { clearInterval(healthProbe); return; }
  try {
    const resp = await fetch('http://127.0.0.1:50052/health');
    if (resp.ok) {
      clearInterval(healthProbe);
      engineStarted = true;
      console.log('  ✓ Agent engine ready');
      console.log('');
      console.log('  Starting management console (port 5174)...');
    }
  } catch {}
}, 500);
setTimeout(() => clearInterval(healthProbe), 30000);

engine.on('error', (err) => {
  console.error('');
  console.error('  ✗ Agent engine failed to start');
  console.error(`    ${err.message}`);
  console.error('');
  console.error('  Make sure dependencies are installed:');
  if (isWin) {
    console.error('    .\\scripts\\setup.ps1');
  } else {
    console.error('    bash scripts/setup.sh');
  }
  console.error('');
  process.exit(1);
});

engine.on('exit', (code) => {
  if (!engineStarted && code !== null) {
    console.error('');
    console.error('  ✗ Agent engine exited immediately (code ' + code + ')');
    if (engineOutput) {
      console.error('    Last output: ' + engineOutput.split('\n').slice(-3).join(' ').slice(0, 200));
    }
    console.error('');
    console.error('  Common causes:');
    console.error('    - uvicorn not installed → run setup script first');
    console.error('    - Port 50052 in use → check: netstat -an | grep 50052');
    console.error('    - Python environment incomplete');
    console.error('');
    process.exit(1);
  }
});

// ═══════════════════════════════════════════════════════════════
// Management Console (Vite)
// ═══════════════════════════════════════════════════════════════

const console_ = spawn('pnpm', [
  '--filter', '@vibeful/management-console',
  'dev',
  '--host', '0.0.0.0',
  '--port', '5174',
], {
  cwd: root,
  stdio: 'pipe',
  shell: true,
  env: { ...process.env, COREPACK_ENABLE_STRICT: '0' },
});

let consoleStarted = false;
let consoleOutput = '';

console_.stdout.on('data', (data) => {
  const text = data.toString();
  consoleOutput += text;
  process.stdout.write(text);
  if (!consoleStarted && (text.includes('Local:') || text.includes('ready in'))) {
    consoleStarted = true;
  }
});

console_.stderr.on('data', (data) => {
  const text = data.toString();
  consoleOutput += text;
  process.stderr.write(text);
});

console_.on('error', (err) => {
  console.error('');
  console.error('  ✗ Management console failed to start');
  console.error(`    ${err.message}`);
  console.error('');
  console.error('  Make sure Node.js dependencies are installed:');
  console.error('    pnpm install');
  console.error('');
  process.exit(1);
});

console_.on('exit', (code) => {
  if (!consoleStarted && code !== null && code !== 0) {
    console.error('');
    console.error('  ✗ Management console exited immediately (code ' + code + ')');
    if (consoleOutput) {
      const lines = consoleOutput.split('\n').filter(Boolean);
      console.error('    Last output: ' + lines.slice(-3).join(' | ').slice(0, 300));
    }
    console.error('');
    console.error('  Common causes:');
    console.error('    - Dependencies not installed → run: pnpm install');
    console.error('    - Port 5174 in use');
    console.error('    - Node.js version too old (need 22+)');
    console.error('');
    process.exit(1);
  }
});

// ═══════════════════════════════════════════════════════════════
// Ready message — only after both services confirm started
// ═══════════════════════════════════════════════════════════════

const readyCheck = setInterval(() => {
  if (engineStarted && consoleStarted) {
    clearInterval(readyCheck);
    console.log('');
    console.log('════════════════════════════════════════');
    console.log('  Vibeful is Ready');
    console.log('════════════════════════════════════════');
    console.log('');
    console.log('  Management Console:  http://localhost:5174');
    console.log('  Agent Engine API:    http://127.0.0.1:50052');
    console.log('');
    console.log('  Press Ctrl+C to stop both services.');
    console.log('');
  }
}, 500);

// Safety timeout — if console never starts, report it
setTimeout(() => {
  if (!consoleStarted) {
    clearInterval(readyCheck);
    console.error('');
    console.error('  ✗ Management console did not start within 15 seconds');
    console.error('');
    console.error('  Make sure dependencies are installed:');
    console.error('    pnpm install');
    console.error('');
    if (consoleOutput) {
      console.error('  Console output so far:');
      console.error('    ' + consoleOutput.split('\n').filter(Boolean).slice(-5).join('\n    '));
    }
    process.exit(1);
  }
}, 15000);

// ═══════════════════════════════════════════════════════════════
// Cleanup on Ctrl+C
// ═══════════════════════════════════════════════════════════════

function cleanup() {
  console.log('');
  console.log('  Shutting down...');
  if (isWin) {
    try { execSync(`taskkill /pid ${engine.pid} /t /f 2>nul`, { stdio: 'ignore' }); } catch {}
    try { execSync(`taskkill /pid ${console_.pid} /t /f 2>nul`, { stdio: 'ignore' }); } catch {}
  } else {
    engine.kill('SIGTERM');
    console_.kill('SIGTERM');
  }
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
