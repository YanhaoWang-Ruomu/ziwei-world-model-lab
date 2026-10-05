export function initAccountSecurity({api,onSession}){
  const root=document.querySelector('#account'),manage=document.createElement('details'),recover=document.createElement('details');
  manage.className=recover.className='storage-panel';
  manage.innerHTML='<summary>账户安全 · 修改密码与恢复码</summary><form><label>当前密码<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></label><label>新密码<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128"></label><label>再输入一次新密码<input name="confirmPassword" type="password" autocomplete="new-password"></label><button type="submit" class="book-primary">修改密码并退出旧登录</button><button type="button" data-recovery class="book-secondary">生成 / 更换恢复码</button></form><p data-state role="status"></p><div data-secret hidden><p>请将恢复码保存在你控制的安全位置。它只在此处显示一次；新码会替换旧码，重设密码后失效。</p><textarea readonly aria-label="一次性账户恢复码"></textarea><button type="button" data-copy>复制恢复码</button><button type="button" data-hide>我已保存，隐藏</button></div>';
  recover.innerHTML='<summary>忘记密码 · 用恢复码重设</summary><p>使用此前在账户安全中保存的恢复码。未预先保存恢复码的账户暂不能通过此方式找回；ChatGPT 登录账户请使用原登录入口。</p><form><label>用户名<input name="username" autocomplete="username" required></label><label>恢复码<input name="recoveryCode" autocomplete="off" required spellcheck="false"></label><label>新密码<input name="newPassword" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><label>再次输入新密码<input name="confirmPassword" type="password" autocomplete="new-password" required></label><button class="book-primary">重设密码</button></form><p role="status"></p>';
  root.append(manage,recover);let epoch=0;
  function hide(){manage.querySelector('[data-secret]').hidden=true;manage.querySelector('textarea').value='';}
  async function perform(panel,path,extra={}){const form=panel.querySelector('form'),status=panel.querySelector('[role=status]'),ticket=epoch,values=Object.fromEntries(new FormData(form));
    if(path!=='recovery-code'&&values.newPassword!==values.confirmPassword){status.textContent='两次输入的新密码不一致。';return;}
    delete values.confirmPassword;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='正在保存…';
    try{const data=await api('/api/account/'+path,{method:'POST',body:JSON.stringify({...values,...extra})});if(ticket!==epoch)return;form.reset();hide();
      if(data.recoveryCode){manage.querySelector('textarea').value=data.recoveryCode;manage.querySelector('[data-secret]').hidden=false;status.textContent='恢复码已生成，请立即保存。';}
      else {await onSession(await api('/api/session'));recover.open=true;recover.querySelector('[role=status]').textContent='密码已更新，旧登录和旧恢复码已失效。请用新密码登录，再生成新的恢复码。';}
    }catch(e){if(ticket===epoch)status.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
  manage.querySelector('form').onsubmit=e=>{e.preventDefault();perform(manage,'password');};
  manage.querySelector('[data-recovery]').onclick=()=>perform(manage,'recovery-code');
  manage.querySelector('[data-hide]').onclick=hide;
  manage.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(manage.querySelector('textarea').value);manage.querySelector('[data-state]').textContent='恢复码已复制。';}catch{manage.querySelector('textarea').select();manage.querySelector('[data-state]').textContent='请手动复制选中的恢复码。';}};
  recover.querySelector('form').onsubmit=e=>{e.preventDefault();perform(recover,'recover');};
  return {setViewer(viewer){epoch++;hide();manage.querySelector('form').reset();recover.querySelector('form').reset();manage.hidden=viewer.authType!=='password';recover.hidden=Boolean(viewer.authenticated);manage.querySelector('[data-state]').textContent='修改密码需要验证当前密码；恢复码不会显示给其他账户。';}};
}
