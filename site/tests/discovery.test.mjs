import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {discoveryRoute,requestWebDiscovery} from '../server/discovery.mjs';
import {discoveryInput,publicWebUrl,fuseDiscoveryResults,normalizeWebAnswer,supportsWebDiscovery} from '../src/discovery-contracts.mjs';

const webResponse=()=>({output:{choices:[{finish_reason:'stop',message:{content:'虚构园圃日志每天补水一次。[book_1]\n虚构网页给出每周检查建议。[ref_1]\n这段没有出处。'}}],search_info:{search_results:[{index:1,title:'虚构园圃资料',url:'https://example.org/fiction'}]}},usage:{input_tokens:100,output_tokens:50,plugins:{search:{count:1}}}});
function fixture(){
  const sql=new DatabaseSync(':memory:');for(const file of ['0017_personal_ai_usage','0018_discovery_receipts'])sql.exec(readFileSync(new URL('../drizzle/'+file+'.sql',import.meta.url),'utf8'));
  sql.exec("CREATE TABLE books(id TEXT,title TEXT,kind TEXT,source_hash TEXT,level TEXT,status TEXT);CREATE TABLE pages(book_id TEXT,page INTEGER,raw_text TEXT,reviewed TEXT,corrected_text TEXT,correction_status TEXT,correction_revision INTEGER);INSERT INTO books VALUES('fiction','虚构园圃','article','hash','public','ready');INSERT INTO pages VALUES('fiction',120,'蓝色花盆每天补水一次。','[]','','',0);");
  const db={prepare:s=>({bind:(...args)=>({first:async()=>sql.prepare(s).get(...args),run:async()=>({meta:{changes:sql.prepare(s).run(...args).changes}})})})};
  const ref={book_id:'fiction',page:120,start:0,end:11,source_hash:'hash',revision:0,source:'extracted'};
  const data={id:crypto.randomUUID(),question:'虚构园圃应怎样补水？',queries:['花盆','补水'],bookId:'fiction',publicConfirmed:true,consent:true,domains:[],freshness:0,references:[ref],connection:{baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus',apiKey:'fictional-api-key-only'}};
  const call=(operation='answer',value=data,overrides={},dependencies={})=>discoveryRoute({path:'/api/ai/discovery/'+operation,method:'POST',viewer:{id:'fictional-a'},db,request:new Request('https://fixture.invalid/api/ai/discovery/'+operation,{method:'POST',body:JSON.stringify(value)}),...overrides},{generate:options=>requestWebDiscovery({...options,fetcher:async()=>Response.json(webResponse())}),...dependencies});
  return {sql,db,ref,data,call};
}
test('inputs enforce public consent, bounded searches, real domains and supported provider',()=>{
  assert.throws(()=>discoveryInput({question:'test'}));
  const value={question:'虚构测试',publicConfirmed:true};
  for(const domain of ['example.org/path','localhost','127.0.0.1','a.local','user@example.org','example.org?x','example.org:443'])assert.throws(()=>discoveryInput({...value,domains:[domain]}));
  for(const freshness of ['7','invalid',1])assert.throws(()=>discoveryInput({...value,freshness}));
  assert.throws(()=>discoveryInput({...value,queries:['1','2','3','4']}));
  assert.deepEqual(discoveryInput({...value,queries:['蓝盆','蓝盆']}).queries,['蓝盆']);
  for(const url of ['javascript:alert(1)','file:///a','https://127.0.0.1','https://[::1]','https://x.internal','https://example.org:443@evil.example'])assert.equal(publicWebUrl(url),null);
  assert.equal(supportsWebDiscovery('https://dashscope.aliyuncs.com/compatible-mode/v1','qwen-plus'),true);
  assert.equal(supportsWebDiscovery('https://dashscope-intl.aliyuncs.com/compatible-mode/v1','qwen-plus'),false);
});
test('fusion de-duplicates rank lists and promotes repeated evidence without inflating one list',()=>{
  const a={book_id:'a'},b={book_id:'b'},c={book_id:'c'};assert.deepEqual(fuseDiscoveryResults([[a,a,b],[b,c]]),[b,a,c]);
});
test('source checks reject fake citations, unsafe URLs, missing search sources and memory-only output',()=>{
  let response=webResponse();const checked=normalizeWebAnswer(response,[{}]);assert.equal(checked.paragraphs.length,2);assert.equal(checked.unverifiedCount,1);
  response.output.choices[0].message.content='伪造引用[ref_99]\n引用不存在的书[book_2]\n有效的虚构资料[ref_1]';assert.equal(normalizeWebAnswer(response,[{}]).unverifiedCount,2);
  assert.throws(()=>normalizeWebAnswer(response,[{}],['other.example']));
  response.output.search_info.search_results[0].url='javascript:alert(1)';assert.throws(()=>normalizeWebAnswer(response,[{}]));
  response=webResponse();response.output.choices[0].message.content='仅有书库引用[book_1]';assert.throws(()=>normalizeWebAnswer(response,[{}]));
  response=webResponse();response.output.search_info.search_results=[];assert.throws(()=>normalizeWebAnswer(response,[{}]));
});
test('native search uses bounded official endpoint and preserves domain/time restrictions',async()=>{
  const f=fixture();try{await requestWebDiscovery({connection:f.data.connection,input:discoveryInput({...f.data,domains:['example.org'],freshness:7}),books:[{quote:'虚构资料',page:120,title:'虚构园圃'}],fetcher:async(url,options)=>{
    assert.equal(url,'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation');assert.equal(options.redirect,'manual');const p=JSON.parse(options.body);assert.equal(p.parameters.search_options.forced_search,true);assert.equal(p.parameters.search_options.enable_source,true);assert.deepEqual(p.parameters.search_options.assigned_site_list,['example.org']);assert.equal(p.parameters.search_options.freshness,7);assert.equal(p.parameters.max_tokens,1536);return Response.json(webResponse());
  }});}finally{f.sql.close();}
});
test('search merges public results, reconstructs quotes at page 120 and never calls a paid model',async()=>{
  const f=fixture();try{let count=0;const result=await f.call('search',f.data,{}, {generate:()=>{throw Error('Unexpected model');},search:async c=>{count++;assert.equal(c.guard.sql,"b.level='public' AND b.status<>'deleting'");assert.equal(c.url.searchParams.get('book'),'fiction');return {citations:[{...f.ref,quote:'伪造的客户端片段'}],coverage:{}};}});assert.equal(count,2);assert.equal(result.citations.length,1);assert.equal(result.citations[0].quote,'蓝色花盆每天补水一次。');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM personal_ai_usage').get().n,0);}finally{f.sql.close();}
});
test('account-owned receipts contain no question, key or answer; changed records cannot be restored',async()=>{
  const f=fixture();try{const response=await f.call();assert.equal(response.result.paragraphs.length,2);const rows=JSON.stringify(f.sql.prepare('SELECT * FROM discovery_receipts').all());for(const text of ['虚构','fictional-api','每天'])assert.equal(rows.includes(text),false);assert.ok(!JSON.stringify(response).includes('fictional-api'));
    assert.equal((await f.call('check',{result:response.result})).citations[0].page,120);
    await assert.rejects(f.call('check',{result:response.result},{viewer:{id:'fictional-b'}}),e=>e.status===409);
    const altered=structuredClone(response.result);altered.paragraphs[0].text='被改动';await assert.rejects(f.call('check',{result:altered}),e=>e.status===409);
    await assert.rejects(f.call(),e=>e.status===429);
    f.sql.exec("UPDATE books SET level='special'");await assert.rejects(f.call('check',{result:response.result}),e=>e.status===403);
  }finally{f.sql.close();}
});
test('restricted materials, stale revisions and unsupported models fail before quota or external call',async()=>{
  const f=fixture();try{const never={generate:()=>{throw Error('must not call');}};
    await assert.rejects(f.call('answer',f.data,{viewer:{}},never),e=>e.status===401);
    await assert.rejects(f.call('answer',{...f.data,connection:{...f.data.connection,model:'qwen-unknown'}},{},never),e=>e.status===400);
    await assert.rejects(f.call('answer',{...f.data,references:[{...f.ref,revision:3}]},{},never),e=>e.status===409);
    await assert.rejects(f.call('answer',{...f.data,references:[{...f.ref,book_id:'different'}]},{},never),e=>e.status===400);
    f.sql.exec("UPDATE books SET level='special'");await assert.rejects(f.call('answer',f.data,{},never),e=>e.status===403);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM personal_ai_usage').get().n,0);
  }finally{f.sql.close();}
});
test('post-call permission changes prevent result save and retries are blocked',async()=>{
  const f=fixture();try{await assert.rejects(f.call('answer',f.data,{}, {generate:async options=>{const result=await requestWebDiscovery({...options,fetcher:async()=>Response.json(webResponse())});f.sql.exec("UPDATE pages SET correction_revision=1");return result;}}),e=>e.status===409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM discovery_receipts').get().n,0);f.sql.exec('UPDATE pages SET correction_revision=0');await assert.rejects(f.call(),e=>e.status===429);}finally{f.sql.close();}
});
test('network/redirect/oversize failures never echo keys or silently retry',async()=>{
  for(const mode of ['network','redirect','oversize','unauthorized']){const f=fixture();try{let count=0;await assert.rejects(f.call('answer',f.data,{}, {generate:options=>requestWebDiscovery({...options,fetcher:async()=>{count++;if(mode==='network')throw Error(f.data.connection.apiKey);if(mode==='oversize')return new Response('x'.repeat(96001));return new Response(f.data.connection.apiKey,{status:mode==='redirect'?302:401,headers:{Location:'https://other.example'}});}})}),e=>e.status===502&&!e.message.includes(f.data.connection.apiKey));assert.equal(count,1);await assert.rejects(f.call(),e=>e.status===429);}finally{f.sql.close();}}
});
