/**
 * Fail a release unless the exact Goldsvet HTML plus all eight reel symbols
 * were copied into the Vite output served by the /app static middleware.
 * Checking source presence alone missed the web/web/public regression.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(repoRoot,'web/public/casino-goldsvet/sizzling');
const distDir = join(repoRoot,'web/dist/casino-goldsvet/sizzling');
const images = [
  'cherry.png','lemon.png','orange.png','plum.png',
  'star.png','grapes.png','watermelon.png','seven.png',
];
const pngHeader = Buffer.from([137,80,78,71,13,10,26,10]);
for (const dir of [srcDir,distDir]) {
  const html = join(dir,'index.html');
  assert.ok(existsSync(html), 'Goldsvet HTML missing from '+html);
  const markup = readFileSync(html,'utf8');
  assert.match(markup,/const PAYLINES/,'Goldsvet original payline implementation missing');
  assert.match(markup,/const REEL_STRIPS/,'Goldsvet original reel implementation missing');
  for (const name of images) {
    const path = join(dir,'images',name);
    assert.ok(existsSync(path), 'Missing Goldsvet image: '+path);
    const image=readFileSync(path);
    assert.ok(image.length>200&&image.subarray(0,8).equals(pngHeader),
      'Invalid Goldsvet PNG in Vite output: '+path);
  }
}
console.log('Goldsvet release verified: index.html and all 8 original images in source and /app build output');
