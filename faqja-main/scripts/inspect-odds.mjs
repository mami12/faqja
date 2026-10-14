/**
 * Prints how each stored market of a match was classified (debugging aid).
 * Run: node scripts/inspect-odds.mjs 40159037
 */
import { closePool, query } from '../server/db.mjs';

const matchId = Number(process.argv[2]);
if (!Number.isFinite(matchId)) {
  console.log('usage: node scripts/inspect-odds.mjs <matchId>');
  process.exit(1);
}

const res = await query(
  `select market_key, market_name, board_column, subgames, render_type, is_base, line, suspended,
          string_agg(outcome_name, '/' order by outcome_key) as outcomes
     from odds_current
    where match_id = $1
    group by market_key, market_name, board_column, subgames, render_type, is_base, line, suspended
    order by board_column, market_name, line`,
  [matchId],
);

console.log(`match ${matchId}: ${res.rows.length} markets\n`);
let column = null;
for (const r of res.rows) {
  if (r.board_column !== column) {
    column = r.board_column;
    console.log(`--- ${column} ---`);
  }
  console.log(
    `  ${String(r.market_name).padEnd(40)} line=${String(r.line).padEnd(5)} sg=${String(r.subgames).padEnd(6)} ${String(
      r.render_type,
    ).padEnd(8)} base=${r.is_base ? 'Y' : 'n'} ${r.suspended ? '[SUSP]' : ''} :: ${String(r.outcomes).slice(0, 70)}`,
  );
}
await closePool();
