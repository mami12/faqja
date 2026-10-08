import { useMemo } from 'react';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Every market of one match, grouped the way the board reads them: result, totals, corners,
 * cards, then the rest. This is what the "+" button on a match card opens - it used to only
 * navigate away, so corners, cards and the live minute were never visible in the list.
 */

const COLUMN_ORDER = ['result', 'total', 'corners', 'cards', 'other'] as const;
type Column = (typeof COLUMN_ORDER)[number];

const COLUMN_TITLE: Record<Column, string> = {
  result: 'markets.result',
  total: 'markets.totals',
  corners: 'markets.corners',
  cards: 'markets.cards',
  other: 'markets.other',
};

/** the feed names markets inconsistently, so fall back to its own type/name signals */
export function columnOf(market: Market): Column {
  const type = String(market.marketType ?? '').toUpperCase();
  if (type === '1X2') return 'result';
  if (type === 'OVER_UNDER') return 'total';
  if (type === 'CORNERS') return 'corners';
  if (type === 'CARDS') return 'cards';

  const s = `${market.name ?? ''} ${(market as any).extId ?? ''}`.toLowerCase();
  if (/corner/.test(s)) return 'corners';
  // word boundaries matter: "scored" must not look like a red card
  if (/\bcards?\b|booking|yellow|\bred\b/.test(s)) return 'cards';
  if (/1x2|full time result|match result|winner|double chance/.test(s)) return 'result';
  if (/handicap|fora|asian/.test(s)) return 'other';
  if (/total|over\/?under|\bgoals?\b/.test(s)) return 'total';
  return 'other';
}

/** Clean up any synthetic names from the feed */
const cleanMarketName = (name?: string) => {
  if (!name) return '';
  const s = String(name).trim();
  if (/^cols-?\d+$/i.test(s)) return 'Match Market';
  if (/^total-2$/i.test(s)) return 'Total Goals';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
};

/** feed market names are already readable; translate the ones we know and keep the rest */
const marketLabel = (t: (key: string) => string, name?: string) => {
  if (!name) return '';
  const clean = cleanMarketName(name);
  const key = `markets.${clean}`;
  const translated = t(key);
  return translated === key ? clean : translated;
};

/** Don't display synthetic #1, #2 lines */
const formatLine = (line?: string) => (line && !/^#\d+$/.test(String(line).trim()) ? ` (${line})` : '');

/** Deduplicate outcomes within a single market so identical selections never appear twice, and filter phantom outcomes */
const dedupeOutcomes = (outcomes: any[] = [], marketName: string = '') => {
  const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s*:\s*/g, ':');
  const mName = norm(marketName);
  const is1X2 = /1x2|full time result|match result|winner/i.test(mName) && !/half|score|rezultat|both|corner|card|handicap|chance/i.test(mName);
  const isBTTS = /both teams? to score|both score/i.test(mName) && !/half|halves|result/i.test(mName);

  const seen = new Set<string>();
  const res: any[] = [];
  for (const o of outcomes) {
    const k = norm(o.name || o.key || '');
    if (is1X2 && !['1', 'x', '2', 'home', 'draw', 'away'].includes(k)) continue;
    if (isBTTS && !['yes', 'no', 'gg', 'ng'].includes(k)) continue;
    if (!seen.has(k)) {
      seen.add(k);
      res.push(o);
    }
  }
  return res;
};

/** A total market (goals / corners / cards) whose line the current count has already
 *  passed is dead: that outcome can no longer change, so its button must not invite a
 *  bet that gets rejected. Over 0.5 at 1-0, Over 9.5 corners at 10-2, Under 3.5 cards
 *  at 4-0, etc. */
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
  return m ? Number(m[1]) : null;
};

const isOverOutcome = (o: any) =>
  /^(over|o)$/i.test(String(o.name ?? '').trim()) || String(o.key ?? '').toLowerCase() === 'over';
const isUnderOutcome = (o: any) =>
  /^(under|u)$/i.test(String(o.name ?? '').trim()) || String(o.key ?? '').toLowerCase() === 'under';

