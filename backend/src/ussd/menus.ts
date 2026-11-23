import { countyNames } from '../location/county-location';

export type UssdLanguage = 'en' | 'sw';
export const languageMenu = 'CON AgroVerify\nChoose language / Chagua lugha\n0 English\n1 Kiswahili';
export function translated(language: UssdLanguage | undefined, english: string, kiswahili: string) {
  return language === 'sw' ? kiswahili : english;
}
export function home(language?: UssdLanguage) {
  return translated(language, 'CON AgroVerify\n1 Verify product\n2 Farmer account\n0 Exit',
    'CON AgroVerify\n1 Hakiki bidhaa\n2 Akaunti ya mkulima\n0 Toka');
}
export function accountMenu(language?: UssdLanguage) {
  return translated(language, 'CON Farmer account\n1 Verify product\n2 Report a concern\n3 Recent checks\n4 My reports\n0 Exit',
    'CON Akaunti ya mkulima\n1 Hakiki bidhaa\n2 Ripoti tatizo\n3 Hakiki za karibuni\n4 Ripoti zangu\n0 Toka');
}
export const concernReasons = ['suspected_counterfeit','expired','damaged_packaging','wrong_label','unknown_code','other'];
const reasonsEn = ['Suspected counterfeit','Expired','Damaged pack','Wrong label','Unknown code','Other'];
const reasonsSw = ['Bidhaa bandia','Imeisha muda','Pakiti mbovu','Lebo si sahihi','Msimbo haujulikani','Nyingine'];
export function concernLabel(reason: string | undefined, language?: UssdLanguage) {
  const index = concernReasons.indexOf(reason ?? '');
  return index < 0 ? '' : (language === 'sw' ? reasonsSw : reasonsEn)[index];
}
export function reasonMenu(language?: UssdLanguage, productName?: string) {
  const title = compact(productName,30) || translated(language,'Choose concern','Chagua sababu');
  const reasons = language === 'sw' ? reasonsSw : reasonsEn;
  return `CON ${title}\n${reasons.map((reason,i)=>`${i+1} ${reason}`).join('\n')}\n0 ${translated(language,'Save & exit','Hifadhi na toka')}`;
}
export function resumeMenu(language?: UssdLanguage) {
  return translated(language, 'CON Unfinished report found.\n1 Continue report\n2 Discard & start new\n3 Account menu\n0 Exit',
    'CON Kuna ripoti ambayo haijakamilika.\n1 Endelea na ripoti\n2 Futa na uanze mpya\n3 Menyu ya akaunti\n0 Toka');
}
export function countyPrompt(report = false, language?: UssdLanguage) {
  return translated(language,
    `CON Enter current county name, e.g. Nakuru.\nSelf-reported.\n9 Browse counties\n0 ${report?'Save & exit':'Exit'}`,
    `CON Weka jina la kaunti ulipo, mfano Nakuru.\n9 Orodha ya kaunti\n0 ${report?'Hifadhi na toka':'Toka'}`);
}
export function countyMenu(page: number, choices: readonly string[] = countyNames, report = false, language?: UssdLanguage) {
  const title = translated(language,'Current county (self-reported)','Kaunti ya sasa (uliyotaja)');
  const next = translated(language,'Next','Mbele'), back = translated(language,'Back','Nyuma');
  const exit = report ? translated(language,'Save & exit','Hifadhi na toka') : translated(language,'Exit','Toka');
  return `CON ${title}\n${choices.slice(page*4,page*4+4).map((name,i)=>`${i+1} ${name}`).join('\n')}\n${(page+1)*4<choices.length?`98 ${next}\n`:''}${page>0?`99 ${back}\n`:''}0 ${exit}`;
}
export function countyMatches(answer: string) {
  const normalize=(value:string)=>value.toLowerCase().replace(/^kaunti(?:\s+ya)?\s+/,'').replace(/(?:county|kaunti)\s*$/,'').replace(/[^a-z]/g,'');
  const input=normalize(answer);
  if (!input) return [];
  const exact=countyNames.find(name=>normalize(name)===input);
  return exact ? [exact] : countyNames.filter(name=>normalize(name).startsWith(input));
}
export function compact(value: unknown, length = 42) {
  return String(value ?? '').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim().slice(0,length);
}
const outcomeSw: Record<string,string> = {
  verified:'Umelingana',review_required:'Inahitaji ukaguzi',expired:'Imeisha muda',inactive:'Haifanyi kazi',
  suspicious:'Inatia shaka',unregistered:'Haijasajiliwa',invalid:'Si sahihi',
};
export function outcomeLabel(result: string, language?: UssdLanguage) {
  return translated(language,result.replaceAll('_',' '),outcomeSw[result] ?? 'Inahitaji ukaguzi');
}
export function reportStatusLabel(status: string, language?: UssdLanguage) {
  const labels: Record<string,string> = {submitted:'Imewasilishwa',under_review:'Inakaguliwa',resolved:'Imetatuliwa'};
  return translated(language,status.replaceAll('_',' '),labels[status] ?? 'Haijabainishwa');
}
export function resultMessage(result: string, product: unknown, language?: UssdLanguage) {
  const labels: Record<string,string> = {
    verified:'Code matched.', review_required:'Verification requires review. Confirm with your supplier.',
    expired:'Product expired. Do not use.', inactive:'Product or code inactive. Do not use.',
    suspicious:'Product flagged. Do not use.', unregistered:'Code not registered. Confirm with your supplier.', invalid:'Invalid code format.',
  };
  const labelsSw: Record<string,string> = {
    verified:'Msimbo umelingana.',review_required:'Uhakiki unahitaji ukaguzi. Wasiliana na muuzaji.',
    expired:'Bidhaa imeisha muda. Usitumie.',inactive:'Bidhaa au msimbo haifanyi kazi. Usitumie.',
    suspicious:'Bidhaa imetiwa alama ya tahadhari. Usitumie.',unregistered:'Msimbo haujasajiliwa. Wasiliana na muuzaji.',invalid:'Muundo wa msimbo si sahihi.',
  };
  const label = translated(language,labels[result] ?? 'Verification requires review.',labelsSw[result] ?? 'Uhakiki unahitaji ukaguzi.');
  const details = product as {name?:string;expiryDate?:string} | null;
  const expiry = translated(language,'Expiry','Mwisho wa matumizi');
  return `END ${label}${details?.name ? `\n${compact(details.name)}\n${expiry} ${compact(details.expiryDate,10)}` : ''}`;
}
