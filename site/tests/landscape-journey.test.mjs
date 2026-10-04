import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyShot} from '../src/landscape-journey.mjs';
import {photographicRect} from '../src/journey-motion.mjs';

test('opening progresses through the three painted chapters: cloud sea, river and night',()=>{
  assert.equal(journeyShot(0).cloud,1);
  assert.equal(journeyShot(.45).river,1);
  assert.equal(journeyShot(.8).sky,1);
  assert.equal(journeyShot(0).caption,0);
  assert.equal(journeyShot(.05).caption,0);
  assert.equal(journeyShot(1).caption,0);
  assert.equal(journeyShot(-1).cloud,1);
  assert.equal(journeyShot(2).sky,1);
});

test('dissolves retain complete coverage and never jump between adjacent frames',()=>{
  let prior=journeyShot(0);
  for(let i=1;i<=2800;i++){
    const frame=journeyShot(i/2800);
    assert.ok(Math.abs(frame.cloud+frame.river+frame.sky-1)<1e-12);
    for(const key of ['cloud','river','sky','cloudTravel','riverTravel']){
      assert.ok(frame[key]>=0&&frame[key]<=1);
      assert.ok(Math.abs(frame[key]-prior[key])<.01);
    }
    prior=frame;
  }
});

test('moving photographic plates cover wide and portrait screens without stretching',()=>{
  for(const [w,h] of [[1920,1080],[390,844],[2560,900]]){
    for(const x of [-1.4,0,1.4])for(const y of [-1.1,0,1.1]){
      const [left,top,width,height]=photographicRect(w,h,1.03,x,y);
      assert.ok(left<=0&&top<=0&&left+width>=w&&top+height>=h);
      assert.ok(Math.abs(width/height-1672/941)<1e-12);
    }
  }
});
