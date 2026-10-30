import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, before, beforeEach, test } from 'node:test';
import { connectDatabase, databaseUrl } from '../database/connection.mjs';
import { migrate, schemaIdentifier } from '../database/migration-runner.mjs';

const require = createRequire(import.meta.url);
const schema = `agro_test_${randomUUID().replaceAll('-','')}`;
const origin = 'http://localhost:3000'; const original = {...process.env};
const input = {productName:'Unknown seed package',category:'seed',reason:'damaged_packaging',description:'The package seal was broken before opening.',sellerName:'Test shop',sellerLocation:'Test market',county:'Nairobi'};
let client,app,base,farmer,otherFarmer,admin,product,code,verification,report,guard,created=false;
async function account(role) {
  const token=randomBytes(32).toString('hex');
  await client.query('BEGIN');
  try {
    const user=(await client.query("INSERT INTO users(full_name,email,password_hash,role) VALUES ($1,$2,'session-fixture-only',$3) RETURNING id",[`Test ${role}`,`${randomUUID()}@example.invalid`,role])).rows[0];
    if(role==='farmer')await client.query('INSERT INTO farmers(user_id) VALUES ($1)',[user.id]);
    else await client.query('INSERT INTO administrators(user_id,staff_number) VALUES ($1,$2)',[user.id,randomUUID()]);
    await client.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,CURRENT_TIMESTAMP+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),user.id]);
    await client.query('COMMIT'); return {id:user.id,cookie:`agro_session=${token}`};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
