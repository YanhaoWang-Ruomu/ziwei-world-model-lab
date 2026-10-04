// Move the existing controls; a resize never creates duplicate state or handlers.
export function initCompactControls({beforeOpen}){
  const $=s=>document.querySelector(s),compact=matchMedia('(max-width: 1024px), (max-height: 600px), (hover: none) and (pointer: coarse)');
  const panel=$('#sky-mobile-panel'),launcher=$('#sky-mobile-launcher');
  const placements=['#sky-edge-dock','#sky-whisper','.sky-tools','#scene-sound-dock'].map(selector=>{
    const element=$(selector),anchor=document.createComment('desktop control position');
    element.before(anchor);return {element,anchor};
  });
  function close({focus=false}={}){panel.hidden=true;launcher.setAttribute('aria-expanded','false');if(focus)launcher.focus({preventScroll:true});}
  function arrange(){close();for(const {element,anchor} of placements){if(compact.matches)panel.append(element);else anchor.after(element);}}
  launcher.addEventListener('click',()=>{const open=panel.hidden;beforeOpen();if(open){panel.hidden=false;launcher.setAttribute('aria-expanded','true');$('#sky-mobile-close').focus({preventScroll:true});}});
  $('#sky-mobile-close').addEventListener('click',()=>close({focus:true}));
  $('#sky-mobile-search').addEventListener('click',()=>{close();$('#sky-search-panel').open=true;$('#sky-target').focus({preventScroll:true});});
  $('#sky-search-close').addEventListener('click',()=>{$('#sky-search-panel').open=false;launcher.focus({preventScroll:true});});
  compact.addEventListener('change',arrange);arrange();
  return {close,get compact(){return compact.matches;},get launcher(){return launcher;},get open(){return !panel.hidden;}};
}
