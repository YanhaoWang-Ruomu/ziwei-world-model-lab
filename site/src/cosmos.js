import {visibleLayerKeys} from './chart-layer-selection.mjs';
import {initTechniqueScan} from './technique-scan.mjs';
import {illuminatePalace} from './palace-resonance.mjs';
import {initChartAtlas} from './chart-atlas.mjs';
import {renderCelestialWheel} from './wheel-chart.mjs';
import {clearSquareFlights} from './chart-motion.mjs';
import {palaceFlights,activeLayers,starMutations,intrinsicTransforms,selectedFlights,transformationLabel,LAYER_COLORS} from './chart-insights.mjs';
import {initChartMobile} from './chart-mobile.mjs';
import {initChartCases} from './chart-cases.mjs';
import {initChartSettings} from './chart-settings.mjs';
import {defaultSettings} from './chart-conventions.mjs';
import {initPalaceDialog} from './palace-dialog.mjs';
import {initCycleControls} from './cycle-controls.mjs';
import {renderSquareChart} from './square-chart.mjs';
import {initEarth} from './earth-globe.mjs';
import {initSkyCinema} from './sky-cinema.mjs';
import {initLandscapeJourney} from './landscape-journey.mjs';
import {initSceneSound} from './scene-sound.mjs';
import {createWorldClock} from './world-time.mjs';
import {VISIBLE_PLANETS} from './sky-ephemeris.mjs';
import {initLandscape} from './living-landscape.mjs';
import {initWeather} from './living-weather.mjs';
import {initScenicDepth} from './scenic-depth.mjs';
import {createPresence} from './scene-presence.mjs';
import {createTerrain} from './terrain-profile.mjs';
import {makeChart,normalizeBirth,exportChart,SCOPE_NAMES,annualAges} from './chart-engine.mjs';
import {requestChart} from './chart-service.mjs';
import {deviceNow} from './cycle-navigation.mjs';
import {palaceAtAngle,palaceStemBranch,chartSource,chartStemSummary} from './chart-projection.mjs';
import {initStarfield} from './starfield.mjs';
import {NAMED_STARS,SOUTH_STARS,PROFILES,profileFor,SOURCES} from './star-profiles.mjs';
const $=s=>document.querySelector(s),form=$('#birth-form');
const example={name:'虚构示例',date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false};
let chartLayout='square',cycleScope='natal',flightSource=null;
let result=null,cycle=null,selected=null,symbol='',focusedChartStar=null,view='sky',isExample=true,selectedSky=null;
initTechniqueScan(()=>result,()=>cycle);
let castGeneration=0,castPending=null;
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(label,action,cls='')=>{const b=node('button',cls,label);b.type='button';b.addEventListener('click',action);return b;};
function link(label,href){const a=node('a','',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function status(text,error=false){$('#chart-status').textContent=text;$('#chart-status').classList.toggle('error',error);}
const palaceDialog=initPalaceDialog({onStep:delta=>selectPalace(((selected??0)+delta+12)%12)});
let cinema;
let sceneryReady=false,catalogueReady=false,journeyReady=false;
function sceneLoaded(){sceneryReady=true;if(catalogueReady&&journeyReady)cinema?.ready();}
const world=createWorldClock();
const sound=initSceneSound();
const terrain=createTerrain(),presence=createPresence();
const journey=initLandscapeJourney({onNavigate(){cinema?.sceneChange();},onObserve(){world.hour(21);sky.refresh();sky.focus('南斗',{notify:false});},onRefresh(){sky.refresh();},onBlend:weights=>sound.blend(weights)});
journey.ready.then(()=>{journeyReady=true;if(sceneryReady&&catalogueReady)cinema?.ready();});
const earth=initEarth($('#earth-globe'),{onFailure(){ $('#sky-render-note').textContent='此设备未能载入地球画面，可以切回山河地景。'; }});
const landscape=initLandscape($('#living-landscape'),{terrain,onReady:sceneLoaded,onFailure(){ $('#sky-render-note').textContent='此设备未能开启动态地景，已显示静态山河；星空仍可操作。';sceneLoaded(); }});
const weather=initWeather($('#living-weather'),{terrain,onAssetFailure(){ $('#sky-render-note').textContent='部分云或白鹤素材未载入，其余场景仍可使用。'; }});
const depthScene=initScenicDepth($('#scenic-depth'),{terrain,starCanvas:$('#starfield')});
const sky=initStarfield($('#starfield'),{
  world,terrain,presence,
  onOrient:value=>earth.orient(value),
  onFrame(frame){
    if(!frame.skyOnly)return;
    journey.frame(frame);
    sound.frame(frame,journey.weights);
    if(!journey.covered){landscape.frame(frame);weather.frame(frame);depthScene.frame(frame);}
    earth.frame(frame);
    if(document.activeElement!==$('#scene-travel'))$('#scene-travel').value=frame.presence.travel;
    const {hour,date}=frame.world,minutes=Math.floor(hour*60),time=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    const phase=frame.world.sun.altitude>10?'白昼':frame.world.sun.altitude>-9?(hour<12?'晨曦':'暮色'):'星夜';
    $('#world-time-display').textContent=`${phase} · ${time}`;
    $('#world-date-display').textContent=new Date(date.getTime()+8*3600000).toISOString().slice(0,10)+' · UTC+8';
    $('#world-lunar-phase').textContent=`${frame.world.moon.phaseName} · 月面照亮 ${(frame.world.moon.phase*100).toFixed(0)}%`;
    if(document.activeElement!==$('#world-hour'))$('#world-hour').value=hour;
    $('#world-clock-mode').value=world.modeName;
    const progress=$('#sky-event-progress');progress.disabled=!frame.phenomenon?.manual;
    if(document.activeElement!==progress)progress.value=String(Math.round((frame.phenomenon?.progress||0)*100));
  },
  normalize:value=>window.ZiweiBookSearch.normalize(value),
  onInteract(){cinema?.interrupt();},
  onStar(star,selected){
    const tip=$('#star-tooltip');
    if(selected&&star){selectedSky=star;renderStar(star);cinema?.selected();tip.hidden=true;setPause(true);}
    else if(star){tip.replaceChildren(document.createTextNode(star.name),node('small','',star.modern));tip.hidden=false;tip.style.left=Math.max(12,Math.min(star.x+18,$('#starfield').clientWidth-240))+'px';tip.style.top=Math.max(80,star.y-45)+'px';}
    else tip.hidden=true;
  },
  onReady(data){$('#star-count').textContent=`${data.count.toLocaleString()} 颗星 · 同一片宇宙`;catalogueReady=true;if(sceneryReady&&journeyReady)cinema?.ready();},
  onError(text){$('#star-count').textContent=text;$('#star-inspector').replaceChildren(node('p','star-limit',text));cinema?.fail();},
});
const skyAnchor=document.createComment('sky canvas home');$('#starfield').before(skyAnchor);
cinema=initSkyCinema({sky,earth,journey,onReplay(){location.hash='model';switchView('sky');setPause(matchMedia('(prefers-reduced-motion: reduce)').matches);}});
function changeTime(action){cinema?.interrupt();journey.observe();action();sky.refresh();}
$('#scene-travel').addEventListener('input',e=>{cinema?.interrupt();sky.travel(Number(e.target.value));});
$('#scene-night').addEventListener('click',()=>{changeTime(()=>world.hour(21));setPause(true);sky.focus('南斗',{notify:false});});
$('#world-hour').addEventListener('input',e=>changeTime(()=>world.hour(Number(e.target.value))));
$('#world-clock-mode').addEventListener('change',e=>{changeTime(()=>world.mode(e.target.value));if(e.target.value==='lunar')setPause(reduce.matches);});
document.querySelectorAll('[data-moon-phase]').forEach(b=>b.addEventListener('click',()=>{changeTime(()=>world.phase(Number(b.dataset.moonPhase)));sky.refresh();sky.focus('Moon',{notify:false});setPause(true);}));
$('#sky-events-enabled').checked=sky.phenomenaEnabled;
$('#sky-events-enabled').addEventListener('change',e=>sky.phenomena(e.target.checked));
$('#sky-event-preview').addEventListener('click',()=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){$('#sky-event-help').textContent='设备已开启减少动态效果；关闭此系统设置后可播放天象过程。';return;}
  const kind=$('#sky-event-kind').value;
  if(kind==='halo'){
    const select=document.querySelector('[data-sky-pref="landscape"]');select.value='mountains';select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  cinema.sceneChange();journey.observe();sky.phenomena(true);$('#sky-events-enabled').checked=true;setPause(false);sky.previewPhenomenon(kind);
  $('#sky-event-help').textContent=kind==='alignment'?'五颗行星按历史时刻定位；连珠是视线上的排列，并非空间中排成直线。':kind.endsWith('-eclipse')?'日月食展示遮掩、食甚与复圆；是过程演示，不是当前日期的日食预报。':'已放大天象特征便于观察，演示结束后继续巡天。';
});
$('#sky-event-return').addEventListener('click',()=>{changeTime(()=>world.mode('live'));setPause(false);cinema.sceneChange();});
$('#sky-event-progress').addEventListener('input',e=>{setPause(true);sky.seekPhenomenon(Number(e.target.value)/100);});
document.querySelectorAll('[data-world-season]').forEach(el=>el.addEventListener('click',()=>{changeTime(()=>world.season(el.dataset.worldSeason));document.querySelectorAll('[data-world-season]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));}));
$('#star-sheet-close').addEventListener('click',()=>{$('#star-sheet').hidden=true;sky.clearSelection?.();$('#starfield').focus({preventScroll:true});});
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
sky.visible(!$('#model').hidden);
let paused=reduce.matches;
function setPause(value){paused=value;document.body.classList.toggle('cosmos-paused',value);sky.pause(value);$('#sky-pause').textContent=value?'继续':'暂停';$('#sky-pause').setAttribute('aria-pressed',String(value));$('#sky-motion-note').textContent=value?'巡天已暂停':'巡天中';}
setPause(paused);reduce.addEventListener('change',()=>{if(reduce.matches)setPause(true);});
$('#sky-pause').addEventListener('click',()=>setPause(!paused));
$('#sky-zoom-in').addEventListener('click',()=>journey.isLandscape?journey.zoom(.18):sky.zoom(1.2));$('#sky-zoom-out').addEventListener('click',()=>journey.isLandscape?journey.zoom(-.18):sky.zoom(1/1.2));
const workbench=node('div','tech-workbench');
$('#cosmic-observatory').before(workbench);workbench.append($('#cosmic-observatory'),$('#cosmic-rules'));
document.addEventListener('ziwei:open-techniques',()=>{location.hash='model';switchView('rules');});
function switchView(next){document.body.classList.toggle('tech-workbench-active',next==='rules'&&!$('#model').hidden);if(next!=='chart'){palaceDialog.close();chartAtlas.close();}view=next;sound.visible(next==='sky'&&!$('#model').hidden);if(next==='sky')window.scrollTo({top:0,behavior:'instant'});document.body.classList.toggle('immersive-sky',next==='sky'&&!$('#model').hidden);earth.visible(next==='sky'&&!$('#model').hidden);document.querySelectorAll('[data-cosmic-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cosmicTab===next)));$('#cosmic-observatory').hidden=false;$('#cosmic-rules').hidden=next!=='rules';$('#chart-stage').hidden=next==='sky';$('#sky-stage').hidden=next!=='sky';$('#cycle-dock').hidden=next==='sky';$('#cosmic-observatory').dataset.mode=next==='rules'?'chart':next;const canvas=$('#starfield');if(next!=='sky')$('#chart-stage').prepend(canvas);else skyAnchor.after(canvas);canvas.tabIndex=next==='sky'?0:-1;canvas.setAttribute('aria-hidden',String(next!=='sky'));sky.sky(next==='sky');sky.visible(next!=='rules'&&!$('#model').hidden);cinema?.view(next==='sky'&&!$('#model').hidden);$('#star-tooltip').hidden=true;}
document.querySelectorAll('[data-cosmic-tab]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.cosmicTab)));
document.addEventListener('ziwei:view',e=>{document.body.classList.toggle('tech-workbench-active',e.detail==='model'&&view==='rules');if(e.detail!=='model'){palaceDialog.close();chartAtlas.close();}sound.visible(e.detail==='model'&&view==='sky');sky.visible(e.detail==='model'&&view!=='rules');earth.visible(e.detail==='model'&&view==='sky');document.body.classList.toggle('immersive-sky',e.detail==='model'&&view==='sky');cinema?.view(e.detail==='model'&&view==='sky');});

const chartSettings=initChartSettings({onApply:()=>{sourceNote();calculate(readBirth());}});
function readBirth(){const f=new FormData(form);return {name:f.get('name'),date:f.get('date'),time:f.get('time'),gender:f.get('gender'),dayDivide:f.get('dayDivide'),fixLeap:f.get('fixLeap')==='true',daylight:f.has('daylight'),...($('#chart-provider').value==='public'?{settings:chartSettings.read()}:{})};}
function fillBirth(value){for(const [key,v]of Object.entries(value)){const f=form.elements.namedItem(key);if(!f)continue;if(key==='gender')f.value=v;else if(key==='daylight')f.checked=v;else f.value=String(v);}if(value.settings)chartSettings.apply(value.settings,{notify:false});}
async function calculate(input,fictional=false){
  const generation=++castGeneration;castPending?.abort();castPending=new AbortController();$('#cast-chart').disabled=true;
  status('正在按所选安星方法起盘…');
  try{
  normalizeBirth(input);
  let next;
  if($('#chart-provider').value==='public-server'){
    const data=await requestChart(input,{stamp:deviceNow(),command:{kind:'initialize'},signal:castPending.signal});
    next={...data.result,input:{...input},remote:{cycle:data.cycle,nav:data.nav,bounds:data.bounds,canStep:data.canStep}};
  }else next=makeChart(input);
  if(generation!==castGeneration)return;
  result=next;isExample=fictional;selected=null;focusedChartStar=null;flightSource=null;symbol='';palaceDialog.close();
  $('#chart-example-badge').textContent=fictional?'虚构示例':'当前命盘 · 仅本页';
  $('#chart-pending-badge').hidden=true;
  $('#chart-source-label').textContent=chartSource(next)+' · '+next.normalized.date+' '+next.normalized.time;
  $('#chart-stem-summary').textContent=chartStemSummary(next);
  $('#chart-stem-records').replaceChildren(...next.chart.palaces.map(p=>node('span','',`${palaceStemBranch(p)} · ${p.name}`)));
  $('#chart-method-note').textContent=next.method?.supplement||'当前使用公开算法；更换安星方法后请重新起盘。';
  ['#chart-export','#palace-prev','#palace-next'].forEach(s=>$(s).disabled=false);
  cycleControls.initialize();
  $('#chart-summary').replaceChildren(node('div','',`公历标准时 ${next.normalized.date} ${next.normalized.time} · ${next.chart.time} · ${next.chart.gender}命`),node('div','',`农历 ${next.chart.lunarDate}`));
  const meta=node('div');meta.append(node('span','',next.chart.fiveElementsClass),node('span','',`命主 ${next.chart.soul}`),node('span','',`身主 ${next.chart.body}`));$('#chart-summary').append(meta);if(next.normalized.timeIndex===12)$('#chart-summary').append(node('div','',next.config.dayDivide==='forward'?'晚子时口径：按次日安星':'晚子时口径：按当日安星'));
  status((fictional?'虚构示例已起盘。':'命盘已更新。')+(next.provider==='public-server'?' 公开算法已生效，方盘与轮盘共用本次服务器结果。':' 当前使用公开算法，在浏览器内计算。'));
  document.dispatchEvent(new Event('ziwei:chart-updated'));
  return true;
  }catch(err){if(generation===castGeneration)status(`${err.message} 当前命盘未更新。`,true);}
  finally{if(generation===castGeneration){castPending=null;$('#cast-chart').disabled=false;}}
}
form.addEventListener('submit',e=>{e.preventDefault();calculate(readBirth());});
function sourceNote(){const server=$('#chart-provider').value==='public-server';$('#chart-privacy-note').textContent=server?'起盘时日期、时间与口径发送至服务器，姓名不发送；点击保存命例后，出生资料才存入个人账户。':'浏览器内计算；点击保存命例后，出生资料存入个人账户。';}
sourceNote();$('#chart-provider').addEventListener('change',sourceNote);
form.addEventListener('input',()=>{++castGeneration;castPending?.abort();castPending=null;$('#cast-chart').disabled=false;$('#chart-pending-badge').hidden=false;status('资料或安星方法已修改，点击“起盘”更新方盘与轮盘。');});
$('#chart-example').addEventListener('click',()=>{fillBirth(example);calculate(readBirth(),true);});
function clearChart(){
  ++castGeneration;castPending?.abort();castPending=null;$('#cast-chart').disabled=false;$('#chart-pending-badge').hidden=true;
  clearSquareFlights();
  palaceDialog.close();chartAtlas.close();result=null;cycle=null;cycleScope='natal';selected=null;flightSource=null;chartAtlas.render();symbol='';cycleControls.clear();
  document.dispatchEvent(new CustomEvent('ziwei:chart-selection',{detail:{selected:null,name:null}}));
  form.reset();for(const key of ['name','date','time'])form.elements[key].value='';
  sourceNote();$('#chart-source-label').textContent='尚未起盘';$('#chart-stem-summary').textContent='十二宫干支对照';$('#chart-stem-records').replaceChildren();$('#chart-method-note').textContent='';
  $('#destiny-wheel').replaceChildren(node('p','no-chart','输入时间，起一张新的命盘。'));
  $('#palace-inspector').replaceChildren(node('p','panel-overline','十二宫'),node('h2','','等待起盘'),node('p','palace-extra','命盘计算完成后，在这里查看宫位与星曜。'));
  $('#chart-summary').replaceChildren();$('#chart-example-badge').textContent='尚未起盘';$('#chart-layer-label').textContent='本命十二宫';
  ['#chart-export','#palace-prev','#palace-next'].forEach(s=>$(s).disabled=true);
  if(selectedSky)renderStar(selectedSky);status('本页出生资料与命盘已清空。');
  document.dispatchEvent(new Event('ziwei:chart-cleared'));
}
$('#chart-clear').addEventListener('click',clearChart);document.addEventListener('ziwei:logout',clearChart);
initChartCases({getChart:()=>{if(!result)return null;const {settings,...birth}=result.input,provider=result.provider==='public-server'?'public-server':'public';return {birth,provider,settings:provider==='public'?(settings||defaultSettings(birth)):null};},resetChart:clearChart,applyDefaultSettings:settings=>{chartSettings.apply(settings,{notify:false});sourceNote();if(isExample)calculate(readBirth(),true);},loadChart:async (record,{automatic=false}={})=>{
  document.querySelector('#chart-mobile-sheet[open]')?.close();if(!automatic)location.hash='model';if(!automatic||['','#model'].includes(location.hash))switchView('chart');
  fillBirth(record.birth);if(record.provider==='public')chartSettings.apply(record.settings||defaultSettings(record.birth),{notify:false});$('#chart-provider').value=record.provider;chartSettings.syncProvider();sourceNote();return calculate({...record.birth,...(record.settings?{settings:record.settings}:{})});
}});
document.addEventListener('ziwei:case-opened',e=>{$('#chart-example-badge').textContent='已保存命例 · '+e.detail.title;});

function drawWheel(){
  if(!result)return;
  const flights=selectedFlights(result,flightSource??selected,chartAtlas.options.flights);
  const intrinsic=chartAtlas.options.flights?intrinsicTransforms(result):[];
  const options={result,cycle,selected,visibleLayers:visibleLayerKeys(cycle,cycleScope,chartAtlas.options.layers),scope:cycleScope,onSelect:selectPalace,onStar:selectChartStar,onDetails:()=>palaceDialog.open(true),flights,intrinsic};
  if(chartLayout==='square')renderSquareChart($('#destiny-wheel'),{...options,onDecade:selectChartDecade,decadeKeys:cycleControls.decadeKeys});
  else renderCelestialWheel($('#destiny-wheel'),options);
  illuminatePalace($('#destiny-wheel'),Number.isInteger(selected)?result.chart.palaces[selected]:null,focusedChartStar);
  cycleControls.mount();
  chartAtlas.render();
  document.dispatchEvent(new CustomEvent('ziwei:chart-selection',{detail:{selected,name:Number.isInteger(selected)?result.chart.palaces[selected].name:null}}));
}
function selectPalace(index,keepFlightSource=false){if(!result)return;focusedChartStar=null;selected=index;if(!keepFlightSource)flightSource=index;const palace=result.chart.palaces[index];symbol=palace.majorStars[0]?.name||'';drawWheel();renderPalace();if(symbol)sky.focus(symbol,{notify:false});}
function selectChartStar(index,name){selectPalace(index);focusedChartStar=name;symbol=name;drawWheel();renderPalace();}
function resetChartSelection(){focusedChartStar=null;selected=null;flightSource=null;symbol='';palaceDialog.close();drawWheel();renderPalace();}
$('#palace-prev').addEventListener('click',()=>selectPalace(((selected??0)+11)%12));$('#palace-next').addEventListener('click',()=>selectPalace(((selected??11)+1)%12));
let wheelDrag=null;
$('#destiny-wheel').addEventListener('pointerdown',e=>{if(chartLayout!=='wheel'||!result||e.pointerType==='touch')return;wheelDrag={x:e.clientX,y:e.clientY};});
$('#destiny-wheel').addEventListener('pointermove',e=>{if(!wheelDrag||!(e.buttons&1)||!result)return;if(Math.hypot(e.clientX-wheelDrag.x,e.clientY-wheelDrag.y)<8)return;const r=$('#destiny-wheel').getBoundingClientRect();const angle=Math.atan2(e.clientX-r.left-r.width/2,-(e.clientY-r.top-r.height/2))*180/Math.PI;const i=palaceAtAngle(angle);if(i!==selected)selectPalace(i);});
window.addEventListener('pointerup',()=>{wheelDrag=null;});
function renderPalace(){
  if(result&&!Number.isInteger(selected)){$('#palace-inspector').replaceChildren(node('p','panel-overline','全盘总览'),node('h2','',SCOPE_NAMES[cycleScope]),node('p','palace-extra','点选宫位，高亮三方四正并展开宫干飞化。开启宫干飞化时，全盘自化箭头持续保留。'));return;}
  if(!result)return;const p=result.chart.palaces[selected],box=$('#palace-inspector');box.replaceChildren(node('p','panel-overline','PALACE / '+p.earthlyBranch),node('h2','',p.name+(p.name.endsWith('宫')?'':'宫')),node('p','palace-subtitle',`${p.heavenlyStem}${p.earthlyBranch}${p.isBodyPalace?' · 身宫':''} · 大限 ${p.decadal.range.join('—')} 虚岁`));
  const decadeButton=button(`查看 ${p.decadal.range.join('–')} 岁大限`,()=>selectChartDecade(p.index),'palace-decade-action');decadeButton.disabled=!cycleControls.decadeKeys.has(String(p.index));box.append(decadeButton);
  const visible=visibleLayerKeys(cycle,cycleScope,chartAtlas.options.layers);
  const list=node('div','palace-star-list');[...p.majorStars,...p.minorStars].forEach(s=>{const b=button(s.name,()=>selectChartStar(p.index,s.name));b.setAttribute('aria-pressed',String(symbol===s.name));b.append(node('small','',s.brightness||''));if(s.mutagen&&visible.includes('natal'))b.append(node('small','mutagen-badge','化'+s.mutagen));list.append(b);});if(!p.majorStars.length)list.append(node('p','palace-subtitle','本宫无十四主星，可同时对照对宫。'));box.append(list);
  const extras=node('p','palace-extra');extras.append(node('strong','','辅曜 '),document.createTextNode(p.minorStars.map(s=>s.name+(s.mutagen&&visible.includes('natal')?'·化'+s.mutagen:'')).join('、')||'无'));
  extras.append(document.createElement('br'),node('strong','','三方四正 '),document.createTextNode([0,4,6,8].map(d=>result.chart.palaces[(selected+d)%12].name).join(' · ')));box.append(extras);
  const layers=activeLayers(cycle,cycleScope).filter(l=>visible.includes(l.key)),positions=node('div','palace-position-stack');
  if(visible.includes('natal'))positions.append(node('span','',`本命 · ${p.name}${p.isOriginalPalace?' · 来因宫':''}`));for(const l of layers){const item=node('span','',`${l.name} · ${l.palaceNames[selected]}`);item.dataset.layer=l.key;item.style.setProperty('--layer-color',LAYER_COLORS[l.key]);positions.append(item);}box.append(positions);
  const flyDetails=node('details','palace-flight-details');flyDetails.append(node('summary','',`${p.heavenlyStem}干四化 · 飞入与自化`));
  for(const f of palaceFlights(result,p.index))flyDetails.append(node('p','',transformationLabel({...f,direction:f.self?'outward':f.targetIndex===(p.index+6)%12?'inward':null})));
  if(result.provider==='public-server')flyDetails.append(node('p','','四化去向与当前服务器命盘一致。'));else flyDetails.append(link('宫干四化口径 ↗','https://docs.iztro.com/learn/mutagen'));box.append(flyDetails);
  if(symbol){const profile=profileFor(symbol),section=node('section','star-symbol-profile');section.append(node('h3','',`${symbol} · ${profile.keywords}`),node('p','',profile.intro),node('p','symbol-relation',profile.relation));section.append(button(profile.association?'在星空中找到它 ↗':profile.group?'对照南斗天区 ↗':'查看星曜说明 ↗',()=>{switchView('sky');journey.observe();if(profile.association)sky.focus(profile.association.hip);else if(profile.group){sky.focus(profile.group);renderSymbol(profile.name);}else renderSymbol(profile.name);}));box.append(section);}
  const details=node('details','palace-details');details.open=true;details.append(node('summary','','查看本宫完整星曜'));details.append(node('p','',`杂曜：${p.adjectiveStars.map(s=>s.name).join('、')||'无'}`),node('p','',`长生：${p.changsheng12}；博士：${p.boshi12}；岁前：${p.suiqian12}；将前：${p.jiangqian12}。`));const starTable=node('div','palace-complete-stars');const activeLayer=cycleScope==='natal'?null:cycle?.[cycleScope];
  const permanent=intrinsicTransforms(result);
  for(const s of [...p.majorStars,...p.minorStars,...p.adjectiveStars]){const mutations=starMutations(s,cycle,cycleScope,true,visible),self=permanent.filter(f=>f.targetIndex===p.index&&f.star===s.name);starTable.append(node('span','',`${s.name}${s.brightness?' · '+s.brightness:''}${mutations.map(m=>' · '+m.name+'化'+m.mutagen).join('')}${self.map(f=>' · '+(f.direction==='outward'?'↗ 离心':'↘ 向心')+'化'+f.mutagen).join('')}`));}
  details.append(starTable);box.append(details);
  const annual=node('p','palace-extra');annual.append(node('strong','','流年虚岁 '),document.createTextNode(annualAges(result.chart,p.earthlyBranch).join(' · ')));box.append(annual);
  const ageInfo=node('p','palace-extra');ageInfo.append(node('strong','','小限虚岁 '),document.createTextNode(p.ages.join(' · ')));box.append(ageInfo);
  for(const layer of layers){
    const flow=node('section','palace-flow-detail'),heading=node('h3','palace-flow-heading',`${layer.name} · ${layer.palaceNames[selected]}`);flow.dataset.layer=layer.key;heading.style.setProperty('--layer-color',LAYER_COLORS[layer.key]);flow.append(heading);
    const mutations=[...p.majorStars,...p.minorStars,...p.adjectiveStars].flatMap(s=>starMutations(s,cycle,cycleScope,true,visible).filter(m=>m.key===layer.key).map(m=>s.name+'化'+m.mutagen));
    flow.append(node('p','',`本宫四化：${mutations.join('、')||'无'}`),node('p','',`流曜：${(layer.stars?.[selected]||[]).map(s=>s.name).join('、')||'无'}`));
    if(layer.yearlyDecStar)flow.append(node('p','',`流年岁前：${layer.yearlyDecStar.suiqian12[selected]}；流年将前：${layer.yearlyDecStar.jiangqian12[selected]}`));box.append(flow);
  }
}
function renderStar(star){
  if(star.body){renderBody(star);return;}
  const box=$('#star-inspector');box.replaceChildren(node('p','panel-overline',star.named?.tag||'HYG · 恒星'),node('h2','',star.name),node('p','modern-name',star.modern));
  const dl=node('dl');for(const [label,value]of [['距离（约）',star.distance===null?'星表距离不可靠':`${(star.distance*3.26156).toFixed(star.distance<10?2:1)} 光年`],['视星等',String(star.mag)],['赤经 · J2000',`${star.ra.toFixed(3)} h`],['赤纬 · J2000',`${star.dec.toFixed(3)}°`]]){const d=node('div');d.append(node('dt','',label),node('dd','',value));dl.append(d);}box.append(dl);
  if(star.named?.symbol){
    const p=profileFor(star.named.symbol),south=star.named.group==='南斗';
    const order=south?`（斗数南斗第${'一二三四五六'[star.named.order-1]}星）`:'';
    box.append(node('p','star-culture',`传统${south?'文化对照':'称谓'}：${p.name}${order}。${p.intro}`));
    box.append(node('p','star-limit',south?'斗宿序号与斗数南斗序号不同。本页采用所引资料的文化对照；不同传统可能异名，命盘仍依历法安星。':'以上是传统象征；命盘宫位依历法安星，不由恒星坐标直接得出。'));
    box.append(link(south?'南斗文化对照出处 ↗':'北斗传统称谓出处 ↗',south?SOURCES.south:SOURCES.culture));
    if(south){
      box.append(link('天文星名依据 ↗',SOURCES.chinese));
      const nav=node('div','southern-star-nav');nav.setAttribute('role','group');nav.setAttribute('aria-label','逐颗查看南斗六星');
      for(const item of SOUTH_STARS){const control=button(item.symbol,()=>sky.focus(item.symbol));control.setAttribute('aria-pressed',String(item.hip===star.id));control.title=`${item.name} · ${item.modern}`;nav.append(control);}
      box.append(nav);
    }
    if(result&&result.chart.palaces.some(p=>p.majorStars.some(s=>s.name===star.named.symbol)))box.append(button('在命盘中定位',()=>{if(!result)return;switchView('chart');selectPalace(result.chart.palaces.findIndex(p=>p.majorStars.some(s=>s.name===star.named.symbol)));}));
  }
  else if(star.named?.group==='北极')box.append(node('p','star-culture','北极星靠近当前北天极。斗数中的紫微是帝座意象与安星符号，不能简单等同于北极星。'),button('查看紫微的斗数介绍',()=>renderSymbol('紫微')));
  else box.append(node('p','star-culture','这颗星按公开星表的位置绘制。本版没有建立它与紫微斗数星曜的确定对应关系。'));
  box.append(node('p','star-limit',`星表标识：${typeof star.id==='number'?'HIP ':''}${star.id}。距离、视星等来自 HYG 4.1；亮星并不一定离我们更近。`),link('查看星表数据依据 ↗',SOURCES.hyg));
}
function renderBody(star){
  if(star.planet){const box=$('#star-inspector');box.replaceChildren(node('p','panel-overline','太阳系 · 行星'),node('h2','',star.name),node('p','modern-name',star.modern),node('p','star-culture',`距离约 ${(star.distanceKm/1e8).toFixed(2)} 亿公里 · 视星等 ${star.mag.toFixed(2)}`),node('p','star-culture',`赤经 ${star.ra.toFixed(3)}h · 赤纬 ${star.dec.toFixed(3)}°`),node('p','star-limit','位置和亮度随画面时刻计算。这里展示的是现代天文行星，不与斗数安星位置混用。'),link('天体计算依据 ↗','https://github.com/cosinekitty/astronomy'));return;}
  document.querySelector('[name=projection][value=sky]').checked=true;
  $('#projection-note').textContent='两种地景的星空均参照北纬 28°、东经 112°，随所示时刻转动；底部地球为艺术构图。';
  const box=$('#star-inspector'),isSun=star.body==='Sun',profile=profileFor(isSun?'太阳':'太阴');
  box.replaceChildren(node('p','panel-overline','太阳系 · 参照地点天空'),node('h2','',star.name),node('p','modern-name',star.modern));
  const dl=node('dl');
  const values=[['距离（约）',isSun?(star.distanceKm/100000000).toFixed(3)+' 亿公里':(star.distanceKm/10000).toFixed(2)+' 万公里'],['赤经 · J2000',star.ra.toFixed(3)+' h'],['赤纬 · J2000',star.dec.toFixed(3)+'°']];
  if(!isSun)values.push(['月相',star.phaseName],['月面照亮比例',(star.phase*100).toFixed(1)+'%']);
  for(const [label,value]of values){const row=node('div');row.append(node('dt','',label),node('dd','',value));dl.append(row);}box.append(dl);
  box.append(node('p','star-culture',isSun?'太阳是太阳系的恒星；月球与行星靠反射太阳光而明亮。':'月球是地球的天然卫星；月相来自太阳照亮月面的不同部分。'),node('p','star-culture',`斗数中的${profile.name}：${profile.intro}`),node('p','star-limit','天文位置与斗数宫位各有计算口径。这里的日月大小为方便辨认而放大，不按真实角直径显示。'),node('p','star-limit','推演时刻：'+new Date(star.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（UTC+8）'),link('天文计算依据 ↗','https://github.com/cosinekitty/astronomy'));
}
function renderSymbol(name){cinema?.selected();const p=profileFor(name),box=$('#star-inspector');box.replaceChildren(node('p','panel-overline','紫微斗数 · 传统星曜'),node('h2','',name),node('p','modern-name',p.keywords),node('p','star-culture',p.intro),node('p','star-culture',p.relation),node('p','star-limit','本页介绍是基础文化释义，不是针对个人的吉凶判断。'),link('星曜介绍参考 ↗',SOURCES.stars));if(result){const i=result.chart.palaces.findIndex(p=>p.majorStars.some(s=>s.name===name));if(i>=0)box.append(button(`查看命盘中的${name}`,()=>{if(!result)return;const current=result.chart.palaces.findIndex(p=>p.majorStars.some(s=>s.name===name));if(current>=0){switchView('chart');selectPalace(current);}}));}}
$('#sky-target').addEventListener('change',e=>{cinema?.interrupt();journey.observe();sky.focus(e.target.value);});
const target=$('#sky-target');for(const name of Object.keys(PROFILES).filter(s=>!['贪狼','天府'].includes(s))){const association=profileFor(name).association;target.append(new Option(association?.group==='南斗'?`${name} · ${association.name}`:name,name));}for(const n of NAMED_STARS.filter(s=>s.group==='北斗'&&!s.symbol))target.append(new Option(n.name,String(n.hip)));
for(const planet of VISIBLE_PLANETS)target.append(new Option(planet.name+' · '+planet.modern,planet.body));
// Symbol-only entries remain descriptions, never fabricated sky coordinates.
target.addEventListener('change',e=>{if(PROFILES[e.target.value]&&!NAMED_STARS.some(s=>s.symbol===e.target.value)&&e.target.value!=='天府')renderSymbol(e.target.value);});
$('#star-query').addEventListener('input',e=>{const q=e.target.value,box=$('#star-search-results');box.replaceChildren();if(!q.trim())return;const found=sky.search(q);for(const s of found)box.append(button(`${s.name} · ${s.modern}`,()=>{cinema?.interrupt();journey.observe();sky.focus(s.id);box.replaceChildren();},'star-search-item'));if(!found.length)box.append(node('p','star-search-empty','当前星表没有匹配项。可用现代星名或 HIP 编号查找。'));});
document.querySelectorAll('[name=projection]').forEach(r=>r.addEventListener('change',()=>{sky.setMode(r.value);$('#projection-note').textContent=r.value==='depth'?'距离采用对数压缩，拖动有视差；用于比较远近，不是等比例宇宙。没有可靠距离的星暂不绘制。':'两种地景的星空均参照北纬 28°、东经 112°，随所示时刻转动；底部地球为艺术构图。';}));

const chartAtlas=initChartAtlas({
  onMotion:value=>sky.chartMotion?.(value),
  getState:()=>({result,cycle,scope:cycleScope,selected,flightSource,layout:chartLayout}),
  onChange(){drawWheel();renderPalace();},onReset:resetChartSelection,
  onPalace:selectPalace,onFlightTarget:index=>selectPalace(index,true),onCloseDetails:()=>palaceDialog.close(),
});
const cycleControls=initCycleControls({getResult:()=>result,onChange(next){
  cycle=next.cycle;cycleScope=next.scope;
  document.dispatchEvent(new Event('ziwei:technique-context-changed'));
  selected=null;focusedChartStar=null;symbol='';flightSource=null;palaceDialog.close();
  drawWheel();renderPalace();
}});
document.addEventListener('ziwei:technique-period',async e=>{let ok=false;try{if(result)ok=await cycleControls.selectPeriod(e.detail.date,e.detail.unit);}finally{e.detail.onComplete?.(ok);}});
const chartMobile=initChartMobile({onReset:resetChartSelection,onDetails:()=>palaceDialog.open(true)});
async function selectChartDecade(index){
  if(await cycleControls.selectDecade(index)){
    palaceDialog.close();
    $('#destiny-wheel [data-decade="'+index+'"]')?.focus({preventScroll:true});
  }
}
document.querySelectorAll('[data-chart-layout]').forEach(b=>b.addEventListener('click',()=>{
  chartLayout=b.dataset.chartLayout;document.dispatchEvent(new CustomEvent('ziwei:chart-layout',{detail:chartLayout}));document.querySelectorAll('[data-chart-layout]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  $('#destiny-wheel').classList.toggle('square-mode',chartLayout==='square');drawWheel();
}));
$('#chart-export').addEventListener('click',()=>{if(!result)return;const data=exportChart(result,cycle);data.fictionalExample=isExample;data.viewScope=cycleScope;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='观星台-紫微命盘.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('命盘已导出到你的设备，包含输入时间与排盘口径。');});
try{fillBirth(example);calculate(example,true);}catch{status('排盘模块暂未初始化，请刷新重试。',true);}

switchView('sky');
