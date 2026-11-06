import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {providerTimeline} from '../server/live-event-timeline.mjs';
import {normalizeLiveFrame} from '../server/ledger/live-observation-store.mjs';

const raw=Array.from({length:12},(_,i)=>({
 id:'c'+i,type:'corner_kick',team:i%2===0?1:2,gt:i*6+1
}));
const displayed=providerTimeline('123',raw);
assert.equal(displayed.length,12,'Provider timeline retains all 12 events, never last eight');
assert.equal(displayed[0].minute,1);
assert.equal(displayed.at(-1).minute,67);
const frame=normalizeLiveFrame({
 Match:{Score:'0:0',MatchTimeExtended:'79:00',CornersTeam1:6,CornersTeam2:6},
 TimeLines:raw
});
assert.equal(frame.events.filter(e=>e.type==='corner').length,12,
 'All first-to-last corners remain in the evidence used for ticket grading');
assert.equal(frame.coverage.cornerThrough,79,'All twelve corners reconcile to scoreboard');
const ui=readFileSync(new URL('../web/src/components/Tracker/PitchTracker.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/src/styles/zshop.css',import.meta.url),'utf8');
assert.doesNotMatch(ui,/\.slice\(0,\s*8\)/,
 'Eight visible rows must not delete old events from the match-history UI');
assert.match(ui,/className="zshop-tracker-events" role="region" tabIndex=\{0\}/,
 'History must be a scrollable, keyboard-accessible region');
assert.match(css,/\.zshop-tracker-events\{[^}]*max-height:[^}]*overflow-y:auto/,
 'Show approximately eight entries and allow scrolling all the way to minute one');
console.log('PASS Zizobet full event chronology; eight-row scroll viewport does not cut settling evidence');
