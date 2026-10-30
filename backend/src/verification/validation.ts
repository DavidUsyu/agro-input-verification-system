import { BadRequestException } from '@nestjs/common';
import type { DeviceLocation } from '../location/county-location';

export const outcomes = ['verified', 'expired', 'inactive', 'suspicious', 'unregistered', 'invalid', 'reported', 'review_required'] as const;
export type VerificationOutcome = typeof outcomes[number];

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Submit a JSON object.');
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new BadRequestException('The request contains unsupported fields.');
  return value as Record<string, unknown>;
}

export function parseVerification(value: unknown) {
  const data = object(value, ['code', 'location']);
  if (data.code !== undefined && typeof data.code !== 'string') throw new BadRequestException('The product code must be text.');
  const enteredCode = ((data.code ?? '') as string).trim();
  if (enteredCode.length > 80 || [...enteredCode].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new BadRequestException('Enter a product code of up to 80 characters without control characters.');
  }
  // Keep submitted input in history; lookup uses an uppercase version.
  let location: DeviceLocation | null = null;
  if (data.location !== undefined && data.location !== null) {
    const raw = object(data.location, ['latitude', 'longitude', 'accuracy', 'timestamp']);
    for (const key of ['latitude', 'longitude', 'accuracy', 'timestamp']) {
      if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) throw new BadRequestException('Location must contain numeric latitude, longitude, accuracy and timestamp.');
    }
    location = raw as unknown as DeviceLocation;
    if (Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180 || location.accuracy < 0 || location.accuracy > 20000000 || location.timestamp < 0 || location.timestamp > 8640000000000000) throw new BadRequestException('Invalid location measurement.');
  }
  return { enteredCode, normalizedCode: enteredCode.toUpperCase(), valid: /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(enteredCode), location };
}

function date(value: unknown, label: string): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must be a date in YYYY-MM-DD format.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid date.`);
  return value;
}

export function parseHistory(value: unknown, administrator: boolean) {
  const data = object(value, ['q', 'result', 'from', 'to', 'page', ...(administrator ? ['actor'] : [])]);
  const page = data.page ?? '1';
  if (typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) throw new BadRequestException('Page must be a positive number up to 999999.');
  const q = data.q ?? '';
  if (typeof q !== 'string' || q.length > 160) throw new BadRequestException('Search must be text of up to 160 characters.');
  const result = data.result === '' || data.result === undefined ? null : data.result;
  if (result !== null && (typeof result !== 'string' || !(outcomes as readonly string[]).includes(result))) throw new BadRequestException('Choose a valid result.');
  const actor = administrator && data.actor !== '' && data.actor !== undefined ? data.actor : null;
  if (actor !== null && (typeof actor !== 'string' || !['guest', 'farmer', 'administrator'].includes(actor))) throw new BadRequestException('Choose a valid account type.');
  const from = date(data.from, 'Start date'); const to = date(data.to, 'End date');
  if (from && to && from > to) throw new BadRequestException('End date must be on or after start date.');
  return { q: q.trim() || null, result, actor, from, to, page: Number(page), pageSize: 20 };
}
