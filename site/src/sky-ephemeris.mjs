import {Body,GeoVector,EquatorFromVector,Illumination,Libration,RotationAxis,MoonPhase} from 'astronomy-engine';
export const VISIBLE_PLANETS=Object.freeze([
  {body:Body.Mercury,name:'水星',modern:'Mercury · 辰星',color:'#d4ccc1'},
  {body:Body.Venus,name:'金星',modern:'Venus · 太白',color:'#fff1cd'},
  {body:Body.Mars,name:'火星',modern:'Mars · 荧惑',color:'#efb096'},
  {body:Body.Jupiter,name:'木星',modern:'Jupiter · 岁星',color:'#e9cfaa'},
  {body:Body.Saturn,name:'土星',modern:'Saturn · 镇星',color:'#dbc48f'},
]);
export function lunarPhaseName(angle){const a=(angle%360+360)%360;return a<5||a>=355?'新月':a<86?'娥眉月':a<=94?'上弦月':a<175?'盈凸月':a<=185?'满月':a<266?'亏凸月':a<=274?'下弦月':'残月';}
export function planetsAt(date){
  return VISIBLE_PLANETS.map(planet=>{const v=GeoVector(planet.body,date,true),eq=EquatorFromVector(v),light=Illumination(planet.body,date),length=v.Length();return {...planet,id:planet.body,planet:true,ra:eq.ra,dec:eq.dec,distance:null,distanceKm:eq.dist*149597870.7,mag:light.mag,phase:light.phase_fraction,observedAt:date.toISOString(),vector:[v.x/length,v.y/length,v.z/length]};});
}

export function solarSystemAt(date=new Date()){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw new TypeError('Invalid observation date');
  return [Body.Sun,Body.Moon].map(body=>{
    const v=GeoVector(body,date,true),eq=EquatorFromVector(v),light=Illumination(body,date);
    const length=Math.hypot(v.x,v.y,v.z);
    const lunar=body===Body.Moon?Libration(date):null,axis=lunar?RotationAxis(Body.Moon,date).north:null;
    return {id:body,body,ra:eq.ra,dec:eq.dec,distance:null,distanceKm:eq.dist*149597870.7,
      mag:light.mag,phase:light.phase_fraction,observedAt:date.toISOString(),
      ...(lunar?{phaseAngle:MoonPhase(date),phaseName:lunarPhaseName(MoonPhase(date)),libration:{longitude:lunar.elon,latitude:lunar.elat},pole:[axis.x,axis.y,axis.z]}:{}),
      vector:[v.x/length,v.y/length,v.z/length],name:body===Body.Sun?'太阳':'月球',
      modern:body===Body.Sun?'Sun · 太阳系恒星':'Moon · 地球天然卫星',color:body===Body.Sun?'#fff1bf':'#e1eafa'};
  });
}
