type Translate = (key: string) => string;

/* ------------------------------------------------------------------ */
/* Emra të shkurtër për outcomes                                       */
/* ------------------------------------------------------------------ */

/**
 * Map i emrave të shkurtër. Përdoret përpara se emri të kalojë në përkthim.
 * Shkurton "3 or more" → "3+", "1 (Vendas)" → "1", etj.
 */
const SHORT_OUTCOME_NAMES: Record<string, string> = {
  // 1X2 — vetëm 1, X, 2 pa kllapa dhe pa fjalë
  '1 (vendas)': '1',
  '1 (home)': '1',
  'x (barazim)': 'X',
  'x (draw)': 'X',
  '2 (udhetues)': '2',
  '2 (udhëtues)': '2',
  '2 (away)': '2',
  'vendas': '1',
  'barazim': 'X',
  'udhetues': '2',
  'udhëtues': '2',
  'home': '1',
  'draw': 'X',
  'away': '2',
  '1': '1',
  'x': 'X',
  '2': '2',
  '1x': '1X',
  '12': '12',
  'x2': 'X2',
  '1x (1x)': '1X',
  '12 (12)': '12',
  'x2 (x2)': 'X2',
  'home or draw': '1X',
  'home or away': '12',
  'draw or away': 'X2',
  
  // Golat — "X or more" → "X+"
  '1 or more': '1+',
  '2 or more': '2+',
  '3 or more': '3+',
  '4 or more': '4+',
  '5 or more': '5+',
  '6 or more': '6+',
  '7 or more': '7+',
  '8 or more': '8+',
  '9 or more': '9+',
  '10 or more': '10+',
  '11 or more': '11+',
  '12 or more': '12+',
  
  // Golat — "X or less" → "X-"
  '1 or less': '1-',
  '2 or less': '2-',
  '3 or less': '3-',
  '4 or less': '4-',
  '5 or less': '5-',
  
  // Golat — "X-Y" format
  'no goal': 'Pa Gol',
  'no goal 2': 'Pa Gol 2',
  'no goal 3': 'Pa Gol 3',
  
  // Tjera
  'none': 'Asnjë',
  'neither': 'Asnjë',
};

/**
 * Shkurton emrin e outcome-it:
 *  - "3 or more" → "3+"
 *  - "3 or less" → "3-"
 *  - "1 (Vendas)" → "1"
 *  - "X (Barazim)" → "X"
 */
export function shortOutcomeName(name?: string): string {
  if (!name) return '';
  const clean = String(name).trim();
  const lower = clean.toLowerCase();

  // 1. Kontrollo map-in e drejtpërdrejtë
  if (SHORT_OUTCOME_NAMES[lower]) return SHORT_OUTCOME_NAMES[lower];

  // 2. "X or more" → "X+"
  const orMore = clean.match(/^(\d+)\s+or\s+more$/i);
  if (orMore) return `${orMore[1]}+`;

  // 3. "X or less" → "X-"
  const orLess = clean.match(/^(\d+)\s+or\s+less$/i);
  if (orLess) return `${orLess[1]}-`;

  // 4. "X or fewer" → "X-"
  const orFewer = clean.match(/^(\d+)\s+or\s+fewer$/i);
  if (orFewer) return `${orFewer[1]}-`;

  // 5. Hiq kllapat: "1 (Vendas)" → "1", "X (Barazim)" → "X"
  const withoutParens = clean.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (withoutParens && withoutParens !== clean) {
    const lowerStripped = withoutParens.toLowerCase();
    if (SHORT_OUTCOME_NAMES[lowerStripped]) return SHORT_OUTCOME_NAMES[lowerStripped];
    // Extra parentheses may contain the betting minute/period; preserve them.
    return clean;
  }

  return clean;
}

/* ------------------------------------------------------------------ */
/* Ndihmës                                                            */
/* ------------------------------------------------------------------ */

const normalized = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();



/** Result + BTTS is a six-outcome correlated market, not ordinary GG/NG. */
export function isResultBttsMarket(name: string | undefined): boolean {
  const s = String(name ?? '').toLowerCase();
  const result = /\b(?:result|1\s*x\s*2|winner)\b/.test(s);
  const btts = /\bbtts\b|both\s+teams?\s+(?:to\s+)?score|both\s+score|\bgg\s*[/&-]\s*ng\b/.test(s);
  return result && btts && !/\b(?:corners?|cards?|handicap|double chance|half.?time|first half|second half)\b/.test(s);
}

