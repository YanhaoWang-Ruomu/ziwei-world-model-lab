export const LAYER_KEYS=Object.freeze(['natal','decadal','yearly','monthly','daily','hourly']);
export const LAYER_NAMES=Object.freeze(['本命','大限','流年','流月','流日','流时']);
export const LAYER_STORAGE='ziwei.chart.layers.v1';
export function layerCount(value){return [3,4,5].includes(Number(value))?Number(value):3;}
export function availableLayerKeys(cycle,scope){
  const end=LAYER_KEYS.indexOf(scope);
  return LAYER_KEYS.slice(0,Math.max(0,end)+1).filter(k=>k==='natal'||cycle?.[k]);
}
export function visibleLayerKeys(cycle,scope,preferences={}){
  const available=availableLayerKeys(cycle,scope),count=Math.min(layerCount(preferences.count),available.length);
  const custom=preferences.selections?.[scope+':'+layerCount(preferences.count)];
  if(Array.isArray(custom)&&new Set(custom).size===count&&custom.length===count&&custom.every(k=>available.includes(k)))return available.filter(k=>custom.includes(k));
  return available.slice(-count);
}
export function loadLayerPreferences(storage){
  try{const p=JSON.parse(storage.getItem(LAYER_STORAGE)||'{}');return {count:layerCount(p?.count),selections:p?.selections&&typeof p.selections==='object'&&!Array.isArray(p.selections)?p.selections:{}};}catch{return {count:3,selections:{}};}
}
