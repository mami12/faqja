import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const artSource = read('web/src/pages/casinoOriginalArt.ts');
const engineSource = read('web/src/pages/casinoEngine.ts');
const pageSource = read('web/src/pages/CasinoPage.tsx');

const extract = name => {
  const at = artSource.indexOf('export const ' + name);
  assert.ok(at >= 0, name + ': missing');
  const open = artSource.indexOf('{', artSource.indexOf('=', at));
  // Extract via a small balanced matcher that ignores no strings because braces never appear
  // inside the static asset paths.
  let n = 0, end = -1;
  for (let i = open; i < artSource.length; i += 1) {
    if (artSource[i] === '{') n++;
    else if (artSource[i] === '}' && --n === 0) { end = i; break; }
  }
  assert.ok(end > open, name + ': invalid mapping');
  return vm.runInNewContext('(' + artSource.slice(open, end + 1) + ')', Object.create(null), { timeout: 2000 });
};

const ids = [
  'aladdin', 'big-bass', 'book-ra', 'five-reel', 'gates',
  'jewels-ra', 'atlantis', 'sizzling', 'anubis'
];
const symbols = extract('ORIGINAL_SYMBOLS');
const backgrounds = extract('ORIGINAL_BACKGROUNDS');
const logos = extract('ORIGINAL_LOGOS');

let imageCount = 0;
function checkImage(relative, label) {
  assert.match(relative, /^[a-z0-9-]+\/[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp|avif)$/i, label);
  const local = path.join(root, 'web/public/casino-assets', relative);
  assert.ok(existsSync(local), label + ': missing ' + relative);
  imageCount += 1;
}

for (const id of ids) {
  assert.ok(Array.isArray(symbols[id]), id + ': no original symbol artwork');
  assert.equal(symbols[id].length, 8, id + ': every index must have original game art');
  checkImage(backgrounds[id], id + ' background');
  if (logos[id]) checkImage(logos[id], id + ' logo');
  for (const [i, sprite] of symbols[id].entries()) {
    checkImage(sprite.src, id + ' symbol ' + i);
    if (sprite.rect) {
      const { x, y, w, h, atlasW, atlasH } = sprite.rect;
      assert.ok([x,y,w,h,atlasW,atlasH].every(Number.isFinite), id + ' invalid rectangle');
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0, id + ' non-positive sprite geometry');
      assert.ok(x + w <= atlasW && y + h <= atlasH,
        id + ' sprite crop outside atlas (' + i + ')');
    }
  }
}
for (const id of ids) {
  assert.ok(engineSource.includes("id: '" + id + "'"), id + ': game missing in engine');
}
assert.ok(!pageSource.includes('>{symbol}</span>'), 'Reel has emoji fallback');
assert.ok(!pageSource.includes('>🪙</span>'), 'Hold-and-respin has emoji fallback');
assert.ok(pageSource.includes('<OriginalReelSymbol'), 'Reels not connected to original atlas renderer');

console.log('Casino graphics: 9 games, 8 original sprite slots each, ' + imageCount +
  ' checked local image references.');
