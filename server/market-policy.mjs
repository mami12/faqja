/**
 * Presentation/offer rule: handicap wagers are not offered to new players.
 * Raw odds, settlement code, and existing tickets remain unchanged.
 * Avoid matching the standalone word "Asian": "Asian Total" may not
 * describe a handicap, while "Asian Corners" is a documented handicap.
 */
export function isHandicapOfferMarket(market = {}) {
  const name = String(market.name ?? market.market_name ?? '').trim().toLowerCase();
  const type = String(market.marketType ?? market.market_type ?? '').trim().toLowerCase();
  return type === 'handicap'
    || /\b(handicap|handicaps|fora|spread|spreads)\b/.test(name)
    || /^asian (?:corners?|cards?)\b/.test(name)
    || /^(?:corners?|cards?)\.\s*asian\b/.test(name);
}
