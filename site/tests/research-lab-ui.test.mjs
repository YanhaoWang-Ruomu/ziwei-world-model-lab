import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {initVisualResearch} from '../src/visual-research-ui.js';
import {initResearchEvaluations} from '../src/research-evaluations-ui.js';
async function ui(work){
 const w=new Window({url:'http://127.0.0.1:8879/'}),old={};for(const n of ['window','document','Option','CustomEvent','Event','navigator']){old[n]=Object.getOwnPropertyDescriptor(globalThis,n);Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==='window'?w:w[n]});}
 try{globalThis.Option=function(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o;};Object.defineProperty(navigator,'locks',{value:{request:async(_n,_o,fn)=>fn({})},configurable:true});document.body.innerHTML='<section id="library"></section><section id="world"></section>';
 const el=(t,c,text)=>{const e=document.createElement(t);if(c)e.className=c;if(text!==undefined)e.textContent=text;return e;},btn=(text,fn,c)=>{const b=el('button',c,text);b.onclick=fn;return b;};
 const records=new Map(),journal={unlocked:true,put:async r=>records.set(r.id,structuredClone(r)),get:async id=>structuredClone(records.get(id)),list:async()=>structuredClone([...records.values()]),remove:async id=>records.delete(id)};
 let revision='v1',permission=true,calls=0,failAt=0,release=null,block=false;
 const api=async path=>{if(path==='/api/session')return {authenticated:true,userId:'fiction'};if(path==='/api/books')return {books:[{id:'fiction',title:'虚构园圃',level:'public'},{id:'restricted',title:'权限测试样本',level:'special'}]};if(path.startsWith('/api/ai/visual/page?')){if(!permission)throw Error('不再公开');return {version:revision,title:'虚构园圃',text:'虚构蓝盆',imageReady:true};}throw Error('Unexpected API');};
 const connection={ready:true,model:'fixture-model',generate:async()=>{calls++;if(block)await new Promise(r=>release=r);if(calls===failAt)throw Error('模拟模型中断');return {text:JSON.stringify({relevance:3,readable:true,excerpt:'<script>not executable</script>',reason:'虚构蓝盆',uncertainties:[]})};}};
 const env={api,el,btn,journal,connection,imageLoader:async()=> 'data:image/png;base64,YQ==',get calls(){return calls;},set failAt(n){failAt=n;},set block(v){block=v;},release:()=>release?.(),set revision(v){revision=v;},set permission(v){permission=v;},records};
 const controls=root=>({root,button:name=>[...root.querySelectorAll('button')].find(b=>b.textContent===name),label:name=>root.querySelector(`[aria-label="${name}"]`),status:()=>root.querySelector('[role=status]').textContent});
 await work(env,controls);
 }finally{await w.happyDOM.abort();for(const [n,d]of Object.entries(old))d?Object.defineProperty(globalThis,n,d):delete globalThis[n];}
}
const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2));}throw Error('UI did not settle');};
test('visual UI filters public books, saves each page, resumes after failure and rejects changed sources',()=>ui(async(e,controls)=>{
 const c=controls(initVisualResearch(e).root);document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{userId:'fiction',authenticated:true}}));await c.button('刷新图文比较书籍').onclick();assert.equal(c.label('图文比较书籍').options.length,2);
 c.label('图文比较书籍').value='fiction';c.label('图文比较问题').value='虚构蓝盆';c.label('图文比较起始页').value=119;c.label('图文比较结束页').value=120;for(const n of c.root.querySelectorAll('input[type=checkbox]'))n.checked=true;e.failAt=2;
 await c.button('开始新的书页比较').onclick();assert.equal([...e.records.values()][0].pages.length,1);assert.match(c.status(),/模拟模型中断/);
 await c.button('继续未处理的书页').onclick();assert.equal(e.calls,3);assert.equal([...e.records.values()][0].status,'complete');assert.equal(c.root.querySelector('script'),null);
 await c.button('核对并恢复书页比较').onclick();assert.equal(e.calls,3);assert.match(c.status(),/进度已恢复/);
 e.revision='v2';await c.button('核对并恢复书页比较').onclick();assert.match(c.status(),/修订/);
 document.dispatchEvent(new Event('ziwei:logout'));assert.ok(!c.root.textContent.includes('虚构蓝盆'));assert.equal(c.label('图文比较问题').value,'');
}));
test('visual logout during inference discards late results and prevents persistence',()=>ui(async(e,controls)=>{
 const c=controls(initVisualResearch(e).root);document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{userId:'fiction',authenticated:true}}));await c.button('刷新图文比较书籍').onclick();c.label('图文比较书籍').value='fiction';c.label('图文比较问题').value='虚构蓝盆';for(const n of c.root.querySelectorAll('input[type=checkbox]'))n.checked=true;e.block=true;
 const pending=c.button('开始新的书页比较').onclick();await wait(()=>e.calls===1);document.dispatchEvent(new Event('ziwei:logout'));e.release();await pending;assert.equal([...e.records.values()][0].pages.length,0);assert.equal(c.root.querySelector('blockquote'),null);
}));
test('evaluation UI saves per question, preserves errors, restores without model calls and appends review',()=>ui(async(e,controls)=>{
 let calls=0;const c=controls(initResearchEvaluations({...e,loadImage:async()=> 'fixture-image',evaluate:async id=>{calls++;if(id==='causal')throw Error('模拟推理未完成');return {id,mechanicalPass:id!=='logic',checks:{test:id!=='logic'},observation:'虚构返回内容',elapsedMs:3,modelCalls:1,humanReviews:[]};}}).root);
 document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{userId:'fiction',authenticated:true}}));c.label('加密保存验收记录').checked=true;await c.button('开始一轮本机验收').onclick();assert.equal(calls,7);assert.match(c.root.textContent,/机械检查通过 5/);assert.match(c.root.textContent,/运行错误 1/);assert.match(c.root.textContent,/未通过 1/);
 await c.button('人工核对：不符合').onclick();assert.equal([...e.records.values()][0].results[0].humanReviews[0].pass,false);await c.button('打开验收记录').onclick();assert.equal(calls,7);
 document.dispatchEvent(new Event('ziwei:ai-locked'));assert.ok(!c.root.textContent.includes('虚构返回内容'));
}));
test('evaluation pause resumes only unfinished questions',()=>ui(async(e,controls)=>{
 let calls=0,release;const c=controls(initResearchEvaluations({...e,loadImage:async()=>'',evaluate:async id=>{calls++;if(calls===2)await new Promise(r=>release=r);return {id,mechanicalPass:true,checks:{x:true},observation:'ok',elapsedMs:1,modelCalls:1,humanReviews:[]};}}).root);
 document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{userId:'fiction',authenticated:true}}));c.label('加密保存验收记录').checked=true;const pending=c.button('开始一轮本机验收').onclick();await wait(()=>calls===2);c.button('暂停验收').onclick();release();await pending;assert.equal([...e.records.values()][0].results.length,1);
 await c.button('继续未完成的验收题').onclick();assert.equal(calls,8);assert.equal([...e.records.values()][0].results.length,7);
}));
