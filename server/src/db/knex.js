import knex from 'knex';
import { config } from '../config.js';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = config.databaseUrl
  ? knex({ client: 'pg', connection: config.databaseUrl, pool: { min: 1, max: 10 } })
  : knex({ client: 'better-sqlite3', connection: { filename: path.join(dataDir, 'edgeverify.sqlite') }, useNullAsDefault: true });

export const isPg = Boolean(config.databaseUrl);
// JSON columns come back as strings on SQLite; normalise.
export const j = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
