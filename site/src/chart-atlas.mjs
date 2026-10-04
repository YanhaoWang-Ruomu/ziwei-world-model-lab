import {activeLayers,palaceFlights,relatedPalaces} from './chart-insights.mjs';
import {LAYER_KEYS,LAYER_NAMES,LAYER_STORAGE,availableLayerKeys,visibleLayerKeys,loadLayerPreferences} from './chart-layer-selection.mjs';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function initChartAtlas({getState,onChange,onPalace,onFlightTarget,onCloseDetails,onMotion,onReset}){
  const stage=document.querySelector('#chart-stage'),deck=stage.querySelector('.wheel-deck'),wheel=document.querySelector('#destiny-wheel');
  const toolbar=el('div','atlas-toolbar');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','观盘工具');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),options={flights:true,detail:'all',motion:!reduced.matches};
  try{options.layers=loadLayerPreferences(localStorage);}catch{options.layers={count:3,selections:{}};}
  const makeButton=(id,text,fn)=>{const b=el('button','',text);b.id=id;b.type='button';b.addEventListener('click',fn);return b;};
  const focus=makeButton('chart-focus','专注观盘 ⛶',()=>openFocus());focus.setAttribute('aria-haspopup','dialog');
  const enlarge=makeButton('chart-enlarge','放大细览',()=>{const value=wheel.dataset.reading!=='large';wheel.dataset.reading=value?'large':'overview';enlarge.setAttribute('aria-pressed',String(value));enlarge.textContent=value?'回到全盘':'放大细览';});enlarge.setAttribute('aria-pressed','false');
  const fly=makeButton('chart-fly','宫干飞化',()=>{options.flights=!options.flights;fly.setAttribute('aria-pressed',String(options.flights));onChange({...options});});fly.setAttribute('aria-pressed','true');
  const reset=makeButton('chart-reset-selection','全盘总览',()=>onReset());
  const motion=makeButton('chart-motion','星轨律动',()=>{options.motion=!options.motion;syncMotion();});
  function syncMotion(){const enabled=options.motion&&!reduced.matches;stage.dataset.motion=enabled?'running':'paused';motion.setAttribute('aria-pressed',String(enabled));motion.textContent=enabled?'星轨律动':'星轨静止';motion.title=enabled?'暂停背景、天仪与飞化动画':'开启背景、天仪与飞化动画';onMotion?.(enabled);}
  reduced.addEventListener('change',()=>{if(reduced.matches)options.motion=false;syncMotion();});
  document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('page-hidden',document.hidden);});syncMotion();
  const label=el('label','atlas-select','星曜 '),detail=el('select');detail.setAttribute('aria-label','星曜显示');
  detail.append(new Option('全部星曜','all'),new Option('主星与辅曜','main'));detail.addEventListener('change',()=>{options.detail=detail.value;wheel.dataset.detail=detail.value;onChange({...options});});label.append(detail);
  const stacking=el('fieldset','atlas-layer-settings');stacking.append(el('legend','','宫位与四化叠层'));
  const countLabel=el('label','','显示层数 '),count=el('select');count.id='chart-layer-count';count.setAttribute('aria-label','显示层数');
  for(const n of [3,4,5])count.append(new Option(n+'级',String(n)));count.value=String(options.layers.count);countLabel.append(count);
  const choices=el('div','atlas-layer-choices'),status=el('p','atlas-layer-status');status.setAttribute('role','status');
  const apply=makeButton('chart-layers-apply','应用所选层级',()=>{
    const {cycle,scope}=getState(),keys=[...choices.querySelectorAll('input:checked')].map(i=>i.value),needed=Math.min(options.layers.count,availableLayerKeys(cycle,scope).length);
    if(keys.length!==needed){status.textContent=`请选择 ${needed} 个层级，当前已选 ${keys.length} 个。`;return;}
    options.layers.selections[scope+':'+options.layers.count]=keys;saveLayers();
  });
  const automatic=makeButton('chart-layers-auto','恢复最近层级',()=>{const {scope}=getState();delete options.layers.selections[scope+':'+options.layers.count];saveLayers();});
  function saveLayers(){let saved=true;try{localStorage.setItem(LAYER_STORAGE,JSON.stringify(options.layers));}catch{saved=false;}onChange({...options});if(!saved)status.textContent+=' 当前浏览器不能保存设置，本次仍然有效。';}
  count.addEventListener('change',()=>{options.layers.count=Number(count.value);saveLayers();});
  function renderLayerSettings(cycle,scope){
    const available=availableLayerKeys(cycle,scope),visible=visibleLayerKeys(cycle,scope,options.layers);choices.replaceChildren();count.value=String(options.layers.count);
    for(const key of available){const label=el('label'),input=el('input');input.type='checkbox';input.value=key;input.checked=visible.includes(key);label.append(input,document.createTextNode(LAYER_NAMES[LAYER_KEYS.indexOf(key)]));choices.append(label);}
    choices.onchange=()=>{const n=choices.querySelectorAll('input:checked').length;status.textContent=`自选 ${Math.min(options.layers.count,available.length)} 级 · 已选 ${n} 级，点击应用生效。`;};
    status.textContent=(options.layers.selections[scope+':'+options.layers.count]?'自选层级':'自动最近层级')+'：'+visible.map(k=>LAYER_NAMES[LAYER_KEYS.indexOf(k)]).join(' · ');
  }
  stacking.append(countLabel,choices,apply,automatic,status);
  toolbar.append(focus,enlarge,fly,reset,motion,label,stacking);deck.querySelector('.chart-layout-switch').after(toolbar);
  const guide=el('p','atlas-reading-note','总览随屏幕适配；点宫位展开完整资料，放大细览可横向查看全星。');toolbar.after(guide);
  const insight=el('section','atlas-insights');insight.setAttribute('aria-label','宫位关系与四化去向');wheel.after(insight);

  const anchor=document.createComment('chart stage home');stage.before(anchor);
  const dialog=el('dialog');dialog.id='chart-focus-dialog';dialog.setAttribute('aria-label','专注观盘');
  const head=el('header','atlas-focus-heading');head.append(el('div','','观星台 · 十二宫天仪'),makeButton('chart-focus-close','返回工作台 ×',()=>dialog.close()));dialog.append(head);document.body.append(dialog);
  function openFocus(){onCloseDetails();dialog.append(stage);dialog.showModal();focus.hidden=true;dialog.scrollTop=0;}
  dialog.addEventListener('close',()=>{onCloseDetails();anchor.after(stage);focus.hidden=false;focus.focus({preventScroll:true});});
  return {
    options,
    close(){if(dialog.open)dialog.close();},
    render(){
      const {result,cycle,scope,selected,flightSource,layout}=getState();insight.replaceChildren();
      renderLayerSettings(cycle,scope);stacking.disabled=!result;
      label.hidden=layout==='wheel';
      guide.textContent=layout==='wheel'?'轮盘展示主星与宫位关系；点宫位查看完整资料，开启宫干飞化可观察去向光轨。':'总览随屏幕适配；点宫位展开完整资料，放大细览可横向查看全星。';
      for(const control of [fly,enlarge,detail])control.disabled=!result;
      reset.disabled=!Number.isInteger(selected);
      if(!result)return;
      if(!Number.isInteger(selected)){insight.append(el('p','atlas-layer-note','全盘总览 · 向外箭头为离心自化，向内箭头为本宫宫干飞入对宫。点宫位查看三方四正与四化去向。'));return;}
      const relation=el('div','atlas-relations');
      relation.append(el('p','atlas-section-label','三方四正'));
      for(const {palace,relation:kind} of relatedPalaces(result.chart,selected)){
        const b=makeButton('',`${kind} · ${palace.name}`,()=>onPalace(palace.index));b.removeAttribute('id');b.setAttribute('aria-pressed',String(palace.index===selected));
        b.append(el('small','',`${palace.heavenlyStem}${palace.earthlyBranch} · ${palace.majorStars.map(s=>s.name).join('、')||'无主星'}`));relation.append(b);
      }
      insight.append(relation);
      if(options.flights){
        const flights=palaceFlights(result,flightSource??selected),section=el('div','atlas-flights');
        const source=result.chart.palaces[flightSource??selected];section.append(el('p','atlas-section-label',`${source.heavenlyStem}${source.earthlyBranch} · ${source.name} · 宫干飞化`));
        for(const f of flights){const b=makeButton('',`化${f.mutagen} · ${f.star}`,()=>onFlightTarget(f.targetIndex));b.removeAttribute('id');b.dataset.mutagen=f.mutagen;b.append(el('small','',`${f.self?'本宫自化':'飞入 '+f.targetName} · ${f.branch}`));section.append(b);}
        const note=el('p','atlas-flight-note','点其他宫位更换飞化来源；点上方四化卡查看去向，保留来源。宫干飞化与生年、运限四化分别显示。');section.append(note);insight.append(section);
      }
      const keys=visibleLayerKeys(cycle,scope,options.layers);
      insight.append(el('p','atlas-layer-note','显示：'+keys.map(k=>LAYER_NAMES[LAYER_KEYS.indexOf(k)]).join(' → ')));
    },
  };
}
