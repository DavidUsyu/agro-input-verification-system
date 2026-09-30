import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { connectDatabase } from '../database/connection.mjs';

const require = createRequire(import.meta.url);
let client;
let terminal;
let hidden = false;

async function field(name, prompt, secret = false) {
  if (process.env[name]) return process.env[name];
  if (!process.stdin.isTTY) throw new Error(`Run this command in an interactive terminal, or provide ${name} in the process environment.`);
  if (!terminal) {
    const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
    terminal = createInterface({ input: process.stdin, output, terminal: true });
  }
  if (!secret) return terminal.question(prompt);
  process.stdout.write(prompt);
  hidden = true;
  try { return await terminal.question(''); }
  finally { hidden = false; process.stdout.write('\n'); }
}

try {
  const { hashPassword } = require('../dist/auth/passwords.js');
  const { parseRegistration } = require('../dist/auth/validation.js');
  const fullName = await field('AGRO_ADMIN_NAME', 'Administrator full name: ');
  const email = await field('AGRO_ADMIN_EMAIL', 'Administrator email: ');
  const staffNumber = (await field('AGRO_ADMIN_STAFF_NUMBER', 'Staff number: ')).trim();
  const password = await field('AGRO_ADMIN_PASSWORD', 'Password (15–128 characters, hidden): ', true);
  if (!process.env.AGRO_ADMIN_PASSWORD) {
    const confirmation = await field('AGRO_ADMIN_PASSWORD_CONFIRM', 'Confirm password (hidden): ', true);
    if (confirmation !== password) throw new Error('Passwords do not match.');
  }
  if (!staffNumber || staffNumber.length > 50 || /[\u0000-\u001f\u007f]/.test(staffNumber)) throw new Error('Staff number must contain 1 to 50 characters.');
  const input = parseRegistration({ fullName, email, password });
  const passwordHash = await hashPassword(input.password);
  client = await connectDatabase();
  await client.query('BEGIN');
  try {
    const result = await client.query(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'administrator') RETURNING id",
      [input.fullName, input.email, passwordHash],
    );
    await client.query("INSERT INTO administrators (user_id, staff_number, permission_level) VALUES ($1, $2, 'standard')", [result.rows[0].id, staffNumber]);
    await client.query('COMMIT');
    console.log('Administrator account created. Sign in through the normal login page.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
} catch (error) {
  console.error(error.code === '23505' ? 'An account or staff number already exists. No account was changed.' : error.code === 'MODULE_NOT_FOUND' ? 'Build the backend first with npm run build --workspace backend.' : error.code ? 'Administrator creation failed. Check database configuration and run migrations.' : error.message);
  process.exitCode = 1;
} finally { terminal?.close(); await client?.end(); }
