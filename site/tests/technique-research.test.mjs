import test from 'node:test';import assert from 'node:assert/strict';
import {fictionalStore,fixtureRequest} from './fictional-store.mjs';
import {worldCommunityRoute} from '../server/world-community.js';
import {techniqueScenario} from '../src/technique-scenario.mjs';
import {runScenario} from '../src/scenario-engine.mjs';
test('a published fictional technique creates an isolated research snapshot and editable observation run',async()=>{
 const env=fictionalStore(),{db}=env,viewer={id:'fictional-owner',actor:'fictional-owner',role:'special'};
 const call=(v,path,method='GET',data)=>worldCommunityRoute({path,method,request:fixtureRequest(path,method,data),db,viewer:v,url:new URL('https://fictional.invalid'+path)});
 try{const payload={title:'虚构组合测试',level:'public',outcome:'fixture matched',rule:{version:1,mode:'all',conditions:[{scope:'natal',star:'',palace:'命宫',mutagen:'',exclude:false}],unresolved:[]}};
  await db.prepare("INSERT INTO authored_techniques(id,author,payload,level,published_payload,published_revision,release_version,updated_at) VALUES ('fixture-card','fictional-author',?,'public',?,1,1,1)").bind(JSON.stringify(payload),JSON.stringify(payload)).run();
  const chart={palaces:Array.from({length:12},(_,index)=>({name:index===0?'命宫':'fixture-'+index,earthlyBranch:'子丑寅卯辰巳午未申酉戌亥'[index],majorStars:[],minorStars:[]}))},input={id:'fixture-card',revision:1,chart,cycle:{date:'2026-01-01',time:'12:00'},unit:'current',date:'2026-01-01',confirmed:true};
  await assert.rejects(call({},'/api/world/technique-research','POST',input),e=>e.status===401);const created=await call(viewer,'/api/world/technique-research','POST',input);
  await assert.rejects(call({id:'fictional-other'},'/api/world/projects/'+created.projectId),e=>e.status===404);const study=await call(viewer,'/api/world/projects/'+created.projectId),assessment=study.branches[0].baseline.assessment;assert.equal(assessment.status,'matches');assert.equal(assessment.revision,1);assert.equal(assessment.rule,undefined);assert.equal(study.project.events.length,0);
  const scenario=techniqueScenario(assessment),run=runScenario(scenario);assert.equal(run.steps[0].trace[0].status,'applied');assert.equal(run.finalState.matched,true);assert.equal(run.events.length,0);
  await db.prepare("UPDATE authored_techniques SET published_revision=2 WHERE id='fixture-card'").run();assert.equal((await call(viewer,'/api/world/projects/'+created.projectId)).branches[0].baseline.assessment.revision,1);await assert.rejects(call(viewer,'/api/world/technique-research','POST',input),e=>e.status===409);
 }finally{db.close();}
});
