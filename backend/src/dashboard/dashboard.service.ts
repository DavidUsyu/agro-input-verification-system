import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { outcomes } from '../verification/validation';
import type { VerificationOutcome } from '../verification/validation';
import { dashboardRange, parseDashboardQuery } from './validation';

const located = `located AS (SELECT v.*,CASE WHEN v.location_source='device_reported'
  AND v.county IN (SELECT name FROM distribution_counties) THEN v.county ELSE NULL END AS activity_county FROM verification_records v)`;
const checkCounty = `($3::text IS NULL OR ($3='unavailable' AND activity_county IS NULL) OR activity_county=$3)`;
const checks = `${located}, filtered_checks AS (SELECT * FROM located WHERE
  verified_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Nairobi')
  AND verified_at < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Nairobi') AND ${checkCounty})`;
const reports = `filtered_reports AS (SELECT * FROM product_reports WHERE
  created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Nairobi')
  AND created_at < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Nairobi')
  AND ($3::text IS NULL OR ($3='unavailable' AND county IS NULL) OR county=$3))`;
function completeOutcomes(counts: Partial<Record<VerificationOutcome,number>>) {
  return Object.fromEntries(outcomes.map(result=>[result,counts[result] ?? 0])) as Record<VerificationOutcome,number>;
}

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}
  async overview(query: unknown) {
    const input = parseDashboardQuery(query);
    try {
      return await this.database.transaction(async client=>{
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const meta = (await client.query<{today:string;generatedAt:Date}>(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi','YYYY-MM-DD') AS today,CURRENT_TIMESTAMP AS "generatedAt"`)).rows[0];
        const filters = dashboardRange(input,meta.today);
        const values = [filters.from,filters.to,filters.county];
        const inventory = (await client.query<{products:number;packageCodes:number}>(`SELECT (SELECT count(*)::int FROM products) AS products,(SELECT count(*)::int FROM product_codes) AS "packageCodes"`)).rows[0];
        const outcomeRows = (await client.query<{result:VerificationOutcome;count:number}>(`WITH ${checks} SELECT result,count(*)::int AS count FROM filtered_checks GROUP BY result`,values)).rows;
        const outcomeCounts = completeOutcomes(Object.fromEntries(outcomeRows.map(row=>[row.result,row.count])));
        const statusRows = (await client.query<{status:'submitted'|'under_review'|'resolved';count:number}>(`WITH ${reports} SELECT status,count(*)::int AS count FROM filtered_reports GROUP BY status`,values)).rows;
        const reportCounts = {submitted:0,under_review:0,resolved:0};
        for (const row of statusRows) reportCounts[row.status]=row.count;
        const todayVerifications = (await client.query<{total:number}>(`WITH ${located} SELECT count(*)::int AS total FROM located WHERE
          verified_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Nairobi') AND verified_at < (($1::date+1)::timestamp AT TIME ZONE 'Africa/Nairobi')
          AND ($2::text IS NULL OR ($2='unavailable' AND activity_county IS NULL) OR activity_county=$2)`,[meta.today,filters.county])).rows[0].total;
        const daily = (await client.query<{date:string;verifications:number;reports:number}>(`WITH ${checks},${reports},
          daily_checks AS (SELECT (verified_at AT TIME ZONE 'Africa/Nairobi')::date AS day,count(*)::int AS count FROM filtered_checks GROUP BY day),
          daily_reports AS (SELECT (created_at AT TIME ZONE 'Africa/Nairobi')::date AS day,count(*)::int AS count FROM filtered_reports GROUP BY day)
          SELECT to_char(d.day,'YYYY-MM-DD') AS date,coalesce(v.count,0)::int AS verifications,coalesce(r.count,0)::int AS reports
          FROM generate_series($1::date::timestamp,$2::date::timestamp,interval '1 day') AS d(day)
          LEFT JOIN daily_checks v ON v.day=d.day::date LEFT JOIN daily_reports r ON r.day=d.day::date ORDER BY d.day`,values)).rows;
        const countyRows = (await client.query<{county:string|null;total:number;outcomes:Partial<Record<VerificationOutcome,number>>}>(`WITH ${checks}
          SELECT county,sum(n)::int AS total,jsonb_object_agg(result,n) AS outcomes FROM
          (SELECT activity_county AS county,result,count(*)::int AS n FROM filtered_checks GROUP BY activity_county,result) grouped
          GROUP BY county ORDER BY total DESC,county NULLS LAST`,values)).rows;
        const reportCounties = (await client.query<{county:string|null;total:number}>(`WITH ${reports} SELECT county,count(*)::int AS total FROM filtered_reports GROUP BY county ORDER BY total DESC,county NULLS LAST`,values)).rows;
        const topReported = (await client.query(`WITH ${reports} SELECT product_id AS "productId",
          (array_agg(product_name ORDER BY created_at DESC,id DESC))[1] AS name,count(*)::int AS total,
          count(*) FILTER (WHERE status<>'resolved')::int AS unresolved FROM filtered_reports
          GROUP BY product_id,CASE WHEN product_id IS NULL THEN lower(product_name) ELSE NULL END
          ORDER BY total DESC,name,"productId" NULLS LAST LIMIT 5`,values)).rows;
        const recentVerifications = (await client.query(`WITH ${checks} SELECT id,entered_code AS "enteredCode",result,
          product_snapshot->>'name' AS "productName",verified_at AS "verifiedAt",activity_county AS county
          FROM filtered_checks ORDER BY verified_at DESC,id DESC LIMIT 5`,values)).rows;
        const recentReports = (await client.query(`WITH ${reports} SELECT id,product_name AS "productName",status,created_at AS "createdAt"
          FROM filtered_reports ORDER BY created_at DESC,id DESC LIMIT 5`,values)).rows;
        return {filters,today:meta.today,generatedAt:meta.generatedAt,inventory,
          summary:{verifications:Object.values(outcomeCounts).reduce((sum,count)=>sum+count,0),todayVerifications,
            reviewRequired:outcomeCounts.review_required,unresolvedReports:reportCounts.submitted+reportCounts.under_review},
          outcomes:outcomeCounts,reportCounts,daily,
          verificationCounties:countyRows.map(row=>({...row,outcomes:completeOutcomes(row.outcomes)})),
          reportCounties,topReported,recentVerifications,recentReports};
      });
    } catch(error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('The dashboard is temporarily unavailable. Please try again.');
    }
  }
}
