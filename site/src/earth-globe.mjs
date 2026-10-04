import {createSceneGL} from './scene-gl.mjs';
import {earthGeometry} from './scene-geometry.mjs';
import {DEEP_SKY_GLSL,setCelestialCamera} from './deep-sky.mjs';

export const EARTH_FRAGMENT=`precision highp float;
varying vec2 vUv;
uniform vec2 resolution;
uniform vec3 globe;
uniform sampler2D earth,lights,clouds;
uniform vec3 sun,moon;
uniform float longitude,cloudDrift,moonPhase,eclipseProgress;
${DEEP_SKY_GLSL}
const float PI=3.141592653589793;
vec3 earthNormal(vec3 n){
  // A slightly tilted camera reveals both the polar region and the equator.
  float roll=.24,latitude=.22;
  vec2 q=mat2(cos(roll),-sin(roll),sin(roll),cos(roll))*n.xy;
  float north=q.y*cos(latitude)+n.z*sin(latitude);
  float front=n.z*cos(latitude)-q.y*sin(latitude);
  float lon=atan(q.x,front)+longitude,lat=asin(clamp(north,-1.,1.));
  return vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));
}
vec2 mapUV(vec3 n){return vec2(fract(atan(n.y,n.x)/(2.*PI)+.5),.5-asin(clamp(n.z,-1.,1.))/PI);}
void main(){
  vec2 screen=vec2(vUv.x,1.-vUv.y);
  vec3 ray=celestialRay(screen,resolution);
  vec3 space=vec3(.002,.004,.010)+deepSkyColor(ray)*1.12;
  vec2 p=(vUv*resolution-globe.xy)/globe.z;
  float r2=dot(p,p),r=sqrt(r2);
  if(r>1.075){gl_FragColor=vec4(space,1.);return;}
  if(r>1.){
    vec3 edge=earthNormal(vec3(p/r,0.));
    float incidence=dot(edge,sun),lit=smoothstep(-.25,.5,incidence);
    float altitude=r-1.,thin=exp(-altitude*210.),haze=exp(-altitude*55.);
    float term=incidence/.15,sunset=exp(-term*term);
    vec3 air=vec3(.065,.30,.64)*(thin*.80+haze*.20)*(.12+.88*lit);
    air+=vec3(.68,.19,.045)*sunset*thin*.40;
    air+=vec3(.055,.115,.105)*thin*(1.-lit)*.30;
    gl_FragColor=vec4(space+air*(1.-smoothstep(1.05,1.075,r)),1.);return;
  }
  vec3 viewNormal=vec3(p,sqrt(max(0.,1.-r2))),n=earthNormal(viewNormal);
  vec2 uv=mapUV(n);float incidence=dot(n,sun);
  float day=smoothstep(-.10,.14,incidence),night=1.-smoothstep(-.16,.06,incidence);
  vec3 surface=texture2D(earth,uv).rgb;
  vec2 windUV=vec2(fract(uv.x+cloudDrift+.002*sin(uv.y*20.+cloudDrift*30.)),uv.y);
  float cloud=texture2D(clouds,windUV).r;
  // Project cloud shadows along the solar tangent, with longer shadows near dawn.
  vec3 east=normalize(vec3(-n.y,n.x,0.)),north=normalize(cross(n,east));
  float shadowLength=.0012+.0030*(1.-max(0.,incidence));
  vec2 solarTangent=vec2(dot(sun,east),-dot(sun,north));
  vec2 shadowUV=windUV+solarTangent*shadowLength;
  float shadow=texture2D(clouds,vec2(fract(shadowUV.x),clamp(shadowUV.y,0.,1.))).r;
  float moonIncidence=max(0.,dot(n,moon));
  float lunar=pow(moonIncidence,.72)*moonPhase*night;
  float sunlight=.14+.86*pow(max(0.,incidence),.65);
  float eclipseLight=1.;
  if(eclipseProgress>=0.){
    // A moving local umbra/penumbra, rather than dimming the entire planet.
    vec3 shadowEast=normalize(vec3(-sun.y,sun.x,0.));
    vec3 shadowNorth=normalize(cross(sun,shadowEast));
    vec3 shadowCenter=normalize(sun+shadowEast*(eclipseProgress-.5)*3.5+shadowNorth*.08);
    float distance=length(n-shadowCenter);
    float umbra=1.-smoothstep(.025,.055,distance);
    float penumbra=exp(-distance*distance/.018);
    float passage=smoothstep(0.,.12,eclipseProgress)*(1.-smoothstep(.88,1.,eclipseProgress));
    eclipseLight=1.-passage*max(umbra*.985,penumbra*.72);
  }
  sunlight*=eclipseLight;
  vec3 color=surface*(.025+day*sunlight)*(1.-shadow*.28*day);
  vec3 nightImage=texture2D(lights,uv).rgb;
  float city=max(0.,nightImage.r-max(nightImage.b,nightImage.g*.7));
  color+=vec3(1.,.63,.25)*pow(city,.82)*2.3*night*(1.-cloud*.72);
  color+=surface*vec3(.017,.028,.052)*night;
  // Lift night exposure for legibility, while suppressing Moon light on the day side.
  color+=surface*vec3(.12,.17,.24)*lunar*(1.-cloud*.55);
  vec3 observer=earthNormal(vec3(0.,0.,1.));
  float ocean=smoothstep(.005,.06,surface.b-surface.r)*(1.-smoothstep(.25,.6,surface.r));
  float sparkle=pow(max(0.,dot(reflect(-sun,n),observer)),38.);
  color+=vec3(.94,.81,.56)*sparkle*ocean*day*.68*eclipseLight;
  float moonSparkle=pow(max(0.,dot(reflect(-moon,n),observer)),58.);
  color+=vec3(.25,.38,.58)*moonSparkle*ocean*lunar*.42;
  vec3 cloudColor=mix(vec3(.025,.045,.08),vec3(.96,.96,.92)*sunlight,day);
  cloudColor+=vec3(.13,.18,.26)*lunar;
  float cloudEdge=(incidence-.035)/.11,cloudSunset=exp(-cloudEdge*cloudEdge);
  cloudColor+=vec3(.18,.071,.018)*cloudSunset;
  color=mix(color,cloudColor,cloud*.79);
  float rim=pow(1.-viewNormal.z,3.8);
  color+=vec3(.04,.24,.56)*rim*(.08+day*.8);
  float terminator=incidence/.07;
  float sunset=exp(-terminator*terminator)*rim;
  color+=vec3(.43,.11,.025)*sunset*.7;
  gl_FragColor=vec4(color,1.);
}`;

