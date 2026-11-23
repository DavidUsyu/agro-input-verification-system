import { randomInt } from 'node:crypto';

export function generateProductCode() {
  return randomInt(1_000_000_000_000).toString().padStart(12, '0');
}
