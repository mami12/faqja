# Casino slot audit (source-code review, 23 October 2026)

This report is a source review of `mami12/faqja`, **not** a live-site
probability audit or proof of licensed/certified casino mathematics.

## Sizzling Hot Deluxe

- The admin control `PATCH /admin/casino/profile` persists
  `app_casino_settings.profile`.
- The authenticated spin handler in `server/casino/transactions.mjs` reads
  that profile, draws a grid via `randomProfileGrid(profile)`, and applies
  `profileFactor(profile)` to the graded line-win **amounts**.
- `randomProfileGrid` in `server/casino/rtp-profiles.mjs` deliberately
  generates uniform reel stops, independent of the profile.
- Therefore setting `SCHOOL_RTP_1` (1% theoretical RTP) does **not** mean
  only one in a hundred spins will show winning symbols or trigger a win
  animation. It reduces expected returned **money**, not visual hit frequency.
  Small positive wins can still be animated.
- Winning animations, returned `line_wins`, wallet debits and credited wins
  should be reconciled per round ID before assuming a payout bug.
- RTP is a long-run expectation. A small manual sample cannot validate it.

## Other slots are independent

- `server/casino/agt-engine.mjs` uses the AGT game's fixed `d.rtp`
  reel set.
- `server/casino/lucky-clover-engine.mjs` uses `DATA.defaultRtp`
  for reel selection.
- `server/casino/vikings-engine.mjs` has its own scanner and reels.
- The Sizzling RTP admin route does **not** update these independent
  engines. A global casino-wide RTP slider is not implemented.

## Acceptance checks before any financial deployment

1. For each spin, compare wager amount, returned symbols, graded win lines,
   pending win and wallet transactions by the same round ID.
2. Run `node scripts/test-casino-math.mjs`,
   `node scripts/test-casino-ledger.mjs`, and the relevant original-game
   protocol/finance tests in an isolated test database, never a real wallet.
3. Collect sufficiently large, reproducible non-cash simulations separately
   for each game and reel profile. Record both hit frequency and payout RTP.
4. Check server/browser symbol maps and animations against the exact
   server-returned result; do not let visual wins imply uncredited money.
5. Review provider rights, licensing, certification and audit requirements
   before any real-money deployment.

No casino RNG, payout or wallet logic was changed in this branch.
