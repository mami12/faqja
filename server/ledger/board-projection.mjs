/** The list renders only FT result, 2.5 goals and BTTS. Full markets live on /matches/:id. */
export function projectBoardMatches(matches) {
  return matches.map(match=> {
    const chosen=new Map();
    for(const market of match.markets??[]) {
      if(Number(market.period??0)!==0) continue;
      const name=String(market.name??'').trim().toLowerCase().replace(/\s+/g,' ');
      let kind;
      if(/^(?:1\s*x\s*2|match result|full[ .]*time[ .]*result|winner|moneyline|result)$/.test(name)) kind='result';
      else if(/^(?:full[ .]*time[ .]*)?(?:both teams (?:to )?score|btts|both score)$/.test(name)) kind='btts';
      else if(/^(?:full[ .]*time[ .]*)?(?:total(?: goals?)?|over\s*\/?\s*under|goals(?: over\s*\/?\s*under)?)(?:\s*\(?2[.,]5\)?)?$/.test(name) &&
        (String(market.line??market.specifier??'').replace(',','.')==='2.5'||/2[.,]5/.test(name))) kind='total';
      if(kind&&!chosen.has(kind)) chosen.set(kind,market);
    }
    return {...match,marketCount:match.marketCount??match.markets?.length??0,markets:[...chosen.values()]};
  });
}
