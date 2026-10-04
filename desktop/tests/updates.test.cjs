'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { newer, validateRelease } = require('../app/update-policy.cjs');
const bytes = Buffer.from('fictional installer only; never executed');
const release = { version: '1.0.1', filename: 'GuanXingTai-Setup-1.0.1-x64.exe', url: '/downloads/GuanXingTai-Setup-1.0.1-x64.exe', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
test('version selection rejects downgrades and external or invalid packages', () => {
  assert.equal(newer('1.10.0','1.9.9'),true);
  assert.equal(validateRelease(release,'1.0.1'),null);
  assert.equal(validateRelease(release,'2.0.0'),null);
  assert.throws(()=>validateRelease({...release,url:'https://other.test/setup.exe'},'1.0.0'));
  assert.throws(()=>validateRelease({...release,url:'/downloads/../evil.exe'},'1.0.0'));
  assert.throws(()=>validateRelease({...release,size:1e12},'1.0.0'));
  assert.throws(()=>validateRelease({...release,sha256:'bad'},'1.0.0'));
});
async function scenario({payload=bytes,version='1.0.0',answers=[0,0],status=200,aborted=false,spawnFails=false}={}) {
  const root=path.join(__dirname,'../.test-data');fs.mkdirSync(root,{recursive:true});
  const profile=fs.mkdtempSync(path.join(root,'updater-'));
  const messages=[],launched=[],progress=[];let quit=false,flushed=false;
  const app={getVersion:()=>version,getPath:()=>profile,quit:()=>{quit=true;}};
  const https={get:(url,options,cb)=>{
    assert.match(url,/^https:\/\/ziwei-world-model-lab\.vocal-chime-3672\.chatgpt\.site\//);
    assert.equal(options.headers.Cookie,undefined);
    const req=new EventEmitter();req.destroy=e=>req.emit('error',e);
    queueMicrotask(()=>{
      const manifest=url.includes('downloads-manifest.json');
      const response=new EventEmitter();response.statusCode=manifest?200:status;
      response.resume=()=>{};response.destroy=e=>response.emit('error',e);
      cb(response);
      if(response.statusCode!==200)return;
      if(!manifest&&aborted){response.emit('aborted');return;}
      response.emit('data',manifest?Buffer.from(JSON.stringify({windows:release})):payload);
      response.emit('end');
    });return req;
  }};
  const childProcess={spawn:(file,args,options)=>{
    const child=new EventEmitter();child.unref=()=>{};
    launched.push({file,args,options});queueMicrotask(()=>child.emit(spawnFails?'error':'spawn',spawnFails?Error('fixture failure'):undefined));return child;
  }};
  const context={require:id=>id==='electron'?{app,dialog:{showMessageBox:async (_win,options)=>{messages.push(options);return{response:answers.shift()??0};}}}:id==='node:https'?https:id==='node:child_process'?childProcess:id==='./policy.cjs'?require('../app/policy.cjs'):id==='./update-policy.cjs'?require('../app/update-policy.cjs'):require(id),module:{exports:{}},Buffer,process};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/updates.cjs'),'utf8'),context);
  const win={isDestroyed:()=>false,setProgressBar:n=>progress.push(n),webContents:{session:{cookies:{flushStore:async()=>{flushed=true;}},flushStorageData:()=>{}}}};
  await context.module.exports.createUpdater(win).check(true);
  return {messages,launched,progress,quit,flushed,profile};
}
test('verified download prompts before installing, flushes data, and targets current install directory',async()=>{
  const r=await scenario();assert.equal(r.launched.length,1);assert.equal(r.quit,true);assert.equal(r.flushed,true);
  assert.deepEqual(fs.readFileSync(r.launched[0].file),bytes);
  assert.equal(r.launched[0].args.at(-1),'/D='+path.dirname(process.execPath));
  assert.ok(r.launched[0].args.includes('--force-run'));assert.equal(r.messages.length,2);
});
test('declining download or install never launches installer or exits',async()=>{
  for(const answers of [[1],[0,1]]){const r=await scenario({answers});assert.equal(r.launched.length,0);assert.equal(r.quit,false);}
});
test('tampering, truncation, redirects and interrupted transfers cannot execute',async()=>{
  for(const options of [{payload:Buffer.alloc(bytes.length)},{payload:bytes.subarray(1)},{status:302},{aborted:true}]){
    const r=await scenario(options);assert.equal(r.launched.length,0);assert.equal(r.quit,false);assert.ok(r.messages.some(m=>m.type==='warning'));
  }
});
test('current release does not download; failed installer launch keeps app open',async()=>{
  const current=await scenario({version:'1.0.1'});assert.equal(current.launched.length,0);assert.equal(current.messages.length,1);
  const fail=await scenario({spawnFails:true});assert.equal(fail.quit,false);assert.equal(fail.messages.at(-1).type,'warning');
});
