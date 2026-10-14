/**
 * Shapes our live board for the React app.
 *
 * The app was written against a backend with Match/Market/Outcome rows; we keep matches
 * and prices in memory instead, so this module translates our serialised board into that
 * exact shape. Nothing here writes anything - it is a pure view.
 *
 * Identifiers: the app sends only an `outcomeId` when placing a bet, so it has to carry
 * everything needed to resolve the bet. Ours is `matchId|marketKey|line|outcomeKey`.
 */
const FOOTBALL = { id: 18, name: 'Football', slug: 'football', iconName: 'Activity', sortOrder: 1, isActive: true };
import * as overrides from './overrides.mjs';

export const outcomeIdOf = (matchId, marketKey, line, outcomeKey) =>
  `${matchId}|${marketKey}|${line ?? ''}|${outcomeKey}`;

export const marketIdOf = (matchId, marketKey, line) => `${matchId}|${marketKey}|${line ?? ''}`;

/** "12|g6257||1" -> { matchId: '12', marketKey: 'g6257', line: '', outcomeKey: '1' } */
export function parseOutcomeId(id) {
  const parts = String(id ?? '').split('|');
  if (parts.length < 4) return null;
  const [matchId, marketKey, line, ...rest] = parts;
  return { matchId, marketKey, line, outcomeKey: rest.join('|') };
}

const MARKET_TYPE_BY_COLUMN = {
  result: '1X2',
  total: 'OVER_UNDER',
  corners: 'CORNERS',
  cards: 'CARDS',
  other: 'OTHER',
};

/** Maps outcome code to display name, strictly preserving descriptive names (scores, players, descriptions) */
function outcomeName(key, fallback, marketType, marketName) {
  const fb = String(fallback ?? '').trim();
  const k = String(key ?? '').trim().toLowerCase();
  const mName = String(marketName ?? '').toLowerCase();

  // 1) Double Chance (1X, 12, X2)
  if (/double chance/i.test(mName) || k === '1x' || k === '12' || k === 'x2') {
    if (k === '1x' || /^1x$/i.test(fb)) return '1X';
    if (k === '12' || /^12$/i.test(fb)) return '12';
    if (k === 'x2' || /^x2$/i.test(fb)) return 'X2';
  }

  // 2) 1X2 / Result markets: strictly 1, X, 2 (regardless of whether feed passed team names)
  const is1X2 = marketType === '1X2' || /1x2|match result|full time result|\bwinner\b|moneyline/i.test(mName);
  if (is1X2 && !/score|rezultat/i.test(mName)) {
    if (k === '1' || k === 'home' || k === 'h' || k === 'w1' || /^(home|w1)$/i.test(fb)) return '1';
    if (k === 'x' || k === 'draw' || k === 'tie' || k === 'wx' || /^(draw|tie|wx)$/i.test(fb)) return 'X';
    if (k === '2' || k === 'away' || k === 'a' || k === 'w2' || /^(away|w2)$/i.test(fb)) return '2';
  }

  // 3) Over / Under
  if (k === 'over' || k === 'o' || /^over$/i.test(fb)) return 'Over';
  if (k === 'under' || k === 'u' || /^under$/i.test(fb)) return 'Under';

  // 4) Both Teams to Score / Yes / No
  if (k === 'yes' || k === 'gg' || /^yes$/i.test(fb)) return 'Yes';
  if (k === 'no' || k === 'ng' || /^no$/i.test(fb)) return 'No';

  // 5) Odd / Even
  if (k === 'odd' || /^odd$/i.test(fb)) return 'Odd';
  if (k === 'even' || /^even$/i.test(fb)) return 'Even';

  // Clean synthetic "#1", "#2" lines or keys
  if (/^#\d+$/.test(fb)) {
    return String(key ?? '');
  }

  // Preserve descriptive scores ("1:0", "2:1"), Halftime/Fulltime ("Draw / Draw"), Goalscorers, etc.
  return fb || String(key ?? '');
}

