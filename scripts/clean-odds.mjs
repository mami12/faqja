/**
 * Deletes odds rows for given matches (test cleanup / resetting a match).
 * Run: node scripts/clean-odds.mjs 40337530 40408525 40370446
 */
import { closePool, query } from '../server/db.mjs';

const ids = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!ids.length) {
  console.log('usage: node scripts/clean-odds.mjs <matchId> [matchId...]');
  process.exit(1);
}

const current = await query('delete from odds_current where match_id = any($1::bigint[])', [ids]);
const history = await query('delete from odds_history where match_id = any($1::bigint[])', [ids]);
console.log(`deleted odds_current=${current.rowCount} odds_history=${history.rowCount} for ${ids.join(', ')}`);
await closePool();
