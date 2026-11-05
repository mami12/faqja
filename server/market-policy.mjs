import {marketDiagnosticAll} from './market-diagnostic.mjs';
/**
 * Presentation/offer rule: handicap wagers are not offered to new players.
 * Raw odds, settlement code, and existing tickets remain unchanged.
 * Avoid matching the standalone word "Asian": "Asian Total" may not
 * describe a handicap, while "Asian Corners" is a documented handicap.
 */
export function isHandicapOfferMarket(market = {}) {
  if (marketDiagnosticAll()) return false;
  const name = String(market.name ?? market.market_name ?? '').trim().toLowerCase();
  const type = String(market.marketType ?? market.market_type ?? '').trim().toLowerCase();
  return type === 'handicap'
    || /\b(?:asian|aziatik\w*)\b/.test(name)
    || /\b(handicap|handicaps|fora|spread|spreads)\b/.test(name)
    || /^asian (?:corners?|cards?)\b/.test(name)
    || /^(?:corners?|cards?)\.\s*asian\b/.test(name);
}

/** Exclude early-payout promotions from new offers, including stale clients. */
export function isEarlyPayoutOfferMarket(market = {}) {
 if (marketDiagnosticAll()) return false;
 const name=String(market.name??market.market_name??market.marketName??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const key=String(market.market_key??market.marketKey??market.extId??market.key??'');
 return /early\s*(?:payout|pay\s*out)|pagese\s+(?:e\s+)?parakohshme|\b(?:\d+\s*up|xup)\b|\{p\d\}\s*up\b/i.test(name)||/^zz27072@/.test(key);
}
export const isExcludedOfferMarket=market=>isHandicapOfferMarket(market)||isEarlyPayoutOfferMarket(market);


