import { db } from './knex.js';
import { up } from './migrations/001_init.js';
await up(db);
console.log('EdgeVerify schema ready');
await db.destroy();
