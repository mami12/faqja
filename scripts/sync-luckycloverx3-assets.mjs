/**
 * Synchronize archived Lucky Clover X3 browser assets from New-folder.
 * Run: node scripts/sync-luckycloverx3-assets.mjs
 * This does not activate real-money play or modify existing games.
 */
import {mkdtemp,writeFile,readFile,cp,readdir,rm,mkdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const scratch=await mkdtemp(join(tmpdir(),'lucky-clover-x3-'));
const destination=join(root,'web/public/casino-original/luckycloverx3');
try {
  const url='https://codeload.github.com/mami12/New-folder/tar.gz/refs/heads/main';
  const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw Error('Source archive HTTP '+response.status);
  const archive=join(scratch,'source.tar.gz');
  await writeFile(archive,Buffer.from(await response.arrayBuffer()));
  const unpack=spawnSync('tar',['-xzf',archive,'-C',scratch],{encoding:'utf8'});
  if(unpack.status!==0)throw Error('Archive extraction failed: '+unpack.stderr);
  const roots=(await readdir(scratch,{withFileTypes:true})).filter(x=>x.isDirectory());
  if(roots.length!==1)throw Error('Unexpected source archive');
  const source=join(scratch,roots[0].name,'www.livebet.com','cdn2.ctrgs.com');
  await access(join(source,'html-20200413-stable/LuckyCloverX3/app.html'));
  const originalHtml=await readFile(join(source,'html-20200413-stable/LuckyCloverX3/app.html'),'utf8');
  if(!/<html[\\s>]/i.test(originalHtml)||!/script|canvas|game/i.test(originalHtml)){
    throw Error('Original Lucky Clover X3 app.html is not a playable HTML client. Archive contains a redirect or placeholder; refusing to label it the original engine.');
  }
  await access(join(source,'html-interface-stable/1024/games/LuckyCloverX3/game/main/background.webp'));
  await mkdir(destination,{recursive:true});
  await cp(join(source,'html-20200413-stable'),join(destination,'html-20200413-stable'),{recursive:true,force:true});
  await cp(join(source,'html-interface-stable'),join(destination,'html-interface-stable'),{recursive:true,force:true});
  console.log('Lucky Clover X3 browser assets copied to '+destination);
} finally {
  await rm(scratch,{recursive:true,force:true});
}
