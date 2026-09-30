import { connectDatabase } from './connection.mjs';
import { migrate, migrationStatus } from './migration-runner.mjs';

let client;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--status')) {
    throw new Error('Usage: npm run db:migrate or npm run db:status');
  }
  client = await connectDatabase();
  if (args[0] === '--status') {
    for (const migration of await migrationStatus(client)) console.log(`${migration.status}: ${migration.name}`);
  } else {
    const applied = await migrate(client);
    if (applied.length === 0) console.log('Database is up to date. No migrations applied.');
    else for (const name of applied) console.log(`Applied ${name}`);
  }
} catch (error) {
  // Do not print connection strings, SQL parameters or database error details.
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client?.end();
}
