import test from 'node:test';
import assert from 'node:assert/strict';
import {makeChart,cycleAt} from '../src/chart-engine.mjs';
import {deviceNow,lunarParts,cycleBounds,decadeChoices,currentDecade,yearChoices,monthChoices,dayChoices,cycleNavigation,chooseDecade,chooseYear,chooseMonth,chooseDay,stepCycle,checkedCycle} from '../src/cycle-navigation.mjs';
const fictional={name:'虚构示例',date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false};
const chart=overrides=>makeChart({...fictional,...overrides});
const at=(r,date='2026-09-20',time='12:00')=>checkedCycle(r,{date,time});

test('clicking a palace decade resolves its own range for both directions and people',()=>{
  for(const gender of ['男','女'])for(const date of ['2000-08-16','2001-01-03','1987-04-15']){
    const r=chart({gender,date}),original=JSON.stringify(r.chart),current=at(r);
    const decades=decadeChoices(r).filter(d=>d.key!=='childhood');
    assert.ok(decades.every((d,i)=>!i||d.ageRange[0]>decades[i-1].ageRange[0]));
    for(const d of decades){
      const selected=checkedCycle(r,chooseDecade(r,current,d.index));
      assert.equal(selected.decadal.index,d.index);assert.ok(selected.age>=d.ageRange[0]&&selected.age<=d.ageRange[1]);
      assert.equal(selected.decadal.palaceNames[d.index],'命宫');
      assert.deepEqual(selected.decadal.mutagen,d.mutagen);
      assert.deepEqual(selected.decadal.stars,JSON.parse(JSON.stringify(d.stars)));
      const years=yearChoices(r,d);assert.ok(years.length>=1&&years.length<=10);
      for(const y of years){const c=at(r,y.start);assert.equal(c.age,y.age);assert.equal(c.decadal.index,d.index);assert.equal(c.yearly.heavenlyStem,y.heavenlyStem);}
    }
    assert.equal(JSON.stringify(r.chart),original);
  }
});
test('existing date stays inside an already selected decade; another decade starts at Lunar New Year',()=>{
  const r=chart(),c=at(r),d=currentDecade(r,c);
  assert.deepEqual(chooseDecade(r,c,d.key),{date:'2026-09-20',time:'12:00'});
  const next=checkedCycle(r,chooseDecade(r,c,7));assert.equal(next.date,'2032-02-11');assert.equal(next.age,33);assert.equal(next.decadal.index,7);
  assert.equal(at(r,'2032-02-10').age,32);assert.notEqual(at(r,'2032-02-10').decadal.index,7);
});
test('year selection preserves lunar month/day, falls back from absent leap month and clamps short months',()=>{
  const r=chart(),before=at(r,'2024-02-09'),newyear=at(r,'2024-02-10');
  assert.equal(cycleNavigation(r,before).lunar.year,2023);assert.equal(cycleNavigation(r,newyear).lunar.year,2024);
  const next=checkedCycle(r,chooseYear(r,before,2024));assert.deepEqual(lunarParts(next.date),{year:2024,month:12,day:29,monthLabel:'腊月',dayLabel:'廿九'});
  const leap=at(r,'2023-04-06');const nonLeap=checkedCycle(r,chooseYear(r,leap,2024));assert.equal(lunarParts(nonLeap.date).month,2);assert.equal(lunarParts(nonLeap.date).day,16);
});
test('leap month contains two selectable periods, each matching the engine and stepping in order',()=>{
  const r=chart(),months=monthChoices(r,2023);assert.equal(months.length,14);
  const first=months.find(m=>m.key==='-2:first'),second=months.find(m=>m.key==='-2:second');
  assert.equal(first.start,'2023-03-22');assert.equal(first.end,'2023-04-05');assert.equal(second.start,'2023-04-06');assert.equal(second.end,'2023-04-19');
  assert.equal(dayChoices(first).length,15);assert.equal(dayChoices(second).length,14);
  const c=at(r,'2023-03-22'),a=checkedCycle(r,chooseMonth(r,c,first.key)),b=checkedCycle(r,stepCycle(r,a,'monthly',1));
  assert.equal(cycleNavigation(r,b).month.key,second.key);assert.notEqual(a.monthly.index,b.monthly.index);
  assert.deepEqual(a.monthly.mutagen,first.mutagen);assert.deepEqual(b.monthly.mutagen,second.mutagen);
  const regular=checkedCycle(r,stepCycle(r,b,'monthly',1));assert.equal(lunarParts(regular.effectiveDate).month,3);
  const back=checkedCycle(r,stepCycle(r,regular,'monthly',-1));assert.equal(lunarParts(back.effectiveDate).month,-2);
});
test('day picker follows effective lunar date across late Zi and both change-day conventions',()=>{
  for(const dayDivide of ['forward','current']){
    const r=chart({dayDivide}),late=at(r,'2024-02-09','23:30'),nav=cycleNavigation(r,late);
    assert.equal(nav.lunar.year,dayDivide==='forward'?2024:2023);
    const day=nav.days[Math.min(2,nav.days.length-1)].date,selected=checkedCycle(r,chooseDay(r,late,day));
    assert.equal(selected.effectiveDate,day);assert.equal(selected.time,'23:30');
    assert.equal(cycleNavigation(r,selected).lunar.day,lunarParts(day).day);
    assert.throws(()=>chooseDay(r,late,'2025-08-10'));
  }
});
test('scope stepping recalculates parents across lunar year, month and midnight boundaries',()=>{
  const r=chart(),old=at(r,'2024-02-09','22:30'),hour=checkedCycle(r,stepCycle(r,old,'hourly',1));
  assert.equal(hour.date,'2024-02-10');assert.equal(hour.time,'00:30');assert.equal(hour.yearly.earthlyBranch,'辰');assert.equal(hour.age,25);
  assert.equal(cycleNavigation(r,hour).lunar.month,1);assert.equal(cycleNavigation(r,hour).lunar.day,1);
  const day=checkedCycle(r,stepCycle(r,at(r,'2023-03-21'),'daily',1));assert.equal(cycleNavigation(r,day).month.key,'-2:first');
  const prev=checkedCycle(r,stepCycle(r,hour,'hourly',-1));assert.equal(prev.date,old.date);assert.equal(prev.time,old.time);
});
test('childhood is a short explicit period, not a fabricated decade',()=>{
  const r=chart(),d=decadeChoices(r)[0];assert.equal(d.key,'childhood');assert.deepEqual(d.ageRange,[1,2]);assert.equal(yearChoices(r,d).length,2);
  const child=checkedCycle(r,chooseDecade(r,at(r),'childhood'));assert.equal(child.decadal.name,'童限');assert.equal(child.age,1);
  assert.throws(()=>stepCycle(r,child,'decadal',-1));
});
test('date limits clip partial decades and cannot fall into a fictitious post-lifetime period',()=>{
  for(const date of ['1901-01-01','2099-12-30']){
    const r=chart({date});const bounds=cycleBounds(r),decades=decadeChoices(r);
    assert.equal(decades[0].start,date);assert.ok(decades.every(d=>d.start>=date&&d.end<=bounds.max));
    const last=at(r,bounds.max,'22:00');assert.ok(currentDecade(r,last));
    assert.throws(()=>checkedCycle(r,stepCycle(r,last,'daily',1)));
    assert.throws(()=>checkedCycle(r,stepCycle(r,at(r,date),'daily',-1)));
    assert.throws(()=>checkedCycle(r,{date:bounds.max,time:'23:30'}));
  }
  const future=chart({date:'2099-12-30'});assert.throws(()=>at(future,'2026-09-20'));
});
test('device now uses civil date/time instead of UTC and does not mutate birth inputs',()=>{
  const local=new Date(2026,8,20,0,5);assert.deepEqual(deviceNow(local),{date:'2026-09-20',time:'00:05'});
  const r=chart(),original=JSON.stringify(r.input);checkedCycle(r,deviceNow(local));assert.equal(JSON.stringify(r.input),original);
});
test('interleaved charts keep their individual conventions while navigating',()=>{
  const forward=chart(),current=chart({dayDivide:'current',date:'2001-02-10',gender:'女'});
  const a=at(forward,'2024-02-09','23:30');monthChoices(current,2023);decadeChoices(current);yearChoices(current,decadeChoices(current)[1]);
  const repeat=checkedCycle(forward,chooseYear(forward,a,2024));assert.deepEqual(repeat.daily,a.daily);assert.equal(repeat.yearly.earthlyBranch,'辰');
  assert.equal(cycleAt(current,'2024-02-09','23:30').yearly.earthlyBranch,'卯');
});
