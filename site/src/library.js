import {initWorkspaceSections} from './workspace-sections.mjs';
import {configurePlatformLogin} from './platform-login.mjs';
import {initResearchCommunity} from './research-community.js';
import {initLocalAi} from './local-ai.js';
import { importMaterial, pauseImport } from './upload.js';
import { renderManagement } from './management.js';
import { renderReview } from './review.js';
import { initCardLibrary } from './cards.js';
import { initRuleWorkbench } from './rules.js';
import { initWorkspace } from './workspace.js';
import { initModel } from './model.js';
import { initSubmissions } from './submissions.js';
import { initMembers } from './members.js';
import { initPersonalAccount } from './personal-account.js';
import {initStorage,attachDraft} from './storage.js';
import {initPrivateLibrary} from './private-vault.mjs';
import {initTechniques} from './techniques.js';
import {highlightText} from './search-highlights.mjs';
import {mountImageHighlights} from './page-image-highlights.mjs';
import {initEvidenceReader} from './library-evidence.js';
const $ = s => document.querySelector(s);
const normalize = window.ZiweiBookSearch.normalize;
let books = [], viewer = {}, level = 'public', offset = 0, searchGeneration = 0, detailGeneration = 0;
let cardLibrary,ruleWorkbench,workspace,modelWorkbench,submissions,members;
let materialDraft;
let resumedFile=null;
let activeQuery='',activeSimilar=true,disposeImageHighlights=()=>{};
$('#account-access').append($('#special-access'));$('#special-access').hidden=false;
$('#private-access').append($('#private-entry'));$('#private-entry').hidden=false;
export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body && typeof options.body === 'string' ? { 'Content-Type':'application/json' } : {}), ...options.headers }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) { const error=new Error(data.error || '操作未完成，请重试。');error.status=response.status;throw error; }
  return data;
}
export function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
export function btn(text,action,cls='book-secondary') {const n=el('button',cls,text); n.type='button'; n.addEventListener('click',action); return n;}
export function message(node,error) { node.textContent=error instanceof Error?error.message:String(error); }
// Page lookup is independent of search hits, including pages with failed OCR.
const pageLookup=el('form','book-page-lookup');pageLookup.setAttribute('aria-label','按页查看材料');
const lookupBook=el('select'),lookupPage=el('input'),lookupStatus=el('span');
lookupBook.setAttribute('aria-label','查看的书籍');lookupPage.type='number';lookupPage.min=1;lookupPage.value=1;lookupPage.required=true;lookupPage.setAttribute('aria-label','PDF页码或文章段号');
const lookupGo=el('button','book-secondary','直接查看该页');lookupGo.type='submit';lookupStatus.setAttribute('role','status');
pageLookup.append(el('label','','按页查看'),lookupBook,lookupPage,lookupGo,lookupStatus);$('#book-search-form').after(pageLookup);
lookupBook.addEventListener('change',()=>{const b=books.find(b=>b.id===lookupBook.value);lookupPage.max=b?.page_count||1;lookupPage.value=Math.min(Number(lookupPage.value)||1,Number(lookupPage.max));});
$('#book-filter').addEventListener('change',()=>{if($('#book-filter').value!=='all'){lookupBook.value=$('#book-filter').value;lookupBook.dispatchEvent(new Event('change'));}});
pageLookup.addEventListener('submit',event=>{event.preventDefault();if(!lookupBook.value||!lookupPage.reportValidity())return;++searchGeneration;$('#book-search-status').textContent='正在按页查看';lookupStatus.textContent='按 PDF 文件页序查看，可能与书中印刷页码不同。';showPage(lookupBook.value,Number(lookupPage.value));});
const searchCoverage=el('p','book-search-coverage');searchCoverage.setAttribute('role','status');pageLookup.after(searchCoverage);
const evidenceReader=initEvidenceReader({api,el,btn,anchor:searchCoverage,
  scope:()=>({query:$('#book-query').value,book:$('#book-filter').value,level}),
  openSource:async source=>{activeQuery=source.quote?.slice(0,100)||$('#book-query').value;activeSimilar=false;await showPage(source.book_id,source.page);$('#book-detail').scrollIntoView({behavior:'smooth',block:'start'});}});
