import {eclipseGeometry,haloDirections,showerTrack} from './celestial-events.mjs';
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const hash=(n,seed)=>{const r=Math.sin(n*127.1+seed*311.7)*43758.5453;return r-Math.floor(r);};
export const PHENOMENON_NAMES=Object.freeze({meteor:'流星',fireball:'火流星',shower:'流星群',comet:'双尾彗星',halo:'22° 月晕',alignment:'五星连珠','solar-eclipse':'日全食','lunar-eclipse':'月全食'});
const DURATIONS={meteor:3,fireball:8,shower:18,comet:32,halo:26,alignment:32,'solar-eclipse':38,'lunar-eclipse':38};
export function eventForSlot(slot,seed=1){
  const chance=hash(slot+7,seed);
  const kind=chance<.012?'comet':chance<.035?'shower':chance<.065?'fireball':chance<.09?'halo':chance<.38?'meteor':null;
  return kind?{kind,start:slot*20+2+hash(slot+11,seed)*5,duration:DURATIONS[kind],x:.17+hash(slot+13,seed)*.25,y:.10+hash(slot+17,seed)*.1,angle:.25+hash(slot+19,seed)*.35}:null;
}
export function moonConjunction(world){
  if(world.sun.altitude> -5||world.moon.altitude<5)return null;
  const near=world.bodies.filter(p=>p.planet&&p.altitude>5).map(p=>({name:p.name,angle:Math.acos(clamp(p.vector.reduce((s,v,i)=>s+v*world.moon.vector[i],0),-1,1))*180/Math.PI})).sort((a,b)=>a.angle-b.angle)[0];
  return near?.angle<3?`${near.name}伴月 · 相距 ${near.angle.toFixed(1)}°`:null;
}
function glow(ctx,x,y,r,color,alpha=1){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(.12,`rgba(${color},${alpha*.75})`);g.addColorStop(.4,`rgba(${color},${alpha*.12})`);g.addColorStop(1,`rgba(${color},0)`);
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
}
function trail(ctx,x,y,tx,ty,opacity,fire=false,size=1){
  const g=ctx.createLinearGradient(tx,ty,x,y);g.addColorStop(0,'rgba(128,174,225,0)');g.addColorStop(.55,`rgba(${fire?'234,145,79':'135,195,241'},${opacity*.45})`);g.addColorStop(.9,`rgba(199,235,242,${opacity*.8})`);g.addColorStop(1,`rgba(255,249,232,${opacity})`);
  ctx.lineCap='round';ctx.strokeStyle=g;ctx.lineWidth=size*(fire?7:2.4);ctx.globalAlpha=.22;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(x,y);ctx.stroke();
  ctx.globalAlpha=1;ctx.lineWidth=size*(fire?2.5:.95);ctx.stroke();glow(ctx,x,y,size*(fire?34:8),fire?'255,224,169':'213,239,255',opacity);
}
function drawMeteor(ctx,e,p,w,h){
  const fire=e.kind==='fireball',flight=fire?.48:.92,t=clamp(p/flight),length=Math.min(w*.62,h*.70),dx=Math.cos(e.angle),dy=Math.sin(e.angle);
  const sx=e.x*w,sy=e.y*h,travel=length*t,x=sx+dx*travel,y=sy+dy*travel;
  const fade=Math.pow(Math.sin(Math.PI*t),.55);
  if(p<flight){
    trail(ctx,x,y,x-dx*Math.min(travel,length*.4),y-dy*Math.min(travel,length*.4),fade,fire);
    if(fire&&t>.55){
      for(let i=0;i<6;i++){
        const lag=(.09+i*.075)*length*(t-.48),spread=Math.sin(i*2.7)*(t-.48)*length*.11;
        const fragmentLength=18+i*4;
        trail(ctx,x-dx*lag-dy*spread,y-dy*lag+dx*spread,x-dx*(lag+fragmentLength)-dy*spread,y-dy*(lag+fragmentLength)+dx*spread,fade*(.88-i*.08),true,.48-i*.025);
      }
      glow(ctx,x,y,Math.min(w,h)*.2,'230,203,165',fade*.08*Math.exp(-(((t-.76)/.10)**2)));
    }
  }
  if(fire&&p>.18){
    const alpha=clamp((1-p)/.65)*.18,age=Math.max(0,p-flight);
    ctx.strokeStyle=`rgba(166,200,190,${alpha})`;ctx.lineWidth=2+age*14;ctx.beginPath();
    for(let i=0;i<55;i++){const q=i/54*t,drift=Math.sin(q*17+age*3)*age*16;const xx=sx+dx*length*q-dy*drift,yy=sy+dy*length*q+dx*drift+age*11;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.stroke();
  }
}
function drawShower(ctx,p,w,h){
  const radiant={x:w*.48,y:h*.19},extent=Math.min(w,h)*.78,seconds=p*18;
  for(let i=0;i<72;i++){
    const track=showerTrack(i),t=(seconds-track.start)/track.duration;
    if(t<0||t>1)continue;
    const distance=extent*(track.from+t*.8),tail=Math.min(distance,extent*(.10+.07*Math.sin(i)));
    trail(ctx,radiant.x+track.dx*distance,radiant.y+track.dy*distance,radiant.x+track.dx*(distance-tail),radiant.y+track.dy*(distance-tail),Math.sin(Math.PI*t)**.6,false,i%9===0?1.5:1);
  }
  ctx.globalAlpha=Math.sin(Math.PI*p)*.5;ctx.strokeStyle='#bed9e7';ctx.lineWidth=.65;ctx.setLineDash([2,5]);ctx.beginPath();ctx.arc(radiant.x,radiant.y,11,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.font='11px sans-serif';ctx.fillStyle='#d2e3ee';ctx.fillText('辐射点',radiant.x+17,radiant.y+4);ctx.globalAlpha=1;
}
let cometTexture=null;
function cometTail(){
  if(cometTexture)return cometTexture;
  const c=document.createElement('canvas');c.width=640;c.height=384;const cx=c.getContext('2d'),im=cx.createImageData(c.width,c.height);
  for(let py=0;py<c.height;py++)for(let px=0;px<c.width;px++){
    const x=px/c.width*1.38-.08,y=py/c.height*.83-.18;if(x<0)continue;
    const taper=Math.max(0,1-x/1.3)**1.7;
    const width=.006+.043*x,curve=.25*x*x;
    const dust=Math.exp(-.5*((y-curve)/width)**2)*Math.exp(-1.7*x)*taper*.65;
    const rays=.9+.1*Math.sin((y-curve)/width*13+x*11);
    const ion=Math.exp(-.5*((y+.026*x)/(.003+.006*x))**2)*Math.exp(-1.4*x)*taper*.75;
    const total=dust*rays+ion;if(total<.002)continue;
    const i=(py*c.width+px)*4;
    for(let k=0;k<3;k++)im.data[i+k]=([235,227,192][k]*dust*rays+[107,185,255][k]*ion)/total;
    im.data[i+3]=255*Math.min(.95,total);
  }
  cx.putImageData(im,0,0);cometTexture=c;return c;
}
function drawComet(ctx,e,p,w,h,sun){
  const x=w*(.38+p*.024),y=h*(.29+p*.006),length=Math.min(w*.48,h*.5),fade=Math.min(1,p*7,(1-p)*7);
  // Both tails point away from the illuminating Sun; the dust tail curves outward.
  const angle=sun?.zz>.12?Math.atan2(y-sun.y,x-sun.x):-.48;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=fade;
  ctx.drawImage(cometTail(),-length*.08,-length*.18,length*1.38,length*.83);
  glow(ctx,0,0,29,'131,228,203',.7);glow(ctx,0,0,12,'210,251,238',.9);ctx.fillStyle='#effff4';ctx.beginPath();ctx.arc(0,0,2.3,0,TAU);ctx.fill();ctx.restore();
}
function drawHalo(ctx,world,project,fade,w,h){
  const stroke=(degrees,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();let joined=false;for(const v of haloDirections(world.moon.vector,degrees)){const q=project(v);if(q.zz<.12||Math.abs(q.x)>w*3||Math.abs(q.y)>h*3){joined=false;continue;}if(joined)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);joined=true;}ctx.stroke();};
  ctx.globalAlpha=fade;stroke(22.35,'rgba(194,211,233,.035)',26);stroke(22.2,'rgba(185,212,242,.09)',13);stroke(22.05,'rgba(225,226,211,.20)',4);stroke(21.85,'rgba(238,181,149,.27)',1.8);stroke(22.45,'rgba(164,195,241,.12)',4);
}
function drawAlignment(ctx,world,project,w,h,fade){
  const planets=world.bodies.filter(b=>b.planet).map(b=>({...b,...project(b.vector)})).filter(b=>b.zz>.12&&b.x>5&&b.x<w-5&&b.y>5&&b.y<h*.75);
  ctx.globalAlpha=fade;ctx.strokeStyle='rgba(211,199,159,.32)';ctx.lineWidth=.7;ctx.setLineDash([3,8]);ctx.beginPath();planets.forEach((b,i)=>i?ctx.lineTo(b.x,b.y):ctx.moveTo(b.x,b.y));ctx.stroke();ctx.setLineDash([]);
  ctx.font=`${w<600?11:13}px sans-serif`;ctx.textAlign='center';
  for(const [i,b]of planets.entries()){
    glow(ctx,b.x,b.y,15,b.body==='Mars'?'255,164,118':'225,227,199',.55);ctx.strokeStyle='rgba(232,211,157,.6)';ctx.beginPath();ctx.arc(b.x,b.y,8,0,TAU);ctx.stroke();ctx.fillStyle='#e6dbc0';ctx.fillText(b.name,b.x,b.y+(i%2===0?26:-20));
  }
}
export function createSkyPhenomena({seed=Math.random()*1000}={}){
  let enabled=true,manual=null,lastLabel='';
  const status=typeof document==='undefined'?null:document.querySelector('#sky-event-status');
  try{enabled=localStorage.getItem('ziwei.sky.phenomena')!=='off';}catch{}
  function label(text){if(status&&text!==lastLabel){status.textContent=text;status.hidden=!text;lastLabel=text;}}
  function current(time){
    if(manual&&time>=manual.start+manual.duration)manual=null;
    if(!enabled)return null;
    const slot=Math.floor(time/20),e=manual||[0,1,2].map(d=>eventForSlot(slot-d,seed)).find(e=>e&&time>=e.start&&time<e.start+e.duration);
    if(!e)return null;
    const progress=clamp((time-e.start)/e.duration);
    return {...e,progress,...(e.kind.endsWith('-eclipse')?eclipseGeometry(e.kind,progress):{})};
  }
  return {
    get enabled(){return enabled;},current,
    holdsClock(time){current(time);return Boolean(enabled&&manual);},
    seek(time,progress){if(manual)manual.start=time-Math.min(.999,clamp(progress))*manual.duration;},
    cancel(){manual=null;label('');},
    setEnabled(value){enabled=Boolean(value);if(!enabled){manual=null;label('');}try{localStorage.setItem('ziwei.sky.phenomena',enabled?'on':'off');}catch{}},
    preview(kind,time){if(!Object.hasOwn(PHENOMENON_NAMES,kind))return false;manual={kind,start:time,duration:DURATIONS[kind],x:.20,y:.14,angle:.36,manual:true};return true;},
    draw(ctx,{time,width,height,world,moon,sun,project,atmosphere,reduced=false,skyOnly=true,effect}){
      if(!enabled||!skyOnly||reduced){label('');return;}
      const e=effect||current(time),darkness=atmosphere?clamp((-world.sun.altitude-2)/12):1;
      if(!e){label(moonConjunction(world)||'');return;}
      if(e.kind.endsWith('-eclipse')){label(`${PHENOMENON_NAMES[e.kind]} · ${e.stage} · 过程演示`);return;}
      if(darkness<.15){label('');return;}
      const p=e.progress,fade=Math.min(1,p*7,(1-p)*7);
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=darkness;
      if(e.kind==='halo'){
        if(!atmosphere||moon.zz<.12||world.moon.altitude<4||world.moon.phase<.45){ctx.restore();label('');return;}
        drawHalo(ctx,world,project,fade,width,height);
      }else if(e.kind==='comet')drawComet(ctx,e,p,width,height,sun);
      else if(e.kind==='shower')drawShower(ctx,p,width,height);
      else if(e.kind==='alignment')drawAlignment(ctx,world,project,width,height,fade);
      else drawMeteor(ctx,e,p,width,height);
      ctx.restore();
      label(e.kind==='alignment'?'五星连珠 · 历史天空 2022.06.25 · 黄道附近的视线排列':`${PHENOMENON_NAMES[e.kind]} · ${e.kind==='comet'?'尘尾与离子尾 · ':e.kind==='halo'?'冰晶折射 · ':e.kind==='fireball'?'碎裂与余迹 · ':''}场景演示`);
    },
  };
}
