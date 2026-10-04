import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {queryParts,rankText,bestSnippet} from '../src/search-ranking.mjs';
import {searchLibrary} from '../server/library-search.mjs';
import {ocrLanguages,decodeArticle,embeddedText,usableText,orderedOcrText,recognitionQuality} from '../src/text-recognition.mjs';
const require=createRequire(import.meta.url),OpenCC=require('opencc-js');
const fold=OpenCC.Converter({from:'t',to:'cn'});
const normalize=s=>fold(String(s).normalize('NFKC').toLowerCase()).replace(/[\p{P}\p{S}\s]/gu,'');

test('source-preserving simplified/traditional search ranks full, missing-character and unrelated text',()=>{
  const text='這是虛構文章，青松有三個分支。';
  assert.equal(rankText(text,'青松有三个分支',normalize),100);
  const near=rankText(text,'青松有三分支',normalize);
  assert.ok(near>=55&&near<94);
  assert.equal(rankText(text,'青松有三分支',normalize,{similar:false}),0);
  assert.equal(rankText(text,'火车站正在施工',normalize),0);
  assert.equal(rankText(text,'青杉',normalize),0,'two-character queries require full match');
  assert.equal(rankText(text,'青松 分支',normalize),94);
  assert.equal(rankText(text,'！！！',normalize),0);
  assert.equal(text,'這是虛構文章，青松有三個分支。');
  assert.ok(bestSnippet('白雲'.repeat(300)+text,'青松有三分支',normalize).includes('青松'));
});

