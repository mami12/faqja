/**
 * Quick upstream API check: sport catalogue + how many matches survive the
 * "real football only" filter, and which sports exist at all.
 *
 * Run: node scripts/probe-gateway.mjs
 */
import { fetchRealFootball, loadCatalog } from '../server/upstream.mjs';

const catalog = await loadCatalog();
console.log(`catalogue: sports=${catalog.sports.size} categories=${catalog.categories.size} tournaments=${catalog.tournaments.size}`);

console.log('\nsports:');
for (const [id, s] of [...catalog.sports].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(id).padStart(4)}  ${String(s.name).padEnd(22)} tag=${String(s.tag).padEnd(18)} isEsport=${s.isEsport} type=${s.sportType}`);
}

const { rows, received, skipped } = await fetchRealFootball();
const live = rows.filter((r) => r.service === 'LIVE');
const prematch = rows.filter((r) => r.service === 'PREMATCH');
console.log(`\nfootball: received=${received} kept=${rows.length} filtered=${skipped} (live=${live.length} prematch=${prematch.length})`);

const byLeague = new Map();
for (const r of rows) byLeague.set(r.category_name ?? r.category_slug, (byLeague.get(r.category_name ?? r.category_slug) ?? 0) + 1);
console.log('\ntop leagues:');
for (const [name, n] of [...byLeague].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(n).padStart(4)}  ${name}`);
}

console.log('\nsample live:');
for (const m of live.slice(0, 10)) {
  console.log(`  ${m.match_id}  ${m.start_at.toISOString()}  min=${m.live_minute ?? '-'}  ${m.home} - ${m.away}`);
}
process.exit(0);
