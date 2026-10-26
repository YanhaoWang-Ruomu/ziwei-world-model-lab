import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateResearchCase,evaluationSummary,RESEARCH_CASES} from '../src/research-evaluations.mjs';
import {researchQuality,researchReport} from '../src/research-report.mjs';
import {evaluationChecks,READING_FIXTURES} from '../src/ai-evaluation-fixtures.mjs';
test('evaluation refuses invented quotations instead of hardcoding citation success',()=>{
 const f=READING_FIXTURES[0];assert.equal(evaluationChecks(f,{claims:[{text:'每天',source:1,quote:'编造原文'}],uncertainties:[]}).citationValid,false);
});
test('logic and causality grades test the returned boolean and keep human review distinct',async()=>{
 for(const id of ['logic','causal']){const good=await evaluateResearchCase(id,{connection:{generate:async()=>({text:'{"can_conclude":false,"reason":"虚构条件不足"}'})}});assert.equal(good.mechanicalPass,true);assert.deepEqual(good.humanReviews,[]);const bad=await evaluateResearchCase(id,{connection:{generate:async()=>({text:'{"can_conclude":true,"reason":"错误断言"}'})}});assert.equal(bad.mechanicalPass,false);}
});
test('vision grading requires the actual expected quantities',async()=>{
 const row=await evaluateResearchCase('vision',{connection:{generate:async()=>({text:'{"a_ml":20,"b_ml":30,"total_ml":50}'})},image:'data:image/png;base64,YQ=='});assert.equal(row.mechanicalPass,true);assert.equal(row.modelCalls,1);
 await assert.rejects(evaluateResearchCase('vision',{connection:{}}),/图片/);
});
test('Agent evaluation interrupts a fictional tool, reuses the saved action, then validates a quotation',async()=>{
 let calls=0;const row=await evaluateResearchCase('agent',{connection:{model:'fixture-model',generate:async()=>({text:JSON.stringify(++calls===1?{action:'search',query:'虚构蓝盆'}:{action:'answer',claims:[{text:'每天一次',source:1,quote:'每天浇水一次'}],uncertainties:[]})})}});
 assert.equal(row.mechanicalPass,true);assert.equal(calls,2);assert.equal(row.checks.resumeWithoutRegeneration,true);
});
test('summary keeps errors, failures, unrun cases and human reviews separate',()=>{
 const s=evaluationSummary({results:[{mechanicalPass:true,elapsedMs:2,humanReviews:[{pass:false}]},{mechanicalPass:false,elapsedMs:3},{error:'not connected',elapsedMs:1}]});
 assert.equal(s.total,RESEARCH_CASES.length);assert.equal(s.passed,1);assert.equal(s.failed,1);assert.equal(s.errors,1);assert.equal(s.reviewed,1);assert.equal(s.completed,3);assert.equal(s.elapsedMs,6);
});
test('research report includes audit trail and uncertainties, rejecting stale or unsupported quotes',()=>{
 const r={goal:'虚构蓝盆研究',created:'2026-10-27',provider:'native',status:'complete',step:2,events:[{action:'search',query:'蓝盆',count:1}],citations:[{title:'虚构园圃',page:120,start:0,end:8,source_hash:'fiction',quote:'蓝盆每天浇水。',revision:1}],result:{claims:[{text:'每天浇水',quote:'每天浇水',source:1}],uncertainties:['未说明水量']},feedback:[]};
 assert.equal(researchQuality(r).citationValid,true);assert.match(researchReport(r),/第 120 页/);assert.match(researchReport(r),/未说明水量/);assert.match(researchReport(r),/检索/);
 r.citations[0].quote='原文已修订';assert.throws(()=>researchReport(r),/重新核对出处/);
});
