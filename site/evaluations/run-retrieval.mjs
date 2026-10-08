import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {searchEvidence} from '../server/library-evidence.mjs';
import {SOURCES,QUESTIONS,VERSION} from './retrieval-fixtures.mjs';
const require=createRequire(import.meta.url),fold=require('opencc-js').Converter({from:'t',to:'cn'});
const normalize=s=>fold(String(s).normalize('NFKC').toLowerCase()).replace(/[\p{P}\p{S}\s]/gu,'');
export async function evaluateRetrieval(){
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE books(id TEXT,title TEXT,level TEXT,status TEXT,kind TEXT,created_at INTEGER,page_count INTEGER,source_hash TEXT);CREATE TABLE pages(book_id TEXT,page INTEGER,raw_text TEXT,reviewed TEXT DEFAULT '[]',aliases TEXT DEFAULT '',engine TEXT DEFAULT 'article',image_ready INTEGER DEFAULT 1,correction_status TEXT DEFAULT '',corrected_text TEXT DEFAULT '',correction_revision INTEGER DEFAULT 0);`);
 try{
  for(const id of new Set(SOURCES.map(x=>x.book)))sql.prepare('INSERT INTO books VALUES(?,?,?,?,?,?,?,?)').run(id,'虚构验收文献 '+id,id==='restricted'?'special':'public','ready','pdf',1,240,'fictional');
  for(const s of SOURCES)sql.prepare('INSERT INTO pages(book_id,page,raw_text) VALUES(?,?,?)').run(s.book,s.page,s.text);
  const db={prepare:q=>({bind:(...a)=>({all:async()=>({results:sql.prepare(q).all(...a)}),first:async()=>sql.prepare(q).get(...a)})})},rows=[];
  for(const question of QUESTIONS){const started=performance.now();const answer=await searchEvidence({db,normalize,query:question.query,url:new URL('https://fixture.invalid/?book=all&level=public'),guard:{sql:"b.level='public' AND b.status<>'deleting'",args:[]}});const hits=answer.citations.slice(0,5).map(c=>c.book_id+':'+c.page),found=question.expected.filter(id=>hits.includes(id)),rank=hits.findIndex(id=>question.expected.includes(id));rows.push({id:question.id,query:question.query,expected:question.expected,hits,recall:question.expected.length?found.length/question.expected.length:null,reciprocalRank:rank<0?0:1/(rank+1),noEvidenceCorrect:question.expected.length?null:hits.length===0,elapsedMs:Math.round(performance.now()-started)});}
  const positive=rows.filter(r=>r.recall!==null),negative=rows.filter(r=>r.noEvidenceCorrect!==null);
  return {version:VERSION,scope:'关键词与 BM25 检索；不包含向量、OCR 或生成模型效果',syntheticOnly:true,cases:rows.length,recallAt5:positive.reduce((n,r)=>n+r.recall,0)/positive.length,mrrAt5:positive.reduce((n,r)=>n+r.reciprocalRank,0)/positive.length,noEvidenceAccuracy:negative.filter(r=>r.noEvidenceCorrect).length/negative.length,rows};
 }finally{sql.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await evaluateRetrieval(),null,2));