$('#book-filter').addEventListener('change',()=>evidenceReader.reset());
document.addEventListener('ziwei:open-book-page',async event=>{const {id,page,bookLevel}=event.detail;location.hash=bookLevel==='special'?'#special':'#library';await enterLibrary(bookLevel||'public');await showPage(id,page);});
const storage=initStorage({api,el,btn});
function pageLabel(book,n) { return `${book.kind==='pdf'?'PDF 页':'文章段'} ${n}`; }
function snippet(hit) {
  if(hit.snippet)return hit.snippet;
  const q=normalize($('#book-query').value); const reviewed=hit.reviewed.find(r=>normalize(r.text).includes(q)&&q);
  if(q&&hit.corrected_text&&normalize(hit.corrected_text).includes(q)){const lines=hit.corrected_text.split('\n');const i=lines.findIndex(t=>normalize(t).includes(q));return (i>=0?lines.slice(Math.max(0,i-1),i+2).join(''):hit.corrected_text).slice(0,150);}
  if(reviewed)return reviewed.text;
  const lines=hit.raw_text.split('\n'); const i=lines.findIndex(t=>q&&normalize(t).includes(q));
  return (i>=0?lines.slice(Math.max(0,i-1),i+2).join(''):hit.raw_text).slice(0,150)||'此页未识别出文字，可查看原页。';
}
export async function refresh(source) { await loadBooks(); if(level!=='private'){if(source){$('#book-query').value='';$('#book-filter').value=source.book_id;}await search();if(source)await showPage(source.book_id,source.page);} }
async function resumeUpload(book) {
  window.resumeBookId=book.id;$('#upload-title').value=book.title;$('#upload-level').value=book.level;
  updateUploadLevel();resumedFile=null;$('#upload-file').value='';$('#upload-article').value='';location.hash='materials';$('#upload-form').scrollIntoView({behavior:'smooth'});
  if(!book.file_ready){$('#upload-status').textContent='请重新选择同一原文件，已保存的页面会跳过。';return;}
  $('#upload-start').disabled=true;$('#upload-status').textContent='正在载入已保存的原文件…';
  try{const response=await fetch(`/api/books/${book.id}/file`,{cache:'no-store'});if(!response.ok)throw new Error('原文件暂时无法读取，请重试。');const blob=await response.blob();if(window.resumeBookId!==book.id)return;resumedFile=new File([blob],book.file_name||'saved.pdf',{type:blob.type});$('#upload-status').textContent=`已载入原文件，点击开始继续处理；跳过已保存的 ${book.indexed_pages} 页（段）。`;}
  catch(e){message($('#upload-status'),e);}finally{$('#upload-start').disabled=false;}
}
document.addEventListener('ziwei:resume-material',event=>resumeUpload(event.detail));
document.addEventListener('ziwei:material-deleting',event=>{if(window.resumeBookId===event.detail.id){pauseImport();resumedFile=null;window.resumeBookId=null;$('#upload-file').value='';}});
document.addEventListener('ziwei:material-deleted',()=>{disposeImageHighlights();++detailGeneration;$('#book-detail').replaceChildren();storage.refresh();});
async function loadBooks() {
  const data=await api('/api/books'); books=data.books;
  const old=$('#book-filter').value; $('#book-filter').replaceChildren(new Option('全部书籍与文章','all'));
  books.filter(b=>b.level===level&&b.status!=='deleting').forEach(b=>$('#book-filter').append(new Option(b.title,b.id)));
  if([...$('#book-filter').options].some(o=>o.value===old))$('#book-filter').value=old;
  const visible=books.filter(b=>b.level===level&&b.status!=='deleting'); const pages=visible.reduce((s,b)=>s+b.indexed_pages,0); const total=visible.reduce((s,b)=>s+b.page_count,0);
  const previousBook=lookupBook.value;lookupBook.replaceChildren(...visible.map(b=>new Option(b.title,b.id)));if(visible.some(b=>b.id===previousBook))lookupBook.value=previousBook;
  pageLookup.hidden=level==='private'||!visible.length;lookupBook.dispatchEvent(new Event('change'));
  $('#library-count').textContent=level==='private'?'仅在本机解锁与使用':`${visible.length} 份材料 · 已建索引 ${pages} / ${total} 页（段） · 人工确认 ${visible.reduce((s,b)=>s+(b.confirmed_pages||0),0)} 页（段）`;
  renderManagement(books,viewer);
  const uploads=$('#my-uploads');uploads.replaceChildren();
  if(cardLibrary)await cardLibrary.refresh(viewer);
  if(ruleWorkbench)await ruleWorkbench.refresh();
}
async function search(reset=true) {
  if(level==='private')return;
  if(reset)offset=0;
  const generation=++searchGeneration; ++detailGeneration;
  disposeImageHighlights();activeQuery=$('#book-query').value;activeSimilar=$('#book-match-mode').value!=='exact';
  $('#book-search-status').textContent='正在查询全文…';
  searchCoverage.textContent='';
  $('#book-results').replaceChildren(); $('#book-detail').replaceChildren(el('p','book-loading','正在查找…')); $('#result-pagination').replaceChildren();
  try {
    const params=new URLSearchParams({q:$('#book-query').value,book:$('#book-filter').value,level,match:$('#book-match-mode').value,offset:String(offset)});
    const data=await api(`/api/search?${params}`); if(generation!==searchGeneration)return;
    if(data.coverage){const c=data.coverage;searchCoverage.textContent=`本次范围：已检查 ${c.saved_pages} / ${c.expected_pages} 页（段），其中 ${c.text_pages} 页有可搜索文字。${c.missing_pages?` ${c.missing_pages} 页尚未导入，请在材料管理中继续处理。`:''}${c.empty_pages?` ${c.empty_pages} 页未提取到文字，可能为空白页或需要重新识别。`:''}`;}
    $('#book-search-status').textContent=`${data.total} 页（段）${$('#book-query').value.trim()?'条结果 · 按相关度排序':'可浏览'}`;
    if(!data.hits.length) { const emptyPublic=level==='public'&&!books.some(b=>b.level==='public');$('#book-detail').replaceChildren(el('h2','',emptyPublic?'公开书库等待第一份材料':'暂未找到匹配文字'),el('p','book-empty-copy',emptyPublic?'核心管理人发布公开材料后，即可在这里检索全文。':'已检查当前范围内保存的提取文字与已确认校订稿。可用上方“按页查看”直接打开目标页，比较提取文字与原页影像；如果识别漏字，可重新识别或校订该页。'));if(emptyPublic&&viewer.core){const link=el('a','book-primary','上传公开材料');link.href='#materials';$('#book-detail').append(link);}return; }
    data.hits.forEach(hit=>{
      const card=btn('',()=>showPage(hit.book_id,hit.page),'book-result');card.dataset.pageKey=`${hit.book_id}:${hit.page}`;
      const title=el('strong'),excerpt=el('span','book-result-quote');highlightText(title,hit.title,activeQuery,normalize,{similar:activeSimilar});highlightText(excerpt,snippet(hit),activeQuery,normalize,{similar:activeSimilar});
      card.append(el('span','book-match',activeQuery.trim()?`${hit.match_label || '文字匹配'}${data.match==='related'?' · 综合排序':` · 相关度 ${hit.score ?? 100}`}`:'全文提取或识别文字'),title,excerpt,el('small','',pageLabel(hit,hit.page)));
      $('#book-results').append(card);
    });
    if(offset>0)$('#result-pagination').append(btn('上一组',()=>{offset=Math.max(0,offset-20);search(false);}));
    if(offset+20<data.total)$('#result-pagination').append(btn('下一组',()=>{offset+=20;search(false);}));
    await showPage(data.hits[0].book_id,data.hits[0].page);
  } catch(e) { if(generation===searchGeneration){message($('#book-search-status'),e);$('#book-detail').replaceChildren(btn('重试查询',()=>search()));} }
}
async function showPage(id,n) {
  const generation=++detailGeneration; const detail=$('#book-detail');
  disposeImageHighlights();const query=activeQuery,highlightOptions={similar:activeSimilar};
  try {
    const p=await api(`/api/books/${id}/pages/${n}`); if(generation!==detailGeneration)return;
    $('#book-results').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.pageKey===`${id}:${n}`)));
    detail.replaceChildren();
    const top=el('div','book-detail-top');top.append(el('span','book-status-badge',p.engine==='article'||p.engine==='embedded-text'?'文件提取文字':'机器识别 · 未逐字校对'),el('span','book-page',pageLabel(p,n)));detail.append(top,el('h2','',p.title));
    const nav=el('form','page-controls');const input=el('input');input.type='number';input.min=1;input.max=p.page_count;input.value=n;input.setAttribute('aria-label','跳转页码');
    const go=el('button','book-secondary','跳转');go.type='submit';nav.addEventListener('submit',e=>{e.preventDefault();if(input.reportValidity())showPage(id,Number(input.value));});
    if(n>1)nav.append(btn('上一页',()=>showPage(id,n-1)));nav.append(input,el('span','',`/ ${p.page_count}`),go);if(n<p.page_count)nav.append(btn('下一页',()=>showPage(id,n+1)));detail.append(nav);
    if(p.reviewed.length) {
      const box=el('section','reviewed-block');box.append(el('h3','','已对照原图的选段'));
      p.reviewed.forEach(r=>{const quote=el('blockquote','book-quotation');highlightText(quote,r.text,query,normalize,highlightOptions);box.append(el('h4','',r.title),quote,el('p','book-context-note',r.note));});
      box.append(el('p','book-quote-note','以上选段由 AI 对照原图核对，尚未经人工逐字验收。下方整页识别文字另行保留。'));detail.append(box);
    }
    const full=el('details','page-text');full.open=true;const raw=el('p','raw-page-text');
    const matches=highlightText(raw,p.raw_text||'未识别出文字，请对照原页。',query,normalize,highlightOptions);
    full.append(el('summary','','整页原始提取文字'));
    if(query.trim()){
      const tools=el('div','search-highlight-tools'),label=el('span');label.setAttribute('role','status');let current=-1;
      const move=delta=>{const marks=[...raw.querySelectorAll('mark')];if(!marks.length)return;current=current<0?(delta>0?0:marks.length-1):(current+delta+marks.length)%marks.length;marks.forEach((mark,i)=>mark.classList.toggle('search-highlight-current',i===current));const mark=marks[current];raw.scrollTop+=mark.getBoundingClientRect().top-raw.getBoundingClientRect().top-raw.clientHeight*.35;label.textContent=`文字匹配 ${current+1} / ${marks.length}${marks.length===500?'（最多展示 500 处）':''}`;};
      label.textContent=matches.length?`${matches.length} 处文字匹配 · 蓝色虚线表示近似文字`:'提取文字中未找到可定位词句，可查看校订稿或原页。';tools.append(label);if(matches.length)tools.append(btn('上一处',()=>move(-1)),btn('下一处',()=>move(1)));full.append(tools);
    }
    full.append(raw);detail.append(full);
    const actions=el('div','book-detail-actions');const copyStatus=el('span','book-copy-status');copyStatus.setAttribute('role','status');
    actions.append(btn('复制本页文字与出处',async()=>{try{await navigator.clipboard.writeText(`《${p.title}》｜${pageLabel(p,n)}\n${p.raw_text}\n状态：${p.engine==='article'?'文章原文':'提取或识别文字，未逐字校对'}\n源文件 SHA-256：${p.source_hash}`);copyStatus.textContent='已复制';}catch{copyStatus.textContent='请选中本页文字手动复制';}}),copyStatus);
    const download=el('a','book-secondary','下载原文件');download.href=`/api/books/${id}/file`;const catalog=el('a','book-secondary','查看技法卡片库');catalog.href='#cards';actions.append(download);if(viewer.role!=='public')actions.append(catalog);detail.append(actions);
    if(p.image_ready) {
      const scan=el('details','book-scan');scan.append(el('summary','','对照原页影像'));
      const link=el('a','book-scan-link');link.href=`/api/books/${id}/pages/${n}/image`;link.target='_blank';link.rel='noopener';
      const img=el('img');img.src=link.href;img.alt=`${p.title} ${pageLabel(p,n)}`;img.loading='lazy';link.append(img);scan.append(link);detail.append(scan);
      if(query.trim()){scan.open=true;disposeImageHighlights=mountImageHighlights({scan,img,link,query,normalize,...highlightOptions,isCurrent:()=>generation===detailGeneration});}
    }
    detail.append(el('p','book-quote-note',`版本指纹 ${p.source_hash}`));
    await renderReview(detail,p,{owner:viewer.owner,canCards:viewer.role!=='public',api,el,btn,reload:async()=>{await loadBooks();await showPage(id,n);}});
    if(generation===detailGeneration)for(const node of detail.querySelectorAll('.corrected-page-text'))highlightText(node,node.textContent,query,normalize,highlightOptions);
  } catch(e) {if(generation===detailGeneration)detail.replaceChildren(el('p','book-empty-copy',e.message),btn('重试',()=>showPage(id,n)));}
}
async function enterLibrary(next,scroll=false,source) {
  evidenceReader.reset();
  disposeImageHighlights();
  level=next==='special'&&viewer.role!=='public'?'special':'public';++searchGeneration;++detailGeneration;
  searchCoverage.textContent='';lookupStatus.textContent='';
  document.querySelectorAll('[data-level]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.level===level)));
  $('#book-detail').replaceChildren();$('#book-results').replaceChildren();
  if(scroll)$('#library').scrollIntoView({behavior:'smooth'});
  try{await refresh(source);}catch(e){message($('#book-search-status'),e);}
}
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>{const hash=b.dataset.level==='public'?'#library':`#${b.dataset.level}`;if(location.hash===hash)enterLibrary(b.dataset.level);else location.hash=hash;}));
window.addEventListener('hashchange',()=>{const next={'#library':'public','#special':'special'}[location.hash];if(next)enterLibrary(next);});
$('#book-search-form').addEventListener('submit',e=>{e.preventDefault();search();});$('#book-filter').addEventListener('change',()=>search());$('#book-match-mode').addEventListener('change',()=>search());$('#book-clear').addEventListener('click',()=>{$('#book-query').value='';search();});
document.querySelectorAll('[data-book-query]').forEach(b=>b.addEventListener('click',()=>{$('#book-query').value=b.dataset.bookQuery;search();}));
function showSpecialAccess() {
  $('#special-account-form').hidden=viewer.owner||viewer.specialAuthenticated;
  $('#special-logout').hidden=viewer.owner||!viewer.specialAuthenticated;
  $('#special-key-options').hidden=viewer.owner;
  $('#special-access-note').textContent=viewer.core?'你已进入核心工作区，可以管理资料并审核卡片。':viewer.role==='special'?'特殊权限已生效，可阅读获授权材料、整理卡片并提交审核。':'输入获授权的特殊级账号，或使用个人账号登录。';
}
$('#special-account-form').addEventListener('submit',async e=>{
  e.preventDefault();$('#special-submit').disabled=true;
  try{await api('/api/special/login',{method:'POST',body:JSON.stringify({username:$('#special-username').value,password:$('#special-password').value})});$('#special-password').value='';await applySession(await api('/api/session'));$('#access-status').textContent='登录成功，工作区已更新。';location.hash='cards';}
  catch(err){$('#special-password').value='';message($('#access-status'),err);}
  finally{$('#special-submit').disabled=false;}
});
$('#special-logout').addEventListener('click',async()=>{
  try{await api('/api/special/logout',{method:'POST'});await applySession(await api('/api/session'));$('#access-status').textContent='已退出特殊级账号。';}catch(err){message($('#access-status'),err);}
});
$('#unlock-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/unlock',{method:'POST',body:JSON.stringify({key:$('#access-key').value.trim()})});$('#access-key').value='';$('#access-status').textContent='验证成功，本次访问最长保留 8 小时。';await applySession(await api('/api/session'));location.hash='special';}catch(err){message($('#access-status'),err);}});
$('#lock-key').addEventListener('click',async()=>{try{await api('/api/lock',{method:'POST'});$('#access-status').textContent='已清除密钥授权。';await applySession(await api('/api/session'));}catch(e){message($('#access-status'),e);}});
function updateUploadLevel(){const value=$('#upload-level').value;$('#online-file-fields').hidden=!['public','special'].includes(value);if(value==='private'){$('#upload-file').value='';$('#upload-article').value='';resumedFile=null;window.resumeBookId=null;}$('#upload-level-note').replaceChildren();if(value==='private'){const a=el('a','book-secondary','进入个人私密入口');a.href='#private';$('#upload-level-note').append(el('span','','私密文件只在本机选择与保存。 '),a);}else $('#upload-level-note').textContent=value==='public'?'原文件、页图和文字将向所有访客开放。':value==='special'?'仅主人及获授权者可读取。保存位置见上方提示。':'请选择资料级别。';}
$('#upload-level').addEventListener('change',updateUploadLevel);
$('#special-owner-manage').addEventListener('click',()=>{$('#upload-level').value='special';window.resumeBookId=null;updateUploadLevel();});
$('#upload-stop').addEventListener('click',pauseImport);
$('#upload-title').addEventListener('input',()=>{window.resumeBookId=null;});
$('#upload-file').addEventListener('change',()=>{resumedFile=null;});
$('#upload-form').addEventListener('submit',async e=>{e.preventDefault();if(!['public','special'].includes($('#upload-level').value))return;
  $('#upload-start').disabled=true;$('#upload-stop').hidden=false;
  const controls=[...document.querySelectorAll('#upload-form input,#upload-form textarea,#upload-form select')];controls.forEach(c=>c.disabled=true);
  try{const result=await importMaterial({api,file:$('#upload-file').files[0]||resumedFile,text:$('#upload-article').value,title:$('#upload-title').value,level:$('#upload-level').value,layout:$('#upload-layout').value,script:$('#upload-script').value,recognitionMode:$('#upload-recognition').value,encoding:$('#upload-encoding').value,resumeId:window.resumeBookId,onCreated:id=>{window.resumeBookId=id;},onProgress:(text,value)=>{$('#upload-status').textContent=text;$('#upload-progress').hidden=false;$('#upload-progress').value=value;}});if(result?.complete){window.resumeBookId=null;resumedFile=null;await materialDraft?.discard();}await refresh();await storage.refresh();}catch(err){message($('#upload-status'),err);}finally{controls.forEach(c=>c.disabled=false);$('#upload-start').disabled=false;$('#upload-stop').hidden=true;}});
