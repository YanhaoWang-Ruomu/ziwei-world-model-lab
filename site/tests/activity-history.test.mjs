import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {activityHistoryRoute} from '../server/activity-history.mjs';
import {techniqueRoute} from '../server/techniques.js';
import {submissionRoute} from '../server/submissions.js';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  const dir=new URL('../drizzle/',import.meta.url);for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL(file,dir),'utf8'));
  const db={prepare(query){const bind=(...args)=>({first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:sql.prepare(query).run(...args)})});return {...bind(),bind};}};
  sql.prepare('INSERT INTO books(id,title,level,kind,page_count,source_hash,file_name,file_size,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('fictional-book','虚构测试册','public','text',1,'0'.repeat(64),'fictional.txt',3,1);
  const payload=JSON.stringify({title:'虚构标题',text:'虚构文字',outcome:'虚构结果',topic:'测试',level:'special',rule:{version:1,mode:'all',conditions:[],unresolved:[]}});
  for(const [id,author]of [['t1','tester'],['t2','other']])sql.prepare("INSERT INTO authored_techniques(id,author,payload,level,status,updated_at) VALUES(?,?,?,'special','pending',100)").run(id,author,payload);
  for(const [id,author]of [['s1','tester'],['s2','other']])sql.prepare("INSERT INTO card_submissions(id,book_id,page,author_key,author_label,payload,base_card_revision,source_revision,created_at) VALUES(?,'fictional-book',1,?,?,?,0,1,100)").run(id,author,author,JSON.stringify({title:'虚构摘录',quote:'仅测试'}));
  sql.exec("INSERT INTO page_revisions VALUES('fictional-book',1,1,'fictional','','','confirmed','hash',101); INSERT INTO community_posts(id,user_id,title,body,kind,tags,created_at,updated_at) VALUES('post','tester','虚构讨论','fixture','case','[]',100,100); INSERT INTO community_comments(id,post_id,user_id,body,created_at) VALUES('comment','post','tester','fixture',100); INSERT INTO community_reports(id,user_id,target_kind,target_id,reason,created_at) VALUES('report','tester','post','post','fictional',100); INSERT INTO community_moderation VALUES('m1','post','post','tester','published','fictional',102); INSERT INTO community_moderation VALUES('m2','report','report','tester','resolved','fictional',103)");
  const context={db,method:'GET',viewer:{role:'core',core:true,actor:'tester'},guard:{sql:"b.status<>'deleting'",args:[]}};
  const call=(handler,path,viewer=context.viewer)=>handler({...context,viewer,path:path.split('?')[0],url:new URL('https://example.test'+path)});
  return {sql,call};
}
test('history and pending counts share existing records and require the active core role',async()=>{
  const {sql,call}=fixture();try{
    for(const path of ['/api/activity/history','/api/review/summary'])for(const viewer of [{role:'public'},{role:'special',core:false},{role:'public',core:true,maxRole:'core'}])await assert.rejects(call(activityHistoryRoute,path,viewer),e=>e.status===403);
    assert.deepEqual({...((await call(activityHistoryRoute,'/api/review/summary')).counts)},{techniques:2,excerpts:2,community:2,reports:1});
    const all=await call(activityHistoryRoute,'/api/activity/history');assert.deepEqual(new Set(all.records.map(r=>r.category)),new Set(['techniques','excerpts','pages','community','reports']));
    assert.ok(all.records.every(r=>!('payload'in r)&&!('body'in r)&&!('corrected_text'in r)));
    const filtered=await call(activityHistoryRoute,'/api/activity/history?category=community&q='+encodeURIComponent('虚构'));assert.equal(filtered.records.length,1);assert.equal(filtered.records[0].title,'虚构讨论');
    sql.exec("UPDATE books SET status='deleting'");const remaining=await call(activityHistoryRoute,'/api/activity/history');assert.equal(remaining.records.some(r=>['pages','excerpts'].includes(r.category)),false);assert.equal((await call(activityHistoryRoute,'/api/review/summary')).counts.excerpts,0);
  }finally{sql.close();}
});
test('history cursor preserves every event when timestamps collide',async()=>{
  const {sql,call}=fixture();try{
    const insert=sql.prepare("INSERT INTO community_moderation VALUES(?,'post','post','tester','hidden','fictional',200)");for(let i=0;i<67;i++)insert.run('page-'+i);
    const ids=[];let next=null;do{const result=await call(activityHistoryRoute,'/api/activity/history?category=community'+(next?'&before='+encodeURIComponent(next):''));ids.push(...result.records.map(r=>r.id));next=result.next;}while(next);
    assert.equal(ids.length,68);assert.equal(new Set(ids).size,68);await assert.rejects(call(activityHistoryRoute,'/api/activity/history?before=wrong'),e=>e.status===400);
  }finally{sql.close();}
});
test('core own submissions stay separate from review queues; special users cannot widen scope',async()=>{
  const {sql,call}=fixture();try{
    assert.deepEqual((await call(techniqueRoute,'/api/techniques?mine=1')).cards.map(c=>c.id),['t1']);assert.equal((await call(techniqueRoute,'/api/techniques')).cards.length,2);
    assert.equal((await call(submissionRoute,'/api/submissions?scope=mine')).total,1);assert.equal((await call(submissionRoute,'/api/submissions?scope=all')).total,2);
    const special={role:'special',core:false,actor:'tester'};assert.equal((await call(submissionRoute,'/api/submissions?scope=all',special)).total,1);
    const own=await call(techniqueRoute,'/api/techniques?mine=1',special);assert.equal(own.cards.length,1);assert.equal(own.cards[0].payload.text,undefined);assert.equal(own.cards[0].payload.rule,undefined);
  }finally{sql.close();}
});
