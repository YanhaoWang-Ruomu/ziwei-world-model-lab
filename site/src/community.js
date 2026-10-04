import {communityEditor} from './community-editor.js';
import {renderCommunityText,renderCommunityFiles} from './community-text.mjs';

export function initCommunity({api,el,btn}) {
  const root=document.querySelector('#community'),reviewRoot=document.querySelector('#community-review');
  if(!root)return;
  let viewer={},generation=0,offset=0,listRequest=0,detailRequest=0,reviewRequest=0,detailId='',commentEditor=null;
  const status=message(),reviewStatus=message(),list=el('div','research-feed'),detail=el('article','community-detail'),queue=el('div');
  detail.hidden=true;detail.tabIndex=-1;
  function message(){const n=el('p','research-status');n.setAttribute('role','status');return n;}
  function field(name,label,max=100){const l=el('label','research-field',label),n=el('input');n.name=name;n.maxLength=max;l.append(n);return l;}
  function select(name,label,options){const l=el('label','research-field',label),n=el('select');n.name=name;for(const [value,text]of options)n.append(new Option(text,value));l.append(n);return l;}
  function form(cls='research-form'){return el('form',cls);}
  function submit(text){const b=el('button','book-primary',text);b.type='submit';return b;}
  function check(text){const l=el('label','research-check'),n=el('input');n.type='checkbox';n.name='confirmed';n.required=true;l.append(n,document.createTextNode(text));return l;}
  const values=f=>Object.fromEntries(new FormData(f));
  function action(text,work,out=status){return btn(text,async()=>{const g=generation;try{await work();}catch(e){if(g===generation)out.textContent=e.message;}});}
  function guarded(f,out,work){f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button[type=submit]'),g=generation;if(b.disabled)return;b.disabled=true;out.textContent='正在保存…';try{await work(values(f));}catch(e){if(g===generation)out.textContent=e.message;}finally{b.disabled=false;}});}
  const statusLabel=s=>({pending:'待审核',published:'已公开',rejected:'已退回',hidden:'已隐藏',withdrawn:'已撤回'}[s]||s);
  function content(p){const section=el('div','community-content'),text=el('div'),files=el('div');renderCommunityText(text,p.body,p.format);renderCommunityFiles(files,p.attachments);section.append(text,files);return section;}
  const returnKey='community-login-return';let returnPost='';
  function login(id=''){
    returnPost=id;
    try{if(id)sessionStorage.setItem(returnKey,JSON.stringify({id,expires:Date.now()+30*60*1000}));else sessionStorage.removeItem(returnKey);}catch{}
    location.hash='account';
  }
  function pendingReturn(){
    if(returnPost)return returnPost;
    try{const p=JSON.parse(sessionStorage.getItem(returnKey)||'null');if(p?.expires>Date.now()&&/^[a-f0-9-]{36}$/.test(p.id))return p.id;sessionStorage.removeItem(returnKey);}catch{}
    return '';
  }
  function finishReturn(){returnPost='';try{sessionStorage.removeItem(returnKey);}catch{}}
  const heading=el('header','research-heading');heading.append(el('p','workspace-kicker','案例 · 技法 · 讨论'),el('h1','','社区讨论'),el('p','research-intro','交流观察与阅读，保留讨论的来处。投稿和评论经审核后公开。'));
  const composerPanel=el('details','community-composer'),composer=form(),composerStatus=message(),postEditor=communityEditor({api,el,btn,label:'要公开的正文'});
  composerPanel.append(el('summary','','发起讨论'),composer);composerPanel.hidden=true;
  composer.append(select('kind','讨论类型',[['case','案例讨论'],['technique','技法讨论']]),field('title','标题'),field('tags','标签（逗号分隔，最多五个）',124),postEditor.root,check('我已检查文字、图片、附件及链接，同意将本次提交的内容送审，审核后公开。'),submit('提交审核'),composerStatus);
  composer.elements.title.required=true;
  const actions=el('div','community-actions'),compose=action('发起讨论',()=>{if(!viewer.authenticated){login();return;}composerPanel.open=true;composerPanel.scrollIntoView({behavior:'smooth',block:'start'});composer.elements.title.focus({preventScroll:true});});compose.className='book-primary';actions.append(compose);
  const search=form('research-form research-inline');search.append(field('q','关键词'),field('tag','标签（完整匹配）',24),select('scope','范围',[['public','公开讨论'],['mine','我的投稿'],['favorites','我的收藏']]),submit('搜索'));
  root.append(heading,actions,status,composerPanel,search,list,detail);
  guarded(composer,composerStatus,async v=>{
    const g=generation,data=await api('/api/community/posts',{method:'POST',body:JSON.stringify({title:v.title,kind:v.kind,tags:v.tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean),...postEditor.value(),sharingConfirmed:v.confirmed==='on'})});
    if(g!==generation)return;postEditor.reset();composer.reset();composerPanel.open=false;search.elements.scope.value='mine';offset=0;
    await loadPosts();await openPost(data.post.id,{scroll:true});status.textContent='投稿已保存，可在“我的投稿”查看审核状态。';composerStatus.textContent='';
  });
  guarded(search,status,async()=>{offset=0;await loadPosts();status.textContent='';});
  async function loadPosts(){
    const g=generation,r=++listRequest,v=values(search),data=await api('/api/community/posts?'+new URLSearchParams({...v,offset:String(offset)}));if(g!==generation||r!==listRequest)return;
    list.replaceChildren();for(const p of data.posts){const card=el('article','research-card community-topic'),title=action(p.title,()=>openPost(p.id,{scroll:true})),tags=el('div','community-tags');title.classList.add('community-topic-title');
      for(const tag of p.tags){const b=action('# '+tag,()=>{search.elements.tag.value=tag;offset=0;return loadPosts();});b.className='community-tag';tags.append(b);}
      card.append(el('p','community-topic-meta',(p.kind==='case'?'案例讨论':'技法讨论')+' · '+statusLabel(p.status)),title,tags);if(p.note)card.append(el('p','',p.note));list.append(card);
    }
    if(!data.posts.length){const empty=el('div','community-empty');empty.append(el('span','community-empty-star','✧'),el('p','','当前范围没有讨论。'),el('p','muted',v.q||v.tag?'可以更换关键词或标签再试。':'提交内容经审核后即可在这里交流。'));list.append(empty);}
    if(offset>0)list.append(action('上一页',()=>{offset=Math.max(0,offset-20);return loadPosts();}));if(data.hasMore)list.append(action('下一页',()=>{offset+=20;return loadPosts();}));
  }
  function report(kind,id){
    const panel=el('details','community-report'),f=form('research-form research-inline'),out=message();panel.append(el('summary','','举报'),f);f.append(field('reason','举报原因',1000),submit('提交举报'),out);f.elements.reason.required=true;
    guarded(f,out,async v=>{await api('/api/community/reports',{method:'POST',body:JSON.stringify({targetKind:kind,targetId:id,reason:v.reason})});f.reset();out.textContent='已送至审核中心，管理人会核查处理。';});return panel;
  }
  async function openPost(id,{scroll=false,notice='',focusComment=false}={}){
    const g=generation,r=++detailRequest;detailId=id;const data=await api('/api/community/posts/'+id);if(g!==generation||r!==detailRequest||detailId!==id)return;
    commentEditor?.dispose();commentEditor=null;const p=data.post;detail.hidden=false;detail.replaceChildren(el('h2','',p.title),el('p','community-topic-meta',statusLabel(p.status)+(p.mine?' · 我的投稿':'')),content(p));if(p.note)detail.append(el('p','community-review-note',p.note));
    const comments=el('section','community-comments'),commentStatus=message();comments.append(el('h3','','评论'),commentStatus);commentStatus.textContent=notice;
    if(p.status!=='published')comments.append(el('p','muted','讨论公开后即可评论。'));
    else if(!viewer.authenticated){const prompt=el('div','community-comment-login');prompt.append(el('p','','登录后参与评论，登录成功会回到这篇讨论。'),action('登录 / 注册后评论',()=>login(id),commentStatus));comments.append(prompt);}
    else {
      const f=form('research-form community-comment-form'),ed=communityEditor({api,el,btn,label:'写下评论',max:4000});commentEditor=ed;
      f.append(ed.root,check('同意将本条文字、图片、附件及链接送审，审核后公开。'),submit('提交评论审核'));comments.append(f);
      guarded(f,commentStatus,async v=>{const epoch=generation;await api('/api/community/posts/'+id+'/comments',{method:'POST',body:JSON.stringify({...ed.value(),sharingConfirmed:v.confirmed==='on'})});if(epoch!==generation)return;ed.reset();await openPost(id,{notice:'评论已保存，等待审核；现在你可在下方看到自己的评论。',focusComment:true});});
    }
    const commentList=el('div','community-comment-list');comments.append(commentList);
    for(const c of data.comments){const card=el('article','research-card community-comment'),out=message();card.append(el('p','community-topic-meta',(c.mine?'我的评论 · ':'')+statusLabel(c.status)),content(c));if(c.note)card.append(el('p','community-review-note',c.note));const bar=el('div','community-post-actions');
      if(viewer.authenticated&&c.status==='published')bar.append(report('comment',c.id));
      if(c.mine&&c.status!=='withdrawn')bar.append(action('撤回评论',async()=>{await api('/api/community/comments/'+c.id,{method:'DELETE',body:JSON.stringify({revision:c.revision})});await openPost(id,{notice:'评论已撤回。'});},out));card.append(bar,out);commentList.append(card);
    }
    if(!data.comments.length)commentList.append(el('p','muted','还没有评论，欢迎分享你的观察。'));
    detail.append(comments);
    const postActions=el('div','community-post-actions'),postStatus=message();
    if(viewer.authenticated&&p.status==='published'){postActions.append(action(p.favorite?'取消收藏':'收藏讨论',async()=>{await api('/api/community/posts/'+id+'/favorite',{method:p.favorite?'DELETE':'POST'});await openPost(id);},postStatus),report('post',id));}
    if(p.mine&&p.status!=='withdrawn')postActions.append(action('撤回讨论',async()=>{if(!confirm('撤回后公开读者将无法查看此讨论。继续？'))return;await api('/api/community/posts/'+id,{method:'DELETE',body:JSON.stringify({revision:p.revision})});await openPost(id);await loadPosts();},postStatus));
    detail.append(postActions,postStatus);
    if(scroll){detail.scrollIntoView({behavior:'smooth',block:'start'});detail.focus({preventScroll:true});}
    if(focusComment){comments.scrollIntoView({behavior:'smooth',block:'start'});commentEditor?.input.focus({preventScroll:true});}
  }
  function reviewGate(){if(!reviewRoot)return;reviewRoot.className='community-moderation';reviewRoot.replaceChildren(el('h2','','社区投稿、评论与举报'),el('p','muted','核心管理人可在这里审核社区内容。'),reviewStatus);}
  function decision(kind,p,fixed){const f=form('research-form research-inline'),out=message();if(!fixed)f.append(select('decision','审核决定',[['published','批准公开'],['rejected','退回']]));f.append(field('reason','审核 / 处理理由',1000),submit(fixed==='hidden'?'隐藏内容':fixed==='resolved'?'标记举报已处理':'保存审核决定'),out);f.elements.reason.required=true;
    guarded(f,out,async v=>{const g=generation;await api('/api/community/moderation',{method:'POST',body:JSON.stringify({kind,id:p.id,...(kind==='report'?{}:{revision:p.revision}),decision:fixed||v.decision,reason:v.reason})});if(g!==generation)return;await loadModeration();reviewStatus.textContent='处理已保存，审核记录已保留。';});return f;
  }
  async function loadTarget(kind,id,container){
    const g=generation,data=await api('/api/community/moderation/target?'+new URLSearchParams({[kind]:id}));if(g!==generation||!viewer.core)return;container.replaceChildren(el('h4','',data.post.title));
    for(const [k,p]of [['post',data.post],...(data.comment?[['comment',data.comment]]:[])]){const box=el('article','research-card');box.append(el('p','community-topic-meta',(k==='post'?'讨论':'评论')+' · '+statusLabel(p.status)),content(p));if(p.status==='published')box.append(decision(k,p,'hidden'));container.append(box);}
    if(kind==='post'){
      const all=await api('/api/community/posts/'+data.postId);if(g!==generation||!viewer.core)return;
      for(const c of all.comments){const box=el('article','research-card');box.append(el('p','community-topic-meta','评论 · '+statusLabel(c.status)),content(c));if(c.status==='published')box.append(decision('comment',c,'hidden'));container.append(box);}
    }
  }
  async function loadModeration(){
    if(!reviewRoot)return;if(!viewer.core){reviewGate();return;}const g=generation,r=++reviewRequest,data=await api('/api/community/moderation');if(g!==generation||r!==reviewRequest)return;
    reviewRoot.className='community-moderation';reviewRoot.replaceChildren(el('h2','','社区投稿、评论与举报'),el('p','muted','核对正文及附件后批准公开；举报内容与处理记录集中保留。'),action('刷新社区队列',loadModeration,reviewStatus),reviewStatus,queue);queue.replaceChildren();
    for(const [key,kind,label]of [['posts','post','投稿'],['comments','comment','评论'],['reports','report','举报']]){
      const section=el('section','community-review-group');section.append(el('h3','',label+' · '+data[key].length));queue.append(section);
      if(!data[key].length)section.append(el('p','muted','暂无待处理'+label+'。'));
      for(const p of data[key]){const card=el('article','research-card');card.append(el('h4','',kind==='post'?p.title:kind==='comment'?'待审评论':'待处理举报'));if(kind==='report'){
          card.append(el('p','research-copy',p.reason));const target=el('div','community-review-target');card.append(action('查看举报内容',()=>loadTarget(p.target_kind,p.target_id,target),reviewStatus),target);
        }else {card.append(content(p));if(p.postId){const target=el('div','community-review-target');card.append(action('查看所属讨论',()=>loadTarget('comment',p.id,target),reviewStatus),target);}}
        card.append(decision(kind,p,kind==='report'?'resolved':undefined));section.append(card);
      }
    }
    const find=el('details','community-review-search'),f=form('research-form research-inline'),found=el('div'),out=message();find.append(el('summary','','查找已公开讨论并处理'),f,found);f.append(field('q','关键词'),submit('查找'),out);reviewRoot.append(find);
    guarded(f,out,async v=>{const epoch=generation,data=await api('/api/community/posts?'+new URLSearchParams({q:v.q}));if(epoch!==generation)return;found.replaceChildren();out.textContent=data.posts.length?'选择内容查看或隐藏。':'没有匹配讨论。';for(const p of data.posts){const target=el('div');found.append(action(p.title,()=>loadTarget('post',p.id,target),out),target);}});
  }
  function clear(){generation++;listRequest++;detailRequest++;reviewRequest++;commentEditor?.dispose();commentEditor=null;postEditor.reset();composer.reset();composerPanel.open=false;composerStatus.textContent='';search.reset();offset=0;detailId='';detail.replaceChildren();detail.hidden=true;list.replaceChildren();status.textContent='';reviewStatus.textContent='';queue.replaceChildren();reviewGate();}
  async function enter(view){const g=generation;try{if(view==='community')await loadPosts();if(view==='review')await loadModeration();}catch(e){if(g===generation)(view==='review'?reviewStatus:status).textContent=e.message;}}
  document.addEventListener('ziwei:session',e=>{
    clear();viewer=e.detail;composerPanel.hidden=!viewer.authenticated;for(const o of search.elements.scope.options)o.disabled=o.value!=='public'&&!viewer.authenticated;
    const id=viewer.authenticated?pendingReturn():'';
    if(id){finishReturn();location.hash='community';enter('community');openPost(id,{scroll:true,focusComment:true}).catch(e=>{status.textContent='已登录。'+e.message;});}
    else enter(location.hash.slice(1));
  });
  document.addEventListener('ziwei:logout',()=>{clear();viewer={};composerPanel.hidden=true;});
  document.addEventListener('ziwei:view',e=>enter(e.detail));reviewGate();
}
