/**
 * Logjika që detekton market-et e skaduara.
 *
 * Feed-i NUK i shënon market-et e skaduara si `suspended` ose `expired` — ai thjesht
 * ndalon së dërguari ato. Pra `lockedMarkets` nuk merr kurrë `true` për ta, dhe frontend-i
 * vazhdon t'i shfaqë. Ky file e zgjidh duke detektuar skadimin nga:
 *
 *   - emri i market-it    ("1st half. ...", "Halftime/Fulltime", ...)
 *   - faza e ndeshjes      (period: 1H, 2H, HT, FT)
 *   - minuta               (currentMinute > 45 → 1H mbaroi)
 *   - statusi i ndeshjes   (ENDED / FINISHED)
 *   - rezultati live       (për "first goal", "HT result", etj.)
 */

/** Normalizon emrin e market-it për krahasim */
const norm = (s: any) => String(s ?? '').toLowerCase().trim();

/** A i përket ky market pjesës së parë? */
export const isFirstHalfMarket = (name: string): boolean =>
  /1st half|first half|\b1h\b/i.test(name);

/** A i përket ky market pjesës së dytë? */
export const isSecondHalfMarket = (name: string): boolean =>
  /2nd half|second half|\b2h\b/i.test(name);

/** A është "Halftime/Fulltime" ose "HT/FT"? */
export const isHTFTMarket = (name: string): boolean =>
  /halftime\/?fulltime|ht\/?ft|half.?time\s*\/\s*full.?time/i.test(name);

/** A është "1st half. Result" / "Half Time Result"? */
export const isFirstHalfResultMarket = (name: string): boolean =>
  /1st half.*result|first half.*result|half.?time\s*(result|winner|score)|ht\s*(result|winner|score)/i.test(name);

/** A është "first goal" / "first corner" / "first card"? */
export const isFirstEventMarket = (name: string): boolean =>
  /\b(first|1st)\b.*\b(goal|corner|card|yellow|red|booking|point|set|score|scorer)\b/i.test(name);

/** A ka mbaruar ndeshja? */
const isMatchFinished = (m: any): boolean => {
  const status = String(m?.status ?? '').toUpperCase();
  const phase = String(m?.period ?? '').toUpperCase();
  return (
    status === 'ENDED' ||
    status === 'FINISHED' ||
    status === 'FT' ||
    phase === 'FT' ||
    phase === 'ENDED' ||
    phase === 'FINISHED'
  );
};

/** A jemi në pjesën e dytë ose më vonë? */
const isSecondHalfOrLater = (m: any): boolean => {
  const phase = String(m?.period ?? '').toUpperCase();
  const minute = Number(m?.currentMinute ?? 0);
  return phase === '2H' || phase === 'HT' || phase === 'FT' || minute > 45;
};

/**
 * A ka skaduar ky market? Bazuar në emër + fazë + minutë + status + rezultat.
 * Kjo është logjika kryesore që zëvendëson mungesën e shenjës nga feed-i.
 */
export function isMarketExpired(m: any, market: any): boolean {
  if (!market) return false;
  const name = norm(market.name);

  // 0) Ndeshja mbaroi → çdo market skadon
  if (isMatchFinished(m)) return true;

  // 1) Market-et e pjesës së parë → skadojnë kur kaluam 45' ose jemi në 2H/HT
  if (isFirstHalfMarket(name)) {
    if (isSecondHalfOrLater(m)) return true;
  }

  // 2) "Halftime/Fulltime" → skadon kur pjesa e parë mbaroi
  if (isHTFTMarket(name)) {
    if (isSecondHalfOrLater(m)) return true;
  }

  // 3) "1st half. Result" / "Half Time Result" → skadon kur pjesa e parë mbaroi
  if (isFirstHalfResultMarket(name)) {
    if (isSecondHalfOrLater(m)) return true;
  }

  // 4) "First goal/corner/card" → skadon kur ngjarja e parë ka ndodhur
  if (isFirstEventMarket(name)) {
    const totalGoals = Number(m?.homeScore ?? 0) + Number(m?.awayScore ?? 0);
    const totalCorners = Number(m?.corners?.home ?? 0) + Number(m?.corners?.away ?? 0);
    const totalCards = Number(m?.cards?.home ?? 0) + Number(m?.cards?.away ?? 0);

    if (/\bgoal|scorer\b/i.test(name) && totalGoals > 0) return true;
    if (/\bcorner\b/i.test(name) && totalCorners > 0) return true;
    if (/\b(card|yellow|red|booking)\b/i.test(name) && totalCards > 0) return true;
  }

  // 5) Market-et e pjesës së dytë → skadojnë vetëm kur ndeshja mbaroi
  if (isSecondHalfMarket(name)) {
    if (isMatchFinished(m)) return true;
  }

  return false;
}

