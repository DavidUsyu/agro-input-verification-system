import { BadRequestException } from '@nestjs/common';

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Submit a JSON object.');
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new BadRequestException('The request contains unsupported fields.');
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, required = false, multiline = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BadRequestException(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new BadRequestException(`${label} must be text.`);
  const result = value.trim();
  const controls = [...result].some((char) => (char.charCodeAt(0) < 32 && !(multiline && '\n\r\t'.includes(char))) || char.charCodeAt(0) === 127);
  if (!result || result.length > max || controls) throw new BadRequestException(`${label} must contain 1 to ${max} characters.`);
  return result;
}

function choice(value: unknown, options: readonly string[], label: string): string {
  if (typeof value !== 'string' || !options.includes(value)) throw new BadRequestException(`Choose a valid ${label}.`);
  return value;
}
const statuses = ['active', 'inactive', 'suspicious'];
const categories = ['seed', 'fertilizer'];

export function parseId(value: string): string {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new BadRequestException('Invalid record ID.');
  return value;
}

export function parseProduct(value: unknown) {
  const data = object(value, ['name', 'category', 'manufacturer', 'registrationNo', 'description', 'status']);
  return {
    name: text(data.name, 'Product name', 160, true)!,
    category: choice(data.category, categories, 'category'),
    manufacturer: text(data.manufacturer, 'Manufacturer', 160, true)!,
    registrationNo: text(data.registrationNo, 'Registration reference', 80),
    description: text(data.description, 'Description', 2000, false, true),
    status: choice(data.status, statuses, 'status'),
  };
}

function date(value: unknown, label: string, required: boolean): string | null {
  const result = text(value, label, 10, required);
  if (result === null) return null;
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(result)) throw new BadRequestException(`${label} must be a date in YYYY-MM-DD format (year 1000–9999).`);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) throw new BadRequestException(`${label} is not a valid calendar date.`);
  return result;
}

export function parseCode(value: unknown, creating: boolean) {
  const data = object(value, ['batchNumber', 'manufactureDate', 'expiryDate', 'status', ...(creating ? ['codeValue'] : [])]);
  let codeValue: string | undefined;
  if (creating) {
    codeValue = text(data.codeValue, 'Verification code', 80, true)!.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(codeValue)) throw new BadRequestException('Use letters, numbers, hyphens or underscores for the code, starting with a letter or number.');
  }
  const manufactureDate = date(data.manufactureDate, 'Manufacture date', false);
  const expiryDate = date(data.expiryDate, 'Expiry date', true)!;
  if (manufactureDate && manufactureDate > expiryDate) throw new BadRequestException('Expiry date must be on or after manufacture date.');
  return { codeValue, batchNumber: text(data.batchNumber, 'Batch number', 80, true)!, manufactureDate, expiryDate, status: choice(data.status, statuses, 'status') };
}

export function parseList(value: unknown, products: boolean) {
  const data = object(value, ['q', 'status', 'page', ...(products ? ['category'] : [])]);
  const page = data.page ?? '1';
  if (typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) throw new BadRequestException('Page must be a positive number up to 999999.');
  return {
    q: data.q === '' ? null : text(data.q, 'Search', 160),
    status: data.status === undefined || data.status === '' ? null : choice(data.status, statuses, 'status'),
    category: !products || data.category === undefined || data.category === '' ? null : choice(data.category, categories, 'category'),
    page: Number(page), pageSize: 20,
  };
}
