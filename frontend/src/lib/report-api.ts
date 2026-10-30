'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

export function useReportRequest() {
  const router = useRouter();
  return useCallback(async function request<T>(path: string, method = 'GET', body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/api/reports${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) { router.replace('/login'); router.refresh(); throw new Error('Your session has ended. Please sign in again.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Unable to complete the report request. Please try again.');
    return result as T;
  }, [router]);
}
