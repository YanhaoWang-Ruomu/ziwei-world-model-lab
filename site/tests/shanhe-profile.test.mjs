import test from 'node:test';
import assert from 'node:assert/strict';
import {shanheRidge,shanheLandAlpha,shanheRiver,SHANHE_RIVER} from '../src/shanhe-profile.mjs';
import {coverImage} from '../src/terrain-profile.mjs';
import {scenicRect} from '../src/scene-presence.mjs';

test('the painted valley remains open to the sky while both mountain shoulders occlude stars',()=>{
  assert.equal(shanheLandAlpha(.5,.25),0);
  assert.equal(shanheLandAlpha(.165,.25),255);
  assert.equal(shanheLandAlpha(.955,.25),255);
  for(let x=0;x<=1;x+=.005){
    const ridge=shanheRidge(x);
    assert.equal(shanheLandAlpha(x,ridge-.02),0);
    assert.equal(shanheLandAlpha(x,ridge+.02),255);
    assert.ok(shanheLandAlpha(x,ridge)>100&&shanheLandAlpha(x,ridge)<160);
  }
});
test('every reflective river segment stays below the ridge, with continuous banks',()=>{
  let previous=shanheRiver(.46);
  for(let y=.46;y<=1;y+=.001){
    const [center,width]=shanheRiver(y);
    for(const x of [center-width,center,center+width])assert.equal(shanheLandAlpha(x,y),255);
    assert.ok(Math.abs(center-previous[0])<.01);
    assert.ok(width>0&&width<.1);previous=[center,width];
  }
  assert.equal(SHANHE_RIVER.at(-1)[0],1);
});
test('portrait and landscape cameras leave usable sky above the central valley',()=>{
  for(const [w,h] of [[390,844],[430,932],[1440,900],[1024,600]]){
    const r=scenicRect(coverImage(w,h),w,h);
    const horizon=r.top+shanheRidge(.5)*r.height;
    assert.ok(horizon/h>.28&&horizon/h<.60);
    assert.ok(r.left<=0&&r.left+r.width>=w&&r.top+r.height>=h);
  }
});
