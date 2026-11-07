import { countyNames } from '../location/county-location';

export const home = 'CON AgroVerify\n1 Verify product\n2 Farmer account\n0 Exit';
export const accountMenu = 'CON Farmer account\n1 Verify product\n2 Report a concern\n3 Recent checks\n4 My reports\n0 Exit';
export const concernReasons = ['suspected_counterfeit','expired','damaged_packaging','wrong_label','unknown_code','other'];
export const reasonMenu = 'CON Choose concern\n1 Suspected counterfeit\n2 Expired\n3 Damaged pack\n4 Wrong label\n5 Unknown code\n6 Other\n0 Exit';
export const resumeMenu = 'CON Unfinished report found.\n1 Continue report\n2 Discard & start new\n3 Account menu\n0 Exit';
export function countyPrompt(report = false) {
  return `CON Enter current county name, e.g. Nakuru.\nSelf-reported.\n9 Browse counties\n0 ${report?'Save & exit':'Exit'}`;
}
export function countyMenu(page: number, choices: readonly string[] = countyNames, report = false) {
  return `CON Current county (self-reported)\n${choices.slice(page*4,page*4+4).map((name,i)=>`${i+1} ${name}`).join('\n')}\n${(page+1)*4<choices.length?'98 Next\n':''}${page>0?'99 Back\n':''}0 ${report?'Save & exit':'Exit'}`;
}
export function countyMatches(answer: string) {
  const normalize=(value:string)=>value.toLowerCase().replace(/county\s*$/,'').replace(/[^a-z]/g,'');
  const input=normalize(answer);
  if (!input) return [];
  const exact=countyNames.find(name=>normalize(name)===input);
  return exact ? [exact] : countyNames.filter(name=>normalize(name).startsWith(input));
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
