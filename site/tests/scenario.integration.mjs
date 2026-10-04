import assert from 'node:assert/strict';import fs from 'node:fs';import {fictionalScenario} from '../src/scenario-engine.mjs';
const base='http://127.0.0.1:8770',suffix=Date.now().toString(36),a='local_preview_subject=scenario-a-'+suffix,b='local_preview_subject=scenario-b-'+suffix,core='local_preview_owner=1';let count=0;
const eq=(x,y)=>{assert.deepEqual(x,y);count++;};
async function req(path,{cookie=a,method='GET',body,origin=base}={}){const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
eq((await req('/api/storage')).data.testStore,true);
if(process.argv.includes('verify')){const p=JSON.parse(fs.readFileSync(new URL('../.wrangler/persistence-test/scenario-checkpoint.json',import.meta.url)));eq((await req('/api/world/runs/'+p.id,{cookie:p.cookie})).data.run.result.finalState.progress,3);eq((await req('/api/world/runs/'+p.id+'/replay',{cookie:p.cookie,method:'POST',body:{}})).data.replay.matches,true);eq((await req('/api/world/projects/'+p.projectId,{cookie:p.cookie})).data.reviews[0].runId,p.id);await req('/api/world/projects/'+p.projectId,{cookie:p.cookie,method:'DELETE',body:{revision:1}});eq((await req('/api/world/runs/'+p.id,{cookie:p.cookie})).status,404);console.log('PASS '+count+' scenario restart, review linkage and cascade checks');process.exit(0);}
const projectBody={title:'合成状态转移测试',state:{context:'虚构情境',resources:'合成资料',constraints:'仅测试',unknowns:'全部是假设'},events:[]};
const project=(await req('/api/world/projects',{method:'POST',body:projectBody})).data.project,id=project.id;
const branchBody={revision:1,title:'虚构情景甲',hypothesis:'合成假设',action:'合成行动',expected:'可比较的合成结果',observeOn:'2026-10-07'};
const branch=(await req('/api/world/projects/'+id+'/branches',{method:'POST',body:branchBody})).data.branch;
const branch2=(await req('/api/world/projects/'+id+'/branches',{method:'POST',body:{...branchBody,title:'虚构情景乙'}})).data.branch;
const p='/api/world/branches/'+branch.id+'/runs',input=fictionalScenario();
eq((await req(p,{cookie:'',method:'POST',body:input})).status,401);for(const cookie of [b,core])eq((await req(p,{cookie,method:'POST',body:input})).status,404);
eq((await req(p,{method:'POST',body:input,origin:'https://invalid.test'})).status,403);
for(const body of [null,[],{...input,birth:{}},{...input,initial:{budget:'3'}}])eq((await req(p,{method:'POST',body})).status,400);
const responses=await Promise.all([req(p,{method:'POST',body:input}),req(p,{method:'POST',body:input})]);eq(responses.map(r=>r.status),[200,200]);eq(responses[0].data.run.id,responses[1].data.run.id);const run=responses[0].data.run;
eq(run.result.finalState.progress,3);eq(run.inputSnapshot.branch.baseline.state,projectBody.state);eq(run.inputSnapshot.input.ruleSet.source,'fictional-demo');
const reordered={...input,initial:{ready:false,progress:0,budget:3,blocked:false}};eq((await req(p,{method:'POST',body:reordered})).data.run.id,run.id);
const alt=fictionalScenario();alt.initial.blocked=true;alt.ruleSet.version=2;const alternate=(await req(p,{method:'POST',body:alt})).data.run;eq(alternate.result.finalState.progress,0);assert.notEqual(alternate.id,run.id);count++;
const other=(await req('/api/world/branches/'+branch2.id+'/runs',{method:'POST',body:input})).data.run;assert.notEqual(other.id,run.id);count++;
const saved=(await req('/api/world/projects/'+id)).data;eq(saved.project,project);eq(saved.branches.find(x=>x.id===branch.id),branch);eq(saved.project.events,[]);eq(saved.runs.length,3);eq(saved.reviews.length,0);
for(const cookie of [b,core]){eq((await req('/api/world/runs/'+run.id,{cookie})).status,404);eq((await req('/api/world/runs/'+run.id+'/replay',{cookie,method:'POST',body:{}})).status,404);}
eq((await req('/api/world/runs/'+run.id,{cookie:''})).status,401);eq((await req('/api/world/runs/'+run.id+'/replay',{method:'POST',body:{initial:{budget:999}}})).status,400);
eq((await req('/api/world/runs/'+run.id+'/replay',{method:'POST',body:{}})).data.replay.matches,true);
const review={date:'2026-10-07',outcome:'contradicted',result:'合成现实反馈与预期不同',learning:'调整假设',runId:run.id};
eq((await req('/api/world/branches/'+branch2.id+'/reviews',{method:'POST',body:review})).status,404);eq((await req('/api/world/branches/'+branch.id+'/reviews',{cookie:b,method:'POST',body:review})).status,404);
eq((await req('/api/world/branches/'+branch.id+'/reviews',{method:'POST',body:review})).data.review.runId,run.id);
for(let version=3;version<=10;version++){const v=fictionalScenario();v.ruleSet.version=version;eq((await req(p,{method:'POST',body:v})).status,200);}
const excess=fictionalScenario();excess.ruleSet.version=11;eq((await req(p,{method:'POST',body:excess})).status,409);eq((await req(p,{method:'POST',body:input})).data.run.id,run.id);
eq((await req('/api/world/runs/'+run.id+'/replay',{method:'POST',body:{}})).data.replay.result,run.result);
fs.writeFileSync(new URL('../.wrangler/persistence-test/scenario-checkpoint.json',import.meta.url),JSON.stringify({id:run.id,projectId:id,cookie:a}));console.log('PASS '+count+' scenario state, replay, deduplication, bounds, isolation and review checks');
