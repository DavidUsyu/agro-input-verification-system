import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { connectDatabase, databaseUrl } from '../database/connection.mjs';
import { migrate, schemaIdentifier } from '../database/migration-runner.mjs';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3000';
const password = 'A sufficiently long test passphrase!';
const farmerInput = { fullName: 'Test Farmer', email: 'farmer@example.invalid', phone: '0712345678', county: 'Nakuru', password };
const schema = `agro_test_${randomUUID().replaceAll('-', '')}`;
const original = { ...process.env };
let client, app, base, farmerCookie, farmerId, adminCookie, registration;
let createdSchema = false;

async function request(action, { method = 'GET', body, cookie, requestOrigin = origin, contentType = 'application/json' } = {}) {
  const headers = {};
  if (requestOrigin !== null) headers.Origin = requestOrigin;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = contentType;
  return fetch(`${base}/api/auth/${action}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
function cookie(response) { return response.headers.get('set-cookie')?.split(';')[0]; }
function digest(value) { return createHash('sha256').update(value.split('=')[1]).digest('hex'); }
async function login(identifier = farmerInput.email, previous) {
  const response = await request('login', { method: 'POST', body: { identifier, password }, cookie: previous });
  assert.equal(response.status, 200);
  return { response, cookie: cookie(response) };
}

before(async () => {
  const url = new URL(await databaseUrl());
  client = await connectDatabase();
  await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`);
  createdSchema = true;
  await migrate(client, { schema });
  await client.query("SELECT set_config('search_path', $1, false)", [schemaIdentifier(schema)]);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = origin;
  process.env.SESSION_COOKIE_SECURE = 'false';
  process.env.SESSION_TTL_HOURS = '12';
  const admin = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/create-admin.mjs', import.meta.url))], {
    env: { ...process.env, AGRO_ADMIN_NAME: 'Test Administrator', AGRO_ADMIN_EMAIL: 'admin@example.invalid', AGRO_ADMIN_STAFF_NUMBER: 'TEST-ADMIN', AGRO_ADMIN_PASSWORD: password },
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(admin.status, 0, admin.stderr);
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module.js');
  const { configureApp } = require('../dist/config/configure-app.js');
  app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  registration = await request('register', { method: 'POST', body: farmerInput });
  assert.equal(registration.status, 201);
  farmerCookie = cookie(registration);
  farmerId = (await registration.clone().json()).user.id;
  adminCookie = (await login('admin@example.invalid')).cookie;
});

