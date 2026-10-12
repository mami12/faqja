type Translate = (key: string) => string;

const normalized = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function translateMarketName(name: string | undefined, t: Translate) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  const exactKey = `markets.${raw}`;
  const exactTranslation = t(exactKey);
  if (exactTranslation !== exactKey) return exactTranslation;
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
  if (/^(both teams to score|both teams score|both score|btts|gg ng|gg\/ng)/.test(value)) return t('markets.both_teams_score');
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
  if (/^(next goal|last goal|first goal)( |$)/.test(value)) return t('markets.next_goal');
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

  return phrases.reduce((label, [pattern, replacement]) => label.replace(pattern, replacement), raw)
    .replace(/\s+/g, ' ')
    .trim();
}

export function translateOutcomeName(name: string | undefined, t: Translate, marketName?: string) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  const value = normalized(raw);

  if (/^(1|home|home team|home win|homewin|1 home|w1|h|vendas)$/.test(value)) return t('outcomes.home');
  if (/^(x|draw|tie|x draw|barazim|wx|d)$/.test(value)) return t('outcomes.draw');
  if (/^(2|away|away team|away win|awaywin|2 away|w2|a|udhetues)$/.test(value)) return t('outcomes.away');
  if (/^(1x|home or draw|home draw)$/.test(value)) return t('outcomes.home_or_draw');
  if (/^(12|home or away|home away)$/.test(value)) return t('outcomes.home_or_away');
  if (/^(x2|draw or away|draw away)$/.test(value)) return t('outcomes.draw_or_away');
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
  if (line && /\b(over|lart|mbi)\b/i.test(raw)) return `${t('outcomes.over')} ${line}`;
  if (line && /\b(under|poshte|nën|nen)\b/i.test(raw)) return `${t('outcomes.under')} ${line}`;
  if (/both teams? to score|both score|btts|gg\s*\/?\s*ng/i.test(raw)) return t('markets.both_teams_score');
  if (/no\s*goal|jo[\s-]*gol|nuk\s*sh[eë]nojne/i.test(raw)) return t('outcomes.no_goal');
  if (/\bgoal\b/i.test(raw)) return t('outcomes.goal');

  return raw;
}

export function formatTicketSelection(
  outcomeName: string | undefined,
  marketName: string | undefined,
  matchName: string | undefined,
  t: Translate,
) {
  const rawOutcome = String(outcomeName ?? '').trim();
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
