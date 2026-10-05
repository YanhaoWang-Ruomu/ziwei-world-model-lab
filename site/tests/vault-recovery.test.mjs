import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault} from '../src/vault-storage.mjs';
import {saveBookSource,readBookSource,recognizeBookPages} from '../src/vault-books.mjs';
function memory(){const rows=new Map();return {get:async id=>structuredClone(rows.get(id)),put:async r=>rows.set(r.id,structuredClone(r)),remove:async id=>rows.delete(id),scan:async(owner,{metadata,catalog,parent,kind}={})=>[...rows.values()].filter(r=>r.owner===owner&&(!catalog||!r.kind||['book','technique'].includes(r.kind))&&(parent===undefined||r.parent===parent)&&(!kind||kind===r.kind)).sort((a,b)=>a.id.localeCompare(b.id)).map(r=>metadata?{id:r.id,iv:r.iv,check:r.check,kind:r.kind,parent:r.parent,size:r.data?.length||0}:structuredClone(r)),rows};}
test('fictional private PDF resumes after interruption without rerunning saved pages',async()=>{
 const storage=memory(),vault=createVault({storage});await vault.open('fictional-owner','fictional-password');
 const file=new File([new Uint8Array(1200000).fill(42)],'fictional.pdf',{type:'application/pdf'}),book=await saveBookSource(vault,file,{title:'虚构识别样本'});let calls=[];
 await assert.rejects(recognizeBookPages(vault,book,3,async page=>{calls.push(page);if(page===2)throw Error('fictional interruption');return {text:'虚构第 '+page+' 页'};}));
 vault.lock();await vault.open('fictional-owner','fictional-password');const pending=await vault.get(book.id);assert.equal(pending.completedPages,1);assert.equal(pending.status,'paused');
 calls=[];const complete=await recognizeBookPages(vault,pending,3,async page=>{calls.push(page);return {text:'虚构第 '+page+' 页'};});assert.deepEqual(calls,[2,3]);assert.equal(complete.status,'ready');assert.equal((await vault.list()).length,1);assert.equal((await vault.list({parent:book.id,kind:'book-page'})).length,3);assert.equal((await readBookSource(vault,complete)).size,file.size);
 const encoded=JSON.stringify([...storage.rows.values()]);assert.ok(!encoded.includes('虚构识别样本'));assert.ok(!encoded.includes('虚构第'));
});
test('volume restore rejects missing, mixed or damaged parts before exposing books, preserves graph and accounts',async()=>{
 const storage=memory(),vault=createVault({storage});await vault.open('fictional-a','fictional-password');const book=await saveBookSource(vault,new File(['fictional source'],'fictional.pdf'),{title:'虚构书库'});await recognizeBookPages(vault,book,3,async p=>({text:'虚构检索 '+p}));
 const parts=[];for await(const part of vault.backupVolumes(700))parts.push(part);assert.ok(parts.length>1);const files=parts.map(p=>new File([JSON.stringify(p)],p.part+'.json'));
 await vault.open('fictional-b','another-fictional-password');await assert.rejects(vault.restoreVolumes(files.slice(1),'fictional-password'),/选齐/);assert.equal((await vault.list()).length,0);
 const bad=structuredClone(parts);bad[0].records[1].data='corrupt';await assert.rejects(vault.restoreVolumes(bad.map(p=>new File([JSON.stringify(p)],p.part+'.json')),'fictional-password'));assert.equal((await vault.list()).length,0);
 await assert.rejects(vault.restoreVolumes(files,'wrong-password'));await vault.restoreVolumes(files,'fictional-password');const restored=(await vault.list())[0];assert.notEqual(restored.id,book.id);assert.equal((await vault.get(restored.id+'.page.3')).text,'虚构检索 3');assert.equal(await(await readBookSource(vault,restored)).text(),'fictional source');
 await vault.remove(restored.id);assert.equal((await vault.list({parent:restored.id})).length,0);await vault.open('fictional-a','fictional-password');assert.equal((await vault.list()).length,1);
});
test('locking during extraction cannot save a page under another identity',async()=>{
 const vault=createVault({storage:memory()});await vault.open('fictional-a','fictional-password');const book={id:'test',kind:'book',title:'fictional'};
 await assert.rejects(recognizeBookPages(vault,book,1,async()=>{await vault.open('fictional-b','fictional-password');return {text:'not copied'};}),/锁定/);assert.equal((await vault.list()).length,0);await vault.open('fictional-a','fictional-password');assert.equal(await vault.get('test.page.1'),null);
});
test('damaged legacy imports stay hidden and are excluded from later complete backups',async()=>{
 const storage=memory(),vault=createVault({storage});await vault.open('fictional-old','fictional-password');
 await vault.put({id:'a',kind:'book',title:'虚构旧格式'});await vault.put({id:'b',kind:'book',title:'虚构损坏页'});
 const old=await vault.backup();old.records.find(r=>r.id.endsWith(':b')).data='broken';
 await vault.open('fictional-new','fictional-password');await assert.rejects(vault.restore(old,'fictional-password'));assert.deepEqual(await vault.list(),[]);
 const parts=[];for await(const p of vault.backupVolumes())parts.push(p);assert.equal(parts[0].records.length,1);
});