export function parseResultBttsOutcome(
  value: string | undefined,
  homeTeam = '',
  awayTeam = '',
): { result: '1' | 'X' | '2'; bothScore: boolean } | null {
  let raw = String(value ?? '').trim();
  if (!raw) return null;
  // Some feeds write the complete condition instead of a compact "X/No".
  // "Both Teams Not to Score and Draw" means X + BTTS No, which is 0-0.
  raw = raw
    .replace(/^(both\s+teams?\s+(?:not\s+to\s+score|to\s+score))\s*(?:and\b|&|\+|\/)\s*/i,
      (_match, clause: string) => (/not/i.test(clause) ? 'No/' : 'Yes/'))
    .replace(/\s*(?:and\b|&|\+|\/)\s*(both\s+teams?\s+(?:not\s+to\s+score|to\s+score))$/i,
      (_match, clause: string) => '/' + (/not/i.test(clause) ? 'No' : 'Yes'));
  raw = raw.replace(/^\s*(?:match\s+)?result\s*[:=]?\s*/i, '')
    .replace(/\b(?:both\s+teams?\s+(?:to\s+)?score|both\s+score|btts)\b\s*[:=]?\s*/gi, '')
    .replace(/^\(|\)$/g, '').trim();
  const norm = (v: string) => v.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const parts = raw.split(/\s*(?:\/|\+|&|\||:|,|;|-|\band\b|\bwith\b)\s*/i)
    .map(norm).filter(Boolean);
  if (parts.length !== 2) return null;
  const readResult = (part: string): '1' | 'X' | '2' | null => {
    if (['1', 'home', 'home win', 'w1', 'vendas'].includes(part) || (!!homeTeam && part === norm(homeTeam))) return '1';
    if (['x', 'draw', 'tie', 'barazim'].includes(part)) return 'X';
    if (['2', 'away', 'away win', 'w2', 'udhetues'].includes(part) || (!!awayTeam && part === norm(awayTeam))) return '2';
    return null;
  };
  const readBtts = (part: string): boolean | null => {
    if (['yes', 'po', 'gg', 'both score'].includes(part)) return true;
    if (['no', 'jo', 'ng', 'no goal', 'both not score'].includes(part)) return false;
    return null;
  };
  const forwardResult = readResult(parts[0]);
  const forwardBtts = readBtts(parts[1]);
  if (forwardResult !== null && forwardBtts !== null) {
    return { result: forwardResult, bothScore: forwardBtts };
  }
  const reverseResult = readResult(parts[1]);
  const reverseBtts = readBtts(parts[0]);
  return reverseResult !== null && reverseBtts !== null
    ? { result: reverseResult, bothScore: reverseBtts }
    : null;
}

/**
 * Display the six valid Result + BTTS outcomes as whether each team scores
 * (home/away), followed by the full-time 1X2 result.
 * Examples: X + No => Jo/Jo&X (0-0), 1 + No => Po/Jo&1.
 * This is presentation only: the feed's original outcome ID/price is unchanged.
 */
export function formatResultBttsOutcome(
  outcomeName: string | undefined,
  matchName?: string,
  outcomeCode?: string,
): string | null {
  const teams = String(matchName ?? '').split(/\s+(?:vs\.?|v)\s+/i);
  const home = teams.length === 2 ? teams[0] : '';
  const away = teams.length === 2 ? teams[1] : '';
  const fromName = parseResultBttsOutcome(outcomeName, home, away);
  const fromCode = parseResultBttsOutcome(outcomeCode, home, away);
  // Contradictory provider labels must not silently become a different bet.
  if (fromName && fromCode &&
      (fromName.result !== fromCode.result || fromName.bothScore !== fromCode.bothScore)) return null;
  const combined = fromName ?? fromCode;
  if (!combined) return null;

  const homeScores = combined.bothScore || combined.result === '1';
  const awayScores = combined.bothScore || combined.result === '2';
  return (homeScores ? 'Po' : 'Jo') + '/' +
    (awayScores ? 'Po' : 'Jo') + '&' + combined.result;
}

