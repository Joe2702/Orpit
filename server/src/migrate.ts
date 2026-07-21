import { pool } from './db.js';
import { SCHEMA_SQL } from './schema.js';

async function main() {
  await pool.query(SCHEMA_SQL);
  console.log('Migration complete.');
  await pool.end();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