async function openCardSource(card){history.replaceState(null,'',card.level==='special'?'#special':'#library');workspace.navigate();await enterLibrary(card.level,false,card);$('#book-detail').scrollIntoView({behavior:'smooth',block:'start'});}
cardLibrary=initCardLibrary({api,el,btn,openSource:openCardSource});
ruleWorkbench=initRuleWorkbench({api,el,btn,openSource:openCardSource});
modelWorkbench=initModel({api,el,btn});
submissions=initSubmissions({api,el,btn,ruleWorkbench,openSource:openCardSource,onPublished:async()=>{await cardLibrary.refresh(viewer);await modelWorkbench.refresh(viewer);}});
members=initMembers({api,el,btn});
initResearchCommunity({api,el,btn});
initLocalAi({api,el,btn});
workspace=initWorkspace({api,onSession:applySession});
const personalAccount=initPersonalAccount({api,onSession:applySession});
const privateVault=initPrivateLibrary({el,btn});
initTechniques({api,el,btn,vault:privateVault});
initWorkspaceSections({api,el,btn});
async function applySession(next){
  configurePlatformLogin(next);
  evidenceReader.reset();
  ++searchGeneration;++detailGeneration;ruleWorkbench.clear();modelWorkbench.clear();submissions.clear();
  pageLookup.hidden=true;lookupBook.replaceChildren();lookupStatus.textContent='';searchCoverage.textContent='';
  $('#book-detail').replaceChildren();$('#book-results').replaceChildren();$('#manage-books').replaceChildren();
  const changedIdentity=viewer.userId!==next.userId&&viewer.userId;
  viewer=next;workspace.setViewer(viewer);personalAccount.setViewer(viewer);showSpecialAccess();if(viewer.core)ruleWorkbench.resetDemo();
  if(changedIdentity){$('#upload-title').value='';$('#upload-article').value='';$('#upload-file').value='';resumedFile=null;window.resumeBookId=null;}
  if(changedIdentity)document.dispatchEvent(new Event('ziwei:logout'));
  document.dispatchEvent(new CustomEvent('ziwei:session',{detail:viewer}));
  $('#owner-login').hidden=viewer.core;$('#special-owner-manage').hidden=!viewer.core;$('#special-login').hidden=true;
  $('#account-code').textContent=viewer.userId?`你的账号识别码：${viewer.userId}（可提供给创建者授权）`:'';
  $('#upload-level').replaceChildren(new Option('公开 · 任何人可查看','public'));if(viewer.core)$('#upload-level').append(new Option('特殊 · 获授权者可查看','special'),new Option('私密 · 仅本机处理','private'));
  updateUploadLevel();materialDraft?.close();materialDraft=null;
  if(viewer.core){const fields=['title','article','level','layout','script','recognition','encoding'];materialDraft=attachDraft({api,el,btn,form:$('#upload-form'),key:'material-editor',kind:'material',read:()=>Object.fromEntries(fields.map(k=>[k,$('#upload-'+k).value])),write:payload=>{for(const k of fields)if(typeof payload[k]==='string')$('#upload-'+k).value=payload[k];$('#online-file-fields').hidden=payload.level==='private';}});}
  await storage.setViewer(viewer);await enterLibrary(location.hash==='#special'?'special':'public');
  await Promise.all([modelWorkbench.refresh(viewer),submissions.refresh(viewer),members.refresh(viewer)]);
}
document.addEventListener('ziwei:view',event=>{if(event.detail==='review'||event.detail==='submissions')submissions.refresh(viewer);if(event.detail==='members')members.refresh(viewer);});
try { await applySession(await api('/api/session')); }
catch(e){message($('#book-search-status'),e);$('#model-status').textContent='工作区暂未连接，请刷新后重试。';}
