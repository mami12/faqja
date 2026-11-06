import assert from 'node:assert/strict';
import {
 marketInformationNeeds,selectedInformationEndpoints,describeJsonStructure,
 requestFootballInformation,canonicalHttpError,isFootballFixture,
 setFootballInformationMapping,inspectFootballInformation,
 createFootballInformationCollector,FOOTBALL_INFORMATION_SQL
} from '../server/stats-providers/football-information.mjs';

assert.match(FOOTBALL_INFORMATION_SQL,/create table if not exists app_football_information_map/);
assert.match(FOOTBALL_INFORMATION_SQL,/unique\(match_id,source,payload_hash\)/);
assert.equal(isFootballFixture({sport_id:1}),true);
assert.equal(isFootballFixture({sport_id:18}),true);
assert.equal(isFootballFixture({sport_tag:'football'}),true);
assert.equal(isFootballFixture({sport_id:2}),false);
assert.equal(isFootballFixture({}),false);

const goal=marketInformationNeeds([{market_name:'Next Goal (Goal 2)'},{market_name:'Player to Assist'}]);
assert.ok(goal.includes('goal'));assert.ok(goal.includes('timeline'));assert.ok(goal.includes('player'));
assert.ok(goal.includes('goalMethod')===false);
const corners=marketInformationNeeds([{market_name:'Race to 7 Corners'},
 {market_name:'Total Fouls'},{market_name:'Red Cards'}]);
for(const key of ['corner','card','statistics','timeline'])assert.ok(corners.includes(key),key);
assert.deepEqual(marketInformationNeeds([{market_name:'Full Time Result'}]),[]);
const map={aiscore_id:'j374oi0xz04sgqo',thesports01_id:'4578950',mapping_status:'ADMIN_SUPPLIED_UNVERIFIED'};
assert.deepEqual(selectedInformationEndpoints(map,[]),[]);
const endpoints=selectedInformationEndpoints(map,goal);
assert.ok(endpoints.some(x=>x.url.includes('/match/s?match_id=j374oi0xz04sgqo')));
assert.ok(endpoints.some(x=>x.url.includes('/match/mlive?')));
assert.ok(endpoints.every(x=>!x.url.includes('/match/team_stats')));
assert.ok(endpoints.every(x=>!x.url.includes('/odds_list')));
assert.ok(endpoints.every(x=>!x.url.includes('/user/info')));
assert.ok(endpoints.every(x=>!x.url.includes('/chat/')));
const statEndpoints=selectedInformationEndpoints(map,['statistics']);
assert.deepEqual(statEndpoints.map(x=>x.key),['aiscore:team_stats','thesports01:sd']);
assert.equal(canonicalHttpError(403),'AUTH_REQUIRED');
assert.equal(canonicalHttpError(429),'RATE_LIMITED');

let urls=[];
const response=(value,status=200,contentType='application/json')=>({
 ok:status>=200&&status<300,status,
 headers:{get:name=>name.toLowerCase()==='content-length'?'0':name.toLowerCase()==='content-type'?contentType:null},
 arrayBuffer:async()=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).buffer
});
const fakeFetch=async url=>{urls.push(url);return response({
 success:true,data:{events:[{type:'goal',time:42,player:'A',assist:'B'}],
 home:{corners:3},away:{corners:2}}
});};
const fetched=await requestFootballInformation(
 'https://api.aiscore.com/v1/web/api/match/s?match_id=j374oi0xz04sgqo',{request:fakeFetch});
assert.equal(fetched.ok,true);
assert.ok(fetched.shape.paths.some(x=>x.includes('events')));
assert.equal(urls.length,1);
await assert.rejects(()=>requestFootballInformation('https://evil.example.org/collect',{request:fakeFetch}),/BLOCKED_SECONDARY_HOST/);
assert.equal((await requestFootballInformation('https://api.aiscore.com/v1/web/api/match/s',{request:async()=>response({},403)})).error,'AUTH_REQUIRED');
assert.equal((await requestFootballInformation('https://api.aiscore.com/v1/web/api/match/s',{request:async()=>response('invalid')})).error,'NON_JSON_RESPONSE');

