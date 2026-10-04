import {SCOPE_NAMES} from './chart-engine.mjs';
import {requestChart} from './chart-service.mjs';
import {initCyclePanel} from './cycle-panel.mjs';
import {CYCLE_SCOPES,HOURS,deviceNow,cycleBounds,cycleNavigation,chooseDecade,chooseYear,chooseMonth,chooseDay,stepCycle,checkedCycle} from './cycle-navigation.mjs';

export function initCycleControls({getResult,onChange}){
  const $=s=>document.querySelector(s),dock=$('#cycle-dock');
  const compact=matchMedia('(max-width:700px)');
  let scope='natal',cycle=null,nav=null,timer=null,pickersOpen=!compact.matches,generation=0,pending=null,canStep=null;
  const panel=initCyclePanel({dock,onOpen(){pickersOpen=true;render();}});
  const selectors=['decadal','yearly','monthly','daily','hourly'];
  const fields=Object.fromEntries(selectors.map(s=>[s,$(`#cycle-${s}`)]));
  const report=(text,error=false)=>{if(error)panel.error();const status=$('#cycle-status');status.textContent=text;status.classList.toggle('error',error);};
  function stopFollowing(){clearTimeout(timer);timer=null;$('#cycle-follow').checked=false;}
  function schedule(){clearTimeout(timer);if($('#cycle-follow').checked)timer=setTimeout(tick,60000-Date.now()%60000+50);}
  function tick(){if(!$('#cycle-follow').checked)return;if(document.visibilityState==='visible')jumpNow(true);else schedule();}
  function options(select,items,value){
    select.replaceChildren(...items.map(item=>new Option(item.label,String(item.value))));
    select.value=String(value??'');
  }
  function render(){
    if(!cycle||!getResult())return;
    const result=getResult();if(result.provider!=='public-server')nav=cycleNavigation(result,cycle);
    const rank=CYCLE_SCOPES.indexOf(scope),d=nav.decade;
    panel.update({name:scope==='decadal'&&cycle.decadal.name==='童限'?'童限':SCOPE_NAMES[scope],note:scope==='natal'?'':scope==='decadal'?d.label:scope==='yearly'?`${nav.lunar.year}年 · ${cycle.yearly.heavenlyStem}${cycle.yearly.earthlyBranch}`:scope==='monthly'?`${nav.lunar.year}年 ${nav.lunar.monthLabel}`:`${cycle.date}${scope==='hourly'?' '+cycle.time:''}`});
    dock.querySelectorAll('[data-cycle-scope]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.cycleScope===scope));});
    selectors.forEach((s,i)=>{fields[s].closest('label').hidden=rank<i+1;});
    options(fields.decadal,nav.decades.map(d=>({label:d.label,value:d.key})),d?.key);
    options(fields.yearly,nav.years.map(y=>({label:y.label,value:y.year})),nav.lunar.year);
    options(fields.monthly,nav.months.map(m=>({label:m.label,value:m.key})),nav.month?.key);
    options(fields.daily,nav.days.map(d=>({label:d.label,value:d.date})),cycle.effectiveDate);
    options(fields.hourly,HOURS.map((h,i)=>({label:h.label,value:i})),nav.hour);
    $('#cycle-date').value=cycle.date;$('#cycle-time').value=cycle.time;
    $('#cycle-summary').textContent=scope==='natal'?'本命十二宫 · 点击宫内年龄段，进入对应大限':`${d?.label||cycle.decadal.name} / ${nav.lunar.year}年 ${nav.lunar.monthLabel}${nav.lunar.dayLabel} / ${cycle.time}`;
    $('#chart-layer-label').textContent=SCOPE_NAMES[scope]+(scope==='natal'?'十二宫':'叠盘');
    $('#cycle-step-label').textContent=scope==='natal'?'本命为底盘':scope==='decadal'?`${d.label} · ${d.yearRange.join('–')}年`:`${SCOPE_NAMES[scope]} · ${scope==='yearly'?nav.lunar.year+' '+cycle.yearly.heavenlyStem+cycle.yearly.earthlyBranch:scope==='monthly'?nav.lunar.monthLabel:scope==='daily'?nav.lunar.dayLabel:HOURS[nav.hour].label}`;
    $('#cycle-pickers').hidden=!pickersOpen;
    $('#cycle-picker-toggle').setAttribute('aria-expanded',String(pickersOpen));
    $('#cycle-picker-toggle').setAttribute('aria-label',pickersOpen?'收起时间选择':'展开时间选择');
    for(const [id,dir,word] of [['#cycle-prev',-1,'上'],['#cycle-next',1,'下']]){
      const b=$(id);b.setAttribute('aria-label',`${word}一${scope==='decadal'?'大限':scope==='yearly'?'流年':scope==='monthly'?'流月':scope==='daily'?'流日':'时辰'}`);
      b.disabled=scope==='natal';
      if(!b.disabled){if(result.provider==='public-server')b.disabled=!canStep?.[dir<0?'previous':'next'];else try{checkedCycle(result,stepCycle(result,cycle,scope,dir));}catch{b.disabled=true;}}
    }
    $('#cycle-time-note').textContent=`观察：${cycle.date} ${cycle.time}${cycle.effectiveDate!==cycle.date?' · 晚子时按 '+cycle.effectiveDate+' 计算':''}`;
    $('#cycle-lunar-note').textContent='农历正月初一换年 · 闰月按十五日分段 · 年龄为虚岁';
    if(scope==='natal')report('选择层级或点击宫内大限，可叠加对应十二宫、四化与流曜。');
    else{
      const layer=cycle[scope];report(`${scope==='decadal'&&layer.name==='童限'?'童限':SCOPE_NAMES[scope]}四化：${layer.mutagen.map((s,i)=>s+'化'+['禄','权','科','忌'][i]).join(' · ')}。`);
    }
    $('#cycle-position').hidden=scope==='natal';
  }
  async function apply(stamp,nextScope=scope,{follow=false,command={kind:'at'}}={}){
    const result=getResult();if(!result)return false;
    const requestId=++generation;pending?.abort();pending=new AbortController();
    try{
      if(!CYCLE_SCOPES.includes(nextScope))throw Error('无效的运限层级。');
      if(!follow)stopFollowing();
      let next;
      if(result.provider==='public-server'){
        report('正在计算所选运限…');dock.setAttribute('aria-busy','true');
        const data=await requestChart(result.input,{stamp,scope:nextScope,command,signal:pending.signal});
        if(requestId!==generation||result!==getResult())return false;
        if(data.result.version!==result.version)throw Error('安星版本已更新，请重新起盘。');
        next=data.cycle;nav=data.nav;canStep=data.canStep;
      }else next=checkedCycle(result,stamp);
      cycle=next;scope=nextScope;render();onChange({cycle,scope});return true;
    }catch(e){if(requestId===generation){report(`${e.message} 当前命盘未切换。`,true);if(follow)stopFollowing();}return false;}
    finally{if(requestId===generation){pending=null;dock.removeAttribute('aria-busy');}}
  }
  function act(makeStamp,nextScope=scope,command={kind:'at'}){
    if(!getResult()||!cycle)return false;
    try{return apply(getResult().provider==='public-server'?{date:cycle.date,time:cycle.time}:makeStamp(),nextScope,{command});}catch(e){report(`${e.message} 当前命盘未切换。`,true);return false;}
  }
  async function jumpNow(follow=false){
    const now=deviceNow();
    if(compact.matches)pickersOpen=false;
    const success=await apply(now,'hourly',{follow});
    if(success){$('#cycle-follow').checked=follow;if(follow)schedule();}
    return success;
  }
  dock.querySelectorAll('[data-cycle-scope]').forEach(b=>b.addEventListener('click',async()=>{
    pickersOpen=!compact.matches;
    if(cycle&&await apply({date:cycle.date,time:cycle.time},b.dataset.cycleScope))panel.close();
  }));
  $('#cycle-picker-toggle').addEventListener('click',()=>{pickersOpen=!pickersOpen;render();});
  compact.addEventListener('change',()=>{pickersOpen=!compact.matches;render();});
  fields.decadal.addEventListener('change',()=>act(()=>chooseDecade(getResult(),cycle,fields.decadal.value),'decadal',{kind:'select',unit:'decadal',value:fields.decadal.value}));
  fields.yearly.addEventListener('change',()=>act(()=>chooseYear(getResult(),cycle,Number(fields.yearly.value)),'yearly',{kind:'select',unit:'yearly',value:Number(fields.yearly.value)}));
  fields.monthly.addEventListener('change',()=>act(()=>chooseMonth(getResult(),cycle,fields.monthly.value),'monthly',{kind:'select',unit:'monthly',value:fields.monthly.value}));
  fields.daily.addEventListener('change',()=>act(()=>chooseDay(getResult(),cycle,fields.daily.value),'daily',{kind:'select',unit:'daily',value:fields.daily.value}));
  fields.hourly.addEventListener('change',()=>{if(cycle)apply({date:cycle.date,time:HOURS[Number(fields.hourly.value)].value},'hourly');});
  $('#cycle-prev').addEventListener('click',()=>act(()=>stepCycle(getResult(),cycle,scope,-1),scope,{kind:'step',value:-1}));
  $('#cycle-next').addEventListener('click',()=>act(()=>stepCycle(getResult(),cycle,scope,1),scope,{kind:'step',value:1}));
  $('#cycle-now').addEventListener('click',()=>jumpNow());
  $('#cycle-follow').addEventListener('change',()=>{$('#cycle-follow').checked?jumpNow(true):stopFollowing();});
  $('#cycle-date-apply').addEventListener('click',async()=>{if(await apply({date:$('#cycle-date').value,time:$('#cycle-time').value},scope==='natal'?'hourly':scope))panel.close();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&$('#cycle-follow').checked)tick();});
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'设备时区';
  $('#cycle-clock-note').textContent=`“今时今日”采用设备钟表时间（${timezone}）；不会改动出生资料。手动日期也按所填钟表时间计算。`;
  function clear(){
    panel.clear();
    stopFollowing();++generation;pending?.abort();pending=null;dock.removeAttribute('aria-busy');cycle=null;nav=null;scope='natal';
    dock.querySelectorAll('button,input,select').forEach(e=>{e.disabled=true;});
    $('#cycle-date').value='';$('#cycle-time').value='';
    selectors.forEach(s=>fields[s].replaceChildren());
    dock.querySelectorAll('[data-cycle-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cycleScope==='natal')));
    $('#cycle-summary').textContent='起盘后可选择本命与各层运限。';$('#cycle-step-label').textContent='等待起盘';$('#cycle-time-note').textContent='';$('#cycle-position').hidden=true;report('');
  }
  return {
    initialize(){
      panel.close();
      stopFollowing();++generation;pending?.abort();pending=null;dock.removeAttribute('aria-busy');
      const result=getResult(),{min,max}=result.provider==='public-server'?result.remote.bounds:cycleBounds(result);
      dock.querySelectorAll('button,input,select').forEach(e=>{e.disabled=false;});
      $('#cycle-date').min=min;$('#cycle-date').max=max;
      if(result.provider==='public-server'){
        cycle=result.remote.cycle;nav=result.remote.nav;canStep=result.remote.canStep;scope='natal';render();onChange({cycle,scope});return true;
      }
      const now=deviceNow();if(now.date<min||now.date>max){now.date=now.date<min?min:max;now.time='12:00';}
      if(now.date===max&&now.time.startsWith('23:')&&result.config.dayDivide==='forward')now.time='22:59';
      return apply(now,'natal');
    },
    selectDecade(index){if(compact.matches)pickersOpen=false;return act(()=>chooseDecade(getResult(),cycle,index),'decadal',{kind:'select',unit:'decadal',value:index});},
    selectPeriod(date,unit){return apply({date,time:'12:00'},unit);},
    get decadeKeys(){return new Set(nav?.decades.map(d=>d.key)||[]);},
    mount:panel.mount,
    close:panel.close,
    clear
  };
}
