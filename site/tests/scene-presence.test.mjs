import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresence,scenicRect,foregroundRect} from '../src/scene-presence.mjs';
import {coverImage} from '../src/terrain-profile.mjs';

test('pointer and dolly motion ease toward a bounded target without overshoot',()=>{
  const scene=createPresence();scene.point(4,-4);scene.dolly(3);
  let prior=scene.tick(0);
  for(let i=0;i<120;i++){
    const next=scene.tick(33);
    assert.ok(next.x>=prior.x&&next.x<=1);
    assert.ok(next.y<=prior.y&&next.y>=-1);
    assert.ok(next.travel>=prior.travel&&next.travel<=1);
    prior=next;
  }
  assert.ok(prior.travel>.999);assert.equal(scene.moving,false);
});

test('moving to either edge never exposes a gap beyond the photographic terrain',()=>{
  for(const [w,h] of [[1920,1080],[390,844],[2560,900]])for(const x of [-1,1])for(const y of [-1,1])for(const travel of [0,1]){
    const r=scenicRect(coverImage(w,h),w,h,{x,y,travel});
    assert.ok(r.left<=0&&r.left+r.width>=w);
    assert.ok(r.top+r.height>=h-1e-9);
  }
});

test('foreground moves farther than the mountain plane and both react to depth',()=>{
  const base=coverImage(1920,1080),rest={x:0,y:0,travel:0},turn={x:1,y:0,travel:0};
  const hills=scenicRect(base,1920,1080,rest),moved=scenicRect(base,1920,1080,turn);
  const near=foregroundRect(1920,1080,rest),nearMoved=foregroundRect(1920,1080,turn);
  assert.ok(Math.abs(nearMoved.left-near.left)>Math.abs(moved.left-hills.left)*2);
  assert.ok(scenicRect(base,1920,1080,{travel:1}).width>hills.width);
});

test('a water response expires and reduced-motion mode clears all automatic movement',()=>{
  const scene=createPresence();scene.ripple(.4,.9);assert.ok(scene.tick(33).pulse);
  for(let i=0;i<160;i++)scene.tick(33);
  assert.equal(scene.tick(0).pulse,null);assert.equal(scene.moving,false);
  scene.point(1,1);scene.dolly(1);scene.ripple(.5,.4,true);
  const still=scene.tick(33,{reduced:true});
  assert.deepEqual(still,{x:0,y:0,travel:1,pulse:null,reduced:true});assert.equal(scene.moving,false);
});
