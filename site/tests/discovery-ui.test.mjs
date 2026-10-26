import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {initDiscovery} from '../src/discovery.js';

async function withUi(work){
 const window=new Window({url:'http://localhost/'}),old={};
 for(const name of ['window','document','Option','CustomEvent','navigator']){old[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?window:window[name]});}
 try{
  globalThis.Option=function(text,value){const n=document.createElement('option');n.textContent=text;n.value=value;return n;};
  Object.defineProperty(navigator,'locks',{value:{request:async(name,options,fn)=>fn({name})},configurable:true});document.body.innerHTML='<section id="research-agent"></section>';
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};const btn=(text,fn,cls)=>{const n=el('button',cls,text);n.onclick=fn;return n;};
  const records=new Map(),journal={unlocked:true,put:async r=>records.set(r.id,structuredClone(r)),get:async id=>structuredClone(records.get(id)),list:async()=>structuredClone([...records.values()]),remove:async id=>records.delete(id)};
  const citation={book_id:'fiction',page:120,start:0,end:5,source_hash:'hash',source:'extracted',revision:0,title:'虚构园圃',quote:'蓝色的花盆'};
  let paid=0,checks=0,fail=false,blocked=false,release=null,profileReady=true;
  const api=async(path,options={})=>{
   if(path==='/api/session')return {authenticated:true,userId:'fictional-a'};
   if(path==='/api/books')return {books:[{id:'fiction',title:'虚构园圃',level:'public'},{id:'other',title:'限制测试资料',level:'special'}]};
   if(path==='/api/ai/discovery/search')return {citations:[citation]};
   if(path==='/api/ai/research/sources')return {citations:[citation]};
   if(path==='/api/ai/discovery/check'){checks++;return {result:JSON.parse(options.body).result,citations:[citation]};}
   throw Error('Unexpected path '+path);
  };
  const callAi=async(path,data)=>{paid++;assert.equal(path,'/api/ai/discovery/answer');assert.equal(data.publicConfirmed,true);if(fail)throw Error('模拟断网，未自动重试');if(blocked)await new Promise(resolve=>{release=resolve;});return {citations:[citation],result:{schema:1,id:data.id,at:new Date().toISOString(),model:'qwen-plus',books:[citation],sources:[{id:1,title:'<img onerror=alert(1)>',url:'https://example.org/fiction'}],paragraphs:[{text:'<script>fake()</script>虚构结果[ref_1][book_1]',web:[1],book:[1]}],unverifiedCount:1}};};
  const {root}=initDiscovery({api,el,btn,journal,callAi,aiStatus:async()=>({ready:profileReady,webSearch:profileReady,message:'配置未解锁',id:'fictional-profile',verifiedAt:'fictional-date'})});
  const button=name=>[...root.querySelectorAll('button')].find(b=>b.textContent===name);const label=name=>root.querySelector(`[aria-label="${name}"]`);const status=()=>root.querySelector('[role=status]').textContent;
  const confirm=()=>{for(const c of root.querySelectorAll('input[type=checkbox]'))c.checked=true;};
  const start=async()=>{label('公开研究问题').value='虚构园圃如何补水';confirm();await button('先查公开书库').onclick();};
  document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{authenticated:true,userId:'fictional-a'}}));
  await work({root,records,button,label,status,confirm,start,get paid(){return paid;},get checks(){return checks;},set fail(v){fail=v;},set blocked(v){blocked=v;},set profileReady(v){profileReady=v;},release:()=>release?.()});
 }finally{await window.happyDOM.abort();for(const [name,descriptor]of Object.entries(old))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
}
test('public search checkpoints, resume confirms consent, web citations render safely and completed restore is not billed',()=>withUi(async ui=>{
 await ui.button('刷新联合查询材料').onclick();assert.equal(ui.label('联合查询的书库范围').options.length,2);assert.ok(!ui.root.textContent.includes('限制测试资料'));
 await ui.start();assert.equal(ui.paid,0);assert.equal(ui.records.size,1);assert.equal([...ui.records.values()][0].status,'books');
 await ui.button('核对并恢复查询').onclick();await ui.button('联网补充并对照').onclick();assert.equal(ui.paid,0);assert.match(ui.status(),/确认公开资料/);
 ui.confirm();await ui.button('联网补充并对照').onclick();assert.equal(ui.paid,1);assert.equal([...ui.records.values()][0].status,'complete');assert.equal(ui.root.querySelector('script'),null);assert.equal(ui.root.querySelector('img'),null);assert.equal(ui.root.querySelector('a[target=_blank]').rel,'noopener noreferrer');assert.match(ui.status(),/加密保存/);
 await ui.button('核对并恢复查询').onclick();assert.equal(ui.checks,1);assert.equal(ui.paid,1);assert.match(ui.root.textContent,/第 120 页/);
 document.dispatchEvent(new CustomEvent('ziwei:logout'));assert.ok(!ui.root.textContent.includes('蓝色的花盆'));assert.ok(!ui.root.textContent.includes('虚构结果'));
}));
test('failed web request is saved as uncertain, restored without re-billing, and requires a new explicit query',()=>withUi(async ui=>{
 await ui.start();ui.fail=true;await ui.button('联网补充并对照').onclick();assert.equal(ui.paid,1);assert.equal([...ui.records.values()][0].status,'uncertain');assert.equal(ui.button('联网补充并对照'),undefined);await ui.button('核对并恢复查询').onclick();assert.equal(ui.paid,1);assert.ok(ui.root.textContent.includes('可能已计费'));assert.ok(ui.root.textContent.includes('蓝色的花盆'));
}));
test('locked API does not change a saved book checkpoint; account change discards a late result',()=>withUi(async ui=>{
 await ui.start();ui.profileReady=false;await ui.button('联网补充并对照').onclick();assert.equal(ui.paid,0);assert.equal([...ui.records.values()][0].status,'books');
 ui.profileReady=true;ui.blocked=true;const pending=ui.button('联网补充并对照').onclick();for(let i=0;i<50&&ui.paid===0;i++)await new Promise(r=>setTimeout(r,1));assert.equal(ui.paid,1);
 document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{authenticated:true,userId:'fictional-b'}}));ui.release();await pending;assert.ok(!ui.root.textContent.includes('虚构结果'));assert.equal([...ui.records.values()][0].status,'inflight');
}));
test('stale record revision prevents simultaneous tabs from sending another paid call',()=>withUi(async ui=>{
 await ui.start();const record=[...ui.records.values()][0];record.revision++;await ui.button('联网补充并对照').onclick();assert.equal(ui.paid,0);assert.match(ui.status(),/其他页面修改/);
}));