/** Which live counter a total market tracks: goals, corners, or cards */
const counterFor = (market: any, match: any) => {
  const n = String(market?.name ?? '').toLowerCase();
  if (/corner/.test(n)) return (match.corners?.home ?? 0) + (match.corners?.away ?? 0);
  if (/card|booking|yellow|red/.test(n)) return (match.cards?.home ?? 0) + (match.cards?.away ?? 0);
  return (match.homeScore ?? 0) + (match.awayScore ?? 0);
};

/**
 * Drop outcomes the current count has already decided. Over dies once count > line,
 * under dies once count < line; at exactly an integer line it is a push and both stay.
 * Handicaps, correct scores, BTTS and 1X2 are not decided this way - they are left
 * alone (the book suspends them itself when the moment is right).
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

export default function MarketPanel({ match }: { match: Match }) {
  const { t } = useLanguage();

  const grouped = useMemo(() => {
    const groups = new Map<Column, Market[]>();
    for (const market of match.markets ?? []) {
      if (!market.outcomes?.length) continue;
      const column = columnOf(market);
      const list = groups.get(column) ?? [];
      list.push(market);
      groups.set(column, list);
    }
    for (const list of groups.values()) {
      list.sort(
        (a, b) =>
          Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
          String(a.name).localeCompare(String(b.name)) ||
          String(a.line ?? '').localeCompare(String(b.line ?? '')),
      );
    }
    return groups;
  }, [match]);

  const totalMarkets = match.markets?.length ?? 0;

  if (!grouped.size) {
    return (
      <div className="border-t border-tertiary/60 px-4 py-3 text-xs text-text-secondary">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="border-t border-tertiary/70 bg-primary/50 px-3.5 sm:px-5 py-4 space-y-4">
      {/* Live match stats strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary bg-secondary/80 p-2.5 rounded-xl border border-tertiary/60">
        {match.status === 'LIVE' && (
          <span className="font-bold text-accent-red flex items-center gap-1.5 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-ping"></span>
            {match.currentMinute || 0}:{String((match as any).currentSecond ?? 0).padStart(2, '0')}'{match.period ? ` · ${match.period}` : ''}
          </span>
        )}
        {match.corners && (
          <span className="bg-primary/60 px-2.5 py-0.5 rounded-md border border-tertiary/50">
            {t('markets.corners')}:{' '}
            <span className="font-bold text-white tabular-nums">
              {match.corners.home} - {match.corners.away}
            </span>
          </span>
        )}
        {match.cards && (
          <span className="bg-primary/60 px-2.5 py-0.5 rounded-md border border-tertiary/50">
            {t('markets.cards')}:{' '}
            <span className="font-bold text-white tabular-nums">
              {match.cards.home} - {match.cards.away}
            </span>
          </span>
        )}
        <span className="ml-auto text-[11px] font-bold text-text-secondary">
          {totalMarkets} {t('markets.market')}
        </span>
      </div>

      {COLUMN_ORDER.filter(column => grouped.has(column)).map(column => (
        <section key={column} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-1 h-3.5 rounded-full bg-accent-green"></span>
            <div className="text-xs font-black uppercase tracking-wider text-white">
              {t(COLUMN_TITLE[column])}
            </div>
          </div>
          <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
            {(grouped.get(column) ?? []).map(market => {
              const cleanOutcomes = dedupeOutcomes(market.outcomes ?? [], market.name);
              const liveOutcomes = filterDecidedOutcomes(cleanOutcomes, market, match);
              // every outcome already decided by the live count -> the card is dead, hide it
              // entirely so the client never clicks a bet that will be rejected
              if (!liveOutcomes.length) return null;
              const title = marketLabel(t, market.name) || t('markets.market');
              return (
                <div key={market.id} className="bg-secondary/90 rounded-xl border border-tertiary/80 overflow-hidden shadow-sm">
                  <div className="px-3 py-2 text-[11px] font-bold text-text-secondary bg-primary/40 border-b border-tertiary/50 flex items-center justify-between gap-2">
                    <span className="truncate text-slate-200" title={title}>
                      {title}
                      {formatLine(market.line)}
                    </span>
                    {market.status === 'SUSPENDED' && <span className="text-accent-red text-xs">🔒 Locked</span>}
                  </div>
                  <div className={`p-2.5 grid gap-1.5 ${liveOutcomes.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {liveOutcomes.map(outcome => (
                      <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
