import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createUssdProxy } from './ussd-callback-proxy.mjs';

test('public proxy exposes only the token-bound form callback and preserves the USSD contract', async () => {
  let received = null; let mode = 'ok';
  const api = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    received = { url: request.url, headers: request.headers, body };
    if (mode === 'outage') { response.writeHead(500).end('Private backend error'); return; }
    if (mode === 'invalid') { response.end('Unexpected internal data'); return; }
    response.end('CON AgroVerify\n1 Verify product\n2 Farmer account\n0 Exit');
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const token = randomBytes(32).toString('hex');
  const proxy = createUssdProxy({ token, upstream: `http://127.0.0.1:${api.address().port}/api/ussd/callback/${token}` });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const endpoint = `${base}/ussd/${token}`;
  try {
    for (const route of ['/', '/api/auth/login', '/api/health/ready', '/api/products', '/ussd/wrong']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal(received, null);
    assert.equal((await fetch(endpoint)).status, 404);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 415);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'x'.repeat(9000) })).status, 413);
    const form = new URLSearchParams({sessionId:'connection-check',serviceCode:'*384*75241#',phoneNumber:'+254700000000',text:''}).toString();
    const response = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded',Cookie:'private-cookie',Origin:'https://untrusted.invalid'},body:form });
    assert.equal(response.status, 200); assert.match(await response.text(), /^CON AgroVerify/); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(received.body, form); assert.equal(received.headers.cookie, undefined); assert.equal(received.headers.origin, undefined); assert.equal(received.url, `/api/ussd/callback/${token}`);
    for (const failure of ['outage','invalid']) { mode=failure; const result=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});assert.equal(result.status,503);assert.match(await result.text(),/^END Service temporarily unavailable/); }
  } finally {
    await Promise.all([new Promise(resolve=>proxy.close(resolve)),new Promise(resolve=>api.close(resolve))]);
  }
});
