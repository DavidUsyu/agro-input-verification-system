import { BadRequestException } from '@nestjs/common';
import { normalizePhone } from '../auth/validation';
import { object, text } from '../reports/validation';

export function callbackInput(value: unknown) {
  const data = object(value, ['sessionId','serviceCode','phoneNumber','text','networkCode']);
  const sessionId = text(data.sessionId, 'Session', 128, true)!;
  const serviceCode = text(data.serviceCode, 'Service code', 40, true)!;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId) || !/^\*\d+(?:\*\d+)*#$/.test(serviceCode)) throw new BadRequestException('Invalid session or service code.');
  const phone = normalizePhone(text(data.phoneNumber, 'Phone', 30, true)!);
  if (!/^\+254[17]\d{8}$/.test(phone)) throw new BadRequestException('Use a Kenyan mobile number.');
  if (typeof data.text !== 'string' || data.text.length > 2048 || /[^\x20-\x7e]/.test(data.text)) throw new BadRequestException('Invalid USSD input.');
  const parts = data.text === '' ? [] : data.text.split('*');
  if (parts.length > 60 || parts.some(part => part.length > 80)) throw new BadRequestException('Session input is too long.');
  return { sessionId, serviceCode, phone, text: data.text, parts };
}

export function pinSettings(value: unknown) {
  const data = object(value, ['phone','password','pin']);
  if (typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 256) throw new BadRequestException('Enter your current website password.');
  if (data.pin === null) return { password: data.password, pin: null, phone: null };
  if (typeof data.pin !== 'string' || !/^\d{6}$/.test(data.pin) || /^(\d)\1{5}$/.test(data.pin) || ['123456','654321','012345'].includes(data.pin)) throw new BadRequestException('Choose six digits; avoid repeated digits and simple sequences.');
  const phone = normalizePhone(text(data.phone, 'Phone', 30, true)!);
  if (!/^\+254[17]\d{8}$/.test(phone)) throw new BadRequestException('Use a Kenyan mobile number.');
  return { password: data.password, pin: data.pin, phone };
}
