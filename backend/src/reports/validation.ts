import { BadRequestException } from '@nestjs/common';
import { countyNames } from '../location/county-location';
import { parseId } from '../products/validation';

export function object(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Submit a JSON object.');
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new BadRequestException('The request contains unsupported fields.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max: number, required = false, multiline = false): string | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw new BadRequestException(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new BadRequestException(`${label} must be text.`);
  const result = value.trim();
  if (!result || result.length > max || [...result].some(char => (char.charCodeAt(0) < 32 && !(multiline && '\n\r\t'.includes(char))) || char.charCodeAt(0) === 127)) throw new BadRequestException(`${label} must contain 1 to ${max} characters.`);
  return result;
}
function choice(value: unknown, choices: readonly string[], label: string) {
  if (typeof value !== 'string' || !choices.includes(value)) throw new BadRequestException(`Choose a valid ${label}.`);
  return value;
}
function optionalId(value: unknown) {
  const result = text(value, 'Record ID', 19);
  return result === null ? null : parseId(result);
}
export function submission(value: unknown) {
  const data = object(value, ['productId','verificationId','productName','category','codeValue','sellerName','sellerLocation','county','reason','description']);
  const description = text(data.description, 'Description', 2000, true, true)!;
  if (description.length < 10) throw new BadRequestException('Describe your concern in at least 10 characters.');
  return {
    productId: optionalId(data.productId), verificationId: optionalId(data.verificationId),
    productName: text(data.productName, 'Product name', 160, true)!,
    category: choice(data.category, ['seed','fertilizer'], 'category'),
    codeValue: text(data.codeValue, 'Package code', 80),
    sellerName: text(data.sellerName, 'Seller name', 160), sellerLocation: text(data.sellerLocation, 'Seller location', 300),
    county: data.county === undefined || data.county === null || data.county === '' ? null : choice(data.county, countyNames, 'county'),
    reason: choice(data.reason, ['suspected_counterfeit','expired','damaged_packaging','wrong_label','unknown_code','other'], 'reason'), description,
  };
}
export function reportQuery(value: unknown, catalogue = false) {
  const data = object(value, catalogue ? ['q'] : ['q','status','page']);
  const page = data.page ?? '1';
  if (typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) throw new BadRequestException('Choose a valid page.');
  return { q: data.q === '' ? null : text(data.q, 'Search', 160),
    status: data.status === undefined || data.status === '' ? null : choice(data.status, ['submitted','under_review','resolved'], 'status'), page: Number(page) };
}
export function review(value: unknown) {
  const data = object(value, ['version','status','resolution','response','internalNote']);
  if (typeof data.version !== 'number' || !Number.isSafeInteger(data.version) || data.version < 1 || data.version >= 2147483647) throw new BadRequestException('A valid report version is required. Refresh the report.');
  const status = choice(data.status, ['under_review','resolved'], 'status');
  const response = text(data.response, 'Response to farmer', 2000, status === 'resolved', true);
  const resolution = status === 'resolved' ? choice(data.resolution, ['action_taken','no_action','insufficient_information'], 'resolution') : null;
  if (status !== 'resolved' && data.resolution !== undefined && data.resolution !== null && data.resolution !== '') throw new BadRequestException('Resolution is only available for resolved reports.');
  return { version: data.version, status, resolution, response, internalNote: text(data.internalNote, 'Internal note', 2000, false, true) };
}
