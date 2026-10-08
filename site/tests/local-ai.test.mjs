import test from 'node:test';
import assert from 'node:assert/strict';
import {messagesFor,validateOutput,verifySources} from '../src/local-ai-contracts.mjs';
import {createLocalGenerator} from '../src/local-ai-runtime.mjs';
const citation={book_id:'fiction',page:120,title:'虚构温室记录',quote:'蓝色花盆每天浇水一次，每次20毫升。',source_hash:'hash',revision:0,source:'extracted',start:0,end:22};
const input={kind:'answer',question:'每天浇几次水？',citations:[citation]};
const raw=JSON.stringify({claims:[{text:'每天一次。',source:1,quote:'每天浇水一次'}],uncertainties:[]});
test('AI accepts literal citations but never treats them as semantic correctness',()=>{
  assert.equal(validateOutput(input,raw).claims.length,1);
  assert.throws(()=>validateOutput(input,raw.replace('每天浇水一次','每天浇水三次')),/引用/);
  assert.throws(()=>validateOutput(input,raw.replace('"source":1','"source":8')),/引用/);
  assert.throws(()=>validateOutput(input,'{"claims":[]'),/完整/);
  assert.throws(()=>messagesFor({...input,question:'x'.repeat(401)}),/400/);
});
test('AI retains original technique as unresolved and rejects inferred slots',()=>{
  const technique={kind:'technique',text:'流年天同在命宫化禄'}; // Fictional syntax fixture, not a private technique.
  const result=validateOutput(technique,JSON.stringify({lines:[{source:technique.text,condition:technique.text}],uncertainties:[]}));
  assert.equal(result.rule.conditions.length,1);assert.deepEqual(result.rule.unresolved,[technique.text]);
  assert.throws(()=>validateOutput(technique,JSON.stringify({lines:[{source:technique.text,condition:'流年天同在夫妻宫化禄'}],uncertainties:[]})),/补出/);
  assert.throws(()=>validateOutput(technique,JSON.stringify({lines:[{source:'虚构不存在原文',condition:technique.text}],uncertainties:[]})),/对应/);
});
test('source checks reject revision changes, deleted pages and revoked access',async()=>{
  const response={source_hash:'hash',pages:[{page:120,revision:0,source:'extracted',text:citation.quote}]};
  await verifySources(input,async()=>response);
  await assert.rejects(verifySources(input,async()=>({...response,source_hash:'new'})),/变化/);
  await assert.rejects(verifySources(input,async()=>({...response,pages:[]})),/变化/);
  await assert.rejects(verifySources(input,async()=>{throw Error('403');}),/403/);
});
test('generation serializes requests, cancels immediately and ignores stale worker messages',async()=>{
  const workers=[];const generator=createLocalGenerator({workerFactory:()=>{const w={postMessage(m){this.request=m;},terminate(){this.stopped=true;}};workers.push(w);return w;}});
  const first=generator.generate([]);await assert.rejects(generator.generate([]),/已有/);generator.stop();await assert.rejects(first,/停止/);assert.equal(workers[0].stopped,true);
  const next=generator.generate([]);workers[0].onmessage({data:{id:workers[0].request.id,text:'stale'}});workers[1].onmessage({data:{id:workers[1].request.id,text:'new'}});assert.equal(await next,'new');generator.stop();
});
