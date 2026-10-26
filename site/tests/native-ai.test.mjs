import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createLocalModelService,validateLocalRequest,LOCAL_MODEL} from '../scripts/local-model-service.mjs';
import {createNativeConnection} from '../src/native-ai.mjs';
import {localResearchStep} from '../src/native-research.mjs';

test('local model accepts bounded messages and embedded images, rejects network/file images and arbitrary options',()=>{
  const value=validateLocalRequest({messages:[{role:'user',content:[{type:'text',text:'虚构图示'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}],json:true,max_tokens:999999,tools:[{name:'shell'}]});
  assert.equal(value.max_tokens,1536);assert.equal(value.tools,undefined);assert.equal(value.model,LOCAL_MODEL);
  for(const url of ['http://127.0.0.1/secrets','https://example.com/image.png','file:///F:/private.png','data:image/svg+xml;base64,AA=='])assert.throws(()=>validateLocalRequest({messages:[{role:'user',content:[{type:'image_url',image_url:{url}}]}]}));
  assert.throws(()=>validateLocalRequest({messages:[{role:'tool',content:'run'}]}));
  assert.throws(()=>validateLocalRequest({messages:[{role:'user',content:'a'.repeat(36001)}]}));
});
test('loopback bridge requires pairing, denies foreign origins/hosts, and never proxies arbitrary paths',async()=>{
  const key='a'.repeat(64),origin='http://127.0.0.1:18788',calls=[];
  const server=createLocalModelService({key,ownOrigin:origin,origins:new Set([origin,'https://allowed.test']),fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/health')?{}:{choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]}));}});
  await new Promise(r=>server.listen(18788,'127.0.0.1',r));
  try{
    assert.equal((await fetch(origin+'/pair-key')).status,403);
    assert.equal((await fetch(origin+'/pair-key',{headers:{Origin:'https://allowed.test'}})).status,403);
    assert.equal((await fetch(origin+'/health',{headers:{Origin:'https://evil.test',Authorization:'Bearer '+key}})).status,403);
    const foreignHost=await new Promise((resolve,reject)=>{const request=http.get(origin+'/health',{headers:{Host:'attacker.test:18788',Authorization:'Bearer '+key}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});assert.equal(foreignHost,403);
    assert.equal((await fetch(origin+'/health')).status,401);
    assert.equal((await fetch(origin+'/pair-key',{headers:{Origin:origin}})).status,200);
    const headers={Origin:'https://allowed.test',Authorization:'Bearer '+key,'Content-Type':'application/json'};
    const result=await fetch(origin+'/generate',{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',content:'虚构问题'}]})});assert.equal(result.status,200);assert.equal(result.headers.get('access-control-allow-origin'),'https://allowed.test');assert.equal((await result.json()).text,'{"ok":true}');
    assert.equal((await fetch(origin+'/v1/files',{headers})).status,404);assert.equal(calls.length,1);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('connection stays in memory, clears on disconnect and blocks late responses',async()=>{
  let resolve;const connection=createNativeConnection({fetcher:async(url)=>url.endsWith('/health')?new Response(JSON.stringify({ready:true,local:true,vision:true,model:LOCAL_MODEL})):await new Promise(r=>resolve=r)});
  await connection.connect('b'.repeat(64));assert.ok(connection.ready);const pending=connection.generate([{role:'user',content:'测试'}]);connection.disconnect();resolve(new Response(JSON.stringify({text:'old',model:LOCAL_MODEL})));await assert.rejects(pending,/切换/);assert.equal(connection.ready,false);
});
test('local Agent checkpoints validated tool actions and resumes without generating again',async()=>{
  const quote='虚构蓝盆每天补水一次。',citation={book_id:'fiction',page:120,start:0,end:quote.length,source_hash:'h',revision:0,source:'extracted',title:'虚构资料',quote};
  const data={goal:'虚构问题',publicConfirmed:true,step:0,callId:'1'.repeat(36),references:[],followups:[],queries:[],bookId:'fiction'};
  let generated=0,persisted=null,fail=true;const sent=[];
  const connection={ready:true,model:LOCAL_MODEL,generate:async()=>{generated++;return {text:JSON.stringify({action:'search',query:'蓝盆'})};}};
  const api=async(url,options)=>{sent.push([url,options?.body]);if(url.includes('/sources'))return {citations:JSON.parse(options.body).references.map(r=>({...r,title:citation.title,quote}))};if(fail)throw Error('fictional disconnect');assert.ok(persisted);return {citations:[citation]};};
  await assert.rejects(localResearchStep(data,{api,connection,onDecision:async d=>persisted=d}),/disconnect/);assert.equal(generated,1);assert.equal(persisted.action,'search');
  fail=false;const result=await localResearchStep(data,{api,connection,pendingDecision:persisted});assert.equal(generated,1);assert.equal(result.citations[0].page,120);assert.ok(sent.every(x=>!JSON.stringify(x).includes(data.goal)));
  await assert.rejects(localResearchStep(data,{api,connection,pendingDecision:{action:'shell',command:'run'}}),/未开放/);
});
test('local Agent refuses unsupported or fabricated answers and out-of-scope evidence',async()=>{
 const data={goal:'虚构问题',publicConfirmed:true,step:0,callId:'2'.repeat(36),references:[],followups:[],queries:[],bookId:'fiction'};
 const connection={ready:true,generate:async()=>({text:JSON.stringify({action:'answer',claims:[{text:'invented',source:1,quote:'unknown'}],uncertainties:[]})})};
 await assert.rejects(localResearchStep(data,{connection,api:async()=>({citations:[]})}),/不能生成/);
 await assert.rejects(localResearchStep(data,{connection,api:async()=>({citations:[{book_id:'other'}]})}),/选定材料/);
});
