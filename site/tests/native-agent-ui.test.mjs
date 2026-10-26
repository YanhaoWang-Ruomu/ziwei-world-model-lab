import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {initResearchAgent} from '../src/research-agent.js';
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI did not settle');};
test('native research UI saves a tool checkpoint, reopens it, finishes without paid calls and clears on disconnect',async()=>{
 const window=new Window({url:'http://127.0.0.1:8770/'}),old={};for(const name of ['window','document','Option','CustomEvent','navigator']){old[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?window:window[name]});}
 try{
  globalThis.Option=function(text,value){const node=document.createElement('option');node.textContent=text;node.value=value;return node;};Object.defineProperty(navigator,'locks',{value:{request:async(_name,_options,fn)=>fn({})},configurable:true});
  document.body.innerHTML='<section id="world"></section>';const el=(tag,c,text)=>{const n=document.createElement(tag);if(c)n.className=c;if(text)n.textContent=text;return n;},btn=(text,fn,c)=>{const n=el('button',c,text);n.onclick=fn;return n;};
  const records=new Map(),journal={unlocked:true,put:async r=>records.set(r.id,structuredClone(r)),get:async id=>structuredClone(records.get(id)),list:async()=>structuredClone([...records.values()]),remove:async id=>records.delete(id)};
  const citation={book_id:'fiction',page:1,start:0,end:9,source_hash:'f',revision:0,source:'extracted',title:'虚构记录',quote:'虚构蓝盆每天浇水。'};let calls=0;
  const api=async(url,options)=>{if(url==='/api/session')return {authenticated:true,userId:'fictional',core:true};if(url==='/api/ai/research/sources')return {citations:JSON.parse(options.body).references.map(r=>({...citation,...r}))};throw Error('Unexpected cloud call: '+url);};
  const nativeStep=async(data,{pendingDecision,onDecision})=>{calls++;if(calls===1){await onDecision({action:'search',query:'蓝盆'});throw Error('虚构工具请求中断');}if(calls===2){assert.equal(pendingDecision.action,'search');return {decision:pendingDecision,citations:[citation]};}return {decision:{action:'answer',claims:[{text:'每天浇水',source:1,quote:'每天浇水'}],uncertainties:[]},citations:[citation]};};
  const {root}=initResearchAgent({api,el,btn,journal,nativeStep,nativeConnection:{ready:true},semanticFactory:()=>({clear(){}})});
  const button=name=>[...root.querySelectorAll('button')].find(n=>n.textContent===name),label=name=>root.querySelector(`[aria-label="${name}"]`),status=()=>root.querySelector('[role=status]').textContent;
  document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{authenticated:true,userId:'fictional',core:true}}));label('研究使用的 AI').value='native';label('AI 研究目标').value='查询虚构记录';const checks=root.querySelectorAll('input[type=checkbox]');checks[0].checked=true;checks[1].checked=true;
  button('开始新的研究').click();await wait(()=>status().includes('虚构工具请求中断'));assert.equal(records.size,1);assert.equal([...records.values()][0].pendingNativeAction.query,'蓝盆');assert.equal([...records.values()][0].status,'paused');
  // Reopen from stored history, as on a later visit. No generation occurs while opening.
  document.dispatchEvent(new CustomEvent('ziwei:ai-unlocked'));await wait(()=>button('核对来源并打开'));button('核对来源并打开').click();await wait(()=>!checks[0].checked);checks[0].checked=true;assert.equal(calls,1);
  button('继续已保存的工具操作').click();await wait(()=>status().includes('本步已完成并暂停'));assert.equal(calls,2);assert.equal([...records.values()][0].pendingNativeAction,undefined);
  button('继续已保存的下一步').click();await wait(()=>status().includes('研究草稿已生成'));assert.equal(calls,3);assert.equal([...records.values()][0].status,'complete');assert.ok(root.textContent.includes('每天浇水'));
  document.dispatchEvent(new CustomEvent('ziwei:native-ai-disconnected'));assert.ok(!root.textContent.includes('每天浇水'));assert.equal(label('AI 研究目标').value,'');
 }finally{await window.happyDOM.abort();for(const [name,descriptor]of Object.entries(old))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
});
