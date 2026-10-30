import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { connectDatabase, databaseUrl } from '../database/connection.mjs';
import { migrate, schemaIdentifier } from '../database/migration-runner.mjs';

const require = createRequire(import.meta.url);
const schema = `agro_test_${randomUUID().replaceAll('-', '')}`;
const origin = 'http://localhost:3000';
const original = { ...process.env };
const productInput = { name: 'Demo maize seed', category: 'seed', manufacturer: 'Test supplier', registrationNo: 'TEST-REF', description: 'Demonstration record only.', status: 'active' };
const codeInput = { batchNumber: 'BATCH-1', manufactureDate: '2026-03-08', expiryDate: '2028-03-08', status: 'active', distributionCounty: 'Nakuru' };
let client, app, base, admin, farmer, product, code, schemaCreated = false;

async function account(role) {
  const token = randomBytes(32).toString('hex');
  await client.query('BEGIN');
  try {
    const { rows: [user] } = await client.query(`INSERT INTO users (full_name,email,password_hash,role) VALUES ($1,$2,'test-session-fixture-only',$3) RETURNING id`, [`Test ${role}`, `${role}@example.invalid`, role]);
    if (role === 'administrator') await client.query("INSERT INTO administrators (user_id,staff_number) VALUES ($1,'PRODUCT-TEST')", [user.id]);
    else await client.query('INSERT INTO farmers (user_id) VALUES ($1)', [user.id]);
    await client.query("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,CURRENT_TIMESTAMP+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), user.id]);
    await client.query('COMMIT');
    return { id: user.id, cookie: `agro_session=${token}` };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

async function request(path = '', { method = 'GET', body, cookie = admin?.cookie, requestOrigin = origin, contentType = 'application/json' } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (requestOrigin !== null) headers.Origin = requestOrigin;
  if (body !== undefined) headers['Content-Type'] = contentType;
  return fetch(`${base}/api/products${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

before(async () => {
  const url = new URL(await databaseUrl());
  client = await connectDatabase();
  await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`); schemaCreated = true;
  await migrate(client, { schema });
  await client.query("SELECT set_config('search_path',$1,false)", [schemaIdentifier(schema)]);
  url.searchParams.set('options', `-c search_path=${schema}`);
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', FRONTEND_ORIGIN: origin, SESSION_COOKIE_SECURE: 'false' });
  admin = await account('administrator'); farmer = await account('farmer');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module.js');
  const { configureApp } = require('../dist/config/configure-app.js');
  app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  configureApp(app); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});

after(async () => {
  await app?.close();
  if (schemaCreated) {
    assert.match(schema, /^agro_test_[a-f0-9]{32}$/);
    await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`);
  }
  await client?.end();
  for (const key of ['DATABASE_URL', 'NODE_ENV', 'FRONTEND_ORIGIN', 'SESSION_COOKIE_SECURE']) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});

test('all product and code endpoints require an active administrator session', async () => {
  for (const [path, method, body] of [['','GET'], ['', 'POST', productInput], ['/1','GET'], ['/1','PUT',productInput], ['/1/codes','GET'], ['/1/codes','POST',codeInput], ['/1/codes/bulk','POST',{...codeInput,quantity:3}], ['/1/codes/1','PUT',{}]]) {
    assert.equal((await request(path, { method, body, cookie: null })).status, 401);
    assert.equal((await request(path, { method, body, cookie: farmer.cookie })).status, 403);
  }
});

test('administrator creates a product with server-owned attribution and reads it back', async () => {
  const response = await request('', { method: 'POST', body: productInput });
  assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
  product = await response.json();
  assert.equal(product.createdBy, admin.id); assert.equal(product.codeCount, 0);
  assert.equal(typeof product.id, 'string');
  assert.deepEqual(await (await request(`/${product.id}`)).json(), product);
});

test('unsupported fields, invalid categories, statuses and oversized fields are rejected', async () => {
  for (const changes of [{ createdBy: farmer.id }, { category: 'pesticide' }, { status: 'verified' }, { name: ' ' }, { manufacturer: 12 }, { name: 'x'.repeat(161) }, { description: 'x'.repeat(2001) }, { registrationNo: 'x'.repeat(81) }]) {
    assert.equal((await request('', { method: 'POST', body: { ...productInput, ...changes } })).status, 400);
  }
  for (const body of [[], null, 'product']) assert.equal((await request('', { method: 'POST', body })).status, 400);
  assert.equal((await request('', { method: 'POST', body: { ...productInput, description: 'x'.repeat(9000) } })).status, 413);
});

test('mutations require the exact application origin and JSON', async () => {
  for (const requestOrigin of [null, 'https://untrusted.example']) {
    assert.equal((await request('', { method: 'POST', body: productInput, requestOrigin })).status, 403);
    assert.equal((await request(`/${product.id}`, { method: 'PUT', body: productInput, requestOrigin })).status, 403);
    assert.equal((await request(`/${product.id}/codes`, { method: 'POST', body: codeInput, requestOrigin })).status, 403);
    assert.equal((await request(`/${product.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, quantity: 3 }, requestOrigin })).status, 403);
  }
  assert.equal((await request('', { method: 'POST', body: productInput, contentType: 'text/plain' })).status, 415);
});

