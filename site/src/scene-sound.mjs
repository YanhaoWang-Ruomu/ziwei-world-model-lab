import {createAudioPlayback} from './audio-playback.mjs';
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const soundEnabledByPreference=value=>value!=='off';

export function soundMix(weights=[0,0,1],daylight=0,earth=false){
  const [cloud,river,sky]=weights.map(x=>clamp(Number(x)||0));
  if(earth)return {wind:.025,water:0,insects:0,birds:0,chime:.3};
  return {wind:cloud*.65+river*.30+sky*.19,water:cloud*.035+river*.64+sky*.26,
    insects:sky*(1-clamp(daylight))*.30,birds:cloud*.8+river*.35+sky*clamp(daylight)*.45,chime:.75};
}

export function makeAirNoise(length,seed=173){
  const values=new Float32Array(length);let low=0,mid=0;
  for(let i=0;i<length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const white=seed/2147483648-1;low=low*.993+white*.007;mid=mid*.89+white*.11;
    values[i]=clamp(low*2.4+mid*.62+white*.018,-1,1);
  }
  // Short equal-level edges make looping air seamless without a repeated swell.
  const overlap=Math.min(2048,Math.floor(length/10));
  const difference=values[length-1]-values[0];
  if(overlap>1)for(let i=0;i<overlap;i++){const t=i/(overlap-1);values[length-overlap+i]-=difference*t*t*(3-2*t);}
  return values;
}

