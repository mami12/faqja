import {randomInt} from 'node:crypto';
import {spin} from './lucky-clover-engine.mjs';
import {ctConfig,DENOMS,rows,symbol} from './clover-ct-config.mjs';
export function createCtProtocol({spinFn=spin,cardRandom=randomInt,configFn=ctConfig,initialGrid=()=>spin(5).grid,selectedLines=5,mapRound}={}){
 const initialState=()=>({credit:10000000,grid:initialGrid(),results:new Map(),round:0,pending:0,history:[]});
 const account=s=>({credit:s.credit,currency:s.currency||'FUN',currency_code:s.currency||'FUN',currency_sign:'',digits_after_decimal_separator:2,decimal_separator:'.',thousands_separator:',',freeround_limit:0});
 function run(s,commands){
  const responses=[];
  for(const c of commands){
   if(c.command==='create_session'){s.results.clear();if(s.pending){s.credit+=s.pending;s.pending=0;}s.phase='finished';}
   const cached=s.results.get(c.sequence_number);if(cached){responses.push(cached);continue;}
   let r={_req_sequence_number:c.sequence_number,_req_session_id:'local-demo',_req_command:c.command,status:{status:'ok'},icasino_messages:[],freeround_limit:0};
   try{
    switch(c.command){
     case 'create_session':Object.assign(r,{session_id:'local-demo',server_denom:{value:1},enabled_denoms:DENOMS,preferred_languages:['en_GB'],ping_interval:30,client_request_timeout:10,gameplay_mintime:0,credit_display_mode:'cash_only',use_currency_locale:1,last_game_recall_enabled:0});break;
     case 'init_game':Object.assign(r,{game_config:configFn(s.grid),show_win:'last_win',finish_game_command:'normal',resume:0,freeround_limit:0});break;
     case 'play':{
      const d=DENOMS.find(d=>d.id===c.game_denom),bet=Number(c.total_bet)*d?.cents;
      if(!d||c.lines!==selectedLines||!Number.isSafeInteger(c.line_bet)||c.line_bet<1||c.line_bet>100||c.total_bet!==c.line_bet*selectedLines||!Number.isSafeInteger(bet)||bet<5||s.credit<bet)throw new Error('Invalid bet or insufficient credit.');
      if(s.phase&&s.phase!=='finished')throw new Error('Finish the current game first.');
      const result=spinFn(bet,selectedLines);s.credit-=bet;s.grid=result.grid;s.pending=result.winCents;s.round++;s.denom=d.cents;s.phase='playing';s.nextStep=1;
      if(!mapRound){ const lines=result.wins.filter(w=>w.line).map(w=>({line_number:w.line-1,symbol:symbol(w.symbol),symbols:Array(w.count).fill(symbol(w.symbol)),symbol_count:w.count,win:w.amount/d.cents,positions:w.cells.map((_,x)=>x),subgame_win_factor:result.multiplier,paytable_factor:w.amount/(c.line_bet*d.cents*result.multiplier),wilds:[]}));
      const scatters=result.wins.filter(w=>!w.line).map(w=>({symbol:symbol(w.symbol),count:w.count,symbol_count:w.count,win:w.amount/d.cents,positions:w.cells.map(([x,y])=>[y,x]),paytable_factor:w.amount/(bet*result.multiplier),subgame_win_factor:result.multiplier,bonus_type:'none',bonus_value:0}));
      s.subgame={type:'slot_subgame',step_number:0,subgame_label:'main',reels_sets_name:'main',stop_reels:result.grid.map(r=>r.map(symbol)),result_reels:rows(result.grid),lines_win:lines,scatters_win:scatters,subgame_bonus:[],win:result.winCents/d.cents,total_win:result.winCents/d.cents,subgame_factor:result.multiplier,is_free:0,is_last:true,expanded_wilds:result.wildReels.flatMap((v,x)=>v?[{col_index:x,symbol:11,wild_position:[result.grid[x].indexOf(1),x],expanded_positions:[0,1,2].map(y=>[y,x])}]:[])};
      } r.result=mapRound?mapRound(result,c,d):[s.subgame];s.nextStep=r.result.length;if(s.pending>0){s.phase='gamble';r.result.push({type:'can_play_red_black_double',step_number:s.nextStep++,wait_for_continue:1,double_cards_history:s.history,continue_params:[{label:'double_betpart',values:['skip','all','half']}]});}r.gameplay_id=s.round;break;
     }
     case 'subgame_finished':r.result=[];break;
     case 'continue':{
      if(c.gameplay_id!==s.round||s.phase!=='gamble'||c.step_number!==s.nextStep-1)throw new Error('Invalid gamble state.');
      const params=c.continue_params||{};
      if(params.double_betpart==='skip'){s.phase='settling';r.result=[];break;}
      if(!['all','half'].includes(params.double_betpart)||!['red','black','heart','diamond','spade','clubs'].includes(params.double_key)||s.pending<=0)throw new Error('Invalid gamble choice.');
      const card=cardRandom(52),suit=Math.floor(card/13),red=suit<2;
      const suits=['diamond','heart','spade','clubs'];
      const hit=params.double_key==='red'?red:params.double_key==='black'?!red:suits[suit]===params.double_key;
      const wager=params.double_betpart==='half'?Math.floor(s.pending/s.denom/2)*s.denom:s.pending;if(wager<1)throw new Error('Gamble amount too small.');
      const factor=['red','black'].includes(params.double_key)?2:4;
      s.pending=s.pending-wager+(hit?wager*factor:0);s.history.unshift(card);s.history=s.history.slice(0,10);
      r.result=[{type:'result_red_black_double',step_number:s.nextStep++,request_params:params,double_result:hit?'win':'lost',double_win:hit?wager*factor/s.denom:0,win:s.pending/s.denom,double_cards_history:s.history}];
      if(s.pending>0)r.result.push({type:'can_play_red_black_double',step_number:s.nextStep++,wait_for_continue:1,double_cards_history:s.history,continue_params:[{label:'double_betpart',values:['skip','all','half']}]});else s.phase='settling';break;
     }
     case 'game_finished':if(c.gameplay_id!==s.round)throw new Error('Invalid game.');s.credit+=s.pending;s.pending=0;s.phase='finished';break;
     case 'poll':case 'trace':break;
     default:throw new Error('Unsupported command '+c.command);
    }
   }catch(e){r.status={status:'user_error',code:'LOCAL_DEMO',msg:e.message};}
   r.account_status=account(s);responses.push(r);if(c.sequence_number!=null){s.results.set(c.sequence_number,r);if(s.results.size>80)s.results.delete(s.results.keys().next().value);}
  }

 return responses;
 }
 return {initialState,run};
}