/** Decode HT/FT only with the corresponding market context. Outcome IDs remain untouched. */
export function isHalfTimeFullTimeMarket(name: string | undefined): boolean {
  const value = normalized(name);
  return /^(?:ht ft|htft|half time full time|halftime fulltime|half time fulltime|half time match result|half time full time result|first half full time|1st half full time|first half fulltime|1st half fulltime|pjesa e pare ndeshja|pjesa e pare koha e rregullt)$/.test(value);
}

/**
 * The bookmaker may send "Arsenal / Draw", "Home/Draw", "HD" or "1/X".
 * Convert labels for display only, using the actual fixture to identify the teams.
 * Unknown values stay as-is so we never represent a different bet.
 */
export function parseHalfTimeFullTimeOutcome(
  value: string | undefined,
  matchName?: string,
  code?: string,
): string | null {
  const fixture = String(matchName ?? '').split(/\s+vs?\.?\s+/i);
  const homeTeam = fixture.length === 2 ? normalized(fixture[0]) : '';
  const awayTeam = fixture.length === 2 ? normalized(fixture[1]) : '';

  const canonical = (part: string): '1' | 'X' | '2' | null => {
    const s = normalized(part);
    if (['1', 'h', 'home', 'home team', 'vendas', 'w1'].includes(s)) return '1';
    if (['x', 'd', 'draw', 'tie', 'barazim', 'wx'].includes(s)) return 'X';
    if (['2', 'a', 'away', 'away team', 'vizitor', 'udhetues', 'w2'].includes(s)) return '2';
    if (homeTeam && s === homeTeam) return '1';
    if (awayTeam && s === awayTeam) return '2';
    return null;
  };

  const fromText = (text: string | undefined): string | null => {
    const raw = String(text ?? '').trim();
    const compact = raw.toUpperCase().replace(/\s+/g, '');
    if (/^[HDAX12]{2}$/.test(compact)) {
      const a = canonical(compact[0]);
      const b = canonical(compact[1]);
      return a && b ? a + '/' + b : null;
    }
    const parts = raw.split(/\s*(?:\/|\||→|–|—|\s+-\s+)\s*/);
    if (parts.length !== 2) return null;
    const a = canonical(parts[0]);
    const b = canonical(parts[1]);
    return a && b ? a + '/' + b : null;
  };

  const fromName = fromText(value);
  const fromCode = fromText(code);
  // A conflicting provider code must not silently replace a descriptive bet selection.
  if (fromName && fromCode && fromName !== fromCode) return null;
  return fromName ?? fromCode;
}

/** A market's numerical line is NOT necessarily a minute; require explicit time context. */
const hasMinuteContext = (name: string | undefined): boolean =>
  /\bminutes?\b|\bmins?\b|\bminut(?:a|e|ën|es|ës)?\b/i.test(String(name ?? ''));

