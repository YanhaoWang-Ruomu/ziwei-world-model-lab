import {mountScenario,scenarioComparison} from './scenario-workbench.js';
import {initCommunity} from './community.js';
export function initResearchCommunity({api,el,btn}){
  let viewer={},generation=0,world=null,events=[],branches=[],reviews=[],runs=[],researchTab='state';
  const $=s=>document.querySelector(s),worldRoot=$('#world');
  initCommunity({api,el,btn});
  const labels={context:'当前情境',resources:'可用资源',constraints:'约束与阻力',unknowns:'未知与待核实'};
  const status=el('p','research-status');status.setAttribute('role','status');
  function field(name,label,{area=false,max=2000,type='text',required=false}={}){const l=el('label','research-field',label),n=el(area?'textarea':'input');n.name=name;n.maxLength=max;n.required=required;if(!area)n.type=type;l.append(n);return l;}
  function select(name,label,options){const l=el('label','research-field',label),n=el('select');n.name=name;for(const [value,t]of options)n.append(new Option(t,value));l.append(n);return l;}
  function form(cls='research-form'){const f=el('form',cls);return f;}
  const submit=t=>{const b=el('button','book-primary',t);b.type='submit';return b;};
  function heading(kicker,title,copy){const h=el('header','research-heading');h.append(el('p','workspace-kicker',kicker),el('h1','',title),el('p','research-intro',copy));return h;}
  function values(f){return Object.fromEntries(new FormData(f));}
  function check(label){const l=el('label','research-check'),n=el('input');n.type='checkbox';n.name='confirmed';n.required=true;l.append(n,document.createTextNode(label));return l;}
  function guarded(f,s,work){f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button[type=submit]');if(b.disabled)return;b.disabled=true;try{await work(values(f));}catch(e){s.textContent=e.message;}finally{b.disabled=false;}});}
  function action(t,work,s=status){return btn(t,async()=>{try{await work();}catch(e){s.textContent=e.message;}});}
  const projects=el('div','research-projects'),editor=el('div','research-editor'),timeline=el('div','research-timeline'),comparison=el('div','research-comparison');
  const newProject=action('新建个人研究',()=>{world=null;events=[];branches=[];reviews=[];runs=[];drawWorld();});
  worldRoot.append(heading('观察 · 分支 · 复盘','世界状态与现实事件','记录情境与观察，比较行动假设，再用实际结果复盘。个人研究仅本账户可见；推演使用你设定的假设规则，不代表事件发生概率。'),status,projects,newProject,editor);
  async function loadProjects(){const g=generation;if(!viewer.authenticated){projects.replaceChildren(el('p','','登录个人账户后保存研究记录。'));return;}
    const data=await api('/api/world/projects');if(g!==generation)return;projects.replaceChildren(...data.projects.map(p=>action(p.title,()=>openWorld(p.id))));if(!data.projects.length)projects.append(el('p','muted','还没有个人研究，点击新建开始。'));
  }
  async function openWorld(id){const g=generation,data=await api('/api/world/projects/'+id);if(g!==generation)return;world=data.project;events=world.events.map(e=>({...e}));branches=data.branches;reviews=data.reviews;runs=data.runs||[];drawWorld();status.textContent='已载入个人研究。';}
  function drawWorld(){editor.replaceChildren();if(!viewer.authenticated)return;
    const tabs=el('div','research-local-tabs'),statePane=el('section','research-section'),eventsPane=el('section','research-section'),branchPane=el('section','research-section');tabs.setAttribute('aria-label','个人研究步骤');
    const panes={state:statePane,events:eventsPane,branches:branchPane};const tabButtons=new Map();
    function showTab(key){researchTab=key;for(const [name,pane]of Object.entries(panes))pane.hidden=name!==key;for(const [name,b]of tabButtons)b.setAttribute('aria-pressed',String(name===key));}
    for(const [key,label]of [['state','世界状态'],['events','事件时间线'],['branches','分支推演与复盘']]){const b=btn(label,()=>showTab(key));tabButtons.set(key,b);tabs.append(b);}editor.append(tabs,statePane,eventsPane,branchPane);showTab(researchTab);
    const f=form();f.append(field('title','研究名称',{max:100,required:true}),...Object.entries(labels).map(([k,l])=>field(k,l,{area:true})),submit(world?'保存状态与时间线':'创建研究'));
    if(world){f.elements.title.value=world.title;for(const k of Object.keys(labels))f.elements[k].value=world.state[k];}
    guarded(f,status,async v=>{const g=generation,p={title:v.title,state:Object.fromEntries(Object.keys(labels).map(k=>[k,v[k]])),events};const data=await api('/api/world/projects'+(world?'/'+world.id:''),{method:world?'PUT':'POST',body:JSON.stringify({...p,...(world?{revision:world.revision}:{})})});if(g!==generation)return;world=data.project;status.textContent='已保存，只有本账户可访问。';await loadProjects();drawWorld();});
    statePane.append(f);eventsPane.append(el('h2','','现实事件时间线'),el('p','muted','“已观察”与“计划”分别记录。添加或移除后，保存状态与时间线。'),timeline);drawTimeline();
    const ef=form('research-form research-inline');ef.append(field('date','日期',{type:'date',required:true}),select('kind','记录性质',[['observed','已观察'],['planned','计划']]),field('title','事件名称',{max:100,required:true}),field('detail','观察证据 / 计划内容',{area:true}),submit('加入未保存的时间线'));ef.elements.date.value=new Date().toISOString().slice(0,10);
    guarded(ef,status,async v=>{if(events.length>=200)throw Error('每份研究最多 200 条事件。');events.push({id:crypto.randomUUID(),...v});drawTimeline();ef.elements.title.value='';ef.elements.detail.value='';status.textContent='事件尚未保存，请点击保存状态与时间线。';});eventsPane.append(ef,btn('保存状态与时间线',()=>{if(!f.checkValidity()){showTab('state');f.reportValidity();return;}f.requestSubmit();},'book-primary'));
    if(!world){branchPane.append(el('p','muted','先保存世界状态，再建立分支、推演与复盘。'),btn('填写世界状态',()=>showTab('state')));return;}
    statePane.append(action('重新打开已保存内容',()=>openWorld(world.id)),action('删除这份个人研究',async()=>{if(!confirm('删除这份研究及全部分支和复盘？'))return;await api('/api/world/projects/'+world.id,{method:'DELETE',body:JSON.stringify({revision:world.revision})});world=null;events=[];branches=[];reviews=[];runs=[];drawWorld();await loadProjects();status.textContent='研究已删除。';}));
    branchPane.append(el('h2','','情境分支对比'),el('p','muted','每条分支固定创建时已保存的状态、事件与版本。先保存状态，再创建分支。分支内容是你的条件假设。'),comparison);drawBranches();
    const bf=form();bf.append(field('title','分支名称',{max:100,required:true}),field('hypothesis','条件 / 假设',{area:true,required:true}),field('action','拟采取的行动',{area:true,required:true}),field('expected','可核实的预期结果',{area:true,required:true}),field('observeOn','预定观察日',{type:'date',required:true}),submit('固定已保存基线并创建分支'));
    guarded(bf,status,async v=>{const g=generation;await api('/api/world/projects/'+world.id+'/branches',{method:'POST',body:JSON.stringify({...v,revision:world.revision})});if(g!==generation)return;await openWorld(world.id);status.textContent='分支已保存，基线固定。';});branchPane.append(bf);
  }
  function drawTimeline(){timeline.replaceChildren();events.sort((a,b)=>a.date.localeCompare(b.date));for(const e of events){const item=el('article','research-card');item.append(el('strong','',e.date+' · '+(e.kind==='observed'?'已观察':'计划')+' · '+e.title),el('p','research-copy',e.detail),action('移除此事件',()=>{events=events.filter(x=>x.id!==e.id);drawTimeline();status.textContent='移除尚未保存，请点击保存。';}));timeline.append(item);}if(!events.length)timeline.append(el('p','muted','没有事件记录。'));}
  function drawBranches(){comparison.replaceChildren();if(!branches.length){comparison.append(el('p','muted','创建两条或更多分支即可并列比较。'));return;}
    const runCompare=el('div');comparison.append(runCompare);const drawRunCompare=()=>runCompare.replaceChildren(scenarioComparison({el,runs,branches}));drawRunCompare();
    const table=el('table','research-table'),head=el('tr');for(const t of ['分支','基线版本','条件 / 假设','行动','预期','观察日'])head.append(el('th','',t));const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');for(const b of branches){const tr=el('tr');for(const v of [b.title,'V'+b.baseline.revision,b.hypothesis,b.action,b.expected,b.observeOn])tr.append(el('td','research-copy',v));tbody.append(tr);}table.append(tbody);const scroll=el('div','research-table-scroll');scroll.tabIndex=0;scroll.append(table);comparison.append(scroll);
    for(const b of branches){const card=el('article','research-card'),snapshot=el('details'),summary=el('summary','','查看 '+b.title+' 的固定基线');snapshot.append(summary);for(const [k,l]of Object.entries(labels))snapshot.append(el('p','research-copy',l+'：'+b.baseline.state[k]));for(const e of b.baseline.events)snapshot.append(el('p','research-copy',e.date+' · '+(e.kind==='observed'?'观察':'计划')+' · '+e.title+'：'+e.detail));card.append(el('h3','',b.title+' · 推演复盘'),snapshot,mountScenario({api,el,btn,branch:b,runs:runs.filter(r=>r.branchId===b.id),onSaved:r=>{if(!runs.some(x=>x.id===r.id))runs.push(r);drawRunCompare();const option=document.createElement('option');option.value=r.id;option.textContent=r.ruleSet.name+' V'+r.ruleSet.version+' · '+r.inputHash.slice(0,8);if(![...rf.elements.runId.options].some(o=>o.value===r.id))rf.elements.runId.append(option);rf.elements.runId.value=r.id;}}));
      for(const r of reviews.filter(r=>r.branchId===b.id))card.append(el('p','research-copy',r.date+' · '+{supported:'与预期一致',contradicted:'与预期相反',unclear:'证据不足'}[r.outcome]+(r.runId?' · 对应推演 '+r.runId.slice(0,8):'')+'\n实际结果：'+r.result+'\n修正与收获：'+r.learning));
      const rf=form();rf.classList.add('research-review-form');rf.append(select('runId','复盘对应的已保存推演',[['','手工分支（未关联自动推演）'],...runs.filter(r=>r.branchId===b.id).map(r=>[r.id,r.ruleSet.name+' V'+r.ruleSet.version+' · '+r.inputHash.slice(0,8)])]),field('date','复盘日期',{type:'date',required:true}),select('outcome','与原预期比较',[['unclear','证据不足'],['supported','与预期一致'],['contradicted','与预期相反']]),field('result','实际结果与证据',{area:true,max:4000,required:true}),field('learning','修正 / 下一步',{area:true,max:4000}),submit('追加复盘记录'));rf.elements.date.value=new Date().toISOString().slice(0,10);
      guarded(rf,status,async v=>{const g=generation;await api('/api/world/branches/'+b.id+'/reviews',{method:'POST',body:JSON.stringify(v)});if(g!==generation)return;await openWorld(world.id);status.textContent='复盘已追加，保留原假设与基线。';});card.append(rf);comparison.append(card);}
  }
  function clear(){generation++;world=null;events=[];branches=[];reviews=[];runs=[];projects.replaceChildren();editor.replaceChildren();status.textContent='';}
  async function enter(view){if(view!=='world')return;try{await loadProjects();drawWorld();}catch(e){status.textContent=e.message;}}
  document.addEventListener('ziwei:session',e=>{clear();viewer=e.detail;newProject.hidden=!viewer.authenticated;enter(location.hash.slice(1));});
  document.addEventListener('ziwei:logout',()=>{clear();viewer={};newProject.hidden=true;});
  document.addEventListener('ziwei:view',e=>enter(e.detail));
  document.addEventListener('ziwei:open-research',async e=>{if(!viewer.authenticated)return;try{researchTab='branches';await loadProjects();await openWorld(e.detail.id);}catch(error){status.textContent=error.message;}});
}