const ledgerMatch={match_id:101,sport_id:1,home:'BKMA',away:'Alashkert',start_at:new Date('2026-11-06T16:00:00Z')};
const mapSql=[];
const mapped=await setFootballInformationMapping({
 matchId:101,aiscoreId:'j374oi0xz04sgqo',thesports01Id:'4578950',actorId:'fake-admin'
},{loadMatch:async()=>ledgerMatch,runQuery:async(sql,params)=>{
 mapSql.push({sql,params});
 return {rows:[{match_id:101,aiscore_id:params[1],thesports01_id:params[2],mapping_status:'ADMIN_SUPPLIED_UNVERIFIED'}]};
}});
assert.equal(mapped.mapping_status,'ADMIN_SUPPLIED_UNVERIFIED');
assert.ok(mapSql[0].sql.includes('ADMIN_SUPPLIED_UNVERIFIED'));
await assert.rejects(()=>setFootballInformationMapping({
 matchId:101,aiscoreId:'j374oi0xz04sgqo',actorId:'admin'
},{loadMatch:async()=>({...ledgerMatch,sport_id:2})}),{status:400});
await assert.rejects(()=>setFootballInformationMapping({
 matchId:101,aiscoreId:'bad?redirect=https://wrong',actorId:'admin'
},{loadMatch:async()=>ledgerMatch}),{status:400});

const sqlCalls=[],fetchedUrls=[];
const db=async(sql,params)=>{
 sqlCalls.push({sql,params});
 if(sql.includes('from app_football_information_map where match_id'))return {rows:[map]};
 if(sql.includes('select distinct l.market_name'))return {rows:[{market_name:'Next Goal'}]};
 if(sql.startsWith('insert into app_football_information_snapshot'))return {rowCount:1};
 if(sql.startsWith('update app_football_information_map'))return {rowCount:1};
 throw Error('Unexpected SQL '+sql);
};
const result=await inspectFootballInformation(101,{
 runQuery:db,loadMatch:async()=>ledgerMatch,now:()=>Date.parse('2026-11-06T16:30:00Z'),
 request:async url=>{fetchedUrls.push(url);return response({data:{events:[{type:'goal',minute:14,team:'home'}]}});}
});
assert.equal(result.matchId,101);
assert.equal(result.mappingStatus,'ADMIN_SUPPLIED_UNVERIFIED');
assert.equal(result.status,'SAMPLE_ONLY_NOT_VERIFIED_FOR_SETTLEMENT');
assert.ok(result.sources.every(x=>x.ok&&x.shape.paths.length>0));
assert.equal(sqlCalls.filter(x=>x.sql.startsWith('insert into app_football_information_snapshot')).length,
 fetchedUrls.length);
assert.ok(fetchedUrls.every(url=>!url.includes('team_stats')));
assert.ok(sqlCalls.every(x=>!/(update app_ticket|app_user set balance|insert into app_transaction)/i.test(x.sql)));
const noMarket=await inspectFootballInformation(101,{
 runQuery:async sql=>{
  if(sql.includes('from app_football_information_map where match_id'))return {rows:[map]};
  if(sql.includes('select distinct l.market_name'))return {rows:[]};
  throw Error('No request or DB writes allowed with no primary markets');
 },loadMatch:async()=>ledgerMatch,
 request:async()=>{throw Error('Must not hit the secondary API');}
});
assert.equal(noMarket.status,'NO_PRIMARY_BETTED_MARKETS');
let hit=0;
const disabled=createFootballInformationCollector({env:{},runQuery:async()=>{throw Error('No DB request when disabled');}});
assert.equal((await disabled.tick()).enabled,false);
const enabled=createFootballInformationCollector({
 env:{AISCORE_INFO_ENABLED:'true'},now:()=>Date.parse('2026-11-06T16:30:00Z'),
 runQuery:async(sql,params)=>{
  hit++;
  if(sql.startsWith('select m.match_id'))return {rows:[]};
  throw Error('Unwanted provider request');
 }
});
assert.equal((await enabled.tick()).scanned,0);
assert.equal(hit,1);
console.log('PASS football-only secondary information: primary market gate, safe mapping, JSON diagnostics and zero financial writes');
