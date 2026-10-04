import {shanheRiver} from './shanhe-profile.mjs';
// Atmospheric layers and direct feedback share the painted river's camera and banks.
export function initScenicDepth(canvas,{terrain,starCanvas,onFailure=()=>{}}){
  const ctx=canvas.getContext('2d');if(!ctx)return {frame(){}};
  let last=null,w=1,h=1;
  const motes=Array.from({length:46},(_,i)=>({x:(i*.618034)%1,y:(i*.371)%1,z:.2+(i%7)/7,p:i*2.4}));
  function size(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);w=r.width;h=r.height;const ww=Math.round(w*d),hh=Math.round(h*d);if(canvas.width!==ww||canvas.height!==hh){canvas.width=ww;canvas.height=hh;}ctx.setTransform(d,0,0,d,0,0);}
  function waterPath(r){
    ctx.beginPath();
    for(const side of [-1,1])for(let i=0;i<=70;i++){
      const y=.47+(side<0?i:70-i)/70*.53,[center,half]=shanheRiver(y);
      const x=r.left+(center+side*half*.82)*r.width,at=r.top+y*r.height;
      if(side<0&&i===0)ctx.moveTo(x,at);else ctx.lineTo(x,at);
    }
    ctx.closePath();
  }
  function render(frame){
    last=frame;if(frame.landscape!=='mountains'||!frame.skyOnly)return;size();ctx.clearRect(0,0,w,h);
    const {presence:p,world,time}=frame,r=terrain.rect(w,h),night=1-world.daylight;
    ctx.save();waterPath(r);ctx.clip();
    // Reflect the rendered astronomical stars rather than adding a second invented star field.
    const horizon=r.top+r.height*.47;
    ctx.globalAlpha=night*.21;ctx.globalCompositeOperation='screen';
    ctx.translate(0,horizon*1.28);ctx.scale(1,-.28);ctx.drawImage(starCanvas,0,0,w,h);ctx.restore();
    if(p.pulse){
      const pulse=p.pulse,t=pulse.age,fade=Math.max(0,1-t/4.8),x=pulse.x*w;
      const y=pulse.star?r.top+r.height*.905:Math.max(r.top+r.height*.88,pulse.y*h);
      ctx.save();waterPath(r);ctx.clip();ctx.globalCompositeOperation='screen';
      const glow=ctx.createRadialGradient(x,y,0,x,y,Math.max(15,w*.17));
      glow.addColorStop(0,`rgba(194,222,209,${fade*.2})`);glow.addColorStop(.35,`rgba(91,182,184,${fade*.09})`);glow.addColorStop(1,'rgba(20,50,60,0)');ctx.fillStyle=glow;ctx.fillRect(0,h*.65,w,h*.35);
      for(let i=0;i<4;i++){
        const radius=(t*.105+i*.043)*w;
        ctx.strokeStyle=`rgba(196,223,201,${fade*(.34-i*.06)})`;ctx.lineWidth=.65;
        ctx.beginPath();ctx.ellipse(x,y,Math.max(1,radius),Math.max(1,radius*.145),0,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
      if(pulse.star){
        ctx.save();ctx.globalCompositeOperation='screen';const top=pulse.y*h;
        const light=ctx.createLinearGradient(x,top,x,y);light.addColorStop(0,`rgba(233,211,161,${fade*.42})`);light.addColorStop(.45,`rgba(126,199,201,${fade*.07})`);light.addColorStop(1,`rgba(193,220,194,${fade*.28})`);
        ctx.strokeStyle=light;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,top);ctx.bezierCurveTo(x-15,top+(y-top)*.4,x+20,y-80,x,y);ctx.stroke();
        ctx.translate(x,top);ctx.rotate(t*.12);ctx.strokeStyle=`rgba(223,204,163,${fade*.42})`;
        for(const radius of [24,32]){ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();}
        for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(Math.cos(a)*35,Math.sin(a)*35);ctx.lineTo(Math.cos(a)*40,Math.sin(a)*40);ctx.stroke();}ctx.restore();
      }
    }
    if(!p.reduced)for(const m of motes){
      const x=m.x*w+Math.sin(time*.09+m.p)*20-p.x*30*m.z;
      const y=(.4+m.y*.59)*h+Math.cos(time*.13+m.p)*12-p.y*12*m.z;
      const a=(.06+night*.23)*(.5+.5*Math.sin(time*.7+m.p));
      ctx.fillStyle=`rgba(204,205,159,${a})`;ctx.beginPath();ctx.arc(x,y,.5+m.z*1.2,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  return {frame:render};
}
