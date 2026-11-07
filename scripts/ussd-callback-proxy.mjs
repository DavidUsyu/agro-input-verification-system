import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Public tunnels terminate at this narrow listener instead of the full API.
export function createUssdProxy({ token, upstream }) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Configure USSD_CALLBACK_TOKEN first.');
  const expected = createHash('sha256').update(`/ussd/${token}`).digest();
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const supplied = createHash('sha256').update(request.url ?? '').digest();
    if (request.method !== 'POST' || !timingSafeEqual(expected, supplied)) {
      response.writeHead(404).end('Not found.'); request.resume(); return;
    }
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
      response.writeHead(415).end('END Unsupported request format.'); request.resume(); return;
    }
    if (Number(request.headers['content-length'] ?? 0) > 8192) {
      response.writeHead(413).end('END Request too large.'); request.resume(); return;
    }
    try {
      let size = 0; const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) { response.writeHead(413).end('END Request too large.'); return; }
        chunks.push(chunk);
      }
      const result = await fetch(upstream, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: Buffer.concat(chunks), redirect: 'error', signal: AbortSignal.timeout(6500),
      });
      if (!result.ok) { response.writeHead(503).end('END Service temporarily unavailable. Please try again.'); return; }
      const message = await result.text();
      if (!/^(CON|END) /.test(message) || message.length > 160) throw new Error('Invalid callback response.');
      response.end(message);
    } catch {
      if (!response.writableEnded) response.writeHead(503).end('END Service temporarily unavailable. Please try again.');
    }
  });
  server.requestTimeout = 8000;
  server.headersTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = parseEnv(await readFile(new URL('../backend/.env', import.meta.url), 'utf8'));
  const token = env.USSD_CALLBACK_TOKEN ?? '';
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid backend port.');
  const server = createUssdProxy({ token, upstream: `http://127.0.0.1:${port}/api/ussd/callback/${token}` });
  server.listen(3002, '127.0.0.1', () => console.log('USSD callback proxy ready on 127.0.0.1:3002. Request bodies and callback secrets are not logged.'));
  server.on('error', () => { console.error('Unable to start the callback proxy. Check whether port 3002 is in use.'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
}
