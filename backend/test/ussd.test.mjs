import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, before, beforeEach, test } from 'node:test';
import { connectDatabase, databaseUrl } from '../database/connection.mjs';
import { migrate, schemaIdentifier } from '../database/migration-runner.mjs';

const require=createRequire(import.meta.url);
const schema=`agro_test_${randomUUID().replaceAll('-','')}`;
const origin='http://localhost:3000', secret=randomBytes(32).toString('hex'), serviceCode='*384*12345#';
const password='Farmer account test password!', pin='482759', phone='+254700000901';
const original={...process.env};
let client,app,base,farmer,other,admin,code,created=false,countyNames;
async function account(role,contact) {
  const {hashPassword}=require('../dist/auth/passwords.js');
  const hash=await hashPassword(password),token=randomBytes(32).toString('hex');
  await client.query('BEGIN');
  try{
    const row=(await client.query('INSERT INTO users(full_name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING id',[`USSD ${role}`,`${randomUUID()}@example.invalid`,contact,hash,role])).rows[0];
    if(role==='farmer')await client.query('INSERT INTO farmers(user_id) VALUES ($1)',[row.id]);
    else await client.query('INSERT INTO administrators(user_id,staff_number) VALUES ($1,$2)',[row.id,randomUUID()]);
    await client.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,CURRENT_TIMESTAMP+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),row.id]);
    await client.query('COMMIT');return {...row,cookie:`agro_session=${token}`};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
