import { astro } from 'iztro';
export const ENGINE_VERSION='iztro 2.6.1';
export const DEFAULT_CONFIG=Object.freeze({yearDivide:'normal',horoscopeDivide:'normal',ageDivide:'normal',dayDivide:'forward',algorithm:'default'});
export function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('请输入完整的公历日期。');
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d,12));
  if(y<1901||y>2099||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error('日期无效；当前支持 1901—2099 年的公历日期。');
  return date;
}
export function normalizeBirth(input){
  validDate(input.date);
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time||''))throw Error('请输入准确的出生时间，格式为小时和分钟。');
  if(!['男','女'].includes(input.gender))throw Error('请选择传统排盘使用的男命或女命。');
  if(!['current','forward'].includes(input.dayDivide)||typeof input.fixLeap!=='boolean'||typeof input.daylight!=='boolean')throw Error('请核对排盘口径。');
  const [year,month,day]=input.date.split('-').map(Number),[hour,minute]=input.time.split(':').map(Number);
  const standard=new Date(Date.UTC(year,month-1,day,hour-(input.daylight?1:0),minute));
  const date=standard.toISOString().slice(0,10),time=standard.toISOString().slice(11,16);
  validDate(date);const h=standard.getUTCHours();
  return {date,time,timeIndex:h===23?12:Math.floor((h+1)/2),gender:input.gender,dayDivide:input.dayDivide,fixLeap:input.fixLeap,daylight:input.daylight};
}
export function makeChart(input){
  const normalized=normalizeBirth(input);
  const config={...DEFAULT_CONFIG,dayDivide:normalized.dayDivide};
  astro.config(config);
  const engine=astro.bySolar(normalized.date,normalized.timeIndex,normalized.gender,normalized.fixLeap,'zh-CN');
  const chart=engine.toJSON();
  if(chart.palaces.length!==12||chart.palaces.flatMap(p=>p.majorStars).filter(s=>s.type==='major').length!==14)throw Error('排盘未通过结构检查，请重新输入。');
  return {engine,chart,input:{...input},normalized,config,version:ENGINE_VERSION};
}
export function cycleAt(result,date,time='00:00'){
  validDate(date);
  if(date<result.normalized.date)throw Error('流年日期不能早于出生日期。');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('请输入有效的观察时间。');
  const hour=Number(time.slice(0,2)),timeIndex=hour===23?12:Math.floor((hour+1)/2);
  astro.config(result.config);
  // Normalize once: iztro 2.6.1 otherwise advances late-Zi day stems but
  // retains the civil-date lunar day when placing daily/hourly palaces.
  let effectiveDate=date,effectiveIndex=timeIndex;
  if(timeIndex===12){effectiveIndex=0;if(result.config.dayDivide==='forward'){const next=validDate(date);next.setUTCDate(next.getUTCDate()+1);effectiveDate=next.toISOString().slice(0,10);validDate(effectiveDate);}}
  const h=result.engine.horoscope(effectiveDate,effectiveIndex).toJSON();
  return {date,time,timeIndex,effectiveDate,lunarDate:h.lunarDate,yearly:h.yearly,decadal:h.decadal,age:h.age.nominalAge,smallLimit:h.age,monthly:h.monthly,daily:h.daily,hourly:h.hourly};
}
// Positions are fixed by earthly branch, never by a palace's changing name.
export const PALACE_GRID=Object.freeze({巳:[1,1],午:[1,2],未:[1,3],申:[1,4],辰:[2,1],酉:[2,4],卯:[3,1],戌:[3,4],寅:[4,1],丑:[4,2],子:[4,3],亥:[4,4]});
export const SCOPE_NAMES=Object.freeze({natal:'本命',decadal:'大限',smallLimit:'小限',yearly:'流年',monthly:'流月',daily:'流日',hourly:'流时'});
export function annualAges(chart,branch){
  const branches='子丑寅卯辰巳午未申酉戌亥';
  const birth=branches.indexOf(chart.rawDates.chineseDate.yearly[1]),target=branches.indexOf(branch);
  if(birth<0||target<0)throw Error('无效地支');
  const first=(target-birth+12)%12+1;
  return Array.from({length:10},(_,i)=>first+i*12);
}
export function exportChart(result,cycle){
  return {schemaVersion:1,kind:'ziwei_natal_chart',engine:result.version,provider:result.provider||'public-browser',method:result.method||null,input:result.input,normalized:result.normalized,convention:result.config,fixLeap:result.normalized.fixLeap,chart:result.chart,cycle:cycle||null,notes:['传统历法安星结果，不代表事件发生概率。','当地标准时间；不自动换算经度、时区或真太阳时。','星空坐标与命盘宫位分别计算。']};
}
