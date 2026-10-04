import {createSceneGL} from './scene-gl.mjs';
import {DEEP_SKY_GLSL,setCelestialCamera} from './deep-sky.mjs';
import {SHANHE_WATER_GLSL} from './shanhe-profile.mjs';

export const LANDSCAPE_FRAGMENT=`precision highp float;
varying vec2 vUv;
uniform sampler2D plate,landMask,ridgeContour;
uniform vec2 resolution,sunPosition,moonPosition;
uniform vec4 plateRect;
uniform float time,daylight,twilight,moonlight,lightDirection;
uniform vec3 sunLight,moonLight;
${DEEP_SKY_GLSL}
${SHANHE_WATER_GLSL}
float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.27,.43));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float square(float x){return x*x;}
float windowLight(vec2 uv,vec2 position){return exp(-dot((uv-position)/vec2(.0014,.0026),(uv-position)/vec2(.0014,.0026)));}
void main(){
  vec2 screen=vec2(vUv.x,1.-vUv.y),uv=(screen*resolution-plateRect.xy)/plateRect.zw;
  vec4 raw=texture2D(plate,uv);
  float land=texture2D(landMask,uv).a;
  if(uv.y<0.||uv.y>1.)land=0.;
  float foreground=smoothstep(.65,.96,uv.y);
  float bamboo=(1.-smoothstep(.14,.21,uv.x))*smoothstep(.69,.85,uv.y);
  float leaves=1.-smoothstep(.07,.20,dot(raw.rgb,vec3(.2126,.7152,.0722)));
  // A coherent sub-pixel breeze in near-bank foliage; mountains, houses and riverbanks stay fixed.
  float sway=sin(time*.43+uv.y*2.)*.75+sin(time*.67+.8)*.25;
  vec2 leafUV=uv+vec2(sway*.0012,sin(time*.39)*.00016)*bamboo*leaves;
  float water=shanheWater(uv);
  float current=sin(uv.y*540.-time*1.35+sin(uv.x*29.+time*.12)*1.7);
  vec2 waterUV=leafUV+vec2(current*.00080,cos(uv.y*370.-time*.77)*.00019)*water;
  vec3 base=texture2D(plate,waterUV).rgb;
  float luminance=dot(base,vec3(.2126,.7152,.0722));
  // Keep silk fibres and mineral pigments legible as daylight changes.
  vec2 contour=texture2D(ridgeContour,vec2(clamp(uv.x,0.,1.),.5)).rg;
  float ridge=contour.r;
  float ridgeDistance=uv.y-ridge;
  float distantRidge=smoothstep(.16,.50,ridge);
  // Shallow image relief gives cliffs and leaves a directional response. It is
  // intentionally not a terrain reconstruction or a physical shadow solution.
  vec2 texel=vec2(1./1672.,1./941.);
  float dx=dot(texture2D(plate,waterUV+vec2(texel.x,0)).rgb-texture2D(plate,waterUV-vec2(texel.x,0)).rgb,vec3(.2126,.7152,.0722));
  float dy=dot(texture2D(plate,waterUV+vec2(0,texel.y)).rgb-texture2D(plate,waterUV-vec2(0,texel.y)).rgb,vec3(.2126,.7152,.0722));
  vec3 relief=normalize(vec3(clamp(-dx*3.8,-.6,.6)+(uv.x-.5)*.7,clamp(dy*3.8,-.5,.5)+.38,1.));
  float solarFace=max(0.,dot(relief,sunLight)),lunarFace=max(0.,dot(relief,moonLight));
  float vegetation=smoothstep(.004,.075,base.g-base.r*.76)*(1.-water);
  vec3 nightColor=base*vec3(.71,.78,.95)*(.73+moonlight*(.12+.25*lunarFace));
  vec3 dayColor=pow(base,vec3(.88))*vec3(1.12,1.10,1.01)*(.82+.25*solarFace);
  dayColor+=base*vec3(.04,.095,.035)*vegetation*solarFace;
  nightColor+=base*vec3(.025,.054,.10)*vegetation*lunarFace*moonlight;
  vec3 landscape=mix(nightColor,dayColor,daylight);
  float gold=smoothstep(.07,.20,base.r-base.b)*smoothstep(.30,.65,luminance);
  landscape+=gold*vec3(.055,.038,.012)*(.6+.4*sin(time*.16+uv.x*4.));
  landscape+=twilight*vec3(.13,.055,.025)*(.4+.6*clamp(lightDirection*(uv.x-.5)+.5,0.,1.))*(luminance+.1);
  float crest=exp(-max(0.,ridgeDistance)*110.)*land;
  landscape+=crest*(twilight*vec3(.17,.073,.023)*(1.-solarFace)+moonlight*vec3(.028,.046,.078)*(1.-lunarFace));
  // Lighting ripples flow across the water without stretching the photographic geometry.
  float wave=sin(uv.y*430.-time*.52+sin(uv.x*19.))* .55+sin(uv.y*690.+uv.x*28.-time*.37)*.25;
  float gentle=.009*daylight+.005*(1.-daylight)+.003*moonlight;
  landscape+=water*wave*gentle*vec3(.75,.88,1.);
  float reflectionWidth=.012+foreground*.095;
  float rippleOffset=sin(uv.y*167.-time*.44)*(.001+foreground*.004);
  float solarBeam=exp(-square((screen.x-sunPosition.x+rippleOffset)/reflectionWidth));
  float lunarBeam=exp(-square((screen.x-moonPosition.x+rippleOffset)/(reflectionWidth*.72)));
  float sparkle=pow(max(0.,.5+.5*sin(uv.y*660.-time*.48+sin(uv.x*190.)*.8)),10.);
  float fresnel=.18+.82*pow(1.-foreground,2.);
  landscape+=water*(.28+sparkle)*fresnel*(solarBeam*daylight*vec3(.30,.22,.10)+lunarBeam*moonlight*vec3(.10,.16,.24));
  float horizon=(plateRect.y+plateRect.w*.39)/resolution.y;
  float skyHeight=clamp(screen.y/max(.5,horizon),0.,1.);
  vec3 nightSky=mix(vec3(.004,.008,.017),vec3(.033,.048,.076),skyHeight);
  vec3 daySky=mix(vec3(.17,.36,.58),vec3(.66,.78,.83),skyHeight);
  vec3 sky=mix(nightSky,daySky,daylight);
  vec3 ray=celestialRay(screen,resolution);
  float forwardLight=pow(max(0.,dot(ray,skySun)),36.);
  sky+=forwardLight*(vec3(.13,.095,.055)*daylight+vec3(.14,.047,.012)*twilight);
  float milky=0.;
  if(daylight<.99&&(land<.99||water>.1)){
  vec3 galaxy=deepSkyColor(ray);
  milky=dot(galaxy,vec3(.2126,.7152,.0722));
  float moonDistance=length((screen-moonPosition)*vec2(resolution.x/resolution.y,1.));
  float moonWash=1.-moonlight*.36*exp(-moonDistance*2.);
  sky+=galaxy*pow(1.-daylight,3.)*moonWash*(.72+.28*smoothstep(-.03,.35,ray.z));
  }
  // A silver-blue river reflection and luminous valley haze separate near and distant ridges.
  float valley=exp(-square((uv.x-.50)/.29))*exp(-square((uv.y-.70)/.145));
  landscape=mix(landscape,vec3(.19,.23,.31),valley*(1.-daylight)*.10);
  landscape+=water*pow(1.-daylight,2.)*(.008+.012*milky)*vec3(.48,.60,.77);
  float horizonGlow=exp(-square((screen.y-horizon)/.25));
  float towardsSun=.3+.7*exp(-square((screen.x-sunPosition.x)/.55));
  sky=mix(sky,vec3(.60,.29,.19),twilight*horizonGlow*towardsSun*.76);
  float halo=exp(-length((screen-moonPosition)*vec2(resolution.x/resolution.y,1.))*8.);
  sky+=vec3(.020,.034,.060)*moonlight*halo;
  // The silk wash is decorative; interactive celestial bodies retain computed positions.
  // Fade the painted night sky out in daylight, and blend its upper edge into the live sky.
  float silk=smoothstep(-.01,.17,uv.y)*(1.-smoothstep(1.,1.02,uv.y));
  sky=mix(sky,raw.rgb*vec3(.78,.82,.98),silk*pow(1.-daylight,2.)*.82);
  // Distant relief and its surrounding sky share the same air, rather than meeting as a cutout.
  vec3 airColor=mix(vec3(.055,.078,.111),vec3(.52,.63,.69),daylight);
  airColor=mix(airColor,vec3(.34,.21,.14),twilight*(.20+.30*towardsSun));
  airColor+=vec3(.012,.022,.035)*moonlight*halo;
  float airDepth=distantRidge*exp(-max(0.,ridgeDistance)*5.);
  landscape=mix(landscape,airColor,airDepth*(.15-.05*daylight));
  float drift=noise(vec3(uv.x*4.-time*.015,uv.y*6.,time*.018));
  // The same dense air covers both sides of the crest. Signed pow() is undefined
  // in GLSL; explicit squares keep the sky-side haze valid on every GPU.
  float fogWidth=(.022+distantRidge*.030)*(.86+drift*.26);
  fogWidth*=mix(1.,1.3,smoothstep(-.01,.04,ridgeDistance));
  float ridgeMist=exp(-square(ridgeDistance/fogWidth))*distantRidge*(.18+drift*.025);
  float bankCenter=contour.g+.045+sin(uv.x*7.-time*.045)*.012;
  float valleyBank=exp(-square((uv.y-bankCenter)/.16))*exp(-square((uv.x-.5)/.35));
  float sharedMist=1.-(1.-ridgeMist)*(1.-valleyBank*(.08+drift*.04));
  vec3 color=mix(sky,landscape,land);
  float skyMist=mix(.30,1.,smoothstep(-.025,.045,ridgeDistance));
  color=mix(color,airColor,sharedMist*mix(skyMist,1.,land));
  gl_FragColor=vec4(color,1.);
}`;

