import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

test('authentication pages tolerate session-service outages and preserve access checks', { timeout: 90000 }, async () => {
  let mode = 'expired';
  const upstream = createServer((request, response) => {
    if (mode === 'disconnected') { request.socket.destroy(); return; }
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = mode === 'unavailable' ? 503 : mode === 'expired' ? 401 : 200;
    response.end(JSON.stringify(mode === 'farmer' || mode === 'administrator' ? {
      user: { id: '1', fullName: 'Session Test', email: 'session@example.test', phone: null, county: null, role: mode },
    } : { message: 'Service unavailable or session expired.' }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const portReservation = createServer();
  await new Promise((resolve) => portReservation.listen(0, '127.0.0.1', resolve));
  const webPort = portReservation.address().port;
  await new Promise((resolve) => portReservation.close(resolve));
  const base = `http://127.0.0.1:${webPort}`;
  const frontend = new URL('../frontend/', import.meta.url);
  const require = createRequire(new URL('package.json', frontend));
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(webPort)], {
    cwd: fileURLToPath(frontend), windowsHide: true,
    env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${upstream.address().port}/api` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let startError;
  child.on('error', (error) => { startError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
  const headers = { Cookie: `agro_session=${'0'.repeat(64)}` };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (startError) throw startError;
      if (child.exitCode !== null) throw new Error(`Frontend exited: ${output}`);
      try { ready = (await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Starting. */ }
      if (ready) break;
      await delay(250);
    }
    assert.ok(ready, `Frontend did not become ready: ${output}`);
    for (const failure of ['unavailable', 'disconnected']) {
      mode = failure;
      for (const [route, heading] of [['login', 'Sign in to AgroVerify'], ['register', 'Create your account']]) {
        const response = await fetch(`${base}/${route}`, { headers });
        const html = await response.text();
        assert.equal(response.status, 200, `${route} should render during ${failure}`);
        assert.match(html, new RegExp(heading));
        assert.match(html, /We could not check your existing session/);
        assert.match(html, /<form/);
        assert.equal(response.headers.get('set-cookie'), null, 'An outage must not erase the session');
      }
      for (const route of ['farmer', 'admin']) {
        const html = await (await fetch(`${base}/${route}`, { headers })).text();
        assert.doesNotMatch(html, /Your account<\/h2>/, 'An outage must not grant access to account content');
      }
    }
    mode = 'expired';
    const expired = await fetch(`${base}/login`, { headers });
    const html = await expired.text();
    assert.match(html, /Sign in to AgroVerify/);
    assert.doesNotMatch(html, /We could not check your existing session/);
    const protectedPage = await fetch(`${base}/farmer`, { headers, redirect: 'manual' });
    assert.equal(protectedPage.status, 307);
    assert.equal(protectedPage.headers.get('location'), '/login');
    for (const [role, target] of [['farmer', '/farmer'], ['administrator', '/admin']]) {
      mode = role;
      for (const route of ['login', 'register']) {
        const response = await fetch(`${base}/${route}`, { headers, redirect: 'manual' });
        assert.equal(response.status, 307);
        assert.equal(response.headers.get('location'), target);
      }
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([stopped, delay(5000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
