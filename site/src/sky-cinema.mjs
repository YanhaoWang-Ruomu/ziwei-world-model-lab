import {initCompactControls} from './compact-controls.mjs';
import {SKY_PREFERENCES_KEY,parseSkyPreferences,shouldPlayOpening,TOUR_DURATION} from './sky-preferences.mjs';

export function initSkyCinema({sky,earth,journey,onReplay}){
  const $=selector=>document.querySelector(selector),body=document.body,scene=$('#cosmic-observatory');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let preferences=read(),opening=false,ready=false,home=true,finished=false,returnFocus=null;
  const compact=initCompactControls({beforeOpen(){finish();closePanels();}});
  function read(){try{return parseSkyPreferences(localStorage.getItem(SKY_PREFERENCES_KEY));}catch{return parseSkyPreferences();}}
  function save(){try{localStorage.setItem(SKY_PREFERENCES_KEY,JSON.stringify(preferences));$('#sky-preference-status').textContent='已保存在此浏览器。';}catch{$('#sky-preference-status').textContent='此浏览器无法保存偏好，本次设置仍然生效。';}}
  const chrome=()=>[$('.workspace-sidebar'),$('.site-header'),$('.cosmic-heading'),$('#sky-stage'),$('.sky-tools'),$('#sky-edge-dock'),$('#sky-whisper'),$('#sky-mobile-launcher'),$('#sky-mobile-panel')];
  function setChrome(show){
    body.classList.toggle('sky-opening',!show);body.classList.remove('sky-pending');
    chrome().forEach(el=>{if(el)el.inert=!show;});
    $('#sky-intro-controls').hidden=show;
  }
  function apply(){
    scene.dataset.landscape=preferences.landscape;
    journey.enabled(home&&preferences.landscape==='mountains');
    sky.landscape?.(preferences.landscape);sky.speed?.(preferences.speed);sky.guides?.(preferences.guides);
    earth.visible(home&&preferences.landscape==='earth');
    document.querySelectorAll('[data-sky-pref]').forEach(el=>{const value=preferences[el.dataset.skyPref];if(el.type==='checkbox')el.checked=value;else el.value=String(value);});
  }
  function finish(){
    if(finished&&!opening)return;
    opening=false;finished=true;sky.stopTour?.();journey.finish();setChrome(true);$('#sky-tour-progress').style.width='100%';
    if($('#sky-intro-controls').contains(document.activeElement))$('#sky-menu-toggle').focus({preventScroll:true});
  }
  function begin(){
    closePanels();document.querySelector('[name=projection][value=sky]').checked=true;
    $('#projection-note').textContent='两种地景的星空均参照北纬 28°、东经 112°，随所示时刻转动；底部地球为艺术构图。';
    opening=true;finished=false;setChrome(false);$('#sky-tour-progress').style.width='0%';
    sky.guides?.(false);
    journey.begin();
    if(sky.startTour)sky.startTour({duration:TOUR_DURATION,narrative:preferences.landscape==='mountains',onProgress:p=>{journey.progress(p);$('#sky-tour-progress').style.width=`${p*100}%`;},onComplete:()=>{finish();apply();}});
    else finish();
  }
  function closePanels(){
    compact.close();
    $('#sky-search-panel').open=false;$('#sky-settings-panel').hidden=true;$('#star-sheet').hidden=true;
    body.classList.remove('sky-menu-open');$('#sky-menu-toggle').setAttribute('aria-expanded','false');
    $('#sky-settings-toggle').setAttribute('aria-expanded','false');
  }
  function toggleSettings(){
    finish();const panel=$('#sky-settings-panel'),willOpen=panel.hidden;closePanels();panel.hidden=!willOpen;
    $('#sky-settings-toggle').setAttribute('aria-expanded',String(willOpen));if(willOpen){returnFocus=compact.compact?compact.launcher:$('#sky-settings-toggle');$('#sky-settings-close').focus();}
  }
  $('#sky-settings-toggle').addEventListener('click',toggleSettings);
  $('#sky-settings-close').addEventListener('click',()=>{closePanels();returnFocus?.focus();});
  $('#sky-menu-toggle').addEventListener('click',()=>{const open=!body.classList.contains('sky-menu-open');closePanels();body.classList.toggle('sky-menu-open',open);$('#sky-menu-toggle').setAttribute('aria-expanded',String(open));});
  $('.workspace-nav').addEventListener('click',e=>{if(e.target.closest('a'))closePanels();});
  $('#sky-search-panel').addEventListener('toggle',()=>{if($('#sky-search-panel').open){compact.close();$('#sky-settings-panel').hidden=true;$('#star-sheet').hidden=true;body.classList.remove('sky-menu-open');$('#sky-menu-toggle').setAttribute('aria-expanded','false');$('#sky-settings-toggle').setAttribute('aria-expanded','false');}});
  $('#sky-intro-skip').addEventListener('click',()=>{finish();apply();});
  document.querySelectorAll('[data-sky-pref]').forEach(el=>el.addEventListener('change',()=>{
    preferences[el.dataset.skyPref]=el.type==='checkbox'?el.checked:el.dataset.skyPref==='speed'?Number(el.value):el.value;
    preferences=parseSkyPreferences(preferences);save();apply();
  }));
  document.querySelectorAll('[data-sky-replay]').forEach(el=>el.addEventListener('click',()=>{
    onReplay();home=true;apply();if(reduced.matches){finish();$('#sky-preference-status').textContent='系统已启用减少动态效果，开场保持静止。';return;}if(ready)begin();
  }));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&home){if(opening){finish();apply();}else{const hadPanel=compact.open||!$('#sky-settings-panel').hidden||!$('#star-sheet').hidden||$('#sky-search-panel').open||body.classList.contains('sky-menu-open');closePanels();if(hadPanel)(compact.compact?compact.launcher:$('#sky-settings-toggle')).focus();}}});
  reduced.addEventListener('change',()=>{if(reduced.matches){finish();apply();}});
  window.addEventListener('storage',e=>{if(e.key===SKY_PREFERENCES_KEY){preferences=read();apply();}});
  apply();
  // Loading or a unavailable star catalogue must never lock navigation.
  const fallback=setTimeout(()=>{if(!ready)finish();},8000);
  return {
    ready(){ready=true;clearTimeout(fallback);if(!finished&&shouldPlayOpening(preferences,{reduced:reduced.matches,home}))begin();else finish();},
    fail(){ready=true;clearTimeout(fallback);finish();},
    interrupt(){if(opening){finish();apply();}},
    sceneChange(){if(opening){finish();apply();}closePanels();},
    selected(){finish();compact.close();$('#sky-search-panel').open=false;$('#sky-settings-panel').hidden=true;$('#sky-settings-toggle').setAttribute('aria-expanded','false');$('#star-sheet').hidden=false;$('#star-sheet-close').focus({preventScroll:true});},
    view(value){home=value;if(!value){finish();closePanels();}apply();},
  };
}