after(async () => {
  await app?.close();
  if (createdSchema) {
    assert.match(schema, /^agro_test_[a-f0-9]{32}$/);
    await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`);
  }
  await client?.end();
  for (const key of ['DATABASE_URL', 'NODE_ENV', 'FRONTEND_ORIGIN', 'SESSION_COOKIE_SECURE', 'SESSION_TTL_HOURS']) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});

test('registration creates a farmer profile and an HttpOnly session without leaking secrets', async () => {
  const result = await registration.json();
  assert.deepEqual(result.user, { id: farmerId, fullName: farmerInput.fullName, email: farmerInput.email, phone: '+254712345678', county: 'Nakuru', role: 'farmer' });
  assert.equal(typeof farmerId, 'string');
  const header = registration.headers.get('set-cookie');
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Lax/); assert.match(header, /Path=\//); assert.match(header, /Max-Age=43200/);
  assert.equal(registration.headers.get('cache-control'), 'no-store');
  const saved = (await client.query('SELECT u.password_hash, f.user_id FROM users u JOIN farmers f ON f.user_id=u.id WHERE u.id=$1', [farmerId])).rows[0];
  assert.notEqual(saved.password_hash, password);
  assert.match(saved.password_hash, /^scrypt\$65536\$8\$2\$/);
  const session = (await client.query('SELECT token_hash FROM auth_sessions WHERE user_id=$1', [farmerId])).rows[0];
  assert.equal(session.token_hash, digest(farmerCookie));
  assert.notEqual(session.token_hash, farmerCookie.split('=')[1]);
});

test('anonymous, malformed and forged sessions are rejected', async () => {
  for (const value of [undefined, 'agro_session=bad', `agro_session=${'a'.repeat(64)}`]) {
    assert.equal((await request('me', { cookie: value })).status, 401);
  }
});

test('current-user responses contain only the signed-in user and no password data', async () => {
  const result = await request('me', { cookie: farmerCookie });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const data = await result.json();
  assert.equal(data.user.id, farmerId);
  assert.equal(Object.hasOwn(data.user, 'password_hash'), false);
  assert.equal(Object.hasOwn(data.user, 'farmer_profile_id'), false);
});

test('farmer and administrator routes enforce both roles on the backend', async () => {
  assert.equal((await request('farmer', { cookie: farmerCookie })).status, 200);
  assert.equal((await request('administrator', { cookie: farmerCookie })).status, 403);
  assert.equal((await request('administrator', { cookie: adminCookie })).status, 200);
  assert.equal((await request('farmer', { cookie: adminCookie })).status, 403);
});

test('public registration rejects administrator roles and other privileged fields', async () => {
  const result = await request('register', { method: 'POST', body: { ...farmerInput, role: 'administrator' } });
  assert.equal(result.status, 400);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM administrators')).rows[0].count, 1);
});

test('missing contact details and weak passwords are rejected', async () => {
  assert.equal((await request('register', { method: 'POST', body: { fullName: 'Test', password } })).status, 400);
  assert.equal((await request('register', { method: 'POST', body: { ...farmerInput, password: 'short' } })).status, 400);
});

test('duplicate email and normalized phone registrations roll back completely', async () => {
  assert.equal((await request('register', { method: 'POST', body: { ...farmerInput, email: 'FARMER@EXAMPLE.INVALID', phone: '' } })).status, 409);
  assert.equal((await request('register', { method: 'POST', body: { ...farmerInput, email: 'other@example.invalid', phone: '+254712345678' } })).status, 409);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM users WHERE role='farmer'")).rows[0].count, 1);
});

test('login accepts case-insensitive email and local or international phone formats', async () => {
  assert.ok((await login('FARMER@EXAMPLE.INVALID')).cookie);
  assert.ok((await login('0712 345 678')).cookie);
  assert.ok((await login('+254712345678')).cookie);
});

test('incorrect passwords and unknown accounts return the same generic error', async () => {
  const wrong = await request('login', { method: 'POST', body: { identifier: farmerInput.email, password: 'Incorrect long password!' } });
  const unknown = await request('login', { method: 'POST', body: { identifier: 'nobody@example.invalid', password } });
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
  assert.equal((await wrong.json()).message, (await unknown.json()).message);
});

test('login rotates and invalidates the session presented by the browser', async () => {
  const previous = farmerCookie;
  farmerCookie = (await login(farmerInput.email, previous)).cookie;
  assert.notEqual(previous, farmerCookie);
  assert.equal((await request('me', { cookie: previous })).status, 401);
  assert.equal((await request('me', { cookie: farmerCookie })).status, 200);
});

test('cross-site and missing-origin mutations cannot sign in or sign out a user', async () => {
  for (const requestOrigin of ['https://untrusted.example', null]) {
    assert.equal((await request('login', { method: 'POST', requestOrigin, body: { identifier: farmerInput.email, password } })).status, 403);
    assert.equal((await request('logout', { method: 'POST', requestOrigin, cookie: farmerCookie })).status, 403);
  }
  assert.equal((await request('me', { cookie: farmerCookie })).status, 200);
});

test('logout revokes the database session, clears the cookie and is repeatable', async () => {
  const session = (await login()).cookie;
  const response = await request('logout', { method: 'POST', cookie: session });
  assert.equal(response.status, 204); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('me', { cookie: session })).status, 401);
  assert.equal((await request('logout', { method: 'POST', cookie: session })).status, 204);
});

test('expired sessions are rejected by the backend', async () => {
  const session = (await login()).cookie;
  await client.query("UPDATE auth_sessions SET created_at=CURRENT_TIMESTAMP-interval '2 days', expires_at=CURRENT_TIMESTAMP-interval '1 day' WHERE token_hash=$1", [digest(session)]);
  assert.equal((await request('me', { cookie: session })).status, 401);
});

test('suspended accounts cannot log in or use an existing session', async () => {
  await client.query("UPDATE users SET status='suspended' WHERE id=$1", [farmerId]);
  try {
    assert.equal((await request('me', { cookie: farmerCookie })).status, 401);
    assert.equal((await request('login', { method: 'POST', body: { identifier: farmerInput.email, password } })).status, 401);
  } finally { await client.query("UPDATE users SET status='active' WHERE id=$1", [farmerId]); }
});

test('secure-cookie mode sets Secure and configuration rejects insecure production', async () => {
  const { ConfigService } = require('@nestjs/config');
  const config = app.get(ConfigService);
  config.set('SESSION_COOKIE_SECURE', true);
  try { assert.match((await login()).response.headers.get('set-cookie'), /; Secure/); }
  finally { config.set('SESSION_COOKIE_SECURE', false); }
  const { validateEnvironment } = require('../dist/config/environment.js');
  assert.throws(() => validateEnvironment({ DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: 'production', FRONTEND_ORIGIN: origin }), /requires HTTPS/);
});

test('oversized JSON is rejected before password processing', async () => {
  assert.equal((await request('login', { method: 'POST', body: { identifier: 'x'.repeat(9000), password } })).status, 413);
});

test('repeated sign-in attempts are rate limited', async () => {
  let limited;
  for (let attempt = 0; attempt < 21; attempt++) {
    const response = await request('login', { method: 'POST', body: {} });
    if (response.status === 429) { limited = response; break; }
    assert.equal(response.status, 400);
  }
  assert.ok(limited); assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
