import {viewAccess} from './workspace-access.mjs';
export const WORKSPACE_GROUPS=Object.freeze({
  model:{title:'星辰与命盘',views:[['model','星辰与命盘']]},
  library:{title:'资料库',views:[['library','阅读与检索'],['materials','上传与管理'],['private','本机私密']]},
  cards:{title:'技法中心',views:[['cards','技法卡片'],['rules','编辑与测试'],['submissions','我的提交']]},
  world:{title:'研究室',views:[['world','世界、事件与复盘'],['lab','演示沙盘']]},
  community:{title:'社区',views:[['community','社区讨论']]},
  review:{title:'管理中心',views:[['review','审核中心'],['members','账户与权限'],['history','历史记录']]},
  account:{title:'我的账户',views:[['account','账户与访问']]}
});
export function workspaceGroup(view){return Object.keys(WORKSPACE_GROUPS).find(key=>WORKSPACE_GROUPS[key].views.some(([id])=>id===view))||'model';}
export function initWorkspaceSections({api,el,btn}){
  let viewer={},current='model',category='all',summaryRun=0,summaryTimer;
  const navigation=el('nav','workspace-section-tabs');navigation.setAttribute('aria-label','当前工作区分区');navigation.hidden=true;document.querySelector('main#top').prepend(navigation);
  function render(){const group=WORKSPACE_GROUPS[workspaceGroup(current)];navigation.replaceChildren();navigation.hidden=group.views.length<2;if(navigation.hidden)return;
    for(const [id,label]of group.views){const a=el('a','workspace-section-tab',label),access=viewAccess(viewer,id,{ruleDraft:document.body.dataset.ruleDraft==='true'});a.setAttribute('aria-current',current===id?'page':'false');a.setAttribute('aria-disabled',String(!access.allowed));if(access.allowed)a.href='#'+id;else{a.classList.add('workspace-nav-locked');a.title=access.reason;}navigation.append(a);}
  }
  const review=document.querySelector('#review'),queueNav=el('div','review-category-tabs');queueNav.setAttribute('role','group');queueNav.setAttribute('aria-label','审核分类');
  const queueStatus=el('p','review-queue-total');queueStatus.setAttribute('role','status');
  const categories=[['all','全部待办'],['techniques','技法'],['excerpts','书籍摘录'],['community','社区'],['reports','举报']];
  const categoryButtons=new Map();for(const [id,label]of categories){const b=btn(label,()=>{category=id;applyQueue();});b.dataset.reviewCategoryTab=id;categoryButtons.set(id,b);queueNav.append(b);}
  const reviewRefresh=document.querySelector('#review-refresh');const toolbar=el('div','review-unified-tools');toolbar.append(queueNav,btn('刷新全部队列',()=>reviewRefresh.click()),queueStatus);review.querySelector('.workspace-title-row').after(toolbar);
  function applyQueue(){for(const [id,b]of categoryButtons)b.setAttribute('aria-pressed',String(category===id));document.querySelectorAll('[data-review-category]').forEach(n=>n.hidden=category!=='all'&&n.dataset.reviewCategory!==category);const community=document.querySelector('#community-review');if(community)community.hidden=!['all','community','reports'].includes(category);}
  async function summary(){if(!viewer.core||current!=='review')return;const run=++summaryRun;try{const data=await api('/api/review/summary');if(run!==summaryRun||!viewer.core)return;const total=Object.values(data.counts).reduce((a,b)=>a+b,0);queueStatus.textContent=total+' 项待处理';for(const [id,label]of categories)categoryButtons.get(id).textContent=label+' · '+(id==='all'?total:data.counts[id]);}catch(e){if(run===summaryRun)queueStatus.textContent='待办统计暂不可用：'+e.message;}}
  function changed(){applyQueue();clearTimeout(summaryTimer);summaryTimer=setTimeout(summary,80);}
  document.addEventListener('ziwei:review-updated',changed);
  document.addEventListener('ziwei:view',e=>{const previous=current;current=e.detail;render();if(current==='review'){if(previous!=='review')category='all';changed();}});
  document.addEventListener('ziwei:rule-draft',render);
  document.addEventListener('ziwei:session',e=>{summaryRun++;viewer=e.detail;current=document.body.dataset.workspaceView||'model';category='all';queueStatus.textContent='';render();changed();});
  document.addEventListener('ziwei:logout',()=>{summaryRun++;viewer={};clearTimeout(summaryTimer);queueStatus.textContent='';render();});
  reviewRefresh.addEventListener('click',changed);
  applyQueue();
}
