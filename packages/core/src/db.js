import postgres from 'postgres';
import { config } from './config.js';

if (!config.databaseUrl) {
  console.warn('[db] DATABASE_URL is not set');
}

export const sql = postgres(config.databaseUrl, {
  max: Number(process.env.PG_POOL_MAX || 5),
  idle_timeout: 30,
  // Railway's internal Postgres does not present a public cert; its own URL
  // already keeps traffic on the private network.
  ssl: /sslmode=require/.test(config.databaseUrl) ? 'require' : false,
  onnotice: () => {},
});

export async function closeDb() {
  await sql.end({ timeout: 5 });
}
