import {astro} from 'iztro';
import {Solar,Lunar,LunarYear} from 'lunar-typescript';
import {cycleAt,validDate} from './chart-engine.mjs';

export const CYCLE_SCOPES=['natal','decadal','yearly','monthly','daily','hourly'];
export const HOURS=Array.from({length:13},(_,i)=>({
  value:i===0?'00:00':`${String(i*2-1).padStart(2,'0')}:00`,
  label:i===0?'早子 · 00:00–00:59':i===12?'晚子 · 23:00–23:59':`${'子丑寅卯辰巳午未申酉戌亥'[i]}时 · ${String(i*2-1).padStart(2,'0')}:00–${String(i*2).padStart(2,'0')}:59`
}));
const caches=new WeakMap(),DAY=86400000;
const pad=n=>String(n).padStart(2,'0');
const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY).toISOString().slice(0,10);
const solar=(year,month,day)=>Lunar.fromYmd(year,month,day).getSolar().toYmd();
const clamp=(v,min,max)=>v<min?min:v>max?max:v;

export function deviceNow(now=new Date()){
  if(Number.isNaN(now.getTime()))throw Error('设备时间无效。');
  return {date:`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`,time:`${pad(now.getHours())}:${pad(now.getMinutes())}`};
}
export function lunarParts(date){
  const l=Solar.fromYmd(...date.split('-').map(Number)).getLunar();
  return {year:l.getYear(),month:l.getMonth(),day:l.getDay(),monthLabel:l.getMonthInChinese()+'月',dayLabel:l.getDayInChinese()};
}
function cacheFor(result){
  if(!caches.has(result)){
    astro.config(result.config);
    caches.set(result,{decades:result.engine.decadalList(),years:new Map(),months:new Map()});
  }
  return caches.get(result);
}
export function cycleBounds(result){
  const last=cacheFor(result).decades.at(-1).yearRange[1];
  return {min:result.normalized.date,max:last>=2099?'2099-12-31':shiftDate(solar(last+1,1,1),-1)};
}
function clippedPeriod(result,start,end){
  const {min,max}=cycleBounds(result);
  return {start:start<min?min:start,end:end>max?max:end};
}
export function decadeChoices(result){
  const decades=cacheFor(result).decades,birthYear=result.chart.rawDates.lunarDate.lunarYear;
  const all=decades.map(d=>({...d,key:String(d.index),label:`${d.ageRange.join('–')}岁 · ${d.heavenlyStem}${d.earthlyBranch} ${d.palaceName}`}));
  if(decades[0].ageRange[0]>1)all.unshift({key:'childhood',index:null,name:'童限',ageRange:[1,decades[0].ageRange[0]-1],yearRange:[birthYear,decades[0].yearRange[0]-1],label:`童限 · 1–${decades[0].ageRange[0]-1}岁`});
  return all.map(d=>({...d,...clippedPeriod(result,solar(d.yearRange[0],1,1),shiftDate(solar(d.yearRange[1]+1,1,1),-1))})).filter(d=>d.start<=d.end);
}
export function currentDecade(result,cycle){
  return decadeChoices(result).find(d=>cycle.age>=d.ageRange[0]&&cycle.age<=d.ageRange[1]);
}
export function yearChoices(result,decade){
  if(!decade)return [];
  const cache=cacheFor(result);
  if(!cache.years.has(decade.key)){
    astro.config(result.config);
    const years=decade.key==='childhood'
      ?Array.from({length:decade.ageRange[1]},(_,i)=>{const year=decade.yearRange[0]+i;const h=result.engine.horoscope(solar(year,6,1),0).yearly;return {year,age:i+1,heavenlyStem:h.heavenlyStem,earthlyBranch:h.earthlyBranch};})
      :result.engine.yearlyList(decade.palaceName);
    cache.years.set(decade.key,years.map(y=>({...y,...clippedPeriod(result,solar(y.year,1,1),shiftDate(solar(y.year+1,1,1),-1)),label:`${y.year} ${y.heavenlyStem}${y.earthlyBranch} · ${y.age}岁`})).filter(y=>y.start<=y.end));
  }
  return cache.years.get(decade.key);
}
export function monthChoices(result,year){
  const cache=cacheFor(result);
  if(!cache.months.has(year)){
    astro.config(result.config);
    // Horoscope calculation always splits leap months at day 15 in iztro 2.6.1.
    const months=result.engine.monthlyList(year,true).map(m=>{
      const month=m.isLeapMonth?-m.month:m.month,start=solar(year,month,m.dayRange[0]),end=solar(year,month,m.dayRange[1]);
      const label=lunarParts(start).monthLabel+(m.part==='first'?' · 初一至十五':m.part==='second'?' · 十六至月底':'');
      return {...m,signedMonth:month,key:`${month}:${m.part}`,label,...clippedPeriod(result,start,end)};
    }).filter(m=>m.start<=m.end);
    cache.months.set(year,months);
  }
  return cache.months.get(year);
}
export function dayChoices(month){
  if(!month)return [];
  const days=[];
  for(let date=month.start;date<=month.end;date=shiftDate(date,1))days.push({date,label:`${lunarParts(date).dayLabel} · ${date.slice(5).replace('-','/')}`});
  return days;
}
export function cycleNavigation(result,cycle){
  const lunar=lunarParts(cycle.effectiveDate),decades=decadeChoices(result),decade=currentDecade(result,cycle),years=yearChoices(result,decade),months=monthChoices(result,lunar.year);
  const month=months.find(m=>m.signedMonth===lunar.month&&lunar.day>=m.dayRange[0]&&lunar.day<=m.dayRange[1]);
  return {lunar,decades,decade,years,months,month,days:dayChoices(month),hour:cycle.timeIndex};
}
function atEffectiveDate(result,effectiveDate,time){
  const {min,max}=cycleBounds(result);
  effectiveDate=clamp(effectiveDate,min,max);
  let date=effectiveDate;
  if(time.startsWith('23:')&&result.config.dayDivide==='forward')date=shiftDate(date,-1);
  if(date<min){date=min;time='12:00';}
  return {date,time};
}
export function chooseDecade(result,cycle,key){
  const target=decadeChoices(result).find(d=>d.key===String(key));
  if(!target)throw Error('此大限超出可排日期范围。');
  if(cycle&&cycle.age>=target.ageRange[0]&&cycle.age<=target.ageRange[1])return {date:cycle.date,time:cycle.time};
  return {date:target.start,time:'12:00'};
}
export function chooseYear(result,cycle,year){
  if(!Number.isInteger(year))throw Error('请选择有效的流年。');
  const {min,max}=cycleBounds(result);
  const start=solar(year,1,1),end=shiftDate(solar(year+1,1,1),-1);
  if(start>max||end<min)throw Error('该流年超出可排日期范围。');
  const previous=lunarParts(cycle.effectiveDate),months=LunarYear.fromYear(year).getMonthsInYear();
  const month=months.find(m=>m.getMonth()===previous.month)||months.find(m=>m.getMonth()===Math.abs(previous.month));
  return atEffectiveDate(result,solar(year,month.getMonth(),Math.min(previous.day,month.getDayCount())),cycle.time);
}
export function chooseMonth(result,cycle,key,year=lunarParts(cycle.effectiveDate).year){
  const month=monthChoices(result,year).find(m=>m.key===key);
  if(!month)throw Error('请选择有效的农历月份。');
  const day=clamp(lunarParts(cycle.effectiveDate).day,...month.dayRange);
  const effective=clamp(solar(year,month.signedMonth,day),month.start,month.end);
  return atEffectiveDate(result,effective,cycle.time);
}
export function chooseDay(result,cycle,date){
  validDate(date);
  const nav=cycleNavigation(result,cycle);
  if(!nav.days.some(d=>d.date===date))throw Error('请选择当前流月内的日期。');
  return atEffectiveDate(result,date,cycle.time);
}
export function stepCycle(result,cycle,scope,direction){
  if(![-1,1].includes(direction))throw Error('无效的切换方向。');
  const nav=cycleNavigation(result,cycle);
  if(scope==='decadal'){
    const target=nav.decades[nav.decades.findIndex(d=>d.key===nav.decade?.key)+direction];
    if(!target)throw Error('已到可排大限边界。');
    return chooseDecade(result,cycle,target.key);
  }
  if(scope==='yearly')return chooseYear(result,cycle,nav.lunar.year+direction);
  if(scope==='monthly'){
    let year=nav.lunar.year,months=nav.months,index=months.findIndex(m=>m.key===nav.month?.key)+direction;
    if(index<0||index>=months.length){year+=direction;months=monthChoices(result,year);index=direction<0?months.length-1:0;}
    if(!months[index])throw Error('已到可排月份边界。');
    return chooseMonth(result,cycle,months[index].key,year);
  }
  if(scope==='daily')return {date:shiftDate(cycle.date,direction),time:cycle.time};
  if(scope==='hourly'){
    const value=new Date(Date.parse(`${cycle.date}T${cycle.time}:00Z`)+direction*2*3600000);
    return {date:value.toISOString().slice(0,10),time:value.toISOString().slice(11,16)};
  }
  throw Error('本命盘不随观察时间前后移动。');
}
export function checkedCycle(result,stamp){
  const {min,max}=cycleBounds(result);
  validDate(stamp.date);
  if(stamp.date<min||stamp.date>max)throw Error(`观察日期需在 ${min} 至 ${max} 之间。`);
  const cycle=cycleAt(result,stamp.date,stamp.time);
  if(cycle.effectiveDate>max)throw Error('晚子时换日后超出可排日期范围。');
  if(!currentDecade(result,cycle))throw Error('此日期已超出当前命盘的大限范围。');
  return cycle;
}
