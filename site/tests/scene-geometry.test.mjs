import test from 'node:test';
import assert from 'node:assert/strict';
import {earthGeometry,viewVector} from '../src/scene-geometry.mjs';
import {coverImage,terrainAlpha,TERRAIN_SIZE} from '../src/terrain-profile.mjs';
import {worldAt} from '../src/world-time.mjs';
import {unitVector} from '../src/starfield.mjs';

test('the Earth stays partly below the viewport on desktop and portrait screens',()=>{
  for(const [w,h] of [[1920,1080],[390,844],[1024,768]]){
    const globe=earthGeometry(w,h);
    assert.equal(globe.x,w/2);
    assert.ok(globe.y>h);
    assert.ok(globe.y-globe.radius>h*.65);
    assert.ok(globe.y-globe.radius<h*.92);
    assert.ok(globe.y+globe.radius>h);
  }
});

test('the landscape covers the width, keeps its aspect ratio and meets the bottom',()=>{
  for(const [w,h] of [[1920,1080],[390,844],[2560,900]]){
    const r=coverImage(w,h);
    assert.ok(r.left<=0&&r.left+r.width>=w);
    assert.equal(r.top+r.height,h);
    assert.ok(Math.abs(r.width/r.height-TERRAIN_SIZE[0]/TERRAIN_SIZE[1])<1e-12);
  }
});

test('actual transparent skyline stays clear, land opaque and fine edges gradual',()=>{
  assert.equal(terrainAlpha(0),0);
  assert.equal(terrainAlpha(242),255);
  assert.equal(terrainAlpha(255),255);
  const edge=terrainAlpha(128);
  assert.ok(edge>0&&edge<255);
  for(let alpha=1;alpha<=255;alpha++)assert.ok(terrainAlpha(alpha)>=terrainAlpha(alpha-1));
});

test('the scenic reference frame moves stars, Sun and Moon as the clock advances',()=>{
  const a=worldAt(new Date('2026-09-22T00:00:00Z'));
  const b=worldAt(new Date('2026-09-22T06:00:00Z'));
  const star=unitVector(11.0621,61.7508);
  for(const [first,second] of [[star,star],[a.sun.vector,b.sun.vector],[a.moon.vector,b.moon.vector]]){
    const p=viewVector(first,a),q=viewVector(second,b);
    assert.ok(Math.abs(Math.hypot(...p)-1)<1e-10);
    assert.ok(Math.abs(Math.hypot(...q)-1)<1e-10);
    const angle=Math.acos(Math.min(1,p.reduce((sum,x,i)=>sum+x*q[i],0)));
    assert.ok(angle>30*Math.PI/180);
  }
});

test('distance comparison preserves inertial catalogue coordinates',()=>{
  const vector=unitVector(11.0621,61.7508),world=worldAt(new Date('2026-09-22T00:00:00Z'));
  assert.deepEqual(viewVector(vector,world,{depth:true}),vector);
  assert.deepEqual(viewVector(vector,world,{skyOnly:false}),vector);
});
