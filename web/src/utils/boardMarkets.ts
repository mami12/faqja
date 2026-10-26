/** Board presentation only. Original market/outcome IDs and quotes stay intact. */
type Outcome = { name?: string; code?: string; key?: string };
type Market = { id?: string; name?: string; marketType?: string; period?: string | number; line?: unknown; specifier?: unknown; status?: string; outcomes?: Outcome[] };
const nameOf = (market: Market) => String(market.name ?? '').toLowerCase().trim();
const typeOf = (market: Market) => String(market.marketType ?? '').toUpperCase().trim();
const closed = (market: Market) => /^(?:CLOSED|SETTLED|VOID|REMOVED|DELETED|CANCELLED|CANCELED|FINISHED|ENDED|INACTIVE)$/.test(String(market.status ?? '').trim().toUpperCase());
const fullTime = (market: Market) => {
  if (!(market.period == null || market.period === '' || Number(market.period) === 0)) return false;
  // "90 minutes" explicitly means regulation full time, unlike a 10-minute,
  // first-goal, half, extra-time or statistical market sharing the same type.
  const name = nameOf(market).replace(/\b90\s*min(?:ute)?s?\b/g, '');
  return !/\b(?:half|halves|1h|2h|quarters?|periods?|extra[ -]?time|overtime|next|remaining|first|last|min(?:ute)?s?|corners?|cards?|bookings?|points?|handicap|asian|penalty|penalties|shootout)\b|pjesa|pjesë/i.test(name) &&
    !/CORNER|CARD|BOOKING|POINT|HANDICAP|ASIAN|HALF|PERIOD|TEAM_TOTAL/.test(typeOf(market));
};
const standalone = (market: Market) => !/\+|&|\b(?:and|combo|combination|builder)\b/.test(nameOf(market));
const aggregateResult = (market: Market) => !/\b(?:home|away|team\s*[12]|[12](?:st|nd)\s+team)\b/.test(nameOf(market));
// The compact provider projection can classify every result-column offer as
// 1X2. An explicit DC/BTTS/total family name is stronger evidence of its contract.
const differentNamedFamily = (market: Market) => /double chance|dopjo shans|both teams? (?:to )?score|both score|\bbtts\b|gg\/?ng|total|over\/?under|under\/?over|goal line/.test(nameOf(market));
const result = (market: Market) => fullTime(market) && standalone(market) &&
  aggregateResult(market) && !differentNamedFamily(market) &&
  (typeOf(market) === '1X2' || /^(?:1x2|match result|full[ -]time result|match winner|winner|moneyline)(?:\s*\(1x2\))?$/.test(nameOf(market)));
const doubleChance = (market: Market) => fullTime(market) && standalone(market) &&
  aggregateResult(market) &&
  (['DOUBLE_CHANCE', 'DC'].includes(typeOf(market)) || /^(?:double chance|dopjo shans)$/.test(nameOf(market)));
const bothScore = (market: Market) => fullTime(market) && standalone(market) &&
  (typeOf(market) === 'BTTS' || /^(?:both teams? to score|both teams? score|both score|btts|gg\/?ng)$/.test(nameOf(market)));

