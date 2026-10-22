import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ensureWindowsEnv, loadWindowsConfig, parseWindowsConfig } from './windows-config.mjs';

const root = await mkdtemp(resolve(tmpdir(), 'faqja windows config '));
try {
  await copyFile(fileURLToPath(new URL('../.env.windows.example', import.meta.url)), resolve(root, '.env.windows.example'));
  const results = await Promise.all([
    ensureWindowsEnv({ rootDir: root }), ensureWindowsEnv({ rootDir: root }),
  ]);
  assert.equal(results.filter(result => result.created).length, 1, 'Only one first start creates the file');
  const first = await readFile(resolve(root, '.env'), 'utf8');
  const generated = parseEnv(first);
  assert.match(generated.JWT_SECRET, /^[A-Za-z0-9_-]{64}$/);
  assert.match(generated.INGEST_TOKEN, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(generated.JWT_SECRET, generated.INGEST_TOKEN);
  assert.equal(generated.SEED_DEFAULT_ACCOUNTS, 'false');
  assert.equal(generated.IDLE_FEED, 'false');
  assert.equal((await loadWindowsConfig({ rootDir: root, baseEnv: {} })).errors.length, 1, 'Only DB password remains to fill');

  const database = 'postgresql://testuser:test%40password@127.0.0.1:5432/disposable_test';
  const ready = first.replace(generated.DATABASE_URL, database);
  await writeFile(resolve(root, '.env'), ready);
  const config = await loadWindowsConfig({
    rootDir: root,
    baseEnv: { PORT: '9000', DATABASE_URL: 'invalid inherited DB', JWT_SECRET: 'weak inherited key', PATH: 'inherited path' },
  });
  assert.deepEqual(config.errors, []);
  assert.equal(config.port, 3000);
  assert.equal(config.url, 'http://localhost:3000/app/');
  assert.equal(config.env.DATABASE_URL, database, '.env beats inherited process settings');
  assert.equal(config.env.JWT_SECRET, generated.JWT_SECRET);
  assert.equal(config.env.PATH, 'inherited path');
  assert.equal(config.env.PARTNER_ID, 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f');
  assert.equal((await ensureWindowsEnv({ rootDir: root })).created, false);
  assert.equal(await readFile(resolve(root, '.env'), 'utf8'), ready, 'Existing secrets and comments are preserved exactly');

  for (const [key, value] of [
    ['PORT', '0'], ['PORT', '65536'], ['PORT', '30.2'],
    ['DATABASE_URL', 'postgresql://user:REPLACE_WITH_NEW_DATABASE_PASSWORD@host/db'],
    ['DATABASE_URL', 'https://user:secret-password@example.com/db'],
    ['JWT_SECRET', 'faqja-dev-secret-change-me'], ['INGEST_TOKEN', 'your-random-secret-token'],
    ['SEED_DEFAULT_ACCOUNTS', 'true'], ['NODE_ENV', 'development'],
    ['POLL_INTERVAL_MS', 'NaN'], ['ODDS_SOCKET', 'yes'], ['MATCH_CLOCK_OFFSET_MIN', '3.5'],
  ]) {
    const invalid = parseWindowsConfig(`${ready}\n${key}=${value}\n`);
    assert(invalid.errors.some(error => error.includes(key)), `${key} must be rejected`);
    assert(!invalid.errors.some(error => error.includes(value)), 'Never print a secret or invalid configuration value');
  }
  const quoted = parseWindowsConfig(`${ready}\nMATCH_CLOCK_OFFSET_MIN=-3\nEXTRA_SETTING="some $literal & value" # comment\n`);
  assert.deepEqual(quoted.errors, []);
  assert.equal(quoted.env.EXTRA_SETTING, 'some $literal & value', 'Values are not shell-evaluated');
  await rm(resolve(root, '.env'));
  const missing = await loadWindowsConfig({ rootDir: root, baseEnv: {} });
  assert.deepEqual(missing.errors, ['.env is missing. Run start.bat to create it.']);
  console.log('Windows config tests passed (create once, safe secrets, local precedence, validation).');
} finally {
  await rm(root, { recursive: true, force: true });
}
