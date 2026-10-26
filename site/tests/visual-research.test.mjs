import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {visualInput,parseVisualResult,rankVisualPages,continueVisualRun,visualComparison} from '../src/visual-research.mjs';
import {visualResearchRoute} from '../server/visual-research.mjs';
const result={relevance:3,readable:true,excerpt:'虚构蓝盆',reason:'图中有蓝盆记录',uncertainties:[]};
const run=()=>({version:1,input:{bookId:'fiction',query:'蓝盆',start:119,end:120},pages:[],status:'paused'});
test('visual evaluation does not treat unlabeled or negative-only samples as recall success',()=>{
 const rows=[{page:120,text:'',visual:result,reviews:[]},{page:119,text:'蓝盆',reviews:[]}];assert.equal(visualComparison(rows,'蓝盆').combinedRecallAt3,null);
 rows[0].reviews.push({relevant:true});rows[1].reviews.push({relevant:false});const comparison=visualComparison(rows,'蓝盆');assert.equal(comparison.combinedRecallAt3,1);assert.equal(comparison.textRecallAt3,0);
 rows[0].reviews.push({relevant:false});assert.equal(visualComparison(rows,'蓝盆').combinedRecallAt3,null);
});
test('visual input bounds pages and rejects malformed model scores',()=>{
 assert.throws(()=>visualInput({...run().input,end:128}));assert.throws(()=>visualInput({...run().input,bookId:'../../private'}));
 assert.throws(()=>parseVisualResult(JSON.stringify({...result,relevance:0.7})));assert.throws(()=>parseVisualResult(JSON.stringify({...result,uncertainties:'none'})));
 assert.equal(parseVisualResult(JSON.stringify({...result,readable:false})).relevance,0);
});
test('visual candidates find an OCR-missed page while keeping text-only ranking visible',()=>{
 const rows=[{page:119,text:'蓝盆的背景介绍',visual:{...result,relevance:0}},{page:120,text:'',visual:result}];
 const ranked=rankVisualPages(rows,'蓝盆');assert.equal(ranked.find(r=>r.page===120).lexical,0);assert.ok(ranked.find(r=>r.page===120).rank>0);
 assert.ok(rankVisualPages([{page:120,text:'',visual:{...result,readable:false}}],'蓝盆')[0].rank===0);
});
test('interrupted visual run persists each page and resumes without regenerating completed pages',async()=>{
 let saved=run(),calls=0,failed=true;
 const dependencies={readPage:async page=>({version:'v'+page,text:page===120?'':'蓝盆',title:'虚构园圃',imageReady:true}),readImage:async()=> 'data:image/png;base64,YQ==',generate:async()=>{calls++;if(calls===2&&failed)throw Error('interrupted');return {text:JSON.stringify(result)};},save:async state=>{saved=structuredClone(state);}};
 await assert.rejects(continueVisualRun(saved,dependencies),/interrupted/);assert.equal(saved.pages.length,1);
 failed=false;const complete=await continueVisualRun(saved,dependencies);assert.equal(calls,3);assert.equal(complete.pages.length,2);assert.equal(saved.status,'complete');
});
test('changed source and failed persistence stop the run before further model calls',async()=>{
 let calls=0,reads=0;const dependencies={readPage:async page=>({version:'v'+(++reads),text:'',imageReady:true}),readImage:async()=>'',generate:async()=>{calls++;return {text:JSON.stringify(result)};},save:async()=>{throw Error('storage unavailable');}};
 await assert.rejects(continueVisualRun(run(),dependencies),/变化/);assert.equal(calls,1);
 calls=0;dependencies.readPage=async()=>({version:'stable',text:'',imageReady:true});await assert.rejects(continueVisualRun(run(),dependencies),/storage unavailable/);assert.equal(calls,1);
});
test('aborted inference never saves a late result; missing images do not trigger AI',async()=>{
 const c=new AbortController();let saves=0;await assert.rejects(continueVisualRun(run(),{signal:c.signal,readPage:async()=>({version:'v',text:'',imageReady:true}),readImage:async()=>'',generate:async()=>{c.abort();return {text:JSON.stringify(result)};},save:async()=>{saves++;}}),/暂停/);assert.equal(saves,0);
 const complete=await continueVisualRun(run(),{readPage:async()=>({version:'v',text:'文字',imageReady:false}),generate:async()=>{throw Error('must not call');},save:async()=>{}});assert.equal(complete.pages.length,2);assert.equal(complete.pages[0].visual,null);
});
test('public visual API checks authentication, visibility, revisions, image availability and no-store',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec("CREATE TABLE books(id TEXT,title TEXT,source_hash TEXT,level TEXT,status TEXT); CREATE TABLE pages(book_id TEXT,page INTEGER,raw_text TEXT,image_ready INTEGER,correction_revision INTEGER); INSERT INTO books VALUES('fiction','虚构园圃','hash','public','ready'),('restricted','虚构限制样本','hash','special','ready'); INSERT INTO pages VALUES('fiction',120,'蓝盆',1,0),('restricted',120,'仅权限测试',1,0);");
 const db={prepare:q=>({bind:(...a)=>({first:async()=>sql.prepare(q).get(...a)})})};let files=0;
 const context={path:'/api/ai/visual/page',method:'GET',url:new URL('https://fixture.invalid/api/ai/visual/page?book=fiction&page=120'),viewer:{id:'fictional'},db,env:{BUCKET:{get:async()=>{files++;return {body:new Blob(['fictional image']).stream(),size:15};}}}};
 try{
  await assert.rejects(visualResearchRoute({...context,viewer:{}}),/登录/);
  await assert.rejects(visualResearchRoute({...context,url:new URL('https://fixture.invalid/?book=restricted&page=120')}),/不再公开/);assert.equal(files,0);
  const page=await visualResearchRoute(context);assert.equal(page.text,'蓝盆');
  await assert.rejects(visualResearchRoute({...context,path:'/api/ai/visual/image'}),/变化/);assert.equal(files,0);
  context.url.searchParams.set('version',page.version);const image=await visualResearchRoute({...context,path:'/api/ai/visual/image'});assert.equal(image.headers.get('Cache-Control'),'private, no-store');assert.equal(files,1);
  sql.exec("UPDATE pages SET raw_text='修订后的虚构文字',correction_revision=1 WHERE book_id='fiction'");await assert.rejects(visualResearchRoute({...context,path:'/api/ai/visual/image'}),/变化/);assert.equal(files,1);
  sql.exec("UPDATE books SET level='special' WHERE id='fiction'");await assert.rejects(visualResearchRoute(context),/不再公开/);
 }finally{sql.close();}
});
