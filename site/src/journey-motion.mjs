import {createSceneGL} from './scene-gl.mjs';
import {createSilkCranes} from './silk-cranes.mjs';

export function photographicRect(width,height,scale,x=0,y=0){
  const cover=Math.max(width/1672,height/941),w=1672*cover*scale,h=941*cover*scale;
  return [(width-w)/2+x*width/100,(height-h)/2+y*height/100,w,h];
}

// Image-space river banks belong to this artwork, not to the chart model.
const nightRiver=[[.59,.51,.006],[.62,.52,.012],[.65,.49,.015],[.67,.526,.024],[.70,.538,.034],[.725,.496,.036],[.75,.475,.040],[.785,.538,.049],[.81,.602,.053],[.835,.642,.055],[.87,.665,.056],[.90,.631,.069],[.94,.557,.070],[.97,.552,.062],[1,.59,.067]];
const channelGLSL=`vec2 nightChannel(float y){${nightRiver.slice(1).map((point,i)=>{const a=nightRiver[i].map(n=>n.toFixed(6)),b=point.map(n=>n.toFixed(6));return `if(y<${b[0]})return mix(vec2(${a[1]},${a[2]}),vec2(${b[1]},${b[2]}),smoothstep(${a[0]},${b[0]},y));`;}).join('')}return vec2(.59,.067);}`;
const FRAGMENT=`precision highp float;
varying vec2 vUv;
uniform sampler2D clouds,river,night,fog;
uniform vec4 cloudRect,riverRect,nightRect;
uniform vec2 resolution;
uniform float time,fogReady;
uniform vec3 weights;
${channelGLSL}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float inside(vec2 p){return step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);}
vec3 veil(vec3 base,vec2 uv,float scene){
  if(fogReady<.5)return base;
  for(int i=0;i<3;i++){
    float k=float(i),speed=.006+k*.003;
    vec2 p=(uv-vec2(fract(time*speed+k*.31)*2.3-1.1,.26+k*.18))/vec2(1.2,.24+k*.035);
    if(inside(p)>.5){float a=texture2D(fog,p).a;
      vec3 tint=scene<.5?vec3(.95,.86,.66):scene<1.5?vec3(.70,.79,.71):vec3(.39,.40,.66);
      base=mix(base,tint,a*(scene<.5?.17:scene<1.5?.09:.07));
    }
  }return base;
}
vec3 cloudSea(vec2 uv){
  vec3 original=texture2D(clouds,uv).rgb;
  float white=smoothstep(.40,.70,luma(original))*(1.-smoothstep(.005,.075,original.b-original.r))*smoothstep(.29,.40,uv.y);
  vec2 flow=vec2(sin(uv.y*13.+time*.24)+.5*sin(uv.y*29.-time*.14),cos(uv.x*12.-time*.18));
  vec3 c=texture2D(clouds,uv+flow*vec2(.0042,.0022)*white).rgb;
  float gold=smoothstep(.07,.24,c.r-c.b)*smoothstep(.4,.8,luma(c));
  c+=gold*vec3(.026,.019,.005)*sin(time*.25+uv.x*5.);
  c=mix(c,vec3(.97,.86,.63),white*max(0.,noise(uv*7.-vec2(time*.025,0))-.35)*.10);
  float glow=exp(-length((uv-vec2(.50,.069))*vec2(1.,.56))*15.);
  c+=glow*vec3(.028,.019,.007)*(.5+.5*sin(time*.30));
  return veil(c,uv,0.);
}
float grandWater(vec2 uv,vec3 c){
  float bank=.51+.070*pow(abs(uv.x-.52)*2.,.72);
  return smoothstep(bank+.004,bank+.022,uv.y)*smoothstep(.01,.07,c.g-c.r*.87);
}
vec3 grandRiver(vec2 uv){
  vec3 original=texture2D(river,uv).rgb;float water=grandWater(uv,original);
  float depth=smoothstep(.51,1.,uv.y);
  vec2 flow=vec2(sin(uv.y*96.-time*1.75+sin(uv.x*22.)),cos(uv.y*180.-time*1.1));
  vec3 c=texture2D(river,uv+flow*vec2(.0024,.00085)*water*(.25+depth)).rgb;
  float ripples=sin(uv.y*350.-time*2.5+sin(uv.x*37.+time*.1)*2.);
  float glints=pow(max(0.,sin(uv.y*173.-time*1.8+sin(uv.x*23.)*3.)),14.);
  float current=pow(max(0.,sin(uv.x*43.+sin(uv.y*11.)*3.+time*.17)),9.);
  c+=water*(ripples*vec3(.012,.020,.018)+glints*current*vec3(.095,.079,.034))*(.3+depth);
  return veil(c,uv,1.);
}
vec3 starNight(vec2 uv){
  vec3 original=texture2D(night,uv).rgb;
  vec2 bank=nightChannel(uv.y);
  float water=(1.-smoothstep(.70,1.,abs(uv.x-bank.x)/bank.y))*smoothstep(.59,.62,uv.y)*smoothstep(.015,.06,original.g-original.r*.93);
  float horizon=.50-.22*pow(abs(uv.x-.50)*2.,1.4);
  float sky=1.-smoothstep(horizon-.05,horizon,uv.y);
  float violet=smoothstep(.01,.12,original.b-original.g)*sky;
  vec2 drift=vec2(sin(uv.y*16.+time*.14),cos(uv.x*13.-time*.10))*.0018;
  vec3 c=texture2D(night,uv+drift*violet+vec2(sin(uv.y*460.-time*1.5)*.0014,0)*water).rgb;
  float moon=1.-smoothstep(.065,.090,length((uv-vec2(.505,.164))*vec2(1.,.5628)));
  float stars=smoothstep(.35,.75,luma(original))*sky*(1.-moon);
  c+=stars*sin(time*(.5+hash(floor(uv*380.))*.8)+hash(floor(uv*530.))*6.28)*vec3(.08,.08,.105);
  c+=water*sin(uv.y*650.-time*2.1+uv.x*49.)*vec3(.012,.021,.021);
  c+=moon*vec3(.022,.019,.012)*sin(time*.30);
  return veil(c,uv,2.);
}
vec3 scene(float key,vec2 p){
  if(key<.5)return cloudSea((p-cloudRect.xy)/cloudRect.zw);
  if(key<1.5)return grandRiver((p-riverRect.xy)/riverRect.zw);
  return starNight((p-nightRect.xy)/nightRect.zw);
}
void main(){
  vec2 p=vec2(vUv.x,1.-vUv.y)*resolution;vec3 color=vec3(0.);
  if(weights.x>.001)color+=scene(0.,p)*weights.x;
  if(weights.y>.001)color+=scene(1.,p)*weights.y;
  if(weights.z>.001)color+=scene(2.,p)*weights.z;
  gl_FragColor=vec4(color,1.);
}`;


