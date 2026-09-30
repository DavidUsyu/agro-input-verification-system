import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

export function schemaIdentifier(schema) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema name.');
  return `"${schema}"`;
}

export async function loadMigrations() {
  const directory = new URL('./migrations/', import.meta.url);
  const filenames = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const migrations = [];
  for (const name of filenames) {
    if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(name)) throw new Error(`Invalid migration filename: ${name}`);
    // Git can check out CRLF on Windows: checksums must agree across platforms.
    const sql = (await readFile(new URL(name, directory), 'utf8')).replace(/\r\n/g, '\n');
    const version = Number(name.slice(0, 3));
    if (migrations.some((migration) => migration.version === version)) throw new Error(`Duplicate migration version: ${version}`);
    migrations.push({ version, name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  if (migrations.length === 0) throw new Error('No SQL migrations found.');
  return migrations;
}

async function readHistory(client, schema) {
  const existing = await client.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2',
    [schema, 'schema_migrations'],
  );
  if (existing.rowCount === 0) return [];
  return (await client.query(`SELECT version, name, checksum FROM ${schemaIdentifier(schema)}.schema_migrations ORDER BY version`)).rows;
}

function validateHistory(migrations, history) {
  for (let index = 0; index < history.length; index++) {
    const recorded = history[index];
    const source = migrations[index];
    if (!source || recorded.version !== source.version || recorded.name !== source.name || recorded.checksum !== source.checksum) {
      throw new Error(`Migration history differs at ${recorded.name}. Restore the applied file and add a new migration instead.`);
    }
  }
}

export async function migrationStatus(client, { schema = 'public', migrations } = {}) {
  schemaIdentifier(schema);
  migrations ??= await loadMigrations();
  const history = await readHistory(client, schema);
  validateHistory(migrations, history);
  return migrations.map((migration, index) => ({ name: migration.name, status: index < history.length ? 'applied' : 'pending' }));
}

export async function migrate(client, { schema = 'public', migrations } = {}) {
  schemaIdentifier(schema);
  migrations ??= await loadMigrations();
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    // Serialize migration writers in this database, including first-time setup.
    await client.query('SELECT pg_advisory_xact_lock(169382, 1)');
    await client.query("SELECT set_config('search_path', $1, true)", [schemaIdentifier(schema)]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const history = await readHistory(client, schema);
    validateHistory(migrations, history);
    const pending = migrations.slice(history.length);
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [migration.version, migration.name, migration.checksum]);
    }
    await client.query('COMMIT');
    return pending.map((migration) => migration.name);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
