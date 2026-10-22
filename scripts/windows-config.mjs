/** Private Windows configuration setup. Uses only built-in Node.js modules. */
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const placeholder = /REPLACE_WITH|PROJECT_REF|change-me|your-random-secret-token|faqja-dev-secret/i;
const booleanKeys = [
  'SEED_DEFAULT_ACCOUNTS', 'ODDS_SOCKET', 'IDLE_FEED', 'ISCTRL_SOCKET',
  'LUCKYBET_REST', 'CASINO_REAL_MONEY_ENABLED', 'CASINO_MATH_APPROVED',
];
const numberKeys = [
  'POLL_INTERVAL_MS', 'SUBSCRIBE_FULL_LIMIT', 'PREMATCH_UNPRICED_MS',
  'IDLE_AFTER_MS', 'IDLE_COLD_BOOT_MS', 'ISCTRL_LANG', 'ISCTRL_SPORT_ID',
  'LUCKYBET_REST_MS', 'MATCH_PAGE_LIMIT', 'SUBSCRIBE_LIVE_LIMIT',
  'PREMATCH_SOON_MIN', 'SUBSCRIBE_PREMATCH_LIMIT',
];

/** Create once using exclusive creation. Existing secrets and settings are never rewritten. */
export async function ensureWindowsEnv({ rootDir = defaultRoot } = {}) {
  const envPath = resolve(rootDir, '.env');
  try {
    await readFile(envPath);
    return { created: false, envPath };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const template = await readFile(resolve(rootDir, '.env.windows.example'), 'utf8');
  const content = template
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(48).toString('base64url')}`)
    .replace(/^INGEST_TOKEN=.*$/m, `INGEST_TOKEN=${randomBytes(32).toString('base64url')}`);
  try {
    await writeFile(envPath, content, { flag: 'wx', mode: 0o600 });
    return { created: true, envPath };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return { created: false, envPath };
  }
}

/** .env wins over inherited settings; values are data, never shell commands. */
export function parseWindowsConfig(source, baseEnv = {}) {
  const env = {
    NODE_ENV: 'production', PORT: '3000', SEED_DEFAULT_ACCOUNTS: 'false',
    ...baseEnv, ...parseEnv(source),
  };
  const errors = [];
  const port = Number(env.PORT);
  if (!/^\d+$/.test(env.PORT) || !Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535.');
  }
  if (env.NODE_ENV !== 'production') errors.push('NODE_ENV must be production for the Windows server.');
  if (env.SEED_DEFAULT_ACCOUNTS !== 'false') {
    errors.push('SEED_DEFAULT_ACCOUNTS must be false when using the existing database.');
  }
  try {
    const database = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol)
      || !database.hostname || !database.username || !database.password
      || placeholder.test(decodeURIComponent(database.password))) throw new Error();
  } catch {
    errors.push('DATABASE_URL must contain your current PostgreSQL connection URL and password.');
  }
  for (const key of ['JWT_SECRET', 'INGEST_TOKEN']) {
    if (typeof env[key] !== 'string' || env[key].length < 32 || placeholder.test(env[key])) {
      errors.push(`${key} must be a private random value of at least 32 characters.`);
    }
  }
  for (const key of booleanKeys) {
    if (env[key] !== undefined && env[key] !== 'true' && env[key] !== 'false') {
      errors.push(`${key} must be true or false.`);
    }
  }
  for (const key of numberKeys) {
    if (env[key] !== undefined && (!/^\d+$/.test(env[key]) || !Number.isSafeInteger(Number(env[key])))) {
      errors.push(`${key} must be a non-negative integer.`);
    }
  }
  if (env.MATCH_CLOCK_OFFSET_MIN !== undefined
    && (!/^-?\d+$/.test(env.MATCH_CLOCK_OFFSET_MIN) || !Number.isSafeInteger(Number(env.MATCH_CLOCK_OFFSET_MIN)))) {
    errors.push('MATCH_CLOCK_OFFSET_MIN must be an integer.');
  }
  // Errors deliberately contain variable names only, never values or connection strings.
  return { env, port, url: Number.isInteger(port) ? `http://localhost:${port}/app/` : null, errors };
}

export async function loadWindowsConfig({ rootDir = defaultRoot, baseEnv = process.env } = {}) {
  const envPath = resolve(rootDir, '.env');
  try {
    const source = await readFile(envPath, 'utf8');
    return { ...parseWindowsConfig(source, baseEnv), envPath };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { env: {}, port: null, url: null, envPath, errors: ['.env is missing. Run start.bat to create it.'] };
    }
    // Do not expose parser errors: a malformed setting may contain a password.
    return { env: {}, port: null, url: null, envPath, errors: ['.env could not be read. Check its permissions and format.'] };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--create')) {
      const { created } = await ensureWindowsEnv();
      console.log(created ? 'Created private .env. Set DATABASE_URL before starting.' : 'Existing .env preserved.');
    }
    if (process.argv.includes('--check')) {
      const { errors } = await loadWindowsConfig();
      for (const error of errors) console.error(error);
      if (errors.length) process.exitCode = 1;
      else console.log('Windows configuration is valid.');
    }
  } catch {
    console.error('Windows configuration setup failed. Check the project folder permissions.');
    process.exitCode = 1;
  }
}
