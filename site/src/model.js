import { fictionalRule, evaluateRule, resultNames } from './rule-engine.mjs';
export function initModel({api,el,btn}) {
  const root=document.querySelector('#model-use'),status=document.querySelector('#model-status'),fold=window.OpenCC.Converter({from:'t',to:'cn'});
  let generation=0,viewer={},rules=[],offset=0;
  function show(selected){
    root.replaceChildren();const demo=!selected,definition=demo?fictionalRule():selected;
    const form=el('form','model-form'),aside=el('aside','model-result-panel');
    form.append(el('span','workspace-kicker',demo?'虚构示例':'已审核发布'),el('h2','',demo?'青松样本 · 体验规则判断':selected.title),el('p','muted',demo?'这条虚构规则用于体验填写与判断流程。':'填写已知资料；不确定的内容可留空。'));
    const controls={};for(const field of definition.fields){const label=el('label','model-field',field.name),input=el(field.type==='boolean'?'select':'input');
      if(field.type==='boolean'){input.append(new Option('未提供',''),new Option('是','true'),new Option('否','false'));}else{input.type=field.type==='number'?'number':'text';input.maxLength=400;if(field.type==='number')input.step='any';input.placeholder='未提供';}
      input.setAttribute('aria-label',field.name);label.append(input,el('small','muted',field.meaning));controls[field.id]=input;form.append(label);
    }
    const submit=el('button','book-primary','开始判断');submit.type='submit';form.append(submit);
    if(demo)form.append(btn('填入符合示例',()=>{for(const [id,value]of Object.entries({sample:'青松',branches:3,blocked:false}))controls[id].value=String(value);}));
    aside.append(el('span','workspace-kicker','判断结果'),el('h3','','等待你填写案例'),el('p','muted','结果会区分符合、不符合、资料不足和规则待确认。'));
    form.addEventListener('submit',async event=>{event.preventDefault();const run=generation;submit.disabled=true;aside.replaceChildren(el('p','','正在检查…'));const facts={};
      for(const field of definition.fields){const value=controls[field.id].value;if(value!=='')facts[field.id]=field.type==='number'?Number(value):field.type==='boolean'?value==='true':value;}
      try{const value=demo?evaluateRule(definition,facts,fold):await api('/api/model/check',{method:'POST',body:JSON.stringify({id:selected.id,revision:selected.revision,facts})});if(run!==generation)return;
        aside.replaceChildren(el('span','workspace-kicker',demo?'虚构示例结果':'当前发布规则'),el('h3','',resultNames[value.status]||value.status));
        if(value.outcome)aside.append(el('p','model-outcome',value.outcome));
        if(value.reason)aside.append(el('p','',value.reason));
        for(const issue of value.issues||[])aside.append(el('p','',issue));
        if(value.status==='insufficient')aside.append(el('p','muted','请补全缺少的资料后再试。'));
        for(const check of value.checks||[])aside.append(el('p','model-check',`${check.field} · ${check.reason}`));
      }catch(e){if(run===generation)aside.replaceChildren(el('p','rule-warning',e.message));}finally{submit.disabled=false;}
    });root.append(form,aside);
  }
  async function refresh(next=viewer){viewer=next;const run=++generation;status.textContent='正在读取可使用的规则…';root.replaceChildren();
    try{const data=await api(`/api/model/rules?offset=${offset}`);if(run!==generation)return;rules=data.rules;
      const picker=document.querySelector('#model-picker');picker.replaceChildren(new Option('青松样本 · 虚构体验','demo'),...rules.map(r=>new Option(`${r.title}${r.level==='special'?' · 特殊':''}`,r.id)));
      status.textContent=data.total?`当前有 ${data.total} 条已发布规则可用。`:'正式规则尚待审核发布，你可以先体验虚构示例。';
      const pages=document.querySelector('#model-pagination');pages.replaceChildren();if(offset>0)pages.append(btn('上一组规则',()=>{offset=Math.max(0,offset-50);refresh();}));if(offset+rules.length<data.total)pages.append(btn('下一组规则',()=>{offset+=50;refresh();}));
      if(rules.length){picker.value=rules[0].id;show(rules[0]);}else show(null);
    }catch(e){if(run===generation){status.textContent=e.message;show(null);}}
  }
  document.querySelector('#model-picker').addEventListener('change',event=>{++generation;show(rules.find(r=>r.id===event.target.value));});
  return {refresh,clear(){++generation;rules=[];root.replaceChildren();document.querySelector('#model-picker').replaceChildren();}};
}
