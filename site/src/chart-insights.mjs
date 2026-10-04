import {astro,util} from 'iztro';
import {SCOPE_NAMES} from './chart-engine.mjs';

export const MUTAGENS=Object.freeze(['禄','权','科','忌']);
export const FLOW_ORDER=Object.freeze(['decadal','yearly','monthly','daily','hourly']);
export const FLOW_SHORT=Object.freeze({natal:'本',decadal:'大',yearly:'年',monthly:'月',daily:'日',hourly:'时'});
export const LAYER_COLORS=Object.freeze({natal:'#e7c78e',decadal:'#9bd6a9',yearly:'#83caff',monthly:'#ffbf80',daily:'#d0a0f1',hourly:'#79d9d5'});

export function chartIdentity(chart){
  const stem=chart.rawDates.chineseDate.yearly[0];
  const polarity='甲丙戊庚壬'.includes(stem)?'阳':'阴';
  return `${polarity}${chart.gender} · ${chart.fiveElementsClass}`;
}

export function activeLayers(cycle,scope){
  const last=FLOW_ORDER.indexOf(scope);
  return last<0||!cycle?[]:FLOW_ORDER.slice(0,last+1).filter(key=>cycle[key]).map(key=>({...cycle[key],key,name:key==='decadal'&&cycle[key].name==='童限'?'童限':SCOPE_NAMES[key],short:FLOW_SHORT[key]}));
}

// Both chart layouts and the inspector share the same complete time hierarchy.
export function palaceLayers(palace,cycle,scope,visible){
  return activeLayers(cycle,scope).filter(l=>!visible||visible.includes(l.key)).map(layer=>({
    key:layer.key,name:layer.name,short:layer.short,color:LAYER_COLORS[layer.key],
    palace:layer.palaceNames[palace.index],life:layer.index===palace.index,
    stars:layer.stars?.[palace.index]||[],
  }));
}

export function palaceLayerLabel(layer){
  return layer.short+layer.palace.replace(/宫$/,'').replace(/^仆役$/,'交友');
}

export function palaceLayerTitle(layer){
  return `${layer.name} · ${layer.palace}${layer.stars.length?'；流曜：'+layer.stars.map(s=>s.name).join('、'):''}`;
}

export function starMutations(star,cycle,scope,stack=true,visible){
  const entries=star.mutagen?[{key:'natal',name:'生年',short:'本',mutagen:star.mutagen}]:[];
  for(const layer of activeLayers(cycle,scope)){
    if(!stack&&layer.key!==scope)continue;
    const index=layer.mutagen.indexOf(star.name);
    if(index>=0)entries.push({key:layer.key,name:layer.name,short:layer.short,mutagen:MUTAGENS[index]});
  }
  return visible?entries.filter(m=>visible.includes(m.key)):entries;
}

// Public iztro convention, evaluated with this chart's configuration. No private rules.
export function palaceFlights(result,sourceIndex){
  if(!Number.isInteger(sourceIndex)||sourceIndex<0||sourceIndex>11)throw Error('宫位索引无效。');
  if(result.provider==='public-server'){
    if(!Array.isArray(result.flights?.[sourceIndex]))throw Error('服务器未返回宫干飞化，请重新起盘。');
    return result.flights[sourceIndex];
  }
  astro.config(result.config);
  const source=result.chart.palaces[sourceIndex];
  const names=util.getMutagensByHeavenlyStem(source.heavenlyStem);
  return names.map((star,i)=>{
    const target=result.chart.palaces.find(p=>[...p.majorStars,...p.minorStars,...p.adjectiveStars].some(s=>s.name===star));
    if(!target)throw Error('四化星曜未能定位。');
    return {sourceIndex,sourceName:source.name,stem:source.heavenlyStem,star,mutagen:MUTAGENS[i],targetIndex:target.index,targetName:target.name,branch:target.earthlyBranch,self:target.index===sourceIndex};
  });
}

export function relatedPalaces(chart,index){
  if(!Number.isInteger(index))return [];
  return [0,4,6,8].map((offset,i)=>({palace:chart.palaces[(index+offset)%12],relation:['本宫','三合','对宫','三合'][i]}));
}

// Whole-chart markers do not depend on the currently selected palace.
export function intrinsicTransforms(result){
  return result.chart.palaces.flatMap(p=>palaceFlights(result,p.index))
    .filter(f=>f.self||f.targetIndex===(f.sourceIndex+6)%12)
    .map(f=>({...f,direction:f.self?'outward':'inward'}));
}
export function selectedFlights(result,index,enabled=true){
  return enabled&&Number.isInteger(index)?palaceFlights(result,index):[];
}
export function transformationLabel(f){
  return `${f.sourceName}宫${f.stem}干使${f.star}化${f.mutagen}：${f.direction==='outward'?'离心自化，箭头向外':f.direction==='inward'?`向心自化，飞入对宫${f.targetName}`:`飞入${f.targetName}`}`;
}
