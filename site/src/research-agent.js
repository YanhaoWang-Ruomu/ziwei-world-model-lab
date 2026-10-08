import {aiJournal} from './local-ai.js';
import {callPersonalAi,personalAiStatus} from './personal-ai.js';
import {MAX_STEPS,referenceOnly,parseAgentAction} from './research-agent-contracts.mjs';
import {createLocalSemantic} from './local-semantic.mjs';
import {finishPendingSearch,appendResearchFeedback,FEEDBACK_OUTCOMES} from './research-progress.mjs';
export function initResearchAgent({api,el,btn,journal=aiJournal,semanticFactory=createLocalSemantic}){
  const root=el('section','local-ai-panel research-agent'),goal=el('textarea'),provider=el('select'),confirm=el('input'),save=el('input'),status=el('p'),output=el('div'),history=el('div'),followup=el('input');root.id='research-agent';
  let viewer={},epoch=0,run=null,busy=false,starting=false,controller=null;
  const book=el('select'),hybrid=el('input'),pace=el('select');book.setAttribute('aria-label','研究材料范围');book.append(new Option('全部公开书库 · 关键词检索','all'));hybrid.type='checkbox';
  pace.setAttribute('aria-label','研究推进方式');pace.append(new Option('逐步确认 · 每步完成后暂停','manual'),new Option('自动继续 · 最多四步','auto'));
  const semantic=semanticFactory({api,onProgress:text=>{status.textContent=text;}});
  goal.maxLength=400;goal.placeholder='例如：比较公开书库中同一术语的不同解释，标明书名、页码和分歧。';goal.setAttribute('aria-label','AI 研究目标');
  provider.setAttribute('aria-label','研究使用的 AI');provider.append(new Option('我的 API · 使用账户当前配置','personal'),new Option('本站千问 · 核心账户','qwen'));confirm.type=save.type='checkbox';
  const check=(input,text)=>{const label=el('label','review-check');label.append(input,document.createTextNode(text));return label;};
  followup.maxLength=200;followup.placeholder='补充 AI 提出的澄清问题';followup.setAttribute('aria-label','补充研究说明');
  const configLink=el('a','book-secondary','配置 / 解锁我的 API ↗');configLink.href='#account';configLink.onclick=()=>setTimeout(()=>document.querySelector('#personal-ai-settings')?.scrollIntoView(),100);
  root.append(el('p','panel-overline','AI RESEARCH'),el('h2','','AI 研究对话'),el('p','muted','告诉 AI 你要查什么。它会选择检索词、查阅公开书库、必要时向你提问，并把结论对应到原页。每轮最多 4 次模型调用。只处理公开研究问题，不上传个人命例或私密技法。'),configLink,provider,goal,
    check(confirm,'确认问题和补充说明均可公开，同意向所选服务商发送问题与公开选段，可能产生调用费用。'),check(save,'加密保存研究进度（先在下方解锁本机 AI 研究册）'));
  status.setAttribute('role','status');
  root.append(book,btn('刷新公开材料列表',async()=>{const ticket=epoch;try{await access();const response=await api('/api/books');if(ticket!==epoch)return;const selected=book.value;book.replaceChildren(new Option('全部公开书库 · 关键词检索','all'));for(const b of response.books||[])if(b.level==='public'&&b.status!=='deleting')book.append(new Option(b.title,b.id));if([...book.options].some(o=>o.value===selected))book.value=selected;status.textContent='已刷新公开材料列表。';}catch(e){if(ticket===epoch)status.textContent=e.message;}}),check(hybrid,'加入本机语义检索（须选单本公开材料，首次下载约 160 MB 模型）'),el('p','muted','语义计算在本机进行；核对仍公开的候选选段后，才会在下一步发送给所选 AI。'),pace);
  const safely=fn=>async()=>{try{await fn();}catch(e){status.textContent=e.message;}};
  const checkpoint=async()=>{if(run?.saved){const snapshot=structuredClone(run);snapshot.revision=(snapshot.revision||0)+1;await journal.put(snapshot);if(run?.id===snapshot.id)run.revision=snapshot.revision;}};
  async function access(){const ticket=epoch,s=await api('/api/session');if(ticket!==epoch||!s.authenticated||s.userId!==viewer.userId)throw Error('账户已变化，请重新登录。');return ticket;}
  function render(){
    output.replaceChildren();if(!run)return;
    output.append(el('h3','',run.goal),el('p','muted',`研究建立于 ${run.created} · ${run.bookTitle||'全部公开书库'} · ${run.pace==='auto'?'自动继续':'逐步确认'}`));
    for(const event of run.events||[]){const row=el('article','agent-step');row.append(el('strong','',event.action==='search'?'检索公开书库':event.action==='clarify'?'AI 需要你补充':'研究草稿已生成'));if(event.query)row.append(el('p','',event.query+` · 找到 ${event.count} 段候选依据`));if(event.retrieval)row.append(el('small','',event.retrieval));if(event.question)row.append(el('p','',event.question));output.append(row);}
    if(run.result){for(const c of run.result.claims){const source=run.citations[c.source-1];const row=el('article','library-citation');row.append(el('p','',c.text),el('blockquote','',c.quote),el('small','',`${source.title} · 第 ${source.page} 页 / 段`),btn('打开原页',()=>document.dispatchEvent(new CustomEvent('ziwei:open-book-page',{detail:{id:source.book_id,page:source.page,bookLevel:'public'}}))));output.append(row);}for(const item of run.result.uncertainties)output.append(el('p','tech-unresolved',item));output.append(el('p','local-ai-warning','这是待核对的研究草稿。引用检查只能确认原文存在，不能保证解释正确。'));
      output.append(btn('带入个人研究，准备复盘',safely(()=>handoff('research'))));
      if(viewer.core)output.append(btn('带入技法草稿，继续整理',safely(()=>handoff('technique'))));
      renderFeedback();
    }
    if(run.status==='clarify'&&run.step<MAX_STEPS)output.append(followup,btn('补充并继续',safely(async()=>{if(busy)return;if(!confirm.checked)throw Error('请确认补充内容可公开。');if(!followup.value.trim())throw Error('请填写补充说明。');if(run.followups.length>=3)throw Error('已达到本轮补充次数，请新建研究。');run.followups.push(followup.value.trim());followup.value='';await execute();})));
    if(run.status==='paused'&&run.step<MAX_STEPS){
      output.append(btn(run.pendingSearch?'继续本机检索（不重发 AI 请求）':'继续已保存的下一步',safely(execute)));
      if(run.pendingSearch)output.append(btn('跳过本机语义，仅保留关键词',safely(async()=>{if(busy)throw Error('请先停止当前处理。');await access();await withRunLock(async()=>{delete run.pendingSearch;await checkpoint();render();status.textContent='已保留关键词结果，尚未发送下一次 AI 请求。';});})));
    }
    if(['inflight','uncertain'].includes(run.status))output.append(el('p','local-ai-warning','上次调用未确认完成，可能已计费。本轮不会自动重试；如需重新研究，请明确点击“开始新的研究”。'));
  }
  async function withRunLock(fn){
    const id=run.id;
    const work=async()=>{if(run?.id!==id)throw Error('研究已切换。');if(run.saved){const latest=await journal.get(id);if(run?.id!==id)throw Error('研究已切换。');if(!latest)throw Error('这条研究已被删除，请刷新历史。');if((latest.revision||0)!==(run.revision||0))throw Error('这条研究已在其他页面更新，请从历史重新打开。');}return fn();};
    if(globalThis.navigator?.locks)return navigator.locks.request('ziwei-agent-'+id,{ifAvailable:true},lock=>{if(!lock)throw Error('这条研究正在其他页面处理，请稍后重新打开。');return work();});
    if(run.saved)throw Error('当前环境不支持研究记录互斥，请使用最新版浏览器。');return work();
  }
  function renderFeedback(){
    const section=el('section','tech-space');section.append(el('h3','','研究复盘 · 保留当时结论'),el('p','muted','复盘仅加密保存在本机研究册，不发送给 AI。原始结论保持不变；反馈记录只追加，不能证明命理预测有效。'));
    for(const f of run.feedback||[]){const entry=el('article','agent-step');entry.append(el('strong','',FEEDBACK_OUTCOMES[f.outcome]||'待核对'),el('p','',`实际日期：${f.observedOn} · 记录时间：${f.recordedAt}`),el('p','',f.lesson));const comparison=el('div','local-ai-comparison'),before=el('article'),after=el('article');before.append(el('h4','','当时结论'),el('p','',run.result.claims.map(c=>c.text).join('；')||'当时缺少依据'));after.append(el('h4','','实际反馈'),el('p','',f.observation));comparison.append(before,after);entry.append(comparison);if(f.observedOn<=run.created.slice(0,10))entry.append(el('small','muted','反馈日期未晚于研究建立日，属于回顾记录。'));section.append(entry);}
    const observed=el('input'),outcome=el('select'),observation=el('textarea'),lesson=el('textarea');observed.type='date';observed.max=observed.value=new Date().toISOString().slice(0,10);observed.setAttribute('aria-label','实际反馈日期');outcome.setAttribute('aria-label','反馈与原结论对照');for(const [value,label]of Object.entries(FEEDBACK_OUTCOMES))outcome.append(new Option(label,value));
    observation.maxLength=lesson.maxLength=1000;observation.placeholder='实际看到什么？填写可核对的事实或资料位置。';lesson.placeholder='与上方原结论相比，哪些得到支持、哪些有反例或仍不清楚？';observation.setAttribute('aria-label','实际反馈');lesson.setAttribute('aria-label','复盘说明');
    section.append(observed,outcome,observation,lesson,btn('追加加密复盘记录',safely(async()=>{
      if(busy)throw Error('请等待当前处理完成。');if(!run.saved||!journal.unlocked)throw Error('需要已加密保存的研究；请解锁研究册并从历史打开。');const ticket=await access();
      await withRunLock(async()=>{const snapshot=structuredClone(run),checked=await api('/api/ai/research/sources',{method:'POST',body:JSON.stringify({references:snapshot.citations.map(referenceOnly)})});if(ticket!==epoch||run?.id!==snapshot.id)return;parseAgentAction(JSON.stringify(snapshot.result),snapshot,checked.citations);
        const next=appendResearchFeedback(snapshot,{observedOn:observed.value,outcome:outcome.value,observation:observation.value,lesson:lesson.value});next.revision=(snapshot.revision||0)+1;await journal.put(next);if(ticket!==epoch||run?.id!==snapshot.id)return;run=next;render();await refreshHistory();status.textContent='复盘已加密保存；原始结论保持不变。';});
    })));output.append(section);
  }
  async function handoff(kind){
    if(busy||!run?.result)throw Error('请等待研究完成。');
    const ticket=await access(),snapshot=structuredClone(run);
    const checked=await api('/api/ai/research/sources',{method:'POST',body:JSON.stringify({references:snapshot.citations.map(referenceOnly)})});
    if(ticket!==epoch||run?.id!==snapshot.id)return;
    parseAgentAction(JSON.stringify(snapshot.result),snapshot,checked.citations);
    const quotes=snapshot.result.claims.map(c=>{const s=checked.citations[c.source-1];return `《${s.title}》第 ${s.page} 页：\n${c.quote}`;}).join('\n\n');
    const detail={title:snapshot.goal,text:quotes,conclusion:snapshot.result.claims.map(c=>c.text).join('\n'),unknowns:snapshot.result.uncertainties.join('\n'),at:new Date().toISOString()};
    if(kind==='research'&&[detail.text,detail.conclusion,detail.unknowns].some(s=>s.length>1800))throw Error('研究内容过长，请缩小问题范围后带入，避免截断原文和出处。');
    document.dispatchEvent(new CustomEvent(kind==='technique'?'ziwei:ai-technique-draft':'ziwei:ai-research-draft',{detail}));
    status.textContent='已带入待核对表单，尚未保存、审核或发布。';
  }
  async function execute(){
    if(busy)return;if(!confirm.checked)throw Error('请先确认公开资料与调用费用。');
    const ticket=epoch;busy=true;start.disabled=true;
    try{
      await access();if(run.saved&&!journal.unlocked)throw Error('请先解锁下方研究册。');controller=new AbortController();
      await withRunLock(async()=>{
        if(!['paused','clarify'].includes(run.status))throw Error('当前研究不能继续；请从历史查看进度。');
        const completeSearch=async()=>{const next=await finishPendingSearch(run,{search:(...args)=>semantic.search(...args),verify:references=>api('/api/ai/research/sources',{method:'POST',signal:controller.signal,body:JSON.stringify({references})}),signal:controller.signal});if(ticket!==epoch)return;run=next;await checkpoint();render();};
        if(run.pendingSearch){await completeSearch();if(ticket!==epoch||run.pace!=='auto')return;}
        while(run.step<MAX_STEPS){
          run.callId=crypto.randomUUID();run.status='inflight';await checkpoint();if(ticket!==epoch)return;
          status.textContent=`AI 正在处理第 ${run.step+1} / ${MAX_STEPS} 步…`;
          const payload={goal:run.goal,bookId:run.bookId||'all',followups:run.followups,queries:run.queries,references:run.citations.map(referenceOnly),step:run.step,callId:run.callId,publicConfirmed:true};
          const response=run.provider==='personal'?await callPersonalAi('/api/ai/research/step',payload,{signal:controller.signal,profile:run.profile}):await api('/api/ai/research/step',{method:'POST',signal:controller.signal,body:JSON.stringify(payload)});
          if(ticket!==epoch)return;
          run.citations=response.citations;run.step++;const action=response.decision;run.events.push({action:action.action,query:action.query,question:action.question,count:response.citations.length,at:new Date().toISOString(),retrieval:action.action==='search'?'关键词检索':undefined});
          if(action.action==='search'){run.queries.push(action.query);run.status='paused';if(run.hybrid)run.pendingSearch={query:action.query};}
          else if(action.action==='clarify')run.status='clarify';
          else{run.result=action;run.status='complete';}
          await checkpoint();if(ticket!==epoch)return;render();
          if(run.pendingSearch){await completeSearch();if(ticket!==epoch)return;}
          if(action.action!=='search'||run.pace!=='auto')break;
        }
      });
      if(ticket!==epoch)return;
      status.textContent=run.status==='complete'?'研究草稿已生成，请核对引用。':run.status==='clarify'?'请补充说明；本轮到达 4 步后可新建研究。':run.status==='paused'?'本步已完成并暂停，请核对后继续。':'本轮已达到调用上限。';await refreshHistory();
    }catch(e){if(ticket===epoch){if(run.status==='inflight'){run.status='uncertain';try{await checkpoint();}catch{}}render();status.textContent=e.message+(run.pendingSearch?' 本机检索步骤已保留，可重试本机步骤或跳过。':' 未自动重试。');}}
    finally{if(ticket===epoch){busy=false;start.disabled=false;controller=null;}}
  }
  const start=btn('开始新的研究',safely(async()=>{
    if(busy||starting)return;starting=true;start.disabled=true;try{if(!goal.value.trim())throw Error('请填写研究目标。');if(!confirm.checked)throw Error('请先勾选公开问题和费用确认。');
    if(hybrid.checked&&book.value==='all')throw Error('开启语义检索前，请选择一本公开材料。');const ticket=await access();if(save.checked&&!journal.unlocked)throw Error('请先解锁下方本机 AI 研究册，或取消保存。');
    let profile;if(provider.value==='personal'){const state=await personalAiStatus();if(!state.ready)throw Error(state.message);profile={id:state.id,verifiedAt:state.verifiedAt};}if(ticket!==epoch)return;
    run={id:crypto.randomUUID(),kind:'ai-agent',created:new Date().toISOString(),goal:goal.value.trim(),provider:provider.value,bookId:book.value,bookTitle:book.selectedOptions[0]?.textContent,hybrid:hybrid.checked,pace:pace.value,profile,saved:save.checked,followups:[],queries:[],citations:[],events:[],step:0,status:'paused'};await checkpoint();render();await execute();}finally{starting=false;if(!busy)start.disabled=false;}
  }),'book-primary');
  const stop=()=>{epoch++;controller?.abort();semantic.clear();controller=null;busy=false;start.disabled=false;};
  root.append(start,btn('停止研究',()=>{stop();if(run?.status==='inflight')run.status='uncertain';render();status.textContent='已停止发送后续步骤。已发送的请求仍可能计费，可在历史中查看已保存进度。';}),status,output,history);
  async function refreshHistory(){const ticket=epoch;history.replaceChildren();if(!journal.unlocked)return;const rows=await journal.list();if(ticket!==epoch)return;history.append(el('h3','','已保存的 AI 研究'));for(let row of rows.sort((a,b)=>b.created.localeCompare(a.created))){const line=el('div','local-ai-record');line.append(el('span','',`${row.created} · ${row.step} 步 · ${row.status==='complete'?'已生成草稿':'可查看进度'}`),btn('核对来源并打开',safely(async()=>{if(busy)throw Error('请先停止当前研究。');stop();output.replaceChildren();run=null;const token=await access();const latest=await journal.get(row.id);if(token!==epoch)return;if(!latest)throw Error('这条研究已被删除，请刷新历史。');row=latest;const checked=await api('/api/ai/research/sources',{method:'POST',body:JSON.stringify({references:row.citations.map(referenceOnly)})});if(token!==epoch)return;row={...row,citations:checked.citations};if(row.result)parseAgentAction(JSON.stringify(row.result),row,row.citations);run=structuredClone(row);goal.value=row.goal;provider.value=row.provider;pace.value=row.pace||'manual';hybrid.checked=Boolean(row.hybrid);save.checked=true;confirm.checked=false;render();})),btn('删除记录',safely(async()=>{if(busy)throw Error('请先停止当前研究。');await journal.remove(row.id);if(run?.id===row.id){run=null;output.replaceChildren();}await refreshHistory();})));history.append(line);}}
  document.querySelector('#world')?.prepend(root);
  const clear=()=>{stop();run=null;goal.value='';followup.value='';hybrid.checked=false;book.replaceChildren(new Option('全部公开书库 · 关键词检索','all'));confirm.checked=false;status.textContent='';output.replaceChildren();history.replaceChildren();};
  document.addEventListener('ziwei:session',e=>{viewer=e.detail||{};clear();});document.addEventListener('ziwei:logout',()=>{viewer={};clear();});
  for(const event of ['ziwei:ai-cleared','ziwei:ai-locked','ziwei:personal-ai-locked','ziwei:material-deleting','ziwei:material-deleted'])document.addEventListener(event,clear);
  document.addEventListener('ziwei:ai-unlocked',()=>refreshHistory().catch(()=>{}));window.addEventListener('pagehide',clear);
  const header=document.querySelector('#model .cosmic-tabs');if(header){const link=el('a','book-secondary','AI 研究 ↗');link.href='#world';header.append(link);}
  return {root};
}
