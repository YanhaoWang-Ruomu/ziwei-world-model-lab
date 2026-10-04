import {SCOPE_NAMES} from './chart-engine.mjs';
import {chartIdentity,starMutations,palaceLayers,palaceLayerLabel,palaceLayerTitle} from './chart-insights.mjs';
import {orreryMarkup,meteorMarkup,flightCurve,clearSquareFlights,arrowMarkup,FLIGHT_COLORS} from './chart-motion.mjs';
import {palaceAngle,palaceStemBranch} from './chart-projection.mjs';
import {starCelestialIds} from './palace-resonance.mjs';
const colors=FLIGHT_COLORS;
const polar=(r,a)=>[450+r*Math.sin(a*Math.PI/180),450-r*Math.cos(a*Math.PI/180)];
function wedge(i){const a=palaceAngle(i)-14.65,b=palaceAngle(i)+14.65;return `M${polar(371,a)} A371 371 0 0 1 ${polar(371,b)} L${polar(222,b)} A222 222 0 0 0 ${polar(222,a)} Z`;}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderCelestialWheel(container,{result,cycle,scope,selected,flights=[],visibleLayers=null,intrinsic=[],onSelect,onStar,onDetails}){
  clearSquareFlights();
  const palaces=result.chart.palaces,layer=scope==='natal'?null:cycle?.[scope],related=Number.isInteger(selected)?[4,6,8].map(d=>(selected+d)%12):[];
  const label=scope==='decadal'&&layer?.name==='童限'?'童限':SCOPE_NAMES[scope];
  let svg='<svg class="celestial-wheel" viewBox="0 0 900 900" role="group" aria-label="命运轮盘，点击宫位查看星曜与三方四正。方向键可选择相邻宫位。"><defs><radialGradient id="wheel-halo"><stop stop-color="#27405a" stop-opacity=".7"/><stop offset=".6" stop-color="#101e33"/><stop offset="1" stop-color="#060c16"/></radialGradient><radialGradient id="wheel-heart"><stop stop-color="#1e334a"/><stop offset="1" stop-color="#080f1c"/></radialGradient>';
  svg+='<pattern id="wheel-silk" patternUnits="userSpaceOnUse" width="900" height="900"><rect width="900" height="900" fill="#091b22"/><image href="./assets/cosmic-silk.png" width="900" height="900" preserveAspectRatio="xMidYMid slice" opacity=".55"/></pattern><linearGradient id="wheel-antique-gold" x2=".8" y2="1"><stop stop-color="#f0d799"/><stop offset=".4" stop-color="#786743"/><stop offset=".7" stop-color="#d4b776"/><stop offset="1" stop-color="#837047"/></linearGradient><pattern id="wheel-galaxy-grain" patternUnits="userSpaceOnUse" width="900" height="900"><image href="./assets/cosmic-silk.png" width="900" height="900" preserveAspectRatio="xMidYMid slice"/></pattern>';
  colors.forEach((color,i)=>{svg+=`<marker id="flight-arrow-${i}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="${color}"/></marker>`;});
  svg+='</defs><circle class="atlas-wheel-aura" cx="450" cy="450" r="439"/><circle class="atlas-wheel-base" cx="450" cy="450" r="429"/><g class="wheel-procession" aria-hidden="true"><circle cx="450" cy="450" r="438" stroke-dasharray="70 94 4 240"/><circle cx="450" cy="450" r="417" stroke-dasharray="2 17"/><circle cx="450" cy="12" r="3" fill="#e7d1a1"/></g><g class="wheel-procession reverse" aria-hidden="true"><circle cx="450" cy="450" r="205" stroke-dasharray="60 20 2 15"/><circle cx="450" cy="245" r="3" fill="#98cede"/></g>';
  for(const r of [432,423,411,388,380,212,198,145,138])svg+=`<circle class="atlas-wheel-ring" cx="450" cy="450" r="${r}"/>`;
  svg+='<g class="atlas-wheel-ticks" aria-hidden="true">';
  for(let i=0;i<180;i++)svg+=`<path d="M${polar(i%15===0?405:i%5===0?414:419,i*2)}L${polar(426,i*2)}" opacity="${i%15===0?1:.45}"/>`;
  svg+='</g><g class="atlas-wheel-orbits" aria-hidden="true">';
  for(const a of [30,90,150])svg+=`<ellipse cx="450" cy="450" rx="190" ry="71" transform="rotate(${a} 450 450)"/>`;
  svg+='</g>';
  for(const p of palaces){
    const a=palaceAngle(p.index),pos=polar(295,a),branch=polar(397,a),isHit=flights.some(f=>f.targetIndex===p.index);
    svg+=`<g class="wheel-sector ${selected===p.index?'selected':related.includes(p.index)?'related':''} ${isHit?'flight-target':''}" data-palace="${p.index}" data-branch="${p.earthlyBranch}" data-stem="${p.heavenlyStem}" role="button" tabindex="${(selected??0)===p.index?0:-1}" aria-pressed="${selected===p.index}" aria-label="${escape(p.name)}宫，${escape(palaceStemBranch(p))}，${escape(p.majorStars.map(s=>s.name).join('、')||'无主星')}"><path class="sector-wedge" d="${wedge(p.index)}"/><text class="branch" x="${branch[0]}" y="${branch[1]+6}"><title>本命宫干支 · 与十二宫方盘同源</title>${escape(palaceStemBranch(p))}</text>`;
    const layers=palaceLayers(p,cycle,scope,visibleLayers),targets=flights.filter(f=>f.targetIndex===p.index);
    svg+=`<path class="sector-galaxy" d="${wedge(p.index)}" fill="url(#wheel-galaxy-grain)" aria-hidden="true"/>`;
    const stars=[...p.majorStars,...p.minorStars,...p.adjectiveStars].filter(s=>p.majorStars.includes(s)||(p.minorStars.includes(s)&&starCelestialIds(s.name).length)||starMutations(s,cycle,scope,true,visibleLayers).length||targets.some(f=>f.star===s.name));
    // Size the block from all its rows. No star or upstream mutation is sliced off.
    const rows=stars.map(s=>({star:s,marks:[...starMutations(s,cycle,scope,true,visibleLayers),...targets.filter(f=>f.star===s.name).map(f=>({key:'flight',name:f.sourceName+'宫干飞化',short:'飞',mutagen:f.mutagen}))]}));
    const height=32+Math.ceil(layers.length/2)*15+rows.reduce((n,r)=>n+23+Math.ceil(r.marks.length/3)*15,0)+(!stars.length?23:0);
    const scale=Math.min(1,142/height),top=-height/2;
    svg+=`<g class="wheel-palace-content" transform="translate(${pos[0]} ${pos[1]}) scale(${scale})"><text class="wheel-natal-name" x="0" y="${top+20}"><title>本命 · ${escape(p.name)}</title>${!visibleLayers||visibleLayers.includes('natal')?escape(p.name):escape(palaceStemBranch(p))}</text>`;
    let y=top+37;
    layers.forEach((l,i)=>{const x=layers.length===1?0:i%2?29:-29;svg+=`<text class="wheel-time-layer${l.key===scope?' current':''}${l.life?' scope-life':''}" data-layer="${l.key}" x="${x}" y="${y+Math.floor(i/2)*15}" style="--layer-color:${l.color}"><title>${escape(palaceLayerTitle(l))}</title>${escape(palaceLayerLabel(l))}</text>`;});
    y=top+29+Math.ceil(layers.length/2)*15;
    svg+=`<path class="wheel-content-divider" d="M-44 ${y+3}H44"/>`;
    if(!stars.length)svg+=`<text class="wheel-layer-star" x="0" y="${y+16}">无主星</text>`;
    for(const {star:s,marks} of rows){
      const hit=targets.find(f=>f.star===s.name),color=hit?colors[['禄','权','科','忌'].indexOf(hit.mutagen)]:null;
      y+=20;svg+=`<g data-star="${escape(s.name)}" role="button" tabindex="0" aria-label="点亮${escape(s.name)}对应的天仪星辰"><rect class="wheel-star-hit" x="-48" y="${y-15}" width="96" height="20" rx="3"/><text class="wheel-layer-star${hit?' flight-star':''}" ${hit?`data-flight-mutagen="${hit.mutagen}" style="--star-mutagen-color:${color}"`:''} x="0" y="${y}">${escape(s.name)}</text>`;
      for(let i=0;i<marks.length;i+=3){y+=15;const line=marks.slice(i,i+3);line.forEach((m,j)=>{const x=(j-(line.length-1)/2)*31;svg+=`<g class="wheel-mutagen-chip" style="--mutagen-color:${colors[['禄','权','科','忌'].indexOf(m.mutagen)]}"><rect x="${x-14}" y="${y-10.5}" width="28" height="13" rx="2"/><text class="wheel-layer-mutagen" data-layer="${m.key}" data-mutagen="${m.mutagen}" x="${x}" y="${y}"><title>${escape(m.name+' · '+s.name+'化'+m.mutagen)}</title>${m.short+m.mutagen}</text></g>`;});}y+=3;svg+='</g>';
    }
    svg+='</g></g>';
  }
  const start=polar(209,palaceAngle(selected??0));
  for(const i of related)svg+=`<path class="wheel-connection" d="M${start}L${polar(209,palaceAngle(i))}"/>`;
  for(const [i,f] of flights.entries()){
    const a=polar(215,palaceAngle(f.sourceIndex)),b=polar(215,palaceAngle(f.targetIndex));
    if(f.self){const from=polar(427,palaceAngle(f.sourceIndex)),to=polar(452,palaceAngle(f.sourceIndex));svg+=meteorMarkup(`M${from}L${to}`,i,from,to);}
    else svg+=meteorMarkup(flightCurve(a,b,[450,450],i),i,a,b);
  }
  intrinsic.forEach((f,i)=>{const a=palaceAngle(f.sourceIndex)+(i%2?2:-2),out=f.direction==='outward';svg+=`<g data-transform="${f.direction}" data-source="${f.sourceIndex}"><title>${escape(f.star+' '+(out?'离心自化':'向心自化')+f.mutagen)}</title>${arrowMarkup(polar(out?429:220,a),polar(out?452:191,a),f.mutagen,i)}</g>`;});
  const current=Number.isInteger(selected)?palaces[selected]:null;
  svg+='<circle class="atlas-wheel-heart" cx="450" cy="450" r="134"/><circle class="atlas-wheel-ring" cx="450" cy="450" r="124"/><path class="atlas-heart-mark" d="M450 313L456 322L450 331L444 322Z M450 569L456 578L450 587L444 578Z"/>';
  svg+=`<g class="wheel-heart-orrery" transform="translate(246 246) scale(.68)">${orreryMarkup('wheel')}</g>`;
  svg+='<g class="wheel-orrery-expand" data-open-orrery role="button" tabindex="0" aria-label="展开太阳系与南北斗" aria-haspopup="dialog"><circle cx="537" cy="370" r="17"/><text x="537" y="376">⤢</text></g>';
  svg+=`<text class="atlas-wheel-kicker" x="450" y="376">观 天 · 察 命</text><text class="wheel-center-meta" x="450" y="409">${current?escape(palaceStemBranch(current))+' · ':''}${escape(label)}</text><text class="wheel-center-text" x="454" y="465">${escape(current?(layer?layer.palaceNames[selected]:current.name):'全盘总览')}</text><text class="wheel-center-meta" x="450" y="502">${escape(chartIdentity(result.chart))}</text><text class="atlas-wheel-kicker" x="450" y="535">本命宫干 · 随盘计算</text>`;
  if(layer){const pos=polar(435,palaceAngle(layer.index));svg+=`<circle class="year-ring-marker" cx="${pos[0]}" cy="${pos[1]}" r="5"><title>${escape(label)}命宫</title></circle>`;}
  svg+='</svg>';
  if(current){
    svg+=`<section class="wheel-mobile-reading" aria-label="选宫放大阅读"><header><strong>${escape(current.name)} · ${escape(palaceStemBranch(current))}</strong><button type="button" data-reader-details>完整资料 ↗</button></header><p class="wheel-reader-layers">${palaceLayers(current,cycle,scope,visibleLayers).map(l=>`<span style="color:${l.color}">${escape(palaceLayerLabel(l))}</span>`).join('')}</p><div class="wheel-reader-stars">`;
    for(const s of [...current.majorStars,...current.minorStars]){
      const marks=[...starMutations(s,cycle,scope,true,visibleLayers),...flights.filter(f=>f.targetIndex===selected&&f.star===s.name).map(f=>({short:'飞',mutagen:f.mutagen,name:f.sourceName+'宫干飞化'}))];
      svg+=`<div><button type="button" data-reader-star="${escape(s.name)}">${escape(s.name)}</button>${marks.map(m=>`<span style="--mutagen-color:${colors[['禄','权','科','忌'].indexOf(m.mutagen)]}" title="${escape(m.name)}">${m.short+m.mutagen}</span>`).join('')}</div>`;
    }
    svg+='</div></section>';
  }
  container.innerHTML=svg;
  container.querySelector('[data-reader-details]')?.addEventListener('click',()=>onDetails?.());
  for(const star of container.querySelectorAll('[data-reader-star]'))star.addEventListener('click',()=>onStar?.(selected,star.dataset.readerStar));
  for(const star of container.querySelectorAll('[data-star]')){
    const activate=()=>onStar?.(Number(star.closest('[data-palace]').dataset.palace),star.dataset.star);
    star.addEventListener('click',e=>{e.stopPropagation();activate();});
    star.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();activate();}});
  }
  for(const g of container.querySelectorAll('[data-palace]')){
    g.addEventListener('click',()=>onSelect(Number(g.dataset.palace)));
    g.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;e.preventDefault();const d=['ArrowLeft','ArrowUp'].includes(e.key)?-1:['ArrowRight','ArrowDown'].includes(e.key)?1:0;onSelect((Number(g.dataset.palace)+d+12)%12);if(!document.querySelector('#palace-dialog[open]'))container.querySelector('[tabindex="0"]')?.focus({preventScroll:true});});
  }
}
