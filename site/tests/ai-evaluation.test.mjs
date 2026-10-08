import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRetrieval} from '../evaluations/run-retrieval.mjs';
import {evaluationInput,evaluationChecks} from '../src/ai-evaluation-fixtures.mjs';
test('fixed retrieval baseline catches deep-page loss, simplified/traditional differences and access leakage',async()=>{
 const result=await evaluateRetrieval();assert.equal(result.cases,12);assert.equal(result.syntheticOnly,true);
 for(const id of ['simplified','traditional','page120','lastpage','crossbook'])assert.equal(result.rows.find(r=>r.id===id).recall,1,id);
 assert.equal(result.rows.find(r=>r.id==='restricted').noEvidenceCorrect,true);
 assert.equal(result.noEvidenceAccuracy,1);assert.ok(result.recallAt5>=8/9);
 // Keep the paraphrase miss visible: this suite is not evidence of semantic model quality.
 assert.ok(result.rows.some(r=>r.id==='paraphrase'));
});
test('refusal and marker checks remain separate from human semantic review',()=>{
 const {fixture}=evaluationInput('insufficient');assert.equal(evaluationChecks(fixture,{claims:[],uncertainties:['原文没有价格。']}).refusalObserved,true);
 const {fixture:conflict}=evaluationInput('conflict');assert.equal(evaluationChecks(conflict,{claims:[{text:'七天'}],uncertainties:[]}).expectedMarkersPresent,false);
});
