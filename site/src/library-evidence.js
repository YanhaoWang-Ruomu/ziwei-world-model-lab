import {createLocalSemantic} from './local-semantic.mjs';
import {fuseEvidence} from './evidence-ranking.mjs';
import {createAiPanel} from './local-ai.js';

export function renderReadiness(host,data,{el,btn,openPage,inspectPage}) {
  host.replaceChildren();
  const facts=el('div','library-health-facts');
  for(const [label,value] of [['应有页数',data.expected_pages],['已保存',data.saved_pages],['有可检索文字',data.text_pages],['未整页确认',data.unconfirmed_pages]]){
    const item=el('div');item.append(el('strong','',String(value)),el('span','',label));facts.append(item);
  }
  host.append(facts,el('p','book-context-note',`原文件${data.file_ready?'已保存':'尚未保存完整'}。有文字不代表识别准确；空白页需对照原页判断。页码按 PDF 文件顺序计算。`));
  for(const [label,ranges,canOpen] of [['尚未保存',data.missing_ranges,false],['已保存但没有文字',data.empty_ranges,true],['缺少原页影像',data.image_missing_ranges,true]]){
    const group=el('div','library-health-issues');group.append(el('strong','',`${label}：${ranges.length?'':'无'}`));
    for(const [first,last] of ranges){const text=first===last?String(first):`${first}—${last}`;
      if(canOpen&&openPage){const action=btn(`第 ${text} 页`,()=>openPage(data.book_id,first));action.title=`打开第 ${first} 页核对`;group.append(action);}
      else group.append(el('span','',`第 ${text} 页`));
    }
    host.append(group);
  }
  if(data.out_of_range_pages)host.append(el('p','',`${data.out_of_range_pages} 个保存页号超出登记范围，需要管理人核对材料页数。`));
  if(data.pages){
    host.append(el('h3','','逐页检查'),el('p','book-context-note','关键词搜索直接查阅已保存文字；本机语义索引在开启语义检索后建立，关闭页面即清除。以下状态不代表 OCR 内容已准确识别。'));
    if(inspectPage){const page=el('input');page.type='number';page.min='1';page.max=String(data.expected_pages);page.value=String(data.page_start);page.setAttribute('aria-label','检查起始页码');
      host.append(page,btn('检查指定页',()=>{const n=Number(page.value);if(Number.isInteger(n)&&n>=1&&n<=data.expected_pages)inspectPage(n);else page.reportValidity();}));}
    const table=el('table','research-compare'),head=el('tr');for(const title of ['页码','保存','文字检索','原页','校订'])head.append(el('th','',title));table.append(head);
    for(const p of data.pages){const row=el('tr'),cell=el('td');cell.append(p.saved&&openPage?btn(String(p.page),()=>openPage(data.book_id,p.page)):document.createTextNode(String(p.page)));row.append(cell);
      for(const value of [p.saved?'已保存':'缺页',p.searchable?'有文字':'无文字',p.image_ready===null?'不适用':p.image_ready?'已保存':'缺少影像',p.confirmed?'已确认':'待核对'])row.append(el('td','',value));table.append(row);}host.append(table);
    if(inspectPage&&data.next_page)host.append(btn('后 25 页',()=>inspectPage(data.next_page)));
  }
}