// A slowly orbiting camera stays near the reference hemisphere. Following the
// full sidereal rotation here used to cancel the moving day/night terminator.
export function earthViewLongitude(sidereal,reference,yaw=0){return 112*Math.PI/180+Math.sin(sidereal-reference)*.14+Math.sin(yaw)*.06;}
export function initEarth(canvas,{onFailure=()=>{}}={}){
  const gl=createSceneGL(canvas,EARTH_FRAGMENT);let ready=false,shown=false,last=null,reference=null;
  if(!gl){canvas.hidden=true;onFailure();return {visible(){},orient(){},frame(){}};}
  Promise.all([
    gl.texture('earth','./sky/earth-blue-marble.jpg',0),
    gl.texture('lights','./sky/earth-night-2016.jpg',1),
    gl.texture('clouds','./sky/earth-clouds.jpg',2),
    gl.texture('deepSky','./sky/milkyway-gaia.jpg',3),
  ]).then(results=>{ready=results.slice(0,3).every(Boolean);if(!ready){canvas.hidden=true;onFailure();}else if(last)render(last);});
  function render(frame){
    last=frame;if(!shown||!ready||frame.landscape!=='earth'||!frame.skyOnly)return;
    const [w,h]=gl.size(),state=frame.world;if(reference===null)reference=state.sidereal;
    gl.vec2('resolution',w,h);gl.vec3('sun',state.sunEarthFixed);gl.vec3('moon',state.moonEarthFixed);gl.float('moonPhase',state.moon.phase*(state.lunarTransmission??1));
    gl.float('eclipseProgress',state.eclipse?.kind==='solar-eclipse'?state.eclipse.progress:-1);
    setCelestialCamera(gl,frame,w,h);
    const geometry=earthGeometry(w,h);gl.vec3('globe',[geometry.x,h-geometry.y,geometry.radius]);
    gl.float('longitude',earthViewLongitude(state.sidereal,reference,frame.yaw));
    gl.float('cloudDrift',(state.date.getTime()/86400000*.012)%1);
    gl.draw();
  }
  return {frame:render,orient(){},visible(value){shown=value;if(value&&last)render(last);}};
}
