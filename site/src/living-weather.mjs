import {smooth} from './world-time.mjs';
import {createSilkCranes} from './silk-cranes.mjs';

export function initWeather(canvas,{terrain,onAssetFailure=()=>{}}={}){
  const ctx=canvas.getContext('2d');if(!ctx)return {frame(){}};
  let w=1,h=1,clouds=null,last=null;
  const cranes=createSilkCranes();
  const image=url=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{onAssetFailure();resolve(null);};img.src=url;});
  function tint(img,color){
    const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*img.height/img.width);const g=c.getContext('2d');
    g.drawImage(img,0,0,c.width,c.height);g.globalCompositeOperation='source-atop';g.fillStyle=color;g.fillRect(0,0,c.width,c.height);return c;
  }
  image('./sky/drifting-cloud-bank.png').then(img=>{if(img)clouds=[tint(img,'#263655b8'),tint(img,'#cf948666'),tint(img,'#d9e8ec22'),tint(img,'#c0d7eca0')];if(last)render(last);});
  cranes.ready.then(ok=>{if(!ok)onAssetFailure();if(last)render(last);});
  const sparks=Array.from({length:34},(_,i)=>({x:(i*.618033)%1,y:.79+(i*.317%1)*.19,p:i*2.399,size:.65+(i%3)*.38}));
  function size(){const b=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);w=b.width;h=b.height;const ww=Math.max(1,Math.round(w*d)),hh=Math.max(1,Math.round(h*d));if(canvas.width!==ww||canvas.height!==hh){canvas.width=ww;canvas.height=hh;}ctx.setTransform(d,0,0,d,0,0);}
  function cloudLayer(asset,x,y,width,alpha){if(alpha<.005)return;ctx.globalAlpha=alpha;ctx.drawImage(asset,x,y,width,width*asset.height/asset.width);}
  function render(frame){
    last=frame;if(frame.landscape!=='mountains'||!frame.skyOnly)return;size();ctx.clearRect(0,0,w,h);
    const {world,time}=frame,{daylight,twilight,night}=world;
    if(clouds){
      for(let i=0;i<2;i++){
        const width=w*(.72+i*.22),travel=w+width,x=((time*(3.4+i*1.4)+i*w*.79)%travel)-width,y=h*(.06+i*.13);
        const towardSun=frame.sun?.zz>0?Math.exp(-Math.pow((x+width*.5-frame.sun.x)/(width*.8),2)):0.18;
        const towardMoon=frame.moon?.zz>0?Math.exp(-Math.pow((x+width*.5-frame.moon.x)/(width*.8),2)):0.12;
        cloudLayer(clouds[0],x,y,width,.12*(1-daylight));
        cloudLayer(clouds[1],x,y,width,.25*twilight*(.3+.7*towardSun));
        cloudLayer(clouds[2],x,y,width,.32*daylight);
        cloudLayer(clouds[3],x,y,width,.11*world.moonlight*towardMoon);
      }
      terrain.eraseFrom(ctx,w,h);
      // Low, slow mist follows the valley; clouds higher up move faster.
      const plate=terrain.rect(w,h);
      for(let layer=0;layer<2;layer++){
        const fw=w*(.62+layer*.17),fogY=plate.top+plate.height*(.61+layer*.083),fogX=w*(.19-layer*.05)+Math.sin(time*(.017+layer*.007)+layer)*w*.035-frame.presence.x*(12+layer*12);
        cloudLayer(clouds[2],fogX,fogY,fw,(.025+layer*.015)*(1-daylight)+.04*twilight);
      }
    }
    if(daylight>.06)cranes.draw(ctx,{time,width:w,height:h,weight:smooth(.06,.25,daylight)*.7,scene:1,size:.6});
    if(night>.03){
      for(const s of sparks){
        const pulse=Math.pow(.5+.5*Math.sin(time*.78+s.p),4),x=s.x*w+Math.sin(time*.26+s.p)*12,y=s.y*h+Math.cos(time*.31+s.p)*7;
        const radius=s.size*(.4+pulse),light=ctx.createRadialGradient(x,y,0,x,y,7+radius*3);
        light.addColorStop(0,`rgba(216,235,163,${pulse*night*.57})`);light.addColorStop(.14,`rgba(189,219,136,${pulse*night*.32})`);light.addColorStop(1,'rgba(160,196,126,0)');
        ctx.globalAlpha=1;ctx.fillStyle=light;ctx.fillRect(x-12,y-12,24,24);
      }
    }
    ctx.globalAlpha=1;
  }
  return {frame:render};
}
