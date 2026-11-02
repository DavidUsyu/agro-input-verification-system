import { countyNames } from '../location/county-location';

export const home = 'CON AgroVerify\n1 Verify product\n2 Farmer account\n0 Exit';
export const accountMenu = 'CON Farmer account\n1 Verify product\n2 Report a concern\n3 Recent checks\n4 My reports\n0 Exit';
export const concernReasons = ['suspected_counterfeit','expired','damaged_packaging','wrong_label','unknown_code','other'];
export const reasonMenu = 'CON Choose concern\n1 Suspected counterfeit\n2 Expired\n3 Damaged pack\n4 Wrong label\n5 Unknown code\n6 Other\n0 Exit';
export function countyMenu(page: number) {
  return `CON Current county (self-reported)\n${countyNames.slice(page*4,page*4+4).map((name,i)=>`${i+1} ${name}`).join('\n')}\n${page<11?'98 Next\n':''}${page>0?'99 Back\n':''}0 Exit`;
}
export function compact(value: unknown, length = 42) {
  return String(value ?? '').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim().slice(0,length);
}
export function resultMessage(result: string, product: unknown) {
  const labels: Record<string,string> = {
    verified:'Code matched.', review_required:'Verification requires review. Confirm with your supplier.',
    expired:'Product expired. Do not use.', inactive:'Product or code inactive. Do not use.',
    suspicious:'Product flagged. Do not use.', unregistered:'Code not registered. Confirm with your supplier.', invalid:'Invalid code format.',
  };
  const details = product as {name?:string;expiryDate?:string} | null;
  return `END ${labels[result] ?? 'Verification requires review.'}${details?.name ? `\n${compact(details.name)}\nExpiry ${compact(details.expiryDate,10)}` : ''}`;
}
