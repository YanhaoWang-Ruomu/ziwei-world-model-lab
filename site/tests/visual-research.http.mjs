// Real local Worker/D1/R2, fictional records only, isolated test port.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8770';
assert.equal((await fetch(base+'/__test/demo?role=public')).status,200);
async function request(path,{method='GET',body,owner=false,guest=false,binary=false}={}){
 return fetch(base+path,{method,headers:{Origin:base,...(!guest?{Cookie:owner?'local_preview_owner=1':'local_preview_subject=visual-fixture'}:{}),...(body?{'Content-Type':binary?'image/jpeg':'application/json'}:{})},body:body?(binary?body:JSON.stringify(body)):undefined});
}
const id='fictional-visual-'+Date.now();
assert.equal((await request('/api/books',{method:'POST',owner:true,body:{id,title:'虚构图文检索测试',level:'public',pageCount:120,kind:'pdf',sourceHash:'a'.repeat(64),fileName:'fictional.pdf',fileSize:100}})).status,201);
assert.equal((await request(`/api/books/${id}/pages/120`,{method:'PUT',owner:true,body:{rawText:'',engine:'browser-ocr'}})).status,200);
// Header-only byte fixture checks R2 transport, not image interpretation; native vision has a separate real PNG test.
const bytes=new Uint8Array([255,216,255,217]);
assert.equal((await request(`/api/books/${id}/pages/120/image`,{method:'PUT',owner:true,binary:true,body:bytes})).status,200);
const path='/api/ai/visual/page?'+new URLSearchParams({book:id,page:120});
assert.equal((await request(path,{guest:true})).status,401);
const pageResponse=await request(path);assert.equal(pageResponse.status,200);const page=await pageResponse.json();assert.equal(page.imageReady,true);assert.equal(page.text,'');
assert.equal((await request('/api/ai/visual/image?'+new URLSearchParams({book:id,page:120,version:'stale'}))).status,409);
const image=await request('/api/ai/visual/image?'+new URLSearchParams({book:id,page:120,version:page.version}));assert.equal(image.status,200);assert.equal(image.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),bytes);
console.log('PASS: authenticated public page 120 with empty OCR remains available for image comparison; R2 bytes/version/no-store verified; no cloud AI calls.');
