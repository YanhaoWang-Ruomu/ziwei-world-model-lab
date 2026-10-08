import {rankText,matchLabel,bestSnippet} from './search-ranking.mjs';
import {createRecognizer,embeddedText,usableText,renderPage,decodeArticle} from './text-recognition.mjs';
import {createVault} from './vault-storage.mjs';
import {saveBookSource,readBookSource,recognizeBookPages} from './vault-books.mjs';
import {highlightText} from './search-highlights.mjs';
import {mountImageHighlights} from './page-image-highlights.mjs';
import {vaultPasswordReset} from './vault-password-reset.mjs';
export {createVault} from './vault-storage.mjs';

export function initPrivateLibrary({el,btn}){
  const vault=createVault(),root=document.querySelector('#private-access');let viewer={},generation=0,viewGeneration=0,urls=[],disposeImage,working=false,paused=false,backupIterator=null;
  root.replaceChildren();const auth=el('form','tech-editor'),password=el('input'),status=el('p'),list=el('div'),tools=el('div','tech-editor'),reader=el('section','storage-panel');reader.hidden=true;status.setAttribute('role','status');
  password.type='password';password.autocomplete='off';password.placeholder='本机书库独立解锁密码';password.required=true;
  const unlock=el('button','book-primary','创建 / 解锁书库');auth.append(el('h2','','本机加密书库'),el('p','muted','材料仅存放在当前浏览器。每识别一页即加密保存，可暂停后继续；请分卷备份以便迁移。独立解锁密码不会发送到服务器。'),password,unlock);
  const title=el('input'),file=el('input'),article=el('textarea'),query=el('input');title.placeholder='材料标题';file.type='file';file.accept='.pdf,.txt,.md';article.placeholder='或直接粘贴私密文章';article.rows=5;query.type='search';query.placeholder='查找书名或各页文字，支持简繁与近似匹配';
  const normalize=text=>window.ZiweiBookSearch.normalize(text);
  function download(blob,name){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function clearReader(){viewGeneration++;disposeImage?.();disposeImage=null;reader.replaceChildren();reader.hidden=true;for(const url of urls)URL.revokeObjectURL(url);urls=[];}
  const safe=fn=>async()=>{try{await fn();}catch(e){status.textContent=e.message||'操作未完成，请重试。';}};
  async function pdfDocument(blob){const pdf=await import('./vendor/pdf/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc='./vendor/pdf/pdf.worker.mjs';return pdf.getDocument({data:new Uint8Array(await blob.arrayBuffer()),cMapUrl:'./vendor/pdf/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdf/standard_fonts/',wasmUrl:'./vendor/pdf/wasm/',isEvalSupported:false}).promise;}
  async function showPage(book,number=1){
    clearReader();const ticket=viewGeneration,account=vault.generation;reader.hidden=false;reader.append(el('h3','',book.title));
    const controls=el('div','storage-actions'),page=el('input'),total=book.pageCount||1;page.type='number';page.min='1';page.max=String(total);page.value=String(number);page.setAttribute('aria-label','页码');
    const open=n=>showPage(book,Math.max(1,Math.min(total,Math.round(n))));controls.append(btn('上一页',safe(()=>open(number-1))),page,el('span','','/ '+total+' 页'),btn('前往',safe(()=>open(Number(page.value)||1))),btn('下一页',safe(()=>open(number+1))),btn('收起',clearReader));reader.append(controls);
    const saved=await vault.get(book.id+'.page.'+number);if(ticket!==viewGeneration||account!==vault.generation)return;
    const text=el('pre','raw-page-text');highlightText(text,saved?.text||(number===1?book.text:'')||'此页尚未识别，请继续识别。',query.value,normalize);reader.append(el('h4','','提取文字'),text);
    if(book.mime==='application/pdf'||/\.pdf$/i.test(book.fileName||'')){
      const scan=el('details');scan.append(el('summary','','查看原页影像'));reader.append(scan);let loaded=false;
      scan.addEventListener('toggle',safe(async()=>{if(!scan.open||loaded)return;loaded=true;const message=el('p','','正在读取本机原页…');scan.append(message);let doc;
        try{doc=await pdfDocument(await readBookSource(vault,book));const p=await doc.getPage(number),canvas=await renderPage(p),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=0;canvas.height=0;p.cleanup();
          if(ticket!==viewGeneration||account!==vault.generation)return;const img=el('img'),link=el('a'),url=URL.createObjectURL(blob);urls.push(url);img.src=url;img.alt='第 '+number+' 页原页影像';img.className='page-image';link.href=url;link.target='_blank';link.rel='noopener';link.append(img);scan.append(link);message.remove();
          disposeImage=mountImageHighlights({scan,img,link,query:query.value,normalize,isCurrent:()=>ticket===viewGeneration&&account===vault.generation});
        }catch(e){loaded=false;message.textContent=e.message;}finally{await doc?.destroy();}
      }));
    }
    reader.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
  async function refresh(){
    const run=++generation;list.replaceChildren();tools.hidden=!vault.unlocked;auth.hidden=vault.unlocked;if(!vault.unlocked){clearReader();return;}
    const q=query.value.trim(),rows=await vault.list(),matches=[];
    for(const row of rows.filter(r=>r.kind==='book')){
      let score=q?rankText(row.title,q,normalize)*.97:100,hits=[];
      if(q){const pages=await vault.list({parent:row.id,kind:'book-page'});if(row.text)pages.push({page:1,text:row.text});
        for(const page of pages){const value=rankText(page.text||'',q,normalize);if(value>=55)hits.push({page:page.page,score:value,text:page.text});}hits.sort((a,b)=>b.score-a.score||a.page-b.page);score=Math.max(score,hits[0]?.score||0);}
      if(!q||score>=55)matches.push({row,score,hits});
    }
    if(run!==generation)return;matches.sort((a,b)=>b.score-a.score);
    for(const {row,score,hits} of matches){const item=el('article','tech-card');item.append(el('h3','',row.title),el('small','muted',(row.fileName||'本机文章')+(row.pageCount?' · 已识别 '+(row.completedPages||0)+' / '+row.pageCount+' 页':'')));
      if(q){item.append(el('small','book-match',matchLabel(Math.round(score))+' · 相关度 '+Math.round(score)));for(const hit of hits.slice(0,10)){const snippet=el('p');highlightText(snippet,bestSnippet(hit.text,q,normalize),q,normalize);item.append(btn('第 '+hit.page+' 页',safe(()=>showPage(row,hit.page))),snippet);}if(hits.length>10)item.append(el('small','muted','共 '+hits.length+' 页命中，先列出最相关的 10 页，可在页码处继续阅读。'));}
      item.append(btn('逐页阅读',safe(()=>showPage(row,hits[0]?.page||1))));
      if((row.mime==='application/pdf'||/\.pdf$/i.test(row.fileName||''))&&row.status!=='ready')item.append(btn('继续识别',safe(()=>runRecognition(row))));
      if(row.file||row.sourceReady)item.append(btn('导出原文件',safe(async()=>download(await readBookSource(vault,row),row.fileName||'原文件.pdf'))));
      item.append(btn('删除',safe(async()=>{if(working||backupIterator)throw Error('请先结束当前识别或备份。');if(confirm('删除本机这一份材料？已导出的备份不会改变。')){await vault.remove(row.id);clearReader();await refresh();}})));list.append(item);
    }
    if(!list.children.length)list.append(el('p','','当前没有匹配的私密材料。'));
  }
  async function runRecognition(book){
    if(working||backupIterator)throw Error('请先结束当前任务。');working=true;paused=false;save.disabled=true;pause.hidden=false;const account=vault.generation;let doc,recognizer;
    try{doc=await pdfDocument(await readBookSource(vault,book));recognizer=createRecognizer({...book.ocr,onProgress:message=>{if(account!==vault.generation)throw Error('书库已锁定。');status.textContent=message;}});
      const result=await recognizeBookPages(vault,book,doc.numPages,async p=>{const page=await doc.getPage(p);try{const content=await page.getTextContent();let extracted=embeddedText(content,book.ocr?.layout||'auto');if(book.ocr?.mode==='scan'||!usableText(extracted)||extracted.replace(/\s/g,'').length<30){const canvas=await renderPage(page);try{extracted=(await recognizer.recognize(canvas)).text;}finally{canvas.width=0;canvas.height=0;}}return {text:extracted};}finally{page.cleanup();}},
        {shouldStop:()=>paused,onProgress:(done,total)=>status.textContent='已加密保存 '+done+' / '+total+' 页。'});
      status.textContent=result.status==='ready'?'各页文字已保存。识别结果请对照原页校订。':'已暂停，下次从未完成的页继续。';
    }finally{await recognizer?.terminate();await doc?.destroy();working=false;save.disabled=false;pause.hidden=true;await refresh();}
  }
  const pause=btn('保存当前页后暂停',()=>{paused=true;status.textContent='正在保存当前页，随后暂停…';});pause.hidden=true;
  const save=btn('保存至本机',safe(async()=>{
    if(working||backupIterator)throw Error('请先结束当前任务。');if(!title.value.trim())throw Error('请填写标题。');const f=file.files[0];if(!f&&!article.value.trim())throw Error('请选择文件或填写文章。');if(f&&!/\.(pdf|txt|md)$/i.test(f.name))throw Error('请选择 PDF、TXT 或 Markdown。');if(f&&f.size>64*1024*1024)throw Error('单份本机文件上限为 64 MB。');
    working=true;save.disabled=true;let book;const account=vault.generation;
    try{const metadata={title:title.value.trim(),text:article.value,ocr:{layout:layout.value,script:script.value,mode:mode.value}};
      book=f?await saveBookSource(vault,f,metadata):{...metadata,id:crypto.randomUUID(),kind:'book',status:'ready',pageCount:1,completedPages:1};
      if(f&&/\.(txt|md)$/i.test(f.name)){book.text=article.value+'\n'+decodeArticle(await f.arrayBuffer(),encoding.value);book.status='ready';book.pageCount=1;book.completedPages=1;}
      if(account!==vault.generation)throw Error('书库已锁定。');await vault.put(book);file.value='';article.value='';title.value='';status.textContent='原材料已加密保存。';
    }finally{working=false;save.disabled=false;}
    if(book.mime==='application/pdf')await runRecognition(book);else await refresh();
  }));
  const backup=btn('开始分卷备份',safe(async()=>{
    if(working)throw Error('请先暂停识别，再备份。');
    if(!backupIterator)backupIterator=vault.backupVolumes();
    try{const {value,done}=await backupIterator.next();if(done){backupIterator=null;return;}
      download(new Blob([JSON.stringify(value)],{type:'application/json'}),'观星台-加密书库-'+value.backupId+'-第'+value.part+'卷.json');
      if(value.last){status.textContent='备份已完成，共 '+value.part+' 卷。请将同一次备份的全部文件保存在一起。';backupIterator=null;backup.textContent='开始分卷备份';}
      else{status.textContent='第 '+value.part+' 卷已导出，请继续保存下一卷，直到显示完成。';backup.textContent='保存下一卷';}
    }catch(e){backupIterator=null;backup.textContent='开始分卷备份';throw e;}
  }));
  const restore=el('input');restore.type='file';restore.accept='.json';restore.multiple=true;restore.setAttribute('aria-label','选择同一次备份的全部分卷');restore.addEventListener('change',safe(async()=>{
    if(working||backupIterator)throw Error('请先结束当前任务。');
    try{const files=Array.from(restore.files||[]);if(!files.length)return;if(files.some(f=>f.size>250*1024*1024))throw Error('请使用分卷备份，每卷不超过 250 MB。');const originalPassword=prompt('原备份的独立解锁密码（仅本机使用）');if(originalPassword===null)return;working=true;
      const first=JSON.parse(await files[0].text());if(first.format==='ziwei-encrypted-vault-v1'&&files.length===1)await vault.restore(first,originalPassword);else await vault.restoreVolumes(files,originalPassword,(n,total)=>status.textContent='正在恢复 '+n+' / '+total+' 卷…');
      await refresh();status.textContent='加密备份已恢复为独立的新记录，原有材料保留。';
    }finally{working=false;restore.value='';}
  }));
  function choice(label,options){const select=el('select'),wrapper=el('label','',label);for(const [value,text] of options)select.append(new Option(text,value));wrapper.append(select);tools.append(wrapper);return select;}
  tools.append(title,file,article);
  const layout=choice('PDF 排版',[['auto','自动比较横排 / 竖排'],['horizontal','横排'],['vertical','竖排（从右往左）']]);
  const script=choice('扫描文字',[['mixed','简繁混排 / 不确定'],['traditional','繁体为主'],['simplified','简体为主']]);
  const mode=choice('PDF 识别',[['auto','优先文字层'],['scan','扫描图像识别']]);
  const encoding=choice('文字编码',[['utf-8','UTF-8'],['gb18030','GB18030 / GBK'],['big5','Big5'],['utf-16le','UTF-16 LE'],['utf-16be','UTF-16 BE']]);
  tools.append(save,pause,backup,el('label','','恢复：一次选齐全部分卷（兼容旧版单文件备份）'),restore,btn('锁定书库',()=>{vault.lock();backupIterator=null;backup.textContent='开始分卷备份';refresh();}),query);
  auth.addEventListener('submit',async e=>{e.preventDefault();unlock.disabled=true;try{if(!viewer.core||!viewer.userId)throw Error('请先使用自己的核心账户登录。');await vault.open(viewer.userId,password.value);password.value='';navigator.storage?.persist?.().catch(()=>{});status.textContent='已解锁本机书库。';await refresh();}catch(e){status.textContent=e.message;}finally{unlock.disabled=false;}});
  query.addEventListener('input',safe(refresh));tools.hidden=true;root.append(auth,tools,status,list,reader);
  document.addEventListener('ziwei:session',e=>{viewer=e.detail;vault.lock();backupIterator=null;backup.textContent='开始分卷备份';clearReader();refresh();});document.addEventListener('ziwei:logout',()=>{viewer={};vault.lock();clearReader();refresh();});
  root.append(vaultPasswordReset({vault,title:'本机书库',getViewer:()=>viewer,requiresCore:true,el,btn,onReset:async()=>{password.value='';backupIterator=null;clearReader();await refresh();},onRestored:refresh}));
  document.addEventListener('ziwei:local-password-reset',e=>{if(e.detail?.namespace!=='ziwei-private-vault')return;clearReader();refresh();});
  return vault;
}