export function formatMarketLine(marketName: string | undefined, marketLine: string | undefined): string {
  const value = String(marketLine ?? '').trim();
  if (!value || /^#\d+$/.test(value)) return '';
  if (!hasMinuteContext(marketName)) return value;
  const range = value.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
  if (range) return range[1] + "'–" + range[2] + "'";
  return /^\d{1,3}$/.test(value) ? value + "'" : value;
}

/** One canonical display title for match details, betslip and stored tickets. */
export function formatMarketSelectionLabel(
  marketName: string | undefined,
  marketLine: string | undefined,
  t: Translate,
): string {
  const label = translateMarketName(marketName, t);
  const rawLine = String(marketLine ?? '').trim();
  const formattedLine = formatMarketLine(marketName, rawLine);
  if (!formattedLine) return label;
  const shownNumbers = label.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (shownNumbers.includes(rawLine)) return label;
  return hasMinuteContext(marketName) ? label + ' ' + formattedLine : label + ' (' + formattedLine + ')';
}

/** Keep any unfamiliar qualifier verbatim rather than changing the bet's meaning. */
function translateScoringQualifier(qualifier: string): string {
  const value = qualifier.trim().replace(/^[\s:;,.–-]+/, '').trim();
  if (!value) return '';
  if (/^in\s+(?:the\s+)?(?:1st|first)\s+half$/i.test(value)) return 'në pjesën e parë';
  if (/^in\s+(?:the\s+)?(?:2nd|second)\s+half$/i.test(value)) return 'në pjesën e dytë';
  if (/^in\s+(?:the\s+)?(?:both|each)\s+halves$/i.test(value)) return 'në të dyja pjesët';
  const first = value.match(/^in\s+(?:the\s+)?first\s+(\d{1,3})\s+minutes?$/i);
  if (first) return 'në ' + first[1] + ' minutat e para';
  const inMinute = value.match(/^in\s+(?:the\s+)?(?:(\d{1,3})(?:st|nd|rd|th)?\s+)?minute(?:\s+(\d{1,3}))?$/i);
  if (inMinute) return 'në minutën' + (inMinute[1] || inMinute[2] ? ' ' + (inMinute[1] || inMinute[2]) : '');
  const inMinutes = value.match(/^in\s+minutes?\s+(\d{1,3})\s*[-–]\s*(\d{1,3})$/i);
  if (inMinutes) return 'nga minuta ' + inMinutes[1] + ' deri në ' + inMinutes[2];
  const between = value.match(/^between\s+minutes?\s+(\d{1,3})\s+(?:and|to)\s+(\d{1,3})$/i);
  if (between) return 'ndërmjet minutave ' + between[1] + ' dhe ' + between[2];
  const before = value.match(/^before\s+(?:the\s+)?(?:minute\s*)?(\d{1,3})(?:st|nd|rd|th)?(?:\s+minute)?$/i);
  if (before) return 'para minutës ' + before[1];
  if (/^before\s+(?:the\s+)?minute$/i.test(value)) return 'para minutës';
  const until = value.match(/^(?:until|by|up\s+to)\s+(?:the\s+)?(?:minute\s*)?(\d{1,3})(?:st|nd|rd|th)?(?:\s+minute)?$/i);
  if (until) return 'deri në minutën ' + until[1];
  if (/^(?:until|by|up\s+to)\s+(?:the\s+)?minute$/i.test(value)) return 'deri në minutën';
  const within = value.match(/^within\s+(?:the\s+)?(?:first\s+)?(\d{1,3})\s+minutes?$/i);
  if (within) return 'brenda ' + within[1] + ' minutave';
  return value;
}

function translateQualifiedScoringMarket(raw: string, t: Translate): string | null {
  const btts = raw.match(/^(both\s+teams?\s+(?:to\s+)?score|both\s+score|btts)\b(.*)$/i);
  if (btts) {
    const extra = translateScoringQualifier(btts[2]);
    return t('markets.both_teams_score') + (extra ? ' ' + extra : '');
  }
  const goal = raw.match(/^(?:(?:a|the)\s+)?(next\s+goal|goals?)\s+(in|during|before|until|by|up\s+to|within|between)\b(.*)$/i);
  if (goal) {
    const subject = goal[1].toLowerCase().startsWith('next') ? 'Goli i radhës' : 'Gol';
    return subject + ' ' + translateScoringQualifier(goal[2] + goal[3]);
  }
  const team = raw.match(/^(.+?)\s+(not\s+to\s+score|to\s+score|will\s+score|scores?)(?:\s+(?:a\s+)?goal)?(?:\s+(in|before|until|by|up\s+to|within|between)\b(.*))?$/i);
  if (team && !/^(?:both\s+teams?|home\s+team|away\s+team)$/i.test(team[1].trim())) {
    const extra = team[3] ? translateScoringQualifier(team[3] + (team[4] ?? '')) : '';
    return team[1].trim() + (/^not/i.test(team[2]) ? ' nuk shënon gol' : ' shënon gol') + (extra ? ' ' + extra : '');
  }
  return null;
}

function translateExactGoalsLabel(value: string) {
  const exactGoals = value.match(
    /^(.*?)\bexact\s+(?:number|amount)\s+of\s+(?:the\s+)?(?:goals?|golat)\s+(?:scored|made)(?:\s+by\s+(.*))?$/i,
  );
  if (!exactGoals) return null;
  const team = (exactGoals[1] || exactGoals[2] || '').replace(/[\s:,-]+$/, '').trim();
  return team
    ? `Numri i saktë i golave të shënuar nga ${team}`
    : 'Numri i saktë i golave të shënuar';
}

/* ------------------------------------------------------------------ */
/* Përkthimi i market-eve                                             */
/* ------------------------------------------------------------------ */

export function translateMarketName(name: string | undefined, t: Translate) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  if (isResultBttsMarket(raw)) return 'Rezultati dhe Të Dyja Ekipet Shënojnë';
  const exactKey = `markets.${raw}`;
  const exactTranslation = t(exactKey);
  if (exactTranslation !== exactKey) return exactTranslation;
  const exactGoalsLabel = translateExactGoalsLabel(raw);
  if (exactGoalsLabel) return exactGoalsLabel;
  const scoringLabel = translateQualifiedScoringMarket(raw, t);
  if (scoringLabel) return scoringLabel;
  const value = normalized(raw);

  const line = raw.match(/\d+(?:[.,]\d+)?/)?.[0];
  const withLine = (label: string) => line ? `${label} ${line}` : label;
  const groupedMarket = value.match(/^(?:(yellow|red) )?(corners?|cards?|goals?) (result|total|double chance|over under)$/);
  if (groupedMarket) {
    const [, color, kind, subtype] = groupedMarket;
    const subject = color === 'yellow' ? 'kartonëve të verdhë'
      : color === 'red' ? 'kartonëve të kuq'
      : kind.startsWith('corner') ? 'këndeve'
      : kind.startsWith('card') ? 'kartonëve'
      : 'golave';
    const object = kind.startsWith('corner') ? 'këndet'
      : kind.startsWith('card') ? color === 'yellow' ? 'kartonët e verdhë' : color === 'red' ? 'kartonët e kuq' : 'kartonët'
      : 'golat';
    if (subtype === 'result') return `Rezultati i ${subject}`;
    if (subtype === 'total') return withLine(`Totali i ${subject}`);
    if (subtype === 'double chance') return `Shans i dyfishtë për ${object}`;
    return withLine(`Lart / Poshtë ${subject}`);
  }

  if (/^(match winner|full time result|fulltime result|match result|1x2)( |$)/.test(value)) return t('markets.match_result');
  if (/^(both teams to score|both teams score|both score|btts|gg ng|gg\/ng)$/.test(value)) return t('markets.both_teams_score');
  if (/^(?:anytime|first|last) goalscorers?$/.test(value) || /^(?:first|last) goal scorer$/.test(value)) return 'Shënuesi i golit';
  if (/^(?:home|away) team to win$/.test(value)) return value.startsWith('home') ? 'Fiton ekipi vendas' : 'Fiton ekipi udhëtues';
  if (/^(double chance|1st half double chance)/.test(value)) return t('markets.double_chance');
  if (/^(over under|under over|total goals over under|total over under|goals over under)/.test(value)) return withLine(t('markets.over_under'));
  if (/^(over|under|lart|poshte) \d/.test(value)) {
    return `${/^(over|lart)/.test(value) ? t('outcomes.over') : t('outcomes.under')} ${line}`;
  }
  if (/^(total goals|total goal|goals total|goal total|goals?)( |$)/.test(value)) return withLine(t('markets.totals'));
  if (/^(total corners|corners total|corner total|corners?)( |$)/.test(value)) return withLine(t('markets.corners'));
  if (/^(total cards|cards total|card total|yellow cards|red cards|cards?)( |$)/.test(value)) {
    const cardType = value.startsWith('yellow') ? 'Të verdha' : value.startsWith('red') ? 'Të kuqe' : t('markets.cards');
    return withLine(cardType);
  }
  if (/^(correct score)( |$)/.test(value)) return t('markets.correct_score');
  if (/^(odd even|odd even goals)( |$)/.test(value)) return t('markets.odd_even');
  if (/^(next goal|last goal|first goal)( |$)/.test(value)) {
    return line ? `${t('markets.next_goal')} ${line}'` : t('markets.next_goal');
  }
  if (/^(halftime fulltime|half time full time|half time fulltime)/.test(value)) return t('markets.halftime_fulltime');
  if (/^(1st half result|first half result)/.test(value)) return t('markets.first_half_result');
  if (/^(2nd half result|second half result)/.test(value)) return t('markets.second_half_result');
  if (/^(handicap|asian handicap|fora)( |$)/.test(value)) return t('markets.handicap');
  if (/^cols? ?-?\d+$/.test(value)) return t('markets.match_result');

  const phrases: Array<[RegExp, string]> = [
    [/\b(?:1st|first)\s+half\b/gi, 'Pjesa e parë'],
    [/\b(?:2nd|second)\s+half\b/gi, 'Pjesa e dytë'],
    [/\bhalf[\s/-]*time\b/gi, 'Pjesa e parë'],
    [/\bfull[\s/-]*time\b/gi, 'Koha e rregullt'],
    [/\bmatch\s+winner\b/gi, t('markets.match_result')],
    [/\b(?:match\s+)?result\b/gi, 'Rezultati'],
    [/\bwinner\b/gi, 'Fituesi'],
    [/\bcorrect\s+score\b/gi, t('markets.correct_score')],
    [/\bdouble\s+chance\b/gi, t('markets.double_chance')],
    [/\bdraw\s+no\s+bet\b/gi, t('outcomes.draw_no_bet')],
    [/\bboth\s+teams?\s+(?:to\s+)?score\b/gi, t('markets.both_teams_score')],
    [/\bgoal\s+in\s+minute\s*(\d+)\b/gi, 'Shënon gol në minutën $1'],
    [/\bgoal\s+in\s+(\d+)(?:th|st|nd|rd)?\s+minute\b/gi, 'Shënon gol në minutën $1'],
    [/\bgoal\s+before\s+(\d+)(?::00)?(?:'|\s*min)?\b/gi, 'Gol para minutës $1'],
    [/\bnext\s+goal\s+in\s+minute\s*(\d+)\b/gi, 'Goli i radhës në minutën $1'],
    [/\bgoal\s+in\s+minutes\b/gi, 'Shënon gol në minutat'],
    [/\bgoal\s+in\s+minute\b/gi, 'Shënon gol në minutën'],
    [/\bminute\b/gi, 'minutën'],
    [/\bminutes\b/gi, 'minutat'],
    [/\b(?:anytime|first|last)\s+goal\s+scorers?\b/gi, 'Shënuesi i golit'],
    [/\b(?:anytime|first|last)\s+goalscorers?\b/gi, 'Shënuesi i golit'],
    [/\bhome\s+team\s+to\s+win\b/gi, 'Fiton ekipi vendas'],
    [/\baway\s+team\s+to\s+win\b/gi, 'Fiton ekipi udhëtues'],
    [/\bhome\s+team\s+(?:total\s+)?goals?\b/gi, 'Golat e ekipit vendas'],
    [/\baway\s+team\s+(?:total\s+)?goals?\b/gi, 'Golat e ekipit udhëtues'],
    [/\bhome\s+team\s+(?:over\s*\/?\s*under|total)\b/gi, 'Golat e ekipit vendas: Lart / Poshtë'],
    [/\baway\s+team\s+(?:over\s*\/?\s*under|total)\b/gi, 'Golat e ekipit udhëtues: Lart / Poshtë'],
    [/\basian\s+corners?\b/gi, 'Këndet aziatike'],
    [/\basian\s+handicap\b/gi, 'Handikap aziatik'],
    [/\bcorners?\s+handicap\b/gi, 'Handikap i këndeve'],
    [/\bcards?\s+handicap\b/gi, 'Handikap i kartonëve'],
    [/\bplayers?\s+to\s+score\b/gi, 'Lojtari që shënon'],
    [/\bteams?\s+to\s+score\b/gi, 'Ekipi që shënon'],
    [/\bboth\s+halves\b/gi, 'Të dyja pjesët'],
    [/\btotal\s+goals?\b|\bgoals?\s+total\b/gi, t('markets.totals')],
    [/\btotal\s+corners?\b|\bcorners?\s+total\b/gi, t('markets.corners')],
    [/\btotal\s+cards?\b|\bcards?\s+total\b/gi, t('markets.cards')],
    [/\byellow\s+cards?\b/gi, 'Kartonat e verdhë'],
    [/\bred\s+cards?\b/gi, 'Kartonat e kuq'],
    [/\bcorners?\b/gi, 'Këndet'],
    [/\bcards?\b/gi, 'Kartonat'],
    [/\bgoals?\b/gi, 'Golat'],
    [/\bgoal\b/gi, 'Goli'],
    [/\bover\s*\/\s*under\b|\bover\s+under\b|\bunder\s+over\b/gi, t('markets.over_under')],
    [/\bover\b/gi, t('outcomes.over')],
    [/\bunder\b/gi, t('outcomes.under')],
    [/\bodd\s*\/\s*even\b|\bodd\s+even\b/gi, t('markets.odd_even')],
    [/\bodd\b/gi, t('outcomes.odd')],
    [/\beven\b/gi, t('outcomes.even')],
    [/\bhome\s+team\b/gi, 'Ekipi vendas'],
    [/\baway\s+team\b/gi, 'Ekipi udhëtues'],
    [/\bhome\b/gi, 'Vendas'],
    [/\baway\b/gi, 'Udhëtues'],
    [/\bteam\b/gi, 'Ekipi'],
    [/\basian\b/gi, 'Aziatik'],
    [/\bhandicap\b/gi, 'Handikap'],
    [/\bfirst\b/gi, 'I pari'],
    [/\blast\b/gi, 'I fundit'],
    [/\bnext\b/gi, 'i radhës'],
    [/\bscore\b/gi, 'Shënimi'],
    [/\bwinning\b/gi, 'Fitues'],
    [/\bmargin\b/gi, 'Diferenca'],
    [/\bclean\s+sheet\b/gi, 'Pa pësuar gol'],
    [/\bto\s+nil\b/gi, 'pa pësuar gol'],
    [/\bpenalty\b/gi, 'Penallti'],
    [/\bpenalties\b/gi, 'Penalltitë'],
    [/\bpoints?\b/gi, 'Pikë'],
    [/\bplayers?\b/gi, 'Lojtari'],
    [/\bscorers?\b/gi, 'Shënuesit'],
    [/\bwin\b/gi, 'Fitore'],
    [/\bmatch\b/gi, 'Ndeshja'],
    [/\bto\b/gi, 'për të'],
  ];

  let result = phrases.reduce((label, [pattern, replacement]) => label.replace(pattern, replacement), raw)
    .replace(/\s+/g, ' ')
    .trim();

  if (line && /(?:minut[eë]n?|minute)\s*$/i.test(result)) {
    result += ` ${line}`;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Përkthimi i outcomes                                               */
/* ------------------------------------------------------------------ */

export function translateOutcomeName(name: string | undefined, t: Translate, marketName?: string, matchName?: string, outcomeCode?: string) {
  const raw = String(name ?? '').trim();
  if (!raw && !outcomeCode) return '';
  if (isHalfTimeFullTimeMarket(marketName)) {
    return parseHalfTimeFullTimeOutcome(raw, matchName, outcomeCode) ?? raw;
  }
  if (isResultBttsMarket(marketName)) {
    // Explicit home/away Po/Jo + 1X2 result. Never infer an unknown selection.
    return formatResultBttsOutcome(raw, matchName, outcomeCode) ?? raw;
  }
  if (!raw) return '';

  const qualifiedScoring = translateQualifiedScoringMarket(raw, t);
  if (qualifiedScoring) return qualifiedScoring;

  // 0. SHKURTO emrin para përkthimit
  const short = shortOutcomeName(raw);
  const shortLower = short.toLowerCase();

  // Nëse shkurtimi e ktheu në diçka si "1", "X", "2", "1X", "12", "X2", "3+", ktheje direkt
  if (/^(1|x|2)$/i.test(short)) return short.toUpperCase();
  if (/^(1x|12|x2)$/i.test(short)) return short.toUpperCase();
  if (/^\d+\+$/.test(short)) return short; // "3+" → "3+"
  if (/^\d+-$/.test(short)) return short; // "3-" → "3-"

  // 1. Kontrollo për exact goals
  const exactGoalsLabel = translateExactGoalsLabel(raw);
  if (exactGoalsLabel) return exactGoalsLabel;
  const value = normalized(raw);

  if (/^(1|home|home team|home win|homewin|1 home|w1|h|vendas)$/i.test(value)) return '1';
  if (/^(x|draw|tie|x draw|barazim|wx|d)$/i.test(value)) return 'X';
  if (/^(2|away|away team|away win|awaywin|2 away|w2|a|udhetues)$/i.test(value)) return '2';
  if (/^(1x|home or draw|home draw)$/i.test(value)) return '1X';
  if (/^(12|home or away|home away)$/i.test(value)) return '12';
  if (/^(x2|draw or away|draw away)$/i.test(value)) return 'X2';
  if (/^(over|o|lart|mbi)$/.test(value)) return t('outcomes.over');
  if (/^(under|u|poshte|nen)$/.test(value)) return t('outcomes.under');
  if (/^(yes|gg|g|goal|both teams to score|gg ng|g ng)$/.test(value)) {
    return /both teams|btts|gg|ng/i.test(marketName ?? '') ? t('outcomes.btts_yes') : t('outcomes.yes');
  }
  if (/^(no|ng|n g|no goal|no both teams to score|jo gol|nuk shenojne)$/.test(value)) {
    return /both teams|btts|gg|ng/i.test(marketName ?? '') ? t('outcomes.btts_no') : t('outcomes.no');
  }
  if (/^(odd|tek|odd number)$/.test(value)) return t('outcomes.odd');
  if (/^(even|cift|even number)$/.test(value)) return t('outcomes.even');
  if (/^draw no bet$/.test(value)) return t('outcomes.draw_no_bet');

  const line = raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  if (/^(over|lart|mbi)\s+\d+(?:[.,]\d+)?$/i.test(raw)) return `${t('outcomes.over')} ${line}`;
  if (/^(under|poshte|nën|nen)\s+\d+(?:[.,]\d+)?$/i.test(raw)) return `${t('outcomes.under')} ${line}`;
  if (/both teams? to score|both score|btts|gg\s*\/?\s*ng/i.test(raw)) return t('markets.both_teams_score');
  if (/^(?:no\s*goal|jo[\s-]*gol|nuk\s*sh[eë]nojne)$/i.test(raw)) return t('outcomes.no_goal');
  if (/^(?:a\s+)?goal$/i.test(raw)) return t('outcomes.goal');

  // 2. Nëse shkurtimi ndryshoi diçka, kthe shkurtimin
  if (short !== raw) return short;

  return raw;
}

export function formatTicketSelection(
  outcomeName: string | undefined,
  marketName: string | undefined,
  matchName: string | undefined,
  t: Translate,
  outcomeCode?: string,
) {
  const rawOutcome = String(outcomeName ?? '').trim();
  if (isHalfTimeFullTimeMarket(marketName)) return translateOutcomeName(rawOutcome, t, marketName, matchName);
  if (isResultBttsMarket(marketName)) return translateOutcomeName(rawOutcome, t, marketName, matchName, outcomeCode);
  const market = normalized(marketName);
  const resultMarket = /(?:^| )(?:1x2|moneyline|match winner|winner|full time result|fulltime result|match result|1st half result|first half result|2nd half result|second half result)(?: |$)/.test(market);
  if (!resultMarket) return translateOutcomeName(rawOutcome, t, marketName);

  const outcome = normalized(rawOutcome);
  const teams = String(matchName ?? '').split(/\s+(?:vs\.?|v)\s+/i).map(normalized);
  const [home, away] = teams;
  if (/^(?:x|draw|tie|barazim)$/.test(outcome)) return 'X';
  if (/^(?:1|home|home team|home win|homewin|w1|vendas)$/.test(outcome) || (home && outcome === home)) return '1';
  if (/^(?:2|away|away team|away win|awaywin|w2|udhetues)$/.test(outcome) || (away && outcome === away)) return '2';
  return translateOutcomeName(rawOutcome, t, marketName);
}

export function translateTicketType(type: string | undefined, t: Translate) {
  if (type === 'SINGLE') return t('betslip.single');
  if (type === 'COMBO') return t('betslip.combo');
  if (type === 'SYSTEM') return t('betslip.system');
  return type ?? '';
}

export function translateTicketStatus(status: string | undefined, t: Translate) {
  if (!status) return '';
  const key = `tickets.${status.toLowerCase()}`;
  const translated = t(key);
  return translated === key ? status : translated;
}
