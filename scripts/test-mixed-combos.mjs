import assert from 'node:assert/strict';
import { isResultTotalMarket, isTotalBttsMarket, isFirstHalfResultBtts, parseResultTotal, parseTotalBtts, gradeMixedTotal } from '../server/ledger/mixed-combos.mjs';
import { isResultBttsMarket, parseResultBttsOutcome, gradeResultBtts } from '../server/ledger/result-btts.mjs';
import { gradeLine } from '../server/ledger/settler.mjs';
const home = 'Lyon', away = 'Crystal Palace';
assert.ok(isResultTotalMarket('Result and total'));
assert.ok(isTotalBttsMarket('Total and both teams to score'));
assert.ok(isResultBttsMarket('Result and both teams to score'));
assert.ok(isFirstHalfResultBtts('1st half. Result and both teams to score'));
assert.ok(isResultBttsMarket('1st half. Result and both teams to score'));
for (const label of [
  'Crystal Palace And Over 2.5', 'Crystal Palace And Under 2.5',
  'Draw And Over 2.5', 'Draw And Under 2.5',
  'Lyon And Over 2.5', 'Lyon And Under 2.5',
]) assert.ok(parseResultTotal(label, home, away), label);
for (const label of [
  'Over 2.5 And No', 'Over 2.5 And Yes',
  'Under 2.5 And No', 'Under 2.5 And Yes',
]) assert.ok(parseTotalBtts(label), label);
for (const label of [
  'Both Teams Not To Score and Draw',
  'Both Teams To Score And Draw',
  'Crystal Palace And Both To Score',
  'Crystal Palace To Nil',
  'Lyon And Both To Score',
  'Lyon To Nil',
]) assert.ok(parseResultBttsOutcome(label, home, away), label);
assert.deepEqual(parseResultBttsOutcome('Crystal Palace To Nil', home, away), {result:'2',bothScore:false});
assert.deepEqual(parseResultBttsOutcome('Lyon To Nil', home, away), {result:'1',bothScore:false});
assert.deepEqual(parseResultBttsOutcome('Crystal Palace And Both To Score', home, away), {result:'2',bothScore:true});
assert.equal(gradeResultBtts(parseResultBttsOutcome('Lyon To Nil', home, away), 2, 0), 'WON');
assert.equal(gradeResultBtts(parseResultBttsOutcome('Lyon To Nil', home, away), 2, 1), 'LOST');
assert.equal(gradeMixedTotal('Result and total', parseResultTotal('Lyon And Over 2.5', home, away), 2, 1), 'WON');
assert.equal(gradeMixedTotal('Result and total', parseResultTotal('Lyon And Under 2.5', home, away), 2, 1), 'LOST');
assert.equal(gradeMixedTotal('Total and both teams to score', parseTotalBtts('Over 2.5 And Yes'), 2, 1), 'WON');
assert.equal(gradeMixedTotal('Total and both teams to score', parseTotalBtts('Under 2.5 And Yes'), 1, 1), 'WON');
assert.equal(gradeMixedTotal('Total and both teams to score', parseTotalBtts('Under 2.5 And No'), 1, 0), 'WON');
assert.equal(parseResultTotal('Unknown And Over 2.5', home, away), null);
assert.equal(parseTotalBtts('Over 2.5 And Maybe'), null);
const result={home_team:home,away_team:away,home_score:2,away_score:1};
const line=(market_name,outcome_name)=>({market_name,outcome_name,outcome_key:'unknown',line:''});
assert.equal(gradeLine(line('Result and total','Lyon And Over 2.5'), result), 'WON');
assert.equal(gradeLine(line('Total and both teams to score','Over 2.5 And Yes'), result), 'WON');
assert.equal(gradeLine(line('Result and both teams to score','Lyon And Both To Score'), result), 'WON');
assert.equal(gradeLine(line('1st half. Result and both teams to score','Lyon And Both To Score'), result), 'VOID');
console.log('All four provider mixed market contract regressions passed.');