const CLIENT_STATUS = (m) => (m.live ? 'LIVE' : m.status === 'ended' ? 'ENDED' : 'PREMATCH');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** one serialised board match (see collector.serializeMatch) -> the app's Match shape */
export function toClientMatch(m) {
  const matchId = String(m.id);
  const matchOverride = overrides.matchOverride(matchId);
  // a suspended match makes every one of its prices unbettable
  const matchSuspended = m.suspended === true || matchOverride?.suspended === true;
  const markets = [];

  for (const mk of m.markets ?? []) {
    const line = mk.line ?? '';
    const isResultMarket = mk.column === 'result' || /1x2|match result|full time result|\bwinner\b|moneyline/i.test(mk.name ?? '');
    const mType = isResultMarket ? '1X2' : (MARKET_TYPE_BY_COLUMN[mk.column] ?? 'OTHER');
    const marketOverride = overrides.marketOverride(matchId, mk.key, line);
    const outcomes = (mk.outcomes ?? [])
      .map((o) => {
        // an admin override wins over the feed: a pinned price, or a forced suspension
        const forced = overrides.outcomeOverride(matchId, mk.key, line, o.key);
        const price = o.price !== null && o.price !== undefined
          ? (forced?.price ?? Number(o.price))
          : null;
        return {
          id: outcomeIdOf(matchId, mk.key, line, o.key),
          marketId: marketIdOf(matchId, mk.key, line),
          name: outcomeName(o.key, o.name, mType, mk.name),
          code: String(o.key),
          odds: price,
          status:
            o.suspended || mk.suspended || matchSuspended || marketOverride?.suspended || forced?.suspended
              ? 'SUSPENDED'
              : 'ACTIVE',
        };
      });

    // Sort outcomes in canonical sportsbook order: 1 always first, X second, 2 third
    const OUTCOME_RANK = (code, name) => {
      const c = String(code ?? '').trim().toLowerCase();
      const n = String(name ?? '').trim().toLowerCase();
      if (c === '1' || n === '1' || n === 'home' || n === 'w1') return 1;
      if (c === 'x' || n === 'x' || n === 'draw' || n === 'tie') return 2;
      if (c === '2' || n === '2' || n === 'away' || n === 'w2') return 3;
      if (c === '1x' || n === '1x') return 4;
      if (c === '12' || n === '12') return 5;
      if (c === 'x2' || n === 'x2') return 6;
      if (c === 'over' || n === 'over') return 7;
      if (c === 'under' || n === 'under') return 8;
      if (c === 'yes' || n === 'yes') return 9;
      if (c === 'no' || n === 'no') return 10;
      return 99;
    };
    outcomes.sort((a, b) => OUTCOME_RANK(a.code, a.name) - OUTCOME_RANK(b.code, b.name));

    if (isResultMarket && !/half|score|rezultat|both|corner|card|handicap|chance/i.test(mk.name ?? '')) {
      const valid1X2 = outcomes.filter((o) => ['1', 'X', '2'].includes(o.name));
      if (valid1X2.length >= 2) {
        outcomes.splice(0, outcomes.length, ...valid1X2);
      }
    }

    if (!outcomes.length) continue;
    markets.push({
      id: marketIdOf(matchId, mk.key, line),
      matchId,
      extId: String(mk.key),
      marketType: MARKET_TYPE_BY_COLUMN[mk.column] ?? 'OTHER',
      name: mk.name ?? mk.column ?? 'Market',
      specifier: line === '' ? undefined : String(line),
      line: String(line),
      status: mk.suspended || matchSuspended || marketOverride?.suspended ? 'SUSPENDED' : 'ACTIVE',
      sortOrder: Number(mk.order ?? 0),
      isBase: mk.isBase === true,
      period: Number(mk.period ?? 0),
      outcomes,
    });
  }

  // base markets first, then by the feed's own order
  markets.sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const leagueName = m.league?.name ?? m.tournament?.name ?? '';

  return {
    id: matchId,
    tournamentId: String(m.tournament?.id ?? m.league?.slug ?? ''),
    homeTeam: m.home,
    awayTeam: m.away,
    startTime: m.startAt,
    status: CLIENT_STATUS(m),
    homeScore: num(m.score?.home) ?? 0,
    awayScore: num(m.score?.away) ?? 0,
    currentMinute: num(m.minute) ?? 0,
    period: m.phase ?? m.feedStatus ?? null,
    isSuspended: m.suspended === true || matchOverride?.suspended === true,
    isSimulated: false,
    // extra context our board has and the app can show
    liveMinuteSource: m.minuteSource ?? null,
    corners: m.stats
      ? { home: num(m.stats.home?.corners) ?? 0, away: num(m.stats.away?.corners) ?? 0 }
      : null,
    cards:
      m.stats && (m.stats.home || m.stats.away)
        ? {
            home: (num(m.stats.home?.yellow) ?? 0) + (num(m.stats.home?.red) ?? 0),
            away: (num(m.stats.away?.yellow) ?? 0) + (num(m.stats.away?.red) ?? 0),
          }
        : null,
    watchUrl: m.watchUrl ?? null,
    tournament: {
      id: m.tournament?.id ?? 0,
      name: m.tournament?.name ?? leagueName,
      category: {
        id: m.league?.slug ?? '',
        name: leagueName,
        slug: m.league?.slug ?? '',
        sport: FOOTBALL,
      },
    },
    markets,
  };
}

export const toClientMatches = (list) => (list ?? []).map(toClientMatch);

/**
 * The sidebar's sport tree, built from the leagues and tournaments our feed actually
 * carries (we only track football, so there is a single sport at the root).
 * `rawRows` are rows straight from the match store.
 */
export function sportsTree(rawRows = []) {
  const categories = new Map();

  for (const row of rawRows) {
    const slug = row.category_slug ?? '';
    if (!slug) continue;

    if (!categories.has(slug)) {
      categories.set(slug, {
        id: slug,
        sportId: FOOTBALL.id,
        name: row.category_name ?? slug,
        slug,
        countryCode: null,
        sortOrder: categories.size,
        tournaments: new Map(),
        count: 0,
      });
    }

    const category = categories.get(slug);
    category.count++;
    if (row.tournament_name) {
      const key = String(row.tournament_id ?? row.tournament_name);
      if (!category.tournaments.has(key)) {
        category.tournaments.set(key, {
          id: key,
          categoryId: slug,
          name: row.tournament_name,
          slug: row.tournament_slug ?? key,
          sortOrder: category.tournaments.size,
        });
      }
    }
  }

  const list = [...categories.values()]
    .sort((a, b) => b.count - a.count)
    .map((c) => ({ ...c, tournaments: [...c.tournaments.values()] }));

  return [{ ...FOOTBALL, categories: list }];
}