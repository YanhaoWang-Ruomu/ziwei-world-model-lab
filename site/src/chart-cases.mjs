// Account-owned case records. No birth data is cached in browser storage.
import {initCaseImport,downloadCases} from './case-import-panel.mjs';
export function initChartCases({getChart,loadChart,applyDefaultSettings=()=>{},resetChart=()=>{}}){
  const $=s=>document.querySelector(s),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let viewer={},generation=0,current=null,records=[],pendingSave=null,preferences=null,userTouched=false;
  const dialog=el('dialog','case-dialog');dialog.id='case-dialog';
  dialog.innerHTML='<header><div><p>观星台 · 个人命例</p><h2 id="case-heading">我的命例</h2></div><button type="button" id="case-close" aria-label="关闭命例窗口">关闭 ×</button></header><div class="case-dialog-content"><p id="case-account-note"></p><form id="case-save-form" hidden><label>命例名称<input id="case-title" maxlength="60" required autocomplete="off"></label><p id="case-save-summary"></p><label class="case-check" id="case-update-label" hidden><input type="checkbox" id="case-update">更新当前命例</label><p class="case-storage-note">保存后，出生资料与排盘口径存入当前账户，仅此账户可读取。私密技法不会随命例保存。</p><button type="submit" id="case-save-submit">保存到我的账户</button></form><div class="case-list-tools"><input id="case-search" placeholder="按名称查找命例" aria-label="查找我的命例" type="search"><button type="button" id="case-refresh">刷新</button></div><p id="case-status" role="status"></p><div id="case-records"></div></div>';
  dialog.setAttribute('aria-labelledby','case-heading');document.body.append(dialog);
  const status=$('#case-status'),list=$('#case-records'),saveForm=$('#case-save-form');
  const defaults=el('section','case-defaults');defaults.innerHTML='<h3>我的默认命盘</h3><label>下次打开的命盘<select id="case-default-select"><option value="">暂不设置</option></select></label><label class="case-check"><input type="checkbox" id="case-auto-open">登录后自动打开这份命盘</label><p>跟随当前账户保存。打开其他命例不会改变默认命盘。</p>';
  saveForm.before(defaults);
  const saveDefault=el('label','case-check');saveDefault.innerHTML='<input type="checkbox" id="case-save-default">同时设为我的默认命盘，下次自动打开';saveForm.querySelector('button').before(saveDefault);
  const transfer=el('div','case-transfers'),exportButton=el('button','','导出全部命例');exportButton.type='button';transfer.append(exportButton);defaults.after(transfer);
  const importHost=el('div');transfer.append(importHost);
  const button=(label,fn)=>{const b=el('button','',label);b.type='button';b.addEventListener('click',fn);return b;};
  async function api(path,options={}){
    const response=await fetch(path,{...options,cache:'no-store',headers:options.body?{'Content-Type':'application/json'}:{}}),data=await response.json();
    if(!response.ok)throw Error(data.error||'命例暂时无法读取，请重试。');return data;
  }
  function syncButtons(){document.querySelectorAll('[data-case-save]').forEach(b=>b.disabled=!getChart());}
  const importer=initCaseImport({host:importHost,status,onImported:async()=>{current=null;await refresh();}});
  async function exportRecords(id){const ticket=generation;try{const data=await api('/api/cases/export'+(id?'?id='+encodeURIComponent(id):''));if(ticket!==generation)return;downloadCases(data,id?'观星台-单份命例.json':undefined);status.textContent='命例文件已生成，包含出生资料与当时的安星设置。';}catch(e){if(ticket===generation)status.textContent=e.message;}}
  exportButton.addEventListener('click',()=>exportRecords());
  function clear(){++generation;current=null;records=[];pendingSave=null;preferences=null;list.replaceChildren();saveForm.reset();saveForm.hidden=true;status.textContent='';importer.clear();paintPreferences();syncButtons();}
  function paintPreferences(){const select=$('#case-default-select');select.replaceChildren(new Option('暂不设置',''),...records.map(r=>new Option(r.title,r.id)));select.value=preferences?.defaultCaseId||'';$('#case-auto-open').checked=Boolean(preferences?.autoOpen);$('#case-auto-open').disabled=!preferences?.defaultCaseId;}
  async function savePreferences(change){const ticket=generation;const data=await api('/api/chart-preferences');if(ticket!==generation)return;const saved=await api('/api/chart-preferences',{method:'PUT',body:JSON.stringify({...data.preferences,...change})});if(ticket!==generation)return;preferences=saved.preferences;paintPreferences();paint();status.textContent=preferences.autoOpen?'已设置，下次登录将自动打开这份命盘。':'默认命盘设置已保存。';}
  $('#case-default-select').addEventListener('change',()=>{const id=$('#case-default-select').value;savePreferences({defaultCaseId:id||null,autoOpen:Boolean(id)}).catch(e=>{status.textContent=e.message;paintPreferences();});});
  $('#case-auto-open').addEventListener('change',()=>savePreferences({autoOpen:$('#case-auto-open').checked}).catch(e=>{status.textContent=e.message;paintPreferences();}));
  function paint(){
    list.replaceChildren();const query=$('#case-search').value.trim().toLocaleLowerCase(),filtered=records.filter(r=>r.title.toLocaleLowerCase().includes(query));
    if(!filtered.length){list.append(el('p','case-empty',query?'没有找到这个名称的命例。':'还没有保存命例。起盘后，点击“保存命例”。'));return;}
    for(const record of filtered){
      const row=el('article','case-record'),copy=el('div','case-record-copy');
      copy.append(el('h3','',record.title),el('p','',`${record.birth.date} ${record.birth.time} · ${record.birth.gender}命`),el('small','',`${record.provider==='public'?'公开算法':'若木安星'} · ${new Date(record.updatedAt*1000).toLocaleDateString('zh-CN')}`));
      if(preferences?.defaultCaseId===record.id)copy.append(el('span','case-default-badge','我的默认命盘'));
      const actions=el('div','case-record-actions');
      actions.append(button('打开命盘',async()=>{
        userTouched=true;const ticket=generation;status.textContent='正在打开命例…';
        try{const data=await api('/api/cases/'+record.id);if(ticket!==generation)return;dialog.close();const loaded=await loadChart(data.case);if(ticket!==generation)return;if(loaded){current=data.case;document.dispatchEvent(new CustomEvent('ziwei:case-opened',{detail:{title:current.title}}));}}
        catch(error){if(ticket===generation)status.textContent=error.message;}
      }),button('设为默认',()=>savePreferences({defaultCaseId:record.id,autoOpen:true}).catch(e=>{status.textContent=e.message;})),button('导出',()=>exportRecords(record.id)),button('删除',()=>{
        actions.replaceChildren(el('span','case-delete-note','删除这份命例？'),button('确认删除',async()=>{
          const ticket=generation;try{await api('/api/cases/'+record.id,{method:'DELETE'});if(ticket!==generation)return;if(current?.id===record.id)current=null;await refresh();status.textContent='命例已删除。';}catch(error){if(ticket===generation)status.textContent=error.message;}
        }),button('取消',paint));
      }));row.append(copy,actions);list.append(row);
    }
  }
  async function refresh(){
    const ticket=++generation;status.textContent='正在读取你的命例…';list.replaceChildren();
    try{const data=await api('/api/cases');if(ticket!==generation)return;records=data.cases;preferences=data.preferences;paintPreferences();paint();status.textContent=`已保存 ${records.length} 份命例`;}catch(error){if(ticket===generation)status.textContent=error.message;}
  }
  async function open(save){
    userTouched=true;
    const session=await api('/api/session');if(viewer.userId!==session.userId){clear();viewer=session;}
    if(!session.authenticated){document.querySelector('#chart-mobile-sheet[open]')?.close();location.hash='account';$('#personal-username')?.focus();$('#personal-account-status').textContent='请先登录个人账户，再保存或查看命例。';return;}
    $('#case-account-note').textContent=`${session.username||'ChatGPT 账户'} · 仅显示自己的命例`;
    pendingSave=save?getChart():null;saveForm.hidden=!pendingSave;
    $('#case-heading').textContent=pendingSave?'保存命例':'我的命例';
    if(pendingSave){$('#case-title').value=current?.title||pendingSave.birth.name||'未命名命例';$('#case-save-summary').textContent=`${pendingSave.birth.date} ${pendingSave.birth.time} · ${pendingSave.birth.gender}命`;$('#case-update-label').hidden=!current;$('#case-update').checked=Boolean(current);$('#case-save-default').checked=Boolean(current&&current.id===preferences?.defaultCaseId);}
    $('#case-search').value='';if(!dialog.open)dialog.showModal();await refresh();
  }
  document.querySelectorAll('[data-case-save]').forEach(b=>b.addEventListener('click',()=>open(true).catch(e=>{document.querySelector('#chart-status').textContent=e.message;})));
  document.querySelectorAll('[data-cases-open]').forEach(b=>b.addEventListener('click',()=>open(false).catch(e=>{document.querySelector('#personal-account-status').textContent=e.message;document.querySelector('#chart-status').textContent=e.message;})));
  saveForm.addEventListener('submit',async e=>{
    e.preventDefault();if(!pendingSave)return;const ticket=generation,update=$('#case-update').checked&&current,makeDefault=$('#case-save-default').checked,body={title:$('#case-title').value,...pendingSave};if(update)body.revision=current.revision;
    $('#case-save-submit').disabled=true;status.textContent='正在保存…';
    try{const data=await api('/api/cases'+(update?'/'+current.id:''),{method:update?'PUT':'POST',body:JSON.stringify(body)});if(ticket!==generation)return;current=data.case;saveForm.hidden=true;pendingSave=null;await refresh();if(makeDefault)await savePreferences({defaultCaseId:data.case.id,autoOpen:true});else status.textContent='已保存到当前账户，下次登录可以继续使用。';}
    catch(error){if(ticket===generation)status.textContent=error.message;}
    finally{$('#case-save-submit').disabled=false;}
  });
  $('#case-close').addEventListener('click',()=>dialog.close());$('#case-refresh').addEventListener('click',refresh);$('#case-search').addEventListener('input',paint);
  async function sessionChanged(next){const changed=viewer.userId!==next.userId;if(!changed&&viewer.authenticated===next.authenticated)return;const previous=viewer.userId;viewer=next;if(changed){clear();dialog.close();if(previous){resetChart();userTouched=false;}}if(!next.authenticated)return;const ticket=generation;try{const data=await api('/api/chart-preferences');if(ticket!==generation)return;preferences=data.preferences;document.dispatchEvent(new CustomEvent('ziwei:chart-preferences',{detail:preferences}));if(userTouched)return;if(preferences.autoOpen&&preferences.defaultCaseId){const found=await api('/api/cases/'+preferences.defaultCaseId);if(ticket!==generation||userTouched)return;const loaded=await loadChart(found.case,{automatic:true});if(ticket!==generation)return;if(loaded){current=found.case;document.dispatchEvent(new CustomEvent('ziwei:case-opened',{detail:{title:current.title}}));}}else if(preferences.defaultSettings){applyDefaultSettings(preferences.defaultSettings);}}catch(error){if(ticket===generation)$('#chart-status').textContent='默认命盘暂未打开：'+error.message;}}
  document.addEventListener('ziwei:session',e=>sessionChanged(e.detail));
  document.addEventListener('ziwei:logout',()=>{clear();viewer={};userTouched=false;dialog.close();});
  const markTouched=()=>{userTouched=true;};$('#birth-form')?.addEventListener('input',markTouched);$('#birth-form')?.addEventListener('submit',markTouched);$('#chart-clear')?.addEventListener('click',markTouched);$('#chart-example').addEventListener('click',markTouched);
  const initial=generation;api('/api/session').then(session=>{if(initial===generation)sessionChanged(session);}).catch(()=>{});
  document.addEventListener('ziwei:chart-updated',syncButtons);document.addEventListener('ziwei:chart-cleared',clear);
  document.querySelector('#chart-example').addEventListener('click',()=>{current=null;});syncButtons();
  return {close(){dialog.close();}};
}
