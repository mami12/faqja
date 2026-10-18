/**
 * Universal Bet Builder templates. Admin selects contracts, not per-match prices.
 * Public markets are synthesized from active, eligible provider selections.
 * Never use the synthetic price as authority when a ticket is placed.
 */
import { query } from '../db.mjs';
import { isDecidedLiveOutcome, isDecidedLiveMarket } from './decided-markets.mjs';

const CONTRACTS = {
  '1X2': ['1', 'X', '2'],
  DC: ['1X', '12', 'X2'],
  BTTS: ['Yes', 'No'],
  TOTAL: ['Over', 'Under'],
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

function cleanLeg(leg) {
  const market = String(leg?.market ?? '').toUpperCase();
  const outcome = String(leg?.outcome ?? '').trim();
  const line = market === 'TOTAL' ? String(leg?.line ?? '').replace(',', '.') : '';
  if (!CONTRACTS[market]?.some(o => o.toLowerCase() === outcome.toLowerCase())) fail('Market ose zgjedhje e pavlefshme.');
  if (market === 'TOTAL' && !['0.5','1.5','2.5','3.5','4.5','5.5','6.5'].includes(line)) fail('Linjë golash e pavlefshme.');
  return { market, outcome: CONTRACTS[market].find(o => o.toLowerCase() === outcome.toLowerCase()), line };
}

export async function listTemplates({ activeOnly = false } = {}) {
  const { rows } = await query(
    `select id, name, legs, active, updated_at as "updatedAt"
       from app_bet_builder_template
       where ($1::boolean = false or active = true)
       order by updated_at desc`, [activeOnly],
  );
  return rows;
}

export async function saveTemplate({ id, name, legs, active }) {
  const title = String(name ?? '').trim();
  if (title.length < 3 || title.length > 80) fail('Emri duhet të ketë 3–80 karaktere.');
  if (!Array.isArray(legs) || legs.length < 2 || legs.length > 5) fail('Zgjidh 2–5 markete.');
  const cleaned = legs.map(cleanLeg);
  if (new Set(cleaned.map(l => l.market + ':' + l.line)).size !== cleaned.length) {
    fail('Nuk mund të zgjedhësh dy rezultate të të njëjtit market.');
  }
  if (id != null && !uuid.test(String(id))) fail('ID e pavlefshme.');
  const { rows } = await query(
    `insert into app_bet_builder_template (id,name,legs,active)
     values (coalesce($1::uuid,gen_random_uuid()),$2,$3::jsonb,$4)
     on conflict (id) do update set name=excluded.name,legs=excluded.legs,
       active=excluded.active,updated_at=now()
     returning id,name,legs,active,updated_at as "updatedAt"`,
    [id ?? null,title,JSON.stringify(cleaned),active === true],
  );
  return rows[0];
}

export async function deleteTemplate(id) {
  if (!uuid.test(String(id))) fail('ID e pavlefshme.');
  await query('delete from app_bet_builder_template where id = $1', [id]);
}

function matchesMarket(market, kind, line) {
  const name = String(market.name ?? '').toLowerCase();
  const type = String(market.marketType ?? '').toUpperCase();
  if (/corner|card|booking|handicap|half|period|player|first|&|\+/.test(name)) return false;
  if (kind === '1X2') return /1\s*x\s*2|match result|full time result|winner|moneyline|^result$/.test(name) ||
    (type === '1X2' && !/total|chance|score|btts|both/.test(name));
  if (kind === 'DC') return /double chance/.test(name);
  if (kind === 'BTTS') return /both teams to score|\bbtts\b/.test(name);
  if (kind === 'TOTAL') {
    if (!/total|over\/?under|goals/.test(name)) return false;
    const actual = String(market.line ?? market.specifier ?? '').replace(',', '.');
    // Do not guess a line if the provider has not identified one.
    return actual === line;
  }
  return false;
}

export function findLeg(match, leg) {
  const markets = (match.markets ?? []).filter(m => m.status === 'ACTIVE' && !isDecidedLiveMarket(match,m) && matchesMarket(m,leg.market,leg.line));
  for (const market of markets) {
    const outcome = (market.outcomes ?? []).find(o =>
      o.status === 'ACTIVE' &&
      !isDecidedLiveOutcome(match, {
        name: market.name, line: market.line, period: market.period,
        outcomeName: o.name, outcomeCode: o.code,
      }) &&
      Number.isFinite(Number(o.odds)) && Number(o.odds) > 1 &&
      [String(o.code ?? ''),String(o.name ?? '')].some(s => s.toLowerCase() === leg.outcome.toLowerCase()));
    if (outcome) return { market, outcome };
  }
  return null;
}

export function builderId(matchId, templateId) { return `BB|${matchId}|${templateId}`; }
export function parseBuilderId(id) {
  const parts = String(id ?? '').split('|');
  if (parts.length !== 3 || parts[0] !== 'BB' || !/^\d+$/.test(parts[1]) || !uuid.test(parts[2])) return null;
  return { matchId: parts[1], templateId: parts[2] };
}

export async function decorateMatches(matches) {
  if (!matches?.length) return matches;
  const templates = await listTemplates({ activeOnly: true });
  if (!templates.length) return matches;
  for (const match of matches) {
    if (match.isSuspended || match.status === 'ENDED' || match.status === 'CANCELLED') continue;
    for (const template of templates) {
      // Every constituent must still be open; an already-completed goal line
      // cannot stay sellable through the synthetic Bet Builder market.
      const resolved = template.legs.map(leg => findLeg(match,leg));
      if (resolved.some(r => !r)) continue;
      const price = resolved.reduce((p,r) => p * Number(r.outcome.odds),1);
      if (!Number.isFinite(price) || price > 1000) continue;
      const id = builderId(match.id,template.id);
      match.markets ??= [];
      match.markets.push({
        id: `BB|${match.id}|${template.id}|market`,
        matchId: match.id, marketType: 'OTHER', name: `Bet Builder: ${template.name}`,
        status: 'ACTIVE', sortOrder: 9000, line: '',
        // Real constituent IDs let the browser respond to immediate socket
        // suspensions, even before the next REST refresh.
        builderLegs: resolved.map(part => ({
          marketId: part.market.id, outcomeId: part.outcome.id,
        })),
        outcomes: [{
          id, marketId: `BB|${match.id}|${template.id}|market`,
          name: template.legs.map(l => l.market + ' ' + l.outcome + (l.line ? ' ' + l.line : '')).join(' + '),
          odds: Number(price.toFixed(4)), status: 'ACTIVE',
        }],
      });
    }
  }
  return matches;
}
