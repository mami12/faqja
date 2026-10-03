/**
 * API for the React app, mounted at /app/api.
 *
 * The existing board API (/api/*) is untouched: this router serves the app's own
 * contract (auth, sports tree, matches) from our live in-memory board.
 */
import express from 'express';
import { authenticate, requireAuth } from './auth.mjs';
import * as ledger from './store.mjs';
import * as bets from './bets.mjs';
import { getMatches as getMatchRows, getMatchById as getMatchRow, boostMatch } from '../matches.mjs';
import { withOdds } from '../collector.mjs';
import { sportsTree, toClientMatch, toClientMatches } from './view.mjs';

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
    res.status(status).json({ message: e?.message ?? 'error', error: e?.message ?? 'error' });
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
  guard(async (req, res) => res.json(await ledger.listTransactions(req.user.id, asLimit(req.query.limit, 100, 500)))),
);

/* ------------------------------------------------------- bets (stage 2) */

/** place a real ticket: validates against the live feed, then charges the balance */
ledgerRouter.post(
  '/bets/place',
  requireLedger,
  requireAuth,
  guard(async (req, res) => {
    const { stake, selections, ticketType, type, systemType } = req.body ?? {};
    const ticket = await bets.placeBet({
      user: req.user,
      stake,
      selections,
      ticketType: ticketType ?? type ?? null,
      systemType: systemType ?? null,
    });
    res.json(ticket);
  }),
);

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

ledgerRouter.post(
  '/bets/cashout/:ticketId',
  requireLedger,
  requireAuth,
  guard(async (req, res) => res.json(await bets.cashOut(req.params.ticketId, req.user.id))),
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

    res.json(toClientMatches(await withOdds(rows)));
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
    return res.json(toClientMatch(serialized));
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
    return res.json(toClientMatches(await withOdds(rows)));
  }),
);