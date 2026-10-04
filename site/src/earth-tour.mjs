import {Body,Observer,SearchRiseSet} from 'astronomy-engine';
import {REFERENCE_SITE,DAY_MS,atLocalHour,worldAt,smooth,clamp} from './world-time.mjs';

// Choose a real nearby night with a visible Moon that sets before sunrise.
// The displayed calendar date follows this selection; live mode never uses it.
export function earthTourPlan(date){
  const observer=new Observer(REFERENCE_SITE.latitude,REFERENCE_SITE.longitude,0);
  for(let day=0;day<32;day++){
    const evening=atLocalHour(new Date(date.getTime()+day*DAY_MS),19);
    const setting=SearchRiseSet(Body.Moon,observer,-1,evening,1.2)?.date;
    const rising=SearchRiseSet(Body.Sun,observer,1,evening,1.2)?.date;
    if(!setting||!rising)continue;
    const start=new Date(setting.getTime()-3*3600000),night=worldAt(start);
    if(start<evening||setting.getTime()>rising.getTime()-3600000||night.sun.altitude>-16||night.moon.altitude<15||night.moon.phase<.35)continue;
    return {start,setting,rising,end:new Date(rising.getTime()+2.4*3600000)};
  }
  throw new Error('No Moon-to-dawn window at the reference site');
}
export function earthTourDate(plan,progress){
  const p=clamp(progress),knots=[[0,plan.start],[.40,new Date(plan.setting.getTime()+.22*3600000)],[.65,new Date(plan.rising.getTime()-.45*3600000)],[.80,new Date(plan.rising.getTime()+.3*3600000)],[1,plan.end]];
  const i=Math.min(3,knots.findIndex((k,n)=>n<4&&p<=knots[n+1][0]));
  const [a,from]=knots[Math.max(0,i)],[b,to]=knots[Math.max(0,i)+1],t=(p-a)/(b-a);
  // Blended easing retains forward motion through all the chapter boundaries.
  const eased=.55*t+.45*t*t*(3-2*t);
  return new Date(from.getTime()+(to-from)*eased);
}
export function earthTourCamera(state,{horizonPitch,progress=null,moonStartAltitude=25}={}){
  const rad=Math.PI/180,moon=state.moon.azimuth*rad,sun=state.sun.azimuth*rad;
  const blend=progress===null?(state.sun.altitude>-13||state.moon.altitude<-12?1:0):smooth(.42,.58,progress);
  const delta=Math.atan2(Math.sin(sun-moon),Math.cos(sun-moon));
  const lift=progress===null?0:Math.max(0,moonStartAltitude*rad-horizonPitch-.12)*(1-smooth(0,.40,progress));
  return {yaw:moon+delta*blend,pitch:horizonPitch+lift};
}
