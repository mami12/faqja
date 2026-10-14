const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const mainFootballCompetitionPatterns = [
  /\b(premier league|premiership)\b/,
  /\b(championship|league one|league two|national league(?: north| south)?|national conference|conference premier)\b/,
  /\bserie [abc]\b/,
  /\b(la liga|laliga|segunda division|primera division)\b/,
  /\b(bundesliga|3 liga)\b/,
  /\bligue [12]\b/,
  /\b(eredivisie|eerste divisie|primeira liga|liga portugal|super lig|super league)\b/,
  /\b(uefa )?champions league\b/,
  /\b(uefa )?europa league\b/,
  /\b(uefa )?(europa )?conference league\b/,
  /\b(nations league|european championship|world cup|world cup qualification|world cup qualifiers|euro qualifiers)\b/,
  /\b(fa cup|carabao cup|efl cup|copa del rey|coppa italia|dfb pokal|coupe de france|knvb beker|taca de portugal|scottish cup)\b/,
  /\b(mls|major league soccer|brasileirao|serie a brazil|copa libertadores)\b/,
];

const excludedCompetitionPatterns = /\b(women|womens|u1[0-9]|u2[0-3]|youth|junior|reserve|friendly|regional|regional league)\b/;

export function isMainFootballCompetition(tournamentName: unknown, categoryName?: unknown) {
  const name = normalize(`${categoryName ?? ''} ${tournamentName ?? ''}`);
  if (!name || excludedCompetitionPatterns.test(name)) return false;
  return mainFootballCompetitionPatterns.some((pattern) => pattern.test(name));
}

export function isMainFootballMatch(match: any) {
  const sportName = normalize(match?.tournament?.category?.sport?.name);
  if (sportName && !sportName.includes('football')) return true;
  return isMainFootballCompetition(
    match?.tournament?.name,
    match?.tournament?.category?.name,
  );
}

export function isHandicapMarket(market: any) {
  const details = normalize(`${market?.name ?? ''} ${market?.marketType ?? ''} ${market?.key ?? ''} ${market?.extId ?? ''}`);
  return /\b(handicap|asian|fora)\b/.test(details);
}
