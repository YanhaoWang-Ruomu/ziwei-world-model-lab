// Fictional test store only. Never accepts an external or user-preview URL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:8770';
assert.equal((await fetch(base+'/__test/demo?role=public')).status,200);
async function request(path,{method='POST',body,identity='reader'}={}){
  const response=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(identity==='owner'?{Cookie:'local_preview_owner=1'}:identity==='reader'?{Cookie:'local_preview_subject=discovery-test'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};
}
const publicId='fictional-joint-discovery',restrictedId='fictional-joint-restricted';
for(const [id,level]of [[publicId,'public'],[restrictedId,'special']]){
  const created=await request('/api/books',{identity:'owner',body:{id,title:'虚构联合检索园圃 '+level,level,pageCount:121,kind:'text',sourceHash:createHash('sha256').update(id).digest('hex'),fileName:'fictional.txt',fileSize:128}});assert.ok([200,201].includes(created.status));
  assert.equal((await request(`/api/books/${id}/pages/120`,{identity:'owner',method:'PUT',body:{rawText:'虛構藍色花盆每天澆水一次。夏季應檢查土壤濕度。',engine:'article'}})).status,200);
}
const input={question:'虚构花盆怎么浇水？',queries:['花盆','浇水'],bookId:publicId,publicConfirmed:true,domains:[],freshness:0};
const found=await request('/api/ai/discovery/search',{body:input});assert.equal(found.status,200);assert.ok(found.data.citations.length>0);assert.ok(found.data.citations.every(c=>c.book_id===publicId&&c.page===120));assert.ok(found.data.citations.some(c=>c.quote.includes('澆水')));
assert.equal((await request('/api/ai/discovery/search',{body:input,identity:'visitor'})).status,401);
assert.equal((await request('/api/ai/discovery/search',{body:{...input,bookId:restrictedId}})).status,403);
assert.equal((await request('/api/ai/discovery/search',{body:{...input,publicConfirmed:false}})).status,400);
const checked=await request('/api/ai/research/sources',{body:{references:found.data.citations}});assert.equal(checked.status,200);
assert.equal((await request('/api/ai/discovery/check',{body:{result:{schema:1,id:'fictional-nonexistent'}}})).status,409);
assert.equal((await request('/api/ai/discovery/answer',{body:{...input,consent:true,id:crypto.randomUUID(),references:found.data.citations,connection:{baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'unsupported-fictional-model',apiKey:'fictional-key-never-sent'}}})).status,400);
console.log('PASS: real local Worker + migrated D1; traditional text at page 120 found, public-only scope/authentication enforced, receipt endpoint reachable; no provider call.');
