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

  // upstream sports API
  gateway: process.env.UPSTREAM_GATEWAY ?? 'https://api-gateway.gw-lucky-bet.com',
  partnerId: process.env.PARTNER_ID ?? 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f',
  lang: process.env.LANG_CODE ?? 'en-001',

  // collector
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10000),
  matchPageLimit: Number(process.env.MATCH_PAGE_LIMIT ?? 3000),

  // browser clients
  allowedOrigins: list(process.env.ALLOWED_ORIGINS, '*'),

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
