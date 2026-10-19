/**
 * Copies the unmodified Novomatic browser client from mami12/New-folder into the
 * sportsbook's same-origin Vite public directory. No substitute slot engine.
 * The upstream demo/session endpoint is external and may reject expired tokens.
 */
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'web/public/casino-original/sizzling');
const scratch = await mkdtemp(join(tmpdir(), 'sizzling-original-'));
try {
  const archive = join(scratch, 'source.tar.gz');
  const response = await fetch('https://codeload.github.com/mami12/New-folder/tar.gz/refs/heads/main');
  if (!response.ok) throw new Error('Cannot download original game assets: HTTP ' + response.status);
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', scratch], { encoding: 'utf8' });
  if (unpack.status !== 0) throw new Error('tar failed: ' + unpack.stderr);
  const source = join(scratch, 'New-folder-main/Sizzling Hot Deluxe');
  await mkdir(output, { recursive: true });
  for (const folder of ['scripts', 'libs', 'styles', 'images', 'audio', 'animations', 'data']) {
    await cp(join(source, folder), join(output, folder), { recursive: true, force: true });
  }
  for (const file of ['manifest.json', 'manifest-7976fbc9075178.json']) {
    await cp(join(source, file), join(output, file));
  }
  // Original head and body, with the original engine scripts, Pixi runtime,
  // animations, sound files and hashed manifest. Only resource base paths change.
  const head = (await readFile(join(source, 'head.html'), 'utf8'))
    .replaceAll('{$game_path}', './');
  const body = await readFile(join(source, 'body.html'), 'utf8');
  const sourceEntry = await readFile(join(source, 'sizzlinghotdeluxe.html'), 'utf8');
  const configMatch = sourceEntry.match(/window\\.gameConfig\\s*=\\s*\\{[\\s\\S]*?\\};/);
  // Keep the upstream configuration if present, including its original demo URL.
  // Never silently replace it with a locally fabricated outcome service.
  const config = configMatch?.[0] ?? '';
  const html = '<!doctype html><html><head>' + head +
    '<base href="./"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>' +
    config + '</head><body>' + body + '</body></html>';
  await writeFile(join(output, 'index.html'), html);
  console.log('Original Sizzling Hot Deluxe browser engine copied to ' + output);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