export function initEvidenceReader({api,el,btn,scope,openSource,anchor}) {
  const root=el('details','library-evidence');root.id='library-evidence';
  root.append(el('summary','','带出处查阅 · 整理相关原文'));
  const lead=el('p','book-context-note','在上方输入问题或关键词，并选择材料。这里会列出相关原文与页码，供你逐段核对。');
  const controls=el('div','library-evidence-controls'),toggle=el('input');toggle.type='checkbox';toggle.id='library-local-semantic';
  const toggleLabel=el('label','library-semantic-toggle');toggleLabel.append(toggle,el('span','','加入本机语义检索（单本）'));
  const note=el('p','book-context-note','首次开启需下载约 160 MB 模型及运行文件，建议使用 Wi-Fi。语义计算在本机运行，材料文本不发往模型提供商；关闭页面后清除本次文本索引。');
  const status=el('p','library-evidence-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const results=el('div','library-evidence-results'),health=el('div','library-health');health.hidden=true;
  let generation=0,controller=null,aiPanel=null;
  const semantic=createLocalSemantic({api,onProgress:text=>{status.textContent=text;}});
  const run=btn('整理原文依据',start,'book-primary'),cancel=btn('停止',()=>reset('已停止。可继续查找原文。'));
  cancel.hidden=true;
  async function inspectPages(page=1){
    const current=scope();if(current.book==='all'){status.textContent='请先在上方选择一本材料，再检查页数。';return;}
    reset();const token=generation;status.textContent='正在检查页面保存与识别状态…';
    try{const data=await api(`/api/books/${encodeURIComponent(current.book)}/readiness?page=${page}`);if(token!==generation)return;
      renderReadiness(health,data,{el,btn,openPage:(book_id,page)=>openSource({book_id,page}),inspectPage:inspectPages});health.hidden=false;status.textContent='页数检查完成。';
    }catch(e){if(token===generation)status.textContent=e.message;}
  }
  const inspect=btn('检查本书页数',()=>inspectPages());
  controls.append(run,cancel,inspect,toggleLabel);root.append(lead,controls,note,status,health,results);anchor.after(root);
  function reset(text=''){
    aiPanel?.dispose();aiPanel=null;
    generation++;controller?.abort();controller=null;semantic.clear();results.replaceChildren();health.replaceChildren();health.hidden=true;
    run.disabled=false;inspect.disabled=false;cancel.hidden=true;status.textContent=text;
  }
  function show(citations,coverage,question){
    aiPanel?.dispose();aiPanel=null;
    results.replaceChildren();
    results.append(el('p','book-context-note',`本次查阅：${question}`));
    if(!citations.length){results.append(el('p','','没有找到相关原文。可以缩短关键词，或先检查本书页数与提取文字。'));return;}
    const count=coverage?`已检查 ${coverage.saved_pages} / ${coverage.expected_pages} 页（段）。`:'';
    results.append(el('p','book-context-note',`${count}以下是原文摘录，不是自动推断的结论。${coverage?.missing_pages||coverage?.empty_pages?'当前材料存在缺页或无文字页，结果可能不完整。':''}`));
    citations.forEach((c,i)=>{
      const box=el('article','library-citation');
      box.append(el('h3','',`[${i+1}] ${c.title} · ${c.kind==='pdf'?'PDF 第':'文章第'} ${c.page} ${c.kind==='pdf'?'页':'段'}`),el('blockquote','',c.quote));
      const labels={confirmed:'已确认校订文字',reviewed:'选段文字 · 待核对',extracted:'提取 / 识别文字 · 待核对'};
      box.append(el('p','book-context-note',`${labels[c.source]||'原文'} · ${c.method||'相关原文'}`),btn('打开原页核对',()=>openSource(c)));
      results.append(box);
    });
    aiPanel=createAiPanel({el,btn,getInput:()=>({kind:'answer',question,citations})});results.append(aiPanel.root);
  }
  async function start(){
    const current=scope();if(!current.query.trim()){status.textContent='请先在上方输入问题或关键词。';return;}
    if(toggle.checked&&current.book==='all'){status.textContent='本机语义检索一次处理一本材料，请先在上方选择。';return;}
    aiPanel?.dispose();aiPanel=null;
    // Preserve a same-book embedding cache between searches; session/scope resets always clear it.
    generation++;controller?.abort();controller=new AbortController();const token=generation,signal=controller.signal;
    run.disabled=true;inspect.disabled=true;cancel.hidden=false;results.replaceChildren();health.hidden=true;status.textContent='正在检索可访问的原文…';
    try{
      const params=new URLSearchParams({q:current.query,book:current.book,level:current.level});
      const data=await api(`/api/evidence/search?${params}`,{signal});if(token!==generation)return;
      show(data.citations.slice(0,6),data.coverage,current.query);
      if(toggle.checked){
        try{
          const semanticHits=await semantic.search(current.book,current.query,{signal});if(token!==generation)return;
          show(fuseEvidence(data.citations,semanticHits),data.coverage,current.query);status.textContent='查阅完成 · 已结合关键词与本机语义排序。请打开原页核对。';
        }catch(e){
          if(token!==generation)return;
          if([401,403,404,410].includes(e.status)){reset('材料权限或状态已变化，请重新选择可访问材料。');return;}
          status.textContent=`${e.message} 已保留关键词查阅结果。`;
        }
      }else status.textContent='查阅完成 · 已按关键词关联度整理原文依据。';
    }catch(e){if(token===generation&&e.name!=='AbortError')status.textContent=e.message;}
    finally{if(token===generation){controller=null;run.disabled=false;inspect.disabled=false;cancel.hidden=true;}}
  }
  toggle.addEventListener('change',()=>reset());
  document.addEventListener('ziwei:session',()=>{toggle.checked=false;reset();});
  for(const event of ['ziwei:logout','ziwei:material-deleting','ziwei:material-deleted'])document.addEventListener(event,()=>reset());
  window.addEventListener('pagehide',()=>reset());
  return {reset,root};
}
