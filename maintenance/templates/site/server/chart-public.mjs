// Independent public adapter. The owner's private method is intentionally absent.
import {makeChart} from '../src/chart-engine.mjs';
export function makeMethodChart(input){
  return {...makeChart(input),provider:'public-server',method:{id:'iztro-public',name:'公开算法',supplement:'使用 iztro 公开算法；不含站点所有者的私有安星方法。'}};
}
export function chartPacket(result){
  const {engine,...packet}=result;
  return packet;
}
