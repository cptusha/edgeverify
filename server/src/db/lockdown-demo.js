// One-off: secure a live database that was seeded with the public demo credentials.
// Gives every demo account a new random password (printed once) and disables the public demo API key.
// Usage (from the server folder, pointing at the live database):
//   DATABASE_URL="postgres://..." JWT_SECRET="<same as Render>" node src/db/lockdown-demo.js
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './knex.js';
import { hashKey } from '../middleware/auth.js';

const DEMO_EMAILS = ['admin@demobank.ng', 'mlro@demobank.ng', 'analyst@demobank.ng', 'auditor@demobank.ng', 'root@edgeverify.io'];

const keyRows = await db('api_keys').where({ key_hash: hashKey('ev_live_DEMO_KEY_change_me') }).update({ active: false });
console.log(`Public demo API key disabled (${keyRows} key${keyRows === 1 ? '' : 's'}).`);

console.log('\nNew passwords (save them now, they are not shown again):');
for (const email of DEMO_EMAILS) {
  const users = await db('users').where({ email });
  if (!users.length) { console.log(`  ${email}: not found, skipped`); continue; }
  const pw = crypto.randomBytes(12).toString('base64url');
  await db('users').where({ email }).update({ password_hash: await bcrypt.hash(pw, 10) });
  console.log(`  ${email}: ${pw}`);
}
await db.destroy();
