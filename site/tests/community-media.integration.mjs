// Uses only the isolated fictional store. Never point this at a user or production service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:8770',tag='media-'+Date.now(),a='local_preview_subject='+tag+'-a',b='local_preview_subject='+tag+'-b',core='local_preview_owner=1';
let checks=0;const eq=(x,y)=>{assert.deepEqual(x,y);checks++;};
async function request(path,{cookie='',method='GET',body,headers={},raw=false}={}){
  const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,...(body instanceof Uint8Array?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)});
  return {status:r.status,headers:r.headers,data:raw?new Uint8Array(await r.arrayBuffer()):await r.json()};
}
const upload=(name,bytes,cookie=a)=>request('/api/community/attachments',{cookie,method:'POST',body:bytes,headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(name)}});
const decide=(kind,id,revision,decision='published')=>request('/api/community/moderation',{cookie:core,method:'POST',body:{kind,id,revision,decision,reason:'虚构媒体审核'}});
const postBody=(attachments=[],body='**虚构粗体**\n\n- 合成项目\n\n[示例链接](https://example.test)')=>({title:'虚构媒体讨论 '+tag,body,format:'markdown',attachments,kind:'case',tags:[tag],sharingConfirmed:true});
const bytes=new TextEncoder().encode('只含虚构测试内容。'),png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfLAAAAAASUVORK5CYII=','base64'));
eq((await request('/api/storage')).data.testStore,true);
if(process.argv.includes('verify')){
  const saved=JSON.parse(fs.readFileSync(new URL('../.wrangler/persistence-test/community-media-checkpoint.json',import.meta.url),'utf8'));
  const read=await request('/api/community/posts/'+saved.postId);eq(read.status,200);eq(read.data.post.format,'markdown');eq(read.data.comments.some(c=>c.id===saved.commentId&&c.attachments.length===1),true);
  eq((await request('/api/community/attachments/'+saved.fileId,{raw:true})).data,png);
  console.log('PASS '+checks+' media restart-persistence checks');process.exit(0);
}
eq((await upload('虚构.txt',bytes,'')).status,401);
eq((await upload('伪图.png',bytes)).status,400);
eq((await upload('不允许.svg',bytes)).status,400);
const first=await upload('虚构.txt',bytes);eq(first.status,200);const fid=first.data.attachment.id;
eq(Object.keys(first.data.attachment).sort(),['id','name','size','type']);
eq((await request('/api/community/attachments/'+fid,{raw:true})).status,404);
eq((await request('/api/community/attachments/'+fid,{cookie:b,raw:true})).status,404);
eq((await request('/api/community/attachments/'+fid,{cookie:a,raw:true})).data,bytes);
eq((await request('/api/community/posts',{cookie:b,method:'POST',body:postBody([fid])})).status,409);
const submitted=await request('/api/community/posts',{cookie:a,method:'POST',body:postBody([fid])});eq(submitted.status,200);const pid=submitted.data.post.id;
eq(submitted.data.post.attachments[0].id,fid);eq(submitted.data.post.format,'markdown');
eq((await request('/api/community/attachments/'+fid,{raw:true})).status,404);
eq((await request('/api/community/attachments/'+fid,{cookie:core,raw:true})).status,200);
eq((await request('/api/community/attachments/'+fid,{cookie:a,method:'DELETE'})).status,409);
eq((await request('/api/community/posts',{cookie:a,method:'POST',body:postBody([fid])})).status,409);
eq((await decide('post',pid,1)).status,200);
let read=await request('/api/community/posts/'+pid);eq(read.data.post.attachments[0].id,fid);eq(read.data.post.format,'markdown');
const file=await request('/api/community/attachments/'+fid,{raw:true});eq(file.status,200);eq(file.data,bytes);eq(file.headers.get('X-Content-Type-Options'),'nosniff');assert.match(file.headers.get('Content-Disposition'),/^attachment/);checks++;
eq((await request('/api/community/posts/'+pid+'/comments',{method:'POST',body:{body:'不允许匿名',sharingConfirmed:true}})).status,401);
const image=await upload('虚构图片.png',png,b);eq(image.status,200);const imgid=image.data.attachment.id;
eq((await request('/api/community/posts/'+pid+'/comments',{cookie:b,method:'POST',body:{body:'虚构',format:'html',sharingConfirmed:true}})).status,400);
const comment=await request('/api/community/posts/'+pid+'/comments',{cookie:b,method:'POST',body:{body:'## 虚构评论\n\n**排版**\n\n> 引用',format:'markdown',attachments:[imgid],sharingConfirmed:true}});eq(comment.status,200);const cid=comment.data.comment.id;
eq((await request('/api/community/posts/'+pid)).data.comments.length,0);
eq((await request('/api/community/posts/'+pid,{cookie:b})).data.comments[0].attachments[0].id,imgid);
eq((await request('/api/community/attachments/'+imgid,{raw:true})).status,404);
eq((await request('/api/community/attachments/'+imgid,{cookie:a,raw:true})).status,404);
eq((await request('/api/community/moderation/target?comment='+cid,{cookie:a})).status,403);
const target=await request('/api/community/moderation/target?comment='+cid,{cookie:core});eq(target.data.postId,pid);eq(target.data.comment.attachments[0].id,imgid);
eq((await request('/api/community/moderation/target?post='+pid,{cookie:core})).data.post.id,pid);
const queue=await request('/api/community/moderation',{cookie:core});eq(queue.data.comments.find(c=>c.id===cid).format,'markdown');
eq((await decide('comment',cid,1)).status,200);
read=await request('/api/community/posts/'+pid);eq(read.data.comments[0].attachments[0].id,imgid);
const imageRead=await request('/api/community/attachments/'+imgid,{raw:true});eq(imageRead.data,png);eq(imageRead.headers.get('Content-Type'),'image/png');assert.match(imageRead.headers.get('Content-Disposition'),/^inline/);checks++;
const disposable=await upload('虚构移除.txt',bytes);eq((await request('/api/community/attachments/'+disposable.data.attachment.id,{cookie:b,method:'DELETE'})).status,409);eq((await request('/api/community/attachments/'+disposable.data.attachment.id,{cookie:a,method:'DELETE'})).status,200);eq((await request('/api/community/attachments/'+disposable.data.attachment.id,{cookie:a,raw:true})).status,404);
const raceFile=await upload('虚构竞争.txt',bytes);const concurrent=await Promise.all([1,2].map(()=>request('/api/community/posts',{cookie:a,method:'POST',body:postBody([raceFile.data.attachment.id],'')})));eq(concurrent.map(x=>x.status).sort(),[200,409]);
const withdrawn=concurrent.find(x=>x.status===200).data.post;eq((await decide('post',withdrawn.id,1)).status,200);eq((await request('/api/community/posts/'+withdrawn.id,{cookie:a,method:'DELETE',body:{revision:2}})).status,200);eq((await request('/api/community/attachments/'+raceFile.data.attachment.id,{raw:true})).status,404);
eq((await request('/api/community/posts',{cookie:b,method:'POST',body:{...postBody(),format:'html'}})).status,400);
fs.writeFileSync(new URL('../.wrangler/persistence-test/community-media-checkpoint.json',import.meta.url),JSON.stringify({postId:pid,commentId:cid,fileId:imgid}));
console.log('PASS '+checks+' rich content, attachments, login, moderation, ownership and concurrent-submit checks');
