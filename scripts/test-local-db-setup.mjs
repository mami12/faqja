import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import { createLocalPool } from '../server/local-database.mjs';
import { assertNoDatabaseMaintenance, maintenancePath } from '../server/database-location.mjs';
import { localEnvironment, switchDatabaseToLocal, backupLocalDatabase } from './local-db-setup.mjs';

const parent=resolve('tmp');await mkdir(parent,{recursive:true});
const root=await mkdtemp(join(parent,'local-setup-test-'));
const original='NODE_ENV=production\nPORT=3000\nDATABASE_URL="postgresql://test:test@127.0.0.1:1/test_only"\nJWT_SECRET=private-test-key-unchanged\nINGEST_TOKEN=private-test-ingest-unchanged\nIDLE_FEED=false\n';
const envPath=join(root,'.env');await writeFile(envPath,original);
const sequence=[];
const stop=async()=>{sequence.push('stop');assert.throws(()=>assertNoDatabaseMaintenance(root),/in progress/);};
const assertStopped=async()=>{sequence.push('port-check');};
const log=()=>{};
let restored;
try {
  const fakeFailure=async()=>{sequence.push('migrate');throw Error('Injected copy failure');};
  await assert.rejects(switchDatabaseToLocal({rootDir:root,stop,assertStopped,log,migrate:fakeFailure}),/copy failure/);
  assert.equal(await readFile(envPath,'utf8'),original,'failed migration must leave the old environment byte-for-byte unchanged');
  await assert.rejects(stat(maintenancePath(root)),error=>error.code==='ENOENT');
  sequence.length=0;
  const migrate=async({envPath:backup,targetDir})=>{
    sequence.push('migrate');assert.equal(await readFile(backup,'utf8'),original);
    assert.throws(()=>assertNoDatabaseMaintenance(root),/in progress/);
    const database=createLocalPool({dataDir:targetDir});
    try{await database.query('create table protected_balance(amount numeric(14,2)); insert into protected_balance values(123.45)');}finally{await database.end();}
    return {version:1,tables:{app_user:{count:1}},balance:'123.45'};
  };
  const result=await switchDatabaseToLocal({rootDir:root,stop,assertStopped,log,migrate});
  assert.deepEqual(sequence,['stop','port-check','migrate']);
  const changed=await readFile(envPath,'utf8'),env=parseEnv(changed);
  assert.equal(env.DB_DRIVER,'local');assert.equal(env.DATABASE_URL,'');assert.equal(env.JWT_SECRET,'private-test-key-unchanged');assert.equal(env.INGEST_TOKEN,'private-test-ingest-unchanged');
  assert.equal(env.SEED_DEFAULT_ACCOUNTS,'false');assert.equal(env.LOG_RAW_FRAMES,'false');assert.equal(env.DB_INIT_STRICT,'true');
  assert.equal(await readFile(result.backupPath,'utf8'),original);
  assert.equal((await switchDatabaseToLocal({rootDir:root,stop,assertStopped,log,migrate})).alreadyLocal,true,'repeating setup must not re-import or reset local accounts');
  const path=await backupLocalDatabase({rootDir:root,stop,assertStopped,log});
  const archive=new Blob([await readFile(path)]);
  restored=createLocalPool({dataDir:join(root,'restored'),loadDataDir:archive});
  assert.equal((await restored.query('select amount from protected_balance')).rows[0].amount,123.45);
  assert.equal((await readdir(join(root,'backups'))).length,1);
  await mkdir(join(root,'.runtime'),{recursive:true});await writeFile(maintenancePath(root),'another owner');
  await assert.rejects(switchDatabaseToLocal({rootDir:root,stop,assertStopped,log,migrate}),error=>error.code==='EEXIST');
  assert.equal(await readFile(maintenancePath(root),'utf8'),'another owner');
  assert.equal(parseEnv(localEnvironment(original+'DATABASE_URL="old-again"\n','data/database')).DATABASE_URL,'','duplicate cloud settings are removed');
  console.log('PASS local setup: stop-before-copy, protected configuration switch after verification only, preserved JWT/password settings, retry safety, maintenance lock and usable backup archive');
} finally {
  await restored?.end();
  assert.ok(resolve(root).startsWith(parent+(process.platform==='win32'?'\\':'/')));
  await rm(root,{recursive:true,force:true});
}
