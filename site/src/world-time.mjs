import {Observer,Rotation_EQJ_HOR,Rotation_EQJ_EQD,RotateVector,GeoVector,Equator,EquatorFromVector,SiderealTime,HelioVector,Seasons,Body,SearchMoonPhase} from 'astronomy-engine';
import {solarSystemAt,planetsAt} from './sky-ephemeris.mjs';

export const REFERENCE_SITE=Object.freeze({latitude:28,longitude:112,offsetHours:8});
export const DAY_MS=86400000;
const RAD=Math.PI/180;
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function smooth(a,b,x){const t=clamp((x-a)/(b-a));return t*t*(3-2*t);}
export function localHour(date,offset=8){return ((date.getTime()/3600000+offset)%24+24)%24;}
export function atLocalHour(date,hour,offset=8){
  if(!Number.isFinite(hour)||hour<0||hour>24)throw new RangeError('Invalid hour');
  const shifted=new Date(date.getTime()+offset*3600000);
  return new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())+(hour-offset)*3600000);
}
export function horizontalVector(vector,matrix){
  const [x,y,z]=vector;
  return [matrix[0][0]*x+matrix[1][0]*y+matrix[2][0]*z,-(matrix[0][1]*x+matrix[1][1]*y+matrix[2][1]*z),matrix[0][2]*x+matrix[1][2]*y+matrix[2][2]*z];
}
export function lightAt(sunAltitude,moonAltitude,moonPhase){
  const daylight=smooth(-6,15,sunAltitude),night=1-smooth(-16,-5,sunAltitude);
  return {daylight,night,twilight:smooth(-12,-3,sunAltitude)*(1-smooth(3,18,sunAltitude)),moonlight:clamp(moonPhase)*smooth(-3,30,moonAltitude)*(1-daylight)};
}
export function worldAt(date,site=REFERENCE_SITE){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw new TypeError('Invalid observation date');
  const observer=new Observer(site.latitude,site.longitude,0),matrix=Rotation_EQJ_HOR(date,observer).rot,rotation=Rotation_EQJ_EQD(date),sidereal=SiderealTime(date)*15*RAD;
  const bodies=[...solarSystemAt(date),...planetsAt(date)].map(body=>{
    const top=Equator(body.body,date,observer,false,true),n=Math.hypot(top.vec.x,top.vec.y,top.vec.z),vector=[top.vec.x/n,top.vec.y/n,top.vec.z/n];
    const h=horizontalVector(vector,matrix);
    return {...body,ra:top.ra,dec:top.dec,vector,horizontal:h,altitude:Math.asin(clamp(h[2],-1,1))/RAD,azimuth:(Math.atan2(h[1],h[0])/RAD+360)%360};
  });
  const sun=bodies[0],moon=bodies[1],sunOfDate=EquatorFromVector(RotateVector(rotation,GeoVector(Body.Sun,date,true)));
  const lon=sunOfDate.ra*15*RAD-sidereal,dec=sunOfDate.dec*RAD;
  const moonOfDate=EquatorFromVector(RotateVector(rotation,GeoVector(Body.Moon,date,true)));
  const moonLon=moonOfDate.ra*15*RAD-sidereal,moonDec=moonOfDate.dec*RAD;
  const moonEarthFixed=[Math.cos(moonDec)*Math.cos(moonLon),Math.cos(moonDec)*Math.sin(moonLon),Math.sin(moonDec)];
  const earth=HelioVector(Body.Earth,date),hour=localHour(date,site.offsetHours);
  return {date,site,matrix,bodies,sun,moon,sidereal,hour,...lightAt(sun.altitude,moon.altitude,moon.phase),sunEarthFixed:[Math.cos(dec)*Math.cos(lon),Math.cos(dec)*Math.sin(lon),Math.sin(dec)],moonEarthFixed,sunDeclination:sunOfDate.dec,earthDistance:earth.Length(),earthOrbit:[earth.x,earth.y,earth.z]};
}
export function seasonDate(year,season,hour=12){
  const key={spring:'mar_equinox',summer:'jun_solstice',autumn:'sep_equinox',winter:'dec_solstice'}[season];
  if(!key)throw new RangeError('Invalid season');return atLocalHour(Seasons(year)[key].date,hour);
}
export function createWorldClock(now=new Date()){
  let date=atLocalHour(now,19.25),mode='cycle',speed=2,snapshot=worldAt(date),sampled=date.getTime(),elapsed=0;
  function refresh(){snapshot=worldAt(date);sampled=date.getTime();return snapshot;}
  return {
    snapshot:()=>snapshot,
    seek(value){if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw new TypeError('Invalid observation date');date=new Date(value);mode='cycle';return refresh();},
    tick(ms){
      const step=clamp(ms,0,100);elapsed+=step;
      if(mode==='live')date=new Date();
      else date=new Date(date.getTime()+step*(mode==='lunar'?DAY_MS*29.53059/180000:{1:DAY_MS/240000,2:DAY_MS/100000,4:DAY_MS/45000}[speed]));
      if(Math.abs(date.getTime()-sampled)>=15000)refresh();return snapshot;
    },
    hour(value){date=atLocalHour(date,value);mode='cycle';return refresh();},
    season(value){date=seasonDate(date.getUTCFullYear(),value,localHour(date));mode='cycle';return refresh();},
    mode(value){mode=['live','lunar'].includes(value)?value:'cycle';if(mode==='live')date=new Date();return refresh();},
    phase(angle){if(![0,90,180,270].includes(angle))throw new RangeError('Invalid lunar phase');const next=SearchMoonPhase(angle,date,35);if(next){date=next.date;mode='cycle';}return refresh();},
    speed(value){speed=[1,2,4].includes(value)?value:2;},
    restart(){date=atLocalHour(date,19.25);mode='cycle';elapsed=0;return refresh();},
    get modeName(){return mode;},get seconds(){return elapsed/1000;},
  };
}
