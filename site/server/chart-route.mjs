import {HttpError,jsonBody,now,digest} from './security.js';
import {normalizeBirth} from '../src/chart-engine.mjs';
import {CYCLE_SCOPES,cycleBounds,cycleNavigation,checkedCycle,chooseDecade,chooseYear,chooseMonth,chooseDay,stepCycle} from '../src/cycle-navigation.mjs';
import {makeMethodChart,chartPacket} from './chart-public.mjs';
const birthKeys=['date','time','gender','dayDivide','fixLeap','daylight'];
function birthOnly(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!birthKeys.includes(k)))throw new HttpError(400,'仅需出生日期、时间与排盘口径，不接受姓名或附件。');
  try{normalizeBirth(value);}catch{throw new HttpError(400,'请核对出生日期、时间和排盘口径。');}
  return Object.fromEntries(birthKeys.map(k=>[k,value[k]]));
}
export function calculateResponse(body){
  if(!body||Object.keys(body).some(k=>!['birth','stamp','scope','command'].includes(k)))throw new HttpError(400,'排盘请求格式不正确。');
  const birth=birthOnly(body.birth),scope=body.scope||'natal';
  if(!CYCLE_SCOPES.includes(scope))throw new HttpError(400,'请选择有效的运限层级。');
  const result=makeMethodChart(birth),bounds=cycleBounds(result);
  let stamp=body.stamp,command=body.command||{kind:'at'};
  if(!stamp||Object.keys(stamp).some(k=>!['date','time'].includes(k))||typeof stamp.date!=='string'||typeof stamp.time!=='string')throw new HttpError(400,'请提供观察日期和时间。');
  if(!command||Object.keys(command).some(k=>!['kind','unit','value'].includes(k))||!['initialize','at','select','step'].includes(command.kind))throw new HttpError(400,'运限切换方式无效。');
  if(command.kind==='initialize'){
    if(stamp.date<bounds.min)stamp={date:bounds.min,time:'12:00'};
    if(stamp.date>bounds.max)stamp={date:bounds.max,time:'12:00'};
    if(stamp.date===bounds.max&&stamp.time.startsWith('23:')&&birth.dayDivide==='forward')stamp={...stamp,time:'22:59'};
  }
  let cycle;
  try{
    cycle=checkedCycle(result,stamp);
    if(command.kind==='select'){
      const select={decadal:chooseDecade,yearly:chooseYear,monthly:chooseMonth,daily:chooseDay};
      if(!Object.hasOwn(select,command.unit)||!['string','number'].includes(typeof command.value))throw Error();
      if(command.unit==='yearly'&&(!Number.isInteger(command.value)||command.value<1901||command.value>2099))throw Error();
      if(String(command.value).length>24)throw Error();
      stamp=select[command.unit](result,cycle,command.value);cycle=checkedCycle(result,stamp);
    }else if(command.kind==='step')cycle=checkedCycle(result,stepCycle(result,cycle,scope,command.value));
  }catch{throw new HttpError(400,'所选观察时间或运限超出当前命盘范围。');}
  const nav=cycleNavigation(result,cycle),canStep={previous:false,next:false};
  if(scope!=='natal')for(const [key,dir]of [['previous',-1],['next',1]])try{checkedCycle(result,stepCycle(result,cycle,scope,dir));canStep[key]=true;}catch{}
  return {schemaVersion:1,result:chartPacket(result),cycle,nav,bounds,scope,canStep};
}
export async function chartRoute({path,method,request,db}){
  if(path!=='/api/chart/calculate')return null;
  if(method!=='POST')throw new HttpError(405,'请从命盘页面提交排盘请求。');
  // Only a one-minute anonymous rate counter persists; birth data and results are not stored.
  const t=now(),bucket='chart:'+await digest((request.headers.get('cf-connecting-ip')||'local')+':'+Math.floor(t/60));
  const attempt=await db.prepare('INSERT INTO login_attempts (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,t+90).first();
  if(attempt.attempts>120)throw new HttpError(429,'排盘操作较频繁，请稍候再试。');
  await db.prepare('DELETE FROM login_attempts WHERE expires_at<?').bind(t).run();
  const body=await jsonBody(request,2048);
  return calculateResponse(body);
}
