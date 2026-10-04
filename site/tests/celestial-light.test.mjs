import test from 'node:test';
import assert from 'node:assert/strict';
import {lunarLight,stellarAppearance,celestialRadius} from '../src/celestial-light.mjs';
import {celestialUV} from '../src/deep-sky.mjs';
import {solarSystemAt} from '../src/sky-ephemeris.mjs';

test('lit lunar disk area follows the phase through every orientation',()=>{
  for(const phase of [0,.1,.25,.5,.75,.9,1])for(const angle of [0,1.2,Math.PI]){
    const light=lunarLight(phase,angle);let lit=0,total=0;
    for(let y=-100;y<=100;y++)for(let x=-100;x<=100;x++){
      const nx=x/100,ny=y/100,r2=nx*nx+ny*ny;if(r2>=1)continue;
      if(nx*light[0]+ny*light[1]+Math.sqrt(1-r2)*light[2]>0)lit++;total++;
    }
    assert.ok(Math.abs(lit/total-phase)<.008,`${phase}, ${angle}: ${lit/total}`);
  }
});
test('space stars do not scintillate; reduced motion freezes atmospheric shimmer',()=>{
  for(const options of [{atmosphere:false},{atmosphere:true,reduced:true}])assert.deepEqual(stellarAppearance(1,2,0,options),stellarAppearance(1,2,8,options));
  assert.notEqual(stellarAppearance(2,2,0).alpha,stellarAppearance(2,2,1).alpha);
  for(const mag of [-1.5,0,2,6,10])for(let t=0;t<40;t++){
    const s=stellarAppearance(mag,1.5,t);assert.ok(s.alpha>=0&&s.alpha<=1);assert.ok(s.radius>0);
  }
});
test('NASA panorama uses RA increasing left and north at the top',()=>{
  assert.deepEqual(celestialUV([1,0,0]),[.5,.5]);
  assert.deepEqual(celestialUV([0,1,0]),[.25,.5]);
  assert.deepEqual(celestialUV([0,-1,0]),[.75,.5]);
  assert.equal(celestialUV([0,0,1])[1],0);assert.equal(celestialUV([0,0,-1])[1],1);
  assert.equal(celestialUV([-1,0,0])[0],0);
});
test('lunar pole and libration are finite and keep a legible bounded disk',()=>{
  const moon=solarSystemAt(new Date('2026-09-20T13:00:00Z'))[1];
  assert.ok(Math.abs(Math.hypot(...moon.pole)-1)<1e-10);
  assert.ok(Math.abs(moon.libration.longitude)<10&&Math.abs(moon.libration.latitude)<10);
  for(const [w,h] of [[390,844],[1920,1080]])for(const scale of [.45,.83,5]){
    const r=celestialRadius('Moon',w,h,scale,moon.distanceKm);assert.ok(r>=11&&r<=76);
  }
});
