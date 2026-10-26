import {discoveryJournal} from './local-ai.js';
import {callPersonalAi,personalAiStatus} from './personal-ai.js';
import {discoveryInput} from './discovery-contracts.mjs';
import {referenceOnly} from './research-agent-contracts.mjs';

export function initDiscovery({api,el,btn,journal=discoveryJournal,callAi=callPersonalAi,aiStatus=personalAiStatus}){
  const root=el('details','local-ai-panel discovery-panel');root.id='public-discovery';
  const fields=el('fieldset'),question=el('textarea'),queries=el('textarea'),domains=el('input'),book=el('select'),freshness=el('select'),confirm=el('input'),save=el('input'),consent=el('input'),status=el('p'),output=el('div'),history=el('div');
  let viewer={},epoch=0,busy=false,run=null,controller=null;
  const field=(title,input)=>{const label=el('label','personal-ai-field',title);input.setAttribute('aria-label',title);label.append(input);return label;};
  const check=(input,title)=>{input.type='checkbox';const label=el('label','review-check');input.setAttribute('aria-label',title);label.append(input,document.createTextNode(title));return label;};
  question.maxLength=400;question.placeholder='比较公开材料中的观点，或补充最新公开资料。';queries.maxLength=242;queries.rows=3;queries.placeholder='可留空。每行一组不同说法，最多三组；例如术语、同义词、旧称。';domains.maxLength=602;domains.placeholder='可留空；多个域名以逗号分隔，例如 nasa.gov, esa.int';
  book.append(new Option('全部公开书库','all'));for(const [value,label]of [[0,'不限网页时间'],[7,'最近 7 天'],[30,'最近 30 天'],[180,'最近半年'],[365,'最近一年']])freshness.append(new Option(label,String(value)));
  const cfg=el('a','book-secondary','配置 / 解锁我的 API ↗');cfg.href='#account';
  root.append(el('summary','','书库＋联网联合查询'),el('p','muted','先合并不同检索词找到的书库段落，再选择是否联网补充。联网首批支持北京百炼 qwen-plus / qwen-flash，复用账户中的 API。其他模型可继续使用上方书库研究。'),cfg);
  fields.append(field('公开研究问题',question),field('补充检索词（每行一组）',queries),field('联合查询的书库范围',book),btn('刷新联合查询材料',()=>guard(async ticket=>{const data=await api('/api/books');current(ticket);book.replaceChildren(new Option('全部公开书库','all'));for(const b of data.books||[])if(b.level==='public'&&b.status!=='deleting')book.append(new Option(b.title,b.id));})),field('限定网页域名',domains),field('网页时间范围',freshness),check(confirm,'确认本次输入可公开，不含私密技法或个人资料。'),check(save,'加密保存到本机研究册（须先在下方解锁）。'),check(consent,'同意联网时发送问题与公开选段，可能产生模型和搜索费用。'));
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const current=ticket=>{if(ticket!==epoch)throw Error('查询已停止或账户已变化。');};
  const access=async ticket=>{const s=await api('/api/session');current(ticket);if(!s.authenticated||s.userId!==viewer.userId)throw Error('请先登录自己的账户。');};
  async function checkpoint(ticket){current(ticket);if(!run?.saved)return;const snapshot=structuredClone(run);snapshot.revision=(snapshot.revision||0)+1;await journal.put(snapshot);current(ticket);run.revision=snapshot.revision;}
  async function guard(work){if(busy)return;const ticket=epoch;busy=true;fields.disabled=true;try{await access(ticket);await work(ticket);}catch(e){if(ticket===epoch)status.textContent=e.message;}finally{if(ticket===epoch){busy=false;fields.disabled=false;}}}
  function input(){return discoveryInput({question:question.value,queries:queries.value.trim()?queries.value.split(/\n/).map(x=>x.trim()).filter(Boolean):[],bookId:book.value,domains:domains.value.trim()?domains.value.split(/[,，\s]+/).filter(Boolean).map(x=>x.toLowerCase()):[],freshness:Number(freshness.value),publicConfirmed:confirm.checked});}
  function render(){
    output.replaceChildren();if(!run)return;
    output.append(el('h3','',run.input.question),el('p','muted',`查询时间：${run.created} · 检索词：${run.input.queries.join(' / ')}`));
    if(run.result){
      output.append(el('h4','','联合研究草稿'));
      for(const p of run.result.paragraphs){const row=el('article','agent-step');row.append(el('p','',p.text));for(const n of p.book)row.append(btn('书库依据 '+n,()=>output.querySelector('[data-book="'+n+'"]')?.scrollIntoView({block:'center'})));for(const n of p.web){const s=run.result.sources.find(s=>s.id===n);if(s){const a=el('a','book-secondary','网页依据 '+n+' ↗');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}}output.append(row);}
      if(run.result.unverifiedCount)output.append(el('p','muted',`${run.result.unverifiedCount} 段没有有效出处标记，未展示为结论。`));
      output.append(el('p','local-ai-warning','书库选段已与保存的原文核对；网页仅核对服务商返回的链接与引用编号，尚未逐页核对全文。两者都不能保证 AI 解释正确。'));
      const websites=el('details');websites.append(el('summary','','网页来源 · '+run.result.sources.length+' 条'));for(const s of run.result.sources){const a=el('a','book-secondary',`[ref_${s.id}] ${s.title} · ${new URL(s.url).hostname}`);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';const p=el('p');p.append(a);websites.append(p);}output.append(websites,el('p','muted',`联网记录时间：${run.result.at} · ${run.result.model} · 网页内容可能已更新`));
    }
    output.append(el('h4','','书库原文 · '+run.citations.length+' 段'));
    for(const [i,c]of run.citations.entries()){const article=el('article','library-citation');article.dataset.book=String(i+1);article.append(el('strong','',`[book_${i+1}] ${c.title} · 第 ${c.page} 页 / 段`),el('blockquote','',c.quote),btn('查看书库原页',()=>document.dispatchEvent(new CustomEvent('ziwei:open-book-page',{detail:{id:c.book_id,page:c.page,bookLevel:'public'}}))));output.append(article);}
    if(!run.citations.length)output.append(el('p','muted','书库未找到相关选段。可换检索词重新查询，也可单独查询公开网页。'));
    if(run.status==='books')output.append(btn('联网补充并对照',()=>guard(web),'book-primary'));
    if(['inflight','uncertain'].includes(run.status))output.append(el('p','local-ai-warning','这次联网调用未确认完成，可能已计费。不会自动重发；可查看书库结果，或明确开始新查询。'));
  }
  async function historyList(ticket=epoch){history.replaceChildren();if(!journal.unlocked)return;const rows=await journal.list();current(ticket);history.append(el('h4','','加密保存的联合查询'));for(const row of rows.sort((a,b)=>b.created.localeCompare(a.created))){const line=el('div','local-ai-record');line.append(el('span','',`${row.created} · ${row.status==='complete'?'已完成':'已保存进度'}`),btn('核对并恢复查询',()=>guard(async t=>{
      const latest=await journal.get(row.id);current(t);if(!latest)throw Error('该记录已删除。');
      output.replaceChildren();run=null;
      const checked=latest.result?await api('/api/ai/discovery/check',{method:'POST',body:JSON.stringify({result:latest.result})}):await api('/api/ai/research/sources',{method:'POST',body:JSON.stringify({references:latest.citations.map(referenceOnly)})});current(t);
      run={...latest,citations:checked.citations};confirm.checked=consent.checked=false;render();status.textContent='已恢复并核对书库来源。继续联网前请重新确认公开范围与费用。';
    })),btn('删除联合查询记录',()=>guard(async t=>{await journal.remove(row.id);current(t);if(run?.id===row.id){run=null;output.replaceChildren();}await historyList(t);})));history.append(line);}}
  async function web(ticket){
    if(!run||run.status!=='books')throw Error('请先查公开书库，或从历史恢复可继续的记录。');
    if(!confirm.checked||!consent.checked)throw Error('请确认公开资料范围与联网调用费用。');
    const profile=await aiStatus();current(ticket);if(!profile.ready)throw Error(profile.message);if(!profile.webSearch)throw Error('联网首批支持北京百炼 qwen-plus / qwen-flash，请在账户切换已验证的接口。');
    const work=async()=>{
      current(ticket);
      if(run.saved){const prior=await journal.get(run.id);current(ticket);if(!prior||(prior.revision||0)!==(run.revision||0))throw Error('此查询已在其他页面修改，请重新打开历史记录。');}
      controller=new AbortController();run.status='inflight';run.callId=crypto.randomUUID();await checkpoint(ticket);render();status.textContent='正在联网查证并对照书库…';
      try{const data=await callAi('/api/ai/discovery/answer',{...run.input,publicConfirmed:true,id:run.callId,references:run.citations.map(referenceOnly)},{signal:controller.signal,profile:{id:profile.id,verifiedAt:profile.verifiedAt}});current(ticket);run.result=data.result;run.citations=data.citations;run.status='complete';await checkpoint(ticket);render();await historyList(ticket);status.textContent=run.saved?'联网草稿已生成并加密保存，请核对出处。':'联网草稿已生成；本轮未开启保存，离开页面将清除。';}
      catch(e){if(ticket===epoch){if(run.status==='inflight'){run.status='uncertain';try{await checkpoint(ticket);}catch{}}render();}throw e;}
    };
    if(navigator.locks)await navigator.locks.request('ziwei-discovery-'+run.id,{ifAvailable:true},async lock=>{if(!lock)throw Error('此查询正在其他页面处理。');await work();});
    else if(run.saved)throw Error('当前浏览器不支持保存记录的并发保护，请使用新版浏览器。');else await work();
  }
  const start=btn('先查公开书库',()=>guard(async ticket=>{
    const options=input();if(save.checked&&!journal.unlocked)throw Error('请先解锁下方本机 AI 研究册，或取消加密保存。');
    status.textContent='正在合并不同检索词的书库结果…';controller=new AbortController();
    const found=await api('/api/ai/discovery/search',{method:'POST',signal:controller.signal,body:JSON.stringify({...options,publicConfirmed:true})});current(ticket);
    run={id:crypto.randomUUID(),kind:'ai-discovery',created:new Date().toISOString(),input:options,citations:found.citations,status:'books',saved:save.checked};await checkpoint(ticket);render();await historyList(ticket);status.textContent=run.saved?'书库结果已加密保存，可稍后恢复并联网补充。':'书库查询已完成，尚未调用付费模型。';
  }),'book-primary');
  fields.append(start);root.append(fields,btn('停止当前查询',()=>{epoch++;controller?.abort();busy=false;fields.disabled=false;if(run?.status==='inflight')run.status='uncertain';render();status.textContent='已停止等待；已发出的联网请求可能计费，不会自动重试。';}),status,output,history);
  const clear=()=>{epoch++;controller?.abort();controller=null;busy=false;fields.disabled=false;run=null;question.value=queries.value=domains.value='';confirm.checked=consent.checked=save.checked=false;output.replaceChildren();history.replaceChildren();status.textContent='';book.replaceChildren(new Option('全部公开书库','all'));};
  document.addEventListener('ziwei:session',e=>{viewer=e.detail||{};clear();});document.addEventListener('ziwei:logout',()=>{viewer={};clear();});
  for(const event of ['ziwei:ai-cleared','ziwei:ai-locked','ziwei:personal-ai-locked','ziwei:material-deleting','ziwei:material-deleted'])document.addEventListener(event,clear);
  document.addEventListener('ziwei:ai-unlocked',()=>historyList().catch(()=>{}));window.addEventListener('pagehide',clear);
  document.querySelector('#research-agent')?.append(root);
  return {root};
}
