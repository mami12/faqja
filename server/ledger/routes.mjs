/**
 * API for the React app, mounted at /app/api.
 *
 * The existing board API (/api/*) is untouched: this router serves the app's own
 * contract (auth, sports tree, matches) from our live in-memory board.
 */
import express from 'express';
import { authenticate, requireAuth, requireAdmin } from './auth.mjs';
import * as ledger from './store.mjs';
import * as bets from './bets.mjs';
import * as betHistory from './bet-history.mjs';
import * as builders from './bet-builders.mjs';
import { getMatches as getMatchRows, getMatchById as getMatchRow, boostMatch } from '../matches.mjs';
import { withOdds } from '../collector.mjs';
import { sportsTree, toClientMatch, toClientMatches } from './view.mjs';
import { getPlayerControls, requestSelfExclusion, updatePlayerLimits } from './player-controls.mjs';
import { refreshLiveRiskSettings, writeLiveRiskSettings } from './live-risk-store.mjs';
import { DEFAULT_LIVE_RISK_SETTINGS } from '../live-risk-settings.mjs';

export const ledgerRouter = express.Router();

/**
 * Async wrapper that also maps a thrown error to its intended status. Bet rules throw
 * errors carrying `status` (400 for a refused bet, 403 for a blocked account); without
 * this they would surface as 500 and the betslip would show a generic failure instead of
 * the real reason. Both `message` and `error` are set: the app reads either.
 */
const guard = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    const status = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500;
    if (status >= 500) console.error('[app api]', req.method, req.originalUrl, '-', e?.message);
    const body = { message: e?.message ?? 'error', error: e?.message ?? 'error' };
    if (e?.code) body.code = e.code;
    if (e?.outcomeId) body.outcomeId = e.outcomeId;
    if (e?.oldOdds !== undefined) body.oldOdds = e.oldOdds;
    if (e?.newOdds !== undefined) body.newOdds = e.newOdds;
    if (e?.outcomeName) body.outcomeName = e.outcomeName;
    if (e?.marketName) body.marketName = e.marketName;
    if (e?.matchName) body.matchName = e.matchName;
    res.status(status).json(body);
  });
/**
 * Only a definite 4xx rejection from a bet-placement handler is logged.
 * Never log server errors as rejected bets, and never affect the wallet.
 * Auditing must not replace the original betting error if the DB write fails.
 */
const placementGuard = (fn) => guard(async (req, res, next) => {
  try {
    return await fn(req, res, next);
  } catch (e) {
    const code = Number(e?.status);
    if (code >= 400 && code < 500 && req.user?.id && req.user?.role === 'PLAYER') {
      const body = req.body ?? {};
      const columns = Array.isArray(body.columns) ? body.columns : [];
      const count = Array.isArray(body.selections) ? body.selections.length :
        columns.reduce((sum, col) => sum + (Array.isArray(col) ? col.length : 0), 0);
      try {
        await betHistory.recordRejectedBet({
          userId: req.user.id, requestId: body.clientRequestId,
          stake: body.totalStake ?? body.stake, selectionCount: count, reason: e?.message,
        });
      } catch (auditError) {
        console.warn('[bet rejection audit] write failed:', auditError?.message);
      }
    }
    throw e;
  }
});

const asLimit = (v, def, max) => Math.min(Math.max(1, Number(v) || def), max);

/**
 * Login and everything money-related needs the ledger tables. The board endpoints below
 * do not, so they keep serving while the database is down.
 */
const requireLedger = (req, res, next) =>
  ledger.isLedgerReady() ? next() : res.status(503).json({ message: 'ledger database unavailable' });

/* ------------------------------------------------------------------- auth */

ledgerRouter.post(
  '/auth/login',
  requireLedger,
  guard(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ message: 'username and password are required' });

    const result = await authenticate(username, password);
    if (!result) return res.status(401).json({ message: 'invalid username or password' });
    if (result.user.status === 'BANNED') return res.status(403).json({ message: 'account is banned' });
    return res.json(result);
  }),
);

ledgerRouter.get('/auth/me', requireLedger, requireAuth, (req, res) => res.json(req.user));

ledgerRouter.get(
  '/me/transactions',
  requireLedger,
  requireAuth,
  guard(async (req, res) => res.json(await ledger.listTransactions({
    role: 'PLAYER',
    userId: req.user.id,
    from: req.query.from,
    to: req.query.to,
    limit: asLimit(req.query.limit, 100, 500),
  }))),
);

