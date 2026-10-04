import {describeCondition} from './technique-engine.mjs';
import {initActivityHistory} from './activity-history.mjs';
export function initTechniqueHistory({api,el,btn}){
  const root=document.querySelector('#history'),list=el('div','tech-history-list'),status=el('p'),search=el('input'),form=el('form','tech-history-search');
  let core=false,generation=0,next=null,card='',busy=false;
  search.type='search';search.placeholder='按技法标题查找';search.setAttribute('aria-label','历史记录标题搜索');search.maxLength=160;
  const submit=btn('查找',()=>load(false)),all=btn('查看全部技法',()=>{card='';search.value='';load(false);}),more=btn('加载更早记录',()=>load(true));more.hidden=true;
  status.setAttribute('role','status');form.append(search,submit,all);form.addEventListener('submit',e=>{e.preventDefault();load(false);});
  const detailRoot=el('section','technique-history-details');root.append(detailRoot);detailRoot.append(form,status,list,more);const activity=initActivityHistory({api,el,btn,detailRoot});
  const actions={baseline:'启用历史时的存档',create:'创建草稿',edit:'保存修改',revise:'修订已发布技法',submit:'提交审核',reject:'退回修改',publish:'审核通过并发布'};
  async function load(append){
    if(!core)return;const run=++generation;busy=true;more.disabled=true;if(!append)list.replaceChildren();status.textContent='正在读取历史记录…';
    try{const params=new URLSearchParams({q:search.value,card,...(append&&next?{before:String(next)}:{})}),data=await api('/api/techniques/history?'+params);if(run!==generation||!core)return;
      for(const r of data.records){const item=el('article','tech-card'),detail=el('details'),body=el('div');let loaded=false;
        item.append(el('small','muted',new Date(r.occurred_at*1000).toLocaleString('zh-CN')),el('h2','',r.title),el('p','',`${actions[r.action]||r.action} · 记录 #${r.revision} · ${r.release_version?(r.action==='publish'?'发布版 V':'当时线上 V')+r.release_version:'尚未发布'}`),el('p','muted',r.actor?'操作账户：'+r.actor:'既有记录存档 · 更早的操作无法追溯'));
        detail.append(el('summary','','查看该次内容与审核意见'),body);
        detail.addEventListener('toggle',async()=>{if(!detail.open||loaded)return;loaded=true;body.textContent='正在读取…';try{const data=await api('/api/techniques/history/'+r.id);if(!core||!item.isConnected)return;const p=data.record.payload;body.replaceChildren(el('p','',`主题：${p.topic||'未分类'} · ${p.level==='public'?'公开':'特殊'}`),el('h3','','原文快照'),el('p','raw-page-text',p.text||''),el('h3','','运算条件'));for(const c of p.rule?.conditions||[])body.append(el('p','',describeCondition(c)));body.append(el('p','',`结果提示：${p.outcome||'未填写'}`),el('p','',`审核意见：${data.record.note||'无'}`));const raw=el('details');raw.append(el('summary','','完整规则快照'),el('pre','tech-history-rule',JSON.stringify(p.rule,null,2)));body.append(raw);}catch(e){loaded=false;body.textContent=e.message;}});
        item.append(detail);list.append(item);
      }
      next=data.next;more.hidden=!next;status.textContent=list.children.length?`已显示 ${list.children.length} 条记录${card?' · 当前技法':''}。`:'暂无历史记录。';
    }catch(e){if(run===generation)status.textContent=e.message;}finally{if(run===generation){busy=false;more.disabled=false;}}
  }
  document.addEventListener('ziwei:technique-history',e=>{card=e.detail.id;search.value='';if(location.hash==='#history')load(false);else location.hash='history';});
  document.addEventListener('ziwei:view',e=>{if(e.detail==='history'&&activity.showingDetails)load(false);});
  document.addEventListener('ziwei:session',e=>{generation++;core=Boolean(e.detail.core);busy=false;list.replaceChildren();status.textContent='';more.hidden=true;});
}