/**
 * A është outcome-i i disponueshëm për bast?
 * Kontrollon: ka odds valid, nuk është suspended.
 */
export const isOutcomeAvailable = (o: any): boolean =>
  !!o &&
  typeof o.odds === 'number' &&
  o.odds > 0 &&
  o.suspended !== true;

/**
 * A është market-i i suspenduar nga feed-i (përkohësisht)?
 */
export const isMarketSuspended = (market: any, lockedMarkets?: Record<string, boolean>): boolean => {
  if (!market) return false;
  if (market.suspended === true) return true;
  if (String(market.status ?? '').toUpperCase() === 'SUSPENDED') return true;
  if (lockedMarkets && lockedMarkets[market.id] === true) return true;
  return false;
};

/**
 * Filtri i plotë: a duhet shfaqur ky market?
 */
export function isMarketVisible(
  m: any,
  market: any,
  lockedMarkets?: Record<string, boolean>,
): boolean {
  if (!market) return false;
  if (!market.outcomes?.length) return false;
  if (isMarketExpired(m, market)) return false;
  if (isMarketSuspended(market, lockedMarkets)) return false;
  if (!market.outcomes.some(isOutcomeAvailable)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Filtrat e total-eve (goals / corners / cards)                       */
/* ------------------------------------------------------------------ */

/** A është total market (goals/corners/cards)? */
const isTotalMarket = (market: any) => {
  const type = String(market?.marketType ?? '').toUpperCase();
  if (type === 'OVER_UNDER' || type === 'TOTALS' || type === 'CORNERS' || type === 'CARDS') return true;
  const n = String(market?.name ?? '').toLowerCase();
  return /total|over\/?under|under\/?over|goal line/i.test(n) &&
    !/handicap|half time|ht\/?ft|correct score|1x2|winner|first|next|last|both teams/i.test(n);
};

const parseLineNum = (line?: string) => {
  if (!line) return null;
  const m = String(line).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const isOverOutcome = (o: any) =>
  /^(over|o)$/i.test(String(o.name ?? '').trim()) || String(o.key ?? '').toLowerCase() === 'over';
const isUnderOutcome = (o: any) =>
  /^(under|u)$/i.test(String(o.name ?? '').trim()) || String(o.key ?? '').toLowerCase() === 'under';

const counterFor = (market: any, match: any) => {
  const n = String(market?.name ?? '').toLowerCase();
  if (/corner/.test(n)) return (match.corners?.home ?? 0) + (match.corners?.away ?? 0);
  if (/card|booking|yellow|red/.test(n)) return (match.cards?.home ?? 0) + (match.cards?.away ?? 0);
  return (match.homeScore ?? 0) + (match.awayScore ?? 0);
};

/**
 * Heq outcomes që tashmë janë vendosur nga rezultati live.
 * Over vdes kur count > line, Under vdes kur count < line.
 * Në linjë të plotë (integer) është push dhe të dyja mbeten.
 * Handicap, correct score, BTTS, 1X2 nuk preken.
 */
export function filterDecidedOutcomes(outcomes: any[] = [], market: any = {}, match: any = {}) {
  if (!outcomes.length) return outcomes;
  if (!isTotalMarket(market)) return outcomes;
  const lineNum = parseLineNum(market?.line);
  if (lineNum == null) return outcomes;
  const total = counterFor(market, match);
  return outcomes.filter((o) => {
    if (isOverOutcome(o)) return total <= lineNum;
    if (isUnderOutcome(o)) return total >= lineNum;
    return true;
  });
}