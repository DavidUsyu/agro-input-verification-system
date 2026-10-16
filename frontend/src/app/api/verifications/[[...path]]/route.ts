import type { NextRequest } from 'next/server';
import { backendUrl } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/auth-types';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };
async function forward(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const path = ((await context.params).path ?? []).join('/');
  if (!(request.method === 'GET' ? ['', 'mine'] : ['']).includes(path)) return Response.json({ message: 'Not found.' }, { status: 404, headers: noStore });
  const headers: Record<string, string> = {};
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Preserve the presence of an invalid cookie so a failed session is not silently treated as a guest.
  if (token !== undefined) headers.Cookie = `${SESSION_COOKIE}=${/^[a-f0-9]{64}$/.test(token) ? token : 'invalid'}`;
  let body: string | undefined;
  if (request.method === 'POST') {
    headers.Origin = request.headers.get('origin') ?? '';
    headers['Content-Type'] = request.headers.get('content-type') ?? '';
    const reader = request.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length;
        if (size > 8192) { await reader.cancel(); return Response.json({ message: 'The request is too large.' }, { status: 413, headers: noStore }); }
        chunks.push(chunk.value);
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
  }
  try {
    const upstream = await fetch(`${backendUrl()}/verifications${path ? `/${path}` : ''}${request.nextUrl.search}`, { method: request.method, headers, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    const responseHeaders = new Headers({ ...noStore, 'Content-Type': 'application/json' });
    const retryAfter = upstream.headers.get('retry-after'); if (retryAfter) responseHeaders.set('Retry-After', retryAfter);
    return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch { return Response.json({ message: 'Verification is temporarily unavailable. Please try again shortly.' }, { status: 503, headers: noStore }); }
}
export const POST = forward;
export const GET = forward;
