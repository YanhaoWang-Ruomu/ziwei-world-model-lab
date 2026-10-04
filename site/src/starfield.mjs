import {NAMED_STARS,NORTH_LINES,SOUTH_LINES,starLabel} from './star-profiles.mjs';
import {earthGeometry,viewVector} from './scene-geometry.mjs';
import {interpolateCamera,tourProgress} from './sky-preferences.mjs';
import {createCelestialPainter,stellarAppearance} from './celestial-light.mjs';
import {earthTourPlan,earthTourDate,earthTourCamera} from './earth-tour.mjs';
import {createSkyPhenomena} from './sky-phenomena.mjs';
import {eclipseWorld,ALIGNMENT_DATE,fitAlignmentCamera} from './celestial-events.mjs';
const rad=Math.PI/180;
export function unitVector(raHours,decDegrees){const a=raHours*15*rad,d=decDegrees*rad;return [Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d)];}
export function distanceRadius(pc){return pc===null?null:1+Math.log1p(pc)/Math.log(100);}

export function initStarfield(canvas,{world,terrain,presence,onStar,onReady,onError,onInteract=()=>{},onOrient=()=>{},onFrame=()=>{},normalize=value=>String(value).toLowerCase()}){
  const ctx=canvas.getContext('2d'),scene=canvas.parentElement;
  if(!ctx){queueMicrotask(()=>onError('此浏览器未能开启星空画布，仍可正常排盘。'));return {focus(){},setMode(){},pause(){},visible(){},zoom(){},sky(){},search(){return [];}};}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),named=new Map(NAMED_STARS.map(s=>[s.hip,s]));
  let rows=[],points=[],width=1,height=1,yaw=12.6*15*rad,pitch=55*rad,scale=.83,depth=false,offset=0,group='北斗',active=null;
  let running=!reduced.matches,visible=true,dirty=true,drag=null,frame=0,last=0,hover=null,skyOnly=false;
  let landscape='mountains',guides=false,clock=0,tour=null,settle=null,hovering=false,earthFollow=true,chartRunning=true;
  let snapshot=world.snapshot(),bodies=snapshot.bodies,presenceState=presence.tick(0);
  const localVector=v=>viewVector(v,snapshot,{skyOnly,depth});
  const celestial=createCelestialPainter({onReady(ok){canvas.dataset.moonSurface=ok?'lro':'fallback';dirty=true;schedule();}});
  const phenomena=createSkyPhenomena();
  let alignmentCenter=[.5,.4];
  const glowCache=new Map();
  function glow(color){
    if(glowCache.has(color))return glowCache.get(color);
    const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),fill=g.createRadialGradient(32,32,0,32,32,32);
    fill.addColorStop(0,color+'d0');fill.addColorStop(.12,color+'90');fill.addColorStop(.35,color+'22');fill.addColorStop(1,color+'00');g.fillStyle=fill;g.fillRect(0,0,64,64);glowCache.set(color,c);return c;
  }
  function resize(){
    const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const d=Math.min(devicePixelRatio||1,skyOnly?2:1.25);
    canvas.width=Math.max(1,width*d);canvas.height=Math.max(1,height*d);ctx.setTransform(d,0,0,d,0,0);
    if(width>0&&height>0&&skyOnly){
      const effect=phenomena.current(clock*.001);
      if(effect?.manual&&effect.kind==='alignment'){
        const fitted=fitAlignmentCamera(bodies.filter(b=>b.planet).map(b=>localVector(b.vector)),width,height);alignmentCenter=fitted.center;move(fitted);
      }else if(effect?.manual&&effect.kind==='halo')scale=Math.min(.75,width/(Math.max(width,height)*.7*1.1));
    }
    dirty=true;schedule();
  }
  new ResizeObserver(resize).observe(canvas);
  function draw(){
    const effect=skyOnly&&!depth&&!reduced.matches?phenomena.current(clock*.001):null;
    // The silk valley rises higher than the former riverside scene. Focus bodies
    // in the open sky so selecting the Sun or Moon does not hide it behind a ridge.
    const skyCenter=effect?.kind==='alignment'?alignmentCenter:[.5,skyOnly&&landscape==='mountains'?.30:.4];
    snapshot=eclipseWorld(world.snapshot(),effect);bodies=snapshot.bodies;
    ctx.clearRect(0,0,width,height);points=[];ctx.save();
    const near=skyOnly&&landscape==='mountains'?presenceState:{x:0,y:0,travel:0,pulse:null};terrain.view(near);
    const viewYaw=yaw+near.x*.008+(skyOnly?0:clock*.000008),viewPitch=pitch-near.y*.004;
    const sy=Math.sin(viewYaw),cy=Math.cos(viewYaw),sp=Math.sin(viewPitch),cp=Math.cos(viewPitch),f=Math.max(width,height)*.7*scale;
    const projected=new Map(),earthShown=skyOnly&&landscape==='earth',globe=earthGeometry(width,height);
    const project=(v,tangent=false,r=1)=>{
      const [vx,vy,vz]=localVector(v),xx=(-sy*vx+cy*vy)*r-(depth&&!tangent?offset:0),yy=(-sp*cy*vx-sp*sy*vy+cp*vz)*r,zz=(cp*cy*vx+cp*sy*vy+sp*vz)*r;
      return {x:width*skyCenter[0]+xx/zz*f,y:height*skyCenter[1]-yy/zz*f,xx,yy,zz};
    };
    const solarScreen=project(bodies[0].vector);
    let sunGlow=0;
    for(const star of [...rows,...(depth?[]:bodies)]){
      if(effect?.kind==='solar-eclipse'&&star.body==='Moon')continue;
      if(!skyOnly&&(star.body||star.mag>5.8))continue;
      if(depth&&star.distance===null)continue;
      if(skyOnly&&landscape==='mountains'&&!depth&&localVector(star.vector)[2]<(star.body?-.08:0))continue;
      const p=project(star.vector,false,depth?distanceRadius(star.distance):1),{x,y}=p;
      const margin=star.body?480:80;
      if(p.zz<.12||x<-margin||x>width+margin||y<-margin||y>height+margin)continue;
      const behindEarth=earthShown&&Math.hypot(x-globe.x,y-globe.y)<globe.radius;
      if(behindEarth&&!star.body)continue;
      const behindTerrain=skyOnly&&landscape==='mountains'&&terrain.covers(x,y,width,height);
      if(behindTerrain&&!star.body)continue;
      let radius;
      if(star.body){radius=celestial.draw(ctx,star,p,{width,height,scale,world:snapshot,project,time:clock*.001,atmosphere:skyOnly&&landscape==='mountains',effect});if(star.body==='Sun')sunGlow=Math.max(0,1-Math.abs(x-width/2)/width)*.35*(snapshot.solarTransmission??1);}
      else{
        const {radius:size,alpha,pulse}=stellarAppearance(star.mag,star.phaseSeed,clock*.001,{atmosphere:!earthShown,reduced:reduced.matches,altitude:localVector(star.vector)[2]});
        const glare=solarScreen.zz>.12&&!depth?Math.exp(-((x-solarScreen.x)**2+(y-solarScreen.y)**2)/(Math.min(width,height)*.16)**2)*(snapshot.solarTransmission??1):0;
        // Atmospheric extinction approaches the astronomical horizon continuously,
        // instead of cutting an equally bright star field off along a straight line.
        const horizonLight=Math.min(1,Math.max(0,localVector(star.vector)[2]/.18));
        const skyVisibility=(skyOnly&&landscape==='mountains'?Math.pow(1-snapshot.daylight,3)*terrain.skyVisibility(x,y,width,height)*horizonLight*(2-horizonLight):1)*(1-glare*.86);
        if(skyVisibility<.005)continue;
        ctx.globalAlpha=alpha*(skyOnly?1:.68)*skyVisibility;ctx.fillStyle=star.color;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
        if(star.mag<3.5){radius=(12-star.mag*1.65)*pulse;ctx.globalAlpha=alpha*.74*skyVisibility;ctx.drawImage(glow(star.color),x-radius,y-radius,radius*2,radius*2);ctx.globalAlpha=alpha*skyVisibility;ctx.fillStyle='#eff5ff';ctx.beginPath();ctx.arc(x,y,size*.44,0,Math.PI*2);ctx.fill();}
        if(star.mag<1.4){const ray=6.5-star.mag*1.3;ctx.globalAlpha=alpha*.18*skyVisibility;ctx.strokeStyle=star.color;ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(x-ray,y);ctx.lineTo(x+ray,y);ctx.moveTo(x,y-ray);ctx.lineTo(x,y+ray);ctx.stroke();}
      }
      const item={...star,x,y,radius:star.body?radius:undefined};if(!behindTerrain&&!behindEarth)points.push(item);if(star.named&&!behindTerrain&&!behindEarth)projected.set(star.id,item);
    }
    scene.style.setProperty('--day-glow',String(sunGlow));ctx.globalAlpha=1;
    if(guides&&!tour&&!effect?.manual){
      const lines=group==='南斗'?SOUTH_LINES:group==='北斗'?NORTH_LINES:[];ctx.strokeStyle='#a9bed349';ctx.lineWidth=.8;
      for(const [a,b] of lines){const x=projected.get(a),y=projected.get(b);if(x&&y){ctx.beginPath();ctx.moveTo(x.x,x.y);ctx.lineTo(y.x,y.y);ctx.stroke();}}
      // Compact cultural names on the sky; full astronomical names remain in each card.
      const occupied=points.filter(s=>s.body).map(s=>({x:s.x-s.radius-5,y:s.y-s.radius-5,w:s.radius*2+10,h:s.radius*2+10}));
      ctx.font='13px "Microsoft YaHei",sans-serif';
      for(const star of projected.values()){
        if(!skyOnly||(star.named.group!==group&&star.id!==active))continue;
        const text=star.named.group==='南斗'?star.named.symbol:star.named.name,tw=ctx.measureText(text).width;
        const candidates=[[12,-8],[-tw-12,-8],[12,23],[-tw-12,23],[12,-30],[-tw-12,-30]];
        const boxes=candidates.map(([dx,dy])=>({x:star.x+dx,y:star.y+dy-14,w:tw+5,h:19}));
        const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
        const box=boxes.find(b=>b.x>5&&b.x+b.w<width-5&&b.y>5&&b.y+b.h<height-5&&!occupied.some(p=>intersects(b,p)))||boxes[0];
        occupied.push(box);ctx.fillStyle=star.id===active?'#f6d994':'#c6d1df';ctx.fillText(text,box.x,box.y+14);
      }
    }
    if((hover||active)&&!tour){const p=points.find(p=>p.id===(hover||active));if(p){ctx.strokeStyle='#e5d1a678';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(p.x,p.y,(p.radius||5)+7,0,Math.PI*2);ctx.stroke();}}
    phenomena.draw(ctx,{time:clock*.001,width,height,world:snapshot,moon:project(bodies[1].vector),sun:solarScreen,project,effect,atmosphere:landscape==='mountains',reduced:reduced.matches,skyOnly:skyOnly&&!depth});
    ctx.restore();if(skyOnly&&landscape==='mountains')terrain.eraseFrom(ctx,width,height);
    if(earthShown){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(globe.x,globe.y,globe.radius,0,Math.PI*2);ctx.fill();ctx.restore();}
    onOrient(viewYaw);onFrame({world:snapshot,phenomenon:effect,skyCenter,time:clock*.001,yaw:viewYaw,pitch:viewPitch,scale,depth,presence:near,landscape,skyOnly,sun:project(bodies[0].vector),moon:project(bodies[1].vector)});dirty=false;
  }
  function camera(){return {yaw,pitch,scale};}
  function cameraFor(target,zoom=.83){
    const wholeGroup=['北斗','南斗','北极'].includes(target),n=NAMED_STARS.find(s=>s.hip===target||s.symbol===target||s.name===target);
    const star=[...rows,...bodies].find(s=>s.id===(n?.hip??target));
    if(wholeGroup){const sum=[0,0,0];for(const s of rows.filter(s=>s.named?.group===target))for(let i=0;i<3;i++)sum[i]+=s.vector[i];const v=localVector(sum);return {yaw:Math.atan2(v[1],v[0]),pitch:Math.atan2(v[2],Math.hypot(v[0],v[1])),scale:zoom};}
    const v=star&&localVector(star.vector);return star?{yaw:Math.atan2(v[1],v[0]),pitch:Math.atan2(v[2],Math.hypot(v[0],v[1])),scale:zoom}:null;
  }
  function move(c){yaw=c.yaw;pitch=c.pitch;scale=c.scale;}
  function loop(t){
    frame=0;if(!visible||document.hidden){last=0;return;}
    if(!last)last=t;
    if(t-last>=(skyOnly?33:66)){
      const dt=Math.min(100,t-last);last=t;
      const wasMoving=presence.moving;presenceState=presence.tick(dt,{reduced:reduced.matches});if(wasMoving||presence.moving)dirty=true;
      const moving=skyOnly?running:chartRunning&&!reduced.matches;
      if(moving){if(!reduced.matches)clock+=dt;if(skyOnly&&!tour?.earthPlan&&!phenomena.holdsClock(clock*.001)){snapshot=world.tick(tour?.narrative?dt*.08:dt);bodies=snapshot.bodies;}}
      if(tour){
        tour.elapsed+=dt;const p=tourProgress(tour.elapsed,tour.duration);
        if(landscape==='mountains'){
          const riverOfStars=localVector(unitVector(18,-20));
          const nightTarget=riverOfStars[2]>-.05?{azimuth:Math.atan2(riverOfStars[1],riverOfStars[0])/rad}:snapshot.moon.altitude>-5?snapshot.moon:null;
          const target=snapshot.sun.altitude>-16?snapshot.sun:nightTarget;
          if(target){const a=target.azimuth*rad;yaw+=Math.atan2(Math.sin(a-yaw),Math.cos(a-yaw))*.035;}
          pitch=Math.atan(height*.23/(Math.max(width,height)*.7*scale));
        }else{
          snapshot=world.seek(earthTourDate(tour.earthPlan,p));bodies=snapshot.bodies;
          const globe=earthGeometry(width,height),horizonPitch=Math.atan((globe.y-globe.radius-height*.4)/(Math.max(width,height)*.7*scale));
          const target=earthTourCamera(snapshot,{horizonPitch,progress:p,moonStartAltitude:tour.moonStartAltitude});yaw=target.yaw;pitch=target.pitch;
        }
        tour.onProgress(p);dirty=true;
        if(p===1){const end=tour.onComplete;tour=null;end();}
      }else if(settle){settle.elapsed+=dt;const p=Math.min(1,settle.elapsed/1100);move(interpolateCamera(settle.from,settle.to,p));if(p===1)settle=null;dirty=true;}
      else if(running&&skyOnly&&!drag&&!hovering&&landscape==='earth'&&earthFollow&&!depth&&!phenomena.holdsClock(clock*.001)){
        const globe=earthGeometry(width,height),horizonPitch=Math.atan((globe.y-globe.radius-height*.4)/(Math.max(width,height)*.7*scale));
        const target=earthTourCamera(snapshot,{horizonPitch}),blend=1-Math.exp(-dt/1600);
        yaw+=Math.atan2(Math.sin(target.yaw-yaw),Math.cos(target.yaw-yaw))*blend;pitch+=(target.pitch-pitch)*blend;
      }
      if(moving)dirty=true;
      if(dirty)draw();
    }
    if((skyOnly?running:chartRunning&&!reduced.matches)||dirty||tour||settle||presence.moving)schedule();
  }
  function schedule(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(loop);}
  function interact(){tour=null;settle=null;earthFollow=false;onInteract();}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;interact();hover=null;onStar(null,false);drag={x:e.clientX,y:e.clientY,moved:false,total:0};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{
    const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    if(!reduced.matches&&skyOnly&&landscape==='mountains'){presence.point(x/width*2-1,y/height*2-1);dirty=true;schedule();}
    if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.total+=Math.abs(dx)+Math.abs(dy);if(drag.total>4)drag.moved=true;yaw-=dx*.002/scale;pitch=Math.max(-1.52,Math.min(1.52,pitch+dy*.002/scale));if(depth)offset=Math.max(-1.1,Math.min(1.1,offset+dx*.002));drag.x=e.clientX;drag.y=e.clientY;dirty=true;schedule();return;}
    let nearest=null,dist=15;for(const p of points){const d=Math.hypot(p.x-x,p.y-y)-(p.radius||0);if(d<dist){nearest=p;dist=d;}}
    if(nearest?.id!==hover){hover=nearest?.id??null;hovering=Boolean(nearest);onStar(nearest,false);dirty=true;schedule();}
    canvas.style.cursor=nearest?'pointer':'grab';
  });
  function release(){drag=null;canvas.classList.remove('dragging');}
  canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const rect=canvas.getBoundingClientRect();const p=points.filter(p=>Math.hypot(p.x-e.clientX+rect.left,p.y-e.clientY+rect.top)<Math.max(18,(p.radius||0)+5)).sort((a,b)=>a.mag-b.mag)[0];if(p){active=p.id;presence.ripple(p.x/width,p.y/height,true);onStar(p,true);dirty=true;schedule();}else if(landscape==='mountains'&&(e.clientY-rect.top)/height>.78){presence.ripple((e.clientX-rect.left)/width,(e.clientY-rect.top)/height);dirty=true;schedule();}}release();});
  canvas.addEventListener('pointerleave',()=>{presence.point(0,0);hover=null;hovering=false;onStar(null,false);dirty=true;schedule();});
  canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();interact();yaw+=(e.key==='ArrowLeft'?-.08:e.key==='ArrowRight'?.08:0);pitch=Math.max(-1.52,Math.min(1.52,pitch+(e.key==='ArrowUp'?.08:e.key==='ArrowDown'?-.08:0)));dirty=true;schedule();}});
  canvas.addEventListener('wheel',e=>{if(!skyOnly)return;e.preventDefault();interact();if(landscape==='mountains'&&!depth){presence.dolly(e.deltaY>0?.12:-.12);}else scale=Math.max(.45,Math.min(5,scale*(e.deltaY>0?.91:1.09)));dirty=true;schedule();},{passive:false});
  document.addEventListener('visibilitychange',()=>{last=0;schedule();});reduced.addEventListener('change',()=>{if(reduced.matches){running=false;tour=null;settle=null;}dirty=true;schedule();});
  const api={
    focus(target,{notify=true}={}){
      const c=cameraFor(target);if(!c)return false;interact();group=['北斗','南斗','北极'].includes(target)?target:'';
      const n=NAMED_STARS.find(s=>s.hip===target||s.symbol===target||s.name===target),star=[...rows,...bodies].find(s=>s.id===(n?.hip??target))||rows.find(s=>s.named?.group===target);
      if(star?.body)depth=false;
      active=star?.id??null;group=star?.named?.group||group;offset=0;
      if(reduced.matches||!skyOnly||!notify)move(c);else settle={from:camera(),to:c,elapsed:0};
      dirty=true;schedule();if(notify&&star){presence.ripple(.5,skyOnly&&landscape==='mountains'?.30:.4,true);onStar(star,true);}return true;
    },
    startTour({duration,narrative=false,onProgress,onComplete}){
      if(reduced.matches){onComplete();return;}depth=false;active=null;hover=null;hovering=false;
      snapshot=world.restart();bodies=snapshot.bodies;scale=.83;earthFollow=true;
      if(narrative){snapshot=world.hour(20.5);bodies=snapshot.bodies;}
      const earthPlan=narrative?null:earthTourPlan(snapshot.date);
      if(earthPlan){snapshot=world.seek(earthPlan.start);bodies=snapshot.bodies;}
      yaw=(snapshot.moon.altitude>-5?snapshot.moon.azimuth:270)*rad;
      pitch=Math.atan(height*.23/(Math.max(width,height)*.7*scale));
      tour={elapsed:0,duration,narrative,earthPlan,moonStartAltitude:snapshot.moon.altitude,onProgress,onComplete};dirty=true;schedule();
    },
    stopTour(){tour=null;},speed(value){world.speed(value);},guides(value){guides=value;dirty=true;schedule();},
    landscape(value){if(landscape!==value){landscape=value;earthFollow=true;yaw=value==='mountains'?Math.PI:(snapshot.sun.altitude>-13?snapshot.sun:snapshot.moon).azimuth*rad;pitch=value==='mountains'?.24:.4;}dirty=true;schedule();},clearSelection(){active=null;dirty=true;schedule();},
    travel(value){presence.travel(value);dirty=true;schedule();},
    refresh(){phenomena.cancel();snapshot=world.snapshot();bodies=snapshot.bodies;dirty=true;schedule();},
    phenomena(value){phenomena.setEnabled(value);dirty=true;schedule();},
    get phenomenaEnabled(){return phenomena.enabled;},
    seekPhenomenon(value){phenomena.seek(clock*.001,value);dirty=true;schedule();},
    previewPhenomenon(kind){
      interact();active=null;hover=null;depth=false;
      if(kind==='alignment')world.seek(new Date(ALIGNMENT_DATE));
      else if(kind==='halo'||kind==='lunar-eclipse'){world.phase(180);world.hour(0);}
      else if(kind==='solar-eclipse'){world.phase(0);world.hour(12);}
      else world.hour(23);
      snapshot=world.snapshot();bodies=snapshot.bodies;
      if(kind==='halo'||kind.endsWith('-eclipse')){
        const zoom=kind==='halo'?Math.min(.75,width/(Math.max(width,height)*.7*1.1)):.83;
        const c=cameraFor(kind==='solar-eclipse'?'Sun':'Moon',zoom);if(c)move(c);
      }else if(kind==='alignment'){
        const fitted=fitAlignmentCamera(bodies.filter(b=>b.planet).map(b=>localVector(b.vector)),width,height);alignmentCenter=fitted.center;move(fitted);
      }else{yaw=snapshot.moon.azimuth*rad+1.1;pitch=.48;scale=.75;}
      phenomena.preview(kind,clock*.001);dirty=true;schedule();
    },
    setMode(value){interact();depth=value==='depth';dirty=true;schedule();},pause(value){running=!value;if(!value)earthFollow=true;last=0;dirty=true;schedule();},
    chartMotion(value){chartRunning=value;dirty=true;schedule();},
    visible(value){visible=value;if(!value&&frame){cancelAnimationFrame(frame);frame=0;}last=0;schedule();},
    sky(value){skyOnly=value;resize();},zoom(value){interact();scale=Math.max(.45,Math.min(5,scale*value));dirty=true;schedule();},
    search(query){const q=normalize(query.trim());return q?[...bodies,...rows].filter(s=>[s.name,s.modern,String(s.id),s.named?.symbol].some(x=>x&&normalize(x).includes(q))).slice(0,10):[];},
  };
  fetch('./sky/catalog.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
    rows=data.stars.map(([id,ra,dec,distance,mag,ci,name,bf,con],i)=>({id,ra,dec,distance,mag,name:named.has(id)?starLabel(named.get(id)):name||(typeof id==='number'?`HIP ${id}`:id),modern:named.get(id)?.modern||name||bf||String(id),named:named.get(id),vector:unitVector(ra,dec),phaseSeed:(i*1.618)%100,color:ci===null?'#dce5f3':ci<.1?'#bad5ff':ci>.9?'#ffe0ac':'#ecedee'}));
    yaw=snapshot.moon.altitude>-5?snapshot.moon.azimuth*rad:Math.PI;pitch=.24;onReady(data);dirty=true;schedule();
  }).catch(()=>onError('星表暂未载入。排盘仍可使用，请刷新重试星空。'));
  resize();return api;
}
