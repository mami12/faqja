import 'dotenv/config';

const list = (v, fallback) =>
  (v ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  databaseUrl: process.env.DATABASE_URL ?? '',

  // a dead database should fail the deploy (Railway healthcheck + restart policy) instead
  // of leaving the API half-alive and retrying forever; off by default outside production
  dbInitStrict:
    (process.env.DB_INIT_STRICT ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',

  // upstream sports API
  gateway: process.env.UPSTREAM_GATEWAY ?? 'https://api-gateway.gw-lucky-bet.com',
  partnerId: process.env.PARTNER_ID ?? 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f',
  lang: process.env.LANG_CODE ?? 'en-001',

  // collector
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10000),
  matchPageLimit: Number(process.env.MATCH_PAGE_LIMIT ?? 3000),

  // browser clients
  allowedOrigins: list(process.env.ALLOWED_ORIGINS, '*'),

  // odds storage: 'memory' (default) keeps prices in RAM and pushes them straight to
  // browsers - no odds writes at all; 'db' mirrors them into odds_current/odds_history
  oddsStore: (process.env.ODDS_STORE ?? 'memory').toLowerCase(),

  // odds ingestion
  ingestToken: process.env.INGEST_TOKEN ?? '',

  subscribeFrames: (process.env.ODDS_SUBSCRIBE_FRAMES ?? '')
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean),
  logRawFrames: process.env.LOG_RAW_FRAMES !== 'false',

  // this feed's football sport id (verified)
  footballSportId: Number(process.env.FOOTBALL_SPORT_ID ?? 18),
};

/**
 * pg >= 8.16 treats sslmode=require as verify-full, which fails on the Supabase
 * pooler certificate chain. Strip sslmode and force the relaxed check instead.
 */
export function pgClientOptions(connectionString = config.databaseUrl, max = 5) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    max,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };
}

/**
 * Password-free description of the configured database. Logged at boot and exposed by
 * /health so "which database is this process actually using?" is never a guessing game,
 * and so the IPv6-only direct host is recognisable instead of looking like a DNS outage.
 */
export function dbTarget(connectionString = config.databaseUrl) {
  if (!connectionString) return { configured: false };
  try {
    const url = new URL(connectionString.replace(/^postgres:\/\//, 'postgresql://'));
    return {
      configured: true,
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, '') || 'postgres',
      user: decodeURIComponent(url.username ?? ''), // never the password
      pooler: /\.pooler\.supabase\.com$/i.test(url.hostname),
      ipv6OnlyDirectHost: /^db\..*\.supabase\.co$/i.test(url.hostname),
    };
  } catch {
    return { configured: true, invalid: true };
  }
}

/** one-line, credential-free rendition of dbTarget() for logs */
export function dbTargetLabel(target = dbTarget()) {
  if (!target.configured) return 'not set (DATABASE_URL is empty)';
  if (target.invalid) return 'unparseable DATABASE_URL';
  return `${target.user}@${target.host}:${target.port}/${target.database}`;
}

/**
 * pg and Supavisor (the Supabase pooler) report failures as terse strings such as
 * "Failed to connect to database: {:error, :econnrefused}" - which says nothing about
 * the cause. Append what it means and what to check, so the log line is actionable.
 */
export function dbErrorHint(message = '') {
  const m = String(message);
  if (/econnrefused|Failed to connect to database/i.test(m)) {
    return `${m} - DATABASE_URL points at a pooler whose Postgres is not running (paused or deleted Supabase project); use the live project's pooler URL`;
  }
  if (/tenant or user not found/i.test(m)) {
    return `${m} - the pooler does not know this project: expected postgresql://postgres.<project-ref>:PASSWORD@aws-<n>-<region>.pooler.supabase.com:5432/postgres`;
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) {
    return `${m} - the host did not resolve: db.<ref>.supabase.co is IPv6-only, use the pooler host`;
  }
  if (/password authentication failed/i.test(m)) {
    return `${m} - the password in DATABASE_URL is wrong`;
  }
  return m;
}
