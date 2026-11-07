/**
 * Conservative full-time result markets that can be graded from a verified FT
 * score (and, for HT/FT, a verified half-time score). Unsupported names and
 * selections stay PENDING. This module does not use live incident estimates.
 */
const fold = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const integer = value => {
  if (value == null || !/^\d{1,2}$/.test(String(value).trim())) return null;
  return Number(value);
};
const fullScore = result => {
  const home = integer(result?.home_score), away = integer(result?.away_score);
  return home === null || away === null ? null : {home, away};
};
const outcomeValues = line => [line?.outcome_key, line?.outcome_name]
  .map(fold).filter(Boolean);
const resultKey = (home, away) => home > away ? '1' : away > home ? '2' : 'X';
const decide = match => match ? 'WON' : 'LOST';

export function basicOutcomeFamily(marketName = '') {
  const name = fold(marketName);
  if (/^(?:(?:full time|ft|match) )?(?:correct|exact) score(?: \((?:full time|ft)\))?$/.test(name))
    return 'CORRECT_SCORE';
  if (/^(?:(?:full time|match) )?(?:(?:total|match) )?goals? (?:odd\s*[/&-]\s*even|even\s*[/&-]\s*odd)$/.test(name)
      || /^(?:odd\s*[/&-]\s*even|even\s*[/&-]\s*odd)$/.test(name))
    return 'GOALS_ODD_EVEN';
  if (/^(?:(?:full time|match) )?(?:draw no bet|draw\s*[/]\s*no bet|dnb)$/.test(name))
    return 'DRAW_NO_BET';
  if (/^(?:ht\s*[/&-]\s*ft|half[ -]?time\s*[/&-]\s*full[ -]?time|half time full time)$/.test(name))
    return 'HALF_TIME_FULL_TIME';
  if (/^double chance\s*(?:and|&|\+|\/)\s*(?:both (?:teams? )?(?:to )?score|btts)$/.test(name))
    return 'DOUBLE_CHANCE_BTTS';
  return null;
}

const pickTeam = (line, result) => {
  for (const value of outcomeValues(line)) {
    if (['1', 'home', 'home win', 'vendas'].includes(value)
        || (result?.home_team && value === fold(result.home_team))) return 'home';
    if (['2', 'away', 'away win', 'udhetues'].includes(value)
        || (result?.away_team && value === fold(result.away_team))) return 'away';
  }
  return null;
};
const pickScore = line => {
  for (const value of outcomeValues(line)) {
    const match = value.match(/^(\d{1,2})\s*[:\-]\s*(\d{1,2})$/);
    if (match) return {home:Number(match[1]), away:Number(match[2])};
  }
  return null;
};
const pickOddEven = line => {
  for (const value of outcomeValues(line)) {
    if (['odd', 'tek'].includes(value)) return 'odd';
    if (['even', 'cift', 'çift'].includes(value)) return 'even';
  }
  return null;
};
const pickHalfFull = line => {
  for (const value of outcomeValues(line)) {
    const match = value.toUpperCase().match(/^([12X])\s*[/\-]\s*([12X])$/);
    if (match) return match[1] + '/' + match[2];
  }
  return null;
};
const pickDoubleBtts = line => {
  for (const value of outcomeValues(line)) {
    const match = value.match(/^(1x|x2|12)\s*(?:\/|&|\+|\band\b)\s*(yes|no|po|jo|gg|ng)$/);
    if (match) return {dc:match[1].toUpperCase(),btts:['yes','po','gg'].includes(match[2])};
  }
  return null;
};

/** WON, LOST, VOID (documented DNB draw), or null when not proven. */
export function gradeBasicOutcome(line, result, family = basicOutcomeFamily(line?.market_name)) {
  if (!family) return null;
  const score = fullScore(result);
  if (!score) return null;
  const {home,away} = score;
  if (family === 'CORRECT_SCORE') {
    const selected = pickScore(line);
    return selected ? decide(home === selected.home && away === selected.away) : null;
  }
  if (family === 'GOALS_ODD_EVEN') {
    const choice = pickOddEven(line);
    return choice ? decide(((home+away)%2===0)===(choice==='even')) : null;
  }
  if (family === 'DRAW_NO_BET') {
    const team = pickTeam(line,result);
    if (!team) return null;
    if (home===away) return 'VOID';
    return decide(team==='home' ? home>away : away>home);
  }
  if (family === 'HALF_TIME_FULL_TIME') {
    const htHome=integer(result?.half_home_score),htAway=integer(result?.half_away_score);
    const selected=pickHalfFull(line);
    if (htHome===null||htAway===null||!selected) return null;
    return decide(selected === resultKey(htHome,htAway)+'/'+resultKey(home,away));
  }
  if (family === 'DOUBLE_CHANCE_BTTS') {
    const selected=pickDoubleBtts(line);
    if (!selected) return null;
    const dc = selected.dc==='1X' ? home>=away :
      selected.dc==='X2' ? away>=home : home!==away;
    const btts = home>0&&away>0;
    return decide(dc && btts===selected.btts);
  }
  return null;
}
export function isProvenDrawNoBetPush(line,result) {
  return basicOutcomeFamily(line?.market_name)==='DRAW_NO_BET'
    && gradeBasicOutcome(line,result,'DRAW_NO_BET')==='VOID';
}
