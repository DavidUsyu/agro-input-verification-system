export type VerificationOutcome = 'verified' | 'expired' | 'inactive' | 'suspicious' | 'unregistered' | 'invalid' | 'reported' | 'review_required';
export interface ProductSnapshot {
  id: string; name: string; category: 'seed' | 'fertilizer'; manufacturer: string; registrationNo: string | null;
  description: string | null; productStatus: string; codeValue: string; batchNumber: string;
  manufactureDate: string | null; expiryDate: string; codeStatus: string;
}
export interface VerificationRecord {
  id: string; enteredCode: string; result: VerificationOutcome; reason: string;
  product: ProductSnapshot | null; verifiedAt: string; channel: string; county?: string | null;
  savedToAccount?: boolean; actorRole?: 'guest' | 'farmer' | 'administrator'; farmerName?: string | null;
  distributionCounty?: string | null; locationSource?: string; locationStatus?: string;
}
export const resultLabels: Record<VerificationOutcome, string> = {
  verified: 'Record matched', expired: 'Expired', inactive: 'Inactive', suspicious: 'Flagged for review',
  unregistered: 'Code not found', invalid: 'Invalid code', reported: 'Reported', review_required: 'Verification requires review',
};
const explanations: Record<string, string> = {
  matched: 'This code matches an active product record and its recorded expiry date has not passed.',
  expired: 'The code was found, but the recorded expiry date has passed. Check the packaging and contact the supplier.',
  product_inactive: 'This product record is inactive. Contact the supplier to confirm its current status before using the product.',
  code_inactive: 'This verification code is inactive. Contact the supplier to confirm its current status.',
  product_flagged: 'The product record has been flagged for review. Contact the supplier before using the product.',
  code_flagged: 'This verification code has been flagged for review. Contact the supplier before using the product.',
  not_yet_manufactured: 'The recorded manufacture date is in the future. Contact the supplier to clarify these details.',
  not_found: 'This code was not found in the stored records. Check the code and contact the supplier. This result alone does not establish that the product is counterfeit.',
  malformed: 'Enter the code from the packaging using letters, numbers, hyphens or underscores, starting with a letter or number.',
  legacy: 'This historical result was saved before detailed explanations and product snapshots were available.',
  review_required: 'We could not approve this product verification. Please contact the supplier for assistance.',
};
export function resultExplanation(record: VerificationRecord) { return record.result === 'review_required' ? explanations.review_required : explanations[record.reason] ?? 'Review the saved result and contact the supplier if you have concerns.'; }
export function verificationTime(value: string) {
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(value));
}
