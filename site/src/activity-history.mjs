export function initActivityHistory({api,el,btn,detailRoot}){
  const root=el('section','activity-history'),tabs=el('div','activity-category-tabs'),form=el('form','history-controls'),search=el('input'),status=el('p','activity-history-status'),list=el('div');
  const categories={all:'全部记录',techniques:'技法修订',pages:'文稿校订',excerpts:'摘录审核',community:'社区审核',reports:'举报处理'};
  const actions={baseline:'既有版本存档',create:'创建',edit:'保存修改',revise:'修订发布版本',submit:'提交审核',reject:'退回',publish:'审核发布',approved:'审核通过',rejected:'退回修改',confirmed:'确认校订',draft:'保存草稿',published:'批准公开',hidden:'隐藏内容',resolved:'处理举报'};
  let core=false,category='all',run=0,next=null;
  search.type='search';search.placeholder='查找记录标题';search.setAttribute('aria-label','历史记录搜索');search.maxLength=160;status.setAttribute('role','status');tabs.setAttribute('aria-label','历史分类');
  const buttons=new Map();for(const [key,label]of Object.entries(categories)){const b=btn(label,()=>{category=key;show();load(false);});buttons.set(key,b);tabs.append(b);}
  const more=btn('加载更早记录',()=>load(true));more.hidden=true;form.append(search,btn('查找',()=>load(false)));form.addEventListener('submit',e=>{e.preventDefault();load(false);});
  root.append(tabs,form,status,list,more);detailRoot.before(root);
  detailRoot.prepend(btn('返回全部历史',()=>{category='all';show();load(false);}));
  function show(){root.hidden=false;detailRoot.hidden=true;for(const [key,b]of buttons)b.setAttribute('aria-pressed',String(category===key));}
  async function load(append){if(!core)return;const request=++run;more.disabled=true;if(!append){list.replaceChildren();next=null;}status.textContent='正在读取历史记录…';
    try{const data=await api('/api/activity/history?'+new URLSearchParams({category,q:search.value,...(append&&next?{before:next}:{})}));if(request!==run||!core)return;
      for(const record of data.records){const row=el('article','activity-row'),body=el('div');body.append(el('small','',categories[record.category]+' · '+new Date(record.occurred_at*1000).toLocaleString('zh-CN')),el('h3','',record.title),el('p','',`${actions[record.action]||record.action}${record.revision?' · 版本 '+record.revision:''}${record.page?' · 第 '+record.page+' 页':''}`));row.append(body);
        if(record.category==='techniques')row.append(btn('查看技法修订详情',()=>document.dispatchEvent(new CustomEvent('ziwei:technique-history',{detail:{id:record.target}}))));list.append(row);
      }
      next=data.next;more.hidden=!next;status.textContent=list.children.length?'已显示 '+list.children.length+' 条记录。':'当前筛选下暂无记录。';
    }catch(e){if(request===run)status.textContent=e.message;}finally{if(request===run)more.disabled=false;}
  }
  document.addEventListener('ziwei:technique-history',()=>{++run;root.hidden=true;detailRoot.hidden=false;});
  document.addEventListener('ziwei:view',e=>{if(e.detail==='history'&&!root.hidden)load(false);});
  document.addEventListener('ziwei:session',e=>{++run;core=Boolean(e.detail.core)&&e.detail.role==='core';category='all';search.value='';list.replaceChildren();status.textContent='';more.hidden=true;show();if(core&&location.hash==='#history')load(false);});
  document.addEventListener('ziwei:logout',()=>{++run;core=false;list.replaceChildren();status.textContent='';more.hidden=true;});
  show();return {get showingDetails(){return !detailRoot.hidden;}};
}
