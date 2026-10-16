import type { NextRequest } from 'next/server';
import { backendUrl } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/auth-types';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };

async function forward(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const path = ((await context.params).path ?? []).join('/');
  const allowed = request.method === 'GET' ? /^(?:[1-9]\d*(?:\/codes)?)?$/
    : request.method === 'POST' ? /^(?:[1-9]\d*\/codes)?$/ : /^[1-9]\d*(?:\/codes\/[1-9]\d*)?$/;
  if (!allowed.test(path)) return Response.json({ message: 'Not found.' }, { status: 404, headers: noStore });
  const headers: Record<string, string> = {};
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) headers.Cookie = `${SESSION_COOKIE}=${token}`;
  let body: Uint8Array | undefined;
  if (request.method !== 'GET') {
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
      body = Buffer.concat(chunks);
    }
  }
  try {
    const upstream = await fetch(`${backendUrl()}/products${path ? `/${path}` : ''}${request.nextUrl.search}`, {
      method: request.method, headers, body: body as BodyInit | undefined,
      cache: 'no-store', signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    return new Response(await upstream.text(), { status: upstream.status, headers: { ...noStore, 'Content-Type': 'application/json' } });
  } catch {
    return Response.json({ message: 'Product management is temporarily unavailable. Please try again.' }, { status: 503, headers: noStore });
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
