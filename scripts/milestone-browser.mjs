import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { connectDatabase, databaseUrl } from '../backend/database/connection.mjs';
import { migrate, schemaIdentifier } from '../backend/database/migration-runner.mjs';

import { seedDemo } from '../backend/database/demo-data.mjs';

const require = createRequire(import.meta.url);
const artifacts = path.resolve('.artifacts');
const webBase = 'http://localhost:3210';
const schema = `agro_test_${randomUUID().replaceAll('-', '')}`;
const password = 'Browser test passphrase only!';
let client, app, web, browser, socket;
let schemaCreated = false;
let sequence = 0;
const pending = new Map();
const exceptions = [];
let webOutput = '';

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error('Browser evaluation failed');
  return response.result.value;
}
async function until(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await delay(300);
  }
  throw new Error(`Browser condition was not met: ${expression}`);
}
async function visit(route) { await command('Page.navigate', { url: `${webBase}${route}` }); }
async function fill(values) {
  await evaluate(`(() => { for (const [name, value] of Object.entries(${JSON.stringify(values)})) { const input = document.querySelector('form [name="' + name + '"]'); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
}
async function submit() { await evaluate("document.querySelector('form').requestSubmit()"); }
async function screenshot(name) {
  const result = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(artifacts, name), Buffer.from(result.data, 'base64'));
}
async function logout() {
  await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Sign out').click()");
  await until("location.pathname === '/login' && !!document.querySelector('[name=identifier]')");
}

async function portAvailable(port) { await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve)); }); }
async function click(text, tag = 'button') { await evaluate(`Array.from(document.querySelectorAll('${tag}')).find(el => el.textContent.trim() === ${JSON.stringify(text)}).click()`); }
async function checkCode(code, label) { await visit('/verify'); await until("!!document.querySelector('form [name=code]')"); await delay(250); await fill({code}); await submit(); await until("!!document.querySelector('#result-heading')"); assert.equal(await evaluate("document.querySelector('#result-heading').textContent"), label); }

try {
  await portAvailable(3210); await portAvailable(9224);
  await mkdir(artifacts, { recursive: true });
  const url = new URL(await databaseUrl());
  client = await connectDatabase();
  await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`); schemaCreated = true;
  await migrate(client, { schema });
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.FRONTEND_ORIGIN = webBase;
  process.env.NODE_ENV = 'test';
  process.env.SESSION_COOKIE_SECURE = 'false';
  const seeded = spawnSync(process.execPath, ['backend/scripts/create-admin.mjs'], {
    env: { ...process.env, AGRO_ADMIN_NAME: 'Browser Administrator', AGRO_ADMIN_EMAIL: 'browser-admin@example.invalid', AGRO_ADMIN_STAFF_NUMBER: 'BROWSER-ADMIN', AGRO_ADMIN_PASSWORD: password },
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(seeded.status, 0, seeded.stderr);
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../backend/dist/app.module.js');
  const { configureApp } = require('../backend/dist/config/configure-app.js');
  app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  configureApp(app); await app.listen(0, '127.0.0.1');
  const apiBase = await app.getUrl();
  web = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3210'], {
    cwd: path.resolve('frontend'), env: { ...process.env, NODE_ENV: 'production', API_INTERNAL_URL: `${apiBase}/api` }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  web.stdout.on('data', chunk => { webOutput += chunk; }); web.stderr.on('data', chunk => { webOutput += chunk; });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`${webBase}/login`)).ok) break; } catch { /* Starting. */ }
    if (web.exitCode !== null) throw new Error(webOutput);
    await delay(500);
  }
  browser = spawn(process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9224',
    `--user-data-dir=${path.join(artifacts, 'milestone-edge-profile')}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let target;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { target = (await fetch('http://127.0.0.1:9224/json/list').then(r => r.json())).find(item => item.type === 'page'); if (target) break; } catch { /* Starting. */ }
    await delay(300);
  }
  assert.ok(target);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
  await client.query("SELECT set_config('search_path', $1, false)", [schemaIdentifier(schema)]);
  await seedDemo(client); await seedDemo(client);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM products')).rows[0].n, 2);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_codes')).rows[0].n, 5);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  for (const route of ['/admin/products','/admin/verifications','/farmer/history']) { await visit(route); await until("location.pathname === '/login' && !!document.querySelector('form [name=identifier]')"); }
  await delay(500); await fill({identifier:'browser-admin@example.invalid', password}); await submit();
  await until("location.pathname === '/admin' && document.body.textContent.includes('Browser Administrator')");
  await click('Manage products','a'); await until("location.pathname === '/admin/products' && !!document.querySelector('tbody')");
  await click('Add product'); await until("!!document.querySelector('form [name=manufacturer]')");
  await fill({name:'Assessment maize seed',manufacturer:'Assessment supplier only',registrationNo:'DEMO-ASSESSMENT',description:'Demonstration data for the end-to-end milestone.'}); await submit();
  await until("document.body.textContent.includes('Product created.') && document.body.textContent.includes('No codes found')");
  await click('New code'); await until("!!document.querySelector('form [name=codeValue]')");
  await fill({codeValue:'ASSESSMENT-SEED-001',batchNumber:'ASSESSMENT-BATCH',manufactureDate:'2020-01-01',expiryDate:'2099-01-01'});
  await evaluate("document.querySelector('.code-form').requestSubmit()");
  await until("document.body.textContent.includes('Verification code added.') && !!document.querySelector('tbody')");
  const createdProduct = (await client.query("SELECT id FROM products WHERE name='Assessment maize seed'")).rows[0].id;
  await visit('/admin'); await until("!!document.querySelector('.account-heading')"); await logout();
  console.log('Administrator product and code creation passed. Checking guest outcomes?');
  await checkCode('assessment-seed-001','Record matched');
  assert.equal(await evaluate("document.body.textContent.includes('Assessment maize seed')"),true);
  assert.equal(await evaluate("document.body.textContent.includes('ASSESSMENT-BATCH')"),true);
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/farmer/history\"]')"),false);
  await screenshot('milestone-verification-desktop.png');
  for (const [code,label] of [['DEMO-SEED-EXPIRED','Expired'],['DEMO-FERT-FLAGGED','Flagged for review'],['DEMO-FERT-INACTIVE','Inactive'],['DEMO-UNKNOWN','Code not found'],['HAS SPACE','Invalid code']]) await checkCode(code,label);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await checkCode('DEMO-SEED-OK','Record matched');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('milestone-verification-mobile.png');
  await visit('/register'); await until("!!document.querySelector('form [name=fullName]')"); await delay(300);
  await fill({fullName:'Milestone Farmer',email:'milestone-farmer@example.invalid',phone:'0712345678',county:'Nakuru',password,confirmPassword:password}); await submit();
  await until("location.pathname === '/farmer' && document.body.textContent.includes('Milestone Farmer')");
  await checkCode('ASSESSMENT-SEED-001','Record matched');
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/farmer/history\"]')"),true);
  await click('View my history','a');
  await until("location.pathname === '/farmer/history' && !!document.querySelector('.history-record')");
  await evaluate("document.querySelector('summary').click()"); await screenshot('milestone-farmer-history-mobile.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  const personal = await evaluate("fetch('/api/verifications/mine').then(r=>r.json())");
  assert.equal(personal.total,1); assert.equal(personal.items[0].product.name,'Assessment maize seed');
  await visit('/admin/verifications'); await until("location.pathname === '/farmer'");
  assert.equal(await evaluate("fetch('/api/verifications').then(r=>r.status)"),403);
  await logout();
  await visit('/register'); await until("!!document.querySelector('form [name=fullName]')"); await delay(300);
  await fill({fullName:'Second Milestone Farmer',email:'second-farmer@example.invalid',password,confirmPassword:password}); await submit();
  await until("location.pathname === '/farmer' && document.body.textContent.includes('Second Milestone Farmer')");
  await visit('/farmer/history'); await until("document.body.textContent.includes('No verification records found')");
  assert.equal((await evaluate("fetch('/api/verifications/mine').then(r=>r.json())")).total,0);
  await visit('/farmer'); await until("!!document.querySelector('.account-heading')"); await logout();
  await fill({identifier:'browser-admin@example.invalid',password}); await submit(); await until("location.pathname === '/admin'");
  console.log('Guest outcomes and isolated farmer history passed. Checking administrator history?');
  await visit('/admin/verifications'); await until("!!document.querySelector('.history-record')");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await fill({actor:'farmer',result:'verified'}); await submit(); await until("document.querySelectorAll('.history-record').length === 1 && !document.body.textContent.includes('Loading verification history')");
  assert.equal(await evaluate("document.body.textContent.includes('Milestone Farmer')"),true);
  await evaluate("document.querySelector('summary').click()"); await screenshot('milestone-admin-history-desktop.png');
  await visit('/admin/products'); await until("!!document.querySelector('tbody')");
  await evaluate("document.querySelector('button[aria-label=\"Manage Assessment maize seed\"]').click()"); await until("!!document.querySelector('form [name=manufacturer]')");
  await fill({name:'Updated assessment maize seed',status:'inactive'}); await submit(); await until("document.body.textContent.includes('Product updated.')");
  await checkCode('ASSESSMENT-SEED-001','Inactive');
  assert.equal(await evaluate("document.body.textContent.includes('Updated assessment maize seed')"),true);
  const saved = (await client.query('SELECT product_snapshot,result FROM verification_records WHERE id=$1',[personal.items[0].id])).rows[0];
  assert.equal(saved.result,'verified'); assert.equal(saved.product_snapshot.name,'Assessment maize seed');
  assert.equal((await client.query('SELECT name FROM products WHERE id=$1',[createdProduct])).rows[0].name,'Updated assessment maize seed');
  await client.query("UPDATE auth_sessions SET created_at=CURRENT_TIMESTAMP-interval '2 days',expires_at=CURRENT_TIMESTAMP-interval '1 day' WHERE user_id=(SELECT id FROM users WHERE email='browser-admin@example.invalid')");
  await visit('/verify'); await until("!!document.querySelector('form [name=code]')"); await delay(250); await fill({code:'DEMO-SEED-OK'}); await submit();
  await until("!!document.querySelector('[role=alert]') && document.body.textContent.includes('Continue as guest')");
  await click('Continue as guest'); await until("document.body.textContent.includes('You are signed out.')");
  await submit(); await until("!!document.querySelector('#result-heading')");
  assert.equal(await evaluate("document.querySelector('#result-heading').textContent"),'Record matched');
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/farmer/history\"]')"),false);
  assert.equal((await command('Network.getCookies',{urls:[webBase]})).cookies.some(item=>item.name==='agro_session'),false);
  assert.equal(await evaluate("fetch('/api/verifications').then(r=>r.status)"),401);
  assert.deepEqual(exceptions,[]);
  console.log('Milestone browser checks passed: administrator create/update, all verification outcomes, guest checks, farmer signup/history isolation, administrator history, preserved snapshots, expired-session recovery and desktop/mobile layouts.');
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await command('Browser.close').catch(() => {}); socket.close(); } else browser?.kill();
  for (const request of pending.values()) clearTimeout(request.timeout);
  if (web && web.exitCode === null) { web.kill(); await delay(500); }
  await app?.close();
  if (schemaCreated) { assert.match(schema, /^agro_test_[a-f0-9]{32}$/); await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`); }
  await client?.end();
}
