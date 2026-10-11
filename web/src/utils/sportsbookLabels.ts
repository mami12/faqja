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

  if (/^(match winner|full time result|fulltime result|match result|1x2)( |$)/.test(value)) return t('markets.match_result');
  if (/^(both teams to score|both teams score|both score|btts|gg ng|gg\/ng)/.test(value)) return t('markets.both_teams_score');
  if (/^(double chance|1st half double chance)/.test(value)) return t('markets.double_chance');
  if (/^(over under|under over|total goals over under|total over under)/.test(value)) return t('markets.over_under');
  if (/^(over|under|lart|poshte) \d/.test(value)) {
    const line = raw.match(/\d+(?:[.,]\d+)?/)?.[0];
    return `${/^(over|lart)/.test(value) ? t('outcomes.over') : t('outcomes.under')} ${line}`;
  }
  if (/^(total goals|total goal|goals total|total)( |$)/.test(value)) return t('markets.totals');
  if (/^(total corners|corners total|corners)( |$)/.test(value)) return t('markets.corners');
  if (/^(total cards|cards total|yellow cards|red cards|cards)( |$)/.test(value)) return t('markets.cards');
  if (/^(correct score)( |$)/.test(value)) return t('markets.correct_score');
  if (/^(odd even|odd even goals)( |$)/.test(value)) return t('markets.odd_even');
  if (/^(next goal|last goal|first goal)( |$)/.test(value)) return t('markets.next_goal');
  if (/^(halftime fulltime|half time full time|half time fulltime)/.test(value)) return t('markets.halftime_fulltime');
  if (/^(1st half result|first half result)/.test(value)) return t('markets.first_half_result');
  if (/^(2nd half result|second half result)/.test(value)) return t('markets.second_half_result');
  if (/^(handicap|asian handicap|fora)( |$)/.test(value)) return t('markets.handicap');
  if (/^cols? ?-?\d+$/.test(value)) return t('markets.match_result');

  return raw
    .replace(/\bOver\/Under\b/gi, t('markets.over_under'))
    .replace(/\bFull Time Result\b/gi, t('markets.match_result'))
    .replace(/\bMatch Winner\b/gi, t('markets.match_result'))
    .replace(/\bBoth Teams to Score\b/gi, t('markets.both_teams_score'))
    .replace(/\bDouble Chance\b/gi, t('markets.double_chance'))
    .replace(/\bTotal Goals\b/gi, t('markets.totals'))
    .replace(/\bTotal Corners\b/gi, t('markets.corners'))
    .replace(/\bTotal Cards\b/gi, t('markets.cards'));
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
