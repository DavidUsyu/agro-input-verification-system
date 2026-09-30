import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

// OWASP scrypt option: N=2^16, r=8, p=2 (64 MiB per hash).
const prefix = 'scrypt$65536$8$2';
const dummy = `${prefix}$${'0'.repeat(32)}$${'0'.repeat(128)}`;
let running = 0;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (running >= 2) throw new ServiceUnavailableException('Sign-in is busy. Please try again shortly.');
  running++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 65536, r: 8, p: 2, maxmem: 96 * 1024 * 1024 }, (error, key) => {
        if (error) reject(error); else resolve(key);
      });
    });
  } finally { running--; }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${prefix}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored?: string): Promise<boolean> {
  const validFormat = typeof stored === 'string' && /^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored);
  const parts = (validFormat ? stored : dummy).split('$');
  const actual = await derive(password, Buffer.from(parts[4], 'hex'));
  const matches = timingSafeEqual(actual, Buffer.from(parts[5], 'hex'));
  return validFormat && matches;
}
