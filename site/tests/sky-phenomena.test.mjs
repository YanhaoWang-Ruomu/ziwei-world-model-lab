import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldClock,DAY_MS,worldAt} from '../src/world-time.mjs';
import {planetsAt,lunarPhaseName} from '../src/sky-ephemeris.mjs';
import {eventForSlot,moonConjunction,createSkyPhenomena} from '../src/sky-phenomena.mjs';

test('phase controls find actual new, quarter and full Moons, not cosmetic overlays',()=>{
  for(const [angle,name,illumination] of [[0,'新月',0],[90,'上弦月',.5],[180,'满月',1],[270,'下弦月',.5]]){
    const c=createWorldClock(new Date('2026-09-20T00:00:00Z')),before=c.snapshot().date;
    const w=c.phase(angle);
    assert.equal(w.moon.phaseName,name);assert.ok(Math.abs(w.moon.phase-illumination)<.01);
    assert.ok(w.date>=before&&w.date-before<35*DAY_MS);
  }
  assert.equal(lunarPhaseName(-90),'下弦月');assert.equal(lunarPhaseName(360),'新月');
  const c=createWorldClock(new Date('2026-09-20T00:00:00Z'));assert.throws(()=>c.phase(42));
});

test('monthly tour advances a synodic month in three minutes',()=>{
  const c=createWorldClock(new Date('2026-09-20T00:00:00Z'));c.mode('lunar');const start=c.snapshot().date.getTime();
  for(let i=0;i<1800;i++)c.tick(100);
  assert.ok(Math.abs((c.snapshot().date.getTime()-start)/DAY_MS-29.53059)<.001);
});

test('five visible planets have changing normalized sky coordinates and finite distances',()=>{
  const a=planetsAt(new Date('2026-09-20T00:00:00Z')),b=planetsAt(new Date('2026-10-20T00:00:00Z'));
  assert.deepEqual(a.map(p=>p.name),['水星','金星','火星','木星','土星']);
  for(let i=0;i<a.length;i++){
    assert.ok(Math.abs(Math.hypot(...a[i].vector)-1)<1e-12);assert.ok(Number.isFinite(a[i].mag)&&a[i].distanceKm>0);
    assert.notDeepEqual(a[i].vector,b[i].vector);
  }
  assert.equal(worldAt(new Date('2026-09-20T00:00:00Z')).bodies.length,7);
});

test('occasional phenomena are sparse, repeatable and suppressible',()=>{
  const events=Array.from({length:2000},(_,i)=>eventForSlot(i,12));
  assert.deepEqual(events,Array.from({length:2000},(_,i)=>eventForSlot(i,12)));
  assert.ok(events.filter(Boolean).length<1000);
  assert.ok(events.filter(e=>e?.kind==='comet').length<60);
  assert.equal(new Set(events.filter(Boolean).map(e=>e.kind)).size,5);
  const engine=createSkyPhenomena({seed:12}),neverPaint=new Proxy({},{get(){throw Error('Disabled effect attempted to paint');}});
  engine.draw(neverPaint,{reduced:true});engine.draw(neverPaint,{skyOnly:false});
  engine.setEnabled(false);engine.draw(neverPaint,{});
});

test('conjunction labels require actual angular proximity and a visible night sky',()=>{
  const world={sun:{altitude:-20},moon:{altitude:30,vector:[1,0,0]},bodies:[{planet:true,name:'木星',altitude:30,vector:[1,0,0]}]};
  assert.match(moonConjunction(world),/木星伴月/);
  assert.equal(moonConjunction({...world,sun:{altitude:20}}),null);
  assert.equal(moonConjunction({...world,bodies:[{...world.bodies[0],vector:[0,1,0]}]}),null);
});
