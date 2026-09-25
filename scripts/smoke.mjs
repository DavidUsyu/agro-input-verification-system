import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Test the built applications on separate ports without disturbing npm run dev.
const root = new URL('../', import.meta.url);
const apiBase = 'http://127.0.0.1:3101';
const webBase = 'http://127.0.0.1:3100';
const children = [];

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function launch(label, args, cwd, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: fileURLToPath(new URL(cwd, root)),
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { child, label, output: '', error: null };
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { state.output = (state.output + chunk.toString()).slice(-8000); });
  }
  child.on('error', (error) => { state.error = error; });
  children.push(state);
  return state;
}

async function waitFor(url, state) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (state.error) throw state.error;
    if (state.child.exitCode !== null) throw new Error(`${state.label} exited early.\n${state.output}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch { /* Wait until the server is listening. */ }
    await delay(500);
  }
  throw new Error(`${state.label} did not start.\n${state.output}`);
}

try {
  await assertPortAvailable(3100);
  await assertPortAvailable(3101);
  const backend = launch('Backend', ['dist/main.js'], 'backend/', {
    PORT: '3101', HOST: '127.0.0.1', FRONTEND_ORIGIN: webBase,
  });
  const requireFrontend = createRequire(new URL('frontend/package.json', root));
  const frontend = launch('Frontend', [requireFrontend.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3100'], 'frontend/');

  const live = await waitFor(`${apiBase}/api/health`, backend);
  assert.deepEqual(await live.json(), { status: 'ok', service: 'agro-input-api' });
  const page = await waitFor(webBase, frontend);
  assert.match(await page.text(), /AgroVerify/);
  const status = await fetch(`${webBase}/status`);
  assert.equal(status.status, 200);
  assert.match(await status.text(), /Check connection/);

  const preflight = await fetch(`${apiBase}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: webBase, 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), webBase);
  const ready = await fetch(`${apiBase}/api/health/ready`, { signal: AbortSignal.timeout(7000) });
  assert.equal(ready.status, 200, 'PostgreSQL is not ready. Run npm run db:up and check backend/.env.');
  assert.deepEqual(await ready.json(), { status: 'ok', database: 'connected' });
  console.log('Smoke checks passed: homepage, status page, API, CORS and PostgreSQL connection.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Smoke check failed.');
  process.exitCode = 1;
} finally {
  await Promise.all(children.map(async ({ child }) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await Promise.race([stopped, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }));
}
