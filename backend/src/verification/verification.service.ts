import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SessionUser } from '../auth/auth.types';
import { parseHistory, parseVerification } from './validation';
import type { VerificationOutcome } from './validation';
import { assessLocation } from '../location/county-location';

interface ProductSnapshot {
  id: string; name: string; category: string; manufacturer: string; registrationNo: string | null;
  description: string | null; productStatus: string; codeValue: string; batchNumber: string;
  manufactureDate: string | null; expiryDate: string; codeStatus: string;
}
interface MatchRow { id: string; expired: boolean; future: boolean; distributionCounty: string | null; product: ProductSnapshot }

function publicVerification(row: Record<string, unknown>) {
  const review = row.result === 'review_required';
  return { id: row.id, enteredCode: row.enteredCode, result: row.result,
    reason: review ? 'review_required' : row.reason, product: review ? null : row.product,
    verifiedAt: row.verifiedAt, channel: row.channel };
}

@Injectable()
export class VerificationService {
  constructor(private readonly database: DatabaseService) {}

  async verify(body: unknown, user?: SessionUser) {
    const input = parseVerification(body);
    const location = assessLocation(input.location);
    try {
      return await this.database.transaction(async (client) => {
        let match: MatchRow | undefined;
        if (input.valid) {
          match = (await client.query<MatchRow>(`SELECT c.id, c.distribution_county AS "distributionCounty",
            c.expiry_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi')::date AS expired,
            c.manufacture_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi')::date AS future,
            jsonb_build_object('id', p.id::text, 'name', p.name, 'category', p.category, 'manufacturer', p.manufacturer,
              'registrationNo', p.registration_no, 'description', p.description, 'productStatus', p.status,
              'codeValue', c.code_value, 'batchNumber', c.batch_number,
              'manufactureDate', to_char(c.manufacture_date, 'YYYY-MM-DD'), 'expiryDate', to_char(c.expiry_date, 'YYYY-MM-DD'),
              'codeStatus', c.verification_status) AS product
            FROM product_codes c JOIN products p ON p.id=c.product_id WHERE upper(c.code_value)=$1
            FOR SHARE OF c,p`, [input.normalizedCode])).rows[0];
        }
        let locationStatus: string = location.status === 'resolved' ? 'not_checked' : location.status;
        if (match) {
          if (!match.distributionCounty) locationStatus = 'unassigned';
          else if (location.status === 'resolved') locationStatus = location.county === match.distributionCounty ? 'matched' : 'mismatch';
        }
        let result: VerificationOutcome = 'verified'; let reason = 'matched';
        if (!input.valid) { result = 'invalid'; reason = 'malformed'; }
        else if (!match) { result = 'unregistered'; reason = 'not_found'; }
        else if (match.product.productStatus === 'suspicious') { result = 'suspicious'; reason = 'product_flagged'; }
        else if (match.product.codeStatus === 'suspicious') { result = 'suspicious'; reason = 'code_flagged'; }
        else if (match.product.productStatus === 'inactive') { result = 'inactive'; reason = 'product_inactive'; }
        else if (match.product.codeStatus === 'inactive') { result = 'inactive'; reason = 'code_inactive'; }
        else if (match.expired) { result = 'expired'; reason = 'expired'; }
        else if (match.future) { result = 'inactive'; reason = 'not_yet_manufactured'; }
        else if (locationStatus !== 'matched') {
          result = 'review_required';
          const reasons: Record<string, string> = { unassigned: 'distribution_unassigned', mismatch: 'distribution_mismatch', boundary_uncertain: 'location_uncertain' };
          reason = reasons[locationStatus] ?? `location_${locationStatus}`;
        }
        const farmerId = user?.role === 'farmer' ? user.id : null;
        const row = (await client.query(`INSERT INTO verification_records
          (farmer_id,product_code_id,entered_code,result,reason,product_snapshot,actor_role,channel,county,distribution_county,location_source,location_status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'web',$8,$9,$10,$11)
          RETURNING id, entered_code AS "enteredCode", result, reason, product_snapshot AS product,
            verified_at AS "verifiedAt", channel`, [farmerId, match?.id ?? null, input.enteredCode, result, reason, match?.product ?? null, user?.role ?? 'guest', location.county, match?.distributionCounty ?? null, input.location ? 'device_reported' : 'unavailable', locationStatus])).rows[0];
        return { ...publicVerification(row), savedToAccount: farmerId !== null };
      });
    } catch {
      throw new ServiceUnavailableException('Unable to complete and save this verification. Please try again shortly.');
    }
  }

  async history(query: unknown, user: SessionUser, administrator: boolean) {
    const { q, result, actor, from, to, page, pageSize } = parseHistory(query, administrator);
    const filter = `WHERE ($1::bigint IS NULL OR v.farmer_id=$1)
      AND ($2::text IS NULL OR position(lower($2) in lower(v.entered_code || ' ' || coalesce(v.product_snapshot->>'name', '') || ' ' || coalesce(v.product_snapshot->>'batchNumber', ''))) > 0)
      AND ($3::text IS NULL OR v.result=$3) AND ($4::text IS NULL OR v.actor_role=$4)
      AND ($5::date IS NULL OR v.verified_at >= ($5::date::timestamp AT TIME ZONE 'Africa/Nairobi'))
      AND ($6::date IS NULL OR v.verified_at < (($6::date + 1)::timestamp AT TIME ZONE 'Africa/Nairobi'))`;
    const values = [administrator ? null : user.id, q, result, actor, from, to];
    try {
      const count = await this.database.query<{ total: number }>(`SELECT count(*)::int AS total FROM verification_records v ${filter}`, values);
      const records = await this.database.query(`SELECT v.id, v.entered_code AS "enteredCode", v.result, v.reason,
        v.product_snapshot AS product, v.verified_at AS "verifiedAt", v.channel, v.county
        ${administrator ? ', v.actor_role AS "actorRole", u.full_name AS "farmerName", v.distribution_county AS "distributionCounty", v.location_source AS "locationSource", v.location_status AS "locationStatus"' : ''}
        FROM verification_records v ${administrator ? 'LEFT JOIN users u ON u.id=v.farmer_id' : ''} ${filter}
        ORDER BY v.verified_at DESC, v.id DESC LIMIT $7 OFFSET $8`, [...values, pageSize, (page - 1) * pageSize]);
      return { items: administrator ? records.rows : records.rows.map(publicVerification), total: count.rows[0].total, page, pageSize };
    } catch {
      throw new ServiceUnavailableException('Verification history is temporarily unavailable. Please try again.');
    }
  }
}
