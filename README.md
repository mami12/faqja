# faqja — football board (live + prematch)

Minimal, dark, **real football only** board for the `bitgames6205.com` / `api-gateway.gw-lucky-bet.com`
sports feed. Backend on **Railway**, frontend on **GitHub Pages**, storage on **Supabase Postgres**.

```
                            ┌──► in-memory odds store ──► Socket.IO ──► browser (GitHub Pages)
upstream API ──► collector ─┤        (no odds writes)          + REST
                            └──► Postgres: the ledger only (users / tickets / results)
```

## Where the data lives

The board (match list + prices) runs entirely from memory; the database holds only what must
survive a restart: the ledger (`users`, `tickets`, `results`) and the optional raw-frame archive.
A database outage therefore no longer stops the board — it only disables the ledger.

* **Matches** — `MATCH_STORE=memory` (default, `server/match-store.mjs`): the feed resends the whole
  list every poll cycle, so storing it was only buying durability for data we receive again 10s
  later. `MATCH_STORE=db` puts them back in Postgres.
* **Odds** — `ODDS_STORE=memory` (default, `server/odds-store.mjs`): prices are the hottest data in
  the app (thousands of row changes a minute) and the browser only needs the **current** price,
  which it already receives by push (`odds:update`). `/api/odds/:matchId/history` then covers the
  current process lifetime only. `ODDS_STORE=db` mirrors them into `odds_current`/`odds_history`.

`/health` reports both stores (`matches`, `odds`) plus `ledger.ready`, and stays **200 even when the
database is down**, so a ledger outage cannot restart-loop the service.

## Betting app (React) — served at `/app`

A betting/admin UI (login, sportsbook, betslip, my-bets, admin and manager panels, 4 languages)
is served by this same backend under **`/app`**, using the board's live matches and prices. It
never talks to the database for the board: matches come from the in-memory store and prices from
the in-memory odds store, so an outage of the ledger only disables the panels that need it.

```
/app               the React app (built from web/ -> web/dist)
/app/api/*         its API  (server/ledger/routes.mjs)
/app/api/auth/...  login / me            -> JWT + bcrypt
/app/api/matches   the live board in the app's own shape (server/ledger/view.mjs)
/socket.io         the same realtime feed the board uses (odds:update, matches:live, match:info)
```

**Default accounts** (created on first boot when missing, see `server/ledger/auth.mjs`):

| Account | Password | Role | Notes |
|---|---|---|---|
| `admin` | `admin123` | ADMIN | admin panel, users, deposits, ticket audit |
| `demo` | `demo` | PLAYER | starts with 1000 LEK so the betslip is usable |

Change them (or set `SEED_DEFAULT_ACCOUNTS=false`) before going live — they are created with a
warning in the log, and the passwords are stored as bcrypt hashes.

**Ledger tables** (additive, create-only, `app_` prefix so nothing existing is touched):
`app_user`, `app_transaction` (every balance movement with `balance_after`), `app_ticket`,
`app_ticket_line` (odds and names frozen at placement) and `app_feed_override` (admin
suspend/price overrides that survive the next feed frame).

**Bets** (`server/ledger/bets.mjs` — the same rules the original app had):

| Endpoint | What it does |
|---|---|
| `POST /app/api/bets/place` | validates every selection against the **live feed**, then charges the stake, freezes the prices into `app_ticket_line` and records the movement — all in one transaction |
| `POST /app/api/bets/book` | same validation, no stake/account: returns a shareable 6-char booking code |
| `GET /app/api/bets/active` / `history` | My Bets: open tickets / the last 50 settled |
| `POST /app/api/bets/cashout/:id` | pays **70%** of the potential payout early and closes the ticket as WON |
| `GET /app/api/tickets/search?q=` / `booking/:code` | find a ticket by code or id fragment (public) |

Rules enforced (verified): minimum stake **100 LEK**, only `ACTIVE` accounts, balance checked under a row lock,
prices taken from the server (a client-sent price is refused if it drifts more than 10%), live odds must be
fresher than 2 minutes, and settled tickets cannot be cashed out twice.

