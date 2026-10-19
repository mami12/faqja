/**
 * Original Sizzling 777 Deluxe GWT runtime imported from the user's Goldsvet
 * repository, not the hand-built HTML demo. Pin source SHA for reproducibility.
 * Binary/minified JavaScript is fetched during Vite build (GitHub's text-only
 * contents API cannot faithfully commit a 9 MB compiled runtime).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repoRoot, 'web/public/casino-goldsvet/s777d/s777d');
const commit = '51a0e17299a7211fb9a488f71c4e1efc4712d161';
const base = 'https://raw.githubusercontent.com/mami12/goldsvet-opensource-main/' +
 commit + '/goldsvet-opensource-main/games/Sizzling777WD/';
const files = [
 {src:'s777d/s777d.nocache.js', min:6000},
 {src:'s777d/B6FA10F25A93883264359F51D1E0D3A5.cache.js',min:8500000},
 {src:'s777d/s777d-0.js',min:8500000},
 {src:'s777d/style.css',min:1000},
];
await mkdir(target,{recursive:true});
for(const file of files){
 const output=join(target,file.src.split('/').at(-1));
 let buf;
 try{buf=await readFile(output)}catch{}
 if(buf?.length>=file.min){ console.log('[s777d] cached',file.src,buf.length);continue; }
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const res=await fetch(base+file.src,{signal:AbortSignal.timeout(60000)});
   if(!res.ok)throw Error('HTTP '+res.status);
   buf=Buffer.from(await res.arrayBuffer());
   if(buf.length<file.min)throw Error('too small: '+buf.length);
   await writeFile(output,buf);
   console.log('[s777d] copied',file.src,buf.length);
   break;
  }catch(e){
   if(attempt===3)throw Error('Cannot import '+file.src+': '+e.message);
   await new Promise(r=>setTimeout(r,attempt*1000));
  }
 }
}
