import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {initResearchAgent} from '../src/research-agent.js';
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI checkpoint timed out');};
test('Agent pauses by default, resumes local indexing without billing again, appends feedback and clears on logout',async()=>{
 const window=new Window({url:'http://localhost/'}),old={};for(const name of ['window','document','Option','CustomEvent','navigator']){old[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?window:window[name]});}
 try{
  globalThis.Option=function(text,value){const n=document.createElement('option');n.textContent=text;n.value=value;return n;};
  Object.defineProperty(globalThis.navigator,'locks',{value:{request:async(name,options,fn)=>fn({name})},configurable:true});
  const el=(t,c,s)=>{const n=document.createElement(t);if(c)n.className=c;if(s!==undefined)n.textContent=s;return n;},btn=(s,fn,c)=>{const n=el('button',c,s);n.onclick=fn;return n;};document.body.innerHTML='<section id="world"></section>';
  const quote='虚构花盆每天补水一次。',citation={book_id:'fiction',page:120,start:0,end:quote.length,quote,title:'虚构园圃',source_hash:'hash',source:'extracted',revision:0};
  const records=new Map(),journal={unlocked:true,put:async r=>records.set(r.id,structuredClone(r)),get:async id=>structuredClone(records.get(id)),list:async()=>structuredClone([...records.values()]),remove:async id=>records.delete(id)};
  let paid=0,local=0,failLocal=true,clears=0;const sent=[];
  const api=async(path,options={})=>{
   if(path==='/api/session')return {authenticated:true,userId:'fictional-a',core:true};
   if(path==='/api/books')return {books:[{id:'fiction',title:'虚构园圃',level:'public'},{id:'restricted',title:'测试限制材料',level:'special'}]};
   if(path==='/api/ai/research/sources')return {citations:JSON.parse(options.body).references.map(r=>({...r,quote,title:'虚构园圃'}))};
   if(path==='/api/ai/research/step'){paid++;const data=JSON.parse(options.body);sent.push(data);assert.equal(data.bookId,'fiction');return data.step===0?{decision:{action:'search',query:'花盆'},citations:[]}:{decision:{action:'answer',claims:[{text:'每天一次',source:1,quote:'每天补水一次'}],uncertainties:[]},citations:[citation]};}
   throw Error('Unexpected endpoint '+path);
  };
  const {root}=initResearchAgent({api,el,btn,journal,semanticFactory:()=>({clear(){clears++;},async search(){local++;if(failLocal)throw Error('虚构网络中断');return [citation];}})});
  const button=name=>[...root.querySelectorAll('button')].find(n=>n.textContent===name),label=name=>root.querySelector(`[aria-label="${name}"]`),status=()=>root.querySelector('[role=status]').textContent;
  document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{authenticated:true,userId:'fictional-a',core:true}}));
  button('刷新公开材料列表').click();await wait(()=>label('研究材料范围').options.length===2);assert.ok(!root.textContent.includes('测试限制材料'));
  label('研究材料范围').value='fiction';label('研究使用的 AI').value='qwen';label('AI 研究目标').value='比较虚构园圃记录';for(const c of root.querySelectorAll('input[type=checkbox]'))c.checked=true;
  button('开始新的研究').click();await wait(()=>status().includes('虚构网络中断'));assert.equal(paid,1);assert.equal(records.size,1);assert.ok([...records.values()][0].pendingSearch);assert.equal(local,1);
  failLocal=false;button('继续本机检索（不重发 AI 请求）').click();await wait(()=>status().includes('本步已完成并暂停'));assert.equal(paid,1);assert.equal(local,2);assert.equal([...records.values()][0].pendingSearch,undefined);
  button('继续已保存的下一步').click();await wait(()=>status().includes('研究草稿已生成，请核对引用'));assert.equal(paid,2);const original=structuredClone([...records.values()][0].result);
  label('实际反馈').value='虚构复盘：实际记录两次。';label('复盘说明').value='与当时结论不同。';label('反馈与原结论对照').value='contradicted';button('追加加密复盘记录').click();await wait(()=>status().includes('复盘已加密保存'));assert.equal(paid,2);assert.deepEqual([...records.values()][0].result,original);assert.equal([...records.values()][0].feedback.length,1);assert.ok(sent.every(p=>!JSON.stringify(p).includes('实际记录两次')));
  button('核对来源并打开').click();await wait(()=>root.textContent.includes('实际记录两次'));assert.equal(paid,2);
  document.dispatchEvent(new CustomEvent('ziwei:logout'));assert.ok(!root.textContent.includes('实际记录两次'));assert.ok(!root.textContent.includes('每天一次'));assert.ok(clears>=2);
 }finally{window.happyDOM.abort();for(const [name,descriptor]of Object.entries(old))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
});
