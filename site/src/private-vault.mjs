import {rankText,matchLabel,bestSnippet} from './search-ranking.mjs';
import {createRecognizer,embeddedText,usableText,renderPage,decodeArticle} from './text-recognition.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ziwei-private-vault',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('无法打开本机保存空间。'));});}
async function store(mode,action){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),request=action(tx.objectStore('records'));let value;request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(Error('本机保存失败，请检查剩余空间。'));tx.onabort=()=>reject(Error('本机保存已中止。'));});}finally{db.close();}}
async function keyFrom(password,salt){const raw=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:250000},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export function createVault(){
  let key=null,owner='',epoch=0;
  const lock=()=>{key=null;epoch++;document.dispatchEvent(new Event('ziwei:vault-locked'));};
  async function open(user,password){
    lock();const generation=epoch;owner=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(user))));
    let header=await store('readonly',s=>s.get(owner+':header'));
    if(!header&&password.length<12)throw Error('新书库的解锁密码至少 12 位，请妥善保存。');
    const salt=header?bytes(header.salt):crypto.getRandomValues(new Uint8Array(16)),next=await keyFrom(password,salt);
    if(header){try{await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(header.iv)},next,bytes(header.check));}catch{throw Error('书库解锁密码不正确。');}}
    else {const iv=crypto.getRandomValues(new Uint8Array(12)),check=await crypto.subtle.encrypt({name:'AES-GCM',iv},next,encoder.encode('ziwei-vault-v1'));await store('readwrite',s=>s.put({id:owner+':header',owner,salt:base64(salt),iv:base64(iv),check:base64(new Uint8Array(check))}));}
    if(generation!==epoch)throw Error('账户已变化，请重新解锁。');key=next;return true;
  }
  async function put(value){if(!key)throw Error('请先解锁本机私密书库。');const generation=epoch,account=owner,id=value.id||crypto.randomUUID(),iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify({...value,id})));
    if(generation!==epoch)throw Error('书库已锁定。');await store('readwrite',s=>s.put({id:account+':'+id,owner:account,iv:base64(iv),data:base64(new Uint8Array(data))}));return id;
  }
  async function list(){if(!key)return [];const active=key,account=owner,generation=epoch,rows=await store('readonly',s=>s.getAll()),out=[];
    for(const row of rows.filter(r=>r.owner===account&&r.data)){const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(row.iv)},active,bytes(row.data));out.push(JSON.parse(decoder.decode(data)));}
    return generation===epoch?out:[];
  }
  async function backup(){if(!key)throw Error('请先解锁。');return {format:'ziwei-encrypted-vault-v1',records:(await store('readonly',s=>s.getAll())).filter(r=>r.owner===owner)};}
  async function restore(value,password){if(!key)throw Error('请先解锁当前书库。');if(value?.format!=='ziwei-encrypted-vault-v1'||!Array.isArray(value.records)||value.records.length>1000)throw Error('备份格式不正确。');
    const header=value.records.find(r=>r.check&&r.salt);if(!header)throw Error('备份缺少解锁信息。');const backupKey=await keyFrom(password,bytes(header.salt));
    const entries=value.records.filter(r=>r.data),decoded=[];
    for(const row of entries){try{const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(row.iv)},backupKey,bytes(row.data));decoded.push(JSON.parse(decoder.decode(raw)));}catch{throw Error('原备份的解锁密码不正确，或备份已损坏。');}}
    for(const entry of decoded)await put({...entry,id:crypto.randomUUID()});
  }
  return {open,lock,put,list,backup,restore,get generation(){return epoch;},get unlocked(){return Boolean(key);},async remove(id){if(!key)throw Error('请先解锁。');await store('readwrite',s=>s.delete(owner+':'+id));}};
}
export function initPrivateLibrary({el,btn}){
  const vault=createVault(),root=document.querySelector('#private-access');let viewer={},generation=0,urls=[];
  root.replaceChildren();const auth=el('form','tech-editor'),password=el('input'),status=el('p'),list=el('div'),tools=el('div','tech-editor');password.type='password';password.autocomplete='off';password.placeholder='本机书库独立解锁密码';password.required=true;
  const unlock=el('button','book-primary','创建 / 解锁书库');auth.append(el('h2','','本机加密书库'),el('p','muted','首次填写密码会建立书库。材料只保存在当前浏览器；请导出加密备份以便迁移。独立密码不会发送到服务器。'),password,unlock);
  const title=el('input'),file=el('input'),article=el('textarea'),query=el('input');title.placeholder='材料标题';file.type='file';file.accept='.pdf,.txt,.md';article.placeholder='或直接粘贴私密文章，仅在本机保存';article.rows=5;query.type='search';query.placeholder='查找标题或已保存文字';
  function download(blob,name){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  async function refresh(){const run=++generation;list.replaceChildren();tools.hidden=!vault.unlocked;auth.hidden=vault.unlocked;if(!vault.unlocked)return;
    const normalize=window.ZiweiBookSearch.normalize,q=query.value;const rows=await vault.list();if(run!==generation)return;
    const matches=rows.filter(r=>r.kind==='book').map(row=>({row,score:Math.max(rankText(row.title,q,normalize)*.97,rankText(row.text||'',q,normalize))})).filter(r=>!q.trim()||r.score>=55).sort((a,b)=>b.score-a.score);
    for(const {row,score} of matches){const item=el('article','tech-card');item.append(el('h3','',row.title),el('small','muted',row.fileName||'本机文章'));
      if(q.trim())item.append(el('small','book-match',`${matchLabel(Math.round(score))} · 相关度 ${Math.round(score)}`),el('p','',bestSnippet(row.text||'',q,normalize)));
      if(row.text){const d=el('details');d.append(el('summary','','查看已保存文字'),el('pre','raw-page-text',row.text));item.append(d);}
      if(row.file)item.append(btn('打开原文件',()=>{const blob=new Blob([bytes(row.file)],{type:/\.pdf$/i.test(row.fileName||'')?'application/pdf':'text/plain'});const url=URL.createObjectURL(blob);urls.push(url);window.open(url,'_blank','noopener');}),btn('导出原文件',()=>download(new Blob([bytes(row.file)],{type:row.mime}),row.fileName)));
      item.append(btn('删除',()=>{if(confirm('删除本机这一份材料？已导出的备份不会改变。'))vault.remove(row.id).then(refresh).catch(e=>status.textContent=e.message);}));list.append(item);
    }if(!list.children.length)list.append(el('p','','当前没有匹配的私密材料。'));
  }
  const save=btn('保存至本机',async()=>{save.disabled=true;const saveGeneration=vault.generation;try{if(!title.value.trim())throw Error('请填写标题。');const f=file.files[0];if(!f&&!article.value.trim())throw Error('请选择文件或填写文章。');if(f&&!/\.(pdf|txt|md)$/i.test(f.name))throw Error('请选择 PDF、TXT 或 Markdown 文件。');if(f&&f.size>64*1024*1024)throw Error('单份本机文件上限为 64 MB。');let text=article.value;
    if(f&&/\.(txt|md)$/i.test(f.name))text+='\n'+decodeArticle(await f.arrayBuffer(),encoding.value);
    if(f&&/\.pdf$/i.test(f.name)){status.textContent='正在本机提取 PDF 文字…';const pdf=await import('./vendor/pdf/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc='./vendor/pdf/pdf.worker.mjs';const doc=await pdf.getDocument({data:new Uint8Array(await f.arrayBuffer()),cMapUrl:'./vendor/pdf/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdf/standard_fonts/',wasmUrl:'./vendor/pdf/wasm/',isEvalSupported:false}).promise;
      const recognizer=createRecognizer({layout:layout.value,script:script.value,onProgress:message=>status.textContent=message});
      try{for(let p=1;p<=doc.numPages;p++){if(!vault.unlocked)throw Error('书库已锁定，识别已停止。');status.textContent=`正在本机识别 ${p} / ${doc.numPages} 页…`;const page=await doc.getPage(p),content=await page.getTextContent();let extracted=embeddedText(content,layout.value);if(mode.value==='scan'||!usableText(extracted)||extracted.replace(/\s/g,'').length<30){const canvas=await renderPage(page);try{extracted=(await recognizer.recognize(canvas)).text;}finally{canvas.width=0;canvas.height=0;}}text+=`\n[第 ${p} 页]\n`+extracted;page.cleanup();}}finally{await recognizer.terminate();await doc.destroy();}}
    const encodedFile=f?base64(new Uint8Array(await f.arrayBuffer())):null;
    if(!vault.unlocked||vault.generation!==saveGeneration)throw Error('账户或解锁状态已变化，本次识别未保存。请重新解锁后导入。');
    await vault.put({kind:'book',title:title.value.trim(),text,file:encodedFile,fileName:f?.name,mime:f?(/\.pdf$/i.test(f.name)?'application/pdf':'text/plain'):undefined,updatedAt:Date.now()});file.value='';article.value='';title.value='';status.textContent='已加密保存到本机。机器识别文字可检索，请对照原文件校订。';await refresh();
  }catch(e){status.textContent=e.message;}finally{save.disabled=false;}});
  const restore=el('input');restore.type='file';restore.accept='.json';restore.setAttribute('aria-label','导入加密备份');restore.addEventListener('change',async()=>{try{const f=restore.files[0];if(!f)return;if(f.size>250*1024*1024)throw Error('备份过大。');const originalPassword=prompt('请输入原备份的独立解锁密码（仅本机使用）');if(originalPassword===null)return;await vault.restore(JSON.parse(await f.text()),originalPassword);await refresh();status.textContent='备份已恢复为新记录。';}catch(e){status.textContent=e.message;}finally{restore.value='';}});
  function choice(label,options){const select=el('select'),wrapper=el('label','',label);for(const [value,text] of options)select.append(new Option(text,value));wrapper.append(select);tools.append(wrapper);return select;}
  tools.append(title,file,article);
  const layout=choice('PDF 排版',[['auto','自动比较横排 / 竖排'],['horizontal','横排'],['vertical','竖排（从右往左）']]);
  const script=choice('扫描文字',[['mixed','简繁混排 / 不确定'],['traditional','繁体为主'],['simplified','简体为主']]);
  const mode=choice('PDF 识别',[['auto','优先文字层'],['scan','扫描图像识别']]);
  const encoding=choice('文字文件编码',[['utf-8','UTF-8'],['gb18030','GB18030 / GBK'],['big5','Big5'],['utf-16le','UTF-16 LE'],['utf-16be','UTF-16 BE']]);
  tools.append(save,btn('导出加密备份',async()=>{try{download(new Blob([JSON.stringify(await vault.backup())],{type:'application/json'}),'观星台-本机加密书库.json');}catch(e){status.textContent=e.message;}}),el('label','','恢复加密备份'),restore,btn('锁定书库',()=>{vault.lock();refresh();}),query);
  auth.addEventListener('submit',async e=>{e.preventDefault();unlock.disabled=true;try{if(!viewer.core||!viewer.userId)throw Error('请先使用自己的核心账户登录。');await vault.open(viewer.userId,password.value);password.value='';navigator.storage?.persist?.().catch(()=>{});status.textContent='已解锁本机书库。';await refresh();}catch(e){status.textContent=e.message;}finally{unlock.disabled=false;}});
  query.addEventListener('input',()=>refresh().catch(e=>status.textContent=e.message));tools.hidden=true;root.append(auth,tools,status,list);
  document.addEventListener('ziwei:session',e=>{viewer=e.detail;vault.lock();for(const url of urls)URL.revokeObjectURL(url);urls=[];refresh();});document.addEventListener('ziwei:logout',()=>{vault.lock();refresh();});
  return vault;
}
