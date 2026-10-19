/**
 * Import the Goldsvet Sizzling777WD image sprites from the user's own
 * mami12/goldsvet-opensource-main repository at a pinned commit.
 * The HTML client is versioned in this repo. Build copies binary sprites
 * (GitHub's UTF-8 contents API cannot write PNG files).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceCommit = '51a0e17299a7211fb9a488f71c4e1efc4712d161';
const base = 'https://raw.githubusercontent.com/mami12/goldsvet-opensource-main/' +
  sourceCommit + '/goldsvet-opensource-main/games/Sizzling777WD/images/';
const names = [
  'cherry.png', 'lemon.png', 'orange.png', 'plum.png',
  'star.png', 'grapes.png', 'watermelon.png', 'seven.png',
];
// npm --prefix web runs scripts with cwd=web, NOT repository root.
 // Resolving "web/public" from cwd created the invisible "web/web/public"
 // directory in the previous release. Anchor the path to this script instead.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repoRoot, 'web/public/casino-goldsvet/sizzling/images');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
await mkdir(target, { recursive: true });
for (const name of names) {
  const destination = join(target, name);
  let current;
  try { current = await readFile(destination); } catch { /* first build */ }
  if (current?.length > 200 && current.subarray(0, 8).equals(pngSignature)) continue;
  // A missing/broken image must fail the build rather than shipping an
  // apparently successful casino with eight broken <img> elements.
  let bytes;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(base + name, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 200 || !bytes.subarray(0, 8).equals(pngSignature)) {
        throw new Error('invalid PNG data');
      }
      break;
    } catch (error) {
      if (attempt === 3) throw new Error('Goldsvet sprite ' + name + ': ' + error.message);
      await new Promise(done => setTimeout(done, attempt * 500));
    }
  }
  await writeFile(destination, bytes);
}
console.log('Goldsvet Sizzling777WD: all 8 original sprites available at ' + target);
