// Public iztro 2.6.1 adapter. No private rules, tables, or account data.
// Baselines: https://docs.iztro.com/learn/setup and the library's star exports.
// The alternative selectors implement the explicit conventions named in the UI.
import {astro,star,util} from 'iztro';
const mod=n=>(n%12+12)%12;
const starLists=['majorStars','minorStars','adjectiveStars'];
function locate(engine,name){for(const p of engine.palaces)for(const list of starLists){const value=p[list].find(s=>s.name===name);if(value)return {palace:p,list,star:value};}throw Error('安星选项无法应用：'+name);}
function move(engine,name,index){
  const found=locate(engine,name),target=engine.palaces[mod(index)];
  if(found.palace===target)return;
  found.palace[found.list]=found.palace[found.list].filter(s=>s!==found.star);
  target[found.list].push(found.star);found.star.setPalace?.(target);found.star.setAstrolabe?.(engine);
  if(found.star.brightness!==undefined)found.star.brightness=util.getBrightness(name,target.index);
}
function addVoid(engine,name,index,template){
  const value=new template.constructor({name,type:'adjective',scope:'origin'}),p=engine.palaces[mod(index)];
  value.setPalace?.(p);value.setAstrolabe?.(engine);p.adjectiveStars.push(value);
}
function kuiYueTargets(stem,method){
  if(stem!=='辛'&&!(stem==='庚'&&method.startsWith('gengXin')))return null;
  return method.endsWith('TigerHorse')?[0,4]:[4,0]; // 寅/午; iztro palace zero is 寅.
}
export function applyStarMethods(engine,normalized,options,config){
  const timeIndex=normalized.timeIndex%12;
  const param={solarDate:engine.solarDate,timeIndex,gender:normalized.gender,fixLeap:normalized.fixLeap};
  if(options.tianma==='month'){
    const month=util.fixLunarMonthIndex(engine.solarDate,timeIndex,normalized.fixLeap);
    const branch=engine.palaces[mod(month)].earthlyBranch;
    move(engine,'天马',star.getLuYangTuoMaIndex(engine.rawDates.chineseDate.yearly[0],branch).maIndex);
  }
  if(options.tiankong==='hour')move(engine,'天空',locate(engine,'天空').palace.index+timeIndex);
  if(options.tianshi!==config.algorithm||options.soul!==(config.algorithm==='zhongzhou'?'year':'palace')){
    const alternateAlgorithm=config.algorithm==='zhongzhou'?'default':'zhongzhou';
    let alternate;
    try{astro.config({...config,algorithm:alternateAlgorithm});alternate=astro.bySolar(normalized.date,normalized.timeIndex,normalized.gender,normalized.fixLeap,'zh-CN');}
    finally{astro.config(config);}
    if(options.tianshi!==config.algorithm)for(const name of ['天使','天伤'])move(engine,name,locate(alternate,name).palace.index);
    if(options.soul!==(config.algorithm==='zhongzhou'?'year':'palace'))engine.soul=alternate.soul;
  }
  if(options.kongwang!=='engine'){
    const indices=star.getYearlyStarIndex(param),template=locate(engine,'旬空').star;
    const names=new Set(['截路','空亡','截空','旬空','副截','副旬']);
    for(const p of engine.palaces)p.adjectiveStars=p.adjectiveStars.filter(s=>!names.has(s.name));
    addVoid(engine,'截空',indices.jiekongIndex,template);addVoid(engine,'旬空',indices.xunkongIndex,template);
    if(options.kongwang==='double'){
      addVoid(engine,'副截',indices.jiekongIndex+(indices.jiekongIndex%2?-1:1),template);
      addVoid(engine,'副旬',indices.xunkongIndex+(indices.xunkongIndex%2?-1:1),template);
    }
  }
  const targets=kuiYueTargets(engine.rawDates.chineseDate.yearly[0],options.kuiyue);
  if(targets){move(engine,'天魁',targets[0]);move(engine,'天钺',targets[1]);}
  if(options.changshengDirection==='forward'||options.earthChangsheng==='fire'&&engine.fiveElementsClass==='土五局'){
    const oldStart=engine.palaces.findIndex(p=>p.changsheng12==='长生');
    const direction=options.changshengDirection==='forward'?1:engine.palaces[mod(oldStart+1)].changsheng12==='沐浴'?1:-1;
    const start=options.earthChangsheng==='fire'&&engine.fiveElementsClass==='土五局'?0:oldStart;
    const names=['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'];
    names.forEach((name,i)=>{engine.palaces[mod(start+direction*i)].changsheng12=name;});
  }
}
export function applyCycleMethods(cycle,chart,options){
  if(options.yearlyMutagen==='palace'){
    const stem=chart.palaces[cycle.yearly.index]?.heavenlyStem;
    if(!stem)throw Error('无法确定流年命宫天干。');
    cycle.yearly.mutagen=util.getMutagensByHeavenlyStem(stem);
    cycle.yearly.mutagenHeavenlyStem=stem;
  }
  for(const name of ['decadal','yearly','monthly','daily','hourly']){
    const layer=cycle[name],targets=layer&&kuiYueTargets(layer.heavenlyStem,options.kuiyue);
    if(!targets||!Array.isArray(layer.stars))continue;
    for(const [suffix,index] of [['魁',targets[0]],['钺',targets[1]]]){
      for(let i=0;i<layer.stars.length;i++){
        const value=layer.stars[i].find(s=>s.name.endsWith(suffix));if(!value)continue;
        if(i!==index){layer.stars[i]=layer.stars[i].filter(s=>s!==value);layer.stars[index].push(value);}break;
      }
    }
  }
  return cycle;
}
