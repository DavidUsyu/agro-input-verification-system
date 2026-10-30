import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { parseId } from '../products/validation';
import { reportQuery, review, submission } from './validation';

const fields = `r.id, r.product_id AS "productId", r.verification_id AS "verificationId", r.verification_result AS "verificationResult",
 r.product_name AS "productName",r.category,r.entered_code AS "codeValue",r.seller_name AS "sellerName",r.seller_location AS "sellerLocation",
 r.county,r.reason,r.description,r.status,r.resolution,r.response,r.created_at AS "createdAt",r.updated_at AS "updatedAt"`;
const privateFields = `,r.version,r.farmer_id AS "farmerId",u.full_name AS "farmerName",r.internal_note AS "internalNote",r.reviewed_by AS "reviewedBy",r.product_code_id AS "productCodeId"`;

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  async catalogue(query: unknown) {
    const { q } = reportQuery(query, true);
    const result = await this.database.query(`SELECT id,name,category,manufacturer FROM products
      WHERE ($1::text IS NULL OR position(lower($1) in lower(name || ' ' || manufacturer))>0)
      ORDER BY name,id LIMIT 20`, [q]);
    return { items: result.rows };
  }

  async create(body: unknown, farmerId: string) {
    const input = submission(body);
    const id = await this.database.transaction(async client => {
      let enteredCode = input.codeValue;
      let verificationResult: string | null = null;
      if (input.verificationId) {
        const verification = (await client.query('SELECT entered_code,result FROM verification_records WHERE id=$1 AND farmer_id=$2 FOR SHARE', [input.verificationId,farmerId])).rows[0];
        if (!verification) throw new NotFoundException('Verification record not found in your account.');
        if (enteredCode && enteredCode.toUpperCase() !== verification.entered_code.toUpperCase()) throw new BadRequestException('The package code must match the linked verification.');
        enteredCode = verification.entered_code || null;
        verificationResult = verification.result;
      }
      let name = input.productName; let category = input.category;
      if (input.productId) {
        const product = (await client.query('SELECT name,category FROM products WHERE id=$1 FOR SHARE', [input.productId])).rows[0];
        if (!product) throw new NotFoundException('Catalogue product not found.');
        name = product.name; category = product.category;
      }
      const matched = enteredCode ? (await client.query('SELECT id FROM product_codes WHERE upper(code_value)=upper($1) FOR SHARE', [enteredCode])).rows[0] : null;
      const row = (await client.query(`INSERT INTO product_reports
        (farmer_id,product_id,product_code_id,verification_id,verification_result,product_name,category,entered_code,seller_name,seller_location,county,reason,description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [farmerId,input.productId,matched?.id ?? null,input.verificationId,verificationResult,name,category,enteredCode,input.sellerName,input.sellerLocation,input.county,input.reason,input.description])).rows[0];
      return row.id as string;
    });
    return this.get(id,farmerId,false);
  }

  async list(query: unknown, farmerId: string | null, administrator: boolean) {
    const { q,status,page } = reportQuery(query);
    const filter = `WHERE ($1::bigint IS NULL OR r.farmer_id=$1)
      AND ($2::text IS NULL OR position(lower($2) in lower(r.product_name || ' ' || coalesce(r.entered_code,'') || ' ' || coalesce(r.seller_name,'')))>0)
      AND ($3::text IS NULL OR r.status=$3)`;
    const values = [farmerId,q,status];
    const total = (await this.database.query<{total:number}>(`SELECT count(*)::int AS total FROM product_reports r ${filter}`,values)).rows[0].total;
    const result = await this.database.query(`SELECT ${fields}${administrator ? privateFields : ''} FROM product_reports r
      ${administrator ? 'JOIN users u ON u.id=r.farmer_id' : ''} ${filter} ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET $4`,[...values,(page-1)*20]);
    return { items: result.rows,total,page,pageSize:20 };
  }

  async get(id: string, farmerId: string | null, administrator: boolean) {
    const result = await this.database.query(`SELECT ${fields}${administrator ? privateFields : ''} FROM product_reports r
      ${administrator ? 'JOIN users u ON u.id=r.farmer_id' : ''} WHERE r.id=$1 AND ($2::bigint IS NULL OR r.farmer_id=$2)`,[parseId(id),farmerId]);
    if (!result.rows[0]) throw new NotFoundException('Report not found.');
    return result.rows[0];
  }

  async review(id: string, body: unknown, administratorId: string) {
    parseId(id); const input = review(body);
    await this.database.transaction(async client => {
      const row = (await client.query('SELECT status,version FROM product_reports WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!row) throw new NotFoundException('Report not found.');
      if (row.version !== input.version) throw new ConflictException('This report changed. Refresh reports before saving your review.');
      if (row.status === 'submitted' && input.status === 'resolved') throw new ConflictException('Start reviewing the report before resolving it.');
      await client.query(`UPDATE product_reports SET status=$2,resolution=$3,response=$4,internal_note=$5,reviewed_by=$6,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [id,input.status,input.resolution,input.response,input.internalNote,administratorId]);
      await client.query(`INSERT INTO report_reviews (report_id,administrator_id,from_status,to_status,resolution,response,internal_note,report_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[id,administratorId,row.status,input.status,input.resolution,input.response,input.internalNote,input.version+1]);
    });
    return this.get(id,null,true);
  }
}
