// Screen-space geometry for the approved silk painting. Shared by sky occlusion,
// atmospheric blending and water animation; this is an artistic landscape.
export const SHANHE_URL='./sky/shanhe-silk.png';
const ridge=[
  [0,.15],[.02,.205],[.043,.172],[.055,.168],[.071,.179],[.088,.258],
  [.113,.185],[.135,.178],[.145,.154],[.165,.137],[.176,.145],[.187,.22],
  [.20,.254],[.214,.244],[.23,.31],[.25,.332],[.278,.302],[.292,.236],
  [.300,.24],[.317,.287],[.325,.327],[.36,.351],[.392,.297],[.404,.278],
  [.411,.299],[.419,.289],[.443,.337],[.453,.332],[.466,.367],[.487,.389],
  [.502,.384],[.518,.401],[.557,.405],[.579,.373],[.589,.375],[.597,.316],
  [.606,.344],[.616,.373],[.633,.348],[.645,.343],[.655,.313],[.666,.335],
  [.686,.384],[.702,.349],[.719,.377],[.734,.269],[.746,.253],[.754,.225],
  [.765,.228],[.780,.278],[.803,.317],[.823,.338],[.837,.389],[.849,.32],
  [.865,.325],[.881,.289],[.893,.224],[.902,.179],[.914,.194],[.928,.141],
  [.934,.098],[.945,.081],[.957,.067],[.967,.082],[.978,.078],[.99,.129],[1,.121],
];
export const SHANHE_RIVER=Object.freeze([
  [.46,.514,.006],[.49,.541,.010],[.514,.518,.012],[.54,.519,.013],
  [.572,.553,.017],[.60,.527,.019],[.633,.497,.022],[.668,.547,.028],
  [.705,.640,.035],[.746,.722,.042],[.786,.735,.046],[.832,.679,.044],
  [.878,.611,.037],[.923,.612,.027],[.963,.628,.026],[1,.596,.026],
].map(Object.freeze));
const clamp=x=>Math.max(0,Math.min(1,x));
export function shanheRidge(x){
  x=clamp(x);const i=ridge.findIndex(p=>p[0]>=x);
  if(i<=0)return ridge[0][1];const a=ridge[i-1],b=ridge[i];
  return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
}
export function shanheLandAlpha(x,y){
  const t=clamp((y-shanheRidge(x)+.009)/.018);
  return Math.round(t*t*(3-2*t)*255);
}
export function shanheRiver(y){
  const i=SHANHE_RIVER.findIndex(p=>p[0]>=y);
  if(i===0)return SHANHE_RIVER[0].slice(1);
  if(i<0)return SHANHE_RIVER.at(-1).slice(1);
  const a=SHANHE_RIVER[i-1],b=SHANHE_RIVER[i],t=clamp((y-a[0])/(b[0]-a[0])),s=t*t*(3-2*t);
  return [a[1]+(b[1]-a[1])*s,a[2]+(b[2]-a[2])*s];
}
const number=n=>Number(n).toFixed(6);
export const SHANHE_WATER_GLSL=`
vec2 shanheChannel(float y){
${SHANHE_RIVER.slice(1).map((b,i)=>{
  const a=SHANHE_RIVER[i];return `if(y<${number(b[0])})return mix(vec2(${number(a[1])},${number(a[2])}),vec2(${number(b[1])},${number(b[2])}),smoothstep(${number(a[0])},${number(b[0])},y));`;
}).join('\n')}
return vec2(${SHANHE_RIVER.at(-1).slice(1).map(number).join(',')});
}
float shanheWater(vec2 uv){
  vec2 river=shanheChannel(uv.y);
  return (1.-smoothstep(.55,1.,abs(uv.x-river.x)/river.y))*smoothstep(.46,.50,uv.y);
}`;
