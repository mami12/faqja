/**
 * Verifies the Supabase Postgres connection + prints the server version.
 * Run: node scripts/probe-db.mjs
 */
import 'dotenv/config';
import pg from 'pg';

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('DATABASE_URL is not set (check .env)');
  process.exit(1);
}

// pg >= 8.16 maps sslmode=require to verify-full, which fails against the
// Supabase pooler's certificate chain ("self-signed certificate in certificate
// chain"). So: drop sslmode from the string and force rejectUnauthorized:false.
const parsed = new URL(rawUrl);
parsed.searchParams.delete('sslmode');

const client = new pg.Client({
  connectionString: parsed.toString(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const info = await client.query(
    "select current_database() as db, current_user as usr, inet_server_addr() as host, version() as version, now() as now",
  );
  const row = info.rows[0];
  console.log('CONNECTED');
  console.log('  db      :', row.db);
  console.log('  user    :', row.usr);
  console.log('  host    :', row.host);
  console.log('  now     :', row.now.toISOString());
  console.log('  version :', String(row.version).split(' ').slice(0, 2).join(' '));

  const t = await client.query('select current_timestamp as t');
  console.log('  roundtrip ok:', t.rows[0].t.toISOString());
} catch (e) {
  console.error('DB ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
