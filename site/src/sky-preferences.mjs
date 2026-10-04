export const SKY_PREFERENCES_KEY='ziwei.sky.preferences.v1';
export const DEFAULT_SKY_PREFERENCES=Object.freeze({opening:true,speed:2,landscape:'mountains',guides:false});
export const TOUR_DURATION=28000;

export function parseSkyPreferences(raw){
  let value;try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch{}
  if(!value||typeof value!=='object')value={};
  return {
    opening:typeof value.opening==='boolean'?value.opening:true,
    speed:[1,2,4].includes(value.speed)?value.speed:2,
    landscape:['mountains','earth'].includes(value.landscape)?value.landscape:'mountains',
    guides:typeof value.guides==='boolean'?value.guides:false,
  };
}
export function shouldPlayOpening(preferences,{reduced=false,home=true}={}){
  return preferences.opening&&!reduced&&home;
}
export function tourProgress(elapsed,duration=TOUR_DURATION){return Math.max(0,Math.min(1,elapsed/duration));}
export function easeInOut(value){return value*value*(3-2*value);}
export function interpolateCamera(from,to,progress){
  const delta=Math.atan2(Math.sin(to.yaw-from.yaw),Math.cos(to.yaw-from.yaw));
  const t=easeInOut(Math.max(0,Math.min(1,progress)));
  return {yaw:from.yaw+delta*t,pitch:from.pitch+(to.pitch-from.pitch)*t,scale:from.scale+(to.scale-from.scale)*t};
}
