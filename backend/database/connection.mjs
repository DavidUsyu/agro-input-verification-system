import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';

export async function connectDatabase() {
  let local = {};
  try {
    local = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const connectionString = process.env.DATABASE_URL ?? local.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing. Run npm run setup or set DATABASE_URL.');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    return client;
  } catch {
    await client.end().catch(() => {});
    throw new Error('Could not connect to PostgreSQL. Run npm run db:up and check backend/.env.');
  }
}
