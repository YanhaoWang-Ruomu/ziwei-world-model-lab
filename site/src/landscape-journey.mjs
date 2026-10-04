import {initJourneyMotion,photographicRect} from './journey-motion.mjs';
const clamp=n=>Math.min(1,Math.max(0,n));
const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};

export const JOURNEY_CHAPTERS=Object.freeze([
  {name:'云海',title:'云上圣穹',line:'古金穹顶 · 流云 · 鹤影'},
  {name:'大河',title:'秘境长川',line:'幽谷石门 · 碧水 · 流金'},
  {name:'星夜',title:'群星秘典',line:'古典星图 · 月华 · 紫金星河'},
]);

// Three painted chapters dissolve continuously. Live observation is separate.
export function journeyShot(progress){
  const p=clamp(progress),river=ease((p-.27)/.12),sky=ease((p-.60)/.20);
  return {cloud:1-river,river:river*(1-sky),sky,chapter:p<.32?0:p<.64?1:2,
    cloudTravel:clamp(p/.36),riverTravel:clamp((p-.28)/.41),caption:ease((p-.08)/.07)*(1-ease((p-.91)/.07))};
}

export function initLandscapeJourney({onNavigate=()=>{},onObserve=()=>{},onRefresh=()=>{},onBlend=()=>{}}={}){
  const $=s=>document.querySelector(s),stage=$('#cosmic-observatory'),surface=$('#landscape-journey');
  const images=[$('#journey-cloudsea'),$('#journey-river'),$('#journey-night')],caption=$('#journey-caption');
  const motion=initJourneyMotion($('#journey-motion'),$('#journey-creatures'));
  const number=$('#journey-number'),title=$('#journey-title'),line=$('#journey-line'),returnButton=$('#journey-return');
  const buttons=Array.from(document.querySelectorAll('[data-journey]'));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let opening=false,enabled=true,chapter=2,progress=1,last=null,drag=null,pan={x:0,y:0},zoom=0;
  let available=[false,false,false],loaded=false,lastChapter=-1;
  let weights=[0,0,1],transition=null,transitionFrame=0;
  const coverage=()=>weights.reduce((sum,value)=>sum+value,0);
  const soundWeights=()=>enabled?[weights[0],weights[1],weights[2]+1-coverage()]:[0,0,1];
  const ready=Promise.all(images.map((img,i)=>new Promise(resolve=>{
    function done(ok){available[i]=ok;resolve(ok);}
    if(img.complete)done(img.naturalWidth>0);
    else {img.addEventListener('load',()=>done(true),{once:true});img.addEventListener('error',()=>done(false),{once:true});}
  }))).then(async()=>{
    loaded=true;
    buttons.forEach(button=>{button.disabled=!available[Number(button.dataset.journey)];});
    if(!available.every(Boolean))$('#sky-render-note').textContent='部分山河画卷暂未载入，仍可进入星空观测。';
    await motion.load(images.map((img,i)=>available[i]?img:null));
    if(chapter<3&&!available[chapter]&&!opening)observe();else render();
  });
  function render(){
    const shot=opening?journeyShot(progress):null;
    if(shot){
      weights=[shot.cloud,shot.river,shot.sky].map((weight,i)=>available[i]?weight:0);
    }else if(transition){
      const p=clamp((performance.now()-transition.start)/1800),t=ease(p);
      weights=transition.from.map((weight,i)=>weight+(transition.to[i]-weight)*t);
      if(p===1)transition=null;
      else if(!transitionFrame)transitionFrame=requestAnimationFrame(()=>{transitionFrame=0;render();});
    }
    const current=shot?shot.chapter:chapter,total=coverage();
    const active=enabled&&current<3&&available[current];
    stage.dataset.journey=active?'landscape':'sky';
    stage.dataset.journeyChapter=current<3?JOURNEY_CHAPTERS[current].name:'星空观测';
    surface.hidden=!enabled||!available.some(Boolean)||total<.001;surface.inert=!active;
    surface.setAttribute('aria-hidden',String(!active));
    $('#starfield').inert=active;$('#starfield').setAttribute('aria-hidden',String(active));
    surface.style.opacity=String(total);surface.style.pointerEvents=active?'auto':'none';
    $('#sky-zoom-in').setAttribute('aria-label',active?'拉近山河':'放大星空');
    $('#sky-zoom-out').setAttribute('aria-label',active?'拉远山河':'缩小星空');
    if(enabled&&total>.001){
      const time=reduced.matches?0:last?.time||0;
      const bounds=surface.getBoundingClientRect(),rects=[];
      images.forEach((img,i)=>{
        img.setAttribute('aria-hidden',String(i!==current));
        // Over-compositing retains an opaque fallback, even during interrupted dissolves.
        const lower=weights.slice(0,i+1).reduce((a,b)=>a+b,0);
        img.style.opacity=String(available[i]&&lower>.001?weights[i]/lower:0);
        const scale=1.04+.010*Math.sin(time*.027)+zoom*.14;
        const x=Math.sin(time*.035)*.3+pan.x*1.1,y=Math.cos(time*.023)*.2+pan.y*.9;
        img.style.transform=`translate3d(${x}%,${y}%,0) scale(${scale})`;
        rects.push(photographicRect(bounds.width,bounds.height,scale,x,y));
      });
      motion.frame({time,rects,weights:weights.map(weight=>weight/total)});
    }
    caption.hidden=!active;caption.style.opacity=String(shot?.caption??1);
    if(lastChapter!==current){
      lastChapter=current;
      if(current<3){
        const scene=JOURNEY_CHAPTERS[current];number.textContent=`0${current+1} / 山河长卷`;
        title.textContent=scene.title;line.textContent=scene.line;
      }
      buttons.forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.journey)===current)));
    }
    returnButton.hidden=opening||!active;
    onBlend(soundWeights());
  }
  function select(index){
    chapter=index;
    if(loaded&&chapter<3&&!available[chapter])chapter=3;
    opening=false;pan={x:0,y:0};zoom=0;
    const target=[0,1,2].map(i=>i===chapter?1:0);
    if(reduced.matches||!last){weights=target;transition=null;}
    else transition={from:[...weights],to:target,start:performance.now()};
    render();
  }
  function choose(index){select(Number.isInteger(index)&&index>=0&&index<3?index:2);}
  function observe(){select(3);}
  function navigate(index){onNavigate(index);choose(index);}
  function enterObservation(){onNavigate(3);observe();onObserve();$('#starfield').focus({preventScroll:true});}
  buttons.forEach(button=>button.addEventListener('click',()=>navigate(Number(button.dataset.journey))));
  returnButton.addEventListener('click',enterObservation);
  surface.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    if(opening)navigate(journeyShot(progress).chapter);
    drag={x:event.clientX,y:event.clientY};surface.setPointerCapture(event.pointerId);surface.classList.add('dragging');
  });
  surface.addEventListener('pointermove',event=>{
    if(!drag)return;
    const r=surface.getBoundingClientRect();
    pan.x=Math.max(-1,Math.min(1,pan.x+(event.clientX-drag.x)/r.width*8));
    pan.y=Math.max(-1,Math.min(1,pan.y+(event.clientY-drag.y)/r.height*8));
    drag={x:event.clientX,y:event.clientY};render();
  });
  const release=()=>{drag=null;surface.classList.remove('dragging');};
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>surface.addEventListener(name,release));
  surface.addEventListener('wheel',event=>{event.preventDefault();if(opening)navigate(journeyShot(progress).chapter);zoom=clamp(zoom+(event.deltaY>0?-.07:.07));render();},{passive:false});
  surface.addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();navigate((chapter+(event.key==='ArrowRight'?1:2))%3);}
    if(event.key==='Escape')enterObservation();
  });
  reduced.addEventListener('change',()=>{
    if(reduced.matches){if(opening)choose(2);else select(chapter);}
    onRefresh();
  });
  return {ready,choose,observe,
    begin(){opening=true;progress=0;transition=null;pan={x:0,y:0};zoom=0;render();},
    progress(value){progress=value;},
    finish(){choose(2);},
    enabled(value){enabled=value;render();},
    frame(value){last=value;render();},
    zoom(value){zoom=clamp(zoom+value);render();},
    get isLandscape(){return enabled&&!opening&&chapter<3;},
    get covered(){return enabled&&coverage()>.999&&available.some(Boolean);},
    get weights(){return soundWeights();},
  };
}
