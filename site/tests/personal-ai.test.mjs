import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {requestPersonalAi,personalAiRoute} from '../server/personal-ai.mjs';
import {researchAgentRoute} from '../server/research-agent.mjs';
import {canonicalBase,validateConnection} from '../src/ai-provider-catalog.mjs';
import {parseAgentAction} from '../src/research-agent-contracts.mjs';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0017_personal_ai_usage.sql',import.meta.url),'utf8'));
 sql.exec("CREATE TABLE books(id TEXT,title TEXT,kind TEXT,source_hash TEXT,level TEXT,status TEXT);CREATE TABLE pages(book_id TEXT,page INTEGER,raw_text TEXT,reviewed TEXT,corrected_text TEXT,correction_status TEXT,correction_revision INTEGER);INSERT INTO books VALUES('fiction','虚构花盆日志','article','hash','public','ready');INSERT INTO pages VALUES('fiction',120,'蓝色花盆每天浇水一次。','[]','','',0);");
 const db={prepare:s=>({bind:(...args)=>({first:async()=>sql.prepare(s).get(...args),run:async()=>({meta:{changes:sql.prepare(s).run(...args).changes}})})})};
 const connection={baseUrl:'https://api.deepseek.com/v1',model:'fictional-model',apiKey:'fictional-secret-never-real'};
 const viewer={id:'fictional-a',owner:false};let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,connection.baseUrl+'/chat/completions');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+connection.apiKey);return Response.json({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{prompt_tokens:10,completion_tokens:4}});};
 const base={env:{},db,viewer,connection,fetcher,id:crypto.randomUUID(),messages:[{role:'user',content:'JSON connection test'}]};
 const ref={book_id:'fiction',page:120,start:0,end:11,source_hash:'hash',revision:0,source:'extracted'};
 return {sql,db,base,ref,get calls(){return calls;}};
}
test('provider addresses reject private networks, URL tricks and unreviewed gateways',()=>{
 const c={apiKey:'fictional-key-only',model:'fixture'};
 for(const baseUrl of ['http://api.deepseek.com/v1','https://127.0.0.1/v1','https://[::1]/v1','https://api.deepseek.com@evil.example/v1','https://api.deepseek.com.evil.example/v1','https://api.deepseek.com/v1?key=x','https://api.deepseek.com/v1#secret','https://api.deepseek.com:8443/v1','https://localhost/v1'])assert.throws(()=>validateConnection({...c,baseUrl}));
 assert.equal(canonicalBase('https://api.deepseek.com/v1/chat/completions/'),'https://api.deepseek.com/v1');assert.equal(validateConnection({...c,baseUrl:'https://api.deepseek.com/v1/'}).model,'fixture');
});
test('ordinary accounts use their own keys; duplicate calls and per-account quotas are isolated',async()=>{
 const f=fixture();try{await requestPersonalAi(f.base);await assert.rejects(requestPersonalAi(f.base),e=>e.status===429);await requestPersonalAi({...f.base,viewer:{id:'fictional-b'}});assert.equal(f.calls,2);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM personal_ai_usage').get().n,2);assert.ok(!JSON.stringify(f.sql.prepare('SELECT * FROM personal_ai_usage').all()).includes('secret'));
 const day=new Date().toISOString().slice(0,10),hash=f.sql.prepare('SELECT owner_hash FROM personal_ai_usage LIMIT 1').get().owner_hash;
 for(let n=0;n<99;n++)f.sql.prepare('INSERT INTO personal_ai_usage(owner_hash,request_id,day,status) VALUES(?,?,?,?)').run(hash,'fixture-'+n,day,'completed');
 await assert.rejects(requestPersonalAi({...f.base,id:crypto.randomUUID()}),e=>e.status===429);await assert.rejects(requestPersonalAi({...f.base,viewer:{}}),e=>e.status===401);
 }finally{f.sql.close();}
});
test('network, provider and oversized errors never echo credentials or retry',async()=>{
 for(const variant of ['network','http','oversize','truncated']){const f=fixture();try{let calls=0;const fetcher=async()=>{calls++;if(variant==='network')throw Error(f.base.connection.apiKey);if(variant==='http')return new Response(f.base.connection.apiKey,{status:401});if(variant==='oversize')return new Response('x'.repeat(50001));return Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]});};await assert.rejects(requestPersonalAi({...f.base,fetcher}),e=>e.status===502&&!e.message.includes('secret'));assert.equal(calls,1);await assert.rejects(requestPersonalAi(f.base),e=>e.status===429);}finally{f.sql.close();}}
});
test('verification requires consent and real model JSON, never returns supplied key',async()=>{
 const f=fixture();try{const data={id:crypto.randomUUID(),connection:f.base.connection,consent:true},ctx={path:'/api/ai/personal/verify',method:'POST',viewer:f.base.viewer,env:{},db:f.db};const call=()=>personalAiRoute({...ctx,request:new Request('https://fixture.invalid/api/ai/personal/verify',{method:'POST',body:JSON.stringify(data)})},{generate:p=>requestPersonalAi({...p,fetcher:f.base.fetcher})});const result=await call();assert.equal(result.ok,true);assert.equal(f.calls,1);assert.ok(!JSON.stringify(result).includes('secret'));data.consent=false;await assert.rejects(call(),e=>e.status===400);}finally{f.sql.close();}
});
test('edge-compatible requests refuse redirects without forwarding credentials or retrying',async()=>{
 for(const status of [301,302,307,308]){const f=fixture();try{let calls=0;
  await assert.rejects(requestPersonalAi({...f.base,fetcher:async(url,options)=>{calls++;if(!['follow','manual'].includes(options.redirect))throw Error('Unsupported edge redirect mode');assert.equal(options.redirect,'manual');return new Response(null,{status,headers:{Location:'https://untrusted.invalid/'}});}}),e=>e.status===502&&e.message.includes('重定向'));
  assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT status FROM personal_ai_usage').get().status,'failed');
 }finally{f.sql.close();}}
});
test('model evaluation only accepts fixed fictional questions and checks original quotations',async()=>{
 const f=fixture();try{let calls=0;const data={fixture:'literal',id:crypto.randomUUID(),connection:f.base.connection,consent:true};
  const context={path:'/api/ai/personal/evaluate',method:'POST',viewer:f.base.viewer,env:{},db:f.db};
  const call=()=>personalAiRoute({...context,request:new Request('https://fixture.invalid/',{method:'POST',body:JSON.stringify(data)})},{generate:async p=>{calls++;assert.ok(p.messages[1].content.includes('蓝色花盆'));assert.ok(!p.messages[1].content.includes('untrusted uploaded text'));return {raw:JSON.stringify({claims:[{text:'每天一次',source:1,quote:'蓝色花盆每天浇水一次'}],uncertainties:[]}),model:'fictional-model',usage:{inputTokens:1,outputTokens:1}};}});
  data.question='untrusted uploaded text';const result=await call();assert.equal(result.checks.needsHumanReview,true);assert.equal(result.checks.expectedMarkersPresent,true);assert.equal(calls,1);
  data.fixture='uploaded';await assert.rejects(call(),e=>e.status===400);assert.equal(calls,1);
 }finally{f.sql.close();}
});
test('Agent chooses search then answers only from public server-rebuilt evidence',async()=>{
 const f=fixture();try{const data={callId:crypto.randomUUID(),goal:'花盆多久浇水',followups:[],queries:[],references:[],step:0,publicConfirmed:true,consent:true,connection:f.base.connection};let mode='search';
 const context={path:'/api/ai/research/step',method:'POST',viewer:f.base.viewer,env:{},db:f.db};
 const dependencies={generate:async options=>{const payload=JSON.parse(options.messages[1].content);if(mode==='answer')assert.equal(payload.原文[0].内容,'蓝色花盆每天浇水一次。');return {raw:JSON.stringify(mode==='search'?{action:'search',query:'花盆'}:{action:'answer',claims:[{text:'每天一次',source:1,quote:'每天浇水一次'}],uncertainties:[]})};},search:async options=>{assert.equal(options.guard.sql,"b.level='public' AND b.status<>'deleting'");return {citations:[{...f.ref,quote:'蓝色花盆每天浇水一次。',title:'虚构花盆日志'}]};}};
 const call=()=>researchAgentRoute({...context,request:new Request('https://fixture.invalid/api/ai/research/step',{method:'POST',body:JSON.stringify(data)})},dependencies);
 const first=await call();assert.equal(first.decision.action,'search');data.step=1;data.queries=['花盆'];data.references=[f.ref];mode='answer';const second=await call();assert.equal(second.decision.claims[0].source,1);
 f.sql.exec("UPDATE books SET level='special'");await assert.rejects(call(),e=>e.status===403);
 }finally{f.sql.close();}
});
test('Agent refuses nonexistent tools, unsupported claims, duplicate queries and searches beyond budget',()=>{
 const d={step:0,queries:['花盆']};assert.throws(()=>parseAgentAction('{"action":"publish"}',d,[]));assert.throws(()=>parseAgentAction('{"action":"search","query":"花盆"}',d,[]));assert.throws(()=>parseAgentAction('{"action":"search","query":"花盆"}',{step:3,queries:[]},[]));assert.throws(()=>parseAgentAction('{"action":"answer","claims":[{"text":"无依据"}],"uncertainties":[]}',d,[]));assert.equal(parseAgentAction('{"action":"clarify","question":"你想查哪种花盆？"}',d,[]).action,'clarify');
});
