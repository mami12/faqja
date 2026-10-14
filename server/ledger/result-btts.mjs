/**
 * "Result and Both Teams to Score" is one correlated selection, NOT a plain
 * BTTS or 1X2 bet. Never guess from an unrecognised provider outcome.
 */
export function isResultBttsMarket(name = '') {
  const s = String(name).toLowerCase();
  const result = /\b(?:result|1\s*x\s*2|winner)\b/.test(s);
  const btts = /\bbtts\b|both\s+teams?\s+(?:to\s+)?score|both\s+score|\bgg\s*[/&-]\s*ng\b/.test(s);
  return result && btts && !/\b(?:corners?|cards?|handicap|double chance|half.?time|first half|second half)\b/.test(s);
}

const fold = (value) => String(value ?? '')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** "1/No", "Home & Yes", "X + GG", "No/Draw", etc. */
export function parseResultBttsOutcome(value, homeTeam = '', awayTeam = '') {
  let text = String(value ?? '').trim();
  if (!text) return null;
  text = text.replace(/^\s*(?:match\s+)?result\s*[:=]?\s*/i, '')
    .replace(/\b(?:both\s+teams?\s+(?:to\s+)?score|both\s+score|btts)\b\s*[:=]?\s*/gi, '')
    .replace(/^\(|\)$/g, '').trim();

  const parts = text.split(/\s*(?:\/|\+|&|\||:|,|;|-|\band\b|\bwith\b)\s*/i)
    .map(fold).filter(Boolean);
  if (parts.length !== 2) return null;

  const resultPart = (part) => {
    if (['1', 'home', 'home win', 'w1', 'vendas'].includes(part) || (fold(homeTeam) && part === fold(homeTeam))) return '1';
    if (['x', 'draw', 'tie', 'barazim'].includes(part)) return 'X';
    if (['2', 'away', 'away win', 'w2', 'udhetues'].includes(part) || (fold(awayTeam) && part === fold(awayTeam))) return '2';
    return null;
  };
  const bttsPart = (part) => {
    if (['yes', 'po', 'gg', 'both score'].includes(part)) return true;
    if (['no', 'jo', 'ng', 'no goal', 'both not score'].includes(part)) return false;
    return null;
  };

  const forwardResult = resultPart(parts[0]);
  const forwardBtts = bttsPart(parts[1]);
  if (forwardResult !== null && forwardBtts !== null) return { result: forwardResult, bothScore: forwardBtts };
  const reverseResult = resultPart(parts[1]);
  const reverseBtts = bttsPart(parts[0]);
  return reverseResult !== null && reverseBtts !== null
    ? { result: reverseResult, bothScore: reverseBtts }
    : null;
}
