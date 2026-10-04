import {SOLAR_PLANETS,SMALL_BODIES,MOON,ORRERY_STARS,NORTH_HIDDEN_STARS,projectAsterism,traditionalName} from './orrery-data.mjs';
import {NORTH_LINES,SOUTH_LINES,WENCHANG_LINES} from './star-profiles.mjs';
// A ceremonial overview, not a scale model or an ephemeris.
const BODIES=[...SOLAR_PLANETS,...SMALL_BODIES];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function surface(id,r){
  if(['mercury','moon','ceres'].includes(id))return Array.from({length:19},(_,i)=>{
    const a=i*2.399,d=Math.sqrt((i+.5)/20)*r*.94,x=Math.cos(a)*d,y=Math.sin(a)*d,s=.38+(i%4)*.2;
    return `<circle cx="${x}" cy="${y}" r="${s}" fill="#4c4c4b" opacity=".42"/><path d="M${x-s} ${y}a${s} ${s} 0 0 1 ${s*2} 0" fill="none" stroke="#e7ded1" stroke-width=".22" opacity=".55"/>`;
  }).join('');
  if(id==='venus')return `<g fill="none" stroke-linecap="round"><path d="M-10-4Q-4-7 1-2T11 0M-10 0Q-4-3 1 2T11 5" stroke="#fff0c6" stroke-width="2" opacity=".4"/><path d="M-8-6Q-2-5 3-1T9 2M-9 3Q-3 1 1 5T9 6" stroke="#ae845d" stroke-width=".65" opacity=".45"/></g>`;
  if(id==='mars')return `<path d="M-7-3Q-2-6 0-3T5-2L3 1-1 2-4 0ZM-2 4L2 2 6 4 3 6Z" fill="#734737" opacity=".57"/><ellipse cy="-6" rx="2.7" ry="1.1" fill="#ede0cb" opacity=".78"/><path d="M-4-1L-1 0 1-1" fill="none" stroke="#e8aa7e" stroke-width=".4"/>`;
  if(id==='earth')return '<path d="M-6-4L-3-6 0-5 1-3-1-1-1 2-3 5-5 1-4-1ZM2-6L7-3 5 0 2 1 1-2ZM4 3L7 4 5 6 3 5Z" fill="#799e79"/><g fill="none" stroke="#eff8f7" stroke-width=".8" opacity=".7"><path d="M-9-3Q-3-5 1-1T9 0M-7 3Q-2 1 3 4T9 3"/></g><ellipse cy="-7" rx="3.4" ry=".8" fill="#eef5ec"/>';
  if(id==='uranus')return `<g fill="none" stroke="#def3e8" opacity=".2"><path d="M${-r}-3Q0-1 ${r}-3M${-r} 2Q0 4 ${r} 2" stroke-width="1.8"/></g>`;
  if(id==='neptune')return '<path d="M-10-4Q-2-2 10-4M-10 3Q0 5 10 3" fill="none" stroke="#abc6ec" stroke-width="1.1" opacity=".45"/><ellipse cx="3" cy="0" rx="2.8" ry="1.2" fill="#294d84" opacity=".5"/>';
  if(id==='pluto')return '<path d="M-3-1Q-1-3 0-1Q3-3 3 0L0 3Z" fill="#eee0c7" opacity=".8"/><path d="M-4 1L-2 2-1 4-4 4Z" fill="#876c60"/>';
  const colors=id==='jupiter'?['#b49078','#edcfac','#916e59','#e5c9aa','#ad7b5c','#f1d7b6','#a77861']:['#b29b78','#ead9b0','#c3ab82','#e7d3a9','#a8906c'];
  let bands=colors.map((c,i)=>{const y=-r+(i+.5)*2*r/colors.length;return `<path d="M${-r-2} ${y}Q0 ${y+2} ${r+2} ${y-.7}" fill="none" stroke="${c}" stroke-width="${r*.21}" opacity=".7"/>`;}).join('');
  if(id==='jupiter')bands+='<ellipse cx="4" cy="4.4" rx="3.2" ry="1.7" fill="#b96d51"/><ellipse cx="4" cy="4.4" rx="2" ry=".8" fill="#d99871"/><path d="M-11-1Q-6-3-2-1T11-2" fill="none" stroke="#f8ddbb" stroke-width=".5" opacity=".65"/>';
  return bands;
}
function rings(r,front){
  const d=front?`M${-r*1.9} 0A${r*1.9} ${r*.59} 0 0 0 ${r*1.9} 0`:`M${-r*1.9} 0A${r*1.9} ${r*.59} 0 0 1 ${r*1.9} 0`;
  return `<g transform="rotate(-23)" fill="none"><path d="${d}" stroke="#d1c4a4" stroke-width="4.1" opacity="${front?.75:.38}"/><path d="${d}" stroke="#26313d" stroke-width=".6"/><path d="${d}" stroke="#f4dfb7" stroke-width=".35" transform="scale(1.1)" opacity=".65"/></g>`;
}
function target(id,name,interactive){return `data-celestial-id="${id}"${interactive?` role="button" tabindex="0" aria-label="${escape(name)}"`:''}`;}
function sphere(p,prefix){
  const r=p.radius;
  return `<g class="orrery-globe">${p.id==='saturn'?rings(r,false):''}${p.id==='uranus'?`<ellipse rx="${r*1.55}" ry="${r*.45}" fill="none" stroke="#b5ced0" stroke-width=".7" opacity=".65" transform="rotate(73)"/>`:''}<circle r="${r+1.3}" fill="${p.color}" opacity=".06"/><g clip-path="url(#${prefix}-${p.id}-clip)"><circle r="${r}" fill="${p.color}"/><g class="orrery-surface" style="--spin-duration:65s">${surface(p.id,r)}</g><circle class="orrery-light" r="${r}" fill="url(#${prefix}-shade)"/></g>${p.id==='saturn'?rings(r,true):''}</g>`;
}
function belt(rx,count,color,phase){
  return Array.from({length:count},(_,i)=>{const a=i*2.399963+phase,r=rx+(Math.sin(i*7.17)+Math.cos(i*3.23))*4,x=300+Math.cos(a)*r,y=300+Math.sin(a)*r*.51;return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${.3+(i%4)*.14}" fill="${color}" opacity="${.18+(i%5)*.1}"/>`;}).join('');
}
function asterism(group,box,interactive){
  const points=projectAsterism(group,box),byId=new Map(points.map(p=>[p.hip,p])),lines=group==='北斗'?NORTH_LINES:group==='南斗'?SOUTH_LINES:WENCHANG_LINES;
  const labelOffsets={92041:[8,12,'start'],92855:[-5,-8,'end'],93864:[-6,4,'end'],93506:[6,13,'start']};
  let content=`<g class="orrery-asterism" data-asterism="${group}"><text class="asterism-title" x="${box.x}" y="${box.y-18}">${group==='北斗'?'北斗九星':group==='南斗'?'南斗六星':'文昌星官'}</text>`;
  content+=lines.map(([a,b])=>`<path d="M${byId.get(a).x} ${byId.get(a).y}L${byId.get(b).x} ${byId.get(b).y}"/>`).join('');
  for(const p of points){const r=Math.max(1.4,3.2-p.mag*.35),[dx,dy,anchor]=labelOffsets[p.hip]||[5,-6,'start'];content+=`<g class="orrery-fixed-star" ${target(p.id,traditionalName(p),interactive)}><title>${escape(traditionalName(p))}</title><circle class="celestial-hit" cx="${p.x}" cy="${p.y}" r="12"/><circle class="stellar-halo" cx="${p.x}" cy="${p.y}" r="${r*4}"/><circle class="stellar-point" cx="${p.x}" cy="${p.y}" r="${r}"/><text class="orrery-label" x="${p.x+dx}" y="${p.y+dy}" text-anchor="${anchor}">${traditionalName(p)}</text></g>`;}
  if(group==='北斗'){
    const y=box.y+box.h+30;
    content+=`<text class="orrery-hidden-caption" x="${box.x}" y="${y+20}">辅弼二隐 · 传统意象</text>`;
    for(const [i,s] of NORTH_HIDDEN_STARS.entries()){
      const x=box.x+12+i*90;
      content+=`<g class="orrery-fixed-star orrery-hidden-star" data-cultural="true" ${target(s.id,s.name,interactive)}><title>${s.name} · 传统隐曜意象</title><circle class="celestial-hit" cx="${x}" cy="${y}" r="14"/><circle class="stellar-halo" cx="${x}" cy="${y}" r="11"/><circle class="hidden-star-orbit" cx="${x}" cy="${y}" r="7"/><circle class="stellar-point" cx="${x}" cy="${y}" r="2"/><text class="orrery-label" x="${x+13}" y="${y+4}">${s.name}</text></g>`;
    }
  }
  return content+'</g>';
}
export function orreryMarkup(prefix='instrument',{interactive=false}={}){
  const defs=[...BODIES,MOON].map(p=>`<clipPath id="${prefix}-${p.id}-clip"><circle r="${p.radius}"/></clipPath>`).join('');
  let svg=`<svg class="atlas-orrery${interactive?' explorable':''}" width="600" height="600" viewBox="0 0 600 600" ${interactive?'role="group" aria-label="太阳系与南北斗天仪，点选天体查看介绍"':'aria-hidden="true"'}><defs>${defs}<radialGradient id="${prefix}-shade" cx="23%" cy="45%" r="79%"><stop offset="0" stop-color="#fff2d2" stop-opacity=".5"/><stop offset=".26" stop-color="#fff2d2" stop-opacity="0"/><stop offset=".52" stop-color="#080e18" stop-opacity=".12"/><stop offset=".8" stop-color="#030918" stop-opacity=".72"/><stop offset="1" stop-color="#020713" stop-opacity=".98"/></radialGradient><radialGradient id="${prefix}-sun"><stop stop-color="#fff9d9"/><stop offset=".4" stop-color="#ffe8a6"/><stop offset=".85" stop-color="#f4aa48"/><stop offset="1" stop-color="#c65f2e"/></radialGradient><radialGradient id="${prefix}-corona"><stop stop-color="#ffd782" stop-opacity=".38"/><stop offset=".45" stop-color="#efad53" stop-opacity=".1"/><stop offset="1" stop-color="#e49035" stop-opacity="0"/></radialGradient></defs>`;
  svg+='<g class="orrery-background-stars">'+Array.from({length:110},(_,i)=>{const x=(i*137.507)%600,y=(i*i*73.73+25)%600;return `<circle cx="${x}" cy="${y}" r="${i%9===0?.75:.4}" fill="${i%3?'#aac3d6':'#d1bc88'}" opacity="${.15+(i%5)*.09}"/>`;}).join('')+'</g>';
  svg+=asterism('北斗',{x:40,y:52,w:166,h:79},interactive)+asterism('南斗',{x:398,y:474,w:146,h:78},interactive)+asterism('文昌',{x:408,y:54,w:123,h:71},interactive);
  const pole=ORRERY_STARS.find(p=>p.group==='北极');
  svg+=`<g class="orrery-fixed-star orrery-pole" ${target(pole.id,pole.name,interactive)}><circle class="celestial-hit" cx="314" cy="31" r="13"/><circle class="stellar-halo" cx="314" cy="31" r="12"/><circle class="stellar-point" cx="314" cy="31" r="2.5"/><path d="M314 23v16M306 31h16" fill="none" stroke="#dfcc95" stroke-width=".5"/><text class="orrery-label" x="329" y="35">勾陈一</text></g>`;
  svg+=`<g class="orrery-solar-plane" transform="rotate(-12 300 300)"><g class="orrery-belt" ${target('asteroids','主小行星带',interactive)}><ellipse class="celestial-hit belt-hit" cx="300" cy="300" rx="138" ry="70.38"/>${belt(138,115,'#b3a58e',.2)}</g><g class="orrery-belt" ${target('kuiper','柯伊伯带',interactive)}><ellipse class="celestial-hit belt-hit" cx="300" cy="300" rx="276" ry="140.76"/>${belt(276,150,'#87a5bb',1)}</g>`;
  for(const [i,p] of BODIES.entries()){
    const rx=p.rx,ry=rx*.51,d=`M${300+rx} 300A${rx} ${ry} 0 1 1 ${300-rx} 300A${rx} ${ry} 0 1 1 ${300+rx} 300`,style=`--orbit-duration:${p.period}s;--orbit-delay:${-(i+1)*17.7}s`;
    svg+=`<g class="orrery-orbit" data-orbit="${p.id}" style="${style}"><path class="orrery-track" d="${d}"/><path class="orrery-orbit-accent" d="${d}" pathLength="100"/><g class="orrery-planet${SMALL_BODIES.includes(p)?' orrery-dwarf':''}" data-planet="${p.id}" ${target(p.id,traditionalName(p),interactive)} style="color:${p.color};offset-path:path('${d}')"><title>${escape(traditionalName(p))}</title><circle class="celestial-hit" r="${Math.max(11,p.radius+3)}"/>${sphere(p,prefix)}<text class="orrery-label" x="${p.radius+5}" y="${-p.radius-3}" transform="rotate(12)">${traditionalName(p)}</text>`;
    if(p.id==='earth'){
      const moonPath='M18 0A18 10 0 1 1-18 0A18 10 0 1 1 18 0';
      svg+=`<path class="orrery-moon-track" d="${moonPath}"/><g class="orrery-moon" ${target('moon','太阴',interactive)} style="offset-path:path('${moonPath}');--orbit-duration:9s;--orbit-delay:-2s"><title>太阴</title><circle class="celestial-hit" r="7"/>${sphere(MOON,prefix)}</g>`;
    }
    svg+='</g></g>';
  }
  svg+='</g>';
  svg+=`<g class="orrery-sun" transform="translate(300 300)" ${target('sun','太阳',interactive)}><title>太阳 · 太阳系恒星</title><circle class="celestial-hit" r="24"/><circle class="solar-corona" r="57" fill="url(#${prefix}-corona)"/><g class="solar-prominences" fill="none" stroke="#efc16a" opacity=".35"><path d="M-13-7C-30-37 7-31 9-13M-11 12C-20 33 16 29 12 9M15 2C37-7 21-21 9-13" stroke-width=".8"/></g><circle r="15.5" fill="url(#${prefix}-sun)"/><g class="solar-granules">${Array.from({length:48},(_,i)=>{const a=i*2.4,r=Math.sqrt((i+.5)/50)*14;return `<circle cx="${Math.cos(a)*r}" cy="${Math.sin(a)*r}" r="${.3+i%3*.2}" fill="#b96423" opacity=".15"/>`;}).join('')}</g><text class="orrery-label" x="20" y="-20">太阳</text></g>`;
  const ticks=Array.from({length:72},(_,i)=>`<path d="M300 7v${i%6===0?7:2.5}" transform="rotate(${i*5} 300 300)"/>`).join('');
  return svg+`<g class="orrery-compass">${ticks}<circle cx="300" cy="300" r="288" stroke-dasharray=".6 17"/></g></svg>`;
}