/** Player's actual ticket statuses and separately audited rejected attempts. */
ledgerRouter.get(
  '/me/bets',
  requireLedger,
  requireAuth,
  guard(async (req, res) => {
    if (req.user.role !== 'PLAYER') return res.status(403).json({ message: 'player only' });
    res.json(await betHistory.listPlayerBetActivity({
      userId: req.user.id, status: req.query.status,
      from: req.query.from, to: req.query.to,
      limit: asLimit(req.query.limit, 200, 500),
    }));
  }),
);

ledgerRouter.get(
  '/me/transactions/summary',
  requireLedger,
  requireAuth,
  guard(async (req, res) => {
    if (req.user.role !== 'PLAYER') return res.status(403).json({ message: 'player only' });
    return res.json(await ledger.playerTransactionSummary({
      userId: req.user.id,
      from: req.query.from,
      to: req.query.to,
    }));
  }),
);

ledgerRouter.get(
  '/me/controls',
  requireLedger,
  requireAuth,
  guard(async (req, res) => {
    if (req.user.role !== 'PLAYER') return res.status(403).json({ message: 'player only' });
    return res.json(await getPlayerControls(req.user.id));
  }),
);

ledgerRouter.patch(
  '/me/controls/limits',
  requireLedger,
  requireAuth,
  guard(async (req, res) => {
    if (req.user.role !== 'PLAYER') return res.status(403).json({ message: 'player only' });
    return res.json(await updatePlayerLimits(req.user.id, req.body ?? {}));
  }),
);

ledgerRouter.post(
  '/me/controls/self-exclusion',
  requireLedger,
  requireAuth,
  guard(async (req, res) => {
    if (req.user.role !== 'PLAYER') return res.status(403).json({ message: 'player only' });
    return res.json(await requestSelfExclusion(req.user.id, req.body?.days));
  }),
);

/* ------------------------------------------------------- admin live risk configuration */
ledgerRouter.get('/admin/live-risk', requireLedger, requireAuth, requireAdmin,
  guard(async (req,res) => res.json({ settings: await refreshLiveRiskSettings(), defaults: DEFAULT_LIVE_RISK_SETTINGS })));
ledgerRouter.put('/admin/live-risk', requireLedger, requireAuth, requireAdmin,
  guard(async (req,res) => res.json(await writeLiveRiskSettings(req.body?.settings,req.user))));

/* ------------------------------------------------------- universal bet builders */
ledgerRouter.get('/admin/bet-builders/catalog', requireLedger, requireAuth, requireAdmin,
  (req,res) => res.json(builders.builderCatalog()));
ledgerRouter.get('/admin/bet-builders', requireLedger, requireAuth, requireAdmin,
  guard(async (req,res) => res.json(await builders.listTemplates())));
ledgerRouter.post('/admin/bet-builders', requireLedger, requireAuth, requireAdmin,
  guard(async (req,res) => res.json(await builders.saveTemplate(req.body ?? {}))));
ledgerRouter.delete('/admin/bet-builders/:id', requireLedger, requireAuth, requireAdmin,
  guard(async (req,res) => { await builders.deleteTemplate(req.params.id); res.json({ ok:true }); }));

/* ------------------------------------------------------- bets (stage 2) */

/** place a real ticket: validates against the live feed, then charges the balance */
ledgerRouter.post(
  '/bets/place',
  requireLedger,
  requireAuth,
  placementGuard(async (req, res) => {
    const { stake, selections, ticketType, type, systemType, clientRequestId } = req.body ?? {};
    const ticket = await bets.placeBet({
      user: req.user,
      stake,
      selections,
      clientRequestId,
      ticketType: ticketType ?? type ?? null,
      systemType: systemType ?? null,
    });
    res.json(ticket);
  }),
);

/** Multiple ordinary columns: one atomic wallet transaction. */
ledgerRouter.post('/bets/place-columns', requireLedger, requireAuth, placementGuard(async (req, res) => {
  res.json(await bets.placeColumns({
    user: req.user,
    stake: req.body?.stake,
    totalStake: req.body?.totalStake,
    selections: req.body?.selections,
    columns: req.body?.columns,
    clientRequestId: req.body?.clientRequestId,
  }));
}));

/** shareable booking code: no stake, no account */
ledgerRouter.post(
  '/bets/book',
  requireLedger,
  guard(async (req, res) => {
    const { stake, selections, ticketType, type, systemType } = req.body ?? {};
    res.json(
      await bets.bookTicket({
        stake,
        selections,
        ticketType: ticketType ?? type ?? null,
        systemType: systemType ?? null,
      }),
    );
  }),
);