test('products can be edited and inactivated without deleting their attribution', async () => {
  const response = await request(`/${product.id}`, { method: 'PUT', body: { ...productInput, status: 'inactive', description: 'Updated\nsecond line', registrationNo: '' } });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.status, 'inactive'); assert.equal(updated.registrationNo, null);
  assert.equal(updated.createdBy, product.createdBy); assert.equal(updated.createdAt, product.createdAt);
  assert.equal((await request(`/${product.id}`, { method: 'DELETE' })).status, 404);
});

test('code creation generates a package code and preserves calendar dates and county', async () => {
  const response = await request(`/${product.id}/codes`, { method: 'POST', body: codeInput });
  assert.equal(response.status, 201); code = await response.json();
  assert.match(code.codeValue, /^AGV-(?:[0-9A-Z]{4}-){4}[0-9A-Z]{4}$/); assert.equal(code.manufactureDate, '2026-03-08'); assert.equal(code.expiryDate, '2028-03-08');
  assert.equal(code.distributionCounty,'Nakuru');
  assert.equal(code.productId, product.id);
  assert.equal((await (await request(`/${product.id}`)).json()).codeCount, 1);
});

test('administrators cannot choose codes and concurrent generation creates distinct package codes', async () => {
  const other = await (await request('', { method: 'POST', body: { ...productInput, name: 'Other product' } })).json();
  assert.equal((await request(`/${other.id}/codes`, { method: 'POST', body: { ...codeInput, codeValue: 'CHOSEN-CODE' } })).status, 400);
  const responses = await Promise.all([1,2].map(() => request(`/${other.id}/codes`, { method: 'POST', body: codeInput })));
  assert.deepEqual(responses.map((response) => response.status), [201,201]);
  const generated = await Promise.all(responses.map(response=>response.json()));
  assert.notEqual(generated[0].codeValue,generated[1].codeValue);
});

test('a generated collision is retried and repeated collisions fail without inserting', async () => {
  const generator = require('../dist/products/code-generator.js'); const original = generator.generateProductCode;
  let attempts = 0;
  generator.generateProductCode = () => ++attempts === 1 ? code.codeValue : original();
  try { assert.equal((await request(`/${product.id}/codes`,{method:'POST',body:codeInput})).status,201); assert.equal(attempts,2); }
  finally { generator.generateProductCode = original; }
  generator.generateProductCode = () => code.codeValue;
  try { assert.equal((await request(`/${product.id}/codes`,{method:'POST',body:codeInput})).status,503); }
  finally { generator.generateProductCode = original; }
});

