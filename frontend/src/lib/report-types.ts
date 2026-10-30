export const reportReasons = {
  suspected_counterfeit: 'Suspected counterfeit', expired: 'Expired product', damaged_packaging: 'Damaged or tampered packaging',
  wrong_label: 'Incorrect or inconsistent label', unknown_code: 'Code not recognised', other: 'Other concern',
};
export const reportStatuses = { submitted: 'Submitted', under_review: 'Under review', resolved: 'Resolved' };
export const reportResolutions = { action_taken: 'Action taken', no_action: 'No action required', insufficient_information: 'Insufficient information' };
export interface CatalogueProduct { id: string; name: string; category: 'seed' | 'fertilizer'; manufacturer: string }
export interface ProductReport {
  id: string; productId: string | null; verificationId: string | null; verificationResult: string | null;
  productName: string; category: 'seed' | 'fertilizer'; codeValue: string | null;
  sellerName: string | null; sellerLocation: string | null; county: string | null;
  reason: keyof typeof reportReasons; description: string; status: keyof typeof reportStatuses;
  resolution: keyof typeof reportResolutions | null; response: string | null; createdAt: string; updatedAt: string;
  version?: number; farmerName?: string; internalNote?: string | null; reviewedBy?: string | null;
}
