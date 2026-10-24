/** Limits apply to the complete paid spin, never to each payline or free spin. */
export const CASINO_MIN_STAKE = 0.20;
export const CASINO_MAX_STAKE = 5000;
export const CASINO_MIN_CENTS = 20;
export const CASINO_MAX_CENTS = 500000;

const invalid = () => Object.assign(new Error('Casino stake must be between 0.20 and 5000 ALL'), {status:400});
export function casinoStakeCents(amount) {
  const value=Number(amount), cents=Math.round(value*100);
  if(!Number.isFinite(value)||!Number.isSafeInteger(cents)||Math.abs(value*100-cents)>1e-6||cents<CASINO_MIN_CENTS||cents>CASINO_MAX_CENTS)throw invalid();
  return cents;
}

export const CT_LINE_BETS = [1,2,3,4,5,6,8,10,12,15,20,24,30,40,50,60,80,100,200,250,500,1000,2000,2500,5000,10000,12500,20000,25000];
export function walletCtDenoms(lines) {
  // One credit unit keeps every native menu combination inside the total limits.
  // Twenty-five Viking lines require a sub-cent unit; the wallet is still cents.
  if(lines===25)return [{id:1,label:'0.008',cents:0.8}];
  if(lines===5)return [{id:1,label:'0.04',cents:4}];
  throw new Error('Unsupported casino line count');
}

const PIXI_BETS = [1,2,3,5,10,20,30,50,100];
export function walletPixiRanges(lines) {
  if(lines!==5&&lines!==10)throw new Error('Unsupported casino line count');
  const units=[CASINO_MIN_STAKE/lines,.5,1,2,5,10];
  return {
    denomination:Object.fromEntries(units.map((unit,index)=>[index,unit])),
    bet:Object.fromEntries(units.map(unit=>[unit,PIXI_BETS.filter(bet=>{
      const cents=Math.round(bet*unit*lines*100);
      return cents>=CASINO_MIN_CENTS&&cents<=CASINO_MAX_CENTS;
    })])),
  };
}

export function validateWalletPixiBet(bet,denomination,lines) {
  const ranges=walletPixiRanges(lines);
  if(!Object.values(ranges.denomination).includes(denomination)||!ranges.bet[denomination]?.includes(bet))throw invalid();
  return casinoStakeCents(bet*denomination*lines)/100;
}

/** The archived AGT native selector consumes full_bets directly. */
export function walletAgtBets(fullBets) {
  return Object.fromEntries(Object.entries(fullBets).map(([lines,bets])=>[lines,
    [...new Set([CASINO_MIN_STAKE,...bets])].filter(amount=>Number.isFinite(amount)&&amount>=CASINO_MIN_STAKE&&amount<=CASINO_MAX_STAKE).sort((a,b)=>a-b),
  ]));
}
