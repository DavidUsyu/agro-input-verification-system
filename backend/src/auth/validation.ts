import { BadRequestException } from '@nestjs/common';

function object(body: unknown, allowed: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Submit a JSON object.');
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new BadRequestException('The request contains unsupported fields.');
  return body as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BadRequestException(`${name} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be text.`);
  const normalized = value.trim();
  const hasControlCharacters = [...normalized].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!normalized || normalized.length > max || hasControlCharacters) {
    throw new BadRequestException(`${name} must contain between 1 and ${max} characters.`);
  }
  return normalized;
}

export function normalizePhone(value: string): string {
  let phone = value.replace(/[ ()-]/g, '');
  if (/^0[17]\d{8}$/.test(phone)) phone = `+254${phone.slice(1)}`;
  else if (/^254[17]\d{8}$/.test(phone)) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new BadRequestException('Enter a valid phone number, such as 0712345678 or +254712345678.');
  return phone;
}

function password(value: unknown, registration: boolean): string {
  if (typeof value !== 'string' || value.length > 256 || [...value].length > 128 || [...value].length < (registration ? 15 : 1)) {
    throw new BadRequestException(registration ? 'Use a password of 15 to 128 characters.' : 'Enter your password (up to 128 characters).');
  }
  // Passwords are never trimmed or silently truncated.
  return value;
}

export function parseRegistration(body: unknown) {
  const values = object(body, ['fullName', 'email', 'phone', 'county', 'password']);
  const fullName = text(values.fullName, 'Full name', 120, true)!;
  const email = text(values.email, 'Email', 160)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
  const rawPhone = text(values.phone, 'Phone', 30);
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!email && !phone) throw new BadRequestException('Provide an email address or a phone number.');
  return { fullName, email, phone, county: text(values.county, 'County', 80), password: password(values.password, true) };
}

export function parseLogin(body: unknown) {
  const values = object(body, ['identifier', 'password']);
  const raw = text(values.identifier, 'Email or phone', 160, true)!;
  const identifier = raw.includes('@') ? raw.toLowerCase() : normalizePhone(raw);
  return { identifier, password: password(values.password, false) };
}
