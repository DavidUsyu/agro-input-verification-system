import type { NextRequest } from 'next/server';
import { backendUrl } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/auth-types';

export const runtime = 'nodejs';
const noStore = {'Cache-Control':'no-store'};
async function forward(request: NextRequest, context: {params:Promise<{action:string}>}) {
  const {action} = await context.params;
  if (!(request.method==='GET' ? action==='settings' : ['settings','simulate'].includes(action))) return Response.json({message:'Not found.'},{status:404,headers:noStore});
  const headers: Record<string,string> = {};
  const token=request.cookies.get(SESSION_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) headers.Cookie=`${SESSION_COOKIE}=${token}`;
  let body: Uint8Array | undefined;
  if (request.method==='POST') {
    headers.Origin=request.headers.get('origin') ?? '';
    headers['Content-Type']=request.headers.get('content-type') ?? '';
    const reader=request.body?.getReader();
    if(reader){const chunks:Uint8Array[]=[];let size=0;while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>8192){await reader.cancel();return Response.json({message:'The request is too large.'},{status:413,headers:noStore});}chunks.push(chunk.value);}body=Buffer.concat(chunks);}
  }
  try {
    const upstream=await fetch(`${backendUrl()}/ussd/${action}`,{method:request.method,headers,body:body as BodyInit|undefined,cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'error'});
    return new Response(await upstream.text(),{status:upstream.status,headers:{...noStore,'Content-Type':'application/json'}});
  } catch { return Response.json({message:'USSD service unavailable. Please try again.'},{status:503,headers:noStore}); }
}
export const GET=forward;
export const POST=forward;
