import test from 'node:test';
import assert from 'node:assert/strict';
import {worldAt,atLocalHour,localHour,seasonDate,createWorldClock,lightAt,DAY_MS,REFERENCE_SITE} from '../src/world-time.mjs';
import {earthViewLongitude} from '../src/earth-globe.mjs';
const rad=Math.PI/180;
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const angle=(a,b)=>Math.acos(Math.min(1,Math.max(-1,dot(a,b))));

test('local clock keeps the reference calendar date across UTC midnight',()=>{
  const date=new Date('2026-09-19T20:00:00Z');
  assert.equal(atLocalHour(date,0).toISOString(),'2026-09-19T16:00:00.000Z');
  assert.equal(atLocalHour(date,23.5).toISOString(),'2026-09-20T15:30:00.000Z');
  assert.equal(localHour(atLocalHour(date,19.25)),19.25);
  assert.throws(()=>atLocalHour(date,25));assert.throws(()=>atLocalHour(date,NaN));
});
test('reference sky and Earth lighting agree at local noon and midnight',()=>{
  const date=new Date('2026-09-22T00:00:00Z'),lat=REFERENCE_SITE.latitude*rad,lon=REFERENCE_SITE.longitude*rad;
  const observer=[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
  const noon=worldAt(atLocalHour(date,12)),midnight=worldAt(atLocalHour(date,0));
  assert.ok(noon.sun.altitude>55);assert.ok(midnight.sun.altitude<-50);
  assert.ok(noon.daylight>.99);assert.equal(noon.night,0);
  assert.equal(midnight.daylight,0);assert.equal(midnight.night,1);
  for(const world of [noon,midnight]){
    assert.ok(Math.abs(Math.sin(world.sun.altitude*rad)-dot(observer,world.sunEarthFixed))<.003);
    for(const body of world.bodies){assert.ok(Math.abs(Math.hypot(...body.horizontal)-1)<1e-10);assert.ok(body.phase>=0&&body.phase<=1);}
  }
});
test('sun rises in the east and sets in the west, and the Moon advances over a day',()=>{
  const date=new Date('2026-09-22T00:00:00Z'),morning=worldAt(atLocalHour(date,7)),evening=worldAt(atLocalHour(date,17));
  assert.ok(morning.sun.horizontal[1]>0);assert.ok(evening.sun.horizontal[1]<0);
  const a=worldAt(date),b=worldAt(new Date(date.getTime()+DAY_MS));
  assert.ok(angle(a.moon.vector,b.moon.vector)>8*rad);
});
test('solstice selection changes solar declination and daylight length',()=>{
  const summer=seasonDate(2026,'summer'),winter=seasonDate(2026,'winter');
  assert.ok(worldAt(summer).sunDeclination>23);assert.ok(worldAt(winter).sunDeclination<-23);
  const hours=date=>Array.from({length:24},(_,h)=>worldAt(atLocalHour(date,h)).sun.altitude).filter(a=>a>0).length;
  assert.ok(hours(summer)>hours(winter));assert.throws(()=>seasonDate(2026,'unknown'));
});
test('Earth camera drift does not cancel the day/night terminator',()=>{
  const a=worldAt(new Date('2026-09-19T16:00:00Z')),b=worldAt(new Date('2026-09-20T04:00:00Z'));
  const delta=earthViewLongitude(b.sidereal,a.sidereal)-earthViewLongitude(a.sidereal,a.sidereal);
  const wrapped=Math.atan2(Math.sin(delta),Math.cos(delta));
  assert.ok(Math.abs(wrapped)<12*rad);
  const incidence=w=>{const lon=earthViewLongitude(w.sidereal,a.sidereal);return dot([Math.cos(lon),Math.sin(lon),0],w.sunEarthFixed);};
  assert.ok(Math.abs(incidence(a)-incidence(b))>.6);
  assert.notEqual(earthViewLongitude(b.sidereal,a.sidereal,.5),earthViewLongitude(b.sidereal,a.sidereal,0));
});
test('normal touring advances one day in 100 seconds; manual hour recalculates Moon state',()=>{
  const c=createWorldClock(new Date('2026-09-20T00:00:00Z')),start=c.snapshot().date.getTime();
  for(let i=0;i<1000;i++)c.tick(100);
  assert.ok(Math.abs(c.snapshot().date.getTime()-start-DAY_MS)<15000);
  const before=c.snapshot();assert.equal(c.snapshot(),before);
  c.hour(12);assert.equal(c.modeName,'cycle');assert.ok(Math.abs(c.snapshot().hour-12)<1e-7);
  c.season('winter');assert.ok(c.snapshot().sunDeclination<-23);
  c.restart();assert.equal(c.snapshot().hour,19.25);
});
test('moonlight depends on illuminated fraction and altitude, not the label night alone',()=>{
  assert.ok(lightAt(-20,45,1).moonlight>.9);
  assert.equal(lightAt(-20,-10,1).moonlight,0);
  assert.equal(lightAt(-20,45,0).moonlight,0);
  assert.equal(lightAt(30,45,1).moonlight,0);
});

test('lunar Earth lighting is normalized, global, and consistent with sky altitude',()=>{
  const lat=REFERENCE_SITE.latitude*rad,lon=REFERENCE_SITE.longitude*rad;
  const normal=[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
  for(const time of ['2026-09-20T04:00:00Z','2026-09-26T16:00:00Z','2026-10-10T10:00:00Z']){
    const date=new Date(time),world=worldAt(date);
    assert.ok(Math.abs(Math.hypot(...world.moonEarthFixed)-1)<1e-12);
    // The surface view includes lunar parallax, unlike the globe's geocentric direction.
    assert.ok(Math.abs(Math.asin(dot(normal,world.moonEarthFixed))-world.moon.altitude*rad)<1.1*rad);
    const elsewhere=worldAt(date,{latitude:-30,longitude:-60,offsetHours:-4});
    assert.deepEqual(elsewhere.moonEarthFixed,world.moonEarthFixed);
  }
});
