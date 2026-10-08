import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {qwenRoute,beijingDay,RESERVATION,DAILY_LIMIT} from '../server/qwen-ai.mjs';
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0016_ai_usage.sql',import.meta.url),'utf8'));
  sql.exec("CREATE TABLE books(id TEXT,title TEXT,kind TEXT,source_hash TEXT,level TEXT,status TEXT); CREATE TABLE pages(book_id TEXT,page INTEGER,raw_text TEXT,reviewed TEXT,corrected_text TEXT,correction_status TEXT,correction_revision INTEGER);");
  sql.prepare('INSERT INTO books VALUES(?,?,?,?,?,?)').run('fiction','虚构温室记录','article','hash','public','ready');
  const quote='蓝色花盆每天浇水一次。';sql.prepare('INSERT INTO pages VALUES(?,?,?,?,?,?,?)').run('fiction',120,quote,'[]','','',0);
  const db={prepare:s=>({bind:(...args)=>({first:async()=>sql.prepare(s).get(...args),run:async()=>({meta:{changes:sql.prepare(s).run(...args).changes}})})})};
  const body={id:crypto.randomUUID(),question:'每天浇几次水？',publicQuestionConfirmed:true,references:[{book_id:'fiction',page:120,start:0,end:quote.length,source_hash:'hash',revision:0,source:'extracted'}]};
  let calls=0;
  const context={path:'/api/ai/qwen/answer',method:'POST',db,viewer:{id:'test-core',owner:true},env:{QWEN_ENABLED:'1',QWEN_BUDGET_CNY:'5',QWEN_PRICING_VERIFIED:'2026-10-09',DASHSCOPE_API_KEY:'fictional-key'},day:'2026-10-09',fetcher:async(url,options)=>{
    calls++;assert.equal(new URL(url).host,'dashscope.aliyuncs.com');const payload=JSON.parse(options.body);assert.equal(payload.enable_search,false);assert.equal(payload.enable_thinking,false);assert.equal(payload.max_tokens,1536);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({claims:[{text:'每天一次。',source:1,quote:'每天浇水一次'}],uncertainties:[]})}}],usage:{prompt_tokens:160,completion_tokens:50}});
  }};
  const call=(overrides={})=>qwenRoute({...context,request:new Request('https://test.invalid/api/ai/qwen/answer',{method:'POST',body:JSON.stringify(body)}),...overrides});
  return {sql,body,context,call,get calls(){return calls;}};
}
test('Qwen rebuilds public evidence, returns validated output and stores usage only',async()=>{
  const f=fixture();try{const r=await f.call();assert.equal(r.result.claims[0].text,'每天一次。');assert.equal(f.calls,1);const row=f.sql.prepare('SELECT * FROM ai_usage').get();assert.equal(row.reserved_micro,RESERVATION);assert.equal(row.input_tokens,160);assert.equal(JSON.stringify(row).includes('花盆'),false);await assert.rejects(f.call(),e=>e.status===429);assert.equal(f.calls,1);}finally{f.sql.close();}
});
test('private/deleted/changed sources, anonymous callers and disabled config never invoke cloud',async()=>{
  const f=fixture();try{
    await assert.rejects(f.call({viewer:{id:'ordinary',owner:false}}),e=>e.status===403);
    await assert.rejects(f.call({env:{}}),e=>e.status===503);
    f.sql.exec("UPDATE books SET level='special'");await assert.rejects(f.call(),e=>e.status===403);
    f.sql.exec("UPDATE books SET level='public',status='deleting'");await assert.rejects(f.call(),e=>e.status===403);
    f.sql.exec("UPDATE books SET status='ready',source_hash='changed'");await assert.rejects(f.call(),e=>e.status===409);assert.equal(f.calls,0);
  }finally{f.sql.close();}
});
test('atomic daily budget admits only remaining reservations under concurrent calls',async()=>{
  const f=fixture();try{
    f.sql.prepare('INSERT INTO ai_usage VALUES(?,?,?,?,?,?,?)').run('prior',f.context.day,DAILY_LIMIT-RESERVATION,'completed','fixture',0,0);
    const results=await Promise.allSettled(Array.from({length:8},()=>f.call({request:new Request('https://test.invalid/api/ai/qwen/answer',{method:'POST',body:JSON.stringify({...f.body,id:crypto.randomUUID()})})})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls,1);assert.equal(f.sql.prepare('SELECT SUM(reserved_micro) n FROM ai_usage').get().n,DAILY_LIMIT);
  }finally{f.sql.close();}
});
test('failed provider calls retain reservation, do not retry and never expose provider secrets',async()=>{
  const f=fixture();try{await assert.rejects(f.call({fetcher:async()=>{throw Error('fictional-secret');}}),e=>e.status===502&&!e.message.includes('secret'));assert.equal(f.sql.prepare('SELECT SUM(reserved_micro) n FROM ai_usage').get().n,RESERVATION);await assert.rejects(f.call(),e=>e.status===429);assert.equal(f.calls,0);}finally{f.sql.close();}
});
test('budget day rolls at Beijing midnight',()=>{assert.equal(beijingDay(new Date('2026-10-09T15:59:59Z')),'2026-10-09');assert.equal(beijingDay(new Date('2026-10-09T16:00:00Z')),'2026-10-10');});
test('status exposes reservation totals without exposing key or model messages',async()=>{const f=fixture();try{await f.call();const state=await f.call({path:'/api/ai/qwen/status',method:'GET'});assert.equal(state.reservedTodayCny,.25);assert.equal(state.dailyBudgetCny,5);assert.equal(JSON.stringify(state).includes('fictional-key'),false);}finally{f.sql.close();}});
