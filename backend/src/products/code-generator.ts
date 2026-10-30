import { randomBytes } from 'node:crypto';

// 96 random bits, encoded with Crockford's alphabet and grouped for entry.
export function generateProductCode() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let value = 0; let bits = 0; let encoded = '';
  for (const byte of randomBytes(12)) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; encoded += alphabet[(value >>> bits) & 31]; }
    value &= (1 << bits) - 1;
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31];
  return `AGV-${encoded.match(/.{1,4}/g)!.join('-')}`;
}
