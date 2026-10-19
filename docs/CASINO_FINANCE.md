# Sizzling Hot Deluxe: integrim me faqen sportive

## Faqja e kazinosë
Ka vetëm **Sizzling Hot Deluxe**. Rrugët `/casino` dhe `/casino/sizzling` shfaqin klientin origjinal Pixi/Spine/Howler të kopjuar gjatë build-it nga `mami12/New-folder`, commit-i i fiksuar në `scripts/sync-original-sizzling.mjs`. Grafikat, animacionet, logoja, audio dhe kontrolli origjinal i basteve/5 linjave mbeten pjesë e lojës. Nuk shfaqen tetë lojërat e tjera apo motorë me emoji.

- `/app/casino-original/sizzling/index.html`: demo, pa para reale, me API lokale `/app/api/casino/sizzlinghotdeluxe/play` që mbështet init/spin/collect/gamble.
- `/app/casino-original/sizzling/index-real.html`: i njëjti klient vizual, por me API `/app/api/casino/sizzlinghotdeluxe/real/play`, që dërgon spin te portofoli i përbashkët PostgreSQL. Për real-money `gamble/double` është i çaktivizuar.
- Fullscreen në desktop dhe mobile kërkon `screen.orientation.lock('landscape')` ku mbështetet, dhe CSS fallback për iOS e browser-a të kufizuar. Rrotullimi fizik nuk garantohet në çdo pajisje.

## Portofoli dhe financat
Bilanci i sportit/kazinosë është `app_user.balance`. Çdo spin ruhet me UUID unik për shmangien e debitimeve të dyfishta, rezultatin e motorit në server, bastin, pagesën, profilin matematikor, bilancin pas raundit dhe referencat në `app_transaction`. Fitimi/humbja e menaxherit për lojtarët e vet regjistrohet në të njëjtin transaksion të databazës.

Paneli admin/menaxher shfaq sportin dhe kazinonë të ndara, bilancin, fitime/humbjet dhe transaksionet e secilit përdorues, me filtrat e datës. Historiku i raundeve Sizzling tregon bastin, fitimin dhe bilancin pas secilit spin. Nuk fshihet llogari që ka histori financiare.

## RTP
Paneli admin shfaq RTP teorike të llogaritur nga tabela e pagesave dhe probabilitetet e reel stop-eve si dhe RTP të vëzhguar nga raundet. Profilet matematike të këtij adapteri janë të përhershme/versionuara, globale dhe me audit. Nuk lejohet ndryshim profili gjatë lojës aktive apo individualisht për lojtarin.

**Matematika e adapterit nuk është matematika e certifikuar e prodhuesit Novomatic.** Demo është funksionale si demonstrim. Modaliteti monetar është OFF sipas konfigurimit fillestar dhe kërkon dy flamujt `CASINO_REAL_MONEY_ENABLED=true` dhe `CASINO_MATH_APPROVED=true`, aktivizim të audituar, licencim, të drejta për asetet dhe kontrolle të jashtme.

## Testet
- `node scripts/test-sizzling-demo.mjs`: protokolli/linjat dhe fitimet e demo-s.
- `node scripts/test-casino-math.mjs`: probabilitetet e Sizzling dhe profilet RTP.
- `node scripts/test-casino-art.mjs`: vetëm Sizzling dhe asetet e tij.
- `node scripts/verify-original-sizzling.mjs`: sigurohet se klienti, image atlases, animacionet dhe audio janë në build.
- `node scripts/test-sizzling-browser.mjs`: Pixi ngarkohet dhe dërgon init/spin nga canvas.
- `node scripts/test-casino-ledger.mjs`: PostgreSQL i përkohshëm në CI, idempotenca, bilanci i lojtarit e menaxherit dhe kufizimet.
