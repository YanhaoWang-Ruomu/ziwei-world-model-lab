import {nativeAi} from './native-ai.mjs';
import {visualJournal} from './local-ai.js';
import {visualInput,continueVisualRun,rankVisualPages,visualComparison,VISUAL_RESEARCH_VERSION} from './visual-research.mjs';

export async function loadVisualImage(url,{signal}={}){
  const response=await fetch(url,{signal,cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('原页影像读取失败，可能已删除或不再公开。');
  const blob=await response.blob();if(blob.size>8*1024*1024||!blob.type.startsWith('image/'))throw Error('请选择大小合适的原页影像。');
  const bitmap=await createImageBitmap(blob);
  try{const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.88);canvas.width=canvas.height=1;if(data.length>5_000_000)throw Error('缩放后的影像仍过大。');return data;}finally{bitmap.close();}
}
export function initVisualResearch({api,el,btn,journal=visualJournal,connection=nativeAi,imageLoader=loadVisualImage}){
  const root=el('details','local-ai-panel visual-research'),book=el('select'),query=el('textarea'),start=el('input'),end=el('input'),confirm=el('input'),save=el('input'),status=el('p'),output=el('div'),history=el('div'),fields=el('fieldset');root.id='visual-book-research';
  let viewer={},epoch=0,run=null,busy=false,starting=false,controller=null;
  book.append(new Option('请刷新公开书籍列表',''));book.setAttribute('aria-label','图文比较书籍');query.setAttribute('aria-label','图文比较问题');query.maxLength=300;query.placeholder='例如：寻找描述某个术语的原页，或核对文字搜索遗漏的页面。';
  for(const [node,label]of [[start,'图文比较起始页'],[end,'图文比较结束页']]){node.type='number';node.min=1;node.value=1;node.setAttribute('aria-label',label);}confirm.type=save.type='checkbox';status.setAttribute('role','status');
  const field=(title,input)=>{const label=el('label','personal-ai-field',title);label.append(input);return label;};
  fields.append(field('公开书籍',book),field('研究问题',query),field('起始 PDF 页',start),field('结束 PDF 页',end),field('确认问题可公开，使用本机模型对照原页。',confirm),field('加密保存每页进度（先解锁本机 AI 研究册）。',save));
  const active=t=>{if(t!==epoch)throw Error('研究已停止或账户已变化。');};
  async function access(t){const session=await api('/api/session');active(t);if(!session.authenticated||!session.userId||session.userId!==viewer.userId)throw Error('请先登录当前个人账户。');}
  const safely=fn=>async()=>{const t=epoch;try{await fn();}catch(e){if(t===epoch)status.textContent=e.message;}};
  const pageUrl=(page,image=false,version)=>'/api/ai/visual/'+(image?'image':'page')+'?'+new URLSearchParams({book:run.input.bookId,page,...(version?{version}:{})});
  async function validatePages(record,t){for(const p of record.pages){const current=await api('/api/ai/visual/page?'+new URLSearchParams({book:record.input.bookId,page:p.page}));active(t);if(current.version!==p.version)throw Error('原页已修订或不再公开，请新建比较。');}}
  function render(){
    output.replaceChildren();if(!run)return;
    output.append(el('h3','',run.input.query),el('p','muted',`${run.model} · 已处理 ${run.pages.length} / ${run.input.end-run.input.start+1} 页 · ${run.status==='complete'?'已完成比较':'已保存的进度'}`));
    const normalize=s=>window.ZiweiBookSearch?.normalize(s)||String(s).normalize('NFKC').toLowerCase();
    const ranked=rankVisualPages(run.pages,run.input.query,normalize),lexical=[...ranked].filter(r=>r.lexical>0).sort((a,b)=>b.lexical-a.lexical||a.page-b.page);
    output.append(el('p','muted','仅文字检索顺序：'+(lexical.map(r=>'第 '+r.page+' 页').join('、')||'在已处理页面中未命中')));
    const comparison=visualComparison(run.pages,run.input.query,normalize);
    output.append(el('p','muted',`已人工标记 ${comparison.reviewed}/${comparison.total} 页。`+(run.status==='complete'&&comparison.ready?(comparison.relevant?`本轮前 3 个结果召回：文字 ${Math.round(comparison.textRecallAt3*100)}%；图文合并 ${Math.round(comparison.combinedRecallAt3*100)}%。只适用于本轮已标记样本。`:'本轮人工标记均为不相关，不计算召回率。'):'全部处理并人工标记后，才比较本轮召回；未标记不视为不相关。')));
    for(const p of ranked){const card=el('article','agent-step');card.append(el('h4','',`第 ${p.page} 页 · ${p.rank>0?'候选相关页':'暂未发现相关依据'}`),el('p','muted',`${p.visual?'图文相关等级 '+p.visual.relevance+' / 3':'缺少原页影像，仅比较文字'} · ${p.elapsedMs} 毫秒`));
      if(p.visual){card.append(el('p','',p.visual.reason),el('blockquote','',p.visual.excerpt||'未提取可辨原文'));for(const s of p.visual.uncertainties)card.append(el('p','tech-unresolved',s));}
      if(p.textTruncated)card.append(el('p','muted','本页文字超过比较上限，仅取前 24000 字。'));
      if(p.reviews?.length)card.append(el('p','muted','最近人工标记：'+(p.reviews.at(-1).relevant?'相关':'不相关')));
      for(const [relevant,title]of [[true,'人工标记：此页相关'],[false,'人工标记：此页不相关']])card.append(btn(title,safely(async()=>{
        if(busy||starting)throw Error('请先暂停处理再标记。');const t=epoch,id=run.id;await access(t);await validatePages({input:run.input,pages:[p]},t);
        const mark=async()=>{if(run?.id!==id)throw Error('研究已切换。');if(run.saved){const latest=await journal.get(id);active(t);if(!latest||latest.revision!==run.revision)throw Error('记录已在其他页面变化，请重新打开。');}
          const next=structuredClone(run),row=next.pages.find(r=>r.page===p.page);row.reviews=[...(row.reviews||[]),{relevant,at:new Date().toISOString()}];next.revision=(run.revision||0)+1;if(run.saved)await journal.put(next);active(t);run=next;render();};
        if(run.saved){if(!navigator.locks)throw Error('当前浏览器不支持安全保存锁。');await navigator.locks.request('ziwei-visual-'+id,{ifAvailable:true},lock=>{if(!lock)throw Error('另一页面正在处理此记录。');return mark();});}else await mark();
      })));
      card.append(btn('核对原页',safely(async()=>{const t=epoch;await access(t);await validatePages({input:run.input,pages:[p]},t);document.dispatchEvent(new CustomEvent('ziwei:open-book-page',{detail:{id:run.input.bookId,page:p.page,bookLevel:'public'}}));})));output.append(card);
    }
    output.append(el('p','local-ai-warning','相关等级只用于候选排序。图文原文尚未逐字校对，不作为已验证引用；本轮只比较所选页面，不代表整本书搜索效果。'));
    if(run.status!=='complete')output.append(btn('继续未处理的书页',safely(execute)));
    if(run.status==='complete')output.append(btn('带入研究对话继续查证',safely(async()=>{const t=epoch;await access(t);await validatePages(run,t);document.dispatchEvent(new CustomEvent('ziwei:visual-research-question',{detail:{query:run.input.query,bookId:run.input.bookId,pages:ranked.filter(p=>p.rank>0).map(p=>p.page)}}));location.hash='#world';document.querySelector('#research-agent')?.scrollIntoView();status.textContent='已带入问题与查页提示，尚未调用 AI。';})));
  }
  async function refresh(){const t=epoch;history.replaceChildren();if(!journal.unlocked)return;const rows=await journal.list();active(t);for(const row of rows.sort((a,b)=>b.created.localeCompare(a.created)).slice(0,20))history.append(el('p','muted',`${row.created} · ${row.pages.length} 页进度`),btn('核对并恢复书页比较',safely(async()=>{if(busy)throw Error('请先暂停当前比较。');const token=epoch;await access(token);const latest=await journal.get(row.id);active(token);if(!latest)throw Error('记录已删除。');await validatePages(latest,token);run=latest;query.value=run.input.query;start.value=run.input.start;end.value=run.input.end;confirm.checked=false;render();status.textContent='进度已恢复；继续前请重新勾选公开问题确认。';})),btn('删除书页比较记录',safely(async()=>{if(busy)throw Error('请先暂停当前比较。');await journal.remove(row.id);if(run?.id===row.id){run=null;output.replaceChildren();}await refresh();})));
  }
  async function execute(){
    if(busy)return;if(!confirm.checked)throw Error('请先确认问题可公开。');if(!connection.ready)throw Error('请先在账户页连接本机图文 AI。');if(run.model!==connection.model)throw Error('模型已变化，请新建试验以便比较。');
    const t=epoch;busy=true;fields.disabled=true;controller=new AbortController();
    try{await access(t);if(run.saved&&!journal.unlocked)throw Error('请先解锁本机 AI 研究册。');
      const work=async()=>{if(run.saved){const latest=await journal.get(run.id);active(t);if(!latest||(latest.revision||0)!==(run.revision||0))throw Error('记录在其他页面发生变化，请重新打开。');}
        status.textContent='正在逐页比较原图与文字，请保持本机服务运行…';
        await continueVisualRun(run,{signal:controller.signal,readPage:p=>api(pageUrl(p),{signal:controller.signal}),readImage:(p,v)=>imageLoader(pageUrl(p,true,v),{signal:controller.signal}),generate:(...args)=>connection.generate(...args),save:async snapshot=>{active(t);snapshot.revision=(run.revision||0)+1;if(run.saved)await journal.put(snapshot);active(t);run=snapshot;render();}});
      };
      if(run.saved){if(!navigator.locks)throw Error('当前环境不支持安全恢复锁。');await navigator.locks.request('ziwei-visual-'+run.id,{ifAvailable:true},lock=>{if(!lock)throw Error('另一页面正在处理此记录。');return work();});}else await work();
      active(t);await refresh();status.textContent=run.saved?'比较完成，逐页进度已加密保存。':'比较完成，本轮未保存；关闭页面会清除。';
    }finally{if(t===epoch){busy=false;fields.disabled=false;controller=null;}}
  }
  const stop=()=>{epoch++;controller?.abort();controller=null;busy=false;starting=false;fields.disabled=false;};
  root.append(el('summary','','原页图文比较 · 本机 AI 检索试验'),el('p','muted','逐页对照 OCR 文字与原始影像，比较文字检索与图文排序。使用已接入的 Qwen3.5-4B，每轮最多 8 页；未部署新的图像向量模型。只读取你选定的公开书页，图像不发送给云端 AI。'),fields,
    btn('刷新图文比较书籍',safely(async()=>{if(busy)throw Error('请先暂停比较。');const t=epoch;await access(t);const result=await api('/api/books');active(t);book.replaceChildren(new Option('请选择公开书籍',''));for(const b of result.books||[])if(b.level==='public'&&b.status!=='deleting')book.append(new Option(b.title,b.id));})),
    btn('开始新的书页比较',safely(async()=>{if(busy||starting)return;starting=true;const t=epoch;try{if(!confirm.checked)throw Error('请先确认问题可公开。');const input=visualInput({bookId:book.value,query:query.value,start:Number(start.value),end:Number(end.value)});await access(t);if(save.checked&&!journal.unlocked)throw Error('请先解锁本机 AI 研究册。');if(!connection.ready)throw Error('请先连接本机图文 AI。');run={id:crypto.randomUUID(),kind:'ai-visual-search',version:VISUAL_RESEARCH_VERSION,model:connection.model,created:new Date().toISOString(),input,pages:[],saved:save.checked,status:'paused',revision:0};if(run.saved)await journal.put(run);active(t);render();await execute();}finally{if(t===epoch)starting=false;}}),'book-primary'),
    btn('暂停书页比较',()=>{stop();render();status.textContent='已暂停；已保存的页面不会重复处理。';}),btn('刷新书页比较历史',safely(refresh)),status,output,history);
  const clear=()=>{stop();run=null;output.replaceChildren();history.replaceChildren();query.value='';confirm.checked=save.checked=false;book.replaceChildren(new Option('请刷新公开书籍列表',''));status.textContent='';};
  document.addEventListener('ziwei:session',e=>{viewer=e.detail||{};clear();});document.addEventListener('ziwei:logout',()=>{viewer={};clear();});
  for(const event of ['ziwei:ai-cleared','ziwei:ai-locked','ziwei:native-ai-disconnected','ziwei:material-deleting','ziwei:material-deleted'])document.addEventListener(event,clear);
  window.addEventListener('pagehide',clear);document.querySelector('#library')?.append(root);return {root};
}
