export function materialDeleteControl(book,{api,el,btn,onDeleted,onPending}){
  const panel=el('details','material-delete');
  panel.append(el('summary','',book.status==='deleting'?'继续删除（上次清理未完成）':'删除这份材料'));
  panel.append(el('p','','删除后，该材料的原文件、页图、文字、校订历史、关联摘录卡与规则、审核提交及访问授权都会移除，无法在此撤销。独立自编技法卡、账户和命例不受影响。'));
  panel.append(el('p','book-quote-note','既有系统备份及已下载的副本不会在此清除。'));
  const form=el('form'),label=el('label','','输入完整书名确认'),title=el('input');title.type='text';title.required=true;title.maxLength=160;title.autocomplete='off';title.setAttribute('aria-label','输入完整书名确认删除');label.append(title);
  const check=el('label','review-check'),confirmed=el('input');confirmed.type='checkbox';confirmed.required=true;check.append(confirmed,document.createTextNode('我确认删除以上关联内容'));
  const status=el('p');status.setAttribute('role','status');
  const remove=el('button','book-danger',book.status==='deleting'?'继续删除':'确认删除');remove.type='submit';remove.disabled=true;
  const update=()=>{remove.disabled=title.value!==book.title||!confirmed.checked;};title.addEventListener('input',update);confirmed.addEventListener('change',update);
  const cancel=btn('取消',()=>{panel.open=false;title.value='';confirmed.checked=false;status.textContent='';update();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(remove.disabled||title.value!==book.title||!confirmed.checked)return;
    title.disabled=confirmed.disabled=remove.disabled=cancel.disabled=true;status.textContent='正在删除并清理文件，请稍候…';
    document.dispatchEvent(new CustomEvent('ziwei:material-deleting',{detail:{id:book.id}}));
    try{
      await api(`/api/books/${book.id}`,{method:'DELETE',body:JSON.stringify({title:title.value,sourceHash:book.source_hash,confirmed:true})});
      status.textContent='删除完成。';await onDeleted();
    }catch(error){status.textContent=error.message||'删除未完成，请重试。';if(error.status===503)await onPending?.(status.textContent);}
    finally{title.disabled=confirmed.disabled=cancel.disabled=false;update();}
  });
  form.append(label,check,remove,cancel,status);panel.append(form);return panel;
}