test('bulk generation saves 1000 distinct packages with shared batch metadata and paginated access', async () => {
  const other = await (await request('', { method: 'POST', body: { ...productInput, name: 'Bulk packages' } })).json();
  const response = await request(`/${other.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, quantity: 1000 } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.total, 1000); assert.equal(result.items.length, 1000);
  assert.equal(new Set(result.items.map(item => item.codeValue)).size, 1000);
  for (const item of result.items) {
    assert.match(item.codeValue, /^AGV-(?:[0-9A-Z]{4}-){4}[0-9A-Z]{4}$/);
    assert.equal(item.productId, other.id);
    for (const field of ['batchNumber', 'manufactureDate', 'expiryDate', 'status', 'distributionCounty']) assert.equal(item[field], codeInput[field]);
  }
  assert.equal((await (await request(`/${other.id}`)).json()).codeCount, 1000);
  const lastPage = await (await request(`/${other.id}/codes?q=BATCH-1&page=50`)).json();
  assert.equal(lastPage.total, 1000); assert.equal(lastPage.items.length, 20);
  const one = await request(`/${other.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, quantity: 1 } });
  assert.equal(one.status, 201); assert.equal((await one.json()).items.length, 1);
  const edited = await request(`/${other.id}/codes/${result.items[0].id}`, { method: 'PUT', body: { ...codeInput, status: 'suspicious' } });
  assert.equal(edited.status, 200);
  const unchanged = await (await request(`/${other.id}/codes?q=${encodeURIComponent(result.items[1].codeValue)}`)).json();
  assert.equal(unchanged.items[0].status, 'active');
  assert.equal(unchanged.items[0].batchNumber, codeInput.batchNumber);
});

test('bulk quantity and metadata validation reject bad requests without saving packages', async () => {
  const beforeCount = (await client.query('SELECT count(*)::int AS n FROM product_codes')).rows[0].n;
  for (const quantity of [undefined, null, '', '3', true, 0, -1, 1.5, 1001, 1e20]) {
    assert.equal((await request(`/${product.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, quantity } })).status, 400);
  }
  for (const changes of [{ codeValue: 'PICKED' }, { distributionCounty: null }, { expiryDate: '2020-01-01' }, { batchNumber: '' }]) {
    assert.equal((await request(`/${product.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, quantity: 3, ...changes } })).status, 400);
  }
  assert.equal((await request(`/${product.id}/codes/${code.id}`, { method: 'PUT', body: { ...codeInput, quantity: 3 } })).status, 400);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_codes')).rows[0].n, beforeCount);
  assert.equal((await request('/999999/codes/bulk', { method: 'POST', body: { ...codeInput, quantity: 3 } })).status, 404);
});

test('bulk collisions retry only missing codes and failures roll back the entire request', async () => {
  const generator = require('../dist/products/code-generator.js'); const originalGenerator = generator.generateProductCode;
  const batchNumber = 'BULK-COLLISION';
  let attempts = 0;
  generator.generateProductCode = () => ++attempts === 1 ? code.codeValue : originalGenerator();
  try {
    const response = await request(`/${product.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, batchNumber, quantity: 3 } });
    assert.equal(response.status, 201); assert.equal((await response.json()).items.length, 3); assert.equal(attempts, 4);
  } finally { generator.generateProductCode = originalGenerator; }
  const countBefore = (await client.query('SELECT count(*)::int AS n FROM product_codes')).rows[0].n;
  attempts = 0;
  generator.generateProductCode = () => ++attempts === 1 ? originalGenerator() : code.codeValue;
  try {
    const response = await request(`/${product.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, batchNumber: 'ROLLBACK-BATCH', quantity: 3 } });
    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /No codes were saved/);
  } finally { generator.generateProductCode = originalGenerator; }
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_codes')).rows[0].n, countBefore);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM product_codes WHERE batch_number='ROLLBACK-BATCH'")).rows[0].n, 0);
});

test('concurrent bulk requests for the same batch retain distinct package codes', async () => {
  const responses = await Promise.all([1, 2].map(() => request(`/${product.id}/codes/bulk`, { method: 'POST', body: { ...codeInput, batchNumber: 'CONCURRENT-BULK', quantity: 25 } })));
  assert.deepEqual(responses.map(response => response.status), [201, 201]);
  const results = await Promise.all(responses.map(response => response.json()));
  const codes = results.flatMap(result => result.items.map(item => item.codeValue));
  assert.equal(codes.length, 50); assert.equal(new Set(codes).size, 50);
});

