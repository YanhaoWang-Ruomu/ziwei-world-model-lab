import {workspaceGroup,WORKSPACE_GROUPS} from './workspace-sections.mjs';
import {VIEW_LABELS as labels,viewAccess} from './workspace-access.mjs';
export function initWorkspace({api,onSession}) {
  let viewer={role:'public'},current='model';
  const $=s=>document.querySelector(s);
  let ruleDraft=false;
  const access=key=>viewAccess(viewer,key,{ruleDraft});
  function navigate(){
    let key=location.hash.slice(1)||'model';if(key==='special')key=viewer.role==='public'?'account':'library';
    if(['top','demo','architecture'].includes(key))key=key==='top'?'model':'lab';
    if(!access(key).allowed)key='model';
    current=key;
    document.body.dataset.workspaceView=key;
    document.querySelectorAll('[data-view]').forEach(node=>{node.hidden=node.dataset.view!==key;});
    document.querySelectorAll('[data-nav]').forEach(node=>node.setAttribute('aria-current',node.dataset.nav===workspaceGroup(key)?'page':'false'));
    $('#workspace-location').textContent=WORKSPACE_GROUPS[workspaceGroup(key)].title+(workspaceGroup(key)===key?'':' / '+labels[key]);
    document.dispatchEvent(new CustomEvent('ziwei:view',{detail:key}));
  }
  document.addEventListener('ziwei:rule-draft',e=>{ruleDraft=Boolean(e.detail?.active);document.body.dataset.ruleDraft=String(ruleDraft);});
  window.addEventListener('hashchange',navigate);
  document.addEventListener('ziwei:navigate',navigate);
  document.querySelectorAll('[data-nav]').forEach(node=>{
    node.addEventListener('click',event=>{
      if(!access(node.dataset.nav).allowed){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    node.addEventListener('keydown',event=>{
      if(['Enter',' '].includes(event.key)&&!access(node.dataset.nav).allowed)event.preventDefault();
    });
  });
  function setViewer(next){
    ruleDraft=false;document.body.dataset.ruleDraft='false';viewer={...next,role:next.role||'public'};const role=viewer.role;document.body.dataset.role=role;
    const titles={public:next.authenticated?'公开用户':'公开访客',special:'特殊用户',core:next.founder?'创建者 · 核心管理人':'核心管理人'};
    $('#viewer-status').textContent=titles[role];$('#workspace-role').textContent=titles[role];
    $('#workspace-role-note').textContent={public:'阅读与使用',special:'阅读、整理与提交',core:next.founder?'管理、审核与账户授权':'管理与审核'}[role];
    document.querySelectorAll('[data-nav]').forEach(node=>{
      const permission=access(node.dataset.nav);node.hidden=false;
      node.setAttribute('aria-disabled',String(!permission.allowed));
      node.classList.toggle('workspace-nav-locked',!permission.allowed);
      node.title=permission.allowed?'':permission.reason;
      node.setAttribute('aria-label',(WORKSPACE_GROUPS[node.dataset.nav]?.title||labels[node.dataset.nav])+(permission.allowed?'':'，已锁定，'+permission.reason));
      if(permission.allowed){node.href='#'+node.dataset.nav;node.removeAttribute('tabindex');}
      else{node.removeAttribute('href');node.tabIndex=-1;}
    });
    document.querySelector('[data-level="special"]').hidden=role==='public';
    const signedIn=next.authenticated||next.specialAuthenticated||role!=='public';
    $('#header-owner-login').hidden=signedIn;
    $('#header-signout').hidden=!signedIn;
    $('#account-signout').hidden=!signedIn;
    $('#personal-signin').hidden=Boolean(next.authenticated);
    $('#special-login').hidden=true;
    $('#role-description').textContent={public:'在星辰中起一张命盘，沿着原典核对每一条规则。',special:'观星起盘，研读获授权的原典，将技法整理后提交审核。',core:next.founder?'观星起盘，审核技法，并管理知识与核心账户。':'观星起盘，审核技法，维护知识与规则。'}[role];
    navigate();
  }
  let checking=false;
  let signingOut=false;
  async function signOut(){
    if(signingOut)return;signingOut=true;
    $('#header-signout').disabled=true;$('#account-signout').disabled=true;
    $('#logout-status').textContent='正在退出所有登录与密钥授权…';
    try {
      const response=await api('/api/logout',{method:'POST'});
      document.dispatchEvent(new CustomEvent('ziwei:logout'));
      if(response.platformSignout){
        const link=document.createElement('a');link.href='/signout-with-chatgpt?return_to=%2F%23model';link.target='_top';link.click();
      } else {
        await onSession(await api('/api/session'));location.hash='model';
        $('#logout-status').textContent='已退出，当前为公开访客。';
      }
    } catch(error){$('#logout-status').textContent='退出未完成：'+error.message;location.hash='account';}
    finally{signingOut=false;$('#header-signout').disabled=false;$('#account-signout').disabled=false;}
  }
  $('#header-signout').addEventListener('click',signOut);$('#account-signout').addEventListener('click',signOut);
  async function check(){if(checking||document.hidden)return;checking=true;try{const next=await api('/api/session');if(JSON.stringify(next)!==JSON.stringify(viewer))await onSession(next);}catch{}finally{checking=false;}}
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});setInterval(check,60000);
  return {setViewer,navigate,get current(){return current;}};
}
