import test from 'node:test';
import assert from 'node:assert/strict';
import {diskCoverage,eclipseGeometry,eclipseWorld,haloDirections,showerTrack,ALIGNMENT_DATE,fitAlignmentCamera} from '../src/celestial-events.mjs';
import {viewVector} from '../src/scene-geometry.mjs';
import {worldAt} from '../src/world-time.mjs';
import {createSkyPhenomena} from '../src/sky-phenomena.mjs';

test('eclipse geometry covers and uncovers a luminous disk continuously',()=>{
  assert.equal(diskCoverage(3),0);assert.equal(diskCoverage(0),1);assert.equal(diskCoverage(0,.5),.25);
  for(const kind of ['solar-eclipse','lunar-eclipse']){
    assert.equal(eclipseGeometry(kind,0).coverage,0);assert.equal(eclipseGeometry(kind,1).coverage,0);
    assert.equal(eclipseGeometry(kind,.5).coverage,1);
    let previous=0;
    for(let i=0;i<=500;i++){
      const e=eclipseGeometry(kind,i/1000),mirror=eclipseGeometry(kind,1-i/1000);
      assert.ok(Number.isFinite(e.coverage)&&e.coverage>=previous-1e-9);
      assert.ok(Math.abs(e.coverage-mirror.coverage)<1e-10);assert.ok(e.coverage-previous<.025);previous=e.coverage;
    }
  }
});
test('eclipse lighting leaves ephemeris intact and restores original illumination',()=>{
  const w=worldAt(new Date('2026-09-20T04:00:00Z')),copy=JSON.stringify(w);
  const full=eclipseWorld(w,eclipseGeometry('solar-eclipse',.5));
  assert.ok(full.daylight<w.daylight*.01);assert.equal(full.bodies,w.bodies);
  assert.equal(eclipseWorld(w,eclipseGeometry('solar-eclipse',1)).daylight,w.daylight);
  assert.equal(JSON.stringify(w),copy);
  const moon=eclipseWorld(w,eclipseGeometry('lunar-eclipse',.5));assert.ok(moon.lunarTransmission<.1);assert.equal(moon.daylight,w.daylight);
});
test('halo stays 22 degrees from the Moon even across the celestial pole',()=>{
  for(const center of [[0,0,1],[1,0,0],[.6,0,.8]])for(const v of haloDirections(center)){
    assert.ok(Math.abs(Math.hypot(...v)-1)<1e-12);
    const angle=Math.acos(v.reduce((s,n,i)=>s+n*center[i],0))*180/Math.PI;
    assert.ok(Math.abs(angle-22)<1e-10);
  }
});
test('shower tracks radiate outwards with varied timing and directions',()=>{
  const tracks=Array.from({length:48},(_,i)=>showerTrack(i));
  assert.ok(new Set(tracks.map(t=>t.start)).size>40);assert.ok(new Set(tracks.map(t=>t.dx)).size>40);
  for(const t of tracks){assert.ok(Math.abs(Math.hypot(t.dx,t.dy)-1)<1e-12);assert.ok(t.dy>0&&t.duration>.4);}
});
test('historical alignment uses five real planets above the reference horizon',()=>{
  const w=worldAt(new Date(ALIGNMENT_DATE)),planets=w.bodies.filter(b=>b.planet);
  assert.equal(planets.length,5);assert.ok(planets.every(p=>p.altitude>5));assert.ok(w.sun.altitude< -6);
});
test('manual demos hold the sky briefly and can always be cancelled',()=>{
  const e=createSkyPhenomena({seed:1});e.setEnabled(true);
  for(const kind of ['fireball','halo','comet','shower','alignment','solar-eclipse','lunar-eclipse']){
    assert.equal(e.preview(kind,100),true);assert.equal(e.holdsClock(101),true);assert.equal(e.current(101).kind,kind);
    e.cancel();assert.equal(e.holdsClock(101),false);
  }
  e.preview('solar-eclipse',100);assert.equal(e.current(119).coverage,1);e.seek(119,.2);assert.ok(Math.abs(e.current(119).progress-.2)<1e-10);e.seek(119,1);assert.ok(e.current(119));assert.equal(e.holdsClock(139),false);
  e.preview('halo',150);e.setEnabled(false);assert.equal(e.current(151),null);assert.equal(e.preview('invalid',0),false);
});
test('alignment framing keeps all five planets above terrain at phone, tablet and desktop sizes',()=>{
  const w=worldAt(new Date(ALIGNMENT_DATE)),vectors=w.bodies.filter(b=>b.planet).map(b=>viewVector(b.vector,w,{skyOnly:true,depth:false}));
  for(const [width,height]of [[390,844],[768,1024],[1920,1080],[1280,720]]){
    const {yaw,pitch,scale,center}=fitAlignmentCamera(vectors,width,height),f=Math.max(width,height)*.7*scale;
    for(const [x,y,z]of vectors){
      const front=Math.cos(pitch)*Math.cos(yaw)*x+Math.cos(pitch)*Math.sin(yaw)*y+Math.sin(pitch)*z;
      const sx=width*center[0]+(-Math.sin(yaw)*x+Math.cos(yaw)*y)/front*f;
      const sy=height*center[1]-(-Math.sin(pitch)*Math.cos(yaw)*x-Math.sin(pitch)*Math.sin(yaw)*y+Math.cos(pitch)*z)/front*f;
      assert.ok(front>.12);assert.ok(sx>width*.07&&sx<width*.93);assert.ok(sy>height*.12&&sy<height*.43);
    }
  }
});
