import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { connectDatabase } from './connection.mjs';
import { loadMigrations, migrate, migrationStatus, schemaIdentifier } from './migration-runner.mjs';

let client;
let migrations;
const expectedTables = ['administrators', 'farmers', 'product_codes', 'products', 'schema_migrations', 'users', 'verification_records'];

before(async () => {
  client = await connectDatabase();
  migrations = await loadMigrations();
});
after(async () => { await client?.end(); });

async function withSchema(run) {
  const schema = `agro_test_${randomUUID().replaceAll('-', '')}`;
  const identifier = schemaIdentifier(schema);
  await client.query(`CREATE SCHEMA ${identifier}`);
  try {
    return await run(schema);
  } finally {
    // Only drop the unique schema this invocation created, never public/application tables.
    assert.match(schema, /^agro_test_[a-f0-9]{32}$/);
    await client.query(`DROP SCHEMA ${identifier} CASCADE`);
  }
}

async function tables(schema) {
  return (await client.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [schema])).rows.map((row) => row.tablename);
}

test('migration status is read-only on an empty schema', async () => {
  await withSchema(async (schema) => {
    assert.deepEqual(await migrationStatus(client, { schema }), [{ name: migrations[0].name, status: 'pending' }]);
    assert.deepEqual(await tables(schema), []);
  });
});

test('fresh migration creates the tables and repeating it preserves existing records', async () => {
  await withSchema(async (schema) => {
    assert.deepEqual(await migrate(client, { schema }), [migrations[0].name]);
    assert.deepEqual(await tables(schema), expectedTables);
    await client.query(`INSERT INTO ${schemaIdentifier(schema)}.verification_records (entered_code, result) VALUES ('UNKNOWN-TEST', 'unregistered')`);
    assert.deepEqual(await migrate(client, { schema }), []);
    const saved = await client.query(`SELECT entered_code FROM ${schemaIdentifier(schema)}.verification_records`);
    assert.equal(saved.rows[0].entered_code, 'UNKNOWN-TEST');
    assert.deepEqual(await migrationStatus(client, { schema }), [{ name: migrations[0].name, status: 'applied' }]);
  });
});

test('an edited applied migration is refused', async () => {
  await withSchema(async (schema) => {
    await migrate(client, { schema });
    const changed = [{ ...migrations[0], checksum: '0'.repeat(64) }];
    await assert.rejects(migrate(client, { schema, migrations: changed }), /Migration history differs/);
    assert.deepEqual(await tables(schema), expectedTables);
    assert.equal((await migrationStatus(client, { schema }))[0].status, 'applied');
  });
});

test('a failing migration rolls back all pending DDL and history', async () => {
  await withSchema(async (schema) => {
    const sql = 'CREATE TABLE temporary_probe (id INTEGER); SELECT * FROM nonexistent_migration_probe;';
    const bad = { version: 2, name: '002_failure.sql', sql, checksum: createHash('sha256').update(sql).digest('hex') };
    await assert.rejects(migrate(client, { schema, migrations: [...migrations, bad] }), { code: '42P01' });
    assert.deepEqual(await tables(schema), []);
  });
});

test('concurrent migration commands apply each version only once', async () => {
  await withSchema(async (schema) => {
    const other = await connectDatabase();
    try {
      const results = await Promise.all([migrate(client, { schema }), migrate(other, { schema })]);
      assert.equal(results.flat().length, 1);
      assert.deepEqual(await tables(schema), expectedTables);
    } finally { await other.end(); }
  });
});

