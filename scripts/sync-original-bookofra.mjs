/**
 * Install the actual Novomatic Pixi/Spine/Howler "Book of Ra Deluxe" browser
 * client from mami12/New-folder (same archive as Sizzling Hot Deluxe).
 *
 * The upstream transport/signature script is deliberately removed: the local,
 * same-origin play endpoint speaks the documented JSON protocol, so no request
 * body has to be obfuscated. Assets are pinned to the same source commit.
 */
import { mkdir, mkdtemp, readFile, writeFile, cp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'web/public/casino-original/bookofra');
const sourceSha = '507f7fdb7aee883f0d78cef0b02d6c4358462c69';
const sourceFolder = 'Book of Ra Deluxe';
const scratch = await mkdtemp(join(tmpdir(), 'bookofra-original-'));
try {
  const archiveUrl = 'https://codeload.github.com/mami12/New-folder/tar.gz/' + sourceSha;
  const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error('Cannot fetch original Book of Ra client: HTTP ' + response.status);
  const archive = join(scratch, 'client.tar.gz');
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', scratch], { encoding: 'utf8' });
  if (unpack.status !== 0) throw new Error('Cannot extract Book of Ra browser client: ' + unpack.stderr);
  const archiveRoots = (await readdir(scratch, { withFileTypes: true })).filter((x) => x.isDirectory());
  if (archiveRoots.length !== 1) throw new Error('Unexpected source archive layout');
  const source = join(scratch, archiveRoots[0].name, sourceFolder);

  await mkdir(output, { recursive: true });
  const dirs = ['scripts', 'libs', 'styles', 'images', 'audio', 'animations', 'data'];
  for (const folder of dirs) {
    await cp(join(source, folder), join(output, folder), { recursive: true, force: true });
  }
  for (const file of ['manifest.json', 'manifest-ecc4347a48712.json']) {
    await cp(join(source, file), join(output, file));
  }

  // Original head/body keep the assembler contract; drop missing icon links.
  const sourceHead = await readFile(join(source, 'head.html'), 'utf8');
  const head = sourceHead.replace(/<link\b[^>]*href=["'][^"']*icons\/[^"']+["'][^>]*>\s*/gi, '');
  await writeFile(join(output, 'head.html'), head);

  const bodySource = await readFile(join(source, 'body.html'), 'utf8');
  const responsive = `<style>
html,body {margin:0;width:100%;height:100%;overflow:hidden;background:#000}
#slotCanvas {touch-action:none}
</style>`;
  await writeFile(join(output, 'body.html'), responsive + bodySource);
  await writeFile(join(output, 'responsive-desktop.html'), responsive);

  const config = {
    sessionToken: 'local-demo',
    desktop: true,
    resourcesBasePath: './',
    displayTime: false,
    displayCurrency: true,
    doRedirect: false,
    language: 'en',
    playURL: '/app/api/casino/bookofra/play',
    exitURL: '',
    depositURL: '',
    debug: false,
    sentryURL: null,
    sentryEnv: null,
    logoURL: null,
  };
  const page = '<!doctype html><html><head attach-element="./head.html">' +
    '<meta charset="utf-8"><title>Book of Ra Deluxe</title>' +
    '<link rel="icon" type="image/png" href="./images/logo.png">' +
    '<script>window.clientConfig=' + JSON.stringify(config) + ';</script>' +
    '<script src="./libs/assembler.js" onload="assembler.startDOMLoading()"></script>' +
    '</head><body attach-element="./body.html"></body></html>';
  await writeFile(join(output, 'index.html'), page);

  const realConfig = { ...config, sessionToken: 'wallet-session',
    playURL: '/app/api/casino/bookofra/real/play' };
  await writeFile(join(output, 'index-real.html'),
    page.replace(JSON.stringify(config), JSON.stringify(realConfig)));

  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  // The archived desktop build references SD Spine names but ships the HD JSON.
  for (let symbol = 0; symbol <= 9; symbol++) {
    const normal = 'animations/' + symbol + '_symbol.json';
    const hd = 'animations/' + symbol + '_symbol-hd.json';
    if (manifest[hd] && manifest[normal] !== manifest[hd]) manifest[normal] = manifest[hd];
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(output, 'manifest-ecc4347a48712.json'), JSON.stringify(manifest, null, 2));

  // Required original assets, resolved through the manifest (files are hashed).
  for (const asset of ['data/application.json', 'images/logo.png']) {
    const resolved = join(output, manifest[asset] ?? asset);
    const info = await stat(resolved);
    if (!info.isFile() || info.size < 10) throw new Error('Missing original game asset: ' + asset);
  }
  const configs = (await readdir(join(output, 'data'))).filter((f) => f.endsWith('.json'));
  if (configs.length < 25) throw new Error('Original Book of Ra data folder is incomplete');
  for (const needed of ['paytableConfig', 'spoolsConfig', 'linesConfig', 'mudConfig']) {
    if (!configs.some((f) => f.startsWith(needed))) throw new Error('Missing original config: ' + needed);
  }
  console.log('[bookofra-original] Pixi/Spine/Howler client synchronized (' +
    sourceSha.slice(0, 12) + '), ' + dirs.join(', ') + ', local playURL');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
