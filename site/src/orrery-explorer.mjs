import {orreryMarkup} from './orrery.mjs';
import {ORRERY_ITEMS,traditionalName} from './orrery-data.mjs';

export function initOrreryExplorer(){
  const el=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e;};
  const button=(text,action)=>{const b=el('button','',text);b.type='button';b.addEventListener('click',action);return b;};
  const dialog=el('dialog','orrery-explorer');dialog.id='orrery-explorer';dialog.setAttribute('aria-labelledby','orrery-explorer-title');
  const header=el('header','orrery-explorer-header'),heading=el('div',''),title=el('h2','','日月经天 · 星河入仪');title.id='orrery-explorer-title';
  heading.append(el('p','orrery-eyebrow','SOLAR SYSTEM · CHINESE ASTERISMS'),title);
  let paused=false,lastTrigger=null,currentId=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const motion=button('暂停运行',()=>{paused=!paused;syncMotion();});motion.setAttribute('aria-pressed','false');
  const close=button('返回命盘 ×',()=>dialog.close());header.append(heading,motion,close);
  const body=el('div','orrery-explorer-body'),scene=el('div','orrery-scene'),info=el('aside','orrery-information');
  const label=el('label','orrery-select-label','选择天体'),select=el('select','');select.setAttribute('aria-label','选择天体');
  for(const group of ['太阳系','北斗','南斗','文昌','北极']){const options=el('optgroup','');options.label=group;for(const item of ORRERY_ITEMS.filter(p=>p.group===group))options.append(new Option(traditionalName(item),item.id));select.append(options);}
  label.append(select);const card=el('div','orrery-body-card');card.setAttribute('aria-live','polite');info.append(label,card);body.append(scene,info);
  const footer=el('div','orrery-explorer-footer');footer.append(el('span','','点选天体 · 查看星名与文化对照'),el('span','','距离、大小与速度经艺术压缩；各星官分别投影，不表示实时天象。'));
  dialog.append(header,body,footer);document.body.append(dialog);
  function show(id){
    const item=ORRERY_ITEMS.find(p=>p.id===id);if(!item||currentId===id)return;currentId=id;
    select.value=id;scene.querySelectorAll('[data-celestial-id]').forEach(n=>n.classList.toggle('celestial-selected',n.dataset.celestialId===id));
    card.replaceChildren(el('p','orrery-eyebrow',item.group==='太阳系'?'SOLAR SYSTEM':item.group+'星区'),el('h3','',traditionalName(item)),el('p','orrery-modern',(traditionalName(item)!==item.name?item.name+' · ':'')+item.modern),el('p','orrery-description',item.intro));
    if(item.group==='文昌'){const a=el('a','orrery-source','文昌星官与成员出处 ↗');a.href='https://github.com/Stellarium/stellarium-skycultures/blob/master/chinese/index.json';a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
    if(item.year)card.append(el('p','orrery-fact','公转周期 '+item.year));
    if(item.hip){card.append(el('p','orrery-fact',`视星等 ${item.mag} · ${item.pc===null?'距离数据不足':(item.pc*3.26156).toFixed(1)+' 光年（约）'}`));if(item.symbol)card.append(el('p','orrery-cultural-note','传统星名为文化对照；命盘安星仍依既定历法规则计算。'));}
    if(item.kind==='cultural')card.append(el('p','orrery-cultural-note','七显二隐 · 隐曜以虚环区分。没有填写距离、视星等或赤经赤纬；命盘安星规则保持原有算法。'));
    const source=el('a','orrery-source',item.kind==='cultural'?'查看北斗九星传统出处 ↗':'查看天体资料 ↗');source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
    if(item.hip){const credit=el('a','orrery-credit','HYG 4.1 · CC BY-SA 4.0');credit.href='https://creativecommons.org/licenses/by-sa/4.0/';credit.target='_blank';credit.rel='noopener noreferrer';card.append(credit);}
  }
  function syncMotion(){const stop=paused||reduced.matches;dialog.dataset.motion=stop?'paused':'running';motion.textContent=reduced.matches?'简化动态':stop?'继续运行':'暂停运行';motion.disabled=reduced.matches;motion.setAttribute('aria-pressed',String(stop));}
  function open(trigger){lastTrigger=trigger||document.activeElement;scene.innerHTML=orreryMarkup('expanded-solar',{interactive:true});currentId=null;show(trigger?.dataset.celestialFocus||'sun');syncMotion();if(!dialog.open)dialog.showModal();document.body.classList.add('orrery-exploring');}
  function activate(event){const bodyTarget=event.target.closest('[data-celestial-id]');if(bodyTarget)show(bodyTarget.dataset.celestialId);}
  scene.addEventListener('click',activate);
  // Moving orbits must not replace a selection beneath a stationary pointer.
  scene.addEventListener('focusin',activate);
  scene.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(e);}});
  select.addEventListener('change',()=>show(select.value));
  document.addEventListener('click',e=>{const trigger=e.target.closest('[data-open-orrery]');if(trigger){e.preventDefault();open(trigger);}});
  document.addEventListener('keydown',e=>{const trigger=e.target.closest('[data-open-orrery]');if(trigger?.tagName.toLowerCase()==='g'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open(trigger);}});
  dialog.addEventListener('close',()=>{document.body.classList.remove('orrery-exploring');scene.replaceChildren();lastTrigger?.isConnected&&lastTrigger.focus({preventScroll:true});});
  reduced.addEventListener('change',syncMotion);
  return {open};
}
