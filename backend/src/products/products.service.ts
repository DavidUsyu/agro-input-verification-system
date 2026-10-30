import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { parseCode, parseCodeBatch, parseId, parseList, parseProduct } from './validation';
import { generateProductCode } from './code-generator';

const productFields = `p.id, p.name, p.category, p.manufacturer, p.registration_no AS "registrationNo",
  p.description, p.status, p.created_by AS "createdBy", p.created_at AS "createdAt",
  (SELECT count(*)::int FROM product_codes c WHERE c.product_id = p.id) AS "codeCount"`;
const codeFields = `id, product_id AS "productId", code_value AS "codeValue", batch_number AS "batchNumber",
  to_char(manufacture_date, 'YYYY-MM-DD') AS "manufactureDate", to_char(expiry_date, 'YYYY-MM-DD') AS "expiryDate",
  verification_status AS status, distribution_county AS "distributionCounty", created_at AS "createdAt"`;

@Injectable()
export class ProductsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: unknown) {
    const { q, category, status, page, pageSize } = parseList(query, true);
    const filter = `WHERE ($1::text IS NULL OR position(lower($1) in lower(p.name || ' ' || p.manufacturer || ' ' || coalesce(p.registration_no, ''))) > 0)
      AND ($2::text IS NULL OR p.category = $2) AND ($3::text IS NULL OR p.status = $3)`;
    const values = [q, category, status];
    const count = await this.database.query<{ total: number }>(`SELECT count(*)::int AS total FROM products p ${filter}`, values);
    const result = await this.database.query(`SELECT ${productFields} FROM products p ${filter} ORDER BY p.created_at DESC, p.id DESC LIMIT $4 OFFSET $5`, [...values, pageSize, (page - 1) * pageSize]);
    return { items: result.rows, total: count.rows[0].total, page, pageSize };
  }

  async get(id: string) {
    const result = await this.database.query(`SELECT ${productFields} FROM products p WHERE p.id = $1`, [parseId(id)]);
    if (!result.rows[0]) throw new NotFoundException('Product not found.');
    return result.rows[0];
  }

  async create(body: unknown, administratorId: string) {
    const data = parseProduct(body);
    const result = await this.database.query<{ id: string }>(`INSERT INTO products (name, category, manufacturer, registration_no, description, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [data.name, data.category, data.manufacturer, data.registrationNo, data.description, data.status, administratorId]);
    return this.get(result.rows[0].id);
  }

  async update(id: string, body: unknown) {
    parseId(id);
    const data = parseProduct(body);
    const result = await this.database.query(`UPDATE products SET name=$2, category=$3, manufacturer=$4, registration_no=$5, description=$6, status=$7 WHERE id=$1 RETURNING id`,
      [id, data.name, data.category, data.manufacturer, data.registrationNo, data.description, data.status]);
    if (!result.rows[0]) throw new NotFoundException('Product not found.');
    return this.get(id);
  }

  async codes(productId: string, query: unknown) {
    await this.get(productId);
    const { q, status, page, pageSize } = parseList(query, false);
    const filter = `WHERE product_id=$1 AND ($2::text IS NULL OR position(lower($2) in lower(code_value || ' ' || batch_number)) > 0)
      AND ($3::text IS NULL OR verification_status=$3)`;
    const values = [productId, q, status];
    const count = await this.database.query<{ total: number }>(`SELECT count(*)::int AS total FROM product_codes ${filter}`, values);
    const result = await this.database.query(`SELECT ${codeFields} FROM product_codes ${filter} ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`, [...values, pageSize, (page - 1) * pageSize]);
    return { items: result.rows, total: count.rows[0].total, page, pageSize };
  }

  async createCode(productId: string, body: unknown) {
    const data = parseCode(body, true);
    const items = await this.generateCodes(productId, data, 1);
    return items[0];
  }

  async createCodeBatch(productId: string, body: unknown) {
    const { data, quantity } = parseCodeBatch(body);
    const items = await this.generateCodes(productId, data, quantity);
    return { items, total: items.length };
  }

  private async generateCodes(productId: string, data: ReturnType<typeof parseCode>, quantity: number) {
    await this.get(productId);
    return this.database.transaction(async (client) => {
      const items: Record<string, unknown>[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidates = Array.from({ length: quantity - items.length }, () => generateProductCode());
        const result = await client.query(`INSERT INTO product_codes (product_id, code_value, batch_number, manufacture_date, expiry_date, verification_status, distribution_county)
          SELECT $1, candidate, $3, $4, $5, $6, $7 FROM unnest($2::text[]) AS candidate
          ON CONFLICT DO NOTHING RETURNING ${codeFields}`, [productId, candidates, data.batchNumber, data.manufactureDate, data.expiryDate, data.status, data.distributionCounty]);
        items.push(...result.rows);
        if (items.length === quantity) return items;
      }
      throw new ServiceUnavailableException('Unable to generate all package codes. No codes were saved. Please try again.');
    });
  }

  async updateCode(productId: string, id: string, body: unknown) {
    parseId(productId); parseId(id);
    const data = parseCode(body, false);
    const result = await this.database.query(`UPDATE product_codes SET batch_number=$3, manufacture_date=$4, expiry_date=$5, verification_status=$6, distribution_county=$7
      WHERE product_id=$1 AND id=$2 RETURNING ${codeFields}`, [productId, id, data.batchNumber, data.manufactureDate, data.expiryDate, data.status, data.distributionCounty]);
    if (!result.rows[0]) throw new NotFoundException('Verification code not found for this product.');
    return result.rows[0];
  }
}
