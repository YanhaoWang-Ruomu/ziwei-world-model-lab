import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeChart,normalizeBirth,cycleAt,exportChart,validDate,PALACE_GRID,annualAges} from '../src/chart-engine.mjs';
import {unitVector,distanceRadius} from '../src/starfield.mjs';
import {NAMED_STARS,NORTH_LINES,SOUTH_LINES,SOUTH_STARS,starLabel,profileFor} from '../src/star-profiles.mjs';
const fixture={date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false};
const positions=r=>r.chart.palaces.map(p=>[p.name,p.earthlyBranch,p.majorStars.map(s=>[s.name,s.mutagen])]);
test('documented public example: lunar date, life/body palaces, bureau and primary stars',()=>{
  const {chart}=makeChart(fixture);
  assert.equal(chart.lunarDate,'二〇〇〇年七月十七');assert.equal(chart.earthlyBranchOfSoulPalace,'午');assert.equal(chart.earthlyBranchOfBodyPalace,'戌');assert.equal(chart.fiveElementsClass,'木三局');
  assert.deepEqual(chart.palaces[0].majorStars.map(s=>s.name),['武曲','天相']);assert.equal(chart.palaces[0].majorStars[0].mutagen,'权');
});
test('invalid dates, times and convention inputs never silently roll over',()=>{
  for(const date of ['2000-02-30','2001-02-29','2000-13-01','1899-12-31','2100-01-01','00-1-1',''])assert.throws(()=>makeChart({...fixture,date}));
  for(const time of ['24:00','12:60','-1:00','3:30',''])assert.throws(()=>makeChart({...fixture,time}));
  assert.throws(()=>makeChart({...fixture,gender:'unknown'}));assert.throws(()=>makeChart({...fixture,dayDivide:'guess'}));validDate('2000-02-29');
});
test('13 time indices distinguish early and late Zi, including exact boundaries',()=>{
  for(const [time,index]of [['00:00',0],['00:59',0],['01:00',1],['02:59',1],['03:00',2],['22:59',11],['23:00',12],['23:59',12]])assert.equal(normalizeBirth({...fixture,time}).timeIndex,index);
});
test('explicit daylight adjustment crosses the date/year boundary correctly',()=>{
  const value=normalizeBirth({...fixture,date:'2001-01-01',time:'00:30',daylight:true});assert.equal(value.date,'2000-12-31');assert.equal(value.time,'23:30');assert.equal(value.timeIndex,12);
});
test('late Zi forward equals following-day early Zi, current equals current-day early Zi',()=>{
  const forward=makeChart({...fixture,time:'23:30'}),next=makeChart({...fixture,date:'2000-08-17',time:'00:30'});
  assert.deepEqual(positions(forward),positions(next));
  const current=makeChart({...fixture,time:'23:30',dayDivide:'current'}),early=makeChart({...fixture,time:'00:30'});
  assert.deepEqual(positions(current),positions(early));assert.notDeepEqual(positions(current),positions(forward));
});
test('leap-month convention is explicit and changing it has a measurable effect',()=>{
  const on=makeChart({...fixture,date:'2023-04-07',fixLeap:true}),off=makeChart({...fixture,date:'2023-04-07',fixLeap:false});
  assert.match(on.chart.lunarDate,/闰/);assert.notDeepEqual(positions(on),positions(off));
});
test('calendar boundaries always retain exactly twelve palaces and fourteen primary stars',()=>{
  for(const date of ['1901-01-01','1920-02-20','2000-02-29','2023-03-22','2024-02-09','2024-02-10','2099-12-31'])for(const gender of ['男','女'])for(const time of ['00:30','12:00','23:30']){
    const {chart}=makeChart({...fixture,date,gender,time});assert.equal(new Set(chart.palaces.map(p=>p.name)).size,12);assert.equal(chart.palaces.flatMap(p=>p.majorStars).length,14);
  }
});
test('configuration changes do not contaminate a previously calculated chart or later defaults',()=>{
  const first=makeChart(fixture),saved=positions(first);makeChart({...fixture,dayDivide:'current',fixLeap:false});cycleAt(first,'2030-01-01');assert.deepEqual(positions(makeChart(fixture)),saved);
});
test('annual cycle switches at Lunar New Year, and impossible target dates are rejected',()=>{
  const result=makeChart(fixture);assert.equal(cycleAt(result,'2024-02-09').yearly.earthlyBranch,'卯');assert.equal(cycleAt(result,'2024-02-10').yearly.earthlyBranch,'辰');assert.throws(()=>cycleAt(result,'1999-01-01'));assert.throws(()=>cycleAt(result,'2024-02-30'));
});
test('export is complete, reproducible JSON with input and conventions, not a probability result',()=>{
  const r=makeChart(fixture),data=JSON.parse(JSON.stringify(exportChart(r,cycleAt(r,'2030-07-01'))));assert.equal(data.kind,'ziwei_natal_chart');assert.deepEqual(data.input,fixture);assert.equal(data.chart.palaces.length,12);assert.equal(data.engine,'iztro 2.6.1');assert.equal(data.convention.dayDivide,'forward');assert.equal(data.probability,undefined);
});
test('catalog preserves real directions and unknown distances, all named groups resolve',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../src/sky/catalog.json',import.meta.url)));assert.equal(data.count,20000);assert.equal(data.license,'CC BY-SA 4.0');const ids=new Set(data.stars.map(s=>s[0]));assert.equal(ids.size,20000);
  for(const n of NAMED_STARS)assert.ok(ids.has(n.hip),n.name);for(const [a,b]of [...NORTH_LINES,...SOUTH_LINES])assert.ok(ids.has(a)&&ids.has(b));
  assert.equal(data.stars.find(s=>s[0]===89341)[3],null);assert.equal(data.stars.find(s=>s[0]===54061)[3],37.679);
  for(const star of data.stars)assert.ok(star[3]===null||(star[3]>0&&star[3]<100000));
  assert.deepEqual(unitVector(0,0),[1,0,0]);assert.ok(Math.abs(unitVector(6,0)[1]-1)<1e-12);assert.equal(distanceRadius(null),null);assert.ok(distanceRadius(100)>distanceRadius(10));
  assert.equal(profileFor('贪狼').association.hip,54061);assert.equal(profileFor('天府').association.hip,93506);
});
test('all six Southern Dipper cards resolve independently to catalogue stars and fictional chart palaces',()=>{
  const expected=[['天府','斗宿六',93506],['天梁','斗宿五',93864],['天机','斗宿四',92855],['天同','斗宿一',92041],['天相','斗宿二',90496],['七杀','斗宿三',89341]];
  const chart=makeChart(fixture).chart;
  assert.equal(SOUTH_STARS.length,6);
  for(const [i,[name,astronomicalName,hip]] of expected.entries()){
    const star=profileFor(name).association;
    assert.equal(star.hip,hip);assert.equal(star.name,astronomicalName);assert.equal(star.order,i+1);
    assert.equal(SOUTH_STARS[i],star);assert.equal(starLabel(star),astronomicalName);
    assert.equal(chart.palaces.filter(p=>p.majorStars.some(s=>s.name===name)).length,1);
    assert.match(profileFor(name).relation,/南斗文化对照/);
  }
  assert.equal(profileFor('紫微').association,undefined);
});
test('square chart branch positions stay fixed; birth-year stems follow the five tiger groups',()=>{
  assert.deepEqual(['巳','午','未','申'].map(b=>PALACE_GRID[b]),[[1,1],[1,2],[1,3],[1,4]]);
  assert.deepEqual(['寅','丑','子','亥'].map(b=>PALACE_GRID[b]),[[4,1],[4,2],[4,3],[4,4]]);
  assert.equal(new Set(Object.values(PALACE_GRID).map(String)).size,12);
  for(const [offset,stem]of [...'丙戊庚壬甲'].entries()){
    for(const year of [1994+offset,1999+offset]){
      const a=makeChart({...fixture,date:`${year}-06-15`}),b=makeChart({...fixture,date:`${year}-06-15`,time:'17:00'});
      assert.equal(a.chart.palaces[0].earthlyBranch,'寅');assert.equal(a.chart.palaces[0].heavenlyStem,stem);
      assert.deepEqual(a.chart.palaces.map(p=>[p.earthlyBranch,p.heavenlyStem]),b.chart.palaces.map(p=>[p.earthlyBranch,p.heavenlyStem]));
    }
  }
});
test('auxiliary stars, minor stars, body palace and age cycles are generated, not display fixtures',()=>{
  const a=makeChart(fixture),hour=makeChart({...fixture,time:'17:00'}),day=makeChart({...fixture,date:'2000-08-17'}),year=makeChart({...fixture,date:'2001-08-16'});
  const loc=(r,key)=>r.chart.palaces.map(p=>p[key]);
  assert.notDeepEqual(loc(a,'minorStars'),loc(hour,'minorStars'));
  assert.notDeepEqual(loc(a,'adjectiveStars'),loc(day,'adjectiveStars'));
  assert.notDeepEqual(loc(a,'ages'),loc(year,'ages'));
  assert.notDeepEqual(loc(a,'decadal'),loc(hour,'decadal'));
  assert.notEqual(a.chart.earthlyBranchOfBodyPalace,hour.chart.earthlyBranchOfBodyPalace);
  for(const p of a.chart.palaces){assert.ok(p.changsheng12&&p.boshi12&&p.suiqian12&&p.jiangqian12);assert.equal(p.ages.length,10);}
});
test('annual and small-limit age lists agree with independently selected engine years',()=>{
  const r=makeChart(fixture);
  for(const year of [2001,2008,2017,2030,2060,2099]){
    const c=cycleAt(r,`${year}-08-16`);
    assert.ok(annualAges(r.chart,r.chart.palaces[c.yearly.index].earthlyBranch).includes(c.age));
    assert.ok(r.chart.palaces[c.smallLimit.index].ages.includes(c.age));
  }
});
test('all six cycle layers recompute by their calendar unit and survive JSON export',()=>{
  const r=makeChart(fixture),a=cycleAt(r,'2030-07-01','12:00'),month=cycleAt(r,'2030-08-01','12:00'),day=cycleAt(r,'2030-07-02','12:00'),hour=cycleAt(r,'2030-07-01','14:00');
  assert.notDeepEqual(a.monthly,month.monthly);assert.notDeepEqual(a.daily,day.daily);assert.notDeepEqual(a.hourly,hour.hourly);
  assert.deepEqual(a.yearly,hour.yearly);assert.deepEqual(a.monthly,hour.monthly);assert.deepEqual(a.daily,hour.daily);
  for(const key of ['decadal','smallLimit','yearly','monthly','daily','hourly']){assert.equal(a[key].palaceNames.length,12);assert.equal(a[key].mutagen.length,4);if(key!=='smallLimit')assert.equal(a[key].stars.length,12);}
  assert.equal(a.smallLimit.stars,undefined);assert.equal(a.hourly.earthlyBranch,'午');
  assert.equal(JSON.parse(JSON.stringify(exportChart(r,a))).cycle.time,'12:00');assert.throws(()=>cycleAt(r,'2030-07-01','25:00'));
});
test('late-Zi daily and hourly cycles respect the selected rollover convention',()=>{
  const f=makeChart(fixture),c=makeChart({...fixture,dayDivide:'current'});
  assert.deepEqual(cycleAt(f,'2030-07-01','23:30').daily,cycleAt(f,'2030-07-02','00:30').daily);
  assert.deepEqual(cycleAt(c,'2030-07-01','23:30').daily,cycleAt(c,'2030-07-01','00:30').daily);
});
test('user-supplied reference time reproduces visible palace stems, main stars and age ranges',()=>{
  const {chart}=makeChart({...fixture,date:'2026-07-01',time:'22:59',gender:'女'});
  assert.equal(chart.fiveElementsClass,'金四局');assert.equal(chart.soul,'武曲');assert.equal(chart.body,'火星');
  const life=chart.palaces.find(p=>p.name==='命宫');assert.equal(life.heavenlyStem+life.earthlyBranch,'乙未');assert.deepEqual(life.majorStars.map(s=>s.name),['廉贞','七杀']);assert.deepEqual(life.decadal.range,[4,13]);assert.deepEqual(life.ages.slice(0,5),[10,22,34,46,58]);
  const partner=chart.palaces.find(p=>p.name==='夫妻');assert.equal(partner.heavenlyStem+partner.earthlyBranch,'癸巳');assert.deepEqual(partner.decadal.range,[24,33]);
  assert.deepEqual(chart.palaces.map(p=>p.heavenlyStem+p.earthlyBranch),['庚寅','辛卯','壬辰','癸巳','甲午','乙未','丙申','丁酉','戊戌','己亥','庚子','辛丑']);
});
