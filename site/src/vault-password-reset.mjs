// Local-only recovery controls. Passwords and encrypted records never enter an API request.
export function vaultPasswordReset({vault,title,getViewer,el,btn,onReset=()=>{},onRestored=()=>{},requiresCore=false}){
  const root=el('details','storage-panel'),form=el('form','tech-editor'),password=el('input'),again=el('input'),phrase=el('input'),status=el('p'),archives=el('div');let epoch=0,busy=false;
  root.append(el('summary','',`忘记${title}密码 / 重置`),el('p','muted',`此密码与账户登录密码不同。重置只在当前设备为“${title}”建立空白加密空间，旧资料仍以密文保留；新密码无法打开旧资料，恢复旧资料必须记得旧密码。不会修改云端账户密码，也不会重置其他加密空间。`));
  const field=(label,node)=>{const l=el('label','',label);l.append(node);return l;};
  password.type=again.type='password';password.autocomplete=again.autocomplete='new-password';password.minLength=12;password.maxLength=again.maxLength=128;password.required=again.required=phrase.required=true;phrase.autocomplete='off';phrase.placeholder='重建加密空间';
  const submit=el('button','book-primary','保留旧密文并重建');submit.type='submit';status.setAttribute('role','status');
  form.append(field('新解锁密码（12–128 位）',password),field('再次输入新解锁密码',again),field('请输入“重建加密空间”确认',phrase),submit);root.append(form,status,archives);
  async function account(){const ticket=epoch,v=getViewer();if(!v?.authenticated||!v.userId||requiresCore&&!v.core)throw Error(requiresCore?'请先使用自己的核心账户登录。':'请先登录个人账户。');const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'}),s=await r.json();if(!r.ok||ticket!==epoch||!s.authenticated||s.userId!==v.userId||requiresCore&&!s.core)throw Error('登录已变化，请重新登录。');return {ticket,user:v.userId};}
  async function perform(fn){if(busy)return;busy=true;submit.disabled=true;const ticket=epoch;try{await fn();}catch(e){if(ticket===epoch)status.textContent=e.message;}finally{busy=false;submit.disabled=false;}}
  form.onsubmit=e=>{e.preventDefault();perform(async()=>{
    if(!form.reportValidity())return;if(password.value!==again.value)throw Error('两次输入的新解锁密码不一致。');
    const {ticket,user}=await account();status.textContent='正在保留旧密文并建立新加密空间…';
    const result=await vault.resetPassword(user,password.value,phrase.value,()=>ticket===epoch&&getViewer()?.userId===user);
    if(ticket!==epoch)return;form.reset();await onReset();status.textContent=result.archived?'新密码已设置，旧密文已保留。请用新密码解锁；新空间需要重新录入资料或 API 配置。':'新密码已设置，请用新密码解锁。';await showArchives();
  });};
  async function showArchives(){const {ticket,user}=await account(),rows=await vault.archives(user);if(ticket!==epoch)return;archives.replaceChildren();if(!rows.length){archives.append(el('p','muted','当前账户在此设备没有保留的旧密文。'));return;}
    for(const row of rows){const item=el('article','storage-panel'),old=el('input');old.type='password';old.autocomplete='off';old.maxLength=128;item.append(el('p','',`重置前的密文 · ${row.createdAt}`),field('旧资料原密码',old),btn('用旧密码恢复到当前空间',()=>perform(async()=>{
      const {ticket:check,user:owner}=await account();if(!vault.unlocked)throw Error('请先用新密码解锁当前空间，再输入旧密码恢复。');
      await vault.restoreArchive(owner,row.id,old.value);if(check!==epoch)return;old.value='';await onRestored();status.textContent='旧资料已复制回当前加密空间，旧密文仍保留。API 配置可重新选择使用。';
    })));archives.append(item);}
  }
  root.append(btn('查看保留的旧密文',()=>perform(showArchives)));
  const clear=()=>{epoch++;form.reset();archives.replaceChildren();status.textContent='';root.open=false;queueMicrotask(()=>{const v=getViewer();root.hidden=!v?.authenticated||requiresCore&&!v.core;});};
  for(const event of ['ziwei:session','ziwei:logout'])document.addEventListener(event,clear);window.addEventListener('pagehide',clear);clear();return root;
}
