import {nativeAi} from './native-ai.mjs';
import {evaluationJournal} from './local-ai.js';
import {RESEARCH_SUITE,RESEARCH_CASES,evaluateResearchCase,evaluationSummary} from './research-evaluations.mjs';
export function initResearchEvaluations({api,el,btn,journal=evaluationJournal,connection=nativeAi,evaluate=evaluateResearchCase,loadImage=async()=>{
  const response=await fetch('/fixtures/research-vision.png',{cache:'no-store'});if(!response.ok)throw Error('虚构验收图片未能加载。');const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片未能读取。'));reader.readAsDataURL(blob);});
}}){
  const root=el('details','local-ai-panel research-evaluation'),status=el('p'),output=el('div'),history=el('div'),save=el('input');root.id='research-evaluation';save.type='checkbox';save.setAttribute('aria-label','加密保存验收记录');status.setAttribute('role','status');
  let viewer={},epoch=0,busy=false,run=null,controller=null;
  const active=t=>{if(t!==epoch)throw Error('验收已停止或账户已变化。');};
  const safe=fn=>async()=>{const t=epoch;try{await fn();}catch(e){if(t===epoch)status.textContent=e.message;}};
  async function account(t){const s=await api('/api/session');active(t);if(!s.authenticated||!s.userId||s.userId!==viewer.userId)throw Error('请先登录当前个人账户。');}
  async function store(next,t){active(t);next.revision=(run.revision||0)+1;if(next.saved)await journal.put(next);active(t);run=next;render();}
  async function lock(work){if(!run.saved)return work();if(!navigator.locks)throw Error('当前浏览器不支持安全保存锁。');return navigator.locks.request('ziwei-evaluation-'+run.id,{ifAvailable:true},async l=>{if(!l)throw Error('其他页面正在处理验收。');const t=epoch,latest=await journal.get(run.id);active(t);if(!latest||latest.revision!==run.revision)throw Error('记录已变化，请从历史重新打开。');return work();});}
  function render(){
    output.replaceChildren();if(!run)return;const summary=evaluationSummary(run);
    output.append(el('h3','',run.model),el('p','muted',`${run.created} · ${run.suite}`),el('p','',`完成 ${summary.completed}/${summary.total} 题 · 机械检查通过 ${summary.passed} · 未通过 ${summary.failed} · 运行错误 ${summary.errors} · 已人工复核 ${summary.reviewed} · 累计 ${summary.elapsedMs} 毫秒`));
    for(const row of run.results){const fixture=RESEARCH_CASES.find(f=>f.id===row.id),card=el('article','agent-step');card.append(el('h4','',fixture.label+' · '+(row.error?'运行未完成':row.mechanicalPass?'机械检查通过':'需复核')),el('p','','预期：'+fixture.expected),el('p','',row.error||row.observation),el('small','',`${row.elapsedMs} 毫秒 · ${row.modelCalls??'未知'} 次本机模型调用`));
      for(const review of row.humanReviews||[])card.append(el('p','muted',review.at+' · '+(review.pass?'人工核对符合预期':'人工核对不符合预期')));
      for(const [pass,title]of [[true,'人工核对：符合'],[false,'人工核对：不符合']])card.append(btn(title,safe(async()=>{if(busy)throw Error('请等待或暂停验收。');const t=epoch;await account(t);await lock(async()=>{const next=structuredClone(run);next.results.find(r=>r.id===row.id).humanReviews.push({pass,at:new Date().toISOString()});await store(next,t);});})));
      output.append(card);
    }
    if(run.results.length<RESEARCH_CASES.length)output.append(btn('继续未完成的验收题',safe(execute)));
    output.append(el('p','local-ai-warning','这是固定虚构小样本验收。机械检查、运行错误、人工复核分开记录，不能视为古籍识别准确率、普遍推理能力或因果有效性的证明。'));
  }
  async function refresh(){const t=epoch;history.replaceChildren();if(!journal.unlocked)return;const records=await journal.list();active(t);for(const row of records.sort((a,b)=>b.created.localeCompare(a.created)).slice(0,20)){const s=evaluationSummary(row);history.append(el('p','muted',`${row.created} · ${row.model} · ${s.completed}/${s.total} 题 · 通过 ${s.passed} · 错误 ${s.errors}`),btn('打开验收记录',safe(async()=>{if(busy)throw Error('请先暂停验收。');const token=epoch;await account(token);const latest=await journal.get(row.id);active(token);if(!latest)throw Error('记录已删除。');if(latest.suite!==RESEARCH_SUITE)throw Error('验收题已更新，旧记录请从加密备份保留。');run=latest;render();})),btn('删除验收记录',safe(async()=>{if(busy)throw Error('请先暂停验收。');await journal.remove(row.id);if(run?.id===row.id){run=null;output.replaceChildren();}await refresh();})));}}
  async function execute(){
    if(busy)return;if(!connection.ready)throw Error('请先连接本机图文 AI。');if(run.suite!==RESEARCH_SUITE||run.model!==connection.model)throw Error('模型或验收题已变化，请新建验收。');const t=epoch;busy=true;controller=new AbortController();save.disabled=true;
    try{await account(t);await lock(async()=>{
      for(const item of RESEARCH_CASES){active(t);if(run.results.some(r=>r.id===item.id))continue;status.textContent='正在验收：'+item.label+'。所有资料均为固定虚构样本。';const started=Date.now();let result;
        try{const image=item.id==='vision'?await loadImage():null;active(t);result=await evaluate(item.id,{connection,signal:controller.signal,image});active(t);}catch(e){active(t);result={id:item.id,error:e.message.slice(0,300),elapsedMs:Date.now()-started,humanReviews:[]};}
        const next=structuredClone(run);next.results.push(result);await store(next,t);
      }
      const next=structuredClone(run);next.status='complete';await store(next,t);
    });active(t);await refresh();status.textContent=run.saved?'验收完成，结果已加密保存。':'验收完成，本轮未保存。';}finally{if(t===epoch){busy=false;controller=null;save.disabled=false;}}
  }
  const stop=()=>{epoch++;controller?.abort();controller=null;busy=false;save.disabled=false;};
  const label=el('label','review-check');label.append(save,document.createTextNode('加密保存验收结果，后续可比较不同运行批次。'));
  root.append(el('summary','','研究评测 · 本机模型实际验收'),el('p','muted','检查引用、分歧、无依据拒答、逻辑边界、因果边界、图像读数及工具中断恢复。逐题调用当前电脑模型，无云端 API 费用；最多 8 次本机调用，可能耗时数分钟。'),label,
    btn('开始一轮本机验收',safe(async()=>{if(busy)return;const t=epoch;busy=true;try{await account(t);if(!connection.ready)throw Error('请先连接本机图文 AI。');if(save.checked&&!journal.unlocked)throw Error('请先解锁本机 AI 研究册。');run={id:crypto.randomUUID(),kind:'ai-research-evaluation',suite:RESEARCH_SUITE,model:connection.model,created:new Date().toISOString(),results:[],saved:save.checked,status:'paused',revision:0};if(run.saved)await journal.put(run);active(t);render();}finally{if(t===epoch)busy=false;}active(t);await execute();}),'book-primary'),
    btn('暂停验收',()=>{stop();status.textContent='已暂停，已保存的验收题不会重复运行。';render();}),btn('查看历次验收',safe(refresh)),status,output,history);
  const clear=()=>{stop();run=null;output.replaceChildren();history.replaceChildren();status.textContent='';save.checked=false;};document.addEventListener('ziwei:session',e=>{viewer=e.detail||{};clear();});document.addEventListener('ziwei:logout',()=>{viewer={};clear();});
  for(const event of ['ziwei:ai-cleared','ziwei:ai-locked','ziwei:native-ai-disconnected'])document.addEventListener(event,clear);window.addEventListener('pagehide',clear);
  document.querySelector('#world')?.append(root);return {root};
}
