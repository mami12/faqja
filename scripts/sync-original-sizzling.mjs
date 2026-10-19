/**
 * Install the actual Novomatic Pixi/Spine/Howler browser client from
 * mami12/New-folder/Sizzling Hot Deluxe. It is NOT the simplified Goldsvet
 * Sizzling777WD HTML slot. Game assets are pinned to an exact source commit.
 *
 * The original assembler requires attach-element ON the head and body tags;
 * inlining those files or moving the config before <head> breaks initialization.
 * The original, opaque upstream transport/signature script is deliberately not
 * included. The local, same-origin play endpoint supports the documented JSON
 * demo protocol and does not debit user wallets.
 */
import { mkdir, mkdtemp, readFile, writeFile, cp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'web/public/casino-original/sizzling');
const sourceSha = '507f7fdb7aee883f0d78cef0b02d6c4358462c69';
const scratch = await mkdtemp(join(tmpdir(), 'sizzling-original-'));
try {
  const sourceArchive = 'https://codeload.github.com/mami12/New-folder/tar.gz/' + sourceSha;
  const response = await fetch(sourceArchive, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Cannot fetch original Sizzling client: HTTP ' + response.status);
  const archive = join(scratch, 'client.tar.gz');
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', scratch], { encoding: 'utf8' });
  if (unpack.status !== 0) throw new Error('Cannot extract Sizzling browser client: ' + unpack.stderr);
  const archiveRoots = (await readdir(scratch, { withFileTypes: true })).filter(x => x.isDirectory());
  if (archiveRoots.length !== 1) throw new Error('Unexpected source archive layout');
  const source = join(scratch, archiveRoots[0].name, 'Sizzling Hot Deluxe');
  await mkdir(output, { recursive: true });
  const dirs = ['scripts', 'libs', 'styles', 'images', 'audio', 'animations', 'data'];
  for (const folder of dirs) {
    await cp(join(source, folder), join(output, folder), { recursive: true, force: true });
  }
  for (const file of ['manifest.json', 'manifest-7976fbc9075178.json']) {
    await cp(join(source, file), join(output, file));
  }
  // Preserve real head/body and Pixi/Spine loader; avoid missing icon 404s.
  const sourceHead = await readFile(join(source, 'head.html'), 'utf8');
  const head = sourceHead.replace(/<link\b[^>]*href=["'][^"']*icons\/[^"']+["'][^>]*>\s*/gi, '');
  await writeFile(join(output, 'head.html'), head);
  await cp(join(source, 'body.html'), join(output, 'body.html'));
  const config = {
    sessionToken: 'local-demo',
    resourcesBasePath: './',
    displayTime: false,
    displayCurrency: false,
    doRedirect: false,
    language: 'en',
    playURL: '/app/api/casino/sizzlinghotdeluxe/play',
    exitURL: '',
    depositURL: '',
    debug: false,
    sentryURL: null,
    sentryEnv: null,
    logoURL: null,
  };
  // Required: attach-element on actual head/body nodes. The assembler will
  // GET head.html and body.html, replace {$game_path}, and start the real game.
  const page = '<!doctype html><html><head attach-element="./head.html">' +
    '<meta charset="utf-8"><title>Sizzling Hot Deluxe</title>' +
    '<script>window.clientConfig=' + JSON.stringify(config) + ';</script>' +
    '<script src="./libs/assembler.js" onload="assembler.startDOMLoading()"></script>' +
    '</head><body attach-element="./body.html"></body></html>';
  await writeFile(join(output, 'index.html'), page);
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  for (const asset of ['data/application.json', 'images/logo.png', 'data/reelsetConfig_hd.json',
    'data/paytableConfig-hd.json', 'data/audioConfig.json']) {
    const resolvedAsset = join(output, manifest[asset] ?? asset);
    const info = await stat(resolvedAsset);
    if (!info.isFile() || info.size < 10) throw new Error('Missing original game asset: ' + asset);
  }
  console.log('[sizzling-original] Pixi/Spine/Howler client synchronized (' +
    sourceSha.slice(0, 12) + '), ' + dirs.join(', ') + ', local demo playURL');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