**Settlement** (`server/ledger/settler.mjs`, `server/ledger/results.mjs`):

When the feed reports a match finished, its final score (and corners/cards when present) is copied into
`app_match_result` — so settlement survives a restart — and then every pending line of that match is graded:

| Outcome | Result |
|---|---|
| every non-void line won | ticket **WON**, payout = stake × (odds of the lines that were not void) |
| any line lost | ticket **LOST**, nothing credited |
| all lines void | ticket **VOID**, stake refunded |
| can't be judged (no data for that market) | that line is **VOID** and drops out of the price |

Gradable markets: 1X2, double chance, BTTS, totals (goals), **corners and cards** (our feed delivers those, so
they settle instead of voiding), handicaps (a push voids). A manager who owns the player carries the win or
collects the loss. The pass runs every `SETTLE_INTERVAL_MS` (default 30s) and is idempotent — a second pass never
pays twice. Admins can also settle by hand: `POST /app/api/admin/matches/:id/settle {homeScore, awayScore}`,
and see stored results in `GET /app/api/admin/settlement`.

**Build / run**

```bash
npm install                # installs the app's build tooling too
npm run build:web          # vite build -> web/dist (Railway runs this on deploy)
npm start                  # serves the board (/) and the app (/app)

npm run dev:web            # vite dev server on :5173, proxies /app/api and /socket.io
```

## Status: what is real and what is not

| Feature | State |
|---|---|
| Real-football-only match list (live + prematch) | **works** (verified: 1205 upstream rows → 1137 kept, 68 synthetic dropped) |
| League/tournament names, kickoff times | **works** |
| Live minute `72'`, `HT`, `FT` | **works, but derived** from kickoff time (see limitations) |
| Storage + history in Postgres | **works** (schema auto-created on boot) |
| Where odds live | **in memory, pushed straight to browsers** (`ODDS_STORE=memory`) — the DB sees no odds writes |
| Where matches live | **in memory** (`MATCH_STORE=memory`) — the board keeps serving while the DB is down; the DB is the ledger only |
| Real-time push to the browser (Socket.IO) | **works** (verified `matches:live` + `odds:update` broadcasts) |
| Odds: 1X2, totals, corners, cards | **works** — 4 board columns + a row drill-down showing every market the feed sends |
| All markets / half markets | **stored and displayed** (`is_base`, `grp_order`, `render_type`, `period` are kept) |
| Suspension flags (dim + strike-through) | **works** (`status !== 1` in the frames, or `"suspended": true` on ingest) |
| Live score | **works** from `match-info` `periodsScore` |

### How the odds arrive (decoded push protocol)

The REST API never returns prices:

* `POST /matches/get-many` → match metadata only (no odds, no score, no clock).
* `/b/get-many`, `/bets/get-base-settings` → **HTTP 403**, they need a logged-in session.
* `wss://…/push-server-v2/…` → handshake fine, but the server only pushes to a session that is
  subscribed *the way the site itself subscribes*; an anonymous session stays **silent** (tested: 30 s
  listening + 16 subscribe/auth frames + 6 more shaped like your capture → 0 frames).
* The sports front-end JS is **403-blocked**, so the subscribe step can't be copied from source.

Your captured frames gave the payload format, which is now implemented in `server/push-decode.mjs`:

```
42["u",{"messageType":"match-info","data":{"matchId":40451752,"service":"LIVE",
     "enabledOddsCount":30,"periodsScore":[{"t1":"11","t2":"13"},{"t1":"3","t2":"8"}]}},"<id>"]
42["u",{"messageType":"match-odds","data":{"matchId":40370446,"oddsGroups":[
     {"id":"6257","outcomes":["1","x","2"],"renderType":"cols-3","oddsList":[
        {"id":"10:17819854120194618:1","cf":3.08,"status":1}, …]}]}},"<id>"]
```

* `cf` = price, `status: 1` = active (**anything else = suspended** → dimmed + struck through)
* `match-info.scoreBoard.results` → **per-team live statistics** (`{"87150":{"corners":"2","yellowCards":"1","redCards":"0"}}`),
  mapped to home/away through the competitor ids and shown as `corners 2-3 · cards 1-0` on the row