ledgerRouter.get(
  '/bets/active',
  requireLedger,
  requireAuth,
  guard(async (req, res) => res.json(await bets.listActive(req.user.id))),
);

ledgerRouter.get(
  '/bets/history',
  requireLedger,
  requireAuth,
  guard(async (req, res) => res.json(await bets.listHistory(req.user.id))),
);

/** the betslip's "find ticket" box: booking code or a ticket id fragment */
ledgerRouter.get(
  '/tickets/search',
  requireLedger,
  guard(async (req, res) => {
    const ticket = await bets.searchTickets(req.query.q);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    return res.json(ticket);
  }),
);

/** a booking code can be opened by anyone (that is the point of sharing it) */
ledgerRouter.get(
  '/booking/:code',
  requireLedger,
  guard(async (req, res) => {
    const ticket = await bets.getBookingTicket(req.params.code);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    return res.json(ticket);
  }),
);

/* ------------------------------------------------------------ board views */

/** the sidebar tree (also served at /sports, which the sidebar tries first) */
ledgerRouter.get(
  ['/sports', '/sports/tree'],
  guard(async (_req, res) => {
    const rows = await getMatchRows({ includeEnded: true, limit: 2000 });
    res.json(sportsTree(rows));
  }),
);

ledgerRouter.get(
  '/matches',
  guard(async (req, res) => {
    const { tournamentId, categoryId, sportId, status, q } = req.query;
    const service = status === 'LIVE' ? 'LIVE' : status === 'PREMATCH' ? 'PREMATCH' : null;

    let rows = await getMatchRows({
      service,
      q: q ? String(q) : null,
      limit: asLimit(req.query.limit, 500, 2000),
      includeEnded: status === 'ENDED',
    });

    // our store filters by league; the app also asks by category/tournament
    if (categoryId) rows = rows.filter((r) => r.category_slug === String(categoryId));
    if (tournamentId) rows = rows.filter((r) => String(r.tournament_id) === String(tournamentId));

    const matches = toClientMatches(await withOdds(rows));
    // Board cards show base odds; build the complete automatic menu when a
    // visitor opens /matches/:id rather than sending it for 500 matches per poll.
    res.json(ledger.isLedgerReady() ? await builders.decorateMatches(matches,{includeAutomatic:false}) : matches);
  }),
);

ledgerRouter.get(
  '/matches/:id',
  guard(async (req, res) => {
    const row = await getMatchRow(Number(req.params.id));
    if (!row) return res.status(404).json({ message: 'match not found' });
    // somebody is looking at this match: make sure it gets its full market list (corners,
    // cards, every total) on the next subscribe cycle, instead of base markets only
    boostMatch(row.match_id);
    const [serialized] = await withOdds([row]);
    const match = toClientMatch(serialized);
    if (ledger.isLedgerReady()) await builders.decorateMatches([match]);
    return res.json(match);
  }),
);

/**
 * The app's pitch tracker. Our feed gives score, clock, corners and cards but no ball
 * position, so this returns the real statistics and leaves the ball centred.
 */
ledgerRouter.get(
  '/matches/:id/tracker',
  guard(async (req, res) => {
    const row = await getMatchRow(Number(req.params.id));
    if (!row) return res.status(404).json({ message: 'match not found' });
    boostMatch(row.match_id);

    const [serialized] = await withOdds([row]);
    const m = toClientMatch(serialized);
    const stats = {
      possession: 50,
      shots: 0,
      shotsOnTarget: 0,
      corners: 0,
      yellow: 0,
      red: 0,
    };

    return res.json({
      matchId: m.id,
      ballX: 50,
      ballY: 50,
      possessionTeam: 'home',
      /* the feed's own state, e.g. "2nd Half" */
      eventText: m.period ?? '',
      minute: m.currentMinute,
      score: { home: m.homeScore, away: m.awayScore },
      homeStats: { ...stats, corners: m.corners?.home ?? 0, yellow: Math.max(0, (m.cards?.home ?? 0)) },
      awayStats: { ...stats, corners: m.corners?.away ?? 0, yellow: Math.max(0, (m.cards?.away ?? 0)) },
    });
  }),
);

/** "sport 18" is football in our feed; the app asks for it by id */
ledgerRouter.get(
  '/sports/:sportId/matches',
  guard(async (req, res) => {
    if (String(req.params.sportId) !== '18') return res.json([]);
    const rows = await getMatchRows({ limit: asLimit(req.query.limit, 500, 2000) });
    const matches = toClientMatches(await withOdds(rows));
    return res.json(ledger.isLedgerReady() ? await builders.decorateMatches(matches,{includeAutomatic:false}) : matches);
  }),
);
