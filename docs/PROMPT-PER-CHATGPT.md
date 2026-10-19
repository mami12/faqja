# Prompt për ChatGPT — shto një lojë të re pa prishur asgjë

Kopjo gjithçka në bllokun më poshtë dhe jepja ChatGPT-së **bashkë me repo-n** (zip ose
qasje). Pastaj aplikoje patch-in që kthen dhe ekzekuto testet vetë.

> Këshillë: ChatGPT pa akses në repo shpik skedarë. Nëse s'ke si t'i japësh repo-n,
> kërkoji **vetëm diff/patch** dhe aplikojeni ti, pastaj nis testet.

---

## PROMPT (kopjo nga këtu)

```
Ti je developer në repo-n "faqja" (Node/Express + React/Vite + PostgreSQL).
Kazinoja ka dy lojëra që PUNOJNË: Sizzling Hot Deluxe dhe Book of Ra Deluxe, të dyja
me portofolin real të lojtarit. Detyra jote: shto lojën <EMRI I LOJËS>.

RREGULLA ABSOLUTE
1) Vetëm shto. MOS ndrysho: server/casino/transactions.mjs, server/casino/gamble.mjs,
   server/casino/sizzling-*.mjs, server/casino/bookofra*.mjs, server/ledger/schema.mjs,
   web/src/pages/CasinoOriginalWallet.tsx. As refactor, as formatim, as "përmirësime".
2) Skedarët që lejohet të ndryshohen janë vetëm:
   - server/index.mjs            (3 app.use + 1 app.use statik + 1 import)
   - web/src/pages/CasinoPage.tsx (1 rresht në listën GAMES + 1 në mapin e wallet-it)
   - web/package.json             (emri i skriptit të sinkronizimit)
3) Modeli i vetëm i lejuar është kopjimi i Book of Ra:
   scripts/sync-original-bookofra.mjs, server/casino/bookofra.mjs,
   server/casino/bookofra-transactions.mjs, server/casino/bookofra-reels.txt
   Kopjoji, riemërto <loje> dhe ndrysho VETËM pjesët specifike të lojës.
4) Nëse klienti që të japin nuk ka libs/ me pixi+spine+howler, scripts/bundle-*.js,
   audio/*.ogg dhe data/*-hd-*.json → NDALO dhe thuaj "nuk është klient origjinal".
5) Mos shpik kurrë vlera paytable, kode simbolesh ose rrota. Merrji nga loja ose nga
   data/linesConfig-hd-*.json. Nëse s'i ke, pyet.

HAPAT
A. Krijo scripts/sync-original-<loje>.mjs duke kopjuar sync-original-bookofra.mjs.
   Ndrysho: sourceFolder, output, emrin e manifest-it, playURL-të
   (/app/api/casino/<loje>/play dhe /real/play).
B. server/casino/<loje>-reels.txt: 5 rreshta reelStrip1..5=... me 75 pozicione,
   të kalibruara për paytable-in e lojës.
C. server/casino/<loje>.mjs: LINES (id 0..N-1, të njëjtat si klienti), PAYTABLE,
   SCATTER_PAY, gradeGrid(), initResponse(), spinResponse(), createBookOfRaDemoRouter
   → create<Loje>DemoRouter, createBookOfRaRealRouter → create<Loje>RealRouter,
   cookie unik për lojën.
D. server/casino/<loje>-transactions.mjs: place<Loje>Spin (spin = −bast, fitimi pending;
   collect = +pending; idempotencë me client_request_id; select … for update).
E. server/index.mjs: shto importin, app.use për /real (para demo), app.use për demo,
   app.use për session, dhe app.use statik për /app/casino-original/<loje>.
F. web/src/pages/CasinoPage.tsx: shto 1 element në GAMES dhe 1 në GAMES-in e wallet-it.
G. web/package.json: shto sync-original-<loje>.mjs në dev dhe build.

KONTRATA E PROTOKOLLIT (mos e ndrysho)
- POST multipart/form-data, fusha data = JSON.
- action: init | spin | collect | get_double | set_double (+ initfreespin/freespin).
- init: balance{before,after}, available_actions (snake_case), init.bet/lines/multiplier/
  currency/next_request_id, init.ranges, init.directory.lines (id 0-based),
  available_lines_count, paytable, init.start_symbols, init.extra.symbol_types.
- spin: symbols, wins.line_wins[] me idx 0-BASED dhe pos:[rrotë,rresht], wins.total,
  macro_round.wins.total, available_actions.
- Gabime të ndaluara: availableActions camelCase, idx 1-based, macro_round në freespin,
  balance.before != after në freespin.

PARATË
- spin: vetëm basti zbritet; fitimi ruhet si pending (app_casino_gamble_state).
- collect: krediton pending + transaksion CASINO_WIN.
- get_double/set_double: nuk prekin bilancin, vetëm pending.
- init ose spin i ri: pending-u auto-kolektohet.
- menaxheri: +bast në spin, −fitim në collect.

RAPORTI QË DUHET TË KTHESH
1) Lista e skedarëve të krijuar/ndryshuar (patch/diff i plotë).
2) RTP analitik i llogaritur me formulën:
   P(k) = (p_s+p_w)^k − p_w^k ; mbyllja = k<5 ? 1−p_s−p_w : 1
   RTP_linje = Σ pay(s,k)·P(k)·mbyllja ; plus scatter (dritare 3-rreshtëshe,
   konvolucion 5 rrotash). Duhet të dalë brenda ±0.5% të RTP-së së kabinetit origjinal.
3) Rezultati i 300 000 rrotullimeve (RTP + hit rate) që konfirmon numrin analitik.
4) Lista e kontrolleve që i ke bërë: node --check, typecheck, build, test protokolli,
   test ledger, browser.
5) Çfarë NUK ke prekur (konfirmim me shkrim për 5 skedarët e ndaluar).

MOS THUAJ "gati" pa këto 5 pika.
```

