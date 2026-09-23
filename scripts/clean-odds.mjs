/**
 * Deletes odds rows for given matches (test cleanup / resetting a match).
 *   node scripts/clean-odds.mjs 40159037            # odds + history
 *   node scripts/clean-odds.mjs --reset-state 40159037   # also clears live score/stats
 */
import { closePool, query } from '../server/db.mjs';

const args = process.argv.slice(2);
const resetState = args.includes('--reset-state');
const ids = args.filter((a) => !a.startsWith('--')).map(Number).filter(Number.isFinite);

if (!ids.length) {
  console.log('usage: node scripts/clean-odds.mjs [--reset-state] <matchId> [matchId...]');
  process.exit(1);
}

const current = await query('delete from odds_current where match_id = any($1::bigint[])', [ids]);
const history = await query('delete from odds_history where match_id = any($1::bigint[])', [ids]);
console.log(`deleted odds_current=${current.rowCount} odds_history=${history.rowCount} for ${ids.join(', ')}`);

if (resetState) {
  const st = await query(
    `update matches set home_score = null, away_score = null, periods_score = null,
            stats = null, odds_count = null, updated_at = now()
      where match_id = any($1::bigint[])`,
    [ids],
  );
  console.log(`reset live state on ${st.rowCount} match(es)`);
}

await closePool();