async function settings(body,cookie=farmer.cookie,requestOrigin=origin){return fetch(`${base}/api/ussd/settings`,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:requestOrigin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
function session(number=phone,id=randomUUID()) {
  let text='';
  async function send(answer,overrides={}) {
    if(answer!==undefined)text=text?`${text}*${answer}`:answer;
    const response=await fetch(`${base}/api/ussd/callback/${secret}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({sessionId:id,serviceCode,phoneNumber:number,text,...overrides})});
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/plain/);
    const screen=await response.text();assert.ok(screen.length<=160,screen);assert.match(screen,/^(CON|END) /);return screen;
  }
  return {id,send,get text(){return text;}};
}
async function login(number=phone){const s=session(number);await s.send();await s.send('2');assert.match(await s.send(pin),/CON Farmer account/);return s;}
async function county(s,name){assert.ok(countyNames.includes(name));return s.send(name);}
async function reportSession(){const s=await login();await s.send('2');assert.match(await s.send(code),/Registered seed/);await s.send('3');await s.send('The seal was broken before purchase.');assert.match(await county(s,'Nakuru'),/1 Submit/);return s;}
async function resume(){const s=session();await s.send();await s.send('2');assert.match(await s.send(pin),/Unfinished report found/);return s;}

before(async()=>{
  client=await connectDatabase();await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`);created=true;await migrate(client,{schema});await client.query("SELECT set_config('search_path',$1,false)",[schemaIdentifier(schema)]);
  const url=new URL(await databaseUrl());url.searchParams.set('options',`-c search_path=${schema}`);
  Object.assign(process.env,{DATABASE_URL:url.toString(),NODE_ENV:'test',FRONTEND_ORIGIN:origin,SESSION_COOKIE_SECURE:'false',USSD_CALLBACK_TOKEN:secret,USSD_SERVICE_CODE:serviceCode});
  farmer=await account('farmer',phone);other=await account('farmer','+254700000902');admin=await account('administrator',null);
  const product=(await client.query("INSERT INTO products(name,category,manufacturer,created_by) VALUES ('Registered seed','seed','Test supplier',$1) RETURNING id",[admin.id])).rows[0];
  code='AGV-ABCD-EFGH-JKMP-QRST-VWXY';
  await client.query("INSERT INTO product_codes(product_id,code_value,batch_number,expiry_date,distribution_county) VALUES ($1,$2,'USSD-BATCH','2099-01-01','Nakuru')",[product.id,code]);
  ({countyNames}=require('../dist/location/county-location.js'));
  const {NestFactory}=require('@nestjs/core'),{AppModule}=require('../dist/app.module.js'),{configureApp}=require('../dist/config/configure-app.js');
  app=await NestFactory.create(AppModule,{bodyParser:false,logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();if(created){assert.match(schema,/^agro_test_[a-f0-9]{32}$/);await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`);}await client?.end();for(const key of ['DATABASE_URL','NODE_ENV','FRONTEND_ORIGIN','SESSION_COOKIE_SECURE','USSD_CALLBACK_TOKEN','USSD_SERVICE_CODE']){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}});
beforeEach(async()=>{
  app.get(require('../dist/ussd/ussd.controller.js').UssdController).attempts.clear();
  await client.query('DELETE FROM ussd_report_drafts');
});

test('settings require farmer session, exact origin, current password and valid PIN',async()=>{
  assert.equal((await settings(undefined,'')).status,401);
  assert.equal((await settings(undefined,admin.cookie)).status,403);
  const input={phone,password,pin};
  assert.equal((await settings(input,farmer.cookie,'https://elsewhere.invalid')).status,403);
  assert.equal((await settings({...input,password:'wrong'})).status,401);
  for(const bad of ['123456','111111','abc123','48275'])assert.equal((await settings({...input,pin:bad})).status,400);
  assert.equal((await settings({...input,phone:'+254700000902'})).status,409);
  const response=await settings(input);assert.equal(response.status,200);assert.deepEqual(await response.json(),{phone,enabled:true});
  const saved=(await client.query('SELECT * FROM ussd_credentials WHERE farmer_id=$1',[farmer.id])).rows[0];assert.match(saved.pin_hash,/^scrypt\$/);assert.ok(!saved.pin_hash.includes(pin));
});
test('gateway authenticates callback, validates service, bounds payload and accepts no web session',async()=>{
  assert.equal((await fetch(`${base}/api/ussd/callback/wrong`,{method:'POST'})).status,404);
  const s=session();assert.match(await s.send(undefined,{serviceCode:'*123#'}),/Service unavailable/);
  assert.match(await s.send(undefined,{phoneNumber:'not a phone'}),/Invalid input/);
  assert.match(await s.send(),/CON AgroVerify/);
  const big=await fetch(`${base}/api/ussd/callback/${secret}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`text=${'x'.repeat(9000)}`});assert.equal(big.status,413);
});
test('all county menus fit the budget and allow all 47 counties without hidden assignments',()=>{
  const {countyMenu}=require('../dist/ussd/menus.js');const names=[];
  for(let page=0;page<12;page++){const screen=countyMenu(page,countyNames,true);assert.ok(screen.length<=160,screen);for(const name of countyNames.slice(page*4,page*4+4)){assert.ok(screen.includes(name));names.push(name);}}
  assert.equal(new Set(names).size,47);
});
test('a matching declared county approves an active current code and retains the self-reported source',async()=>{
  const s=session();await s.send();await s.send('1');await s.send(code);const final=await county(s,'Nakuru');assert.match(final,/Code matched/);assert.match(final,/Registered seed/);assert.match(final,/Expiry 2099-01-01/);assert.ok(!final.includes('Nakuru'));
  const row=(await client.query('SELECT * FROM verification_records ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(row.channel,'ussd');assert.equal(row.farmer_id,null);assert.equal(row.county,'Nakuru');assert.equal(row.location_source,'self_reported');assert.equal(row.location_status,'matched');assert.equal(row.reason,'matched');assert.equal(row.result,'verified');
  const count=(await client.query('SELECT count(*)::int AS n FROM verification_records')).rows[0].n;
  assert.equal(await s.send(),final);assert.equal((await client.query('SELECT count(*)::int AS n FROM verification_records')).rows[0].n,count);
});
test('mismatch and unknown codes have distinct private assessments without leaking distribution county',async()=>{
  const s=session();await s.send();await s.send('1');await s.send(code);assert.match(await county(s,'Nairobi'),/requires review/);
  const row=(await client.query('SELECT * FROM verification_records ORDER BY id DESC LIMIT 1')).rows[0];assert.equal(row.reason,'distribution_mismatch');
  const unknown=session();await unknown.send();await unknown.send('1');await unknown.send('NOT-REGISTERED');assert.match(await county(unknown,'Nakuru'),/Code not registered/);
});
test('expiry and status checks take precedence over self-reported location',async()=>{
  await client.query("UPDATE product_codes SET expiry_date='2000-01-01' WHERE code_value=$1",[code]);
  const s=session();await s.send();await s.send('1');await s.send(code);assert.match(await county(s,'Nakuru'),/Product expired/);
  await client.query("UPDATE product_codes SET expiry_date='2099-01-01' WHERE code_value=$1",[code]);
  for (const [status,message] of [['inactive',/inactive/],['suspicious',/flagged/]]) {
    await client.query('UPDATE product_codes SET verification_status=$2 WHERE code_value=$1',[code,status]);
    const check=session();await check.send();await check.send('1');await check.send(code);assert.match(await county(check,'Nakuru'),message);
  }
  await client.query("UPDATE product_codes SET verification_status='active',distribution_county=NULL WHERE code_value=$1",[code]);
  const unassigned=session();await unassigned.send();await unassigned.send('1');await unassigned.send(code);assert.match(await county(unassigned,'Nakuru'),/requires review/);
  await client.query("UPDATE product_codes SET distribution_county='Nakuru' WHERE code_value=$1",[code]);
});
test('phone binding, prefix validation, expiry and missing initial hop fail closed',async()=>{
  const s=session();await s.send();assert.match(await s.send('1',{phoneNumber:'+254700000902'}),/Invalid session/);
  assert.match(await s.send(undefined,{text:'1*skipped'}),/out of order/);
  await client.query("UPDATE ussd_sessions SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1",[s.id]);assert.match(await s.send(),/expired/);
  assert.match(await session().send('1'),/expired/);
});
test('farmer checks and histories belong to the PIN-authenticated farmer',async()=>{
  const s=await login();await s.send('1');await s.send(code);await county(s,'Nakuru');
  const row=(await client.query('SELECT * FROM verification_records ORDER BY id DESC LIMIT 1')).rows[0];assert.equal(row.farmer_id,farmer.id);assert.equal(row.actor_role,'farmer');assert.equal(row.result,'verified');assert.equal(row.location_source,'self_reported');
  const history=await login();assert.match(await history.send('3'),/AGV-/);
  const unauth=session('+254700000902');await unauth.send();await unauth.send('2');assert.match(await unauth.send(pin),/not accepted/);
});
test('confirming a report commits once even for concurrent provider retries',async()=>{
  const s=await reportSession(),text=`${s.text}*1`;
  const before=(await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n;
  const responses=await Promise.all([s.send(undefined,{text}),s.send(undefined,{text})]);assert.equal(responses[0],responses[1]);assert.match(responses[0],/Report #\d+ submitted/);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,before+1);
  const row=(await client.query('SELECT * FROM product_reports ORDER BY id DESC LIMIT 1')).rows[0];assert.equal(row.channel,'ussd');assert.equal(row.status,'submitted');assert.equal(row.farmer_id,farmer.id);assert.equal(row.product_name,'Registered seed');assert.equal(row.entered_code,code);assert.ok(row.product_id);assert.equal(row.seller_location,null);
  const history=await login();assert.match(await history.send('4'),/Registered seed/);
});
test('cancelled reports and failed writes leave no partial records and can retry safely',async()=>{
  const s=await reportSession(),count=(await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n;
  assert.match(await s.send('3'),/cancelled/);assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,count);
  const retry=await reportSession();
  await client.query("CREATE FUNCTION reject_ussd_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced test failure'; END; $$");
  await client.query('CREATE TRIGGER reject_ussd_report BEFORE INSERT ON product_reports FOR EACH ROW EXECUTE FUNCTION reject_ussd_report()');
  const text=`${retry.text}*1`;assert.match(await retry.send(undefined,{text}),/temporarily unavailable/);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,count);
  assert.equal((await client.query('SELECT status FROM ussd_report_drafts WHERE farmer_id=$1',[farmer.id])).rows[0].status,'active');
  await client.query('DROP TRIGGER reject_ussd_report ON product_reports');await client.query('DROP FUNCTION reject_ussd_report()');
  assert.match(await retry.send(undefined,{text}),/submitted/);
});

test('county entry accepts names and unique prefixes, disambiguates and retains a complete browse menu',async()=>{
  const s=session();await s.send();await s.send('1');assert.match(await s.send(code),/Enter current county/);
  assert.match(await s.send('not a county'),/Enter current county/);
  assert.match(await s.send('Na'),/1 Nairobi/);
  assert.match(await s.send('2'),/Code matched/); // Nairobi, Nakuru, Nandi, Narok
  const browse=session();await browse.send();await browse.send('1');await browse.send(code);
  assert.match(await browse.send('9'),/1 Baringo/);assert.match(await browse.send('98'),/1 Elgeyo/);
  assert.match(await browse.send('99'),/1 Baringo/);assert.match(await browse.send('nAkUrU County'),/Code matched/);
});

test('expired sessions resume the latest saved answer after fresh PIN authentication',async()=>{
  const old=await login();await old.send('2');await old.send(code);await old.send('3');
  const snapshot=(await client.query('SELECT * FROM ussd_report_drafts WHERE farmer_id=$1',[farmer.id])).rows[0];
  assert.equal(snapshot.state.step,'report_description');assert.equal(snapshot.state.productName,'Registered seed');
  const serialized=JSON.stringify(snapshot);for(const value of [pin,phone,'pin_hash','version','farmerId'])assert.ok(!serialized.includes(value));
  await client.query("UPDATE ussd_sessions SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1",[old.id]);
  assert.match(await old.send('An opened seal on the package.'),/Session expired/);
  const wrong=session();await wrong.send();await wrong.send('2');assert.match(await wrong.send('736284'),/not accepted/);
  const stranger=session('+254700000902');await stranger.send();await stranger.send('2');assert.match(await stranger.send(pin),/not accepted/);
  const next=await resume();assert.match(await next.send('1'),/Describe the concern/);
  await next.send('The seal was open before purchase.');await next.send('Nakuru');
  assert.match(await next.send('2'),/Enter shop/);assert.match(await next.send('Nakuru central market'),/1 Submit/);
  assert.match(await next.send('1'),/submitted/);
  const saved=(await client.query('SELECT * FROM product_reports ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(saved.county,'Nakuru');assert.equal(saved.seller_location,'Nakuru central market');
});

test('unknown products retain manual details, and save & exit resumes without submitting',async()=>{
  const count=(await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n;
  const first=await login();await first.send('2');assert.match(await first.send('UNKNOWN-INPUT-01'),/Enter product name/);
  await first.send('Maize seed packet');await first.send('1');await first.send('5');await first.send('The code did not match the label.');
  assert.match(await first.send('0'),/progress saved/);
  const second=await resume();assert.match(await second.send('1'),/Enter current county/);await second.send('Nakuru');
  assert.match(await second.send('0'),/progress saved/);assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,count);
  const third=await resume();assert.match(await third.send('1'),/Maize seed packet/);assert.match(await third.send('1'),/submitted/);
  const row=(await client.query('SELECT * FROM product_reports ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(row.product_id,null);assert.equal(row.entered_code,'UNKNOWN-INPUT-01');assert.equal(row.product_name,'Maize seed packet');
});

test('resuming claims the draft and blocks stale sessions, including after submission or replacement',async()=>{
  const old=await reportSession();const next=await resume();assert.match(await next.send('1'),/1 Submit/);
  const count=(await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n;
  assert.match(await next.send('1'),/submitted/);assert.match(await old.send('1'),/already submitted/);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,count+1);
  const original=await reportSession();const claimant=await resume();await claimant.send('1');
  assert.match(await original.send('1'),/draft changed/);
  const replacement=await resume();assert.match(await replacement.send('2'),/Enter package code/);
  assert.match(await claimant.send('1'),/draft changed/);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_reports')).rows[0].n,count+1);
  assert.match(await replacement.send('9'),/Enter product name/);
});

test('drafts expire after 24 hours and discarding clears content without a report',async()=>{
  await reportSession();
  await client.query("UPDATE ussd_report_drafts SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE farmer_id=$1",[farmer.id]);
  const fresh=await login();assert.match(await fresh.send('2'),/Enter package code/);
  const pending=await resume();assert.match(await pending.send('2'),/Enter package code/);
  const row=(await client.query('SELECT state FROM ussd_report_drafts WHERE farmer_id=$1',[farmer.id])).rows[0];
  assert.equal(row.state.step,'report_code');assert.equal(row.state.description,undefined);
  const current=await resume();await current.send('1');await current.send('9');await current.send('Different product');await current.send('2');await current.send('6');await current.send('The label was difficult to read.');await current.send('Nakuru');await current.send('3');
  const discarded=(await client.query('SELECT state,status FROM ussd_report_drafts WHERE farmer_id=$1',[farmer.id])).rows[0];
  assert.equal(discarded.status,'discarded');assert.deepEqual(discarded.state,{});await login();
});

test('a reporting session opened before the upgrade adopts draft storage safely',async()=>{
  const s=await reportSession();
  await client.query('DELETE FROM ussd_report_drafts WHERE farmer_id=$1',[farmer.id]);
  await client.query(`UPDATE ussd_sessions SET state=(state-'draftId'-'draftRevision'-'county') || '{"step":"report_seller"}'::jsonb WHERE id=$1`,[s.id]);
  assert.match(await s.send('Nakuru'),/1 Submit/);
  const row=(await client.query('SELECT state FROM ussd_report_drafts WHERE farmer_id=$1',[farmer.id])).rows[0];
  assert.equal(row.state.county,'Nakuru');assert.equal(row.state.productName,'Registered seed');
  assert.match(await s.send('1'),/submitted/);
});
test('PIN failures lock persistently and PIN reset invalidates earlier sessions and cached private results',async()=>{
  const old=await login();await old.send('3');
  for(let i=0;i<5;i++){const s=session();await s.send();await s.send('2');assert.match(await s.send('736284'),/not accepted/);}
  const locked=session();await locked.send();await locked.send('2');assert.match(await locked.send(pin),/not accepted/);
  assert.equal((await settings({phone,password,pin})).status,200);
  assert.match(await old.send(),/access ended/);
  const fresh=await login();assert.equal((await settings({password,pin:null})).status,200);assert.match(await fresh.send('3'),/access ended/);
  assert.equal((await settings({phone,password,pin})).status,200);
});
test('raw PINs, callback text, private assignments and notes are not retained in session state',async()=>{
  const s=await login();await s.send('0');
  const row=(await client.query('SELECT * FROM ussd_sessions WHERE id=$1',[s.id])).rows[0];
  const serialized=JSON.stringify(row);assert.ok(!serialized.includes(pin));assert.ok(!serialized.includes(phone));assert.ok(!serialized.includes('pin_hash'));assert.ok(!serialized.includes('distribution_county'));
});
test('local simulator is admin-only, origin protected, and uses the same flow without provider credentials',async()=>{
  const body={sessionId:randomUUID(),serviceCode,phoneNumber:phone,text:''};
  const send=(cookie,requestOrigin=origin)=>fetch(`${base}/api/ussd/simulate`,{method:'POST',headers:{Cookie:cookie,Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send('')).status,401);assert.equal((await send(farmer.cookie)).status,403);assert.equal((await send(admin.cookie,'https://elsewhere.invalid')).status,403);
  const response=await send(admin.cookie);assert.equal(response.status,200);assert.match((await response.json()).response,/CON AgroVerify/);
});
test('account suspension revokes USSD access and callback stays disabled until configured',async()=>{
  const s=await login();await client.query("UPDATE users SET status='suspended' WHERE id=$1",[farmer.id]);
  assert.match(await s.send('3'),/access ended/);await client.query("UPDATE users SET status='active' WHERE id=$1",[farmer.id]);
  const {ConfigService}=require('@nestjs/config'),config=app.get(ConfigService);config.set('USSD_CALLBACK_TOKEN','');config.set('USSD_SERVICE_CODE','');
  try{
    const response=await fetch(`${base}/api/ussd/callback/${secret}`,{method:'POST'});assert.equal(response.status,404);
    const local=await fetch(`${base}/api/ussd/simulate`,{method:'POST',headers:{Cookie:admin.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({sessionId:randomUUID(),serviceCode,phoneNumber:phone,text:''})});
    assert.equal(local.status,200);assert.match((await local.json()).response,/CON AgroVerify/);
  }finally{config.set('USSD_CALLBACK_TOKEN',secret);config.set('USSD_SERVICE_CODE',serviceCode);}
});
