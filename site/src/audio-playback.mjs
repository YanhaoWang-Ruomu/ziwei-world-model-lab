// An autoplay attempt can stay pending until a trusted user gesture.
// Never await that promise in the UI, and never infer playback from a preference.
export function createAudioPlayback({create,wantsAudio,onRunning=()=>{},onQuiet=()=>{},onState=()=>{},delay=180}){
  let context=null,revision=0,suspender=null,away=false,failed=false;
  const wanted=()=>!away&&wantsAudio();
  const state=()=>!wanted()?'quiet':failed?'retry':context?.state==='running'?'playing':'waiting';
  function changed(){
    if(context?.state==='running'&&wanted())onRunning();
    else if(!wanted())onQuiet();
    onState(state());
  }
  function request(){
    const ticket=++revision;clearTimeout(suspender);
    if(!wanted()){
      onQuiet();const old=context;
      suspender=setTimeout(()=>{if(old===context&&!wanted()&&old?.state!=='closed')old?.suspend().catch(()=>{});},delay);
      onState(state());return;
    }
    failed=false;
    try{
      if(!context||context.state==='closed'){
        context=create();const current=context;
        current.addEventListener('statechange',()=>{if(context===current)changed();});
      }
      const current=context;
      // This call also runs synchronously inside click/touch/keyboard handlers.
      const pending=current.resume();changed();
      Promise.resolve(pending).then(()=>{if(ticket===revision&&context===current)changed();},()=>{if(ticket===revision){failed=true;onState(state());}});
    }catch{failed=true;onState(state());}
  }
  return {
    request,get state(){return state();},
    leave(persisted=false){
      away=true;revision++;clearTimeout(suspender);onQuiet();
      const old=context;
      if(persisted){old?.suspend().catch(()=>{});}
      else{context=null;old?.close().catch(()=>{});}
      onState(state());
    },
    enter(){away=false;request();},
  };
}
