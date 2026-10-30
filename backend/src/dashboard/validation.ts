import { BadRequestException } from '@nestjs/common';
import { countyNames } from '../location/county-location';

function date(value: unknown): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Dates must use YYYY-MM-DD (year 1000–9999).');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new BadRequestException('Choose valid calendar dates.');
  return value;
}

export function parseDashboardQuery(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Choose valid dashboard filters.');
  const data = value as Record<string,unknown>;
  if (Object.keys(data).some(key=>!['from','to','county'].includes(key))) throw new BadRequestException('The request contains unsupported filters.');
  const county = data.county === undefined || data.county === '' ? null : data.county;
  if (county !== null && (typeof county !== 'string' || (county !== 'unavailable' && !countyNames.includes(county)))) throw new BadRequestException('Choose a valid county.');
  return {from:date(data.from),to:date(data.to),county:county as string | null};
}

export function dashboardRange(input: ReturnType<typeof parseDashboardQuery>, today: string) {
  const to = input.to ?? today;
  const start = new Date(`${to}T00:00:00Z`); start.setUTCDate(start.getUTCDate()-29);
  const from = input.from ?? (start.getUTCFullYear()<1000 ? '1000-01-01' : start.toISOString().slice(0,10));
  const days = (Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000+1;
  if (days < 1) throw new BadRequestException('From date must be on or before the to date.');
  if (days > 366) throw new BadRequestException('Choose a date range of at most 366 days.');
  return {from,to,county:input.county};
}