export function getBoardTotalLine(market: Market | null | undefined): number | null {
  if (!market) return null;
  for (const value of [market.line, market.specifier]) {
    if (value == null || String(value).trim() === '') continue;
    const text = String(value).trim().replace(',', '.');
    const match = text.match(/^(?:total|goals?|line)\s*[=:]\s*(\d+(?:\.\d+)?)$/i);
    const numeric = Number(match ? match[1] : text);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  const embedded = nameOf(market).match(/(?:^|\s|\()(\d+(?:[.,]\d+)?)\)?$/);
  if (embedded) return Number(embedded[1].replace(',', '.'));
  const lines = (market.outcomes ?? []).map(outcome => String(outcome.name ?? '').match(/^(?:over|under|o|u)\s*\(?\s*(\d+(?:[.,]\d+)?)\)?$/i))
    .filter((match): match is RegExpMatchArray => match !== null).map(match => Number(match[1].replace(',', '.')));
  return lines.length && lines.every(line => line === lines[0]) ? lines[0] : null;
}

/** A semantic provider label wins over its numeric code. Never label a named
 * "Under" as "Over" merely because that provider happens to use code 1 for it.
 * Code fallback is limited to unnamed or numeric-labelled provider outcomes.
 */
export function findBoardOutcome<T extends Outcome>(market: { outcomes?: T[] } | null | undefined, aliases: string[]): T | null {
  const normalized = aliases.map(alias => String(alias).trim().toLowerCase()).filter(Boolean);
  const matches = (label: string) => normalized.includes(label) || normalized.some(alias => !/^\d+(?:[.,]\d+)?$/.test(alias) &&
    (label.startsWith(alias + ' ') || label.startsWith(alias + ' (')));
  const outcomes = market?.outcomes ?? [];
  const named = outcomes.find(outcome => matches(String(outcome.name ?? '').trim().toLowerCase()));
  if (named) return named;
  return outcomes.find(outcome => {
    const name = String(outcome.name ?? '').trim();
    return (!name || /^\d+(?:[.,]\d+)?$/.test(name)) && matches(String(outcome.code ?? outcome.key ?? '').trim().toLowerCase());
  }) ?? null;
}

export function selectBoardMarkets<T extends Market>(
  markets: T[], visible: (market: T) => boolean, suspended: (market: T) => boolean,
  teams: { homeTeam?: string; awayTeam?: string } = {},
): { primary: T | null; primaryType: '1X2' | 'DC' | 'BTTS'; total: T | null; totalLine: number | null } {
  // Presence is checked BEFORE visibility: a suspended 1X2 must not silently
  // turn into a different contract. Likewise DC suspension does not select BTTS.
  const main = markets.find(result) ?? null;
  const usable = (market: T) => !closed(market) && (visible(market) || suspended(market));
  const dc = main ? null : markets.find(market => doubleChance(market) && usable(market)) ?? null;
  const btts = main || dc ? null : markets.find(market => bothScore(market) && usable(market)) ?? null;
  // A closed primary still counts as present, so it does not trigger a different
  // bet contract. Its stale prices must not be made clickable either.
  const primary = main ? (closed(main) ? null : main) : dc ?? btts;
  const primaryType = main ? '1X2' : dc ? 'DC' : btts ? 'BTTS' : '1X2';
  const teamNames = [teams.homeTeam, teams.awayTeam].filter(Boolean).map(name => String(name).toLowerCase().trim());
  const namesTeam = (name: string, team: string) => team.length >= 3 ? name.includes(team) :
    new RegExp('(?:^|\\W)' + team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|\\W)').test(name);
  const totals = markets.filter(market => {
    const name = nameOf(market);
    if (!fullTime(market) || !standalone(market) || closed(market) || /\b(?:team|home|away|both|exact|correct|odd|even)\b/.test(name)) return false;
    if (teamNames.some(team => namesTeam(name, team))) return false;
    return (['OVER_UNDER', 'TOTAL', 'TOTALS', 'TOTAL_GOALS'].includes(typeOf(market)) || /^(?:total goals|total|goals over\/?under|over\/?under|under\/?over|goal line)(?:\s|\(|$)/.test(name)) &&
      // The suspended predicate must already exclude expired/decided contracts.
      getBoardTotalLine(market) !== null && usable(market);
  });
  totals.sort((a, b) => Math.abs(getBoardTotalLine(a)! - 2.5) - Math.abs(getBoardTotalLine(b)! - 2.5) || getBoardTotalLine(b)! - getBoardTotalLine(a)!);
  const total = totals[0] ?? null;
  return { primary, primaryType, total, totalLine: getBoardTotalLine(total) };
}
