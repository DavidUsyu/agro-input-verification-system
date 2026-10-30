export type RecordStatus = 'active' | 'inactive' | 'suspicious';
export interface Product {
  id: string; name: string; category: 'seed' | 'fertilizer'; manufacturer: string;
  registrationNo: string | null; description: string | null; status: RecordStatus;
  createdBy: string; createdAt: string; codeCount: number;
}
export interface ProductCode {
  id: string; productId: string; codeValue: string; batchNumber: string;
  manufactureDate: string | null; expiryDate: string; status: RecordStatus; distributionCounty: string | null; createdAt: string;
}
export interface RecordPage<T> { items: T[]; total: number; page: number; pageSize: number }
export interface GeneratedCodes { items: ProductCode[]; total: number }
