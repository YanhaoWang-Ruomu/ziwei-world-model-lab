export function initPersonalAccount({api,onSession}){
  const $=s=>document.querySelector(s),form=$('#personal-account-form');let mode='login',busy=false;
  const status=$('#personal-account-status');
  const switcher=document.createElement('select'),label=document.createElement('label');label.textContent='切换已授权级别';label.append(switcher);$('#account').prepend(label);
  switcher.addEventListener('change',async()=>{switcher.disabled=true;try{await api('/api/session/level',{method:'POST',body:JSON.stringify({role:switcher.value})});await onSession(await api('/api/session'));status.textContent='已切换当前访问级别。';}catch(e){status.textContent=e.message;}finally{switcher.disabled=false;}});
  function changeMode(next){
    mode=next;const register=mode==='register';
    document.querySelectorAll('[data-account-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.accountMode===mode)));
    $('#personal-confirm-label').hidden=!register;$('#personal-password-confirm').required=register;
    $('#personal-password').autocomplete=register?'new-password':'current-password';$('#personal-password').minLength=register?12:1;
    $('#personal-account-submit').textContent=register?'注册并登录':'登录';status.textContent='';
  }
  document.querySelectorAll('[data-account-mode]').forEach(b=>b.addEventListener('click',()=>changeMode(b.dataset.accountMode)));
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    if(mode==='register'&&$('#personal-password').value!==$('#personal-password-confirm').value){status.textContent='两次输入的密码不一致。';return;}
    busy=true;$('#personal-account-submit').disabled=true;status.textContent=mode==='register'?'正在创建个人账户…':'正在登录…';
    try{
      await api(`/api/account/${mode}`,{method:'POST',body:JSON.stringify({username:$('#personal-username').value,password:$('#personal-password').value,remember:$('#personal-remember').checked})});
      form.reset();await onSession(await api('/api/session'));status.textContent='已登录，你的命例可以保存到此账户。';
    }catch(error){status.textContent=error.message;}
    finally{busy=false;$('#personal-account-submit').disabled=false;}
  });
  return {setViewer(viewer){
    switcher.replaceChildren(...(viewer.availableRoles||[viewer.role]).map(role=>new Option({public:'公开',special:'特殊',core:'核心'}[role],role)));switcher.value=viewer.role;label.hidden=switcher.options.length<2;
    const signed=Boolean(viewer.authenticated);$('#personal-auth-entry').hidden=signed;$('#personal-profile').hidden=!signed;
    $('#personal-profile-name').textContent=viewer.username||'ChatGPT 个人账户';
    $('#personal-profile-code').textContent=viewer.userId||'';
    $('#personal-profile-role').textContent=viewer.founder?'创建者':viewer.role==='core'?'核心管理人':viewer.role==='special'?'特殊用户':'公开用户';
    if(!signed){form.reset();status.textContent='';}
  }};
}