async function request(path='',{method='GET',body,cookie=farmer?.cookie,requestOrigin=origin,contentType='application/json'}={}) {
  return fetch(`${base}/api/reports${path}`,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(requestOrigin?{Origin:requestOrigin}:{}),...(body===undefined?{}:{'Content-Type':contentType})},body:body===undefined?undefined:JSON.stringify(body)});
}
before(async()=>{
  client=await connectDatabase();await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`);created=true;await migrate(client,{schema});
  await client.query("SELECT set_config('search_path',$1,false)",[schemaIdentifier(schema)]);
  const url=new URL(await databaseUrl());url.searchParams.set('options',`-c search_path=${schema}`);
  Object.assign(process.env,{DATABASE_URL:url.toString(),NODE_ENV:'test',FRONTEND_ORIGIN:origin,SESSION_COOKIE_SECURE:'false'});
  farmer=await account('farmer');otherFarmer=await account('farmer');admin=await account('administrator');
  product=(await client.query("INSERT INTO products(name,category,manufacturer,created_by) VALUES ('Registered seed','seed','Test supplier',$1) RETURNING *",[admin.id])).rows[0];
  code=(await client.query("INSERT INTO product_codes(product_id,code_value,batch_number,expiry_date,distribution_county) VALUES ($1,'REPORT-TEST-CODE','BATCH-1','2099-01-01','Nakuru') RETURNING *",[product.id])).rows[0];
  verification=(await client.query("INSERT INTO verification_records(farmer_id,product_code_id,entered_code,result,reason,actor_role,county,distribution_county,location_source,location_status) VALUES ($1,$2,$3,'review_required','distribution_mismatch','farmer','Nairobi','Nakuru','device_reported','mismatch') RETURNING *",[farmer.id,code.id,code.code_value])).rows[0];
  const {NestFactory}=require('@nestjs/core');const {AppModule}=require('../dist/app.module.js');const {configureApp}=require('../dist/config/configure-app.js');
  app=await NestFactory.create(AppModule,{bodyParser:false,logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
  guard=app.get(require('../dist/reports/reports.controller.js').ReportMutationGuard);
});
beforeEach(()=>guard.attempts.clear());
after(async()=>{
  await app?.close();
  if(created){assert.match(schema,/^agro_test_[a-f0-9]{32}$/);await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`);}
  await client?.end();
  for(const key of ['DATABASE_URL','NODE_ENV','FRONTEND_ORIGIN','SESSION_COOKIE_SECURE']){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
});
test('report endpoints enforce farmer and administrator roles',async()=>{
  for(const [path,method,body] of [['','POST',input],['/mine','GET'],['/catalogue','GET'],['','GET'],['/1','GET'],['/1/review','PUT',{}]])assert.equal((await request(path,{method,body,cookie:null})).status,401);
  assert.equal((await request('',{method:'POST',body:input,cookie:admin.cookie})).status,403);
  assert.equal((await request()).status,403);
  assert.equal((await request('/1/review',{method:'PUT',body:{},cookie:farmer.cookie})).status,403);
  assert.equal((await request('/mine',{cookie:admin.cookie})).status,403);
});
test('registered reports keep authoritative catalogue details and do not flag products or codes',async()=>{
  const response=await request('',{method:'POST',body:{...input,productId:product.id,productName:'Spoofed name',category:'fertilizer',codeValue:code.code_value,verificationId:verification.id}});
  assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');report=await response.json();
  assert.equal(report.productName,product.name);assert.equal(report.category,'seed');assert.equal(report.status,'submitted');assert.equal(report.verificationResult,'review_required');
  for(const key of ['internalNote','reviewedBy','farmerId','farmerName','version','productCodeId','distributionCounty','locationStatus'])assert.equal(key in report,false);
  assert.equal((await client.query('SELECT status FROM products WHERE id=$1',[product.id])).rows[0].status,'active');
  assert.equal((await client.query('SELECT verification_status FROM product_codes WHERE id=$1',[code.id])).rows[0].verification_status,'active');
  assert.deepEqual((await client.query('SELECT * FROM verification_records WHERE id=$1',[verification.id])).rows[0],verification);
});
test('unknown products and missing or unknown package codes can be reported',async()=>{
  for(const codeValue of [null,'NOT-IN-DATABASE']){
    const response=await request('',{method:'POST',body:{...input,codeValue}});assert.equal(response.status,201);
    const saved=await response.json();assert.equal(saved.productId,null);assert.equal(saved.codeValue,codeValue);
    assert.equal((await client.query('SELECT product_code_id FROM product_reports WHERE id=$1',[saved.id])).rows[0].product_code_id,null);
  }
});
test('verification links require ownership and matching codes without revealing private location reasons',async()=>{
  assert.equal((await request('',{method:'POST',cookie:otherFarmer.cookie,body:{...input,verificationId:verification.id}})).status,404);
  assert.equal((await request('',{method:'POST',body:{...input,verificationId:verification.id,codeValue:'DIFFERENT'}})).status,400);
  const response=await request('',{method:'POST',body:{...input,verificationId:verification.id}});assert.equal(response.status,201);
  const saved=await response.json();assert.equal(saved.codeValue,code.code_value);assert.equal(JSON.stringify(saved).includes('distribution_mismatch'),false);assert.equal(JSON.stringify(saved).includes('Nakuru'),false);
});
test('farmer history and individual records are private and catalogue exposes no package data',async()=>{
  const own=await(await request('/mine')).json();assert.ok(own.items.some(item=>item.id===report.id));
  assert.equal((await(await request('/mine',{cookie:otherFarmer.cookie})).json()).total,0);
  assert.equal((await request(`/${report.id}`,{cookie:otherFarmer.cookie})).status,404);
  const catalogue=await(await request('/catalogue?q=Registered')).json();assert.equal(catalogue.items.length,1);
  assert.deepEqual(Object.keys(catalogue.items[0]).sort(),['category','id','manufacturer','name']);
  assert.equal((await(await request('/catalogue?q=%25')).json()).items.length,0);
});
test('malformed input and forged attribution are rejected before saving',async()=>{
  const before=(await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n;
  for(const change of [{farmerId:otherFarmer.id},{status:'resolved'},{internalNote:'private'},{reason:'unknown'},{description:'short'},{description:'x'.repeat(2001)},{county:'Atlantis'},{productId:'0'},{verificationId:2},{productName:''},{category:'pesticide'},{sellerName:4}])assert.equal((await request('',{method:'POST',body:{...input,...change}})).status,400);
  assert.equal((await request('',{method:'POST',body:{...input,productId:'999999'}})).status,404);
  assert.equal((await request('',{method:'POST',body:{...input,description:'x'.repeat(9000)}})).status,413);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,before);
  for(const path of ['/0','/invalid','/9223372036854775808'])assert.equal((await request(path)).status,400);
  for(const query of ['?page=0','?status=invalid','?page=1&page=2','?farmerId=1'])assert.equal((await request(`/mine${query}`)).status,400);
});
test('mutations require same-origin JSON and catalogue access requires an active session',async()=>{
  for(const requestOrigin of [null,'https://untrusted.example']){
    assert.equal((await request('',{method:'POST',body:input,requestOrigin})).status,403);
    assert.equal((await request(`/${report.id}/review`,{method:'PUT',cookie:admin.cookie,body:{},requestOrigin})).status,403);
  }
  assert.equal((await request('',{method:'POST',body:input,contentType:'text/plain'})).status,415);
  await client.query("UPDATE users SET status='suspended' WHERE id=$1",[farmer.id]);
  try{assert.equal((await request('/catalogue')).status,401);assert.equal((await request('',{method:'POST',body:input})).status,401);}finally{await client.query("UPDATE users SET status='active' WHERE id=$1",[farmer.id]);}
});
test('administrator starts review with private notes and a farmer-visible response',async()=>{
  const current=await(await request(`/${report.id}`,{cookie:admin.cookie})).json();
  assert.equal(current.version,1);
  assert.equal((await request(`/${report.id}/review`,{method:'PUT',cookie:admin.cookie,body:{version:1,status:'resolved',resolution:'no_action',response:'Reviewed.'}})).status,409);
  const response=await request(`/${report.id}/review`,{method:'PUT',cookie:admin.cookie,body:{version:1,status:'under_review',response:'We are investigating your concern.',internalNote:'Private supplier contact details.'}});
  assert.equal(response.status,200);const updated=await response.json();assert.equal(updated.version,2);assert.equal(updated.internalNote,'Private supplier contact details.');
  const visible=await(await request(`/${report.id}`)).json();assert.equal(visible.response,'We are investigating your concern.');assert.equal(visible.status,'under_review');assert.equal('internalNote' in visible,false);
  assert.equal(JSON.stringify(await(await request('/mine')).json()).includes('Private supplier'),false);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM report_reviews WHERE report_id=$1',[report.id])).rows[0].n,1);
});
test('resolution requires a response and concurrent reviews cannot silently overwrite each other',async()=>{
  for(const body of [{version:2,status:'resolved',resolution:'no_action'},{version:2,status:'resolved',resolution:'invalid',response:'Reviewed.'},{version:2,status:'under_review',resolution:'no_action'},{status:'under_review'}])assert.equal((await request(`/${report.id}/review`,{method:'PUT',body,cookie:admin.cookie})).status,400);
  const body={version:2,status:'resolved',resolution:'insufficient_information',response:'Please provide the seller receipt for further investigation.',internalNote:'Private investigation note.'};
  const responses=await Promise.all([1,2].map(()=>request(`/${report.id}/review`,{method:'PUT',body,cookie:admin.cookie})));
  assert.deepEqual(responses.map(item=>item.status).sort(),[200,409]);
  const visible=await(await request(`/${report.id}`)).json();assert.equal(visible.status,'resolved');assert.equal(visible.resolution,'insufficient_information');
  assert.equal((await client.query('SELECT count(*)::int AS n FROM report_reviews WHERE report_id=$1',[report.id])).rows[0].n,2);
});
test('review audit failure rolls back changes and a resolved report can be reopened',async()=>{
  await client.query("CREATE FUNCTION fail_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$");
  await client.query('CREATE TRIGGER fail_review_audit BEFORE INSERT ON report_reviews FOR EACH ROW EXECUTE FUNCTION fail_review_audit()');
  try{assert.equal((await request(`/${report.id}/review`,{method:'PUT',cookie:admin.cookie,body:{version:3,status:'under_review',response:'Reopening.'}})).status,500);}
  finally{await client.query('DROP TRIGGER fail_review_audit ON report_reviews');await client.query('DROP FUNCTION fail_review_audit()');}
  const unchanged=await(await request(`/${report.id}`,{cookie:admin.cookie})).json();assert.equal(unchanged.version,3);assert.equal(unchanged.status,'resolved');
  const reopened=await request(`/${report.id}/review`,{method:'PUT',cookie:admin.cookie,body:{version:3,status:'under_review',response:'Additional information is being reviewed.'}});
  assert.equal(reopened.status,200);assert.equal((await reopened.json()).resolution,null);
});
test('search and pagination remain bounded and literal for administrator and farmer views',async()=>{
  await client.query("INSERT INTO product_reports(farmer_id,product_name,category,reason,description) SELECT $1,'Paging report '||n,'seed','other','A detailed test concern.' FROM generate_series(1,23) n",[otherFarmer.id]);
  const first=await(await request('?q=Paging',{cookie:admin.cookie})).json();const second=await(await request('?q=Paging&page=2',{cookie:admin.cookie})).json();
  assert.equal(first.total,23);assert.equal(first.items.length,20);assert.equal(second.items.length,3);assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,23);
  assert.equal((await(await request('/mine?q=Paging')).json()).total,0);
  assert.equal((await(await request('?q=%25',{cookie:admin.cookie})).json()).total,0);
  assert.equal((await(await request('?status=resolved',{cookie:admin.cookie})).json()).total,0);
});
test('database constraints prevent resolution without a response and report creation failures save nothing',async()=>{
  await assert.rejects(client.query("UPDATE product_reports SET status='resolved',resolution='no_action',reviewed_by=$2,response=NULL WHERE id=$1",[report.id,admin.id]),{code:'23514'});
  await client.query("CREATE FUNCTION fail_report_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test save failure'; END $$");
  await client.query('CREATE TRIGGER fail_report_save BEFORE INSERT ON product_reports FOR EACH ROW EXECUTE FUNCTION fail_report_save()');
  const before=(await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n;
  try{assert.equal((await request('',{method:'POST',body:input})).status,500);}
  finally{await client.query('DROP TRIGGER fail_report_save ON product_reports');await client.query('DROP FUNCTION fail_report_save()');}
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,before);
});
test('report submissions are rate-limited per farmer account',async()=>{
  for(let attempt=0;attempt<20;attempt++)assert.equal((await request('',{method:'POST',body:{}})).status,400);
  const limited=await request('',{method:'POST',body:input});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
  assert.equal((await request('',{method:'POST',body:input,cookie:otherFarmer.cookie})).status,201);
});