test('invalid code values and impossible or reversed dates fail validation', async () => {
  for (const changes of [{ codeValue: 'has spaces' }, { distributionCounty: '' }, { distributionCounty: 'Unknown' }, { distributionCounty: null }, { batchNumber: '' }, { expiryDate: '2027-02-29' }, { expiryDate: '2026-13-01' }, { expiryDate: '2026-2-01' }, { expiryDate: '2020-01-01' }, { expiryDate: null }, { manufactureDate: '2026-04-31' }, { status: 'expired' }]) {
    assert.equal((await request(`/${product.id}/codes`, { method: 'POST', body: { ...codeInput, ...changes } })).status, 400);
  }
  const leap = await request(`/${product.id}/codes`, { method: 'POST', body: { ...codeInput, manufactureDate: '', expiryDate: '2028-02-29' } });
  assert.equal(leap.status, 201); assert.equal((await leap.json()).manufactureDate, null);
});

test('code edits stay within their product and cannot replace the code value', async () => {
  const edit = codeInput;
  assert.equal((await request(`/${product.id}/codes/${code.id}`, { method: 'PUT', body: { ...edit, codeValue: 'REPLACEMENT' } })).status, 400);
  assert.equal((await request(`/999999/codes/${code.id}`, { method: 'PUT', body: edit })).status, 404);
  const response = await request(`/${product.id}/codes/${code.id}`, { method: 'PUT', body: { ...edit, batchNumber: 'CORRECTED-BATCH', status: 'suspicious' } });
  assert.equal(response.status, 200);
  const updated = await response.json(); assert.equal(updated.codeValue, code.codeValue); assert.equal(updated.status, 'suspicious');
});

test('status and metadata edits preserve saved verification history', async () => {
  const record = (await client.query("INSERT INTO verification_records (farmer_id,product_code_id,entered_code,result) VALUES ($1,$2,$3,'verified') RETURNING *", [farmer.id, code.id, code.codeValue])).rows[0];
  assert.equal((await request(`/${product.id}/codes/${code.id}`, { method: 'PUT', body: { ...codeInput, batchNumber: 'CORRECTED-BATCH', status: 'inactive', distributionCounty: 'Nairobi' } })).status, 200);
  assert.deepEqual((await client.query('SELECT * FROM verification_records WHERE id=$1', [record.id])).rows[0], record);
});

test('product search, category/status filters and pagination give stable bounded results', async () => {
  await client.query(`INSERT INTO products (name,category,manufacturer,status,created_by) SELECT 'Paging ' || n, 'fertilizer', 'Page supplier', 'active', $1 FROM generate_series(1,23) n`, [admin.id]);
  const first = await (await request('?q=Page%20supplier&category=fertilizer&status=active')).json();
  const second = await (await request('?q=Page%20supplier&category=fertilizer&status=active&page=2')).json();
  assert.equal(first.total, 23); assert.equal(first.items.length, 20); assert.equal(second.items.length, 3);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 23);
  assert.equal((await (await request('?q=DEMO%20MAIZE&status=inactive')).json()).total, 1);
  for (const q of ['%', "' OR 1=1 --", '_']) assert.equal((await (await request(`?q=${encodeURIComponent(q)}`)).json()).total, 0);
  for (const query of ['?page=0', '?page=1.5', '?page=9999999', '?page=1&page=2', '?category=pesticide', '?status=unknown', '?sort=secret']) assert.equal((await request(query)).status, 400);
});

test('code search and status filters return only codes from the selected product', async () => {
  const response = await request(`/${product.id}/codes?q=CORRECTED&status=inactive`);
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.total, 1); assert.equal(result.items[0].id, code.id);
  assert.equal((await (await request(`/${product.id}/codes?q=RACE`)).json()).total, 0);
});

test('malformed IDs and missing products return controlled errors', async () => {
  for (const id of ['0','-1','invalid','9223372036854775808']) assert.equal((await request(`/${id}`)).status, 400);
  assert.equal((await request('/999999')).status, 404);
  assert.equal((await request('/999999/codes')).status, 404);
  assert.equal((await request('/999999', { method: 'PUT', body: productInput })).status, 404);
  assert.equal((await request('/999999/codes', { method: 'POST', body: codeInput })).status, 404);
});

test('suspended administrators immediately lose product access', async () => {
  await client.query("UPDATE users SET status='suspended' WHERE id=$1", [admin.id]);
  try { assert.equal((await request()).status, 401); assert.equal((await request('', { method: 'POST', body: productInput })).status, 401); }
  finally { await client.query("UPDATE users SET status='active' WHERE id=$1", [admin.id]); }
});