export function initLandscape(canvas,{terrain,onReady=()=>{},onFailure=()=>{}}){
  const gl=createSceneGL(canvas,LANDSCAPE_FRAGMENT),fallback=document.querySelector('#sky-landscape');let ready=false,last=null;
  if(!gl){canvas.hidden=true;onFailure();}
  terrain.ready.then(async asset=>{
    if(!asset){canvas.hidden=true;if(gl)onFailure();return;}
    if(gl){await Promise.all([gl.texture('plate',asset.image,0),gl.texture('landMask',asset.mask,1),gl.texture('ridgeContour',asset.contour,2),gl.texture('deepSky','./sky/milkyway-gaia.jpg',3)]);ready=true;canvas.dataset.ready='true';onReady();}
    if(last)render(last);
  });
  function render(frame){
    last=frame;if(frame.landscape!=='mountains')return;
    const {world,time,sun,moon,yaw,pitch,scale}=frame,bounds=canvas.parentElement.getBoundingClientRect(),w=bounds.width,h=bounds.height,r=terrain.rect(w,h);
    fallback.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;filter:brightness(${.12+world.daylight*.88})`;
    if(!gl||!ready)return;
    gl.size();gl.vec2('resolution',w,h);gl.vec4('plateRect',[r.left,r.top,r.width,r.height]);gl.float('time',time);
    setCelestialCamera(gl,frame,w,h);
    for(const key of ['daylight','twilight','moonlight'])gl.float(key,world[key]);
    const cameraLight=body=>{
      const [x,y,z]=body.horizontal;
      return [-Math.sin(yaw)*x+Math.cos(yaw)*y,z,-Math.cos(yaw)*x-Math.sin(yaw)*y];
    };
    gl.vec3('sunLight',cameraLight(world.sun));gl.vec3('moonLight',cameraLight(world.moon));
    gl.float('lightDirection',Math.sin(world.sun.azimuth*Math.PI/180-yaw));
    gl.vec2('sunPosition',sun?.zz>0?sun.x/w:-2,sun?.zz>0?sun.y/h:.7);
    gl.vec2('moonPosition',moon?.zz>0?moon.x/w:-2,moon?.zz>0?moon.y/h:-2);gl.draw();
  }
  return {frame:render};
}
