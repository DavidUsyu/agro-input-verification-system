import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = new URL('../', import.meta.url);

function createIfMissing(relativePath, content) {
  const destination = new URL(relativePath, root);
  if (existsSync(destination)) {
    console.log(`Kept existing ${relativePath}`);
    return;
  }
  writeFileSync(destination, content, { flag: 'wx', mode: 0o600 });
  console.log(`Created ${relativePath}`);
}

const databaseExample = readFileSync(new URL('.env.example', root), 'utf8');
createIfMissing('.env', databaseExample.replace('replace-with-a-local-password', randomBytes(24).toString('hex')));

const database = parseEnv(readFileSync(new URL('.env', root), 'utf8'));
for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_PORT']) {
  if (!database[key]) throw new Error(`Set ${key} in the root .env file and rerun setup.`);
}
if (!/^\d+$/.test(database.POSTGRES_PORT) || Number(database.POSTGRES_PORT) < 1 || Number(database.POSTGRES_PORT) > 65535) {
  throw new Error('POSTGRES_PORT must be a port between 1 and 65535.');
}

const databaseUrl = `postgresql://${encodeURIComponent(database.POSTGRES_USER)}:${encodeURIComponent(database.POSTGRES_PASSWORD)}@127.0.0.1:${database.POSTGRES_PORT}/${encodeURIComponent(database.POSTGRES_DB)}`;
const backendExample = readFileSync(new URL('backend/.env.example', root), 'utf8');
createIfMissing('backend/.env', backendExample.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUrl}`));
createIfMissing('frontend/.env.local', readFileSync(new URL('frontend/.env.example', root), 'utf8'));

console.log(`Environment ready in ${fileURLToPath(root)}. Local credentials were not printed.`);
