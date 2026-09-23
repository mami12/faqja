/**
 * Proves the score path: posts a match-info frame (stats + goals) for a real
 * tracked football match and checks what the board reports.
 *
 * Run: node scripts/test-score.mjs
 */
const BASE = process.env.LOCAL_URL ?? 'http://localhost:3000';
const TOKEN = process.env.INGEST_TOKEN ?? 'change-me';

const json = async (p) => {
  const r = await fetch(`${BASE}${p}`);
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
};

// Iraq - Oman (competitor ids from the relayed frames)
const MATCH_ID = 40159037;
const HOME_ID = '87150';
const AWAY_ID = '53449439';

const message = {
  messageType: 'match-info',
  data: {
    matchId: MATCH_ID,
    ts: Date.now(),
    enabledOddsCount: 70,
    service: 'LIVE',
    providerId: 10,
    scoreBoard: {
      results: {
        [HOME_ID]: { corners: '2', yellowCards: '1', redCards: '0', goals: '1' },
        [AWAY_ID]: { corners: '3', yellowCards: '0', redCards: '0', goals: '1' },
      },
    },
  },
};

const res = await fetch(`${BASE}/ingest/frames`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ingest-token': TOKEN },
  body: JSON.stringify({ frames: [`42${JSON.stringify(['u', message, 'score-test'])}`] }),
});
console.log('POST /ingest/frames ->', res.status, await res.text());

const m = await json(`/api/matches/${MATCH_ID}`);
console.log(`match   : ${m.home} - ${m.away}`);
console.log(`score   : ${m.score ? `${m.score.home}-${m.score.away}` : '(none)'}`);
console.log(
  `stats   : corners ${m.stats?.home?.corners}-${m.stats?.away?.corners} · yellow ${m.stats?.home?.yellow}-${m.stats?.away?.yellow} · red ${m.stats?.home?.red}-${m.stats?.away?.red}`,
);
console.log(`odds    : ${m.oddsCount} enabled, ${m.marketCount} markets stored`);

const history = await json(`/api/matches/${MATCH_ID}`);
console.log(history.stats?.raw ? '' : '');
