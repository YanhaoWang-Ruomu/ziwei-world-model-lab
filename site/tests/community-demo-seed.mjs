// Only fictional records in the isolated test service. Never run against the user store.
import assert from 'node:assert/strict';
import {fictionalScenario} from '../src/scenario-engine.mjs';
const base='http://127.0.0.1:8770',reader='local_preview_subject=community-demo',core='local_preview_core=1',founder='local_preview_owner=1';
async function api(p,{method='GET',body,cookie=reader}={}){const response=await fetch(base+p,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,data.error||'Fictional setup failed');return data;}
assert.equal((await api('/api/storage')).testStore,true,'Only the isolated fictional store is allowed');
await api('/api/account-levels',{method:'POST',cookie:founder,body:{userId:'local-core',label:'虚构核心管理人',role:'core',humanConfirmed:true}});
const topics=[
  {title:'从观察到复盘：怎样保留每一步依据',kind:'case',tags:['功能演示','复盘笔记'],body:'这是一条虚构演示讨论。\n\n先记录已经观察到的事件，再单独写出行动假设。复盘时保留原始基线，比较实际结果与预期的区别。\n\n这里不包含真实命例或任何私有技法。'},
  {title:'方盘与转盘，你更习惯怎样阅读？',kind:'case',tags:['功能演示','界面交流'],body:'这是一条虚构的界面交流示例。方盘适合查看十二宫的位置关系，转盘用于另一种布局体验。可以讨论字号、信息密度与操作习惯。\n\n本条不提供任何真实排盘推论。'},
  {title:'书库里的简繁搜索与阅读笔记',kind:'technique',tags:['功能演示','书库工具'],body:'这是一条虚构的软件使用讨论。输入简体或繁体关键词后，可对照提取文字与原页的高亮位置核查。\n\n示例不引用真实书籍正文。'},
  {title:'待审核示例：如何整理一次阅读观察',kind:'case',tags:['功能演示','待审示例'],body:'这条虚构投稿保持待审核状态，用于核对公开访客无法看到、核心管理人可以审核的流程。'}
];
let mine=(await api('/api/community/posts?scope=mine&tag='+encodeURIComponent('功能演示'))).posts;
const saved=[];
for(const [index,topic]of topics.entries()){
  let post=mine.find(p=>p.title===topic.title);
  if(!post)post=(await api('/api/community/posts',{method:'POST',body:{...topic,sharingConfirmed:true}})).post;
  if(index<3&&post.status==='pending')await api('/api/community/moderation',{method:'POST',cookie:founder,body:{kind:'post',id:post.id,revision:post.revision,decision:'published',reason:'仅批准本地虚构功能演示资料。'}});
  saved.push(post);
}
const first=(await api('/api/community/posts/'+saved[0].id)).post;
await api('/api/community/posts/'+first.id+'/favorite',{method:'POST'});
const discussion=await api('/api/community/posts/'+first.id);
if(!discussion.comments.some(c=>c.body==='虚构演示评论：保留原始假设后，复盘更容易对照。')){
  const comment=(await api('/api/community/posts/'+first.id+'/comments',{method:'POST',body:{body:'虚构演示评论：保留原始假设后，复盘更容易对照。',sharingConfirmed:true}})).comment;
  await api('/api/community/moderation',{method:'POST',cookie:founder,body:{kind:'comment',id:comment.id,revision:comment.revision,decision:'published',reason:'批准虚构演示评论。'}});
}
for(const cookie of [reader,core,founder]){
  const title='虚构示例 · 阅读与复盘计划';
  const projects=(await api('/api/world/projects',{cookie})).projects;
  if(projects.some(p=>p.title===title))continue;
  const project=(await api('/api/world/projects',{cookie,method:'POST',body:{title,state:{context:'虚构的三次阅读任务',resources:'假设有三个资源单位',constraints:'每次行动消耗一个资源单位',unknowns:'现实中需要的时间与结果尚未验证'},events:[{id:'demo-observation',date:'2026-10-04',kind:'observed',title:'记录初始观察',detail:'虚构演示资料。'},{id:'demo-plan',date:'2026-10-11',kind:'planned',title:'进行一次复盘',detail:'比较假设与新观察。'}]}})).project;
  for(const [i,title]of ['资源充足的假设','资源受限的假设'].entries()){
    const branch=(await api('/api/world/projects/'+project.id+'/branches',{cookie,method:'POST',body:{revision:1,title,hypothesis:'仅是人为设置的资源假设',action:'推进一次阅读任务',expected:'保存每一步状态与依据',observeOn:'2026-10-11'}})).branch;
    const input=fictionalScenario();if(i===1)input.initial.budget=1;
    await api('/api/world/branches/'+branch.id+'/runs',{cookie,method:'POST',body:input});
  }
}
console.log('Fictional demo ready: three public topics, one pending topic, one comment, saved favorites and separate personal scenario examples.');
