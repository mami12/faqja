/** Keep the small set of full-time board contracts, including alternate goal
 * lines and double chance. The browser chooses a visible line; removing those
 * contracts here would make its fallback impossible. Full markets stay on detail.
 */
export function projectBoardMatches(matches) {
  return matches.map(match=> {
    const chosen=new Map();
    for(const market of match.markets??[]) {
      if(Number(market.period??0)!==0) continue;
      const name=String(market.name??'').trim().toLowerCase().replace(/\s+/g,' ');
      let kind;
      if(/\b(?:half|halves|quarter|period|extra[ -]?time|overtime|first|last|next|min(?:ute)?s?|corners?|cards?|bookings?|handicap|asian|home|away|team)\b|\+|&/.test(name)) continue;
      if(/^(?:1\s*x\s*2|match result|full[ .-]*time[ .-]*result|match winner|winner|moneyline|result)(?:\s*\(1x2\))?$/.test(name)) kind='result';
      else if(/^(?:full[ .-]*time[ .-]*)?(?:double chance|dc)$/.test(name)) kind='dc';
      else if(/^(?:full[ .]*time[ .]*)?(?:both teams (?:to )?score|btts|both score)$/.test(name)) kind='btts';
      else if(/^(?:full[ .-]*time[ .-]*)?(?:total(?: goals?)?|over\s*\/?\s*under|under\s*\/?\s*over|goals(?: over\s*\/?\s*under)?|goal line)(?:\s*\(?\d+(?:[.,]\d+)?\)?)?$/.test(name)) {
        // Keep every actual goal line, even if currently suspended. A locked
        // primary must remain identifiable instead of silently changing contract.
        kind='total:'+chosen.size;
      }
      if(kind&&!chosen.has(kind)) chosen.set(kind,market);
    }
    return {...match,marketCount:match.marketCount??match.markets?.length??0,markets:[...chosen.values()]};
  });
}
