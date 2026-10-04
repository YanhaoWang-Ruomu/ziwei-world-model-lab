const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));

// The projected lit area stays equal to the ephemeris phase fraction.
export function lunarLight(phase,angle){
  const z=2*clamp(phase)-1,r=Math.sqrt(Math.max(0,1-z*z));
  return [Math.cos(angle)*r,Math.sin(angle)*r,z];
}
export function celestialRadius(body,width,height,scale,distanceKm){
  const base=clamp(Math.min(width,height)*.031,16,34);
  const distance=body==='Moon'?clamp(384400/(distanceKm||384400),.88,1.12):1.04;
  return clamp(base*scale*distance,11,76);
}
export function stellarAppearance(magnitude,phase,time,{atmosphere=true,reduced=false,altitude=1}={}){
  const shimmer=atmosphere&&!reduced?(.035+.11*(1-clamp(altitude))):0;
  const pulse=1+shimmer*(.68*Math.sin(time*(1.4+phase%1.1)+phase)+.32*Math.sin(time*3.7+phase*2));
  return {radius:clamp(1.68-magnitude*.19,.36,2.45),alpha:clamp(clamp(Math.pow(10,-.11*(magnitude-1.1)),.07,1)*pulse),pulse};
}

export function createCelestialPainter({onReady=()=>{}}={}){
  const moonCanvas=document.createElement('canvas');moonCanvas.width=moonCanvas.height=256;
  const moonContext=moonCanvas.getContext('2d'),pixels=moonContext.createImageData(256,256);
  let texture=null,moonKey='',sunKey='',sunCanvas=null,coronaCanvas=null;
  const image=new Image();
  image.onload=()=>{
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(image,0,0);
    texture={data:cx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};
    moonKey='';onReady(true);
  };
  image.onerror=()=>onReady(false);image.src='./sky/moon-lro-2025.jpg';
  function moonSurface(star,angle,daylight,atmosphere,eclipse){
    const phase=Math.round(star.phase*400)/400,a=Math.round(angle*100)/100;
    const day=Math.round(daylight*20)/20;
    const lon=Math.round((star.libration?.longitude||0)*5)/5*Math.PI/180;
    const lat=Math.round((star.libration?.latitude||0)*5)/5*Math.PI/180;
    const shadow=eclipse?Math.round(eclipse.offset*70)/70:null;
    const key=[phase,a,day,lon,lat,Boolean(texture),atmosphere,shadow].join('/');
    if(key===moonKey)return moonCanvas;moonKey=key;
    const light=lunarLight(phase,a),earthshine=(.024+.05*(1-phase)**2)*(1-day);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const nx=(x+.5-128)/127,ny=(y+.5-128)/127,r2=nx*nx+ny*ny,i=(y*256+x)*4;
      if(r2>1){pixels.data[i+3]=0;continue;}
      const nz=Math.sqrt(1-r2),incidence=nx*light[0]+ny*light[1]+nz*light[2];
      const terminator=clamp((incidence+.006)/.024),lit=terminator*terminator*(3-2*terminator);
      const shading=lit*(.68+.32*Math.pow(Math.max(0,incidence),.35))+earthshine;
      let albedo=[177,180,180];
      if(texture){
        const north=-ny*Math.cos(lat)+nz*Math.sin(lat),front=nz*Math.cos(lat)+ny*Math.sin(lat);
        const u=.5+(Math.atan2(nx,front)+lon)/TAU,v=.5-Math.asin(clamp(north,-1,1))/Math.PI;
        const tx=clamp(Math.floor(u*texture.width),0,texture.width-1),ty=clamp(Math.floor(v*texture.height),0,texture.height-1);
        const index=(ty*texture.width+tx)*4;albedo=texture.data.subarray(index,index+3);
      }
      for(let channel=0;channel<3;channel++)pixels.data[i+channel]=clamp(albedo[channel]*1.20,0,250)*shading+(atmosphere?[6,9,14][channel]*(1-lit)*(1-day):0);
      if(eclipse){
        const d=Math.hypot(nx-shadow,ny),umbra=clamp((eclipse.radius+.12-d)/.24);
        const penumbra=clamp((eclipse.radius+.5-d)/.65)*.3;
        const red=[.43,.12,.045];
        for(let channel=0;channel<3;channel++)pixels.data[i+channel]*=(1-penumbra)*(1-umbra)+red[channel]*umbra;
      }
      // In daylight, the unlit portion blends into the sky rather than a black disk.
      pixels.data[i+3]=255*clamp((1-Math.sqrt(r2))*127)*((1-day)+day*lit);
    }
    moonContext.putImageData(pixels,0,0);return moonCanvas;
  }
  function solarSurface(warmth){
    const key=Math.round(warmth*24);if(sunCanvas&&key===sunKey)return sunCanvas;sunKey=key;
    sunCanvas=document.createElement('canvas');sunCanvas.width=sunCanvas.height=192;
    const cx=sunCanvas.getContext('2d'),im=cx.createImageData(192,192);
    for(let y=0;y<192;y++)for(let x=0;x<192;x++){
      const nx=(x+.5-96)/95,ny=(y+.5-96)/95,r2=nx*nx+ny*ny,i=(y*192+x)*4;
      if(r2>1)continue;
      const mu=Math.sqrt(1-r2),limb=.56+.44*Math.pow(mu,.62);
      const granules=Math.sin(x*5.73+y*4.17)*Math.sin(x*3.91-y*6.57);
      const cells=Math.sin(x*.81+Math.sin(y*.43)*2.)*Math.sin(y*1.23+Math.cos(x*.29));
      const grain=.965+.024*granules+.011*cells;
      // A resolved photosphere with a brighter centre and a warmer limb.
      im.data[i]=255*limb*grain;im.data[i+1]=(250-67*warmth-9*(1-mu))*limb*grain;
      im.data[i+2]=(222-134*warmth-22*(1-mu))*limb*grain;im.data[i+3]=255*clamp((1-Math.sqrt(r2))*95);
    }
    cx.putImageData(im,0,0);return sunCanvas;
  }
  function solarCorona(){
    if(coronaCanvas)return coronaCanvas;
    coronaCanvas=document.createElement('canvas');coronaCanvas.width=coronaCanvas.height=384;
    const cx=coronaCanvas.getContext('2d'),im=cx.createImageData(384,384);
    for(let y=0;y<384;y++)for(let x=0;x<384;x++){
      const dx=(x-191.5)/56,dy=(y-191.5)/56,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),i=(y*384+x)*4;
      if(r<.97)continue;
      const stream=.64+.20*Math.sin(a*3+.6)+.10*Math.sin(a*7+r*.8)+.06*Math.sin(a*17-r*2);
      const fall=Math.exp(-(r-1)*4.4)*.32+Math.exp(-(r-1)*1.9)*.025;
      const filaments=.7+.3*Math.sin(a*33+Math.sin(a*9)*1.3+r*6);
      im.data[i]=255;im.data[i+1]=198;im.data[i+2]=125;
      im.data[i+3]=255*clamp(fall*stream*filaments)*clamp((r-.97)*35)*clamp((3.4-r)*2);
    }
    cx.putImageData(im,0,0);return coronaCanvas;
  }
  function halo(ctx,x,y,radius,rgb,strength){
    const g=ctx.createRadialGradient(x,y,0,x,y,radius);
    for(const [stop,alpha] of [[0,.60],[.10,.30],[.25,.09],[.55,.024],[1,0]])g.addColorStop(stop,`rgba(${rgb},${alpha*strength})`);
    ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  function eclipseCorona(ctx,x,y,radius,coverage){
    const total=clamp((coverage-.97)/.03);if(!total)return;
    ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='screen';ctx.globalAlpha=total;
    const g=ctx.createRadialGradient(0,0,radius,0,0,radius*4.4);
    g.addColorStop(0,'rgba(255,245,229,.88)');g.addColorStop(.04,'rgba(222,233,247,.56)');g.addColorStop(.21,'rgba(187,210,231,.10)');g.addColorStop(.65,'rgba(156,187,216,.02)');g.addColorStop(1,'rgba(137,169,203,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,radius*4.4,0,TAU);ctx.fill();
    for(let i=0;i<96;i++){
      const a=i*TAU/96,l=radius*(1.6+.8*Math.cos(a*2)**2+.2*Math.sin(a*7));
      ctx.strokeStyle=`rgba(226,236,247,${.018+.02*(.5+.5*Math.sin(i*2.3))})`;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(Math.cos(a)*radius*1.03,Math.sin(a)*radius*1.03);ctx.quadraticCurveTo(Math.cos(a+.03)*l*.6,Math.sin(a+.03)*l*.6,Math.cos(a+.045)*l,Math.sin(a+.045)*l);ctx.stroke();
    }
    ctx.restore();
  }
  return {
    draw(ctx,star,p,{width,height,scale,world,project,time=0,atmosphere=true,effect=null}){
      if(star.planet){
        const visibility=atmosphere?Math.pow(1-world.daylight,star.mag< -3?1.6:4):1;
        const radius=clamp(2.1-star.mag*.24,1.2,3.4);
        ctx.save();ctx.globalAlpha=visibility;ctx.globalCompositeOperation='screen';halo(ctx,p.x,p.y,radius*9,star.body==='Mars'?'255,166,124':'227,221,196',.65);ctx.fillStyle=star.color;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);ctx.fill();ctx.restore();return radius+4;
      }
      const eclipse=effect?.kind===(star.body==='Sun'?'solar-eclipse':'lunar-eclipse')?effect:null;
      const radius=eclipse?clamp(Math.min(width,height)*.071,28,65):celestialRadius(star.body,width,height,scale,star.distanceKm);
      ctx.save();ctx.globalAlpha=1;
      if(star.body==='Sun'){
        const warmth=atmosphere?clamp((18-star.altitude)/22):0;
        const rgb=warmth>.4?'255,177,94':'255,230,187';
        const transmission=eclipse?Math.pow(1-eclipse.coverage,.8):1;
        ctx.globalCompositeOperation='screen';
        halo(ctx,p.x,p.y,radius*15,rgb,(atmosphere?2.1:1.25)*transmission);
        halo(ctx,p.x,p.y,radius*3.5,'255,243,223',1.8*transmission);
        halo(ctx,p.x,p.y,radius*1.55,'255,250,234',.72*transmission);
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.sin(time*.035)*.025);ctx.globalAlpha=(.84+.06*Math.sin(time*.16))*transmission;
        const extent=radius*384/112;ctx.drawImage(solarCorona(),-extent,-extent,extent*2,extent*2);ctx.restore();
        // A faint, softly focused lens bloom, without hard polygonal spokes.
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-.08);ctx.scale(1,.065);
        halo(ctx,0,0,radius*10,'228,222,195',.24*transmission);ctx.restore();
        if(eclipse)eclipseCorona(ctx,p.x,p.y,radius,eclipse.coverage);
        ctx.globalCompositeOperation='screen';ctx.drawImage(solarSurface(warmth),p.x-radius,p.y-radius,radius*2,radius*2);
        if(eclipse){
          ctx.save();ctx.globalCompositeOperation='source-over';ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);ctx.clip();ctx.fillStyle='#03060c';ctx.beginPath();ctx.arc(p.x+eclipse.offset*radius,p.y,eclipse.radius*radius,0,TAU);ctx.fill();ctx.restore();
          const contact=Math.exp(-(((eclipse.coverage-.988)/.006)**2));
          if(contact>.02){ctx.globalCompositeOperation='screen';glowDiamond(ctx,p.x+(eclipse.progress<.5?1:-1)*radius,p.y,radius,contact);}
        }
      }else{
        const m=star.vector,s=world.sun.vector,dot=s.reduce((n,v,i)=>n+v*m[i],0);
        const tangent=project(s.map((v,i)=>v-dot*m[i]),true),sunAngle=Math.atan2(-tangent.yy,tangent.xx);
        const pole=star.pole||[0,0,1],nd=pole.reduce((n,v,i)=>n+v*m[i],0);
        const north=project(pole.map((v,i)=>v-nd*m[i]),true),northAngle=Math.atan2(-north.yy,north.xx)+Math.PI/2;
        const daylight=atmosphere?Math.max(1-Math.pow(1-world.daylight,4),world.twilight*.5):0;
        const transmission=eclipse?1-eclipse.coverage*.94:1;
        ctx.globalCompositeOperation='screen';halo(ctx,p.x,p.y,radius*7.5,'162,192,223',star.phase*(1-daylight)*.48*transmission);
        halo(ctx,p.x,p.y,radius*1.5,'211,225,239',star.phase*(1-daylight)*.35*transmission);
        ctx.globalCompositeOperation='source-over';ctx.translate(p.x,p.y);ctx.rotate(northAngle);
        ctx.drawImage(moonSurface(star,sunAngle-northAngle,daylight,atmosphere,eclipse),-radius,-radius,radius*2,radius*2);
      }
      ctx.restore();return radius;
    }
  };
  function glowDiamond(ctx,x,y,radius,strength){
    halo(ctx,x,y,radius*1.5,'235,245,255',strength*4);
    ctx.strokeStyle=`rgba(235,245,255,${strength*.7})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-radius*.7,y);ctx.lineTo(x+radius*.7,y);ctx.moveTo(x,y-radius*.7);ctx.lineTo(x,y+radius*.7);ctx.stroke();
  }
}
