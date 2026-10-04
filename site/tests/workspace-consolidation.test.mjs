import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
import {initWorkspace} from '../src/workspace.js';
import {initWorkspaceSections} from '../src/workspace-sections.mjs';
import {initSubmissions} from '../src/submissions.js';
import {initRuleWorkbench} from '../src/rules.js';
import {initTechniques} from '../src/techniques.js';
import {initResearchCommunity} from '../src/research-community.js';

function setup(){
  const win=new Window({url:'http://localhost/#model',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  const keys=['window','document','location','sessionStorage','FormData','Event','CustomEvent','Option','setInterval'];const old=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{value:key==='window'?win:win[key],configurable:true,writable:true});globalThis.setInterval=()=>0;
  globalThis.Option=function(text,value){const n=win.document.createElement('option');n.text=text;n.value=value;return n;};win.OpenCC={Converter:()=>s=>s};
  win.document.write(fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8'));
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const btn=(text,fn,cls='book-secondary')=>{const n=el('button',cls,text);n.type='button';n.addEventListener('click',fn);return n;};
  const session=v=>document.dispatchEvent(new CustomEvent('ziwei:session',{detail:v}));
  return {win,el,btn,session,async close(){await win.happyDOM.abort();await win.happyDOM.close();for(const k of keys){if(old[k])Object.defineProperty(globalThis,k,old[k]);else delete globalThis[k];}}};
}
const tick=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
const button=(text,root=document)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
test('six main entries preserve old routes, locked labels, and only open special draft editing in context',async()=>{
  const f=setup();try{
    const api=async()=>({counts:{techniques:0,excerpts:0,community:0,reports:0}});const workspace=initWorkspace({api,onSession:()=>{}});initWorkspaceSections({api,...f});
    assert.equal(document.querySelectorAll('[data-nav]').length,6);const publicViewer={role:'public'};workspace.setViewer(publicViewer);f.session(publicViewer);
    location.hash='#library';workspace.navigate();assert.equal(document.querySelector('.workspace-section-tab:last-child').textContent,'本机私密');assert.equal(document.querySelector('.workspace-section-tab:last-child').hasAttribute('href'),false);
    const core={role:'core',core:true,founder:true};workspace.setViewer(core);f.session(core);for(const view of ['materials','private','cards','rules','submissions','world','lab','review','members','history']){location.hash='#'+view;workspace.navigate();assert.equal(workspace.current,view);assert.equal(document.querySelectorAll('[data-nav][aria-current=page]').length,1);}
    const special={role:'special',core:false};workspace.setViewer(special);f.session(special);location.hash='#rules';workspace.navigate();assert.equal(workspace.current,'model');
    const workbench=initRuleWorkbench({api,...f,openSource:()=>{}});workbench.editDraft({card:{title:'虚构草稿',level:'public',quote:'fictional',book_title:'虚构册',page:1,revision:0},onDone:()=>{},onCancel:()=>{location.hash='submissions';}});workspace.navigate();assert.equal(workspace.current,'rules');assert.equal(document.querySelector('#rules').hidden,false);
    button('返回卡片，不带入修改').click();location.hash='#rules';workspace.navigate();assert.equal(workspace.current,'model');
    workspace.setViewer(publicViewer);f.session(publicViewer);assert.equal(document.querySelector('[data-nav=review]').hidden,false);assert.equal(document.querySelector('[data-nav=review]').hasAttribute('href'),false);
  }finally{await f.close();}
});
test('core sees own excerpt list and separate review list, with source-specific requests',async()=>{
  const f=setup(),calls=[];try{
    const row={id:'own',created_at:1,status:'pending',payload:{title:'虚构本人摘录'},book_title:'虚构册',page:1,author_label:'tester'};
    const api=async path=>{calls.push(path);return {submissions:path.includes('scope=mine')?[row]:[{...row,id:'other',payload:{title:'虚构他人摘录'}}],total:1};};
    const submissions=initSubmissions({api,...f,ruleWorkbench:{},onPublished:()=>{},openSource:()=>{}});await submissions.refresh({role:'core',core:true,actor:'tester'});
    assert.match(document.querySelector('#submission-list').textContent,/虚构本人/);assert.doesNotMatch(document.querySelector('#submission-list').textContent,/虚构他人/);assert.match(document.querySelector('#review-list').textContent,/虚构他人/);assert.ok(calls.some(s=>s.includes('scope=mine')));
  }finally{await f.close();}
});
test('shared authored catalogue uses the same filters and opens the dedicated editor; reviews filter by category',async()=>{
  const f=setup();try{
    const card={id:'fictional',status:'pending',revision:1,mine:true,payload:{title:'虚构青松',topic:'测试',level:'special',text:'仅测试',rule:{version:1,mode:'all',conditions:[],unresolved:[]}}};
    const api=async path=>path==='/api/review/summary'?{counts:{techniques:1,excerpts:0,community:0,reports:0}}:{cards:[card]};
    initTechniques({api,...f,vault:{unlocked:false}});initWorkspaceSections({api,...f});f.session({role:'core',core:true});await tick();
    assert.equal(document.querySelectorAll('#authored-catalog .tech-card').length,1);assert.match(document.querySelector('#authored-mine').textContent,/虚构青松/);
    document.querySelector('#cards-source').value='excerpt';document.dispatchEvent(new Event('ziwei:catalog-filter'));assert.equal(document.querySelector('#authored-catalog').children.length,0);
    document.querySelector('#cards-source').value='authored';document.dispatchEvent(new Event('ziwei:catalog-filter'));assert.equal(document.querySelector('#authored-catalog').children.length,1);
    button('新增中文技法').click();assert.equal(location.hash,'#rules');assert.equal(document.querySelector('#rules').dataset.editorKind,'authored');assert.ok(document.querySelector('#authored-editor form'));assert.equal(document.querySelector('#cards .tech-editor'),null);
    document.querySelector('[data-review-category-tab=reports]').click();assert.equal(document.querySelector('#authored-review').hidden,true);assert.equal(document.querySelector('#excerpt-review').hidden,true);document.querySelector('[data-review-category-tab=techniques]').click();assert.equal(document.querySelector('#authored-review').hidden,false);
    f.session({role:'public',core:false});await tick();assert.equal(document.querySelectorAll('#authored-catalog article').length,0);assert.equal(document.querySelector('#authored-review').children.length,0);
  }finally{await f.close();}
});
test('research sub-tabs retain unsaved state and save timeline using that same form',async()=>{
  const f=setup();try{
    location.hash='world';let saved;const api=async(path,options={})=>{if(path==='/api/world/projects'&&options.method==='POST'){saved=JSON.parse(options.body);return {project:{...saved,id:'fictional',revision:1}};}if(path==='/api/world/projects')return {projects:[]};throw Error('Unexpected fixture route');};
    initResearchCommunity({api,...f});f.session({role:'public',authenticated:true});await tick();
    const state=document.querySelector('.research-editor [name=title]');state.value='未保存的虚构状态';button('事件时间线').click();button('世界状态').click();assert.equal(state.value,'未保存的虚构状态');button('事件时间线').click();button('保存状态与时间线',document.querySelector('.research-section:not([hidden])')).click();await tick();assert.equal(saved.title,'未保存的虚构状态');
  }finally{await f.close();}
});
