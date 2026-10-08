import {aiJournal} from './local-ai.js';
import {callPersonalAi,personalAiStatus} from './personal-ai.js';
import {MAX_STEPS,referenceOnly,parseAgentAction} from './research-agent-contracts.mjs';
export function initResearchAgent({api,el,btn}){
  const root=el('section','local-ai-panel research-agent'),goal=el('textarea'),provider=el('select'),confirm=el('input'),save=el('input'),status=el('p'),output=el('div'),history=el('div'),followup=el('input');root.id='research-agent';
  let viewer={},epoch=0,run=null,busy=false,starting=false,controller=null;
  goal.maxLength=400;goal.placeholder='例如：比较公开书库中同一术语的不同解释，标明书名、页码和分歧。';goal.setAttribute('aria-label','AI 研究目标');
  provider.setAttribute('aria-label','研究使用的 AI');provider.append(new Option('我的 API · 使用账户当前配置','personal'),new Option('本站千问 · 核心账户','qwen'));confirm.type=save.type='checkbox';
  const check=(input,text)=>{const label=el('label','review-check');label.append(input,document.createTextNode(text));return label;};
  followup.maxLength=200;followup.placeholder='补充 AI 提出的澄清问题';followup.setAttribute('aria-label','补充研究说明');
  const configLink=el('a','book-secondary','配置 / 解锁我的 API ↗');configLink.href='#account';configLink.onclick=()=>setTimeout(()=>document.querySelector('#personal-ai-settings')?.scrollIntoView(),100);
  root.append(el('p','panel-overline','AI RESEARCH'),el('h2','','AI 研究对话'),el('p','muted','告诉 AI 你要查什么。它会选择检索词、查阅公开书库、必要时向你提问，并把结论对应到原页。每轮最多 4 次模型调用。只处理公开研究问题，不上传个人命例或私密技法。'),configLink,provider,goal,
    check(confirm,'确认问题和补充说明均可公开，同意向所选服务商发送问题与公开选段，可能产生调用费用。'),check(save,'加密保存研究进度（先在下方解锁本机 AI 研究册）'));
  status.setAttribute('role','status');
  const safely=fn=>async()=>{try{await fn();}catch(e){status.textContent=e.message;}};
  const checkpoint=async()=>{if(run?.saved)await aiJournal.put(structuredClone(run));};
  async function access(){const ticket=epoch,s=await api('/api/session');if(ticket!==epoch||!s.authenticated||s.userId!==viewer.userId)throw Error('账户已变化，请重新登录。');return ticket;}
  function render(){
    output.replaceChildren();if(!run)return;
    output.append(el('h3','',run.goal));
    for(const event of run.events||[]){const row=el('article','agent-step');row.append(el('strong','',event.action==='search'?'检索公开书库':event.action==='clarify'?'AI 需要你补充':'研究草稿已生成'));if(event.query)row.append(el('p','',event.query+` · 找到 ${event.count} 段候选依据`));if(event.question)row.append(el('p','',event.question));output.append(row);}
    if(run.result){for(const c of run.result.claims){const source=run.citations[c.source-1];const row=el('article','library-citation');row.append(el('p','',c.text),el('blockquote','',c.quote),el('small','',`${source.title} · 第 ${source.page} 页 / 段`));output.append(row);}for(const item of run.result.uncertainties)output.append(el('p','tech-unresolved',item));output.append(el('p','local-ai-warning','这是待核对的研究草稿。引用检查只能确认原文存在，不能保证解释正确。'));}
    if(run.status==='clarify'&&run.step<MAX_STEPS)output.append(followup,btn('补充并继续',safely(async()=>{if(busy)return;if(!confirm.checked)throw Error('请确认补充内容可公开。');if(!followup.value.trim())throw Error('请填写补充说明。');if(run.followups.length>=3)throw Error('已达到本轮补充次数，请新建研究。');run.followups.push(followup.value.trim());followup.value='';await execute();})));
    if(run.status==='paused'&&run.step<MAX_STEPS)output.append(btn('继续已保存的下一步',safely(execute)));
    if(['inflight','uncertain'].includes(run.status))output.append(el('p','local-ai-warning','上次调用未确认完成，可能已计费。本轮不会自动重试；如需重新研究，请明确点击“开始新的研究”。'));
  }
  async function execute(){
    if(busy)return;if(!confirm.checked)throw Error('请先确认公开资料与调用费用。');
    const ticket=epoch;busy=true;start.disabled=true;
    try{
      await access();if(run.saved&&!aiJournal.unlocked)throw Error('请先解锁下方研究册。');controller=new AbortController();
      while(run.step<MAX_STEPS){
        run.callId=crypto.randomUUID();run.status='inflight';await checkpoint();if(ticket!==epoch)return;
        status.textContent=`AI 正在处理第 ${run.step+1} / ${MAX_STEPS} 步…`;
        const payload={goal:run.goal,followups:run.followups,queries:run.queries,references:run.citations.map(referenceOnly),step:run.step,callId:run.callId,publicConfirmed:true};
        const response=run.provider==='personal'?await callPersonalAi('/api/ai/research/step',payload,{signal:controller.signal,profile:run.profile}):await api('/api/ai/research/step',{method:'POST',signal:controller.signal,body:JSON.stringify(payload)});
        if(ticket!==epoch)return;
        run.citations=response.citations;run.step++;const action=response.decision;run.events.push({action:action.action,query:action.query,question:action.question,count:response.citations.length,at:new Date().toISOString()});
        if(action.action==='search'){run.queries.push(action.query);run.status='paused';}
        else if(action.action==='clarify')run.status='clarify';
        else{run.result=action;run.status='complete';}
        await checkpoint();if(ticket!==epoch)return;render();
        if(action.action!=='search')break;
      }
      status.textContent=run.status==='complete'?'研究草稿已生成，请核对引用。':run.status==='clarify'?'请补充说明；本轮到达 4 步后可新建研究。':'本轮已达到调用上限。';await refreshHistory();
    }catch(e){if(ticket===epoch){run.status='uncertain';try{await checkpoint();}catch{}render();status.textContent=e.message+' 未自动重试。';}}
    finally{if(ticket===epoch){busy=false;start.disabled=false;controller=null;}}
  }
  const start=btn('开始新的研究',safely(async()=>{
    if(busy||starting)return;starting=true;start.disabled=true;try{if(!goal.value.trim())throw Error('请填写研究目标。');if(!confirm.checked)throw Error('请先勾选公开问题和费用确认。');
    const ticket=await access();if(save.checked&&!aiJournal.unlocked)throw Error('请先解锁下方本机 AI 研究册，或取消保存。');
    let profile;if(provider.value==='personal'){const state=await personalAiStatus();if(!state.ready)throw Error(state.message);profile={id:state.id,verifiedAt:state.verifiedAt};}if(ticket!==epoch)return;
    run={id:crypto.randomUUID(),kind:'ai-agent',created:new Date().toISOString(),goal:goal.value.trim(),provider:provider.value,profile,saved:save.checked,followups:[],queries:[],citations:[],events:[],step:0,status:'paused'};await checkpoint();render();await execute();}finally{starting=false;if(!busy)start.disabled=false;}
  }),'book-primary');
  const stop=()=>{epoch++;controller?.abort();controller=null;busy=false;start.disabled=false;};
  root.append(start,btn('停止研究',()=>{stop();if(run?.status==='inflight')run.status='uncertain';render();status.textContent='已停止发送后续步骤。已发送的请求仍可能计费，可在历史中查看已保存进度。';}),status,output,history);
  async function refreshHistory(){const ticket=epoch;history.replaceChildren();if(!aiJournal.unlocked)return;const rows=await aiJournal.list();if(ticket!==epoch)return;history.append(el('h3','','已保存的 AI 研究'));for(let row of rows.sort((a,b)=>b.created.localeCompare(a.created))){const line=el('div','local-ai-record');line.append(el('span','',`${row.created} · ${row.step} 步 · ${row.status==='complete'?'已生成草稿':'可查看进度'}`),btn('核对来源并打开',safely(async()=>{if(busy)throw Error('请先停止当前研究。');output.replaceChildren();run=null;const token=await access();const checked=await api('/api/ai/research/sources',{method:'POST',body:JSON.stringify({references:row.citations.map(referenceOnly)})});if(token!==epoch)return;row={...row,citations:checked.citations};if(row.result)parseAgentAction(JSON.stringify(row.result),row,row.citations);run=structuredClone(row);goal.value=row.goal;provider.value=row.provider;save.checked=true;confirm.checked=false;render();})),btn('删除记录',safely(async()=>{if(busy)throw Error('请先停止当前研究。');await aiJournal.remove(row.id);if(run?.id===row.id){run=null;output.replaceChildren();}await refreshHistory();})));history.append(line);}}
  document.querySelector('#world')?.prepend(root);
  const clear=()=>{stop();run=null;goal.value='';followup.value='';confirm.checked=false;status.textContent='';output.replaceChildren();history.replaceChildren();};
  document.addEventListener('ziwei:session',e=>{viewer=e.detail||{};clear();});document.addEventListener('ziwei:logout',()=>{viewer={};clear();});
  for(const event of ['ziwei:ai-cleared','ziwei:personal-ai-locked','ziwei:material-deleting','ziwei:material-deleted'])document.addEventListener(event,clear);
  document.addEventListener('ziwei:ai-unlocked',()=>refreshHistory().catch(()=>{}));window.addEventListener('pagehide',clear);
  const header=document.querySelector('#model .cosmic-tabs');if(header){const link=el('a','book-secondary','AI 研究 ↗');link.href='#world';header.append(link);}
  return {root};
}
