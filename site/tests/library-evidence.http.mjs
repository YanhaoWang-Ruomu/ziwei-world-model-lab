// Explicitly local, fictional integration test. Never accepts a production URL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:8770';
const preview=await fetch(base+'/__test/demo?role=public');
assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/text\/html/);
async function request(path,{owner=false,method='GET',body}={}){
  const response=await fetch(base+path,{method,headers:{Origin:base,...(owner?{Cookie:'local_preview_owner=1'}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
}
const id='fictional-evidence-242',privateId='fictional-evidence-restricted',semanticId='fictional-semantic-demo';
async function create(id,title,level,pageCount,kind='pdf'){
  const hash=createHash('sha256').update('fictional-fixture-only:'+id).digest('hex');
  const r=await request('/api/books',{owner:true,method:'POST',body:{id,title,level,pageCount,kind,sourceHash:hash,fileName:id+'.txt',fileSize:128}});assert.ok([200,201].includes(r.status));
}
await create(id,'虚构演示 · 园圃观察笔记（242 页）','public',242);
for(let page=1;page<=240;page++){
  const rawText=page===120?'園圃裡的花木在夏季每天澆水；冬季則應減少補水。這是虛構的檢索演示材料。':page===200?'花木長期缺水容易枯萎。這份虛構筆記記錄補水前後的觀察。':page===239?'':page===240?'這是虛構材料的最後一個已保存頁面。':`第 ${page} 頁。虛構白雲與青山觀察記錄。`;
  const r=await request(`/api/books/${id}/pages/${page}`,{owner:true,method:'PUT',body:{rawText,engine:'article'}});assert.equal(r.status,200);
}
await create(privateId,'虚构受限检索测试','special',1);
await request(`/api/books/${privateId}/pages/1`,{owner:true,method:'PUT',body:{rawText:'不可向公开读者返回的虚构园圃记录。',engine:'article'}});
await create(semanticId,'虚构演示 · 本机语义查阅','public',3,'text');
const texts=['盆栽叶片萎蔫时，先检查土壤湿度。若土质干燥，可适量浇水并移到通风处。这是虚构园艺示例。','图书馆阅览室在星期六开放，读者可以借阅小说。这是虚构场所示例。','列车到站后，旅客先下车再上车。这是虚构交通示例。'];
for(let i=0;i<texts.length;i++)await request(`/api/books/${semanticId}/pages/${i+1}`,{owner:true,method:'PUT',body:{rawText:texts[i],engine:'article'}});
const check=(await request(`/api/books/${id}/readiness`)).data;
assert.equal(check.saved_pages,240);assert.equal(check.text_pages,239);assert.deepEqual(check.missing_ranges,[[241,242]]);assert.deepEqual(check.empty_ranges,[[239,239]]);
for(const action of ['readiness','corpus?after=0','pages/1'])assert.equal((await request(`/api/books/${privateId}/${action}`)).status,404);
assert.equal((await request(`/api/books/${privateId}/corpus?after=0`,{owner:true})).status,200);
const result=await request('/api/evidence/search?'+new URLSearchParams({book:id,q:'如何给园圃的花木浇水'}));assert.equal(result.status,200);assert.equal(result.data.citations[0].page,120);assert.equal(result.data.coverage.saved_pages,240);
const denied=await request('/api/evidence/search?'+new URLSearchParams({book:privateId,q:'园圃'}));assert.deepEqual(denied.data.citations,[]);
const later=await request(`/api/books/${id}/corpus?after=232`);assert.equal(later.data.pages.at(-1).page,240);
console.log('PASS: fictional 242-page readiness, later-page retrieval, exact citations, corpus batches and visitor/owner access boundaries.');
console.log('Preview: '+base+'/#library');