---

## Çfarë t'i kërkosh ChatGPT-së përveç promptit

1. **Repo-n** (zip) — pa të shpik skedarë dhe path-e.
2. **Klientin origjinal** të lojës (dosjen me `libs/`, `audio/`, `data/`).
3. **Paytable-in** (foto ose tekst) dhe **tabelën e linjave** nëse nuk janë në `data/`.
4. Përgjigje në formatin **patch/diff**, jo "këtu është kodi" — kështu e sheh çfarë prek.

## Kontrolli yt për 5 minuta pas çdo ndryshimi

| Kontrolli | Si e shikon |
|---|---|
| Nuk preku lojërat e vjetra | `git diff --stat` → duhet të ketë vetëm skedarë të re + 3 të lejuar |
| Loja hapet | `/app/casino` → pllaka e re → hapet me bilanc |
| Audio + animacione | Dëgjon muzikë; simbolat lëvizin kur fitojnë |
| Butonat | Spin, Bet +/−, Paytable, Autoplay, Gamble, Collect |
| RTP | Kërko numrin analitik; nëse s'ka numër → nuk është bërë |
| Sinkronizimi i parave | Fito pa Collect → bilanci i sportit nuk ndryshon; Collect → rritet |
| Mobile | Rrotullo telefonin horizontalisht → mbush ekranin |

## Nëse ChatGPT përsëri "ngatërron"

- Kërkoji **vetëm një hap**: “Krijo vetëm `scripts/sync-original-<loje>.mjs` duke kopjuar
  `sync-original-bookofra.mjs`; mos bëj asgjë tjetër.” Pastaj hapin tjetër.
- Kur të kthejë kod, kërkoji: “Trego `git diff --stat` dhe konfirmo që nuk ke prekur
  `transactions.mjs`, `gamble.mjs`, `sizzling-*.mjs`, `bookofra*.mjs`, `schema.mjs`.”
- Nëse shpik paytable/RTP → ndalo dhe kërko numrat nga loja.

---

## Alternativa më e sigurt

Nëse ChatGPT vazhdon të prishë: **ti vetëm më jep klientin dhe paytable-in**, dhe
ndryshimi bëhet direkt në repo (siç u bë për Sizzling dhe Book of Ra) — pa ndërmjetës.
Kjo është rruga që garanton: RTP i llogaritur, paratë në sinkronizim dhe testet e
kalueshme.
