const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};

// Fraction of a unit luminous disk covered by an opaque circle.
export function diskCoverage(distance,radius=1){
  const d=Math.abs(distance),r=radius;
  if(d>=1+r)return 0;
  if(d<=Math.abs(1-r))return Math.min(1,r*r);
  const a=Math.acos(clamp((d*d+1-r*r)/(2*d),-1,1));
  const b=Math.acos(clamp((d*d+r*r-1)/(2*d*r),-1,1));
  return clamp((a+r*r*b-.5*Math.sqrt(Math.max(0,(-d+1+r)*(d+1-r)*(d-1+r)*(d+1+r))))/Math.PI);
}

export function eclipseGeometry(kind,progress){
  const p=clamp(progress),solar=kind==='solar-eclipse',radius=solar?1.045:2.45;
  const reach=solar?2.5:3.9;
  const offset=p<.43?-reach*(1-smooth(p/.43)):p>.57?reach*smooth((p-.57)/.43):0;
  const coverage=diskCoverage(offset,radius);
  const stage=coverage>.999?'食甚':coverage<.002?(p<.5?'即将初亏':'复圆'):p<.5?'渐入阴影':'渐出阴影';
  return {kind,progress:p,offset,radius,coverage,stage};
}

export function eclipseWorld(world,effect){
  if(!effect||!effect.kind?.endsWith('-eclipse'))return world;
  const solar=effect.kind==='solar-eclipse',coverage=effect.coverage;
  const light=solar?1-.992*Math.pow(coverage,3):1;
  return {...world,daylight:world.daylight*light,night:Math.max(world.night,solar?coverage**7:0),
    twilight:solar?Math.max(world.twilight,.42*coverage):world.twilight,
    moonlight:world.moonlight*(solar?1:1-.93*coverage),
    eclipse:effect,solarTransmission:light,lunarTransmission:solar?1:1-.93*coverage};
}

// A halo is a cone around the Moon, not a circle of arbitrary screen pixels.
export function haloDirections(center,degrees=22,steps=128){
  const n=unit(center),ref=Math.abs(n[2])>.9?[1,0,0]:[0,0,1];
  const u=unit([n[1]*ref[2]-n[2]*ref[1],n[2]*ref[0]-n[0]*ref[2],n[0]*ref[1]-n[1]*ref[0]]);
  const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
  const a=degrees*Math.PI/180;
  return Array.from({length:steps+1},(_,i)=>n.map((x,j)=>x*Math.cos(a)+(u[j]*Math.cos(i*Math.PI*2/steps)+v[j]*Math.sin(i*Math.PI*2/steps))*Math.sin(a)));
}

export function showerTrack(index){
  const angle=.10+((index*.61803398875)%1)*Math.PI*.86;
  return {dx:Math.cos(angle),dy:Math.sin(angle),start:(index*.731)%16,duration:.85+(index*.137)%1.45,from:.035+(index*.071)% .13};
}

export const ALIGNMENT_DATE='2022-06-24T21:00:00Z';

export function fitAlignmentCamera(vectors,width,height){
  const sum=vectors.reduce((s,v)=>s.map((x,i)=>x+v[i]),[0,0,0]);
  const yaw=Math.atan2(sum[1],sum[0]),pitch=Math.atan2(sum[2],Math.hypot(sum[0],sum[1]));
  const targetWidth=width*(width<700?.80:.44),targetHeight=height*(width/height<.7?.28:.23),centerY=height*.28;
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  const q=vectors.map(([x,y,z])=>{const front=cp*cy*x+cp*sy*y+sp*z;return [(-sy*x+cy*y)/front,(-sp*cy*x-sp*sy*y+cp*z)/front];});
  const xs=q.map(v=>v[0]),ys=q.map(v=>v[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const f=Math.min(targetWidth/(maxX-minX),targetHeight/(maxY-minY));
  return {yaw,pitch,scale:f/(Math.max(width,height)*.7),center:[.5-(minX+maxX)*.5*f/width,centerY/height+(minY+maxY)*.5*f/height]};
}
