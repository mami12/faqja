import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { Server as SocketServer } from 'socket.io';
import { buildSystemColumns, splitSystemStake, systemColumnPayout } from '../server/ledger/system-columns.mjs';

// The real React context, betslip and receipt run against local fake APIs only.
const root = fileURLToPath(new URL('../web', import.meta.url));
const fixture = `<!doctype html><html><body><div id="root"></div><script type="module">
import React from '/src/../node_modules/.vite/deps/react.js';
import {createRoot} from '/src/../node_modules/.vite/deps/react-dom_client.js';
import {BetslipProvider,useBetslip} from '/src/context/BetslipContext.tsx';
import {LanguageProvider} from '/src/context/LanguageContext.tsx';
import {AuthProvider} from '/src/context/AuthContext.tsx';
import {LiveFeedProvider,useLiveFeed} from '/src/api/liveFeed.tsx';
import Betslip from '/src/components/Betslip/Betslip.tsx';
import OddsButton from '/src/components/Sports/OddsButton.tsx';
function Probe(){window.slip=useBetslip();window.feed=useLiveFeed();return null;}
function BuilderButtonFixture(){
  const [quote,setQuote]=React.useState(()=>({
    match:{id:'C',tournamentId:1,homeTeam:'Arsenal',awayTeam:'Chelsea',status:'PREMATCH',startTime:new Date(Date.now()+3600000).toISOString(),isSuspended:false},
    market:{id:'BB|C|automatic',matchId:'C',marketType:'BET_BUILDER',name:'Bet Builder · 1 + Over 2.5',status:'ACTIVE',sortOrder:1,builderQuotedAt:new Date().toISOString(),builderLegs:[
      {marketId:'C|result|',outcomeId:'C|result||1',odds:2},
      {marketId:'C|total|2.5',outcomeId:'C|total|2.5|Over',odds:3}
    ]},
    outcome:{id:'BB|C|automatic|combo',marketId:'BB|C|automatic',name:'1 + Over 2.5',odds:6,status:'ACTIVE'}
  }));
  window.builderQuote=quote;window.setBuilderQuote=setQuote;
  return React.createElement('div',{id:'fixture-combo'},React.createElement(OddsButton,quote));
}
createRoot(document.getElementById('root')).render(React.createElement(LanguageProvider,null,
  React.createElement(AuthProvider,null,React.createElement(BetslipProvider,null,
    React.createElement(LiveFeedProvider,null,React.createElement(Probe),React.createElement(BuilderButtonFixture),React.createElement(Betslip))))));
</script></body></html>`;
// Resolve React through Vite's dependency optimizer rather than a fixed cache filename.
const html = fixture.replace("'/src/../node_modules/.vite/deps/react.js'", "'react'")
  .replace("'/src/../node_modules/.vite/deps/react-dom_client.js'", "'react-dom/client'");
let server, vite, browser, socketServer;
const requests = [], plainRequests = [], failures = [];
let failNextPlacement = false;
let oddsChangedResponse = null;
const selection = (matchId, outcomeId, odds, marketId = `${matchId}-1x2`, outcomeName = '1') => ({
  matchId, outcomeId, odds, marketId, outcomeName,
  marketName: marketId.includes('total') ? 'Total Goals' : 'Full Time Result',
  marketLine: marketId.includes('total') ? '3.5' : undefined,
  matchName: matchId === 'A' ? 'Al Arabi vs Al Nejmeh' : 'Saturn vs Rodina',
});
const fixtureSelections = [selection('A', 'A1', 5), selection('A', 'Aover', 2.1, 'A-total', 'Over'), selection('B', 'B1', 15.18)];
const makeTickets = body => {
  const selections = body.selections.map(row => fixtureSelections.find(selection => selection.outcomeId === row.outcomeId));
  const columns = buildSystemColumns(selections);
  const stakes = splitSystemStake(body.totalStake, columns.length);
  return columns.map((column, index) => ({
    id: `00000000-0000-0000-0000-00000000000${index}`, ticketType: column.length > 1 ? 'COMBO' : 'SINGLE',
    placedAt: new Date().toISOString(), status: 'PENDING', stake: stakes[index],
    totalOdds: column.reduce((product, row) => product * row.odds, 1),
    potentialPayout: systemColumnPayout(stakes[index], column.map(row => row.odds)),
    lines: column.map(row => ({ ...row, id: row.outcomeId, oddsAtPlacement: row.odds, status: 'PENDING' })),
  }));
};

