import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioPlayback} from '../src/audio-playback.mjs';

class AudioMock extends EventTarget{
  state='suspended';resumes=0;allowed=false;closed=false;pending=[];
  resume(){this.resumes++;if(this.allowed){this.state='running';this.dispatchEvent(new Event('statechange'));this.pending.splice(0).forEach(resolve=>resolve());return Promise.resolve();}return new Promise(resolve=>this.pending.push(resolve));}
  suspend(){this.state='suspended';this.dispatchEvent(new Event('statechange'));return Promise.resolve();}
  close(){this.state='closed';this.closed=true;return Promise.resolve();}
}
test('first entry attempts autoplay without any previous user activation',()=>{
  let count=0;const audio=new AudioMock();audio.allowed=true;
  const p=createAudioPlayback({create:()=>audio,wantsAudio:()=>true,onRunning:()=>count++});
  p.request();assert.equal(audio.resumes,1);assert.equal(p.state,'playing');assert.ok(count>0);p.leave();
});
test('blocked autoplay remains waiting; a later gesture resumes the same context',async()=>{
  const audio=new AudioMock();let creates=0,running=0;
  const p=createAudioPlayback({create:()=>{creates++;return audio;},wantsAudio:()=>true,onRunning:()=>running++});
  p.request();assert.equal(p.state,'waiting');assert.equal(running,0);
  audio.allowed=true;p.request();await Promise.resolve();assert.equal(p.state,'playing');assert.equal(creates,1);assert.equal(audio.resumes,2);p.leave();
});
test('muted preference avoids allocating audio; late resume never enables a muted scene',async()=>{
  let enabled=false,creates=0,running=0;const audio=new AudioMock();
  const p=createAudioPlayback({create:()=>{creates++;return audio;},wantsAudio:()=>enabled,onRunning:()=>running++,delay:0});
  p.request();assert.equal(creates,0);enabled=true;p.request();enabled=false;p.request();
  audio.allowed=true;await audio.resume();await Promise.resolve();assert.equal(p.state,'quiet');assert.equal(running,0);p.leave();
});
test('back-forward cache restores the existing context; closed pages recreate safely',()=>{
  const contexts=[];const p=createAudioPlayback({create:()=>{const a=new AudioMock();a.allowed=true;contexts.push(a);return a;},wantsAudio:()=>true});
  p.request();p.leave(true);assert.equal(contexts[0].state,'suspended');p.enter();assert.equal(p.state,'playing');assert.equal(contexts.length,1);
  p.leave(false);assert.equal(contexts[0].closed,true);p.enter();assert.equal(p.state,'playing');assert.equal(contexts.length,2);p.leave();
});
test('interrupted contexts are resumed, and creation errors remain retryable',()=>{
  let attempts=0;const audio=new AudioMock();audio.allowed=true;
  const p=createAudioPlayback({create:()=>{if(++attempts===1)throw Error('Unavailable');return audio;},wantsAudio:()=>true});
  p.request();assert.equal(p.state,'retry');p.request();assert.equal(p.state,'playing');audio.state='interrupted';p.request();assert.equal(p.state,'playing');p.leave();
});
