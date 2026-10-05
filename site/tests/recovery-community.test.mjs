import test from 'node:test';import assert from 'node:assert/strict';
import {fictionalStore,fixtureRequest} from './fictional-store.mjs';
import {accountRoute,accountIdentity} from '../server/accounts.js';
import {createBackup,storageRoute} from '../server/storage.js';
import {validateManifest} from '../server/storage-restore.mjs';
import {worldCommunityRoute} from '../server/world-community.js';
const founder={id:'fictional-founder',actor:'account:fictional-founder',core:true,founder:true},alice={id:'fictional-alice'},bob={id:'fictional-bob'},carol={id:'fictional-carol'};
test('recovery code is single-use, password change invalidates all old sessions, and recovery never exposes it again',async()=>{
 const env=fictionalStore(),call=(path,data,cookie='',method='POST')=>accountRoute({path,method,request:fixtureRequest(path,method,data,cookie),db:env.db});
 try{const login=await call('/api/account/register',{username:'fixture-account',password:'fictional-original-password',remember:true}),cookie=login.cookie.split(';')[0];
  await assert.rejects(call('/api/account/recovery-code',{currentPassword:'wrong'},cookie),e=>e.status===403);
  const recovery=await call('/api/account/recovery-code',{currentPassword:'fictional-original-password'},cookie);assert.match(recovery.result.recoveryCode,/^GXRC-/);const state=await call('/api/account/security',undefined,cookie,'GET');assert.deepEqual(state,{result:{recoveryEnabled:true}});
  await assert.rejects(call('/api/account/recover',{username:'fixture-account',recoveryCode:'invalid',newPassword:'fictional-new-password'}),e=>e.status===403);
  await call('/api/account/recover',{username:'fixture-account',recoveryCode:recovery.result.recoveryCode,newPassword:'fictional-new-password'});
  assert.equal((await accountIdentity(fixtureRequest('/', 'GET',undefined,cookie),env.db,{id:'platform'})).id,'');
  await assert.rejects(call('/api/account/recover',{username:'fixture-account',recoveryCode:recovery.result.recoveryCode,newPassword:'fictional-third-password'}),e=>e.status===403);
  const next=await call('/api/account/login',{username:'fixture-account',password:'fictional-new-password'}),other=await call('/api/account/login',{username:'fixture-account',password:'fictional-new-password'});
  await call('/api/account/password',{currentPassword:'fictional-new-password',newPassword:'fictional-final-password'},next.cookie.split(';')[0]);
  for(const session of [next,other])assert.equal((await accountIdentity(fixtureRequest('/','GET',undefined,session.cookie.split(';')[0]),env.db,{})).id,'');
 }finally{env.db.close();}
});
test('cloud restore verifies assets, recovers missing records transactionally, and retains current edits',async()=>{
 const env=fictionalStore(),{db,BUCKET}=env;const restore=(path,data,viewer=founder,method='POST')=>storageRoute({path,method,request:fixtureRequest(path,method,data),db,env,viewer,url:new URL('https://fictional.invalid'+path)});
 try{const id='10000000-0000-4000-8000-000000000001';await db.prepare("INSERT INTO books(id,title,level,kind,page_count,source_hash,file_name,file_size,file_ready,created_at) VALUES (?,'虚构材料','public','pdf',1,'fictional','fictional.pdf',7,1,1)").bind(id).run();await BUCKET.put('books/'+id+'/original','fixture');
  await db.prepare("INSERT INTO authored_techniques(id,author,payload,level,updated_at) VALUES ('fixture-card','fictional-owner','{}','public',1)").run();const saved=await createBackup(env,true);assert.ok(saved.id);
  await db.prepare('DELETE FROM books WHERE id=?').bind(id).run();await BUCKET.delete('books/'+id+'/original');await db.prepare("UPDATE authored_techniques SET payload='{"+ '"fixture":"new"' +"}' WHERE id='fixture-card'").run();
  await assert.rejects(restore('/api/storage/restore',{backupId:saved.id},alice),e=>e.status===403);let job=await restore('/api/storage/restore',{backupId:saved.id});
  await assert.rejects(restore('/api/storage/restore/'+job.id+'/commit',{confirmed:true,mode:'missing-only'}),e=>e.status===409);
  for(let i=0;i<100&&job.state!=='ready';i++)job=await restore('/api/storage/restore/'+job.id+'/prepare');assert.equal(job.state,'ready');assert.equal(await(await BUCKET.get('books/'+id+'/original')).text(),'fixture');
  await assert.rejects(restore('/api/storage/restore/'+job.id+'/commit',{}),e=>e.status===400);await restore('/api/storage/restore/'+job.id+'/commit',{confirmed:true,mode:'missing-only'});
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM books').first()).n,1);assert.equal(JSON.parse((await db.prepare("SELECT payload FROM authored_techniques WHERE id='fixture-card'").first()).payload).fixture,'new');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM technique_history').first()).n,1);
  assert.equal((await restore('/api/storage/restore/'+job.id+'/commit',{confirmed:true,mode:'missing-only'})).alreadyDone,true);
 }finally{db.close();}
});
test('community edits retain history and re-enter review, replies notify the right accounts only after approval',async()=>{
 const env=fictionalStore(),{db}=env,call=(viewer,path,method='GET',data)=>worldCommunityRoute({path,method,request:fixtureRequest(path,method,data),db,viewer,url:new URL('https://fictional.invalid'+path)});
 const moderate=async(kind,item)=>call(founder,'/api/community/moderation','POST',{kind,id:item.id,revision:item.revision,decision:'published',reason:'fictional review'});
 try{let {post}=await call(alice,'/api/community/posts','POST',{title:'虚构讨论',body:'fictional post',kind:'case',tags:[],sharingConfirmed:true});await moderate('post',post);post=(await call(alice,'/api/community/posts/'+post.id)).post;
  const parent=(await call(bob,'/api/community/posts/'+post.id+'/comments','POST',{body:'fictional reply',sharingConfirmed:true})).comment;await moderate('comment',parent);
  const child=(await call(carol,'/api/community/posts/'+post.id+'/comments','POST',{body:'fictional follow-up',parentId:parent.id,sharingConfirmed:true})).comment;
  assert.equal((await call(bob,'/api/community/notifications')).notifications.filter(n=>n.commentId===child.id).length,0);await moderate('comment',child);
  assert.equal((await call(bob,'/api/community/notifications')).notifications.filter(n=>n.commentId===child.id&&n.kind==='reply').length,1);assert.equal((await call(alice,'/api/community/notifications')).notifications.filter(n=>n.commentId===child.id&&n.kind==='reply').length,1);
  await assert.rejects(call(bob,'/api/community/posts/'+post.id,'PUT',{revision:post.revision,title:'not permitted',body:'no',kind:'case',tags:[],sharingConfirmed:true}),e=>e.status===404);
  const changed=(await call(alice,'/api/community/posts/'+post.id,'PUT',{revision:post.revision,title:'修订虚构讨论',body:'edited fixture',kind:'case',tags:[],sharingConfirmed:true})).post;assert.equal(changed.status,'pending');await assert.rejects(call({},'/api/community/posts/'+post.id),e=>e.status===404);
  const history=await call(alice,'/api/community/posts/'+post.id+'/history');assert.equal(history.history[0].content.body,'fictional post');await assert.rejects(call(bob,'/api/community/posts/'+post.id+'/history'),e=>e.status===404);
  await assert.rejects(call(alice,'/api/community/posts/'+post.id,'PUT',{revision:post.revision,title:'stale',body:'stale',kind:'case',tags:[],sharingConfirmed:true}),e=>e.status===409);await moderate('post',changed);assert.equal((await call({},'/api/community/posts/'+post.id)).post.body,'edited fixture');
 }finally{db.close();}
});
test('restore rejects corrupt manifests and rolls back username collisions without moving ownership',async()=>{
 assert.throws(()=>validateManifest({id:'fixture',format:1,counts:{books:1},files:[{table:'books',count:1}]},'fixture',['books']),e=>e.status===400);
 const env=fictionalStore(),{db}=env,restore=(path,data)=>storageRoute({path,method:'POST',request:fixtureRequest(path,'POST',data),db,env,viewer:founder,url:new URL('https://fictional.invalid'+path)});
 try{
  await db.prepare("INSERT INTO personal_accounts(id,username,username_key,password_salt,password_hash,created_at) VALUES ('old-id','fixture-owner','fixture-owner','fixture','fixture',1)").run();
  await db.prepare("INSERT INTO world_projects(id,user_id,title,payload,created_at,updated_at) VALUES ('fictional-project','old-id','虚构项目','{}',1,1)").run();const saved=await createBackup(env,true);
  await db.prepare('DELETE FROM world_projects').run();await db.prepare('DELETE FROM personal_accounts').run();await db.prepare("INSERT INTO personal_accounts(id,username,username_key,password_salt,password_hash,created_at) VALUES ('current-id','fixture-owner','fixture-owner','fixture','fixture',1)").run();
  let job=await restore('/api/storage/restore',{backupId:saved.id});for(let i=0;i<100&&job.state!=='ready';i++)job=await restore('/api/storage/restore/'+job.id+'/prepare');assert.equal(job.state,'ready');
  await assert.rejects(restore('/api/storage/restore/'+job.id+'/commit',{confirmed:true,mode:'missing-only'}),e=>e.status===409);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM world_projects').first()).n,0);assert.equal((await db.prepare('SELECT id FROM personal_accounts').first()).id,'current-id');
 }finally{db.close();}
});