describe('core schema integrity', () => {
  let schema;
  before(async () => {
    schema = `agro_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA ${schemaIdentifier(schema)}`);
    await migrate(client, { schema });
    await client.query("SELECT set_config('search_path', $1, false)", [schemaIdentifier(schema)]);
  });
  after(async () => {
    if (!schema) return;
    await client.query("SET search_path TO public");
    assert.match(schema, /^agro_test_[a-f0-9]{32}$/);
    await client.query(`DROP SCHEMA ${schemaIdentifier(schema)} CASCADE`);
  });
  beforeEach(async () => { await client.query('BEGIN'); });
  afterEach(async () => { await client.query('ROLLBACK'); });

  async function user(role = 'farmer', overrides = {}) {
    const email = overrides.email === undefined ? `${randomUUID()}@example.invalid` : overrides.email;
    const row = await client.query(
      'INSERT INTO users (full_name, phone, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['Schema test account', overrides.phone ?? null, email, 'test-only-hash-placeholder', role],
    );
    return row.rows[0].id;
  }

  async function account(role = 'farmer', overrides = {}) {
    const id = await user(role, overrides);
    if (role === 'farmer') await client.query('INSERT INTO farmers (user_id, county) VALUES ($1, $2)', [id, 'Nairobi']);
    else await client.query('INSERT INTO administrators (user_id, staff_number) VALUES ($1, $2)', [id, `TEST-${randomUUID()}`]);
    return id;
  }

  async function product() {
    const admin = await account('administrator');
    return (await client.query(
      "INSERT INTO products (name, category, manufacturer, created_by) VALUES ('Test seed', 'seed', 'Test manufacturer', $1) RETURNING id",
      [admin],
    )).rows[0].id;
  }

  async function code(value = 'TEST-CODE-001') {
    return (await client.query(
      "INSERT INTO product_codes (product_id, code_value, batch_number, manufacture_date, expiry_date) VALUES ($1, $2, 'TEST-BATCH', '2026-01-01', '2027-01-01') RETURNING id",
      [await product(), value],
    )).rows[0].id;
  }

  test('matching farmer and administrator profiles satisfy deferred constraints', async () => {
    const farmer = await account();
    const admin = await account('administrator');
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    const rows = (await client.query('SELECT id, farmer_profile_id, administrator_profile_id FROM users ORDER BY id')).rows;
    assert.equal(rows.find((row) => row.id === farmer).farmer_profile_id, farmer);
    assert.equal(rows.find((row) => row.id === admin).administrator_profile_id, admin);
  });

  test('an account cannot be committed without a matching profile', async () => {
    await user();
    await assert.rejects(client.query('SET CONSTRAINTS ALL IMMEDIATE'), { code: '23503', constraint: 'users_farmer_profile_fk' });
  });

  test('a farmer account cannot also have administrator privileges', async () => {
    const id = await account();
    await client.query("INSERT INTO administrators (user_id, staff_number) VALUES ($1, 'TEST-WRONG-ROLE')", [id]);
    await assert.rejects(client.query('SET CONSTRAINTS ALL IMMEDIATE'), { code: '23503', constraint: 'administrators_matching_role_fk' });
  });

  test('deleting a profile while its account remains is rejected', async () => {
    const id = await account();
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await assert.rejects(client.query('DELETE FROM farmers WHERE user_id = $1', [id]), { code: '23503' });
  });

  test('changing a role without replacing the matching profile is rejected', async () => {
    const id = await account();
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await assert.rejects(client.query("UPDATE users SET role = 'administrator' WHERE id = $1", [id]), { code: '23503' });
  });

  test('an intentional role change can replace both account and profile in one transaction', async () => {
    const id = await account();
    await client.query('DELETE FROM farmers WHERE user_id = $1', [id]);
    await client.query("UPDATE users SET role = 'administrator' WHERE id = $1", [id]);
    await client.query("INSERT INTO administrators (user_id, staff_number) VALUES ($1, 'TEST-ROLE-CHANGE')", [id]);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  });

  test('a phone-only farmer account is valid', async () => {
    await account('farmer', { email: null, phone: '+254700000001' });
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  });

  test('accounts need at least one contact method', async () => {
    await assert.rejects(user('farmer', { email: null }), { code: '23514', constraint: 'users_contact_required' });
  });

  test('email uniqueness ignores letter case', async () => {
    await account('farmer', { email: 'Farmer@example.invalid' });
    await assert.rejects(user('farmer', { email: 'farmer@example.invalid' }), { code: '23505' });
  });

  test('normalized phone numbers are unique', async () => {
    await account('farmer', { phone: '+254700000001' });
    await assert.rejects(user('farmer', { phone: '+254700000001' }), { code: '23505' });
  });

  test('only administrator profiles can own product records', async () => {
    const farmer = await account();
    await assert.rejects(client.query(
      "INSERT INTO products (name, category, manufacturer, created_by) VALUES ('Test', 'seed', 'Test', $1)", [farmer],
    ), { code: '23503' });
  });

  test('only seeds and fertilizers are accepted', async () => {
    const id = await product();
    await assert.rejects(client.query("UPDATE products SET category = 'pesticide' WHERE id = $1", [id]), { code: '23514' });
  });

  test('product codes are unique regardless of case', async () => {
    await code('TEST-CODE-001');
    await assert.rejects(code('test-code-001'), { code: '23505' });
  });

  test('expiry cannot precede the manufacture date', async () => {
    const id = await code();
    await assert.rejects(client.query("UPDATE product_codes SET expiry_date = '2025-12-31' WHERE id = $1", [id]), { code: '23514' });
  });

  test('registered and guest checks of known and unknown codes can be saved', async () => {
    const farmer = await account();
    const registered = await code();
    await client.query("INSERT INTO verification_records (farmer_id, product_code_id, entered_code, result) VALUES ($1, $2, 'TEST-CODE-001', 'verified')", [farmer, registered]);
    await client.query("INSERT INTO verification_records (product_code_id, entered_code, result) VALUES ($1, 'TEST-CODE-001', 'verified')", [registered]);
    await client.query("INSERT INTO verification_records (entered_code, result, channel) VALUES ('UNKNOWN-CODE', 'unregistered', 'ussd')");
    await client.query("INSERT INTO verification_records (entered_code, result) VALUES ('', 'invalid')");
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    const unknown = (await client.query("SELECT * FROM verification_records WHERE result = 'unregistered'")).rows[0];
    assert.equal(unknown.entered_code, 'UNKNOWN-CODE');
    assert.equal(unknown.product_code_id, null);
    assert.equal(unknown.farmer_id, null);
    assert.ok(unknown.verified_at instanceof Date);
  });

  test('a verified outcome must reference a registered code', async () => {
    await assert.rejects(client.query("INSERT INTO verification_records (entered_code, result) VALUES ('UNKNOWN', 'verified')"), { code: '23514' });
  });

  test('a verification cannot refer to a nonexistent registered code', async () => {
    await assert.rejects(client.query("INSERT INTO verification_records (entered_code, result, product_code_id) VALUES ('UNKNOWN', 'verified', 9223372036854775807)"), { code: '23503' });
  });

  test('deleting a farmer account preserves verification history', async () => {
    const farmer = await account();
    await client.query("INSERT INTO verification_records (farmer_id, entered_code, result) VALUES ($1, 'UNKNOWN', 'unregistered')", [farmer]);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('DELETE FROM users WHERE id = $1', [farmer]);
    const saved = (await client.query('SELECT farmer_id, entered_code FROM verification_records')).rows[0];
    assert.equal(saved.farmer_id, null);
    assert.equal(saved.entered_code, 'UNKNOWN');
    assert.equal((await client.query('SELECT * FROM farmers WHERE user_id = $1', [farmer])).rowCount, 0);
  });

  test('used product codes cannot be deleted with their history', async () => {
    const registered = await code();
    await client.query("INSERT INTO verification_records (product_code_id, entered_code, result) VALUES ($1, 'TEST-CODE-001', 'verified')", [registered]);
    await assert.rejects(client.query('DELETE FROM product_codes WHERE id = $1', [registered]), { code: '23001', constraint: 'verification_records_product_code_id_fkey' });
  });

  test('administrators who created products cannot be deleted', async () => {
    const id = await product();
    const admin = (await client.query('SELECT created_by FROM products WHERE id = $1', [id])).rows[0].created_by;
    await assert.rejects(client.query('DELETE FROM users WHERE id = $1', [admin]), { code: '23001', constraint: 'products_created_by_fkey' });
  });
});
