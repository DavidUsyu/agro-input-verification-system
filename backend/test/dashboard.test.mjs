import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {after,before,test} from 'node:test';
import {connectDatabase,databaseUrl} from '../database/connection.mjs';
import {migrate,schemaIdentifier} from '../database/migration-runner.mjs';

const require=createRequire(import.meta.url);
const schema=`agro_test_${randomUUID().replaceAll('-','')}`;
const original={...process.env};const range='from=2024-02-28&to=2024-02-28';
let client,app,base,admin,farmer,product,otherProduct,code,checks=[],created=false;
async function account(role){
  const token=randomBytes(32).toString('hex');await client.query('BEGIN');
  try{
    const user=(await client.query("INSERT INTO users(full_name,email,password_hash,role) VALUES ($1,$2,'session-fixture-only',$3) RETURNING id",[`Test ${role}`,`${randomUUID()}@example.invalid`,role])).rows[0];
    if(role==='farmer')await client.query('INSERT INTO farmers(user_id) VALUES ($1)',[user.id]);
    else await client.query('INSERT INTO administrators(user_id,staff_number) VALUES ($1,$2)',[user.id,randomUUID()]);
    await client.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,CURRENT_TIMESTAMP+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),user.id]);
    await client.query('COMMIT');return{id:user.id,cookie:`agro_session=${token}`};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
