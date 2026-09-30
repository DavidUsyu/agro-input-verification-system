import type { NextRequest } from 'next/server';
import { backendUrl } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/auth-types';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };

async function forward(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  const allowed = request.method === 'GET' ? ['me', 'farmer', 'administrator'] : ['register', 'login', 'logout'];
  if (!allowed.includes(action)) return Response.json({ message: 'Not found.' }, { status: 404, headers: noStore });
  const headers: Record<string, string> = {};
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) headers.Cookie = `${SESSION_COOKIE}=${token}`;
  let body: string | undefined;
  if (request.method === 'POST') {
    headers.Origin = request.headers.get('origin') ?? '';
    headers['Content-Type'] = request.headers.get('content-type') ?? '';
    const reader = request.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 8192) {
          await reader.cancel();
          return Response.json({ message: 'The request is too large.' }, { status: 413, headers: noStore });
        }
        chunks.push(chunk.value);
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
  }
  try {
    const upstream = await fetch(`${backendUrl()}/auth/${action}`, {
      method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    const responseHeaders = new Headers(noStore);
    responseHeaders.set('Content-Type', 'application/json');
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('Set-Cookie', cookie);
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) responseHeaders.set('Retry-After', retryAfter);
    return new Response(upstream.status === 204 ? null : await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ message: 'The sign-in service is unavailable. Please try again shortly.' }, { status: 503, headers: noStore });
  }
}

export const GET = forward;
export const POST = forward;
