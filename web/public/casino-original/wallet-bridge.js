// Transport/fullscreen adapter only: provider game UI and math stay unchanged.
(()=>{
 const config=window.casinoWalletConfig||{};
 const embedded=window.parent!==window;
 const notify=type=>{if(embedded)window.parent.postMessage({type},window.location.origin);};
 if(embedded){
  const fullscreen=()=>{notify('casino:fullscreen');return Promise.resolve();};
  for(const name of ['requestFullscreen','webkitRequestFullscreen','webkitRequestFullScreen','requestFullScreen','mozRequestFullScreen']){
   try{Object.defineProperty(Element.prototype,name,{configurable:true,writable:true,value:fullscreen});}catch{}
  }
  // Provider Exit links are handled by the same visible Back control.
  window.addEventListener('message',event=>{
   if(event.source===window&&event.origin===location.origin&&event.data?.type==='casino:exit')notify('casino:exit');
  });
 }
 if(config.agtApi){
  const open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url,...rest){
   const target=new URL(String(url),document.baseURI);
   if(target.origin===location.origin&&target.pathname==='/app/api/casino/agt/dinit.php'){
    target.pathname=config.agtApi;
    if(['spin','freespin','double','save'].includes(target.searchParams.get('action'))){
     target.searchParams.set('request_id',crypto.randomUUID());
    }
    url=target.href;
   }
   return open.call(this,method,url,...rest);
  };
 }
})();
