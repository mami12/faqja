/**
 * API for the React app, mounted at /app/api.
 *
 * The existing board API (/api/*) is untouched: this router serves the app's own
 * contract (auth, sports tree, matches) from our live in-memory board.
 */
import express from 'express';
import { authenticate, requireAuth } from './auth.mjs';
import * as ledger from './store.mjs';
import { getMatches as getMatchRows, getMatchById as getMatchRow } from '../matches.mjs';
import { withOdds } from '../collector.mjs';
import { sportsTree, toClientMatch, toClientMatches } from './view.mjs';

export const ledgerRouter = express.Router();

const guard = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
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