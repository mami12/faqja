/**
 * Decodes real captured frames offline (no server needed) and, with --post,
 * pushes them through POST /ingest/frames on a locally running backend.
 *
 * Run: node scripts/test-frames.mjs [--post]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePushBatch } from '../server/push-decode.mjs';

// optional file argument, default scripts/sample-frames.txt
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const file = fileArg
  ? pathToFileURL(path.resolve(process.cwd(), fileArg))
  : new URL('./sample-frames.txt', import.meta.url);
const frames = fs
  .readFileSync(file, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

console.log(`frames loaded: ${frames.length}\n`);

const { infos, odds, unknown, frames: count } = decodePushBatch(frames);

console.log('--- match-info ---');
for (const i of infos) {
  console.log(
    `  match ${i.matchId} service=${i.service} provider=${i.providerId} oddsCount=${i.enabledOddsCount} score=${i.homeScore}-${i.awayScore} periods=${JSON.stringify(i.periodsScore)}`,
  );
  if (i.stats) console.log(`      stats by competitor: ${JSON.stringify(i.stats)}`);
}

console.log('\n--- match-odds ---');
for (const d of odds) {
  console.log(`  match ${d.matchId}: ${d.groups} groups, ${d.rows.length} outcomes`);
  const byMarket = new Map();
  for (const r of d.rows) {
    const k = `${r.marketKey} :: ${r.marketName}`;
    if (!byMarket.has(k)) byMarket.set(k, []);
    byMarket.get(k).push(`${r.outcomeName}${r.line ? ' ' + r.line : ''}=${r.price}${r.suspended ? ' [SUSP]' : ''}`);
  }
  for (const [k, v] of byMarket) console.log(`      ${k.padEnd(46)} ${v.join('  ')}`);
}

console.log(`\ndecoded: frames=${count} infos=${infos.length} oddsMessages=${odds.length} unknown=${unknown.length}`);

if (process.argv.includes('--post')) {
  const base = process.env.LOCAL_URL ?? 'http://localhost:3000';
  const token = process.env.INGEST_TOKEN ?? 'change-me';
  const res = await fetch(`${base}/ingest/frames`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-token': token },
    body: JSON.stringify({ frames }),
  });
  console.log('\nPOST /ingest/frames ->', res.status, await res.text());
}
