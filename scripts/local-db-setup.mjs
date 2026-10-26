/** Windows operator tools. Importing this file never reads .env or contacts a database. */
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, writeFile, unlink } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { localDatabaseDirectory, maintenancePath } from '../server/database-location.mjs';
import { stopWindowsServer } from './windows-server.mjs';
import { migrateFromEnv } from './local-db-migrate.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const stamp = () => new Date().toISOString().replace(/[:.]/g,'-');
async function withMaintenance(rootDir, work) {
  await mkdir(resolve(rootDir,'.runtime'),{recursive:true});
  const path=maintenancePath(rootDir),token=randomUUID(),owner=JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()});
  const file=await open(path,'wx',0o600);
  try {await file.writeFile(owner);await file.sync();} finally {await file.close();}
  try {return await work();}
  finally {if(await readFile(path,'utf8').catch(()=>null)===owner)await unlink(path);}
}
export async function assertServerPortFree(env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid server port.');
  for (const host of ['0.0.0.0','::']) await new Promise((accept,reject)=>{
    const server = net.createServer(); server.once('error',error=>{
      if (['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(error.code)) accept();
      else reject(Error('The website port is still in use. Stop the server before changing its database.'));
    });
    server.listen({port,host,exclusive:true},()=>server.close(accept));
  });
}

export function localEnvironment(source, directory) {
  const replace = new Set(['DB_DRIVER','LOCAL_DATABASE_DIR','DATABASE_URL','DB_INIT_STRICT','LOG_RAW_FRAMES','MATCH_STORE','ODDS_STORE','SEED_DEFAULT_ACCOUNTS']);
  const lines = source.split(/\r?\n/).filter(line=>!replace.has(line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=/)?.[1]));
  return lines.join('\n').trimEnd() + '\n\n# Local database: existing accounts and JWT_SECRET are preserved.\nDB_DRIVER=local\n' +
    'LOCAL_DATABASE_DIR='+JSON.stringify(directory.replaceAll('\\','/'))+'\nDATABASE_URL=\nDB_INIT_STRICT=true\nLOG_RAW_FRAMES=false\nMATCH_STORE=memory\nODDS_STORE=memory\nSEED_DEFAULT_ACCOUNTS=false\n';
}

export async function switchDatabaseToLocal(options={}) {
  const rootDir=options.rootDir||repository;
  return withMaintenance(rootDir,()=>switchStoppedDatabaseToLocal({...options,rootDir}));
}
async function switchStoppedDatabaseToLocal({rootDir=repository,stop=stopWindowsServer,migrate=migrateFromEnv,assertStopped=assertServerPortFree,log=console.log}={}) {
  const path=resolve(rootDir,'.env'), original=await readFile(path,'utf8'), env=parseEnv(original);
  if(env.DB_DRIVER==='local') return {alreadyLocal:true,directory:localDatabaseDirectory(env.LOCAL_DATABASE_DIR||'data/database',rootDir)};
  if(!env.DATABASE_URL) throw Error('The current database URL is missing. Existing accounts must be imported before switching.');
  await stop({rootDir,log}); await assertStopped(env);
  const backupPath=resolve(rootDir,'.env.cloud-backup-'+stamp()+'-'+randomUUID().slice(0,8));
  await writeFile(backupPath,original,{flag:'wx',mode:0o600});
  let directory=localDatabaseDirectory('data/database',rootDir);
  try { await stat(directory); directory=localDatabaseDirectory('data/database-'+stamp()+'-'+randomUUID().slice(0,8),rootDir); }
  catch(error) {if(error.code!=='ENOENT')throw error;}
  log('Copying existing accounts, balances and history into the local database. Keep all other servers stopped.');
  const report=await migrate({envPath:backupPath,targetDir:directory,assertStopped});
  if(await readFile(path,'utf8')!==original) throw Error('The environment file changed during migration. It was preserved; the verified local database is ready for manual configuration.');
  const next=localEnvironment(original,relative(rootDir,directory));
  const temporary=resolve(rootDir,'.env.local-switch-'+randomUUID());
  const file=await open(temporary,'wx',0o600);
  try {await file.writeFile(next);await file.sync();} finally {await file.close();}
  await rename(temporary,path);
  log('Local migration verified. The source database was not changed. Run start.bat to use the local database.');
  return {alreadyLocal:false,directory,backupPath,report};
}

export async function backupLocalDatabase(options={}) {
  const rootDir=options.rootDir||repository;
  return withMaintenance(rootDir,()=>backupStoppedLocalDatabase({...options,rootDir}));
}
async function backupStoppedLocalDatabase({rootDir=repository,stop=stopWindowsServer,assertStopped=assertServerPortFree,log=console.log}={}) {
  const env=parseEnv(await readFile(resolve(rootDir,'.env'),'utf8'));
  if(env.DB_DRIVER!=='local') throw Error('Backup requires DB_DRIVER=local.');
  const directory=localDatabaseDirectory(env.LOCAL_DATABASE_DIR||'data/database',rootDir);
  // A mistyped path must never turn a backup command into a new empty database.
  await stat(resolve(directory,'PG_VERSION'));
  await stop({rootDir,log}); await assertStopped(env);
  const {createLocalPool}=await import('../server/local-database.mjs');
  const database=createLocalPool({dataDir:directory});
  try {
    const archive=await database.backup();
    const folder=resolve(rootDir,'backups');await mkdir(folder,{recursive:true,mode:0o700});
    const path=resolve(folder,'database-'+stamp()+'-'+randomUUID().slice(0,8)+'.tgz');
    await writeFile(path,new Uint8Array(await archive.arrayBuffer()),{flag:'wx',mode:0o600});
    log('Backup saved in backups/. Run start.bat to reopen the website.');return path;
  } finally {await database.end();}
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const action=process.argv[2];
  const work=action==='migrate'?switchDatabaseToLocal():action==='backup'?backupLocalDatabase():Promise.reject(Error('Use migrate-db-local.bat or backup-db.bat.'));
  work.catch(()=>{console.error('The database operation did not finish. The previous configuration is preserved unless migration was fully verified. Keep the server stopped and check LOCAL-DATABASE.md; no private database values are printed.');process.exitCode=1;});
}
