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
  // Original mobile components were not shipped in this archive. Force the
  // existing desktop Pixi component tree on narrow touch screens instead.
  // The canvas remains responsive via CSS scaling; no substitute art/math.
  const bodySource = await readFile(join(source, 'body.html'), 'utf8');
  await writeFile(join(output, 'body.html'), bodySource);
  const responsive = `<style>
html,body,#container,.app-container,.canvas-box {margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000}
#slotCanvas {display:block;max-width:100%;max-height:100%;touch-action:manipulation}
@media (max-width:700px) { .app-container {width:100vw!important;height:100dvh!important} }
</style>
<script>
(function(){
  // Device detection in the old client selects missing componentsMobile.json.
  // Advertise desktop layout before game scripts run, then scale its canvas.
  var root=document.documentElement;
  root.classList.add('desktop');
  root.classList.remove('mobile');
  function resize(){
    var canvas=document.getElementById('slotCanvas');
    if(!canvas)return;
    var box=canvas.parentElement;
    if(!box)return;
    box.style.width='100vw';
    box.style.height='100dvh';
    box.style.display='flex';
    box.style.alignItems='center';
    box.style.justifyContent='center';
    canvas.style.width='100%';
    canvas.style.height='100%';
    canvas.style.objectFit='contain';
  }
  window.addEventListener('resize',resize);
  document.addEventListener('DOMContentLoaded',resize);
  setInterval(resize,1200);
})();
</script>`;
  await writeFile(join(output,'responsive-desktop.html'),responsive);
  await writeFile(join(output,'body.html'),responsive + bodySource);
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
    '<link rel="icon" type="image/png" href="./images/logo-0328a8ad8c.png">' +
    '<script>window.clientConfig=' + JSON.stringify(config) + ';</script>' +
    '<script src="./libs/assembler.js" onload="assembler.startDOMLoading()"></script>' +
    '</head><body attach-element="./body.html"></body></html>';
  await writeFile(join(output, 'index.html'), page);
  // Same original media, animation, Pixi/Spine and sound. Only the server URL
  // changes; financial outcomes are supplied by the authenticated ledger.
  const realConfig = { ...config, sessionToken: 'wallet-session',
    playURL: '/app/api/casino/sizzlinghotdeluxe/real/play' };
  const realPage = page.replace(JSON.stringify(config), JSON.stringify(realConfig));
  await writeFile(join(output, 'index-real.html'), realPage);
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  // The archived desktop reelset resource references SD Spine filenames, but
  // only HD Spine animations were committed. Point the original resource names
  // at the existing HD JSON rather than serving missing files (99% stall).
  for (let symbol = 0; symbol <= 7; symbol++) {
    const normal = 'animations/' + symbol + '_symbol.json';
    const hd = 'animations/' + symbol + '_symbol-hd.json';
    const hdFile = manifest[hd];
    if (!hdFile) throw new Error('Missing original HD Spine manifest entry: ' + hd);
    await stat(join(output, hdFile));
    manifest[normal] = hdFile;
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(output, 'manifest-7976fbc9075178.json'), JSON.stringify(manifest, null, 2));
  // The original archive includes desktop assets but not its mobile component
  // tree. Preserve the original desktop gameplay and select that component
  // tree on every device, including phones.
  const gamePath = join(output, 'scripts/game-c269ffb1da.js');
  const gameCode = await readFile(gamePath, 'utf8');
  const mobileSelection = 'r+=c2d.env.isDesktop?';
  if (!gameCode.includes(mobileSelection)) throw new Error('Sizzling component selector changed upstream');
  await writeFile(gamePath, gameCode.replace(mobileSelection, 'r+=true?'));
  // Do not reject a working desktop build because the upstream manifest also
  // advertises mobile-only or optional assets missing from its own archive.
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
