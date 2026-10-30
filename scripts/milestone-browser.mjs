import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  const downloadPath = path.join(artifacts, 'package-code-downloads', schema);
  await mkdir(downloadPath, { recursive: true });
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
  await command('Browser.grantPermissions',{origin:webBase,permissions:['geolocation']});
  await command('Emulation.setGeolocationOverride',{latitude:-0.3031,longitude:36.0800,accuracy:30});
  await client.query("SELECT set_config('search_path', $1, false)", [schemaIdentifier(schema)]);
  await seedDemo(client); await seedDemo(client);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM products')).rows[0].n, 2);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM product_codes')).rows[0].n, 5);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  for (const route of ['/admin','/admin/products','/admin/verifications','/farmer/history','/farmer/reports/new','/admin/reports']) { await visit(route); await until("location.pathname === '/login' && !!document.querySelector('form [name=identifier]')"); }
  assert.equal(await evaluate("fetch('/api/dashboard').then(r=>r.status)"),401);
  await delay(500); await fill({identifier:'browser-admin@example.invalid', password}); await submit();
  await until("location.pathname === '/admin' && document.body.textContent.includes('Browser Administrator')");
  await until("!!document.querySelector('.dashboard-content')");
  assert.equal(await evaluate("document.querySelector('[data-metric=products]').textContent"),'2');
  assert.equal(await evaluate("document.querySelector('[data-metric=codes]').textContent"),'5');
  assert.equal(await evaluate("document.querySelector('[data-metric=verifications]').textContent"),'0');
  assert.equal(await evaluate("document.body.textContent.includes('No verification or report activity in this period')"),true);
  const initialDashboard=await evaluate("fetch('/api/dashboard').then(r=>r.json())");assert.equal(initialDashboard.daily.length,30);
  await click('Manage products','a'); await until("location.pathname === '/admin/products' && !!document.querySelector('tbody')");
  await click('Add product'); await until("!!document.querySelector('form [name=manufacturer]')");
  await fill({name:'Assessment maize seed',manufacturer:'Assessment supplier only',registrationNo:'DEMO-ASSESSMENT',description:'Demonstration data for the end-to-end milestone.'}); await submit();
  await until("document.body.textContent.includes('Product created.') && document.body.textContent.includes('No codes found')");
  await click('New code'); await until("!!document.querySelector('form [name=distributionCounty]')");
  assert.equal(await evaluate("!!document.querySelector('form [name=codeValue]')"),false);
  await fill({quantity:'3',batchNumber:'ASSESSMENT-BATCH',distributionCounty:'Nakuru',manufactureDate:'2020-01-01',expiryDate:'2099-01-01'});
  await screenshot('generated-code-form-desktop.png');
  await evaluate("document.querySelector('.code-form').requestSubmit()");
  await until("document.body.textContent.includes('3 package codes generated for batch ASSESSMENT-BATCH.') && !!document.querySelector('tbody')");
  const createdProduct = (await client.query("SELECT id FROM products WHERE name='Assessment maize seed'")).rows[0].id;
  const packageRows = (await client.query('SELECT code_value,batch_number FROM product_codes WHERE product_id=$1',[createdProduct])).rows;
  assert.equal(packageRows.length,3); assert.equal(new Set(packageRows.map(row=>row.code_value)).size,3);
  assert.ok(packageRows.every(row=>row.batch_number==='ASSESSMENT-BATCH'));
  const visibleCodes = await evaluate("document.querySelector('[aria-label=\"Generated package codes\"] textarea').value.split('\\n')");
  assert.deepEqual([...visibleCodes].sort(),packageRows.map(row=>row.code_value).sort());
  assert.equal(await evaluate("!!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Download codes')"),true);
  await click('Download codes');
  let downloadedCodes = [];
  for (let attempt=0; attempt<50; attempt++) {
    try { downloadedCodes = (await readFile(path.join(downloadPath,'package-codes.txt'),'utf8')).trim().split(/\r?\n/); } catch { /* Downloading. */ }
    if (JSON.stringify([...downloadedCodes].sort())===JSON.stringify([...visibleCodes].sort())) break;
    await delay(100);
  }
  assert.deepEqual([...downloadedCodes].sort(),[...visibleCodes].sort());
  await evaluate("document.querySelector('[aria-label=\"Generated package codes\"]').scrollIntoView({block:'center',behavior:'instant'})");
  await screenshot('bulk-package-codes-desktop.png');
  await command('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
  await evaluate("document.querySelector('[aria-label=\"Generated package codes\"]').scrollIntoView({block:'center',behavior:'instant'})");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('bulk-package-codes-mobile.png');
  await command('Emulation.setDeviceMetricsOverride', { width:1440, height:1100, deviceScaleFactor:1, mobile:false });
  const packageCode = packageRows[0].code_value;
  assert.match(packageCode,/^AGV-(?:[0-9A-Z]{4}-){4}[0-9A-Z]{4}$/);
  await visit('/admin'); await until("!!document.querySelector('.account-heading')"); await logout();
  console.log('Administrator product and code creation passed. Checking guest outcomes?');
  await checkCode(packageCode.toLowerCase(),'Record matched');
  assert.equal(await evaluate("document.body.textContent.includes('Assessment maize seed')"),true);
  assert.equal(await evaluate("document.body.textContent.includes('ASSESSMENT-BATCH')"),true);
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/farmer/history\"]')"),false);
  await screenshot('milestone-verification-desktop.png');
  await command('Emulation.setGeolocationOverride',{latitude:-1.286389,longitude:36.817223,accuracy:30});
  await checkCode(packageCode,'Verification requires review');
  assert.equal(await evaluate("document.querySelector('.verification-result').textContent.includes('Nakuru')"),false);
  assert.equal(await evaluate("document.querySelector('.verification-result').textContent.includes('Nairobi')"),false);
  await screenshot('location-review-desktop.png');
  await command('Browser.setPermission',{permission:{name:'geolocation'},setting:'denied',origin:webBase});
  await checkCode(packageCode,'Verification requires review');
  assert.equal(await evaluate("document.body.textContent.includes('Current location was unavailable')"),true);
  await command('Browser.grantPermissions',{origin:webBase,permissions:['geolocation']});
  await command('Emulation.setGeolocationOverride',{latitude:-0.3031,longitude:36.0800,accuracy:15000});
  await checkCode(packageCode,'Verification requires review');
  await command('Emulation.setGeolocationOverride',{latitude:-0.3031,longitude:36.0800,accuracy:30});
  for (const [code,label] of [['DEMO-SEED-EXPIRED','Expired'],['DEMO-FERT-FLAGGED','Flagged for review'],['DEMO-FERT-INACTIVE','Inactive'],['DEMO-UNKNOWN','Code not found'],['HAS SPACE','Invalid code']]) await checkCode(code,label);
  const beforeLeaving=(await client.query('SELECT count(*)::int AS n FROM verification_records')).rows[0].n;
  await visit('/verify'); await until("!!document.querySelector('form [name=code]')"); await delay(250);
  await evaluate("window.__savedGeolocation=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition=(callback)=>{window.__completeLocation=callback;}");
  await fill({code:packageCode}); await submit(); await until("!!window.__completeLocation");
  await evaluate("document.querySelector('.brand').click()"); await until("location.pathname === '/'");
  await evaluate("window.__completeLocation({coords:{latitude:-0.3031,longitude:36.0800,accuracy:30},timestamp:Date.now()}); navigator.geolocation.getCurrentPosition=window.__savedGeolocation");
  await delay(300);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM verification_records')).rows[0].n,beforeLeaving,'Leaving the page must cancel a pending location verification');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await checkCode('DEMO-SEED-OK','Record matched');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('milestone-verification-mobile.png');
  await visit('/register'); await until("!!document.querySelector('form [name=fullName]')"); await delay(300);
  await fill({fullName:'Milestone Farmer',email:'milestone-farmer@example.invalid',phone:'0712345678',county:'Nairobi',password,confirmPassword:password}); await submit();
  await until("location.pathname === '/farmer' && document.body.textContent.includes('Milestone Farmer')");
  await checkCode(packageCode,'Record matched');
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/farmer/history\"]')"),true);
  await click('View my history','a');
  await until("location.pathname === '/farmer/history' && !!document.querySelector('.history-record')");
  await evaluate("document.querySelector('summary').click()"); await screenshot('milestone-farmer-history-mobile.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  const personal = await evaluate("fetch('/api/verifications/mine').then(r=>r.json())");
  assert.equal(personal.total,1); assert.equal(personal.items[0].product.name,'Assessment maize seed');
  assert.equal(personal.items[0].county,undefined); assert.equal(personal.items[0].distributionCounty,undefined); assert.equal(personal.items[0].locationStatus,undefined);
  await click('Report a concern','a');
  await until("!!document.querySelector('form[aria-label=\"Report a product\"]') && document.querySelector('select:not([name])').options.length>1");
  assert.equal(await evaluate("document.querySelector('[name=codeValue]').value"),packageCode);
  assert.equal(await evaluate("document.querySelector('[name=codeValue]').readOnly"),true);
  await evaluate(`(() => {const select=document.querySelector('select:not([name])');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(createdProduct)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until("document.querySelector('[name=productName]').value==='Assessment maize seed'");
  await fill({reason:'damaged_packaging',description:'The package seal was broken before purchase.',sellerName:'Assessment shop',sellerLocation:'Test market',county:'Nakuru'});
  await evaluate("document.querySelector('form[aria-label=\"Report a product\"]').scrollIntoView({behavior:'instant'})");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('report-form-mobile.png'); await submit();
  await until("document.body.textContent.includes('Report received')");
  const reportId=(await client.query('SELECT id FROM product_reports WHERE verification_id=$1',[personal.items[0].id])).rows[0].id;
  await click('View my reports','a'); await until("!!document.querySelector('.report-record')");
  await evaluate("document.querySelector('.report-record summary').click()");
  assert.equal(await evaluate("document.body.textContent.includes('The package seal was broken before purchase.')"),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('farmer-reports-mobile.png');
  await visit('/farmer/reports/new'); await until("!!document.querySelector('[name=productName]')");
  await fill({productName:'Unlisted fertilizer package',category:'fertilizer',reason:'wrong_label',description:'The label does not identify the supplier clearly.'}); await submit();
  await until("document.body.textContent.includes('Report received')");
  const ownReports=await evaluate("fetch('/api/reports/mine').then(r=>r.json())");assert.equal(ownReports.total,2);
  assert.equal(ownReports.items.find(item=>item.productName==='Unlisted fertilizer package').codeValue,null);
  await visit('/admin/verifications'); await until("location.pathname === '/farmer'");
  assert.equal(await evaluate("fetch('/api/verifications').then(r=>r.status)"),403);
  await logout();
  await visit('/register'); await until("!!document.querySelector('form [name=fullName]')"); await delay(300);
  await fill({fullName:'Second Milestone Farmer',email:'second-farmer@example.invalid',password,confirmPassword:password}); await submit();
  await until("location.pathname === '/farmer' && document.body.textContent.includes('Second Milestone Farmer')");
  await visit('/farmer/history'); await until("document.body.textContent.includes('No verification records found')");
  assert.equal((await evaluate("fetch('/api/verifications/mine').then(r=>r.json())")).total,0);
  assert.equal(await evaluate("fetch('/api/dashboard').then(r=>r.status)"),403);
  await visit('/farmer/reports'); await until("document.body.textContent.includes('No reports found')");
  assert.equal(await evaluate(`fetch('/api/reports/${reportId}').then(r=>r.status)`),404);
  await visit('/farmer'); await until("!!document.querySelector('.account-heading')"); await logout();
  await fill({identifier:'browser-admin@example.invalid',password}); await submit(); await until("location.pathname === '/admin'");
  console.log('Guest outcomes and isolated farmer history passed. Checking administrator history?');
  await visit('/admin/verifications'); await until("!!document.querySelector('.history-record')");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await visit('/admin/reports');await until("document.querySelectorAll('.report-record').length===2");
  await evaluate(`Array.from(document.querySelectorAll('.report-record')).find(el=>el.textContent.includes('#${reportId} —')).querySelector('summary').click()`);
  async function saveReportReview(values) {
    await evaluate(`(() => {const form=document.querySelector('form[aria-label="Review report ${reportId}"]');for(const [name,value] of Object.entries(${JSON.stringify(values)})){const input=form.querySelector('[name="'+name+'"]');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
    await evaluate(`document.querySelector('form[aria-label="Review report ${reportId}"]').requestSubmit()`);
  }
  await saveReportReview({response:'We are investigating the packaging concern.',internalNote:'PRIVATE-BROWSER-REVIEW'});
  await until(`document.body.textContent.includes('Review saved for report #${reportId}.') && !document.body.textContent.includes('Loading reports')`);
  await evaluate(`Array.from(document.querySelectorAll('.report-record')).find(el=>el.textContent.includes('#${reportId} —')).querySelector('summary').click()`);
  await evaluate(`(() => {const select=document.querySelector('form[aria-label="Review report ${reportId}"] [name=status]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'resolved');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`!!document.querySelector('form[aria-label="Review report ${reportId}"] [name=resolution]')`);
  await saveReportReview({resolution:'insufficient_information',response:'Please provide a receipt so we can investigate further.',internalNote:'PRIVATE-BROWSER-REVIEW'});
  await until("!!document.querySelector('.report-record .report-resolved') && !document.body.textContent.includes('Loading reports')");
  await evaluate(`Array.from(document.querySelectorAll('.report-record')).find(el=>el.textContent.includes('#${reportId} —')).querySelector('summary').click()`);
  await evaluate("document.querySelector('.report-review').scrollIntoView({behavior:'instant',block:'center'})");
  await screenshot('administrator-report-review-desktop.png');
  assert.equal((await client.query('SELECT count(*)::int AS n FROM report_reviews WHERE report_id=$1',[reportId])).rows[0].n,2);
  await visit('/admin');await until("!!document.querySelector('.account-heading')");await logout();
  await fill({identifier:'milestone-farmer@example.invalid',password});await submit();await until("location.pathname==='/farmer'");
  await visit('/farmer/reports');await until("!!document.querySelector('.report-record .report-resolved') && !document.body.textContent.includes('Loading reports')");
  await evaluate(`Array.from(document.querySelectorAll('.report-record')).find(el=>el.textContent.includes('#${reportId} —')).querySelector('summary').click()`);
  assert.equal(await evaluate("document.body.textContent.includes('Please provide a receipt so we can investigate further.')"),true);
  const visibleReports=await evaluate("fetch('/api/reports/mine').then(r=>r.json())");assert.equal(JSON.stringify(visibleReports).includes('PRIVATE-BROWSER-REVIEW'),false);
  await visit('/farmer');await until("!!document.querySelector('.account-heading')");await logout();
  await fill({identifier:'browser-admin@example.invalid',password});await submit();await until("location.pathname==='/admin'");
  await visit('/admin/verifications');await until("!!document.querySelector('.history-record')");
  await fill({actor:'guest',result:'review_required'}); await submit();
  await until("document.querySelectorAll('.history-record').length === 3 && !document.body.textContent.includes('Loading verification history')");
  await evaluate("document.querySelectorAll('.history-record details').forEach(el=>el.open=true)");
  assert.equal(await evaluate("document.body.textContent.includes('distribution mismatch') && document.body.textContent.includes('Nakuru') && document.body.textContent.includes('Nairobi')"),true);
  await screenshot('location-admin-review-desktop.png');
  await fill({actor:'farmer',result:'verified'}); await submit(); await until("document.querySelectorAll('.history-record').length === 1 && !document.body.textContent.includes('Loading verification history')");
  assert.equal(await evaluate("document.body.textContent.includes('Milestone Farmer')"),true);
  await evaluate("document.querySelector('summary').click()"); await screenshot('milestone-admin-history-desktop.png');
  await visit('/admin/products'); await until("!!document.querySelector('tbody')");
  await evaluate("document.querySelector('button[aria-label=\"Manage Assessment maize seed\"]').click()"); await until("!!document.querySelector('form [name=manufacturer]')");
  await fill({name:'Updated assessment maize seed',status:'inactive'}); await submit(); await until("document.body.textContent.includes('Product updated.')");
  await checkCode(packageCode,'Inactive');
  assert.equal(await evaluate("document.body.textContent.includes('Updated assessment maize seed')"),true);
  const saved = (await client.query('SELECT product_snapshot,result FROM verification_records WHERE id=$1',[personal.items[0].id])).rows[0];
  assert.equal(saved.result,'verified'); assert.equal(saved.product_snapshot.name,'Assessment maize seed');
  assert.equal((await client.query('SELECT name FROM products WHERE id=$1',[createdProduct])).rows[0].name,'Updated assessment maize seed');
  console.log('Checking dashboard totals, filters, navigation, recovery and responsive charts.');
  await visit('/admin');await until("!!document.querySelector('.dashboard-content')");
  const dashboard=await evaluate("fetch('/api/dashboard').then(r=>r.json())");
  const checkCount=(await client.query('SELECT count(*)::int AS n FROM verification_records')).rows[0].n;
  assert.equal(dashboard.summary.verifications,checkCount);assert.equal(dashboard.summary.unresolvedReports,1);
  assert.equal(dashboard.inventory.products,3);assert.equal(dashboard.inventory.packageCodes,8);
  assert.equal(dashboard.daily.reduce((sum,day)=>sum+day.verifications,0),checkCount);
  assert.equal(dashboard.daily.reduce((sum,day)=>sum+day.reports,0),2);
  assert.equal(await evaluate("Number(document.querySelector('[data-metric=verifications]').textContent.replaceAll(',',''))"),checkCount);
  const countyChartTotals=await evaluate("Array.from(document.querySelectorAll('[aria-label=\"Verification county bar chart\"] [data-total]')).reduce((sum,row)=>sum+Number(row.dataset.total),0)");
  assert.equal(countyChartTotals,checkCount);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('[aria-label=\"Report county bar chart\"] [data-total]')).reduce((sum,row)=>sum+Number(row.dataset.total),0)"),2);
  await evaluate("document.querySelector('[aria-label=\"Verification county bar chart\"]').scrollIntoView({block:'center',behavior:'instant'})");
  await screenshot('county-bar-chart-desktop.png');
  await evaluate("scrollTo({top:0,behavior:'instant'})");await screenshot('administrator-dashboard-desktop.png');
  await evaluate("document.querySelector('.dashboard-grid').scrollIntoView({block:'center',behavior:'instant'})");await screenshot('administrator-dashboard-charts-desktop.png');
  await evaluate("document.querySelector('.chart-data summary').click()");
  assert.equal(await evaluate("document.querySelectorAll('.chart-data:not(.county-data) tbody tr').length"),30);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate("document.querySelector('.dashboard-stats').scrollIntoView({block:'start',behavior:'instant'})");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);await screenshot('administrator-dashboard-mobile.png');
  await evaluate("document.querySelector('[aria-label=\"Verification county bar chart\"]').scrollIntoView({block:'center',behavior:'instant'})");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);await screenshot('county-bar-chart-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  const nairobi=await evaluate("fetch('/api/dashboard?county=Nairobi').then(r=>r.json())");
  await evaluate("document.querySelector('[aria-label=\"Verification county bar chart\"] [data-county=Nairobi]').click()");
  await until("!!document.querySelector('.dashboard-content') && document.querySelector('.dashboard-period').textContent.includes('· Nairobi')");
  assert.equal(await evaluate("document.querySelector('form [name=county]').value"),'Nairobi');
  assert.equal(await evaluate("Number(document.querySelector('[data-metric=verifications]').textContent.replaceAll(',',''))"),nairobi.summary.verifications);
  assert.equal(await evaluate("document.querySelector('[data-metric=products]').textContent"),'3');
  await fill({from:'2099-01-01',to:'2099-01-03'});await submit();await until("!!document.querySelector('.dashboard-content') && document.querySelector('.dashboard-period').textContent.includes('2099')");
  assert.equal(await evaluate("document.querySelector('[data-metric=verifications]').textContent"),'0');
  assert.equal(await evaluate("document.body.textContent.includes('No verification or report activity in this period')"),true);
  await click('Reset filters');await until("!!document.querySelector('.dashboard-content') && !document.querySelector('.dashboard-period').textContent.includes('2099')");
  await click('Last 7 days');await until("!!document.querySelector('.dashboard-content') && document.querySelectorAll('.chart-data:not(.county-data) tbody tr').length===7");
  await click('Reset filters');await until("!!document.querySelector('.dashboard-content') && document.querySelectorAll('.chart-data:not(.county-data) tbody tr').length===30");
  await fill({from:'2026-10-02',to:'2026-10-01'});await submit();await until("!!document.querySelector('[role=alert]') && document.body.textContent.includes('From date must be on or before')");
  assert.equal(await evaluate("!!document.querySelector('.dashboard-content')"),false);
  await click('Reset filters');await until("!!document.querySelector('.dashboard-content')");
  await evaluate("window.__dashboardFetch=window.fetch;window.fetch=(url,options)=>String(url).startsWith('/api/dashboard') ? Promise.resolve(new Response(JSON.stringify({message:'Dashboard test outage.'}),{status:503,headers:{'Content-Type':'application/json'}})) : window.__dashboardFetch(url,options)");
  await click('Refresh dashboard');await until("document.body.textContent.includes('Dashboard test outage.')");
  assert.equal(await evaluate("!!document.querySelector('.dashboard-content')"),false);
  await evaluate("window.fetch=window.__dashboardFetch");await click('Try again');await until("!!document.querySelector('.dashboard-content')");
  await evaluate("document.querySelector('.report-status-totals a[href=\"/admin/reports?status=submitted\"]').click()");
  await until("location.pathname==='/admin/reports' && document.querySelectorAll('.report-record').length===1 && !document.body.textContent.includes('Loading reports')");
  assert.equal(await evaluate("document.querySelector('form [name=status]').value"),'submitted');
  await visit('/admin');await until("!!document.querySelector('.dashboard-content')");
  await evaluate("document.querySelector('.dashboard-recent a[href^=\"/admin/verifications?q=\"]').click()");
  await until("location.pathname==='/admin/verifications' && !!document.querySelector('.history-record')");
  assert.equal(await evaluate("document.querySelector('form [name=q]').value"),dashboard.recentVerifications[0].enteredCode);
  await visit('/admin');await until("!!document.querySelector('.dashboard-content')");
  await evaluate("document.querySelector('.dashboard-recent a[href^=\"/admin/reports?q=\"]').click()");
  await until("location.pathname==='/admin/reports' && !!document.querySelector('.report-record')");
  assert.equal(await evaluate("document.querySelector('form [name=q]').value"),dashboard.recentReports[0].productName);
  await client.query("UPDATE auth_sessions SET created_at=CURRENT_TIMESTAMP-interval '2 days',expires_at=CURRENT_TIMESTAMP-interval '1 day' WHERE user_id=(SELECT id FROM users WHERE email='browser-admin@example.invalid')");
  assert.equal(await evaluate("fetch('/api/dashboard').then(r=>r.status)"),401);
  await visit('/verify'); await until("!!document.querySelector('form [name=code]')"); await delay(250); await fill({code:'DEMO-SEED-OK'}); await submit();
  await until("!!document.querySelector('[role=alert]') && document.body.textContent.includes('Continue as guest')");
  await click('Continue as guest'); await until("document.body.textContent.includes('You are signed out.')");
  await submit(); await until("!!document.querySelector('#result-heading')");
  assert.equal(await evaluate("document.querySelector('#result-heading').textContent"),'Record matched');
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/farmer/history\"]')"),false);
  assert.equal((await command('Network.getCookies',{urls:[webBase]})).cookies.some(item=>item.name==='agro_session'),false);
  assert.equal(await evaluate("fetch('/api/verifications').then(r=>r.status)"),401);
  assert.deepEqual(exceptions,[]);
  console.log('Milestone browser checks passed: dashboard totals/charts/filters/recovery/navigation, bulk package generation/download, location verification, reporting/review/privacy, history isolation, preserved snapshots and desktop/mobile layouts.');
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await command('Browser.close').catch(() => {}); socket.close(); } else browser?.kill();
  for (const request of pending.values()) clearTimeout(request.timeout);
  if (web && web.exitCode === null) { web.kill(); await delay(500); }
  await app?.close();
  if (schemaCreated) { assert.match(schema, /^agro_test_[a-f0-9]{32}$/); await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`); }
  await client?.end();
}
