# Sport + Casino finances

## Development status
The sportsbook PostgreSQL ledger (app_user.balance and app_transaction) remains the source of truth. Casino rounds use this same balance, but monetary casino mode is disabled by default and is not cleared for production. The original Sizzling Pixi/Spine browser client remains a separate DEMO. Its assets are installed during build by scripts/sync-original-sizzling.mjs.

## Staff interfaces
- Admin / Financat Sport + Kazino: users, date filters, separate sport/casino results, totals and full transaction histories.
- Manager / Financat Sport + Kazino: identical overview limited to assigned players. Each player has a finance button.
- Admin / Cilësimet Kazino / RTP: current RTP profile identifier, observed RTP and certification status; audited operating switch.
- Observed RTP = sum(payout) / sum(stake). It is not theoretical RTP and does not predict individual outcomes.
- Deposits, withdrawals and manager transfers are kept outside player net gaming profit.

## APIs
- GET /app/api/casino/status: current auth balance and feature gate.
- POST /app/api/casino/spin: server-calculated result, unique per-player clientRequestId UUID, locked row, all wallet entries and round persisted atomically.
- GET /app/api/admin/casino/finance and /manager/casino/finance: scoped query with userId/from/to filters.
- GET/PATCH /app/api/admin/casino/settings: admin only; all changes have audit records.
- Player limits count CASINO_SPIN and BET_PLACED stakes together.

## Restrictions before monetary launch
1. CASINO_REAL_MONEY_ENABLED is false by default and app_casino_settings.enabled defaults to false.
2. No certified game-math profile has been supplied. Do not enable monetary casino mode without independent RNG/math/RTP validation and licensing.
3. Integrate the licensed game provider math, manager liability settlement, reconciliation, max payout caps, player protections, concurrency tests, and security QA before accepting money.
4. Only a fixed, audited list of verified global RTP profiles should be selectable. No secret player-targeted RTP or mid-round manipulation.
5. The nine generic games are still demos; only Sizzling has a server-authoritative wallet adapter. The React real-money view is not the original vendor Pixi client.
6. App user deletion is restricted when stored casino rounds refer to the account, preserving round history.

## Mobile fullscreen
Press Fullscreen on the Sizzling game. On browsers supporting ScreenOrientation.lock, landscape is requested. Other browsers use visual CSS rotation as a fallback; physical device orientation cannot always be forced, especially on iOS. Real-device testing is still required.

This PR stages the development features. It is not a certification or authorization to accept real-money wagers.