function fixtureDB(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,title TEXT,level TEXT,kind TEXT,created_at INTEGER,page_count INTEGER DEFAULT 0);
    CREATE TABLE pages(book_id TEXT,page INTEGER,raw_text TEXT,normalized TEXT,reviewed TEXT DEFAULT '[]',review_search TEXT DEFAULT '',aliases TEXT DEFAULT '',engine TEXT DEFAULT 'article',image_ready INTEGER DEFAULT 0,corrected_text TEXT DEFAULT '',correction_search TEXT DEFAULT '',correction_status TEXT DEFAULT '');`);
  const book=sqlite.prepare('INSERT INTO books(id,title,level,kind,created_at) VALUES(?,?,?,?,?)'),page=sqlite.prepare('INSERT INTO pages(book_id,page,raw_text,normalized) VALUES(?,?,?,?)');
  book.run('a','虛構青松觀察筆記','public','text',1);book.run('b','虛構受限測試','special','text',2);
  for(let i=1;i<=26;i++){const text=i===26?'青松有三个分支':i===25?'青松有三分支':'白云与山石';page.run('a',i,text,normalize(text));}
  page.run('b',1,'青松有三个分支',normalize('青松有三个分支'));
  return {sqlite,db:{prepare(sql){return {bind(...args){const statement=sqlite.prepare(sql);return {async first(){return statement.get(...args);},async all(){return {results:statement.all(...args)};}};}};}}};
}
test('SQL search ranks all pages before pagination and enforces visibility including titles',async()=>{
  const {sqlite,db}=fixtureDB();const search=(q,extra='')=>searchLibrary({db,url:new URL('http://localhost/api/search?'+extra),query:q,normalize,guard:{sql:"b.level='public'",args:[]}});
  try{
    const exact=await search('青松有三个分支');assert.equal(exact.total,2);assert.deepEqual(exact.hits.map(h=>h.page),[26,25]);assert.equal(exact.hits[0].score,100);assert.ok(exact.hits[1].score<94);assert.equal(exact.hits[1].match_label,'近似文字');
    assert.equal((await search('青松有三个分支','match=exact')).total,1);
    const title=await search('青松观察笔记');assert.equal(title.total,26);assert.equal(title.hits.length,20);assert.equal(title.hits[0].match_label,'书名匹配');
    const tail=await search('青松观察笔记','offset=20');assert.equal(tail.hits.length,6);assert.equal(tail.hits[0].page,21);
    assert.equal((await search('受限测试')).total,0);
    assert.equal((await search('青松有三个分支','book=b')).total,0);
    assert.equal((await search('','level=special')).total,0);
    assert.equal((await search('！！！')).total,0);
    assert.equal((await search("' OR 1=1 --")).total,0);
    assert.equal((await search('')).total,26);
    // Unconfirmed edits do not become searchable material.
    sqlite.prepare("UPDATE pages SET corrected_text=?,correction_search=?,correction_status='draft' WHERE page=1 AND book_id='a'").run('虚构校订专用句',normalize('虚构校订专用句'));
    assert.equal((await search('校订专用句')).total,0);
    sqlite.exec("UPDATE pages SET correction_status='confirmed' WHERE page=1 AND book_id='a'");
    assert.equal((await search('校订专用句')).hits[0].page,1);
  }finally{sqlite.close();}
});
test('SQL and local matching agree for normalized Chinese and multiple keywords',async()=>{
  const {sqlite,db}=fixtureDB();try{for(const q of ['青松有三分枝','青松 分支','青松有三个分支','白雲','白云 山石']){
    const result=await searchLibrary({db,url:new URL('http://localhost/api/search'),query:q,normalize,guard:{sql:"b.level='public'",args:[]}});
    for(const hit of result.hits)assert.equal(hit.score,rankText(hit.raw_text,queryParts(q,normalize),normalize),q);
  }}finally{sqlite.close();}
});
test('240-page old uploads search beyond page 120 despite stale or empty indexes',async()=>{
  const {sqlite,db}=fixtureDB();
  try{
    sqlite.exec("DELETE FROM pages WHERE book_id='a'; UPDATE books SET page_count=242 WHERE id='a';");
    const insert=sqlite.prepare('INSERT INTO pages(book_id,page,raw_text,normalized) VALUES(?,?,?,?)');
    for(let n=1;n<=240;n++)insert.run('a',n,n===120?'虛構圖書館的鐘聲':n===121?'虛構圖書館的鐘聲和雲朵':n===240?'虛構樹蔭與樹葉':n===239?'':'虛構山林和溪流。'.repeat(100),n===120?'虛構圖書館的鐘聲':'');
    const search=(q,extra='')=>searchLibrary({db,url:new URL('http://localhost/api/search?'+extra),query:q,normalize,guard:{sql:"b.level='public'",args:[]}});
    // The old index-only query demonstrably misses the simplified query.
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM pages WHERE book_id='a' AND instr(normalized,?)>0").get(normalize('图书馆的钟声')).n,0);
    const hit=await search('图书馆的钟声','match=exact');assert.deepEqual(hit.hits.map(h=>h.page),[120,121]);
    assert.deepEqual((await search('圖書館的鐘聲','match=exact')).hits.map(h=>h.page),[120,121]);
    assert.equal((await search('树荫 树叶','match=exact')).hits[0].page,240);
    assert.deepEqual(hit.coverage,{expected_pages:242,saved_pages:240,text_pages:239,empty_pages:1,missing_pages:2});
    const tail=await search('','offset=220');assert.equal(tail.total,240);assert.equal(tail.hits.length,20);assert.equal(tail.hits.at(-1).page,240);
    const before=sqlite.prepare("SELECT raw_text,normalized FROM pages WHERE book_id='a' AND page=120").get();
    assert.equal(before.raw_text,'虛構圖書館的鐘聲');assert.equal(before.normalized,'虛構圖書館的鐘聲');
    sqlite.prepare("UPDATE pages SET reviewed=?,review_search='',aliases='|舊稱館舍|' WHERE book_id='a' AND page=238").run(JSON.stringify([{text:'虛構觀測筆記',aliases:['虛構別名']} ]));
    assert.equal((await search('观测笔记','match=exact')).hits[0].page,238);
    assert.equal((await search('虚构别名','match=exact')).hits[0].page,238);
    assert.equal((await search('旧称馆舍','match=exact')).hits[0].page,238);
    const restricted=await search('','book=b');assert.equal(restricted.total,0);assert.equal(restricted.coverage.expected_pages,0);
  }finally{sqlite.close();}
});

test('OCR languages, encodings, original glyphs, vertical reading order and damaged text layer',()=>{
  assert.deepEqual(ocrLanguages('mixed','vertical'),['chi_tra_vert','chi_sim_vert']);
  assert.deepEqual(ocrLanguages('simplified','horizontal'),['chi_sim']);
  assert.throws(()=>ocrLanguages('wrong','auto'));
  assert.equal(decodeArticle(new TextEncoder().encode('繁體與简体')),'繁體與简体');
  assert.equal(decodeArticle(Uint8Array.from([0xd6,0xd0,0xce,0xc4]),'gb18030'),'中文');
  assert.equal(decodeArticle(Uint8Array.from([0xa4,0xa4,0xa4,0xe5]),'big5'),'中文');
  assert.equal(decodeArticle(Uint8Array.from([255,254,0x2d,0x4e])),'中');
  assert.throws(()=>decodeArticle(Uint8Array.from([0xff,0xff])));
  const item=(str,x,y)=>({str,dir:'ttb',transform:[20,0,0,20,x,y],height:20});
  assert.equal(embeddedText({items:[item('丙',20,80),item('乙',100,40),item('甲',100,80),item('丁',20,40)]}),'甲乙\n丙丁');
  const word=(text,x,y)=>({text,bbox:{x0:x,y0:y,x1:x+20,y1:y+20}});
  assert.equal(orderedOcrText({blocks:[{paragraphs:[{lines:[{words:[word('丙',20,10),word('乙',100,50),word('甲',100,10),word('丁',20,50)]}]}]}]},'vertical'),'甲乙\n丙丁');
  assert.ok(usableText('虛構青松文章'));
  assert.equal(usableText('\ufffd'.repeat(60)),false);
  assert.equal(recognitionQuality({text:'\ufffd\ufffd',confidence:99}),0);
});
