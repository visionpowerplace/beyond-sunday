import { readFile } from 'node:fs/promises';
import { sql, closeDb } from '@bs/core/db.js';

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
await sql.unsafe(schema);
console.log('schema applied');
await closeDb();