export function initJourneyMotion(canvas,effects){
  const gl=createSceneGL(canvas,FRAGMENT),ctx=effects.getContext('2d'),cranes=createSilkCranes();
  let ready=false,last=null,time=0,w=1,h=1;
  if(gl)gl.float('fogReady',0);
  function size(){
    const bounds=effects.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);
    w=bounds.width;h=bounds.height;
    const ww=Math.max(1,Math.round(w*d)),hh=Math.max(1,Math.round(h*d));
    if(effects.width!==ww||effects.height!==hh){effects.width=ww;effects.height=hh;}
    ctx?.setTransform(d,0,0,d,0,0);
  }
function nightEffects(weight){
  if(weight<.01||!ctx)return;
  const travel=(time+4)%19;
  if(travel<1.8){const t=travel/1.8,x=w*(.20+t*.44),y=h*(.09+t*.17),length=Math.min(130,w*.22);ctx.save();ctx.globalAlpha=Math.sin(Math.PI*t)*weight*.65;const g=ctx.createLinearGradient(x-length,y-length*.45,x,y);g.addColorStop(0,'#cad4ff00');g.addColorStop(.8,'#dfe6ff99');g.addColorStop(1,'#fff0c4');ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-length,y-length*.45);ctx.lineTo(x,y);ctx.stroke();ctx.restore();}
  for(let i=0;i<18;i++){const x=((i*.618034)%1)*w+Math.sin(time*.11+i)*12,y=(.13+(i*.377%1)*.67)*h+Math.cos(time*.14+i)*8,a=(.05+.13*Math.pow(.5+.5*Math.sin(time*.8+i),3))*weight;ctx.fillStyle=`rgba(239,209,140,${a})`;ctx.beginPath();ctx.arc(x,y,.6+i%3*.35,0,Math.PI*2);ctx.fill();}
}

  function render(value){
    last=value;size();time=value.time;
    if(gl&&ready){
      gl.size(1.4);gl.vec2('resolution',w,h);
      value.rects.forEach((rect,i)=>gl.vec4(['cloudRect','riverRect','nightRect'][i],rect));
      gl.float('time',time);gl.vec3('weights',value.weights);gl.draw();
    }
    if(ctx){
      ctx.clearRect(0,0,w,h);
      value.weights.forEach((weight,scene)=>cranes.draw(ctx,{time,width:w,height:h,weight,scene}));
      nightEffects(value.weights[2]);
    }
    effects.dataset.direction='left-to-right';canvas.dataset.time=time.toFixed(3);
  }
  cranes.ready.then(()=>{if(last)render(last);});
  return {
    async load(images){
      const fallback=images.find(Boolean);
      if(gl&&fallback){
        const loaded=await Promise.all(images.map((image,i)=>gl.texture(['clouds','river','night'][i],image||fallback,i)));
        ready=loaded.every(Boolean);canvas.dataset.ready=String(ready);
        gl.texture('fog','./sky/drifting-cloud-bank.png',3).then(ok=>{gl.float('fogReady',ok?1:0);if(last)render(last);});
      }
      if(last)render(last);return ready;
    },frame:render,
  };
}
