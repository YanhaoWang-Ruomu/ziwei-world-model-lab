import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault} from '../src/vault-storage.mjs';
function memory(){const rows=new Map();const copy=structuredClone;return {
 rows,get:async id=>copy(rows.get(id)),put:async r=>rows.set(r.id,copy(r)),remove:async id=>rows.delete(id),
 putIfHeader:async(r,iv)=>{if(rows.get(r.owner+':header')?.iv!==iv)throw Error('加密空间已重置');rows.set(r.id,copy(r));},
 scan:async(owner,{kind,catalog=false}={})=>[...rows.values()].filter(r=>r.owner===owner&&(!kind||r.kind===kind)&&(!catalog||['book','technique'].includes(r.kind))).map(r=>copy(r)),
 resetOwner:async(account,header,iv,archive,current)=>{if(!current()||rows.get(account+':header')?.iv!==iv)throw Error('重置未完成');for(const row of [...rows.values()])if(row.owner===account&&row.kind!=='vault-archive'){rows.set(archive.archiveOwner+row.id.slice(account.length),copy({...row,id:archive.archiveOwner+row.id.slice(account.length),owner:archive.archiveOwner}));rows.delete(row.id);}rows.set(header.id,copy(header));if(iv)rows.set(archive.id,copy(archive));}
};}
test('forgotten local password starts an empty vault while preserving encrypted archives and other accounts',async()=>{
 const storage=memory(),v=createVault({storage});await v.open('fictional-a','old-fictional-password');await v.put({id:'book',kind:'book',title:'fictional secret title'});
 await v.open('fictional-b','another-fictional-password');await v.put({id:'book-b',kind:'book',title:'second account'});v.lock();
 assert.equal((await v.resetPassword('fictional-a','new-fictional-password','重建加密空间')).archived,true);
 await assert.rejects(v.open('fictional-a','old-fictional-password'));await v.open('fictional-a','new-fictional-password');assert.deepEqual(await v.list(),[]);
 const archives=await v.archives('fictional-a');assert.equal(archives.length,1);assert.ok(!JSON.stringify([...storage.rows.values()]).includes('fictional secret title'));
 await assert.rejects(v.restoreArchive('fictional-a',archives[0].id,'wrong-password'));assert.deepEqual(await v.list(),[]);
 await v.restoreArchive('fictional-a',archives[0].id,'old-fictional-password');assert.equal((await v.list())[0].title,'fictional secret title');
 await v.open('fictional-b','another-fictional-password');assert.equal((await v.list())[0].title,'second account');await assert.rejects(v.restoreArchive('fictional-b',archives[0].id,'old-fictional-password'));
});
test('confirmation and account changes prevent reset; stale tabs cannot write into a reset vault',async()=>{
 const storage=memory(),v=createVault({storage}),stale=createVault({storage});await v.open('fictional-a','old-fictional-password');await v.put({id:'book',kind:'book',title:'saved'});await stale.open('fictional-a','old-fictional-password');
 await assert.rejects(v.resetPassword('fictional-a','new-fictional-password','wrong'));
 await assert.rejects(v.resetPassword('fictional-a','new-fictional-password','重建加密空间',()=>false));
 await v.open('fictional-a','old-fictional-password');assert.equal((await v.list())[0].title,'saved');
 await v.resetPassword('fictional-a','new-fictional-password','重建加密空间');await assert.rejects(stale.put({id:'late',kind:'book',title:'stale'}),/重置/);
 await v.open('fictional-a','new-fictional-password');assert.deepEqual(await v.list(),[]);
 await v.resetPassword('fictional-a','third-fictional-password','重建加密空间');assert.equal((await v.archives('fictional-a')).length,2);
});