async function request(query='',cookie=admin.cookie){return fetch(`${base}/api/dashboard${query ? `?${query}` : ''}`,{headers:cookie ? {Cookie:cookie} : {}});}
async function overview(query=range){const response=await request(query);assert.equal(response.status,200);return response.json();}
async function insertCheck(result,county,source,time,reason='legacy'){
  const unknown=['unregistered','invalid'].includes(result);
  return(await client.query(`INSERT INTO verification_records(product_code_id,entered_code,result,reason,product_snapshot,verified_at,county,location_source,location_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[unknown ? null : code.id,unknown ? 'UNKNOWN' : code.code_value,result,reason,unknown ? null : {name:'Name at verification'},time,county,source,source==='device_reported' ? 'matched' : 'not_checked'])).rows[0].id;
}
async function insertReport(name,productId,county,status,time){
  return client.query(`INSERT INTO product_reports(farmer_id,product_id,product_name,category,reason,description,county,status,reviewed_by,resolution,response,created_at,updated_at)
    VALUES($1,$2,$3,'seed','other','A detailed test observation.',$4,$5,$6,$7,$8,$9,'2024-03-05T12:00:00Z')`,
  [farmer.id,productId,name,county,status,status==='submitted'?null:admin.id,status==='resolved'?'no_action':null,status==='resolved'?'Review completed.':null,time]);
}
before(async()=>{
  client=await connectDatabase();await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`);created=true;await migrate(client,{schema});
  await client.query("SELECT set_config('search_path',$1,false)",[schemaIdentifier(schema)]);
  const url=new URL(await databaseUrl());url.searchParams.set('options',`-c search_path=${schema}`);
  Object.assign(process.env,{DATABASE_URL:url.toString(),NODE_ENV:'test',FRONTEND_ORIGIN:'http://localhost:3000',SESSION_COOKIE_SECURE:'false'});
  admin=await account('administrator');farmer=await account('farmer');
  const{NestFactory}=require('@nestjs/core');const{AppModule}=require('../dist/app.module.js');const{configureApp}=require('../dist/config/configure-app.js');
  app=await NestFactory.create(AppModule,{bodyParser:false,logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{
  await app?.close();if(created){assert.match(schema,/^agro_test_[a-f0-9]{32}$/);await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`);}await client?.end();
  for(const key of ['DATABASE_URL','NODE_ENV','FRONTEND_ORIGIN','SESSION_COOKIE_SECURE']){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
});
test('only active administrators can access dashboard data',async()=>{
  assert.equal((await request('',null)).status,401);assert.equal((await request('',farmer.cookie)).status,403);
  assert.equal((await fetch(`${base}/api/dashboard`,{method:'POST',headers:{Cookie:admin.cookie}})).status,404);
});
test('an empty database has real zero totals and a dense default 30-day series',async()=>{
  const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();assert.deepEqual(data.inventory,{products:0,packageCodes:0});assert.deepEqual(data.summary,{verifications:0,todayVerifications:0,reviewRequired:0,unresolvedReports:0});
  assert.equal(data.daily.length,30);assert.equal(data.filters.to,data.today);assert.ok(data.daily.every(day=>day.verifications===0&&day.reports===0));
  assert.deepEqual(data.verificationCounties,[]);assert.deepEqual(data.reportCounties,[]);assert.deepEqual(data.topReported,[]);assert.deepEqual(data.recentReports,[]);assert.equal(Object.keys(data.outcomes).length,8);
});
test('seeded summaries count each check once despite multiple package codes per product',async()=>{
  product=(await client.query("INSERT INTO products(name,category,manufacturer,created_by) VALUES('Current maize name','seed','Test supplier',$1) RETURNING *",[admin.id])).rows[0];
  otherProduct=(await client.query("INSERT INTO products(name,category,manufacturer,created_by) VALUES('Fertilizer','fertilizer','Test supplier',$1) RETURNING *",[admin.id])).rows[0];
  for(let i=0;i<4;i++){
    const row=(await client.query("INSERT INTO product_codes(product_id,code_value,batch_number,expiry_date,distribution_county) VALUES($1,$2,'BATCH','2099-01-01','Nakuru') RETURNING *",[i===3?otherProduct.id:product.id,`DASHBOARD-${i}`])).rows[0];if(i===0)code=row;
  }
  checks.push(await insertCheck('verified','Nairobi','device_reported','2024-02-27T21:00:00Z','matched'));
  checks.push(await insertCheck('expired','Nairobi','device_reported','2024-02-28T20:59:59.999Z','expired'));
  for(const[result,county,source]of[['suspicious','Nakuru','device_reported'],['inactive','Nairobi','legacy'],['unregistered','Nairobi','device_reported'],['invalid',null,'unavailable'],['reported','Nakuru','device_reported'],['review_required','Nairobi','device_reported']])checks.push(await insertCheck(result,county,source,'2024-02-28T12:00:00Z'));
  await insertCheck('verified','Nairobi','device_reported','2024-02-28T21:00:00Z','matched');
  await insertCheck('verified','Nairobi','device_reported','2024-02-27T20:59:59.999Z','matched');
  await insertCheck('verified','Nairobi','device_reported',new Date(),'matched');
  await insertReport('Historical maize name',product.id,'Nairobi','submitted','2024-02-28T20:59:59.999Z');
  await insertReport('Renamed maize seed',product.id,'Nakuru','under_review','2024-02-28T21:00:00Z');
  await insertReport('Unlisted input',null,'Nairobi','resolved','2024-02-28T18:00:00Z');
  await insertReport('UNLISTED INPUT',null,'Nairobi','submitted','2024-02-28T19:00:00Z');
  await insertReport('Nakuru fertilizer',otherProduct.id,'Nakuru','under_review','2024-02-28T17:00:00Z');
  await insertReport('Historical maize name',null,null,'submitted','2024-02-28T16:00:00Z');
  await insertReport('Older report',product.id,'Nairobi','submitted','2024-02-01T12:00:00Z');
  const data=await overview();assert.deepEqual(data.inventory,{products:2,packageCodes:4});assert.deepEqual(data.summary,{verifications:8,todayVerifications:1,reviewRequired:1,unresolvedReports:4});
  assert.ok(Object.values(data.outcomes).every(n=>n===1));assert.deepEqual(data.reportCounts,{submitted:3,under_review:1,resolved:1});assert.deepEqual(data.daily,[{date:'2024-02-28',verifications:8,reports:5}]);
});
test('inclusive Kenya dates include midnight boundaries and zero-fill days without activity',async()=>{
  const data=await overview('from=2024-02-28&to=2024-03-01');
  assert.equal(data.summary.verifications,9);assert.deepEqual(data.daily,[{date:'2024-02-28',verifications:8,reports:5},{date:'2024-02-29',verifications:1,reports:1},{date:'2024-03-01',verifications:0,reports:0}]);
  assert.equal((await overview('from=2024-02-27&to=2024-02-27')).summary.verifications,1);
});
test('verification county uses device observations and groups profile counties separately',async()=>{
  const all=await overview();assert.deepEqual(all.verificationCounties.map(row=>[row.county,row.total]),[['Nairobi',4],['Nakuru',2],[null,2]]);
  const nairobi=await overview(`${range}&county=Nairobi`);assert.equal(nairobi.summary.verifications,4);assert.equal(nairobi.summary.reviewRequired,1);assert.equal(nairobi.reportCounts.submitted,2);assert.equal(nairobi.reportCounts.resolved,1);
  assert.equal(nairobi.verificationCounties.length,1);assert.equal(nairobi.reportCounties[0].total,3);
  const unavailable=await overview(`${range}&county=unavailable`);assert.equal(unavailable.summary.verifications,2);assert.equal(unavailable.outcomes.inactive,1);assert.equal(unavailable.outcomes.invalid,1);assert.equal(unavailable.reportCounts.submitted,1);
  assert.equal(unavailable.reportCounties[0].county,null);
});
test('distribution assignments and current product names do not rewrite historical dashboard activity',async()=>{
  await client.query("UPDATE product_codes SET distribution_county='Kiambu'");
  const data=await overview(`${range}&county=Nakuru`);assert.equal(data.summary.verifications,2);assert.equal(data.reportCounties[0].county,'Nakuru');
  assert.ok(data.recentVerifications.every(item=>item.productName==='Name at verification'));
  const all=await overview();assert.equal(all.topReported.find(item=>item.productId===product.id).name,'Historical maize name');
});
test('today and inventory have explicit independent scopes while activity obeys selected dates and counties',async()=>{
  const data=await overview('from=2099-01-01&to=2099-01-02&county=Nairobi');
  assert.deepEqual(data.inventory,{products:2,packageCodes:4});assert.equal(data.summary.verifications,0);assert.equal(data.summary.todayVerifications,1);assert.equal(data.summary.unresolvedReports,0);
  assert.equal((await overview(`${range}&county=Nakuru`)).summary.todayVerifications,0);
});
test('reported-product ranking separates catalogue IDs from case-insensitive unlisted names',async()=>{
  const data=await overview();assert.equal(data.topReported.length,4);assert.equal(data.topReported[0].name,'UNLISTED INPUT');assert.equal(data.topReported[0].total,2);assert.equal(data.topReported[0].unresolved,1);assert.equal(data.topReported[0].productId,null);
  assert.equal(data.topReported.filter(item=>item.name==='Historical maize name').length,2);
  const wide=await overview('from=2024-02-28&to=2024-02-29');assert.equal(wide.topReported.find(item=>item.productId===product.id).total,2);assert.equal(wide.topReported.find(item=>item.productId===product.id).name,'Renamed maize seed');
});
test('recent records are bounded, deterministic, and omit personal data and private review notes',async()=>{
  const data=await overview();assert.equal(data.recentVerifications.length,5);assert.deepEqual(data.recentVerifications.map(row=>row.id),[checks[1],checks[7],checks[6],checks[5],checks[4]]);assert.equal(data.recentReports.length,5);
  assert.deepEqual(Object.keys(data.recentReports[0]).sort(),['createdAt','id','productName','status']);
  assert.equal('farmerName'in data.recentVerifications[0],false);assert.equal('distributionCounty'in data.recentVerifications[0],false);
  assert.equal(data.verificationCounties.reduce((sum,row)=>sum+row.total,0),data.summary.verifications);assert.equal(data.reportCounties.reduce((sum,row)=>sum+row.total,0),Object.values(data.reportCounts).reduce((sum,n)=>sum+n,0));
});
test('invalid, duplicate and oversized date filters are rejected with bounded valid ranges',async()=>{
  for(const query of ['from=2024-02-30','to=2023-02-29','from=0001-01-01','to=10000-01-01','from=2024-03-02&to=2024-03-01','from=2024-01-01&to=2025-01-01','county=Atlantis','county=Nairobi&county=Nakuru','from=2024-01-01&from=2024-02-01','q=secret',"county=%27%20OR%201=1%20--"]){assert.equal((await request(query)).status,400,query);}
  assert.equal((await overview('from=2024-01-01&to=2024-12-31')).daily.length,366);
  const toOnly=await overview('to=2024-02-28');assert.equal(toOnly.daily.length,30);assert.equal(toOnly.filters.from,'2024-01-30');
});
test('a database failure returns unavailable instead of fabricated zero totals',async()=>{
  const db=app.get(require('../dist/database/database.service.js').DatabaseService);const originalTransaction=db.transaction;
  db.transaction=async()=>{throw new Error('test unavailable');};
  try{const response=await request(range);assert.equal(response.status,503);const body=await response.json();assert.equal('summary'in body,false);assert.match(body.message,/temporarily unavailable/);}
  finally{db.transaction=originalTransaction;}
});
test('expired and suspended administrators immediately lose dashboard access',async()=>{
  await client.query("UPDATE users SET status='suspended' WHERE id=$1",[admin.id]);
  try{assert.equal((await request()).status,401);}finally{await client.query("UPDATE users SET status='active' WHERE id=$1",[admin.id]);}
  await client.query("UPDATE auth_sessions SET created_at=CURRENT_TIMESTAMP-interval '2 days',expires_at=CURRENT_TIMESTAMP-interval '1 day' WHERE user_id=$1",[admin.id]);
  try{assert.equal((await request()).status,401);}finally{await client.query("UPDATE auth_sessions SET expires_at=CURRENT_TIMESTAMP+interval '1 hour' WHERE user_id=$1",[admin.id]);}
});
test('all dashboard sections use one consistent read snapshot during concurrent inserts',async()=>{
  const db=app.get(require('../dist/database/database.service.js').DatabaseService);const originalTransaction=db.transaction;
  let inserted=false;
  db.transaction=function(operation){return originalTransaction.call(this,async connection=>{
    const originalQuery=connection.query;
    connection.query=async function(sql,...args){const result=await originalQuery.call(this,sql,...args);if(typeof sql==='string'&&sql.includes('AS products')&&!inserted){inserted=true;await insertCheck('verified','Nairobi','device_reported','2024-02-28T19:30:00Z','matched');}return result;};
    try{return await operation(connection);}finally{connection.query=originalQuery;}
  });};
  try{const data=await overview();assert.equal(inserted,true);assert.equal(data.summary.verifications,8);assert.equal(data.daily[0].verifications,8);assert.equal(data.verificationCounties.reduce((sum,row)=>sum+row.total,0),8);}
  finally{db.transaction=originalTransaction;}
  assert.equal((await overview()).summary.verifications,9);
});
