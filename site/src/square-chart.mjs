import {PALACE_GRID,annualAges} from './chart-engine.mjs';
import {starMutations,chartIdentity,transformationLabel,palaceLayers,palaceLayerLabel,palaceLayerTitle} from './chart-insights.mjs';
import {orreryMarkup,squareFlightOverlay} from './chart-motion.mjs';
import {palaceStemBranch} from './chart-projection.mjs';
import {starCelestialIds} from './palace-resonance.mjs';
import {FLIGHT_COLORS} from './chart-motion.mjs';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const mutations=['禄','权','科','忌'];
export function renderSquareChart(container,{result,cycle,selected,scope,onSelect,onStar,onDetails,onDecade,decadeKeys,flights=[],visibleLayers=null,intrinsic=[]}){
  const chart=result.chart,related=Number.isInteger(selected)?[4,6,8].map(d=>(selected+d)%12):[];
  const board=el('div','square-chart');board.dataset.scope=scope;board.setAttribute('role','group');board.setAttribute('aria-label','十二宫方盘：地支位置固定，宫干与星曜由出生资料计算');
  for(const p of chart.palaces){
    const hits=flights.filter(f=>f.targetIndex===p.index);
    const cell=el('article',`square-palace${selected===p.index?' selected':related.includes(p.index)?' related':''}${hits.length?' flight-target':''}${flights[0]?.sourceIndex===p.index?' flight-source':''}`);cell.dataset.palace=p.index;cell.dataset.branch=p.earthlyBranch;cell.dataset.stem=p.heavenlyStem;cell.style.setProperty('--palace-texture-x',`${(p.index*23)%100}%`);
    const [row,col]=PALACE_GRID[p.earthlyBranch];cell.style.gridRow=row;cell.style.gridColumn=col;cell.setAttribute('aria-label',`${p.heavenlyStem}${p.earthlyBranch} ${p.name}`);
    cell.addEventListener('click',e=>{if(!e.target.closest('[data-decade]'))onSelect(p.index);});
    cell.addEventListener('keydown',e=>{if(!e.target.closest('.palace-select'))return;if(['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const d=['ArrowUp','ArrowLeft'].includes(e.key)?-1:['ArrowDown','ArrowRight'].includes(e.key)?1:0;onSelect((p.index+d+12)%12);if(!document.querySelector('#palace-dialog[open]'))container.querySelector('.palace-select[tabindex="0"]')?.focus({preventScroll:true});}});
    const title=el('button','palace-corner palace-select');title.type='button';title.tabIndex=p.index===(selected??0)?0:-1;title.setAttribute('aria-pressed',String(p.index===selected));title.setAttribute('aria-label',`${palaceStemBranch(p)} ${p.name}${p.name.endsWith('宫')?'':'宫'}，选中并查看三方四正`);title.append(el('span','',palaceStemBranch(p)),el('strong','',p.name),el('small','',p.isBodyPalace?'身宫':''));title.querySelector('strong').hidden=!!visibleLayers&&!visibleLayers.includes('natal');cell.append(title);
    const stars=el('div','square-stars');
    for(const [kind,list]of [['primary',p.majorStars],['auxiliary',p.minorStars],['small',p.adjectiveStars]])for(const star of list){
      const col=el('span',`star-column ${kind} ${star.type==='tough'?'tough':''}`);col.dataset.star=star.name;const linked=starCelestialIds(star.name).length>0;col.dataset.celestialLinked=String(linked);const starButton=el('button','star-name',star.name);starButton.type='button';starButton.setAttribute('aria-label',linked?`点亮${star.name}对应的天仪星辰`:`查看${star.name}资料`);starButton.addEventListener('click',e=>{e.stopPropagation();onStar?.(p.index,star.name);if(!linked)onDetails?.();});col.append(starButton);if(star.brightness)col.append(el('small','star-brightness',star.brightness));
      const badges=el('span','star-mutations');
      for(const m of starMutations(star,cycle,scope,true,visibleLayers)){const current=m.key==='natal'||m.key===scope;const badge=el('b',(m.key==='natal'?'natal-mutagen':'scope-mutagen')+(current?'':' context-mutagen'),m.short+m.mutagen);badge.dataset.layer=m.key;badge.dataset.mutagen=m.mutagen;badge.title=`${m.name} · ${star.name}化${m.mutagen}`;badge.setAttribute('aria-label',badge.title);badges.append(badge);col.classList.add('has-mutagen','mobile-relevant');}
      const permanent=intrinsic.filter(f=>f.targetIndex===p.index&&f.star===star.name);
      const hit=hits.find(f=>f.star===star.name);
      if(hit){col.classList.add('flight-star','mobile-relevant');col.dataset.flightMutagen=hit.mutagen;col.style.setProperty('--star-mutagen-color',FLIGHT_COLORS[mutations.indexOf(hit.mutagen)]);col.title=`${hit.sourceName}宫干引动 · ${star.name}化${hit.mutagen}`;}
      for(const f of permanent){const badge=el('b','intrinsic-mutagen '+f.direction,(f.direction==='outward'?'↗':'↘')+f.mutagen);badge.dataset.mutagen=f.mutagen;badge.dataset.direction=f.direction;badge.title=transformationLabel(f);badge.setAttribute('aria-label',badge.title);badges.append(badge);col.classList.add('has-mutagen','mobile-relevant');}
      for(const f of hits.filter(f=>f.star===star.name&&!permanent.some(m=>m.sourceIndex===f.sourceIndex&&m.mutagen===f.mutagen))){const badge=el('b','flight-mutagen','飞'+f.mutagen);badge.dataset.mutagen=f.mutagen;badge.title=`${f.sourceName}宫${f.stem}干化${f.mutagen}`;badge.setAttribute('aria-label',badge.title);badges.append(badge);col.classList.add('has-mutagen','flight-star','mobile-relevant');}
      if(badges.children.length>3)col.classList.add('mobile-many-mutations');
      if(badges.childNodes.length){
        badges.tabIndex=0;badges.setAttribute('role','button');badges.setAttribute('aria-label',`查看${star.name}的四化来源与宫位完整资料`);
        const show=()=>{onSelect(p.index);onDetails?.();};
        badges.addEventListener('click',e=>{e.stopPropagation();show();});
        badges.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();show();}});
        col.append(badges);
      }stars.append(col);
    }
    if(!p.majorStars.length)stars.append(el('small','empty-major','无主星'));cell.append(stars);cell.append(el('small','palace-compact-note',`辅 ${p.minorStars.length} · 杂 ${p.adjectiveStars.length}`));
    const layers=palaceLayers(p,cycle,scope,visibleLayers);
    if(layers.length){const stack=el('div','palace-time-layers');stack.setAttribute('aria-label','逐层宫位');
      for(const l of layers){const item=el('span','palace-time-layer'+(l.key===scope?' current':'')+(l.life?' scope-life':''));item.dataset.layer=l.key;item.style.setProperty('--layer-color',l.color);item.title=palaceLayerTitle(l);item.setAttribute('aria-label',item.title);item.append(el('span','layer-palace-name',palaceLayerLabel(l)));if(l.stars.length)item.append(el('small','layer-flow-stars',l.stars.map(s=>s.name).join(' ')));stack.append(item);}cell.append(stack);
    }
    if(p.isOriginalPalace){const marker=el('span','original-palace','来因');marker.title='来因宫 · 依当前排盘引擎口径';cell.append(marker);}
    const ages=el('div','palace-age-lists');for(const [label,values,cls]of [['流年',annualAges(chart,p.earthlyBranch),'annual-age-list'],['小限',p.ages,'small-age-list']]){const line=el('p',cls);line.append(el('span','age-list-label',label));values.forEach((n,i)=>line.append(el('span','age-number',(i?'· ':'')+n)));ages.append(line);}cell.append(ages);
    const foot=el('div','palace-calendars'),decade=el('button','decade-range');decade.type='button';decade.dataset.decade=p.index;
    decade.disabled=!decadeKeys?.has(String(p.index));decade.setAttribute('aria-label',`查看${p.decadal.range.join('至')}岁大限 · ${p.earthlyBranch}${p.name}`);
    decade.title=decade.disabled?'此大限超出本页支持的日期范围':'点击切换到此人的这一步大限';
    decade.setAttribute('aria-pressed',String(scope!=='natal'&&cycle?.decadal.name!=='童限'&&cycle?.decadal.index===p.index));
    decade.addEventListener('click',e=>{e.stopPropagation();onDecade?.(p.index);});
    decade.append(el('span','',`${p.decadal.range[0]}–${p.decadal.range[1]}`),el('span','decade-unit','岁'));foot.append(decade,el('span','',`${p.changsheng12} · ${p.boshi12}`),el('span','',`${p.suiqian12} · ${p.jiangqian12}`));cell.append(foot);board.append(cell);
  }
  const center=el('div','square-center'),seal=el('div','center-astrolabe');seal.setAttribute('aria-hidden','true');seal.innerHTML=orreryMarkup('square');center.append(seal,el('p','panel-overline','ZIWEI · 十二宫天仪'),el('h2','',result.input.name?.trim()||'无名'),el('p','center-identity',chartIdentity(chart)));
  const expand=el('button','orrery-expand','⤢');expand.type='button';expand.dataset.openOrrery='';expand.title='展开太阳系与南北斗';expand.setAttribute('aria-label',expand.title);expand.setAttribute('aria-haspopup','dialog');center.append(expand);
  const list=el('dl','center-birth');for(const [label,value]of [['公历',`${result.normalized.date} ${result.normalized.time}`],['农历',`${chart.lunarDate} ${chart.time}`],['命主 / 身主',`${chart.soul} / ${chart.body}`],['命宫 / 身宫',`${chart.earthlyBranchOfSoulPalace} / ${chart.earthlyBranchOfBodyPalace}`]]){const row=el('div');row.append(el('dt','',label),el('dd','',value));list.append(row);}center.append(list);
  const pillars=el('div','chart-pillars');for(const [i,key]of ['yearly','monthly','daily','hourly'].entries()){const item=el('div');item.append(el('small','',['年','月','日','时'][i]),el('strong','',chart.rawDates.chineseDate[key].join('')));pillars.append(item);}center.append(pillars);
  center.append(el('div','square-cycle-slot'));
  const layerLegend=el('p','center-layer-legend');
  for(const l of palaceLayers(chart.palaces[0],cycle,scope,visibleLayers)){const key=el('span','',`${l.short}·${l.name}`);key.style.setProperty('--layer-color',l.color);layerLegend.append(key);}
  if(layerLegend.childNodes.length)center.append(layerLegend);
  const focus=Number.isInteger(selected)?chart.palaces[selected]:null;
  center.append(el('p','center-convention',`${result.config.dayDivide==='forward'?'23时':'0时'}换日 · 农历正月初一换年\n小限、流年数字均为虚岁。`));
  const legend=el('p','intrinsic-legend');legend.append(el('span','','↗ 离心自化'),el('span','','↘ 对宫引动'));center.append(legend);
  const colorKey=el('p','mutagen-color-key');mutations.forEach((m,i)=>{const item=el('span','',m);item.style.color=FLIGHT_COLORS[i];colorKey.append(item);});center.append(colorKey);
  if(focus){const detail=el('button','center-palace-details',`${focus.name} · 详情`);detail.type='button';detail.addEventListener('click',()=>onDetails?.());center.append(detail);}
  board.append(center);container.replaceChildren(board);squareFlightOverlay(board,flights,intrinsic,selected);
}
