/**
 * Import the Goldsvet Sizzling777WD image sprites from the user's own
 * mami12/goldsvet-opensource-main repository at a pinned commit.
 * The HTML client is versioned in this repo. Build copies binary sprites
 * (GitHub's UTF-8 contents API cannot write PNG files).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const sourceCommit = '51a0e17299a7211fb9a488f71c4e1efc4712d161';
const base = 'https://raw.githubusercontent.com/mami12/goldsvet-opensource-main/' +
  sourceCommit + '/goldsvet-opensource-main/games/Sizzling777WD/images/';
const names = [
  'cherry.png', 'lemon.png', 'orange.png', 'plum.png',
  'star.png', 'grapes.png', 'watermelon.png', 'seven.png',
];
const target = resolve('web/public/casino-goldsvet/sizzling/images');
await mkdir(target, { recursive: true });
for (const name of names) {
  const destination = join(target, name);
  let current;
  try { current = await readFile(destination); } catch { /* first build */ }
  if (current?.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) continue;
  const response = await fetch(base + name);
  if (!response.ok) throw new Error('Goldsvet sprite ' + name + ': HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw new Error('Goldsvet sprite ' + name + ' is not a valid PNG');
  }
  await writeFile(destination, bytes);
}
console.log('Goldsvet Sizzling777WD: all 8 original sprites available');
