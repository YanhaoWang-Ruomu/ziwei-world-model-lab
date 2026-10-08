import test from 'node:test';
import assert from 'node:assert/strict';
import {serveReleaseDownload,requestedRange,approvedAsset} from '../server/downloads-core.mjs';
const bytes=new TextEncoder().encode('fictional-binary');
const entry={version:'0.0.0',filename:'GuanXingTai-Setup-0.0.0-x64.exe',url:'/downloads/GuanXingTai-Setup-0.0.0-x64.exe',type:'application/octet-stream',sha256:'a'.repeat(64),size:bytes.length,assetUrl:'https://github.com/YanhaoWang-Ruomu/ziwei-world-model-lab/releases/download/windows-v0.0.0/GuanXingTai-Setup-0.0.0-x64.exe'};
const manifest={windows:entry};
const request=(headers={},method='GET',url=entry.url)=>new Request('https://fictional.test'+url,{method,headers});
function remote(calls){return async(url,options)=>{
  calls.push({url,options});
  const range=requestedRange(options.headers.get('Range'),bytes.length);
  const body=bytes.slice(range.start,range.end+1);
  return new Response(body,{status:range.partial?206:200,headers:{'Content-Length':String(body.length),...(range.partial?{'Content-Range':`bytes ${range.start}-${range.end}/${bytes.length}`}:{})}});
};}
test('same-origin download streams the checked external installer without forwarding account headers',async()=>{
  const calls=[];const response=await serveReleaseDownload(request({Cookie:'private=fake',Authorization:'Bearer fictional'}),manifest,{},remote(calls));
  assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  assert.equal(response.headers.get('Content-Length'),String(bytes.length));assert.equal(response.headers.get('ETag'),`"${entry.sha256}"`);
  assert.equal(calls[0].url,entry.assetUrl);assert.equal(calls[0].options.headers.has('cookie'),false);assert.equal(calls[0].options.headers.has('authorization'),false);
});
test('byte, suffix and If-Range requests preserve resumable updater downloads',async()=>{
  for(const [header,start,end] of [['bytes=2-6',2,6],['bytes=-4',bytes.length-4,bytes.length-1],['bytes=10-',10,bytes.length-1],['bytes=10-999',10,bytes.length-1]]){
    const calls=[];const response=await serveReleaseDownload(request({Range:header}),manifest,{},remote(calls));
    assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),`bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes.slice(start,end+1));
  }
  const response=await serveReleaseDownload(request({Range:'bytes=2-6','If-Range':'"older-version"'}),manifest,{},remote([]));
  assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
});
test('HEAD, cache validation, invalid range and unsupported methods do not fetch an installer',async()=>{
  const never=()=>{throw Error('Unexpected upstream request');};
  assert.equal((await serveReleaseDownload(request({},'HEAD'),manifest,{},never)).status,200);
  assert.equal((await serveReleaseDownload(request({'If-None-Match':`"${entry.sha256}"`}),manifest,{},never)).status,304);
  for(const Range of ['bytes=99-100','bytes=9-1','bytes=-0','bytes=0-2,4-5','bytes=','invalid'])assert.equal((await serveReleaseDownload(request({Range}),manifest,{},never)).status,416);
  assert.equal((await serveReleaseDownload(request({},'POST'),manifest,{},never)).status,405);
  assert.equal((await serveReleaseDownload(request({},'GET','/downloads/missing.exe'),manifest,{},never)).status,404);
});
test('older installer URLs still redirect to the current same-origin URL',async()=>{
  const response=await serveReleaseDownload(request({},'GET','/downloads/old.exe'),manifest,{'windows-previous':{url:'/downloads/old.exe'}});
  assert.equal(response.status,302);assert.equal(response.headers.get('Location'),entry.url);
});
test('external source is limited to the exact approved repository, platform, version and filename',async()=>{
  assert.equal(approvedAsset(entry),true);
  for(const assetUrl of ['http://localhost/file.exe',entry.assetUrl+'?token=example',entry.assetUrl.replace('github.com','github.com.evil.test'),entry.assetUrl.replace('windows-v0.0.0','android-v0.0.0')]){
    let called=false;const response=await serveReleaseDownload(request(),{windows:{...entry,assetUrl}},{},()=>{called=true;});
    assert.equal(response.status,503);assert.equal(called,false);
  }
});
test('upstream failures and incorrect range/size responses are never presented as valid installers',async()=>{
  for(const response of [new Response('failed',{status:502}),new Response(bytes,{status:200,headers:{'Content-Length':'999'}}),new Response(bytes.slice(0,4),{status:206,headers:{'Content-Range':`bytes 1-4/${bytes.length}`}})]){
    const result=await serveReleaseDownload(request({Range:'bytes=0-3'}),manifest,{},async()=>response);
    assert.equal(result.status,503);assert.equal(result.headers.get('Cache-Control'),'no-store');
  }
});
test('truncated installer streams fail instead of silently completing',async()=>{
  const response=await serveReleaseDownload(request(),manifest,{},async()=>new Response(bytes.slice(0,3),{headers:{'Content-Length':String(bytes.length)}}));
  await assert.rejects(response.arrayBuffer(),/interrupted/);
});
test('cancelled downloads cancel the upstream stream',async()=>{
  let cancelled=false;
  const source=new ReadableStream({pull(controller){controller.enqueue(bytes.slice(0,1));},cancel(){cancelled=true;}});
  const response=await serveReleaseDownload(request(),manifest,{},async()=>new Response(source,{headers:{'Content-Length':String(bytes.length)}}));
  await response.body.cancel();assert.equal(cancelled,true);
});