* `oddsGroups[].name` → the feed's **own market name** (`"Corners. Result"`, `"Corners. Double chance"`),
  and each price carries `outcome` (`"1x"`, `"odd"`) plus `name` (`"Iraq Or Draw"`) — no guessing needed for those
* `oddsGroups[].subgameIds` → market family, from `/subgames/get-many?sportId=18`:
  `2 Main · 3 Total · 6 Handicap · 7 Halves · 11 Correct Score · 13 Corners · 174 Cards/Penalties`;
  corners wins over total when both are present (`[3,13]` = Corners. Odd/Even)
* `outcomes[]` aligns positionally with `oddsList[]` (repeating when a group holds several lines)
* in provider-12 ids `12:L:<ref>:[<type>,[line],[period],1,<outcomeIdx>,[]]` the line and period are
  parsed; `period > 0` (halves/quarters) is stored but not shown on the board
* `match-info.periodsScore` gives the **live score** (summed per period)
* when a group repeats under/over without line info the line becomes `#1`, `#2`… so pairs stay distinct
* every group is stored — including `isBase: false` and half/quarter markets (`period > 0`), which the
  board columns ignore but the row drill-down shows

**What the frames contain (updated after the football capture).** The first capture was flagged
`"isBaseOddsGroups": true` (base groups only); the football one for `40159037 Iraq - Oman` arrived with
`"isBaseOddsGroups": false` and included `Corners. Result`, `Corners. Double chance`, `Corners. Odd/Even`
— so non-base groups do flow too, it depends on what the page has subscribed to. `enabledOddsCount`
(70 for that match) still exceeds what had arrived (23 outcomes), so the push is not necessarily the
whole tree; the complete list per match comes from **`/b/get-many`** (the call the match page makes),
which answers **403** without that page's session token/Cookie.

**Suspension:** `status` is per outcome — `1` = active, **anything else = suspended**. Your capture only
contained `status: 1`, so the exact value the book uses when it pulls the markets at a goal chance is
unconfirmed; the code already treats any non-1 value as suspended, so nothing needs changing — relay
one frame captured during a suspension to see it in action. (Verified in `npm run test:markets`: all
markets flip to `SUSPENDED`, rows dim and strike through.)

Open any row on the board to see **all** markets of that match with prices, lines, period, base flag
and suspension — updated live as frames arrive.

Because the browser is the only authenticated client, the bridge is a tiny userscript —
`docs/frames-relay.user.js` (also served at `https://<user>.github.io/<repo>/frames-relay.user.js`).
Install it in Tampermonkey, set `API_BASE` + `TOKEN` inside, open the site: every odds/score frame is
forwarded to `POST /ingest/frames` (batched every 400 ms, retried on failure). It sends **only** those
push messages – no cookies, no account data. With `RELAY_OUTGOING = true` it also archives the frames
the page *sends*, which is what's needed to finish the server-side subscribe path.

Verified end-to-end with your own capture:

```
POST /ingest/frames {frames:5} -> frames=5 matchInfo=3 oddsMessages=2 oddsRows=16 skippedNotTracked=8 unknown=0
match 40370446 Malawi U20 - Comoros U20 (82')
  result   Full Time Result   Home=3.08  Draw=3.28  Away=2.27
  total    Total #1..#4       Over=1.19/1.28/1.05/2.48   Under=4.29/3.48/8.65/1.5
```

(the 8 skipped rows were basketball matches — the board only tracks football.)

Alternatives that also work today: `POST /ingest/odds` (documented below) for any other source, or
`ODDS_SUBSCRIBE_FRAMES` + `ODDS_SOCKET=true` for a future server-side socket connection.

### Server-side subscription (no browser needed)

`ODDS_SOCKET=true` makes the backend subscribe to the push channel itself — verified working:

```
-> 40
<- 40{"sid":…,"pid":…}
-> 42["subscribe",{"messageType":"subscribe-match-odds","data":{"matchIds":[…50…],"isBaseOddsGroups":true|false}}]
-> 42["subscribe",{"messageType":"subscribe-match-info","data":{"matchIds":[…50…]}}]
<- 42["u",{"messageType":"match-odds-snapshot"|"match-odds"|"match-info-snapshot"|"match-info",…},id]
<- 2  /  -> 3        heartbeat
```

Live run (`[pusher] subscribed live=19 (full markets 19) prematch=100`):

| | |
|---|---|
| frames / odds messages / info messages | 633 / 462 / 171 in ~55 s |
| live matches with odds | 18 of 19 |
| markets per live match | 48–71 (incl. **cards** and **corners** columns) |
| score | `Iraq - Oman 1-0`, `Al-Bataeh - Palm City 0-1` … from `matchScore.t1/t2` |
| clock | `54' 2nd Half` from `matchTime` (ms) + `status` — no more guessing |
| corners/cards | `corners 3-3`, `0-3` from `scoreBoard.results` |
| suspension | `status !== 1` per outcome, `hasOpenOdds` per match |

Env knobs: `SUBSCRIBE_FULL_LIMIT` (live matches that get the full market list, default 60),
`SUBSCRIBE_LIVE_LIMIT` / `SUBSCRIBE_PREMATCH_LIMIT` (how many ids to subscribe),
`SUBSCRIBE_FULL_MARKETS=false` (base markets only). The browser relay (`/ingest/frames`) keeps
working and is the fallback if the channel ever blocks the server's IP again.


Market **names** are not in the payload and there's no REST lookup for them, so columns come from
`market-map.json` (copy `market-map.example.json`) plus heuristics:
`outcomes` containing `x` → 1X2, an under/over line `>= 6.5` in a football match → corners, other
under/over → total. To pin corners/cards exactly: open a football match on the site, find the
corners/cards price in the UI, read the odds-group id (or the number inside the odds id) from the
frames in `GET /api/raw-frames` / your relay logs, then add it to `market-map.json`:

```json
{ "types": { "777": { "column": "corners", "name": "Total Corners" } },
  "groups": { "55999": { "column": "cards", "name": "Total Cards" } } }
```

## Quick start (local)

```bash
npm install
cp .env.example .env        # then paste your DATABASE_URL
npm start                   # http://localhost:3000  (serves ./docs too)
```

Useful checks:

```bash
npm run probe:db            # Supabase connection
npm run probe:sockets       # upstream socket frames (10-20s)
npm run probe:gateway       # upstream API + which sports exist
node scripts/probe-local-socket.mjs   # realtime end-to-end against the running backend
```

Ports/paths: HTTP `:3000`, Socket.IO path `/socket.io`, static frontend from `docs/`.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | – | Supabase pooler URL. `sslmode` is stripped in code because pg ≥ 8.16 turns `require` into `verify-full` and that fails on the pooler chain. The resolved target (`user@host:port/db`, no password) is logged at boot and returned by `/health` as `target`. |
| `MATCH_STORE` | `memory` | `memory` keeps the match list in RAM, so the board survives a database outage; `db` stores it in Postgres. |
| `DB_INIT_STRICT` | `false` | Exit when the ledger schema cannot be created instead of running without it. The board itself no longer needs the database. |
| `PORT` | `3000` | Railway injects and assigns `PORT` dynamically. |
| `UPSTREAM_GATEWAY` | `https://api-gateway.gw-lucky-bet.com` | Sports API host. |
| `PARTNER_ID` | `d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f` | `p=` partner id from the captured URLs. |
| `LANG_CODE` | `en-001` | `l=` locale. |
| `POLL_INTERVAL_MS` | `10000` | Match refresh (matches are pushed to browsers after each cycle). |
| `MATCH_PAGE_LIMIT` | `3000` | Page size; upstream `meta.total` equals the page size, so keep it big. |
| `ALLOWED_ORIGINS` | `*` | CORS/Socket.IO origins, comma separated. Set to `https://<user>.github.io` in production. |
| `INGEST_TOKEN` | – | Shared secret for `POST /ingest/odds` and `GET /api/raw-frames`. Empty = open. |
| `ODDS_SOCKET` | `false` | Connect to the upstream push channel. |
| `ODDS_STORE` | `memory` | `memory` keeps prices in RAM and pushes them to browsers (no DB writes); `db` mirrors them into `odds_current`/`odds_history`. |
| `RESUBSCRIBE_MS` | `20000` | How often the pusher re-subscribes live matches. The feed only sends the real clock (`matchTime`) and score (`matchScore`) in a snapshot on (re)subscribe, so this is what keeps minutes and scores fresh. |
| `ODDS_SUBSCRIBE_FRAMES` | – | Socket.IO frames to send after connect, separated by `||`. |
| `LOG_RAW_FRAMES` | `true` | Store unparsed upstream frames (max 300/session). |
| `FOOTBALL_SPORT_ID` | `18` | Verified football sport id in this feed. |

