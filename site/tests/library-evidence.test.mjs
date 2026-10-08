import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {bookReadiness,bookCorpusBatch,searchEvidence} from '../server/library-evidence.mjs';
import {searchLibrary} from '../server/library-search.mjs';
import {pageRanges} from '../server/library-evidence.mjs';
import {passages,cosine,fuseEvidence} from '../src/evidence-ranking.mjs';
import {createLocalSemantic} from '../src/local-semantic.mjs';
const require=createRequire(import.meta.url),fold=require('opencc-js').Converter({from:'t',to:'cn'});
const normalize=s=>fold(String(s).normalize('NFKC').toLowerCase()).replace(/[\p{P}\p{S}\s]/gu,'');
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE books(id TEXT,title TEXT,level TEXT,kind TEXT,created_at INTEGER,page_count INTEGER,file_ready INTEGER,source_hash TEXT);
  CREATE TABLE pages(book_id TEXT,page INTEGER,raw_text TEXT DEFAULT '',reviewed TEXT DEFAULT '[]',aliases TEXT DEFAULT '',engine TEXT DEFAULT 'article',image_ready INTEGER DEFAULT 1,
  correction_status TEXT DEFAULT 'unreviewed',corrected_text TEXT DEFAULT '',correction_revision INTEGER DEFAULT 0);
  INSERT INTO books VALUES('public-book','虚构园圃笔记','public','pdf',1,242,1,'fictional-hash'),('restricted-book','受限测试资料','special','pdf',2,1,1,'restricted-hash');`);
  const insert=sqlite.prepare('INSERT INTO pages(book_id,page,raw_text) VALUES(?,?,?)');
  for(let i=1;i<=240;i++)insert.run('public-book',i,i===120?'園圃的花木在夏天每天澆水，冬天減少澆水。':i===200?'長期乾燥時，給花木補水以免枯萎。':i===240?'虛構書庫到了最後一頁。':i===239?'':'白雲在天空飄浮。');
  insert.run('restricted-book',1,'秘密园圃测试文字，禁止向公开访客返回。');
  const db={prepare(sql){return {bind(...args){const stmt=sqlite.prepare(sql);return {async all(){return {results:stmt.all(...args)};},async first(){return stmt.get(...args);}};}};}};
  return {sqlite,db,book:sqlite.prepare('SELECT * FROM books WHERE id=?').get('public-book')};
}
const options=(db,query,params='')=>({db,query,normalize,url:new URL('http://localhost/api/search?'+params),guard:{sql:"b.level='public'",args:[]}});
test('related search retrieves a question with shared concepts across all 240 pages; exact remains strict',async()=>{
  const {db,sqlite}=fixture();try{
    const result=await searchLibrary(options(db,'如何给园圃的花木浇水','match=related'));
    assert.equal(result.hits[0].page,120);assert.ok(result.hits.some(h=>h.page===200));
    assert.equal((await searchLibrary(options(db,'如何给园圃的花木浇水','match=exact'))).total,0);
    assert.equal((await searchLibrary(options(db,'火车换乘时间','match=related'))).total,0);
    const last=await searchLibrary(options(db,'书库最后一页','match=related'));assert.equal(last.hits[0].page,240);
    assert.equal((await searchLibrary(options(db,'秘密园圃','match=related&book=restricted-book'))).total,0);
  }finally{sqlite.close();}
});
test('readiness exposes exact missing, empty and missing-image ranges, without book text',async()=>{
  const {db,sqlite,book}=fixture();try{
    sqlite.exec("UPDATE pages SET image_ready=0 WHERE book_id='public-book' AND page IN(119,120)");
    const report=await bookReadiness(db,book);
    assert.deepEqual(report.missing_ranges,[[241,242]]);assert.deepEqual(report.empty_ranges,[[239,239]]);
    assert.deepEqual(report.image_missing_ranges,[[119,120]]);assert.equal(report.text_pages,239);
    assert.equal(report.complete,false);assert.equal(JSON.stringify(report).includes('raw_text'),false);
    assert.deepEqual(pageRanges([4,1,2,2,6]),[[1,2],[4,4],[6,6]]);
    const at120=await bookReadiness(db,book,new URL('http://localhost/?page=120'));
    assert.equal(at120.pages[0].page,120);assert.equal(at120.pages.length,25);assert.equal(at120.pages[0].searchable,true);assert.equal(at120.pages[0].image_ready,false);assert.equal(at120.next_page,145);
    const last=await bookReadiness(db,book,new URL('http://localhost/?page=239'));
    assert.deepEqual(last.pages.map(p=>[p.page,p.saved,p.searchable]),[[239,true,false],[240,true,true],[241,false,false],[242,false,false]]);assert.equal(last.next_page,null);
    assert.ok(!JSON.stringify(last).includes('花木'));
  }finally{sqlite.close();}
});
test('citations copy exact offsets from source, prefer confirmed edits and never include restricted pages',async()=>{
  const {db,sqlite}=fixture();try{
    const answer=await searchEvidence(options(db,'园圃 花木'));
    assert.equal(answer.mode,'source-excerpts');assert.equal(answer.citations[0].page,120);
    for(const c of answer.citations){const text=sqlite.prepare('SELECT raw_text FROM pages WHERE book_id=? AND page=?').get(c.book_id,c.page).raw_text;
      assert.equal(text.slice(c.start,c.end),c.quote);assert.equal(c.source_hash,'fictional-hash');assert.equal(c.book_id,'public-book');}
    sqlite.exec("UPDATE pages SET corrected_text='虚构校订稿：溪流流经石桥。',correction_status='draft' WHERE book_id='public-book' AND page=120");
    assert.equal((await searchEvidence(options(db,'校订稿'))).citations.length,0);
    sqlite.exec("UPDATE pages SET correction_status='confirmed',correction_revision=1 WHERE book_id='public-book' AND page=120");
    const corrected=await searchEvidence(options(db,'溪流'));assert.equal(corrected.citations[0].source,'confirmed');assert.equal(corrected.citations[0].revision,1);
    assert.equal((await searchEvidence(options(db,'园圃的花木'))).citations.some(c=>c.page===120),false,'obsolete text is not quoted as confirmed evidence');
    assert.equal((await searchEvidence(options(db,'园圃','book=restricted-book'))).citations.length,0);
  }finally{sqlite.close();}
});
test('corpus cursor visits every page beyond 120 and detects same-length source changes',async()=>{
  const {db,sqlite,book}=fixture();try{
    let cursor=0;const seen=[];do{const data=await bookCorpusBatch(db,book,new URL('http://localhost/?after='+cursor));seen.push(...data.pages.map(p=>p.page));cursor=data.next;}while(cursor!==null);
    assert.equal(seen.length,240);assert.equal(new Set(seen).size,240);assert.equal(seen.at(-1),240);
    const before=await bookCorpusBatch(db,book,new URL('http://localhost/'));
    sqlite.exec("UPDATE pages SET raw_text='乌雲在天空飄浮。' WHERE book_id='public-book' AND page=1");
    const after=await bookCorpusBatch(db,book,new URL('http://localhost/'));assert.notEqual(before.pages[0].fingerprint,after.pages[0].fingerprint);
  }finally{sqlite.close();}
});
test('chunking preserves all original characters including supplementary Unicode; fusion deduplicates pages',()=>{
  const text='虚构𠀀🌲材料'.repeat(300),parts=passages(text);let end=0;
  for(const part of parts){assert.equal(part.quote,text.slice(part.start,part.end));assert.ok(part.start<=end);assert.equal(/^[\uDC00-\uDFFF]/.test(part.quote),false);assert.equal(/[\uD800-\uDBFF]$/.test(part.quote),false);end=part.end;}
  assert.equal(end,text.length);assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([0,0],[1,0]),0);
  const a={book_id:'a',page:120,quote:'exact',exact:true},b={book_id:'a',page:200,quote:'related'};
  const merged=fuseEvidence([a],[b,{...a,quote:'other chunk'}]);assert.deepEqual(merged,[a,b]);
});
test('local semantic retrieval revalidates access and terminates on cancellation or revoked grant',async()=>{
  let terminated=0,calls=[];
  const workerFactory=()=>({postMessage(data){queueMicrotask(()=>this.onmessage({data:{id:data.id,...(data.op==='search'?{hits:[{key:'book/120/fp/0'}]}:{ok:true})}}));},terminate(){terminated++;}});
  const api=async url=>{calls.push(url);return url.includes('/corpus')?{book_id:'book',title:'虚构',kind:'pdf',expected_pages:120,source_hash:'hash',pages:[{page:120,text:'虚构园圃需要浇水。',source:'extracted',fingerprint:'fp',revision:0}],next:null}:{};};
  const local=createLocalSemantic({api,workerFactory});const hits=await local.search('book','园圃');assert.equal(hits[0].page,120);assert.ok(calls.at(-1).endsWith('/readiness'));
  await local.search('book','补水');assert.equal(calls.filter(c=>c.includes('/corpus')).length,2);local.clear();assert.ok(terminated);
  const denied=createLocalSemantic({api:async()=>{const error=new Error('no access');error.status=403;throw error;},workerFactory});
  await assert.rejects(denied.search('book','园圃'),e=>e.status===403);
  const controller=new AbortController();controller.abort();await assert.rejects(local.search('book','园圃',{signal:controller.signal}),e=>e.name==='AbortError');
  await assert.rejects(local.search('all','园圃'),/选择一本/);
});
