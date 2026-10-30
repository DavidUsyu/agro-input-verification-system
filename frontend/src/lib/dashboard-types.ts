import type { VerificationOutcome } from './verification-types';
import type { ProductReport } from './report-types';

export interface DashboardFilters { from:string; to:string; county:string }
export interface DailyActivity { date:string; verifications:number; reports:number }
export interface DashboardData {
  filters:{from:string;to:string;county:string|null};today:string;generatedAt:string;
  inventory:{products:number;packageCodes:number};
  summary:{verifications:number;todayVerifications:number;reviewRequired:number;unresolvedReports:number};
  outcomes:Record<VerificationOutcome,number>;
  reportCounts:Record<ProductReport['status'],number>;
  daily:DailyActivity[];
  verificationCounties:{county:string|null;total:number;outcomes:Record<VerificationOutcome,number>}[];
  reportCounties:{county:string|null;total:number}[];
  topReported:{productId:string|null;name:string;total:number;unresolved:number}[];
  recentVerifications:{id:string;enteredCode:string;result:VerificationOutcome;productName:string|null;verifiedAt:string;county:string|null}[];
  recentReports:{id:string;productName:string;status:ProductReport['status'];createdAt:string}[];
}
