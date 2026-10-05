import {initBackupRestore} from './storage-restore.mjs';
export function initStorage({api,el,btn}){
  let viewer={},generation=0;
  const account=document.querySelector('#account'),panel=el('section','storage-panel');
  panel.append(el('h2','','资料保存'));const status=el('p','storage-status','正在连接保存位置…');status.setAttribute('role','status');
  const counts=el('div','storage-counts'),actions=el('div','storage-actions'),backup=btn('立即备份记录',async()=>{
    backup.disabled=true;status.textContent='正在备份已保存的记录…';
    try{const result=await api('/api/storage/backups',{method:'POST'});await refresh();if(result.pending||result.busy)status.textContent='记录仍已保存。当前备份正在等待，请稍后刷新检查。';}catch(e){status.textContent=e.message;}finally{backup.disabled=false;}
  });
  actions.append(btn('检查保存状态',()=>refresh()),backup);panel.append(status,counts,actions,el('p','storage-note','账户、命例、书籍文章、校订稿、卡片、规则与审核记录保存在当前保存位置。原文件和页图独立保存；退出登录、刷新和网站更新不会主动清除这些资料。密码只保存校验值。'));account.append(panel);
  const notices=[document.querySelector('#materials .library-heading'),document.querySelector('#library .library-heading')].filter(Boolean).map(host=>{const n=el('p','storage-location');host.after(n);return n;});
  const recovery=initBackupRestore({api,el,btn,host:panel,onRestored:()=>refresh()});
  const names={personal_accounts:'注册账户',chart_cases:'命例',books:'书籍 / 文章',pages:'已保存页文',page_revisions:'校订历史',technique_cards:'技法卡片',card_rules:'计算规则',card_submissions:'审核记录',core_members:'核心授权',grants:'材料授权',workspace_drafts:'编辑草稿'};
  async function refresh(){
    const ticket=++generation;status.textContent='正在检查…';
    try{
      const data=await api('/api/storage');if(ticket!==generation)return;
      const local=data.location==='local',place=local?'本机资料库':'正式网站资料库';
      const note=local?'当前是本机资料库，与正式网站分别保存。需要跨设备使用的资料，请在正式网站登录后保存。':'当前是正式网站资料库，已保存内容可在其他设备登录相同账户后继续使用。';
      notices.forEach(n=>n.textContent=note);status.textContent=`${place}连接正常${data.missingOriginals?' · 部分原文件需要检查':''}。`;
      counts.replaceChildren();for(const [key,value]of Object.entries(data.counts||{chart_cases:data.personalCases})){const item=el('div');item.append(el('strong','',String(value)),el('span','',names[key]||key));counts.append(item);}
      if(data.backup?.backup_at)counts.append(el('p','storage-note','上次记录备份：'+new Date(data.backup.backup_at*1000).toLocaleString('zh-CN')));
      if(data.backup?.backup_error)counts.append(el('p','storage-warning','最近一次记录备份未完成；现有资料仍保存在资料库，可重试备份。'));
      if(data.incomplete)counts.append(el('p','storage-note',`${data.incomplete} 份材料尚未识别完成。已保存的原文件与页面保留，可从材料管理继续。`));
      if(data.missingOriginals)counts.append(el('p','storage-warning',`${data.missingOriginals} 份材料的原文件暂不可读取，请保留手头原文件。`));
      backup.hidden=!viewer.founder;
      document.querySelectorAll('[data-save-location]').forEach(n=>n.textContent=place);
    }catch(e){if(ticket!==generation)return;status.textContent='暂时无法读取保存位置。这不代表资料为空或已被删除，请稍后重试。';notices.forEach(n=>n.textContent=status.textContent);}
  }
  return {async setViewer(next){viewer=next;backup.hidden=!viewer.founder;recovery.setViewer(next);await refresh();},refresh};
}

// Version checks preserve another tab's draft instead of silently overwriting it.
export function attachDraft({api,form,key,kind,bookId=null,read,write,el,btn,onRestore}){
  let revision=0,ready=false,dirty=false,saving=false,closed=false;
  const bar=el('div','draft-actions'),status=el('span','draft-status','正在查找已保存草稿…');status.setAttribute('role','status');
  const save=btn('保存编辑草稿',()=>persist()),restore=btn('载入已保存草稿',()=>load(true));bar.append(save,restore,status);form.append(bar);save.disabled=true;restore.hidden=true;
  form.addEventListener('input',()=>{dirty=true;status.textContent='有尚未保存的修改。';});
  async function load(apply=false){
    try{const data=await api('/api/drafts?key='+encodeURIComponent(key));if(closed)return;revision=data.draft?.revision||0;ready=true;save.disabled=false;restore.hidden=!data.draft;
      if(data.draft){if(apply){write(data.draft.payload);dirty=false;onRestore?.();status.textContent='已载入保存的草稿，请核对后继续。';}else status.textContent='找到已保存的编辑草稿，可点击载入。';}
      else status.textContent='草稿可单独保存，尚不提交审核。';
    }catch(e){status.textContent=e.message;}
  }
  async function persist(){
    if(!ready||saving||closed)return false;saving=true;save.disabled=true;
    const payload=read();try{const result=await api('/api/drafts',{method:'PUT',body:JSON.stringify({key,kind,bookId,payload,revision})});revision=result.revision;dirty=false;restore.hidden=false;status.textContent='编辑草稿已保存。';return true;}catch(e){status.textContent=e.message;return false;}finally{saving=false;save.disabled=false;}
  }
  async function discard(){if(revision){try{await api('/api/drafts',{method:'DELETE',body:JSON.stringify({key,kind,bookId,revision})});revision=0;}catch{}}dirty=false;}
  function unload(e){if(dirty){e.preventDefault();e.returnValue='';}}window.addEventListener('beforeunload',unload);
  load();return {persist,discard,close(){closed=true;window.removeEventListener('beforeunload',unload);bar.remove();}};
}
