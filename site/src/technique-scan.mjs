import {cycleAt} from './chart-engine.mjs';
import {decadeChoices,yearChoices,monthChoices} from './cycle-navigation.mjs';
import {requestChart} from './chart-service.mjs';
import {palaceFlights} from './chart-insights.mjs';
export function initTechniqueScan(getResult,getCycle=()=>null){
  document.addEventListener('ziwei:scan-technique',event=>{
    const d=event.detail;d.handled=true;
    (async()=>{
      const result=getResult();if(!result)throw Error('请先在紫微命盘中起盘，再回来筛选。');
      const remote=result.provider==='public-server';if(d.localOnly&&remote)throw Error('本机私密技法请先选择公开浏览器算法起盘，计算全程留在本机。');
      const flightData=r=>d.needsFlights?Array.from({length:12},(_,i)=>palaceFlights(r,i)):undefined;
      const localFlights=remote?undefined:flightData(result);
      const check=()=>{if(d.signal.aborted||getResult()!==result)throw Error('筛选已停止或命盘已变化。');};
      if(d.unit==='current'){
        const cycle=getCycle();if(!cycle)throw Error('请先完成起盘并选择观察时间。');
        check();await d.onPeriod({label:'当前命盘',start:cycle.date,end:cycle.date,time:cycle.time,chart:result.chart,cycle,flights:flightData(result)});
        check();if(getCycle()!==cycle)throw Error('观察时间已变化，请重新判断。');return;
      }
      const send=async period=>{check();let chart=result.chart,cycle,flights=localFlights;
        if(remote){await new Promise(resolve=>setTimeout(resolve,650));check();const p=await requestChart(result.input,{stamp:{date:period.start,time:'12:00'},scope:d.unit,signal:d.signal});chart=p.result.chart;cycle=p.cycle;flights=flightData(p.result);}
        else cycle=cycleAt(result,period.start,'12:00');
        check();await d.onPeriod({...period,chart,cycle,flights});
      };
      if(!remote){
        const years=decadeChoices(result).flatMap(decade=>yearChoices(result,decade)).filter(y=>y.year>=d.first&&y.year<=d.last);
        if(!years.length)throw Error('所选年份超出此命盘可计算范围。');
        for(const year of years){if(d.unit==='yearly')await send(year);else for(const month of monthChoices(result,year.year))await send({...month,label:`${year.year} 年 · ${month.label}`});await new Promise(resolve=>setTimeout(resolve,0));}
      }else{
        for(let year=d.first;year<=d.last;year++){
          check();const date=`${year}-06-15`;if(date<result.normalized.date&&year<Number(result.normalized.date.slice(0,4)))continue;
          const p=await requestChart(result.input,{stamp:{date:date<result.normalized.date?result.normalized.date:date,time:'12:00'},scope:d.unit,command:{kind:'select',unit:'yearly',value:year},signal:d.signal});
          const period=p.nav.years.find(y=>y.year===year);if(!period)throw Error('所选年份超出此命盘可计算范围。');
          if(d.unit==='yearly'){check();await d.onPeriod({...period,chart:p.result.chart,cycle:p.cycle,flights:flightData(p.result)});}
          else for(const month of p.nav.months)await send({...month,label:`${year} 年 · ${month.label}`});
        }
      }
    })().then(d.resolve,d.reject);
  });
}
