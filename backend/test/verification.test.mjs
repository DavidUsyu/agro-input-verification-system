import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { connectDatabase, databaseUrl } from '../database/connection.mjs';
import { loadMigrations, migrate, schemaIdentifier } from '../database/migration-runner.mjs';

const require = createRequire(import.meta.url);
const schema = `agro_test_${randomUUID().replaceAll('-', '')}`;
const origin = 'http://localhost:3000';
const original = { ...process.env };
const productInput = { name: 'Demo verification seed', category: 'seed', manufacturer: 'Demo supplier', registrationNo: 'DEMO-REF', description: 'Isolated test data only.', status: 'active' };
let client, app, base, admin, farmer, otherFarmer, product, verified, legacyId, legacyPackageId, schemaCreated = false;
const generatedCodes = new Map();
const nakuruLocation = () => ({latitude:-0.3031,longitude:36.0800,accuracy:30,timestamp:Date.now()});
const nairobiLocation = () => ({latitude:-1.286389,longitude:36.817223,accuracy:30,timestamp:Date.now()});

async function account(role, label) {
  const token = randomBytes(32).toString('hex');
  await client.query('BEGIN');
  try {
    const user = (await client.query(`INSERT INTO users (full_name,email,password_hash,role) VALUES ($1,$2,'test-session-fixture-only',$3) RETURNING id`, [label, `${label}@example.invalid`, role])).rows[0];
    if (role === 'administrator') await client.query('INSERT INTO administrators (user_id,staff_number) VALUES ($1,$2)', [user.id, label]);
    else await client.query("INSERT INTO farmers (user_id,county) VALUES ($1,'Nairobi')", [user.id]);
    await client.query("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,CURRENT_TIMESTAMP+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), user.id]);
    await client.query('COMMIT'); return { id: user.id, cookie: `agro_session=${token}` };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
async function request(path = '/verifications', { method = 'GET', body, cookie, requestOrigin = origin, contentType = 'application/json' } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (requestOrigin !== null) headers.Origin = requestOrigin;
  if (body !== undefined) headers['Content-Type'] = contentType;
  return fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function check(code, cookie, location = nakuruLocation()) {
  const generated = generatedCodes.get(code.trim().toUpperCase());
  if (generated) code = code === code.toLowerCase() ? generated.toLowerCase() : generated;
  const response = await request('/verifications', { method: 'POST', body: { code, location }, cookie });
  assert.equal(response.status, 201, await response.clone().text()); return response.json();
}
async function addCode(value, changes = {}) {
  const response = await request(`/products/${product.id}/codes`, { method: 'POST', cookie: admin.cookie, body: { batchNumber: 'DEMO-BATCH', manufactureDate: '2020-01-01', expiryDate: '2099-01-01', status: 'active', distributionCounty:'Nakuru', ...changes } });
  assert.equal(response.status, 201); const created=await response.json(); generatedCodes.set(value,created.codeValue); return created;
}
async function total() { return (await client.query('SELECT count(*)::int AS total FROM verification_records')).rows[0].total; }

before(async () => {
  const url = new URL(await databaseUrl()); client = await connectDatabase();
  await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`); schemaCreated = true;
  const migrations = await loadMigrations();
  await migrate(client, { schema, migrations: migrations.slice(0,2) });
  await client.query("SELECT set_config('search_path',$1,false)", [schemaIdentifier(schema)]);
  admin = await account('administrator', 'verification-admin');
  farmer = await account('farmer', 'verification-farmer'); otherFarmer = await account('farmer', 'other-farmer');
  legacyId = (await client.query("INSERT INTO verification_records (farmer_id,entered_code,result) VALUES ($1,'LEGACY-UNKNOWN','unregistered') RETURNING id", [farmer.id])).rows[0].id;
  const oldProduct=(await client.query("INSERT INTO products (name,category,manufacturer,created_by) VALUES ('Legacy seed','seed','Legacy supplier',$1) RETURNING id",[admin.id])).rows[0].id;
  legacyPackageId=(await client.query("INSERT INTO product_codes (product_id,code_value,batch_number,expiry_date) VALUES ($1,'LEGACY-PRINTED','OLD-BATCH','2099-01-01') RETURNING id",[oldProduct])).rows[0].id;
  await client.query("INSERT INTO verification_records (product_code_id,entered_code,result) VALUES ($1,'LEGACY-PRINTED','verified')",[legacyPackageId]);
  await migrate(client, { schema });
  url.searchParams.set('options', `-c search_path=${schema}`);
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', FRONTEND_ORIGIN: origin, SESSION_COOKIE_SECURE: 'false' });
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../dist/app.module.js');
  const { configureApp } = require('../dist/config/configure-app.js');
  app = await NestFactory.create(AppModule, { bodyParser: false, logger: false }); configureApp(app);
  await app.listen(0,'127.0.0.1'); base = await app.getUrl();
  const response = await request('/products', { method: 'POST', cookie: admin.cookie, body: productInput });
  assert.equal(response.status, 201); product = await response.json();
  await addCode('DEMO-MATCH');
});

after(async () => {
  await app?.close();
  if (schemaCreated) { assert.match(schema,/^agro_test_[a-f0-9]{32}$/); await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`); }
  await client?.end();
  for (const key of ['DATABASE_URL','NODE_ENV','FRONTEND_ORIGIN','SESSION_COOKIE_SECURE']) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});

test('migration preserves legacy outcomes without inventing snapshots', async () => {
  const saved = (await client.query('SELECT * FROM verification_records WHERE id=$1', [legacyId])).rows[0];
  assert.equal(saved.result,'unregistered'); assert.equal(saved.reason,'legacy'); assert.equal(saved.product_snapshot,null); assert.equal(saved.actor_role,'farmer');
  const oldCode=(await client.query('SELECT code_value,distribution_county FROM product_codes WHERE id=$1',[legacyPackageId])).rows[0];
  assert.equal(oldCode.code_value,'LEGACY-PRINTED'); assert.equal(oldCode.distribution_county,null);
  const oldCheck=(await client.query("SELECT result,product_snapshot,location_status FROM verification_records WHERE entered_code='LEGACY-PRINTED'")).rows[0];
  assert.equal(oldCheck.result,'verified'); assert.equal(oldCheck.product_snapshot,null); assert.equal(oldCheck.location_status,'not_checked');
});
test('guest verification matches case-insensitive codes and persists public details without account data', async () => {
  const before = await total(); const result = await check('  demo-match  ');
  assert.equal(result.result,'verified'); assert.equal(result.reason,'matched'); assert.equal(result.savedToAccount,false);
  assert.equal(result.product.name,productInput.name); assert.equal(result.product.expiryDate,'2099-01-01');
  assert.equal(result.enteredCode,generatedCodes.get('DEMO-MATCH').toLowerCase()); assert.equal(await total(),before+1);
  assert.equal(result.product.createdBy,undefined); assert.equal(result.farmerId,undefined);
  const saved = (await client.query('SELECT * FROM verification_records WHERE id=$1',[result.id])).rows[0];
  assert.equal(saved.farmer_id,null); assert.equal(saved.actor_role,'guest'); assert.equal(saved.channel,'web');
  assert.deepEqual(saved.product_snapshot,result.product);
});
test('farmer checks attach the account and current device county, not its home county', async () => {
  verified = await check('DEMO-MATCH',farmer.cookie);
  assert.equal(verified.savedToAccount,true);
  const saved = (await client.query('SELECT * FROM verification_records WHERE id=$1',[verified.id])).rows[0];
  assert.equal(saved.farmer_id,farmer.id); assert.equal(saved.county,'Nakuru'); assert.equal(saved.actor_role,'farmer');
  assert.equal((await request('/verifications',{method:'POST',cookie:farmer.cookie,body:{code:'DEMO-MATCH',farmerId:otherFarmer.id}})).status,400);
  assert.equal((await request('/verifications',{method:'POST',body:{code:'DEMO-MATCH',result:'verified'}})).status,400);
});
test('administrator checks are stored as administrator checks without a farmer relationship', async () => {
  const result = await check('DEMO-MATCH',admin.cookie);
  const saved = (await client.query('SELECT * FROM verification_records WHERE id=$1',[result.id])).rows[0];
  assert.equal(saved.farmer_id,null); assert.equal(saved.actor_role,'administrator'); assert.equal(result.savedToAccount,false);
});
test('unknown and malformed bounded codes produce distinct saved outcomes', async () => {
  const unknown = await check('UNKNOWN-001'); assert.equal(unknown.result,'unregistered'); assert.equal(unknown.product,null);
  for (const value of ['', 'HAS SPACE', '<script>']) {
    const result = await check(value); assert.equal(result.result,'invalid'); assert.equal(result.product,null);
    assert.equal((await client.query('SELECT product_code_id FROM verification_records WHERE id=$1',[result.id])).rows[0].product_code_id,null);
  }
  const before = await total();
  for (const body of [{code:1},{code:null},{code:'x'.repeat(81)},{code:'A\nB'}]) assert.equal((await request('/verifications',{method:'POST',body})).status,400);
  assert.equal(await total(),before,'Invalid request envelopes must not insert truncated records');
});
test('expiry uses the Kenyan calendar day and expiry today is still current', async () => {
  const today = (await client.query("SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi')::date,'YYYY-MM-DD') AS today")).rows[0].today;
  await addCode('EXPIRES-TODAY',{expiryDate:today});
  assert.equal((await check('EXPIRES-TODAY')).result,'verified');
  await addCode('EXPIRED-CODE',{expiryDate:'2021-01-01'});
  assert.equal((await check('EXPIRED-CODE')).result,'expired');
  await addCode('FUTURE-CODE',{manufactureDate:'2098-01-01'});
  const future = await check('FUTURE-CODE'); assert.equal(future.result,'inactive'); assert.equal(future.reason,'not_yet_manufactured');
});
test('flagged and inactive code states are enforced before positive matches', async () => {
  await addCode('INACTIVE-CODE',{status:'inactive'}); await addCode('FLAGGED-CODE',{status:'suspicious',expiryDate:'2021-01-01'});
  const inactive = await check('INACTIVE-CODE'); assert.equal(inactive.result,'inactive'); assert.equal(inactive.reason,'code_inactive');
  const flagged = await check('FLAGGED-CODE'); assert.equal(flagged.result,'suspicious'); assert.equal(flagged.reason,'code_flagged');
});
test('product status overrides active code status and saved results survive later edits', async () => {
  for (const status of ['inactive','suspicious']) {
    assert.equal((await request(`/products/${product.id}`,{method:'PUT',cookie:admin.cookie,body:{...productInput,name:'Edited name',status}})).status,200);
    assert.equal((await check('DEMO-MATCH')).result,status);
  }
  const mine = await (await request('/verifications/mine',{cookie:farmer.cookie})).json();
  const saved = mine.items.find((item)=>item.id===verified.id);
  assert.equal(saved.result,'verified'); assert.equal(saved.product.name,productInput.name); assert.equal(saved.product.productStatus,'active');
  assert.equal((await request(`/products/${product.id}`,{method:'PUT',cookie:admin.cookie,body:productInput})).status,200);
});
test('farmers cannot read another account, guest history or administrator history', async () => {
  assert.equal((await request('/verifications/mine')).status,401);
  assert.equal((await request('/verifications',{cookie:farmer.cookie})).status,403);
  assert.equal((await request('/verifications/mine',{cookie:admin.cookie})).status,403);
  const other = await (await request('/verifications/mine',{cookie:otherFarmer.cookie})).json(); assert.equal(other.total,0);
  const own = await (await request('/verifications/mine',{cookie:farmer.cookie})).json();
  assert.equal(own.items.length,2); assert.ok(own.items.every(item=>[verified.id,legacyId].includes(item.id)));
  assert.equal((await request(`/verifications/mine?farmerId=${otherFarmer.id}`,{cookie:farmer.cookie})).status,400);
});
test('administrator history filters saved outcomes, account types, search and Kenya date ranges', async () => {
  const result = await (await request('/verifications?result=verified&actor=farmer&q=Demo%20verification',{cookie:admin.cookie})).json();
  assert.equal(result.total,1); assert.equal(result.items[0].farmerName,'verification-farmer');
  assert.equal(result.items[0].email,undefined); assert.equal(result.items[0].phone,undefined);
  const today = (await client.query("SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi')::date,'YYYY-MM-DD') AS today")).rows[0].today;
  const all = await (await request(`/verifications?from=${today}&to=${today}`,{cookie:admin.cookie})).json(); assert.equal(all.total,await total());
  const yesterday = await (await request('/verifications?from=2000-01-01&to=2000-01-01',{cookie:admin.cookie})).json(); assert.equal(yesterday.total,0);
  for (const query of ['?result=counterfeit','?actor=all','?page=0','?from=2027-02-29','?from=2026-10-02&to=2026-10-01','?userId=1']) assert.equal((await request(`/verifications${query}`,{cookie:admin.cookie})).status,400);
});
test('history pagination is stable and bounded and search treats SQL-like input literally', async () => {
  await client.query("INSERT INTO verification_records (farmer_id,entered_code,result,reason,actor_role) SELECT $1,'PAGING-' || n,'unregistered','not_found','farmer' FROM generate_series(1,23) n",[otherFarmer.id]);
  const first = await (await request('/verifications/mine?q=PAGING',{cookie:otherFarmer.cookie})).json();
  const second = await (await request('/verifications/mine?q=PAGING&page=2',{cookie:otherFarmer.cookie})).json();
  assert.equal(first.total,23); assert.equal(first.items.length,20); assert.equal(second.items.length,3);
  assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,23);
  const literal = await (await request(`/verifications?q=${encodeURIComponent("' OR 1=1 --")}`,{cookie:admin.cookie})).json(); assert.equal(literal.total,0);
});
test('distribution mismatches are generic publicly and detailed only in administrator history', async () => {
  const mismatch = await check('DEMO-MATCH',farmer.cookie,nairobiLocation());
  assert.equal(mismatch.result,'review_required'); assert.equal(mismatch.reason,'review_required'); assert.equal(mismatch.product,null);
  assert.equal(mismatch.county,undefined); assert.equal(mismatch.distributionCounty,undefined); assert.equal(mismatch.locationStatus,undefined);
  assert.doesNotMatch(JSON.stringify(mismatch),/Nakuru|Nairobi|distribution_mismatch|location_source/);
  const personal = await (await request('/verifications/mine?result=review_required',{cookie:farmer.cookie})).json();
  assert.equal(personal.items[0].reason,'review_required'); assert.equal(personal.items[0].product,null); assert.equal(personal.items[0].county,undefined);
  const all = await (await request('/verifications?result=review_required',{cookie:admin.cookie})).json();
  const detailed=all.items.find(row=>row.id===mismatch.id);
  assert.equal(detailed.reason,'distribution_mismatch'); assert.equal(detailed.distributionCounty,'Nakuru'); assert.equal(detailed.county,'Nairobi'); assert.equal(detailed.locationSource,'device_reported');
  assert.equal(detailed.product.name,productInput.name);
  const stored=(await client.query('SELECT * FROM verification_records WHERE id=$1',[mismatch.id])).rows[0];
  assert.equal(stored.latitude,undefined); assert.equal(stored.longitude,undefined);
});
test('missing, stale, inaccurate and out-of-country location cannot approve an active code', async () => {
  for (const location of [null,{...nakuruLocation(),timestamp:Date.now()-121000},{...nakuruLocation(),accuracy:10000},{latitude:51.5,longitude:-0.12,accuracy:30,timestamp:Date.now()}]) {
    const result=await check('DEMO-MATCH',undefined,location); assert.equal(result.result,'review_required'); assert.equal(result.reason,'review_required'); assert.equal(result.product,null);
  }
  for (const location of [{county:'Nakuru'}, {...nakuruLocation(),latitude:91},{...nakuruLocation(),accuracy:-1},{...nakuruLocation(),longitude:'36'},{...nakuruLocation(),county:'Nakuru'}]) {
    assert.equal((await request('/verifications',{method:'POST',body:{code:generatedCodes.get('DEMO-MATCH'),location}})).status,400);
  }
  assert.equal((await check('EXPIRED-CODE',undefined,null)).result,'expired');
});
test('existing codes need a distribution assignment and assignment edits do not rewrite past checks', async () => {
  const code = generatedCodes.get('DEMO-MATCH');
  const id=(await client.query('SELECT id FROM product_codes WHERE code_value=$1',[code])).rows[0].id;
  const edit={batchNumber:'DEMO-BATCH',manufactureDate:'2020-01-01',expiryDate:'2099-01-01',status:'active',distributionCounty:null};
  assert.equal((await request(`/products/${product.id}/codes/${id}`,{method:'PUT',cookie:admin.cookie,body:edit})).status,200);
  assert.equal((await check('DEMO-MATCH')).result,'review_required');
  assert.equal((await request(`/products/${product.id}/codes/${id}`,{method:'PUT',cookie:admin.cookie,body:{...edit,distributionCounty:'Nairobi'}})).status,200);
  assert.equal((await check('DEMO-MATCH',undefined,nairobiLocation())).result,'verified');
  const old=(await client.query('SELECT distribution_county,county,result FROM verification_records WHERE id=$1',[verified.id])).rows[0];
  assert.equal(old.distribution_county,'Nakuru'); assert.equal(old.county,'Nakuru'); assert.equal(old.result,'verified');
  await client.query("UPDATE product_codes SET distribution_county='Nakuru' WHERE code_value=$1",[code]);
  const {countyNames}=require('../dist/location/county-location.js');
  assert.deepEqual((await client.query('SELECT name FROM distribution_counties ORDER BY name')).rows.map(row=>row.name),countyNames);
});
test('expired, malformed and suspended sessions are rejected rather than silently checked as guests', async () => {
  for (const cookie of ['agro_session=bad',`agro_session=${'0'.repeat(64)}`]) assert.equal((await request('/verifications',{method:'POST',cookie,body:{code:'DEMO-MATCH'}})).status,401);
  await client.query("UPDATE users SET status='suspended' WHERE id=$1",[farmer.id]);
  try { assert.equal((await request('/verifications',{method:'POST',cookie:farmer.cookie,body:{code:'DEMO-MATCH'}})).status,401); }
  finally { await client.query("UPDATE users SET status='active' WHERE id=$1",[farmer.id]); }
});
test('cross-origin and non-JSON verification requests are blocked before saving', async () => {
  const before = await total();
  for (const requestOrigin of [null,'https://untrusted.example']) assert.equal((await request('/verifications',{method:'POST',requestOrigin,body:{code:'DEMO-MATCH'}})).status,403);
  assert.equal((await request('/verifications',{method:'POST',body:{code:'DEMO-MATCH'},contentType:'text/plain'})).status,415);
  assert.equal((await request('/verifications',{method:'POST',body:{code:'x'.repeat(9000)}})).status,413);
  assert.equal(await total(),before);
});
test('a persistence failure never returns a successful verification', async () => {
  const { DatabaseService } = require('../dist/database/database.service.js'); const database = app.get(DatabaseService);
  const transaction = database.transaction; const before = await total();
  database.transaction = async () => { throw new Error('Simulated database failure'); };
  try { assert.equal((await request('/verifications',{method:'POST',body:{code:'DEMO-MATCH'}})).status,503); }
  finally { database.transaction = transaction; }
  assert.equal(await total(),before);
});
test('repeated guest verification attempts are rate limited without adding records', async () => {
  let limited;
  for (let i=0;i<61;i++) { const response = await request('/verifications',{method:'POST',body:{code:'RATE-TEST'}}); if (response.status===429) { limited=response; break; } assert.equal(response.status,201); }
  assert.ok(limited); assert.ok(Number(limited.headers.get('retry-after'))>0);
  const before = await total(); assert.equal((await request('/verifications',{method:'POST',body:{code:'RATE-TEST'}})).status,429); assert.equal(await total(),before);
});
