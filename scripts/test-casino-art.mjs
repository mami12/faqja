import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const page=read('web/src/pages/CasinoPage.tsx');
const original=read('scripts/sync-original-sizzling.mjs');
const web=JSON.parse(read('web/package.json'));
const demo=read('server/casino/sizzling-demo.mjs');
const real=read('server/casino/sizzling-real.mjs');

// No generic slots or imitation frontend may appear in the casino catalogue.
assert.ok(!page.includes('GAMES.map('),'other slot games must not be shown');
assert.ok(!page.includes('casinoEngine'),'no generic casino engine');
assert.ok(page.includes('CasinoOriginalWallet'),'wallet must mount original Sizzling');
assert.ok(page.includes('casino-original/sizzling/index.html'),'demo must mount original Sizzling');
assert.ok(page.includes('CasinoFullscreen'),'mobile fullscreen required');
assert.ok(original.includes('index-real.html'),'production client build missing');
assert.ok(original.includes('scripts') && original.includes('images') &&
  original.includes('audio') && original.includes('animations'),'original assets must be copied');
assert.ok(original.includes('<head attach-element="./head.html">'));
assert.ok(original.includes('<body attach-element="./body.html">'));
assert.ok(original.includes("'/app/api/casino/sizzlinghotdeluxe/play'"));
assert.ok(real.includes('placeCasinoSpin'),'casino wallet must have server-side settlement');
assert.ok(demo.includes('gradeGrid'),'demo must use real reel paylines');
assert.ok(web.scripts.build.includes('sync-original-sizzling.mjs'));
assert.ok(web.scripts.build.includes('verify-original-sizzling.mjs'));
assert.ok(web.scripts.dev.includes('sync-original-sizzling.mjs'));
console.log('Only Sizzling Hot Deluxe: original Pixi/Spine/Howler build, audio, graphics, paylines and wallet verified');
