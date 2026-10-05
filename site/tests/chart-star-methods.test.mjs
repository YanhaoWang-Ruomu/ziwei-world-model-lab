import test from 'node:test';
import assert from 'node:assert/strict';
import {astro} from 'iztro';
import {SETTING_FIELDS,ALL_SETTING_FIELDS,defaultSettings,normalizeSettings,upgradeSettings,encodeSettings,decodeSettings} from '../src/chart-conventions.mjs';
import {makeChart,cycleAt,exportChart} from '../src/chart-engine.mjs';
import {normalizeCaseBundle} from '../server/chart-case-transfer.mjs';
const birth={name:'虚构安法测试',date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false};
const withMethods=(options,input={})=>{const b={...birth,...input};return makeChart({...b,settings:defaultSettings({...b,...options})});};
const palace=(r,name)=>r.chart.palaces.find(p=>['majorStars','minorStars','adjectiveStars'].some(key=>p[key].some(s=>s.name===name)));
const majors=r=>r.chart.palaces.map(p=>p.majorStars);

test('GXT1 remains exact; GXT2 covers independent choices and rejects unavailable tables',()=>{
  for(let n=0;n<64;n++){
    const legacy={version:1,engine:'iztro 2.6.1',options:Object.fromEntries(SETTING_FIELDS.map((f,i)=>[f.key,f.values[(n>>i)&1]]))};
    const code=encodeSettings(legacy);assert.match(code,/^GXT1-/);assert.deepEqual(decodeSettings(code),legacy);
    const migrated=upgradeSettings(legacy);assert.equal(migrated.options.soul,legacy.options.algorithm==='zhongzhou'?'year':'palace');assert.deepEqual(decodeSettings(encodeSettings(migrated)),migrated);
  }
  for(const f of ALL_SETTING_FIELDS)for(const value of f.values){const settings=defaultSettings();settings.options[f.key]=value;const code=encodeSettings(settings);assert.match(code,/^GXT2-/);assert.equal(code.length,15);assert.deepEqual(decodeSettings(code),settings);assert.throws(()=>decodeSettings(code.slice(0,-1)+(code.endsWith('0')?'1':'0')));}
  const invalid=defaultSettings();invalid.options.brightness='modern1';assert.throws(()=>normalizeSettings(invalid),/星曜亮度/);
});
test('legacy schemes reproduce the original iztro chart without shifting saved stars',()=>{
  for(const algorithm of ['default','zhongzhou']){
    const settings={version:1,engine:'iztro 2.6.1',options:{...Object.fromEntries(SETTING_FIELDS.map(f=>[f.key,f.values[0]])),algorithm}};
    const actual=makeChart({...birth,settings});astro.config(actual.config);
    assert.deepEqual(actual.chart,astro.bySolar(birth.date,2,birth.gender,true,'zh-CN').toJSON());
    const late=makeChart({...birth,date:'2023-04-07',time:'23:30',settings});astro.config(late.config);assert.deepEqual(late.chart,astro.bySolar('2023-04-07',12,birth.gender,true,'zh-CN').toJSON());
  }
});
test('exported settings are a snapshot even if the caller reuses its settings object',()=>{
  const settings=defaultSettings(),r=makeChart({...birth,settings}),snapshot=structuredClone(settings);settings.options.tianma='month';assert.deepEqual(exportChart(r).input.settings,snapshot);
});
test('horse and sky placement can change independently without moving major stars',()=>{
  const native=withMethods({}, {date:'2000-06-15'}),month=withMethods({tianma:'month'},{date:'2000-06-15'});
  assert.equal(palace(native,'天马').earthlyBranch,'寅');assert.equal(palace(month,'天马').earthlyBranch,'申');assert.deepEqual(majors(native),majors(month));
  const shifted=withMethods({tiankong:'hour'}),normal=withMethods({});assert.equal(palace(normal,'天空').earthlyBranch,'巳');assert.equal(palace(shifted,'天空').earthlyBranch,'未');assert.deepEqual(majors(shifted),majors(normal));
  const combined=withMethods({tiankong:'hour',tianma:'month'},{date:'2000-06-15'});assert.equal(palace(combined,'天马').earthlyBranch,'申');assert.equal(palace(combined,'天空').earthlyBranch,'未');
});
test('four Kui Yue choices distinguish Xin from Geng and also apply to annual stars',()=>{
  const branches=(method,date)=>{const r=withMethods({kuiyue:method},{date});return ['天魁','天钺'].map(n=>palace(r,n).earthlyBranch);};
  assert.deepEqual(branches('xinHorseTiger','2001-08-16'),['午','寅']);assert.deepEqual(branches('xinTigerHorse','2001-08-16'),['寅','午']);
  assert.deepEqual(branches('xinTigerHorse','2000-08-16'),['丑','未']);assert.deepEqual(branches('gengXinHorseTiger','2000-08-16'),['午','寅']);assert.deepEqual(branches('gengXinTigerHorse','2000-08-16'),['寅','午']);
  const r=withMethods({kuiyue:'xinTigerHorse'}),h=cycleAt(r,'2001-08-16');assert.equal(h.yearly.stars[0].some(s=>s.name==='流魁'),true);assert.equal(h.yearly.stars[4].some(s=>s.name==='流钺'),true);
});
test('Tian Shi and Tian Shang override is separate from base algorithm and life ruler',()=>{
  const normal=withMethods({},{gender:'女'}),swapped=withMethods({tianshi:'zhongzhou'},{gender:'女'});
  assert.equal(palace(normal,'天使').name,'疾厄');assert.equal(palace(swapped,'天使').name,'仆役');assert.equal(palace(swapped,'天伤').name,'疾厄');assert.equal(swapped.chart.soul,normal.chart.soul);assert.deepEqual(majors(swapped),majors(normal));
  const year=withMethods({soul:'year'}),base=withMethods({});assert.notEqual(year.chart.soul,base.chart.soul);assert.deepEqual(year.chart.palaces,base.chart.palaces);
});
test('single and paired void methods produce unique stars with the same primary locations',()=>{
  const single=withMethods({kongwang:'single'}),double=withMethods({kongwang:'double'});
  for(const name of ['截空','旬空'])assert.equal(palace(single,name).index,palace(double,name).index);
  assert.equal(palace(single,'副截'),undefined);assert.equal(palace(single,'副旬'),undefined);
  for(const names of [['截空','副截'],['旬空','副旬']])assert.equal(Math.abs(palace(double,names[0]).index-palace(double,names[1]).index),1);
  const stars=double.chart.palaces.flatMap(p=>p.adjectiveStars);for(const name of ['截空','副截','旬空','副旬'])assert.equal(stars.filter(s=>s.name===name).length,1);
});
test('annual transformation source changes four transformations but preserves calendar stem',()=>{
  const normal=cycleAt(withMethods({}),'2026-08-16'),palaceStem=cycleAt(withMethods({yearlyMutagen:'palace'}),'2026-08-16');
  assert.equal(normal.yearly.heavenlyStem,'丙');assert.equal(palaceStem.yearly.heavenlyStem,'丙');assert.equal(palaceStem.yearly.mutagenHeavenlyStem,'壬');
  assert.deepEqual(normal.yearly.mutagen,['天同','天机','文昌','廉贞']);assert.deepEqual(palaceStem.yearly.mutagen,['天梁','紫微','左辅','武曲']);assert.deepEqual(palaceStem.monthly.mutagen,normal.monthly.mutagen);
});
test('longevity direction and earth start are independent of decade direction',()=>{
  const native=withMethods({},{gender:'女'}),forward=withMethods({changshengDirection:'forward'},{gender:'女'});
  const start=native.chart.palaces.findIndex(p=>p.changsheng12==='长生');assert.equal(forward.chart.palaces[(start+1)%12].changsheng12,'沐浴');assert.notEqual(native.chart.palaces[(start+1)%12].changsheng12,'沐浴');assert.deepEqual(native.chart.palaces.map(p=>p.decadal),forward.chart.palaces.map(p=>p.decadal));
  const earth=Array.from({length:12},(_,i)=>withMethods({},{time:String(i*2).padStart(2,'0')+':00'})).find(r=>r.chart.fiveElementsClass==='土五局');assert.ok(earth);
  const fire=withMethods({earthChangsheng:'fire'},{time:earth.input.time});assert.equal(earth.chart.palaces.find(p=>p.changsheng12==='长生').earthlyBranch,'申');assert.equal(fire.chart.palaces.find(p=>p.changsheng12==='长生').earthlyBranch,'寅');
});
test('combined methods survive export, scheme codes and interleaved calculations',()=>{
  const options={tianma:'month',tiankong:'hour',kongwang:'double',tianshi:'zhongzhou',kuiyue:'gengXinTigerHorse',soul:'year',yearlyMutagen:'palace',changshengDirection:'forward',earthChangsheng:'fire'};
  const r=withMethods(options),expected=cycleAt(r,'2026-08-16'),exported=JSON.parse(JSON.stringify(exportChart(r,expected))),record=normalizeCaseBundle(exported).records[0];
  makeChart({...birth,date:'2001-08-16'});assert.deepEqual(cycleAt(r,'2026-08-16'),expected);
  const restored=makeChart({...record.birth,settings:decodeSettings(encodeSettings(record.settings))});assert.deepEqual(restored.chart,r.chart);assert.deepEqual(cycleAt(restored,'2026-08-16'),expected);
});
test('late Zi and leap-month conventions remain consistent for independent methods',()=>{
  const options={tianma:'month',tiankong:'hour',kongwang:'double',tianshi:'zhongzhou',kuiyue:'gengXinTigerHorse',soul:'year'};
  for(const fixLeap of [true,false]){
    const late=withMethods(options,{date:'2023-04-07',time:'23:30',fixLeap}),next=withMethods(options,{date:'2023-04-08',time:'00:30',fixLeap});
    assert.deepEqual(late.chart.palaces,next.chart.palaces);assert.equal(late.chart.soul,next.chart.soul);
    const current=withMethods(options,{date:'2023-04-07',time:'23:30',fixLeap,dayDivide:'current'}),early=withMethods(options,{date:'2023-04-07',time:'00:30',fixLeap,dayDivide:'current'});
    assert.deepEqual(current.chart.palaces,early.chart.palaces);
  }
});
