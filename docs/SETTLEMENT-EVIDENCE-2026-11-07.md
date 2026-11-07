# Verifikimi i tregjeve dhe ruajtja e eventeve (7 nëntor 2026)

Ky dokument përshkruan kodin e degës së punës, jo gjendjen e një databaze lokale të paarritshme nga GitHub.

## Rruga e të dhënave
1. Zizobet dërgon snapshot-in e ndeshjes, pa një kërkesë API shtesë.
2. Kolektori i jep përparësi ndeshjeve me bileta. Për të tjerat ruan vetëm evente të ndryshuara dhe konfirmime periodike.
3. app_match_event_fact ruan golat, kornerat, kartonat dhe faullet (këto të fundit vetëm kur ekzistojnë numëratorë të rakorduar), me minutë, ekip, ID, identitet lojtari, anulime dhe korrigjime.
4. app_match_event_coverage mban përputhjen e timeline me numëratorët, minutën deri ku ka mbulim dhe konfirmimin nga një kampion i dytë.
5. app_ticket_line.live_contract ngrin zgjedhjen, pragun, numrin e golit të radhës, baseline dhe minutat në momentin e bastit. accepted_contract ruan identitetin origjinal të ofertës.
6. app_match_result mban rezultatin final, pjesën e parë dhe totalet; app_stat_review ruan krahasimin/konfliktet e burimeve.
7. Settler-i vendos WON/LOST vetëm me prova. Mungesa e evidencës është PENDING. VOID është vetëm për push/rregull të provuar.
8. Pagesa kalon nga një transaksion me lock të biletës, kundër dyfishimit në retry/rindezje.

## Familjet e mbuluara
- Kronologji: Next Goal/Corner, minuta, intervale, gara për N gola/kornera, ordinalet, kartonat me dritare.
- Lojtari: Anytime, 2+, 3+, ekzakt N gola, kur emri dhe golat janë të verifikuar.
- Rezultat FT/HT: 1X2, DC, BTTS, Correct Score i njohur, Odd/Even, DNB, HT/FT, Double Chance+BTTS.
- Numërime: golat ekzakt dhe bands, pjesa e dytë, clean sheet, win to nil, winning margin.
- Statistika: corner 1X2/odd-even/ekzakt/bands, card exact/bands/odd-even, shots/shots-on-target/fouls exact/bands/odd-even/1X2, vetëm me statistika finale të besueshme.

Kjo listë tregon familjet e implementuara, jo se çdo emërtim i ofruesit ka mbështetje. Përzgjedhje të panjohura nuk hamendësohen.

## AiScore
AiScore është burim suplementar: për golashënues, ID e ndeshjes dhe të dy ekipet duhen konfirmuar para lidhjes me eventin e Zizobet. Goditjet në portë dhe faullet nga endpoint-et e faqes janë vetëm kandidate informuese, jo autoritet pagesash. Statistikat financiare përdorin mekanizmin ekzistues të kontrollit të burimeve dhe konfliktet mbajnë pezull zgjedhjet e prekura. AISCORE_INFO_ENABLED=true aktivizon kërkesat kandidate për ndeshjet e mapuara; STATS_PROVIDERS_ENABLED=true aktivizon ofruesit e statistikave të konfiguruar.

## Rastet pa automatikë të sigurt
- Timeline i paplotë, një poll i vetëm, status FT i paprovuar, korrigjime ose ndërprerje.
- Correct Score: Other pa matricën origjinale të ofertës.
- Lojtar pa provë pjesëmarrjeje ose emër të paqartë.
- Asian quarter handicap, early payout, pas penalltive, semantikë e paprovuar e kartonëve dhe specialitete të tjera.
- Statistika kontradiktore ose minuta të pjesshme që nuk mund të dallohen.

## Testet dhe auditimi
Ekzekutoni në database të izoluar:
- node scripts/test-basic-outcomes.mjs
- node scripts/test-aggregate-outcomes.mjs
- node scripts/test-advanced-settlement-market-keys.mjs
- node scripts/test-event-collector-queue.mjs
- node scripts/test-unwatched-match-facts.mjs
- node scripts/test-zizobet-card-colors-scorers.mjs
- node scripts/test-settlement-results.mjs
- npm run test:protected

Vetëm për lexim mbi bazën e operatorit:
- node scripts/audit-market-settlement-readiness.mjs 30000
- node scripts/audit-advanced-settlement.mjs

Mos fshini tabelat ose kodin historik pa kontrolluar referencat dhe pa backup. Testet e izoluara nuk janë certifikim për para reale.
