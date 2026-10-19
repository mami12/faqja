/**
 * Deluxe cabinet controls surrounding the playable Goldsvet Sizzling777WD
 * browser demo. The Goldsvet PHP reel strips and 20 payout paths are already
 * inlined in index.html; this controls presentation only, never sports funds.
 *
 * Loaded AFTER the Goldsvet inline script to bind its existing demo engine.
 */
(() => {
  'use strict';
  const colours = [
    '#efaa20','#382cff','#f04336','#973be9','#a2e913',
    '#8f46e6','#12cfeb','#f4d340','#4bdd5e','#d84847',
    '#f8a52b','#214ae9','#f24886','#2ef3cf','#a3e62e',
    '#9140e9','#f2c33e','#56ef62','#f13e56','#faca4a'
  ];
  const status = document.getElementById('status-text');
  const left = document.getElementById('payline-left');
  const right = document.getElementById('payline-right');
  const chips = document.getElementById('bet-chip-list');
  const reset = document.getElementById('btn-reset');
  let preview = -1;
  let winning = [];
  let spins = 0;
  const lineMarkers = [];
  const chipButtons = [];

  function trace(coords, colour, thickness) {
    if (!coords?.length) return;
    const w = paylineCanvas.width/5;
    const h = paylineCanvas.height/3;
    pCtx.save();
    pCtx.beginPath();
    pCtx.lineWidth = thickness;
    pCtx.lineCap = 'round';
    pCtx.lineJoin = 'round';
    pCtx.strokeStyle = colour;
    pCtx.shadowColor = colour;
    pCtx.shadowBlur = 11;
    coords.forEach((point,i) => {
      const x=(point.col+0.5)*w;
      const y=(point.row+0.5)*h;
      if(i===0)pCtx.moveTo(x,y); else pCtx.lineTo(x,y);
    });
    pCtx.stroke();
    pCtx.restore();
  }
  function redraw() {
    pCtx.clearRect(0,0,paylineCanvas.width,paylineCanvas.height);
    if(preview>=0) {
      trace(PAYLINES[preview].map((row,col)=>({row,col})),colours[preview],5);
    } else {
      winning.filter(line=>line.lineIndex>=0).forEach(line=>{
        trace(line.coords,colours[line.lineIndex],5);
      });
    }
    lineMarkers.forEach((button,index)=>{
      button.setAttribute('aria-pressed',String(preview===index));
      button.classList.toggle('winning',winning.some(line=>line.lineIndex===index));
    });
  }
  for(let i=0;i<PAYLINES.length;i++){
    const button=document.createElement('button');
    button.type='button';
    button.className='line-star';
    button.textContent='★';
    button.style.setProperty('--star-color',colours[i]);
    button.title='Linja '+(i+1);
    button.setAttribute('aria-label','Shfaq linjën e pagesës '+(i+1));
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      if(isSpinning)return;
      preview=preview===i?-1:i;
      redraw();
      status.textContent=preview>=0?'LINJA '+(i+1)+' NGA 20':'PRESS SPIN TO WIN';
    });
    (i<10?left:right).append(button);
    lineMarkers.push(button);
  }
  BET_STEPS.forEach((stake,i)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='bet-chip';
    button.textContent=Number(stake).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    button.title='Bast '+button.textContent+' kredite demo';
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      if(isSpinning)return;
      betIndex=i;
      audio.betChange();
      updateDisplays();
    });
    chips.append(button);
    chipButtons.push(button);
  });
  function busy(on){
    chipButtons.forEach(b=>{b.disabled=on;});
    btnBetMinus.disabled=on;
    btnBetPlus.disabled=on;
    btnBetMax.disabled=on;
    reset.disabled=on;
  }
  const originalUpdate = updateDisplays;
  updateDisplays = function() {
    originalUpdate();
    dispBalance.textContent=balance.toLocaleString('en-US',{
      minimumFractionDigits:2,maximumFractionDigits:2
    });
    chipButtons.forEach((b,i)=>{
      b.setAttribute('aria-pressed',String(i===betIndex));
    });
  };
  const originalHighlight = highlightWins;
  highlightWins = function(lines) {
    winning = lines;
    preview = -1;
    originalHighlight(lines);
    redraw();
  };
  const originalClear = clearWinHighlights;
  clearWinHighlights = function() {
    originalClear();
    preview=-1;
    winning=[];
    redraw();
  };
  const originalSpin = spin;
  spin = function() {
    if(isSpinning)return;
    if(balance < BET_STEPS[betIndex]) {
      isAuto=false;
      btnAuto.setAttribute('aria-pressed','false');
      status.textContent='KREDITE TË PAMJAFTUESHME · RIMBUSH DEMO';
      return;
    }
    originalSpin();
    if(isSpinning){
      spins++;
      busy(true);
      status.textContent='GOOD LUCK · DUKE RROTULLUAR';
    }
  };
  const originalFinish = finishSpin;
  finishSpin = function(results) {
    originalFinish(results);
    busy(false);
    btnAuto.setAttribute('aria-pressed',String(isAuto));
    const won=Number(dispWin.textContent)||0;
    status.textContent=won>0
      ? 'FITOVE '+won.toLocaleString('en-US',{minimumFractionDigits:2})
      : 'PRESS SPIN TO WIN';
  };
  reset.addEventListener('click',()=>{
    if(isSpinning)return;
    isAuto=false;
    btnAuto.setAttribute('aria-pressed','false');
    btnAuto.style.background='';
    balance=100000;
    dispWin.textContent='0.00';
    clearWinHighlights();
    updateDisplays();
    status.textContent='100,000 KREDITE DEMO';
    audio.click();
  });
  btnAuto.addEventListener('click',()=>{
    btnAuto.setAttribute('aria-pressed',String(isAuto));
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)btnAuto.setAttribute('aria-pressed','false');
  });
  document.getElementById('btn-fullscreen').addEventListener('click',async()=>{
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else await document.getElementById('game-wrapper').requestFullscreen();
    } catch(_error) { /* fullscreen can be blocked by the parent browser */ }
  });
  document.getElementById('btn-exit').addEventListener('click',()=>{
    if(window.parent !== window) {
      window.parent.postMessage({type:'sportsbook:casino:exit'},location.origin);
    } else {
      location.href='../../../casino';
    }
  });
  addEventListener('resize',()=>requestAnimationFrame(redraw));
  window.GoldsvetDeluxeDemo = Object.freeze({
    get lineCount(){return PAYLINES.length;},
    get reelStripLengths(){return REEL_STRIPS.map(r=>r.length);},
    get spinCount(){return spins;},
    get selectedBet(){return BET_STEPS[betIndex];}
  });
  updateDisplays();
  redraw();
})();