try {
  vite = await createServer({ root, configFile: false, plugins: [(await import('@vitejs/plugin-react')).default()],
    server: { middlewareMode: true, hmr: false, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
    appType: 'custom', optimizeDeps: { include: ['react', 'react-dom/client', 'axios', 'lucide-react'] },
  });
  const app = express();
  app.use(express.json());
  app.get('/app/api/auth/me', (_request, response) => response.json({ id: 'test-player', username: 'isolated', role: 'PLAYER', balance: 10000, currency: 'ALL', status: 'ACTIVE' }));
  app.post('/app/api/bets/place-columns', async (request, response) => {
    requests.push(request.body);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (failNextPlacement) {
      failNextPlacement = false;
      return response.status(500).json({ message: 'Test response lost; retry safely.' });
    }
    response.json({ tickets: makeTickets(request.body) });
  });
  app.post('/app/api/bets/place', (request, response) => {
    plainRequests.push(request.body);
    if (oddsChangedResponse) {
      const changed = oddsChangedResponse;
      oddsChangedResponse = null;
      return response.status(409).json(changed);
    }
    const lines = request.body.selections.map(row => ({
      ...row, id: row.outcomeId, matchId: 'C', marketId: 'BB|C|automatic',
      matchName: 'Arsenal vs Chelsea', marketName: 'Bet Builder · 1 + Over 2.5',
      outcomeName: '1 + Over 2.5', status: 'PENDING',
    }));
    response.json({
      id: '00000000-0000-0000-0000-000000000099', ticketType: 'SINGLE', status: 'PENDING',
      placedAt: new Date().toISOString(), stake: request.body.stake, lines,
      totalOdds: lines.reduce((product, row) => product * row.oddsAtPlacement, 1),
      potentialPayout: systemColumnPayout(request.body.stake, lines.map(row => row.oddsAtPlacement)),
    });
  });
  app.get('/', async (_request, response) => {
    try { response.type('html').send(await vite.transformIndexHtml('/', html)); }
    catch (error) { failures.push(error.message); response.status(500).send('Fixture transform failed'); }
  });
  app.use(vite.middlewares);
  server = http.createServer(app);
  socketServer = new SocketServer(server, { serveClient: false });
  socketServer.on('connection', socket => socket.emit('combos:settings', { enabled: true }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log('Local betslip fixture ready; opening isolated browser');
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', error => failures.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:') ? request.continue() : request.abort());
  await page.evaluateOnNewDocument(() => localStorage.setItem('token', 'isolated-test-token'));
  await page.goto(origin);
  await page.waitForFunction(() => !!window.slip, { timeout: 15000 });
  await page.waitForFunction(() => window.feed.connected);
  console.log('Real React betslip and local socket connected');
  const snapshot = () => page.evaluate(() => ({
    stake: window.slip.stake, type: window.slip.ticketType,
    columns: window.slip.columns.map(column => column.map(row => row.outcomeId)),
    stakes: window.slip.columnStakes, payouts: window.slip.columnPreviews.map(column => column.payout),
    total: window.slip.potentialPayout, overflow: window.slip.columnsOverflow,
  }));
  const add = async rows => {
    await page.evaluate(rows => rows.forEach(row => window.slip.addSelection(row)), rows);
    await page.waitForFunction(count => window.slip.selections.length === count, {}, await page.evaluate(() => window.slip.selections.length));
  };
  const waitType = type => page.waitForFunction(type => window.slip.ticketType === type, {}, type);
  await add([fixtureSelections[0], fixtureSelections[2]]);
  await waitType('COMBO');
  assert.equal((await snapshot()).stake, '100');
  await add([fixtureSelections[1]]);
  await waitType('SYSTEM');
  assert.deepEqual(await snapshot(), { stake: '100', type: 'SYSTEM', columns: [['A1', 'B1'], ['Aover', 'B1']], stakes: [5000, 5000], payouts: [3795, 1593.9], total: 5388.9, overflow: false });
  assert.equal(await page.$eval('select[aria-label="Lloji i skedinës"]', select => select.disabled && select.value === 'SYSTEM'), true);
  assert.equal(await page.$eval('#betslip-stake', input => input.min), '100');
  assert.equal(await page.$eval('button[title="Prenotimi për shumë kolona nuk është aktiv"]', button => button.disabled), true);
  assert.ok((await page.$eval('body', body => body.innerText)).includes('1593.90'));
  assert.ok(!(await page.$eval('body', body => body.innerText)).includes('Shuma vendoset për kolonë'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '500').click());
  await page.waitForFunction(() => window.slip.stake === '500');
  assert.deepEqual((await snapshot()).stakes, [25000, 25000], 'quick amount edits the TOTAL only');
  await page.focus('#betslip-stake');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type('#betslip-stake', '100');
  await page.waitForFunction(() => window.slip.stake === '100');
  await page.evaluate(() => window.slip.removeSelection('Aover'));
  await waitType('COMBO');
  assert.equal((await snapshot()).stake, '100');
  // Multiple alternatives from the same market must be retained, including batched clicks.
  await add([selection('A', 'A2', 3), selection('A', 'AX', 4)]);
  await page.waitForFunction(() => window.slip.columns.length === 3);
  assert.deepEqual((await snapshot()).stakes, [3334, 3333, 3333]);
  assert.equal((await snapshot()).stake, '100');
  assert.ok((await page.$eval('body', body => body.innerText)).includes('33.33–33.34'));
  await page.evaluate(() => window.slip.setStake('99.99'));
  await page.waitForFunction(() => window.slip.stake === '99.99');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin').click());
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('100 Lek'));
  assert.equal(requests.length, 0);
  await page.evaluate(() => window.slip.clearAll());
  await page.waitForFunction(() => window.slip.selections.length === 0);
  await add(fixtureSelections);
  await waitType('SYSTEM');
  failNextPlacement = true;
  // Synchronous double click is one request, even before the disabled state renders.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin');
    button.click(); button.click();
  });
  await page.waitForFunction(() => !window.slip.isPlacingBet);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].totalStake, 100);
  assert.equal(requests[0].columns, undefined);
  assert.equal(requests[0].stake, undefined);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin').click());
  await page.waitForFunction(() => document.body.innerText.includes('Sistem · Kolona 1 nga 2'));
  assert.equal(requests.length, 2);
  assert.equal(requests[0].clientRequestId, requests[1].clientRequestId, 'uncertain failure preserves idempotency key');
  assert.ok((await page.$eval('body', body => body.innerText)).includes('Shuma totale e sistemit: 100.00 Lek'));
  assert.ok((await page.$eval('body', body => body.innerText)).includes('Shuma e kësaj kolone'));
  await page.click('button[aria-label="Mbyll"]');
  await page.waitForFunction(() => document.body.innerText.includes('Sistem · Kolona 2 nga 2'));
  await page.click('button[aria-label="Mbyll"]');
  await page.waitForFunction(() => !document.body.innerText.includes('BILETË BASTI'));
  // Actual mobile layout uses the same total and allocations.
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await add(fixtureSelections);
  await waitType('SYSTEM');
  assert.equal((await snapshot()).stake, '100');
  assert.deepEqual((await snapshot()).stakes, [5000, 5000]);
  // The real shared Socket.IO provider immediately disables a prefilled combo.
  await page.evaluate(() => window.slip.clearAll());
  await page.waitForFunction(() => window.slip.selections.length === 0);
  await add([{ ...fixtureSelections[0], outcomeId: 'BB|A|combo|1', marketName: 'Bet Builder · 1 + Over 2.5' }]);
  socketServer.emit('combos:settings', { enabled: false });
  await page.waitForFunction(() => window.feed.combosEnabled === false && document.body.innerText.includes('Combot janë çaktivizuar'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin')?.disabled), true);
  assert.equal(await page.$eval('#fixture-combo button', button => button.disabled), true, 'combo setting also disables real market button');
  // An ordinary multi-match accumulator remains available with combos disabled.
  await page.evaluate(() => window.slip.clearAll());
  await page.waitForFunction(() => window.slip.selections.length === 0);
  await add([fixtureSelections[0], fixtureSelections[2]]);
  await waitType('COMBO');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin')?.disabled), false);
  socketServer.emit('combos:settings', { enabled: true });
  await page.waitForFunction(() => window.feed.combosEnabled === true);
  await page.evaluate(() => window.slip.clearAll());
  await page.waitForFunction(() => window.slip.selections.length === 0);
  await add([{ ...fixtureSelections[0], outcomeId: 'native-mixed', marketName: 'Result and Total Goals' }]);
  socketServer.emit('combos:settings', { enabled: false });
  await page.waitForFunction(() => window.feed.combosEnabled === false && document.body.innerText.includes('Combot janë çaktivizuar'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin')?.disabled), true);
  socketServer.emit('combos:settings', { enabled: true });
  await page.waitForFunction(() => window.feed.combosEnabled === true && !document.body.innerText.includes('Combot janë çaktivizuar'));
  await page.evaluate(() => window.slip.clearAll());
  await page.waitForFunction(() => window.slip.selections.length === 0);
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('6.00'));
  const quoteTime = await page.evaluate(() => Date.parse(window.builderQuote.market.builderQuotedAt));
  const legUpdate = (key, line, outcomeKey, price, offset, suspended = false) => socketServer.emit('odds:update', {
    matchId: 'C', at: new Date(quoteTime + offset).toISOString(),
    markets: [{ key, line, outcomes: [{ key: outcomeKey, price, suspended }] }],
  });
  const socketBarrier = async () => {
    // Socket.IO preserves event order. Wait for a following state message so
    // rejected stale ticks have definitely been received before assertions.
    socketServer.emit('feed:state', { mode: 'idle' });
    await page.waitForFunction(() => window.feed.feedMode === 'idle');
    socketServer.emit('feed:state', { mode: 'live' });
    await page.waitForFunction(() => window.feed.feedMode === 'live');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  // The first socket price for a leg must be published, even without a previous socket tick.
  legUpdate('result', '', '1', 2.5, 1000);
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('7.50'));
  assert.equal(await page.evaluate(() => window.feed.oddsDeltas['C|result||1'].newOdds), 2.5);
  await page.click('#fixture-combo button');
  await page.waitForFunction(() => window.slip.selections.some(selection => selection.outcomeId === 'BB|C|automatic|combo'));
  assert.equal(await page.evaluate(() => window.slip.selections[0].odds), 7.5, 'button adds current derived product, not stale REST odds');
  legUpdate('total', '2.5', 'Over', 3.2, 1500);
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('8.00'));
  assert.equal(await page.evaluate(() => window.slip.selections[0].odds), 7.5, 'socket quote changes never silently accept a new betslip price');
  // A fresh REST response supersedes cached socket prices older than its quote timestamp.
  await page.evaluate(quotedAt => window.setBuilderQuote(previous => ({
    ...previous,
    market: { ...previous.market, builderQuotedAt: quotedAt,
      builderLegs: previous.market.builderLegs.map((leg, index) => ({ ...leg, odds: index ? 4 : 3 })) },
    outcome: { ...previous.outcome, odds: 12 },
  })), new Date(quoteTime + 5000).toISOString());
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('12.00'));
  legUpdate('result', '', '1', 1.8, 2500);
  await page.waitForFunction(() => window.feed.oddsDeltas['C|result||1'].newOdds === 1.8);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok((await page.$eval('#fixture-combo button', button => button.textContent)).includes('12.00'), 'old socket message cannot roll back fresh REST quote');
  legUpdate('result', '', '1', 3.5, 6000);
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('14.00'));
  // Older socket data cannot replace a newer tick even when both follow the REST quote.
  legUpdate('result', '', '1', 3.2, 5500);
  await socketBarrier();
  assert.equal(await page.evaluate(() => window.feed.oddsDeltas['C|result||1'].newOdds), 3.5, 'out-of-order socket price is discarded');
  assert.ok((await page.$eval('#fixture-combo button', button => button.textContent)).includes('14.00'));
  // An older provider suspension must not lock a current, active price either.
  legUpdate('result', '', '1', 3.2, 5500, true);
  await socketBarrier();
  assert.equal(await page.$eval('#fixture-combo button', button => button.disabled), false, 'out-of-order provider lock is discarded');
  assert.equal(await page.evaluate(() => window.slip.selections[0].odds), 7.5);
  socketServer.emit('risk:locks', { locks: { 'C|result||1': true } });
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').disabled);
  await page.$eval('#fixture-combo button', button => button.click());
  assert.equal(await page.evaluate(() => window.slip.selections.length), 1, 'risk-locked combo ignores clicks');
  socketServer.emit('risk:locks', { locks: { 'C|result||1': false } });
  await page.waitForFunction(() => !document.querySelector('#fixture-combo button').disabled);
  legUpdate('result', '', '1', 3.5, 6500, true);
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').disabled);
  legUpdate('result', '', '1', 3.5, 7000, false);
  await page.waitForFunction(() => !document.querySelector('#fixture-combo button').disabled);
  await page.click('#fixture-combo button');
  await page.waitForFunction(() => window.slip.selections.length === 0);
  await page.click('#fixture-combo button');
  await page.waitForFunction(() => window.slip.selections.length === 1);
  assert.equal(await page.evaluate(() => window.slip.selections[0].odds), 14, 'explicit removal and re-add uses latest quote');
  // A repeated source price still carries freshness after a newer REST quote.
  await page.evaluate(quotedAt => window.setBuilderQuote(previous => ({
    ...previous,
    market: { ...previous.market, builderQuotedAt: quotedAt,
      builderLegs: previous.market.builderLegs.map(leg => ({ ...leg, odds: 4 })) },
    outcome: { ...previous.outcome, odds: 16 },
  })), new Date(quoteTime + 7500).toISOString());
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('16.00'));
  legUpdate('result', '', '1', 3.5, 8000);
  await socketBarrier();
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('14.00'));
  assert.equal(await page.evaluate(() => window.feed.oddsDeltas['C|result||1'].at), quoteTime + 8000);
  assert.equal(await page.evaluate(() => window.slip.selections[0].odds), 14, 'fresh same-price ticks still do not auto-accept betslip odds');
  // Four-decimal price changes are visible and require an explicit acceptance.
  await page.evaluate(() => window.slip.clearAll());
  await page.waitForFunction(() => window.slip.selections.length === 0);
  await add([{ ...fixtureSelections[0], outcomeId: 'BB|C|tiny-change|combo', odds: 3.96, marketName: 'Bet Builder · 1 + Over 2.5' }]);
  oddsChangedResponse = { code: 'ODDS_CHANGED', message: 'Odds have changed',
    outcomeId: 'BB|C|tiny-change|combo', oldOdds: 3.96, newOdds: 3.9601 };
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin').click());
  await page.waitForSelector('[role="dialog"]');
  assert.equal(await page.$eval('[role="dialog"]', modal => [...modal.querySelectorAll('div')].some(node => node.textContent.trim() === '@3.96')), true);
  assert.equal(await page.$eval('[role="dialog"]', modal => [...modal.querySelectorAll('div')].some(node => node.textContent.trim() === '@3.9601')), true);
  assert.equal(await page.evaluate(() => window.slip.selections[0].odds), 3.96);
  await page.evaluate(() => [...document.querySelector('[role="dialog"]').querySelectorAll('button')].find(button => button.textContent.includes('Përditëso Biletën')).click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]') && window.slip.selections[0].odds === 3.9601);
  assert.equal(plainRequests.length, 1, 'accepting a quote updates the slip without automatically placing it');
  assert.ok((await page.$eval('body', body => body.innerText)).includes('396.01'), 'four-decimal price keeps the exact two-decimal money payout');
  // A three-decimal combo product stays consistent on button, slip and receipt.
  await page.evaluate(quotedAt => {
    window.slip.clearAll();
    window.setBuilderQuote(previous => ({ ...previous,
      market: { ...previous.market, builderQuotedAt: quotedAt,
        builderLegs: previous.market.builderLegs.map((leg, index) => ({ ...leg, odds: index ? 1.9 : 4.31 })) },
      outcome: { ...previous.outcome, odds: 8.189 },
    }));
  }, new Date(quoteTime + 9000).toISOString());
  await page.waitForFunction(() => document.querySelector('#fixture-combo button').textContent.includes('8.189') && window.slip.selections.length === 0);
  await page.click('#fixture-combo button');
  await page.waitForFunction(() => window.slip.selections[0]?.odds === 8.189);
  assert.equal(await page.evaluate(() => window.slip.potentialPayout), 818.9);
  assert.ok((await page.$eval('body', body => body.innerText)).includes('818.90'));
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('strong')].some(node => node.textContent.trim() === '8.189')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin').click());
  await page.waitForSelector('.ticket-print-panel');
  assert.equal(plainRequests[1].selections[0].oddsAtPlacement, 8.189);
  assert.equal(await page.$eval('.ticket-print-panel', receipt => [...receipt.querySelectorAll('strong')].filter(node => node.textContent.trim() === '8.189').length), 2);
  assert.ok((await page.$eval('.ticket-print-panel', receipt => receipt.innerText)).includes('818.90'));
  await page.click('button[aria-label="Mbyll"]');
  await page.waitForFunction(() => !document.querySelector('.ticket-print-panel'));
  const explosive = Array.from({ length: 12 }, (_, index) => [selection(`M${index}`, `M${index}1`, 2), selection(`M${index}`, `M${index}2`, 3)]).flat();
  await page.evaluate(rows => { window.slip.clearAll(); rows.forEach(row => window.slip.addSelection(row)); }, explosive);
  await page.waitForFunction(() => window.slip.columnsOverflow);
  assert.equal((await snapshot()).columns.length, 0);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Vendos Bastin')?.disabled), true);
  assert.deepEqual(failures, []);
  console.log('PASS real React betslip: System stakes/payouts, desktop/mobile, caps, retries, receipts, combo socket policies, explicit price acceptance and four-decimal quotes with two-decimal money');
} catch (error) {
  console.error('Betslip browser regression failed:', error.message, failures);
  throw error;
} finally {
  await browser?.close();
  if (socketServer) await new Promise(resolve => socketServer.close(resolve));
  await vite?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