export function initSceneSound(){
  const $=s=>document.querySelector(s),button=$('#scene-sound-toggle'),label=$('#scene-sound-label'),status=$('#scene-sound-status'),slider=$('#scene-sound-volume');
  const entry=$('#scene-audio-entry'),start=$('#scene-audio-start'),mute=$('#scene-audio-mute');
  const Audio=window.AudioContext||window.webkitAudioContext;
  let context=null,master=null,meter=null,buses=null,enabled=true,visible=true,volume=.40;
  let weights=[0,0,1],daylight=0,earth=false,mix=soundMix(),timer=null,lastFrame=-1,lastChapter=2,lastBell=-20;
  try{const saved=Number(localStorage.getItem('ziwei.scene.volume.v1'));if(localStorage.getItem('ziwei.scene.volume.v1')!==null&&Number.isFinite(saved))volume=clamp(saved);}catch{}
  try{enabled=soundEnabledByPreference(localStorage.getItem('ziwei.scene.enabled.v2'));}catch{}
  slider.value=String(Math.round(volume*100));
  const wantsAudio=()=>enabled&&visible&&!document.hidden;
  const ramp=(param,value,seconds=.6)=>{param.cancelScheduledValues(context.currentTime);param.setTargetAtTime(value,context.currentTime,seconds);};
  function paint(){
    const playing=enabled&&wantsAudio()&&context?.state==='running'&&volume>0;
    button.setAttribute('aria-pressed',String(playing));
    label.textContent=!Audio?'环境声不可用':playing?'关闭环境声':enabled&&volume===0?'调高环境音量':enabled?'轻触开启声音':'开启环境声';
    const scene=earth?'空灵回响':lastChapter===0?'山风 · 远鸣':lastChapter===1?'江流 · 山风':daylight>.35?'山风 · 水声 · 远鸣':'夜虫 · 水声 · 磬音';
    status.textContent=!Audio?'当前浏览器不支持环境声。':!enabled?'环境声已关闭；此偏好会保存在当前浏览器。':!visible||document.hidden?'离开观景时，环境声自动静音。':volume===0?'音量为 0，可调高音量。':playing?`声景：${scene}`:'正在等待浏览器允许播放；轻触“开启声音”即可聆听。';
    button.dataset.state=playing?'playing':'quiet';
    if(entry)entry.hidden=!Audio||!wantsAudio()||volume===0||playing;
  }
  function noiseBus(buffer,type,frequency,q,level,rate=1){
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;source.loop=true;source.playbackRate.value=rate;
    filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;gain.gain.value=level;
    source.connect(filter);filter.connect(gain);gain.connect(master);source.start();return {gain:gain.gain,filter};
  }
  function create(){
    context=new Audio({latencyHint:'playback'});master=context.createGain();master.gain.value=0;
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=18;limiter.ratio.value=8;
    meter=context.createAnalyser();meter.fftSize=256;
    master.connect(limiter);limiter.connect(meter);meter.connect(context.destination);
    const buffer=context.createBuffer(2,context.sampleRate*8,context.sampleRate);
    buffer.copyToChannel(makeAirNoise(buffer.length,173),0);buffer.copyToChannel(makeAirNoise(buffer.length,817),1);
    buses={wind:noiseBus(buffer,'lowpass',740,.6,0),water:noiseBus(buffer,'bandpass',1380,.55,0,.83),insects:noiseBus(buffer,'bandpass',4300,9,0,1.17)};
    const breeze=context.createOscillator(),breezeAmount=context.createGain();breeze.frequency.value=.08;breezeAmount.gain.value=220;
    breeze.connect(breezeAmount);breezeAmount.connect(buses.wind.filter.frequency);breeze.start();
    lastBell=-20;return context;
  }
  function tone(frequency,start,length,level,pan=0){
    const osc=context.createOscillator(),gain=context.createGain(),panner=context.createStereoPanner?context.createStereoPanner():context.createGain();
    osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+.035);
    gain.gain.exponentialRampToValueAtTime(.00001,start+length);if(panner.pan)panner.pan.value=clamp(pan,-1,1);
    osc.connect(gain);gain.connect(panner);panner.connect(master);osc.start(start);osc.stop(start+length+.1);
    osc.addEventListener('ended',()=>{osc.disconnect();gain.disconnect();panner.disconnect();});return osc;
  }
  function bell(){
    if(!wantsAudio()||context?.state!=='running'||context.currentTime-lastBell<2.5)return;
    const t=context.currentTime;lastBell=t;const root=[196,220,261.63][lastChapter];
    [1,2.76,5.4].forEach((ratio,i)=>tone(root*ratio,t,4.8-i,.08*mix.chime/(i+1),i%2?.3:-.3));
  }
  function tick(){
    if(!wantsAudio()||context?.state!=='running')return;
    const t=context.currentTime;
    ramp(buses.wind.gain,mix.wind*(.33+.045*Math.sin(t*.31)));
    ramp(buses.water.gain,mix.water*(.55+.08*Math.sin(t*.72)),.9);
    ramp(buses.insects.gain,mix.insects*(.05+.16*Math.pow(.5+.5*Math.sin(t*1.6),4)),.15);
    if(mix.birds>.08&&Math.random()<mix.birds*.08){
      const start=t+.03,frequency=2450+Math.random()*900;
      for(let i=0;i<2;i++){
        const osc=tone(frequency,start+i*.22,.18,.035*mix.birds,Math.sin(t*.2)*.7);
        osc.frequency.exponentialRampToValueAtTime(frequency*1.31,start+i*.22+.08);
        osc.frequency.exponentialRampToValueAtTime(frequency*.96,start+i*.22+.18);
      }
    }
    if(t-lastBell>35&&Math.random()<.025)bell();
    meter.getFloatTimeDomainData(waveform);
    const rms=Math.sqrt(waveform.reduce((s,x)=>s+x*x,0)/waveform.length);
    button.style.setProperty('--sound-level',String(clamp(rms*24)));
  }
  const playback=createAudioPlayback({create,wantsAudio,
    onRunning(){ramp(master.gain,volume*.72,.28);if(!timer)timer=setInterval(tick,650);tick();},
    onQuiet(){clearInterval(timer);timer=null;if(context?.state==='running')ramp(master.gain,0,.06);button.style.setProperty('--sound-level','0');},
    onState:paint,
  });
  function sync(){if(Audio)playback.request();else paint();}
  function enable(value){
    enabled=value;try{localStorage.setItem('ziwei.scene.enabled.v2',value?'on':'off');}catch{}
    if(value&&volume===0){volume=.4;slider.value='40';$('#scene-volume-value').textContent='40%';try{localStorage.setItem('ziwei.scene.volume.v1','.4');}catch{}}
    sync();
  }
  button.addEventListener('click',()=>enable(!(playback.state==='playing'&&volume>0)));
  start?.addEventListener('click',()=>enable(true));
  mute?.addEventListener('click',()=>enable(false));
  slider.addEventListener('input',()=>{
    volume=clamp(Number(slider.value)/100);try{localStorage.setItem('ziwei.scene.volume.v1',String(volume));}catch{}
    if(context)ramp(master.gain,wantsAudio()?volume*.72:0,.10);
    $('#scene-volume-value').textContent=`${Math.round(volume*100)}%`;
    sync();
  });
  $('#scene-volume-value').textContent=`${Math.round(volume*100)}%`;
  document.addEventListener('visibilitychange',sync);
  function activate(event){if(!event.isTrusted||event.target.closest?.('#scene-sound-toggle,#scene-audio-entry')||!wantsAudio()||!Audio||context?.state==='running')return;sync();}
  for(const type of ['click','pointerup','touchend','keydown'])document.addEventListener(type,activate,{passive:true});
  window.addEventListener('pagehide',event=>playback.leave(event.persisted));
  window.addEventListener('pageshow',()=>{if(Audio)playback.enter();});
  const waveform=new Float32Array(256);
  function blend(sceneWeights){
    weights=sceneWeights;mix=soundMix(weights,daylight,earth);
    const chapter=weights.indexOf(Math.max(...weights));
    if(chapter!==lastChapter){lastChapter=chapter;paint();bell();}
  }
  sync();
  return {
    blend,
    frame(frame,sceneWeights){
      const nextEarth=frame.landscape==='earth',changed=earth!==nextEarth||(daylight>.35)!==(frame.world.daylight>.35);
      daylight=frame.world.daylight;earth=nextEarth;blend(sceneWeights);
      if(changed)paint();
      if(context&&meter&&wantsAudio()&&frame.time-lastFrame>.12){
        lastFrame=frame.time;meter.getFloatTimeDomainData(waveform);
        const rms=Math.sqrt(waveform.reduce((s,x)=>s+x*x,0)/waveform.length);
        button.style.setProperty('--sound-level',String(clamp(rms*24)));
      }
    },
    visible(value){if(visible!==value){visible=value;sync();}},
    star(){bell();},
  };
}