## Deploy

**Backend (Railway)** — `railway.json` configures the service (Nixpacks build, `npm start`,
healthcheck `/health`): push the repo, then in Railway *New Project → Deploy from GitHub repo* and
pick this repository (Railway detects Node.js and reads `railway.json`). Paste the variables from
`.env.example` — `DATABASE_URL`, `ALLOWED_ORIGINS`, `INGEST_TOKEN`, ... — in
*Variables → RAW Editor*, then *Settings → Networking → Generate Domain* and check
`https://<service>.up.railway.app/health`.

Notes for Railway: services run continuously (no idle sleep like Render's free tier), `PORT` is
injected dynamically, and the collector restarts cleanly because the schema is created with
`IF NOT EXISTS` on every boot.

**Frontend (GitHub Pages)** — Pages serves from the repo root or `/docs`; this project already keeps
the frontend in `docs/`, so: *Settings → Pages → Branch: main, Folder: /docs*.
Then edit `docs/config.js`:

```js
window.APP_CONFIG = {
  API_BASE: 'https://<your-service>.up.railway.app',
  ...
};
```

and make sure the backend allows that origin (`ALLOWED_ORIGINS=https://<user>.github.io`).

## HTTP API

| Route | Description |
|---|---|
| `GET /health` | DB + collector + odds-socket status, `feed` freshness (`live` / `staleClock` / `staleScore`) and the in-memory `odds` store stats. Returns **200 even when the database is down** — `db.ok` / `feed.error` carry the detail. |
| `GET /api/meta` | Live/prematch/finished counts, last sync. |
| `GET /api/leagues` | Leagues with live/prematch counts. |
| `GET /api/matches?service=live\|prematch\|all&league=&q=&limit=&offset=` | Matches incl. grouped markets. `odds=0` to skip odds. |
| `GET /api/matches/:id` | One match with markets. |
| `GET /api/odds/:matchId/history?limit=` | Price-change history — in memory by default, so it covers this process lifetime only (`ODDS_STORE=db` reads the table). |
| `POST /ingest/odds` | Push odds (header `x-ingest-token`). |
| `POST /ingest/frames` | Push native push-channel frames; `?direction=out` archives client frames, `?storeUnknown=1` keeps odds for matches outside the football table. |
| `GET /api/raw-frames?limit=` | Unparsed/archived frames (token required). |
| `GET /api/info` | Tiny JSON ping (so `/` can serve the board). |

Socket.IO events: client gets `hello`, `meta`, `matches:live`, `odds:update`, `match:info`,
`odds:socket`, `server:error`. Match objects carry `score: {home, away}`, `periodsScore`,
`markets: [{ key, name, line, column, suspended, outcomes[] }]` where `column` is one of
`result | total | corners | cards | other` — that is what the board renders.

## Odds ingest format

```bash
curl -X POST https://<service>.up.railway.app/ingest/odds \
  -H 'content-type: application/json' -H 'x-ingest-token: <token>' \
  -d '{
    "matchId": 40408005,
    "markets": [
      { "key": "1x2", "name": "Full Time Result",
        "outcomes": [ {"key":"1","name":"Home","price":2.10},
                      {"key":"x","name":"Draw","price":3.40},
                      {"key":"2","name":"Away","price":3.00} ] },
      { "key": "corners", "name": "Total Corners", "line": "9.5",
        "outcomes": [ {"key":"over","price":1.95}, {"key":"under","price":1.85} ] },
      { "key": "cards", "name": "Total Cards", "line": "3.5",
        "outcomes": [ {"key":"over","price":2.05}, {"key":"under","price":1.75} ] }
    ]
  }'
```

Suspension: set `"suspended": true` on a market (all outcomes) or on a single outcome. The board dims
and strikes those cells and marks the row when everything is suspended.
Other accepted shapes: an array of such objects, a flat row list, or `{"matchId":1,"odds":{"1":2.1,"X":3.4,"2":3.0}}`.

## "Real football only" rules

Football is sport `18` (`tag=football`, `sportType=default`) and its feed mixes real matches with
synthetic ones — `isEsport` is `false` even for those, so slug/name rules are required
(`server/upstream.mjs`):

| Rule | Why |
|---|---|
| `sportId === 18`, `sportTag === 'football'` | only football |
| `sport.isEsport !== true`, `sportType === 'default'` | drops the 13 esport sports and `specials`/`polybet` (`Markets`, 254 rows of crypto TWAP "matches") |
| category slug not in `cyberfifa, ereplays, replays, short-football, …` | `ESportsBattle (2x4 min)` (player nicknames like `Porto (mani)`), `eHighlights.World Cup`, `England (V)`, `Everton (replays)`, `Short Football 3x3` |
| tournament name not matching `2x4 min / ESportsBattle / H2H GG / eHighlights / Penalty shootout / Highlights / Long-term bets / Outrights / Singles only / Simulat / Virtual / Cyber / Short Football` | kills outrights and replay/esport feeds |
| exactly 2 competitors, both named, different, and not matching `(v)`, `(replays)`, `(franchise)`, `(highlights)`, or a short `(nickname)` | kills long-term markets and FIFA/esport rows |
| `(w)` / `(women)` are **allowed** | real women's football (`Italy U20 (w)`) |

Typical cycle: `received≈1205 real≈1137 filtered≈68`.

## Database

Created automatically on boot (`server/schema.mjs`):

* `matches` — one row per match, keyed by `match_id`; keeps `service` (`LIVE`/`PREMATCH`), `start_at`,
  `status` (`scheduled`/`live`/`ended`), `phase` (`1H`/`HT`/`2H`/`FT`), `live_minute`, `active`,
  `last_seen_at`, and the raw upstream JSON in `raw`.
* `odds_current` — the live price of every outcome (PK: `match_id, market_key, line, outcome_key`) plus
  `suspended`.
* `odds_history` — one row per price change.
* `raw_frames` — unparsed upstream socket frames (helps finish the odds mapping).

Matches missing from the feed for ~1.5 min are marked `active=false, status='ended'` instead of deleted,
so history survives.

## Known limitations

1. **No odds source yet** (see above) — everything else around it works.
2. **The live minute is an approximation**: `minute = now - kickoff` (1H 0-45, HT 45-60, 2H 46-90, FT >105).
   Real stoppage/HT lengths are unknown, and matches the feed still lists as `LIVE` after ~105 min are
   shown as `FT`/excluded from the live board.
3. **No scores** — the public feed does not expose them; the board has no score column for that reason.
4. Upstream totals fluctuate by a few matches between polls (normal), and results are geo-scoped
   (`meta.geoZone=RU` in the feed).
5. Scraping any third-party API may violate its terms — this is your call and your responsibility.

## Layout

```
server/   config.mjs  schema.mjs  db.mjs  minute.mjs  upstream.mjs  odds.mjs  push-decode.mjs  collector.mjs  index.mjs
docs/     index.html  styles.css  app.js  config.js  vendor/socket.io.min.js  frames-relay.user.js   <- GitHub Pages
scripts/  probe-db / probe-gateway / probe-sockets / probe-subscribe / probe-push2 / probe-local-socket
          test-frames.mjs  test-live-ingest.mjs  sample-frames.txt (your captured frames)
railway.json  market-map.example.json  README.md
```
