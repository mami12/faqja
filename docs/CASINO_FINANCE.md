# Sport + Kazino: portofoli, raportet dhe RTP

## Implementuar

- Bilanci i përbashkët në PostgreSQL: app_user.balance dhe app_transaction. Gjithë lëvizjet bëhen brenda një transaksioni atomik.
- Historik i përhershëm i raundeve: app_casino_round me UUID idempotence, rezultat, lojë, datë, bast, pagesë dhe bilanc pas lojës.
- Fitimi/humbja e çdo lojtari ndahet sipas sportit dhe kazinosë. Përdoruesi, admini dhe menaxheri kanë filtrat e tyre. Depozitat/transfertat nuk llogariten si fitime nga loja.
- Admini sheh gjithë llogaritë. Menaxheri sheh vetëm përdoruesit e tij dhe transaksionet përkatëse. Lojtarët me histori financiare nuk mund të fshihen dhe të humbasin auditimin.
- Sizzling Hot Deluxe: klienti origjinal Pixi/Spine/Howler mbetet me figurat, animacionet e audiot nga New-folder; gjatë build-it përgatiten index.html (demo) dhe index-real.html (wallet). API-ja origjinale JSON për init/spin/collect ruhet, por në real mode spin përdor rezultatet e serverit dhe të njëjtin bilanc si sporti. Gamble/double është i bllokuar në real mode.
- Tetë lojërat e tjera përdorin imazhet lokale ekzistuese dhe motorin e tyre të personalizuar në server. Ai nuk është matematikë zyrtare e ofruesve. Free spins dhe hold/respin llogariten dhe paguhen brenda një raundi.
- RTP për Sizzling: admini zgjedh mes tri profileve të pandryshueshme; probabilitetet e stop-eve janë versionuar dhe RTP teorike llogaritet në mënyrë analitike. Nuk lejohet personalizimi sipas lojtarit. Për të ndërruar profilin, loja me fonde duhet çaktivizuar; çdo ndryshim hyn në audit log. Statistikat e RTP të vëzhguar vijnë nga raundet e kryera.
- Mobile: butoni Fullscreen kërkon landscape me ScreenOrientation.lock kur lejohet. Në iOS/embedded browsers përdoret rrotullim vizual CSS, pasi browser-i mund të mos lejojë rotacion fizik. Responsive për desktop dhe mobile.

## API

- POST /app/api/casino/session: krijon cookie të shkurtër, HttpOnly, SameSite=Strict për klientin original Pixi, pas autentikimit Bearer.
- POST /app/api/casino/sizzlinghotdeluxe/real/play: protokolli origjinal init/spin/collect me portofol real; kërkesat e përsëritura nuk bëjnë debit të ri.
- POST /app/api/casino/game/:gameId/spin: 8 lojërat e tjera me RNG në server dhe idempotence.
- POST /app/api/casino/spin: adapter alternativ JSON për Sizzling.
- GET /app/api/casino/status: statusi i portofolit dhe profilet.
- GET /app/api/admin/casino/finance dhe /manager/casino/finance: përdoruesit, totalet, transaksionet, raundet, me userId/from/to.
- GET/PATCH /app/api/admin/casino/settings: administrator, audit.
- PATCH /app/api/admin/casino/profile: zgjedh profili matematikor i Sizzling, vetëm kur është i çaktivizuar.

## Kontrolli financiar dhe kufizimet

CASINO_REAL_MONEY_ENABLED dhe CASINO_MATH_APPROVED duhet të jenë të dy true **pas** miratimit dhe validimit të pavarur, dhe admini duhet ta aktivizojë konfigurimin e app_casino_settings. Default: OFF.

Kodit nuk i është dhënë licencë automatike ose certifikim për kazino me para reale. Profilet e Sizzling janë matematika e adapterit të këtij projekti, jo RTP zyrtare Novomatic. Motori i tetë lojërave nuk është i certifikuar nga ofruesit. Përpara prodhimit kërkohet konfirmim i të drejtave të aseteve, verifikim i jashtëm i matematikës RNG/RTP, audit i pagesave, testim i ngarkesës dhe konfirmim ligjor. Mos i aktivizo flamujt pa këto.

## Verifikimi

- node scripts/test-casino-math.mjs teston 3 profile RTP dhe 8 motorët.
- Node --check për wallet, finance, transactions, RNG dhe API Pixi.
- Testimi në PostgreSQL të veçuar (casino-ledger job) teston fondet e lojtarit, menaxherit, idempotence, raportet dhe vetëpërjashtimin.
- Build verifikon gjithashtu index-real.html, klientin original dhe asetet e tij.
- Landscape/fullscreen duhet verifikuar në telefona fizikë, sepse browser-at ndryshojnë në lejet e tyre.

Ky dokument përshkruan kodin e integrimit, jo autorizim për përdorim monetar.
