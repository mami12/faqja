/**
 * Check the actual Vite /app build, not just source files. A missed copy of
 * head/body, JS bundles, atlases, Spine JSON or OGG audio must fail deployment.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'web/public/casino-original/sizzling');
const output = join(root, 'web/dist/casino-original/sizzling');
const needed = [
  'index.html', 'head.html', 'body.html', 'manifest.json',
  'libs/assembler.js', 'libs/pixi-e5441a5223.min.js',
  'libs/pixi-spine-885fb1e4b2.min.js',
  'libs/howler-e0747d16e3.core.min.js',
  'scripts/c2d-3c891074da.js',
  'scripts/game-c269ffb1da.js',
  'scripts/bundle-51f846f01a.js',
  'data/application-0113ecdf74.json',
  'audio/reelset_moving-2da16a7a33.ogg',
  'audio/reelset_reel_stop-5bd4b48edb.ogg',
  'images/logo-0328a8ad8c.png',
];
for (const dir of [source, output]) {
  for (const relative of needed) {
    const path = join(dir, relative);
    assert.ok(existsSync(path), 'Sizzling original asset missing: ' + path);
    assert.ok(statSync(path).size > 20, 'Sizzling original asset empty: ' + path);
  }
  const entry = readFileSync(join(dir,'index.html'),'utf8');
  assert.match(entry, /<head attach-element="\.\/head\.html">/,
    'Assembler requires attach-element directly on head');
  assert.match(entry, /<body attach-element="\.\/body\.html">/,
    'Assembler requires attach-element directly on body');
  assert.match(entry, /casino\/sizzlinghotdeluxe\/play/,
    'Original game must post to same-origin Node demo API');
  assert.doesNotMatch(entry, /agame-nvm\.ampxy2\.com/,
    'No upstream live casino endpoint allowed');
  const manifest = JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
  for (const key of ['images/logo.png', 'data/reelsetConfig.json',
    'data/paytableConfig.json','data/audioConfig.json',
    'images/lines_deluxe.png','images/reelset_0.webp']) {
    assert.ok(manifest[key], 'Original resource manifest has no ' + key);
    assert.ok(existsSync(join(dir, manifest[key])), 'Missing hashed resource: ' + key);
  }
}
console.log('Original Sizzling Pixi/Spine/Howler, manifest, atlas, audio & /app build verified');
