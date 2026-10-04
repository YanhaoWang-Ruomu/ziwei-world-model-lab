import {clamp} from './world-time.mjs';

export function scenicRect(base,width,height,{x=0,y=0,travel=0}={}){
  const zoom=1.065+clamp(travel)*.16,w=base.width*zoom,h=base.height*zoom;
  return {width:w,height:h,left:(width-w)/2-x*Math.min(24,width*.018),top:height-h+18+y*6-clamp(travel)*12};
}
export function foregroundRect(width,height,{x=0,y=0,travel=0}={}){
  const w=width*(1.07+clamp(travel)*.22),h=width>640?height*(1.07+clamp(travel)*.22):w*941/1672;
  return {width:w,height:h,left:(width-w)/2-x*Math.min(65,width*.065),top:height-h+32+y*17-clamp(travel)*17};
}
export function createPresence(){
  let target={x:0,y:0,travel:0},current={...target},pulse=null,age=0;
  return {
    point(x,y){target.x=clamp(x,-1,1);target.y=clamp(y,-1,1);},
    dolly(delta){target.travel=clamp(target.travel+delta);},
    travel(value){target.travel=clamp(value);},
    reset(){target={x:0,y:0,travel:0};},
    ripple(x,y,star=false){pulse={x:clamp(x),y:clamp(y),star};age=0;},
    tick(ms,{reduced=false,animate=true}={}){
      if(reduced){target.x=target.y=0;current={...target};pulse=null;}
      const mix=1-Math.exp(-Math.min(ms,80)/180);
      for(const key of ['x','y','travel'])current[key]+=(target[key]-current[key])*mix;
      if(pulse&&animate)age+=Math.min(ms,80)/1000;
      if(age>4.8)pulse=null;
      return {...current,pulse:pulse?{...pulse,age}:null,reduced};
    },
    get moving(){return ['x','y','travel'].some(k=>Math.abs(current[k]-target[k])>.001)||Boolean(pulse);},
  };
}
