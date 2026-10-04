import {api,el,btn,message,refresh} from './library.js';
import {materialDeleteControl} from './material-delete.mjs';
export function renderManagement(books,viewer) {
  const host=document.querySelector('#manage-books');host.replaceChildren();if(!viewer.owner)return;
  host.append(el('h3','','材料与授权'));
  books.forEach(book=>{
    const box=el('details','managed-book');box.append(el('summary','',`${book.title} · ${book.level==='public'?'公开':'特殊'} · ${book.indexed_pages}/${book.page_count}`));
    const deletion=materialDeleteControl(book,{api,el,btn,onDeleted:async()=>{document.dispatchEvent(new CustomEvent('ziwei:material-deleted',{detail:{id:book.id}}));await refresh();const notice=el('p','review-status',`已删除《${book.title}》。`);notice.setAttribute('role','status');host.prepend(notice);},onPending:async text=>{await refresh();host.prepend(el('p','review-status',text));}});
    if(book.status==='deleting'){box.append(el('p','','文件清理未完成，材料已停止展示。'),deletion);host.append(box);return;}
    const change=el('select');change.setAttribute('aria-label',`${book.title} 的级别`);change.append(new Option('公开','public'),new Option('特殊','special'));change.value=book.level;
    const msg=el('p');msg.setAttribute('role','status');
    box.append(change,btn('保存级别',async()=>{try{await api(`/api/books/${book.id}`,{method:'PATCH',body:JSON.stringify({level:change.value})});await refresh();}catch(e){message(msg,e);}}),el('p','book-quote-note','改为特殊后，新的访问需要授权；已经被他人保存的公开副本无法收回。'));
    if(book.status!=='ready')box.append(btn('继续识别这份材料',()=>document.dispatchEvent(new CustomEvent('ziwei:resume-material',{detail:book}))));
    if(book.level==='special') {
      const form=el('form','grant-form');const label=el('input');label.placeholder='授权备注';label.maxLength=100;label.setAttribute('aria-label','授权备注');
      const kind=el('select');kind.append(new Option('生成访问密钥','key'),new Option('授权指定账号','account'));kind.setAttribute('aria-label','授权方式');
      const subject=el('input');subject.placeholder='对方账号识别码';subject.setAttribute('aria-label','对方账号识别码');subject.hidden=true;kind.addEventListener('change',()=>{subject.hidden=kind.value!=='account';subject.required=kind.value==='account';});
      const days=el('input');days.type='number';days.min=1;days.max=365;days.value=30;days.setAttribute('aria-label','授权有效天数');const create=el('button','book-primary','创建授权');create.type='submit';form.append(kind,label,subject,el('span','','有效天数'),days,create);
      form.addEventListener('submit',async e=>{e.preventDefault();try{const result=await api(`/api/books/${book.id}/grants`,{method:'POST',body:JSON.stringify({kind:kind.value,label:label.value,subject:subject.value,days:Number(days.value)})});msg.replaceChildren(el('span','',result.key?'密钥仅显示这一次，请复制后自行提供给对方。':'账号已获授权。'));if(result.key){const key=el('textarea');key.readOnly=true;key.value=result.key;key.setAttribute('aria-label','新生成的访问密钥');msg.append(key);}await showGrants();}catch(err){message(msg,err);}});
      const grants=el('div','grant-list');async function showGrants(){try{const data=await api(`/api/books/${book.id}/grants`);grants.replaceChildren();data.grants.forEach(g=>{const row=el('div');row.append(el('span','',`${g.label} · ${g.revoked?'已撤销':`至 ${new Date(g.expires_at*1000).toLocaleDateString()}`}`));if(!g.revoked)row.append(btn('撤销',async()=>{try{await api(`/api/books/${book.id}/grants/${g.id}`,{method:'DELETE'});await showGrants();}catch(e){message(msg,e);}}));grants.append(row);});}catch(err){message(grants,err);}}
      box.addEventListener('toggle',()=>{if(box.open)showGrants();});box.append(form,grants);
    }
    box.append(msg,deletion);host.append(box);
  });
}
