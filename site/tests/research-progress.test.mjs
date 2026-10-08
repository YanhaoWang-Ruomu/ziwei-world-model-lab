import test from 'node:test';
import assert from 'node:assert/strict';
import {finishPendingSearch,appendResearchFeedback} from '../src/research-progress.mjs';
import {validateOutput} from '../src/local-ai-contracts.mjs';
import {conditionSource} from '../src/technique-provenance.mjs';
const ref={book_id:'fiction',page:120,start:0,end:8,source_hash:'hash',revision:0,source:'extracted',quote:'虚构植物需要补水',title:'虚构园圃'};
const pending={id:'fixture',status:'paused',bookId:'fiction',citations:[],step:1,pendingSearch:{query:'植物口渴'},events:[{action:'search'}]};
test('resuming saved semantic stage only calls local search and source validation; errors preserve checkpoint',async()=>{
  const calls=[];const services={search:async(book,query)=>{calls.push(['local',book,query]);return [ref];},verify:async references=>{calls.push(['verify',references]);assert.equal(references[0].quote,undefined);return {citations:[ref]};}};
  const copy=structuredClone(pending),done=await finishPendingSearch(copy,services);
  assert.deepEqual(copy,pending);assert.equal(done.pendingSearch,undefined);assert.equal(done.step,1);assert.equal(done.events[0].retrieval,'关键词 + 本机语义');assert.equal(done.citations[0].page,120);assert.equal(calls.length,2);
  await assert.rejects(finishPendingSearch(copy,{...services,verify:async()=>{throw Error('资料不再公开');}}),/公开/);assert.deepEqual(copy,pending);
  const abort=new AbortController();abort.abort();await assert.rejects(finishPendingSearch(copy,{...services,signal:abort.signal}),e=>e.name==='AbortError');
});
test('feedback is append-only and preserves original answer; invalid dates and oversized notes rejected',()=>{
  const baseline={id:'fiction',status:'complete',result:{claims:[{text:'虚构花盆一天一次'}],uncertainties:[]},feedback:[]};
  const input={observedOn:'2026-10-08',outcome:'contradicted',observation:'虚构实验实际每天两次。',lesson:'原说法与这次观察不一致，需要更多资料。'};
  const first=appendResearchFeedback(baseline,input,'2026-10-09T00:00:00.000Z'),second=appendResearchFeedback(first,{...input,outcome:'unclear'},'2026-10-09T01:00:00.000Z');
  assert.equal(baseline.feedback.length,0);assert.equal(first.feedback.length,1);assert.equal(second.feedback.length,2);assert.deepEqual(second.result,baseline.result);assert.deepEqual(second.feedback[0],first.feedback[0]);
  for(const observedOn of ['2026-02-30','2027-01-01','not-date'])assert.throws(()=>appendResearchFeedback(baseline,{...input,observedOn},'2026-10-09T00:00:00Z'),/日期/);
  assert.throws(()=>appendResearchFeedback(baseline,{...input,lesson:'x'.repeat(1001)}),/1000/);
});
test('fictional technique provenance follows literal offsets and becomes stale after text or condition edits',()=>{
  const source='流年天同在命宫化禄',text='虚构语法测试\n'+source; // Only a synthetic syntax fixture.
  const result=validateOutput({kind:'technique',text},JSON.stringify({lines:[{source,condition:source}],uncertainties:[]}));
  const condition=result.rule.conditions[0];assert.equal(conditionSource(condition,text).state,'linked');assert.equal(condition.provenance.start,text.indexOf(source));
  assert.equal(conditionSource({...condition,palace:'夫妻宫'},text).state,'stale');assert.equal(conditionSource(condition,'改过的原文').state,'stale');assert.equal(conditionSource({scope:'yearly'},text).state,'missing');
  assert.deepEqual(result.rule.unresolved,[text]);
});
