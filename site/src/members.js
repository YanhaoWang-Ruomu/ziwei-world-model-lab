export function initMembers({api,el,btn}) {
  const root=document.querySelector('#members-list'),status=document.querySelector('#members-status'),form=document.querySelector('#members-form');let viewer={},generation=0;
  async function refresh(next=viewer){viewer=next;const run=++generation;root.replaceChildren();if(!viewer.founder||!viewer.core)return;
    try{const data=await api('/api/account-levels');if(run!==generation)return;
      if(!data.members.length)root.append(el('div','workspace-empty','暂无其他注册或授权账户，可填写账号识别码授权。'));
      for(const member of data.members){const row=el('article','member-row');row.append(el('strong','',member.label),el('code','',member.user_id),el('span','',({public:'公开',special:'特殊',core:'核心'})[member.role]+'级'),btn('调整级别',()=>{form.elements.userId.value=member.user_id;form.elements.label.value=member.label;form.elements.role.value=member.role;form.elements.confirmed.checked=false;form.scrollIntoView({block:'center'});}));
        root.append(row);
      }
    }catch(e){if(run===generation)status.textContent=e.message;}
  }
  form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('button');submit.disabled=true;try{await api('/api/account-levels',{method:'POST',body:JSON.stringify({userId:form.elements.userId.value.trim(),label:form.elements.label.value.trim(),role:form.elements.role.value,humanConfirmed:form.elements.confirmed.checked})});form.reset();status.textContent='授权已保存，新的访问请求立即按新权限检查。';await refresh();}catch(e){status.textContent=e.message;}finally{submit.disabled=false;}});
  return {refresh};
}
