import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAirNoise,soundMix} from '../src/scene-sound.mjs';

test('looping ambience is finite, bounded, non-silent and has no level discontinuity',()=>{
  for(const seed of [173,817]){
    const wave=makeAirNoise(48000*8,seed);
    let sum=0,squares=0;
    for(const sample of wave){assert.ok(Number.isFinite(sample)&&Math.abs(sample)<=1);sum+=sample;squares+=sample*sample;}
    assert.ok(Math.abs(sum/wave.length)<.025);
    assert.ok(Math.sqrt(squares/wave.length)>.03);
    assert.ok(Math.abs(wave.at(-1)-wave[0])<1e-6);
  }
});

test('short noise buffers contain no NaNs and stereo seeds differ',()=>{
  for(const size of [0,1,10,19,20,100])assert.ok(makeAirNoise(size).every(Number.isFinite));
  assert.deepEqual(makeAirNoise(100,173),makeAirNoise(100,173));
  assert.notDeepEqual(makeAirNoise(100,173),makeAirNoise(100,817));
});

test('scene transitions blend sound levels continuously and follow day/night',()=>{
  const cloud=soundMix([1,0,0]),river=soundMix([0,1,0]),middle=soundMix([.5,.5,0]);
  assert.ok(cloud.wind>river.wind&&river.water>cloud.water);
  for(const key of Object.keys(cloud))assert.ok(Math.abs(middle[key]-(cloud[key]+river[key])/2)<1e-12);
  const night=soundMix([0,0,1],0),day=soundMix([0,0,1],1);
  assert.ok(night.insects>day.insects&&day.birds>night.birds);
  assert.equal(day.insects,0);
});

test('the space view has no terrestrial water, insects or bird calls',()=>{
  const orbit=soundMix([0,0,1],0,true);
  assert.equal(orbit.water,0);assert.equal(orbit.insects,0);assert.equal(orbit.birds,0);
});
