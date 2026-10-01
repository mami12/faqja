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

/** the app looks for outcomes literally named 1 / X / 2 in the 1X2 market */
function outcomeName(key, fallback) {
  const k = String(key ?? '').toLowerCase();
  if (k === '1') return '1';
  if (k === 'x') return 'X';
  if (k === '2') return '2';
  if (k === 'over' || k === 'o') return 'Over';
  if (k === 'under' || k === 'u') return 'Under';
  return fallback ?? String(key ?? '');
}

const CLIENT_STATUS = (m) => (m.live ? 'LIVE' : m.status === 'ended' ? 'ENDED' : 'PREMATCH');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** one serialised board match (see collector.serializeMatch) -> the app's Match shape */
export function toClientMatch(m) {
  const matchId = String(m.id);
  const markets = [];

  for (const mk of m.markets ?? []) {
    const line = mk.line ?? '';
    const outcomes = (mk.outcomes ?? [])
      .filter((o) => o.price !== null && o.price !== undefined)
      .map((o) => ({
        id: outcomeIdOf(matchId, mk.key, line, o.key),
        marketId: marketIdOf(matchId, mk.key, line),
        name: outcomeName(o.key, o.name),
        code: String(o.key),
        odds: Number(o.price),
        status: o.suspended || mk.suspended ? 'SUSPENDED' : 'ACTIVE',
      }));

    if (!outcomes.length) continue;
    markets.push({
      id: marketIdOf(matchId, mk.key, line),
      matchId,
      extId: String(mk.key),
      marketType: MARKET_TYPE_BY_COLUMN[mk.column] ?? 'OTHER',
      name: mk.name ?? mk.column ?? 'Market',
      specifier: line === '' ? undefined : String(line),
      line: String(line),
      status: mk.suspended ? 'SUSPENDED' : 'ACTIVE',
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
    isSuspended: m.suspended === true,
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