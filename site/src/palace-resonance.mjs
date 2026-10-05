import {ORRERY_STARS,NORTH_HIDDEN_STARS,WENCHANG_CULTURAL_STARS} from './orrery-data.mjs';
// Use only associations already documented in the observatory's public catalogue.
const associations=new Map([...ORRERY_STARS,...NORTH_HIDDEN_STARS].filter(s=>s.symbol).map(s=>[s.symbol,s.id]));
associations.set('太阳','sun');associations.set('太阴','moon');
export function starCelestialIds(name){
  return name==='文昌'?[...ORRERY_STARS.filter(s=>s.group==='文昌'),...WENCHANG_CULTURAL_STARS].map(s=>s.id):[associations.get(name)].filter(Boolean);
}
export function palaceCelestialIds(palace){
  return [...new Set([...(palace?.majorStars||[]),...(palace?.minorStars||[])].flatMap(s=>starCelestialIds(s.name)))];
}
export function illuminatePalace(container,palace,star=null){
  const ids=star?starCelestialIds(star):palaceCelestialIds(palace);
  for(const body of container.querySelectorAll('[data-celestial-id]'))body.classList.toggle('palace-resonance',ids.includes(body.dataset.celestialId));
  for(const item of container.querySelectorAll('[data-star]'))item.classList.toggle('star-focused',!!star&&item.dataset.star===star&&Number(item.closest('[data-palace]')?.dataset.palace)===palace?.index);
  for(const trigger of container.querySelectorAll('[data-open-orrery]')){trigger.dataset.celestialFocus=ids[0]||'sun';trigger.title=star?`展开天仪 · ${star}`:'展开天仪 · 日月与星官';}
}
