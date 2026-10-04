import {horizontalVector} from './world-time.mjs';

export function celestialUV(vector){
  const [x,y,z]=vector,n=Math.hypot(x,y,z);
  return [((.5-Math.atan2(y,x)/(Math.PI*2))%1+1)%1,.5-Math.asin(Math.max(-1,Math.min(1,z/n)))/Math.PI];
}

// NASA SVS 4851: J2000, RA zero at image centre, increasing to the left.
// The diffuse map omits bright Hipparcos/Tycho stars; interactive stars remain HYG.
export const DEEP_SKY_GLSL=`
uniform sampler2D deepSky;
uniform vec3 cameraRight,cameraUp,cameraForward,equatorialX,equatorialY,equatorialZ;
uniform vec3 skySun;
uniform float focal;
uniform vec2 skyCenter;
vec3 celestialRay(vec2 screen,vec2 viewport){
  vec2 xy=vec2((screen.x-skyCenter.x)*viewport.x,(skyCenter.y-screen.y)*viewport.y)/focal;
  return normalize(cameraRight*xy.x+cameraUp*xy.y+cameraForward);
}
vec3 deepSkyColor(vec3 ray){
  vec3 eq=vec3(dot(ray,equatorialX),dot(ray,equatorialY),dot(ray,equatorialZ));
  vec2 uv=vec2(fract(.5-atan(eq.y,eq.x)/6.28318530718),.5-asin(clamp(eq.z,-1.,1.))/3.14159265359);
  vec3 raw=texture2D(deepSky,uv).rgb;
  float light=dot(raw,vec3(.2126,.7152,.0722));
  vec3 silver=mix(raw,vec3(light)*vec3(.79,.90,1.12),.28);
  float solarGlare=1.-smoothstep(.93,.9998,dot(ray,skySun))*.80;
  return pow(max(silver-vec3(.03),vec3(0.)),vec3(1.5))*.86*solarGlare;
}
`;

export function setCelestialCamera(gl,frame,width,height){
  const {yaw,pitch,scale,world}=frame;
  gl.float('focal',Math.max(width,height)*.7*scale);
  gl.vec2('skyCenter',...(frame.skyCenter||[.5,.4]));
  gl.vec3('cameraRight',[-Math.sin(yaw),Math.cos(yaw),0]);
  gl.vec3('cameraUp',[-Math.sin(pitch)*Math.cos(yaw),-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch)]);
  gl.vec3('cameraForward',[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)]);
  gl.vec3('skySun',frame.depth?[0,0,0]:horizontalVector(world.sun.vector,world.matrix));
  for(const [name,vector] of [['equatorialX',[1,0,0]],['equatorialY',[0,1,0]],['equatorialZ',[0,0,1]]])gl.vec3(name,frame.depth?vector:horizontalVector(vector,world.matrix));
}
