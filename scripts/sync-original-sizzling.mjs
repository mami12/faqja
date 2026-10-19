/**
 * Assemble the actual Pixi/Spine/Howler Sizzling Hot Deluxe client from
 * mami12/New-folder. Preserve <head>/<body attach-element> so the vendor
 * assembler loads its scripts in the correct sequence.
 *
 * Never ship the expired remote demo token or the obfuscated XHR interceptor.
 * The playURL always points at our own isolated demo-only Node endpoint.
 */
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname ?? fileURLToPath(new URL('..',import.meta.url)),'..');
const output = join(root,'web/public/casino-original/sizzling');
const scratch = await mkdtemp(join(tmpdir(),'sizzling-client-'));
try {
  const archive=join(scratch,'client.tar.gz');
  const response=await fetch('https://codeload.github.com/mami12/New-folder/tar.gz/refs/heads/main',
    {signal: AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('Novomatic client source HTTP '+response.status);
  await writeFile(archive,Buffer.from(await response.arrayBuffer()));
  const unpack=spawnSync('tar',['-xzf',archive,'-C',scratch],{encoding:'utf8'});
  if(unpack.status!==0)throw Error('Unable to unpack original client: '+unpack.stderr);
  const source=join(scratch,'New-folder-main/Sizzling Hot Deluxe');
  await mkdir(output,{recursive:true});
  for(const folder of ['scripts','libs','styles','images','audio','animations','data']){
    await cp(join(source,folder),join(output,folder),{recursive:true,force:true});
  }
  for(const file of ['manifest.json','manifest-7976fbc9075178.json']){
    await cp(join(source,file),join(output,file));
  }

  // Some source copies contain icon hrefs not present in the archived client.
  // Remove ONLY those non-game favicon/apple-icon references.
  const head=(await readFile(join(source,'head.html'),'utf8'))
    .split('\n').filter(line=>!/(?:<link|<meta)[^>]*(?:\{\$game_path\}icons\/)/.test(line)).join('\n');
  const body=await readFile(join(source,'body.html'),'utf8');
  await writeFile(join(output,'head.html'),head);
  await writeFile(join(output,'body.html'),body);

  const config={
    sessionToken:'local-demo',
    resourcesBasePath:'/app/casino-original/sizzling/',
    displayTime:false, displayCurrency:true, doRedirect:false,
    language:'en',
    playURL:'/app/api/casino/sizzling/play',
    exitURL:'', depositURL:'', debug:false,
    sentryURL:null,sentryEnv:null,logoURL:null,
  };
  // Crucial: assembler expects these attributes on the REAL head and body.
  // Inlining head/body or writing script tags before <head> breaks loading.
  const html='<!doctype html><html lang="en"><head attach-element="/app/casino-original/sizzling/head.html">'+
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<script>window.clientConfig='+JSON.stringify(config)+';</script>'+
    '<script src="/app/casino-original/sizzling/libs/assembler.js" onload="assembler.startDOMLoading()"></script>'+
    '</head><body attach-element="/app/casino-original/sizzling/body.html"></body></html>';
  await writeFile(join(output,'index.html'),html);
  console.log('Original Sizzling Pixi/Spine client copied to '+output);
}finally{await rm(scratch,{recursive:true,force:true});}
