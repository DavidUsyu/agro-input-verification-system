import { connectDatabase } from '../database/connection.mjs';
import { seedDemo } from '../database/demo-data.mjs';

let client;
try {
  client = await connectDatabase();
  const examples = await seedDemo(client);
  console.log('Demonstration product records are ready. Existing records were preserved.');
  for (const example of examples) console.log(`${example.code}: ${example.expected}`);
  console.log('DEMO-UNKNOWN: unregistered (deliberately absent). All DEMO records are sample data, not real product approvals.');
} catch (error) {
  console.error(error.code ? 'Could not prepare demo records. Run npm run db:migrate and check the database connection.' : error.message);
  process.exitCode = 1;
} finally { await client?.end(); }
