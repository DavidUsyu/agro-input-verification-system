export function normalizePackageCode(code: string): string {
  // Accept the printed spacing for new codes while preserving legacy separators.
  if (/^[0-9]{4}(?:[ \u00a0\u202f]+[0-9]{4}){2}$/.test(code)) {
    return code.replace(/[ \u00a0\u202f]/g, '');
  }
  return code.toUpperCase();
}
