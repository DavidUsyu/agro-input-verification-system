import type { NextRequest } from 'next/server';
import { backendUrl } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/auth-types';

export const runtime='nodejs';
const noStore={'Cache-Control':'no-store'};
export async function GET(request:NextRequest) {
  const token=request.cookies.get(SESSION_COOKIE)?.value;
  try {
    const upstream=await fetch(`${backendUrl()}/dashboard${request.nextUrl.search}`,{
      headers:token && /^[a-f0-9]{64}$/.test(token) ? {Cookie:`${SESSION_COOKIE}=${token}`} : {},
      cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error',
    });
    return new Response(await upstream.text(),{status:upstream.status,headers:{...noStore,'Content-Type':'application/json'}});
  }catch{return Response.json({message:'The dashboard is temporarily unavailable. Please try again.'},{status:503,headers:noStore});}
}
