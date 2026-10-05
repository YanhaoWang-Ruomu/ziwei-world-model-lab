import {HttpError,bodyBytes,digest,now,safeText} from './security.js';
const fail=(code,message)=>{throw new HttpError(code,message);};
const idPattern=/^[a-f0-9-]{36}$/;
export const fileLimit=10*1024*1024,totalLimit=30*1024*1024;
const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',md:'text/plain',csv:'text/csv',doc:'application/msword',xls:'application/vnd.ms-excel',ppt:'application/vnd.ms-powerpoint',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip'};
export function fileMetadata(name,bytes){
  if(typeof name!=='string'||!name.trim()||name.length>180||/[\\/\x00-\x1f\x7f]/.test(name))fail(400,'文件名无效。');
  const ext=name.split('.').at(-1).toLowerCase(),type=mime[ext];
  if(!type)fail(400,'不支持此文件格式，请选择常用图片、PDF、Office、文字或 ZIP 文件。');
  if(!bytes.length||bytes.length>fileLimit)fail(413,'每个文件需在 10 MB 以内。');
  const starts=(...values)=>values.every((v,i)=>bytes[i]===v),ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
  const valid=ext==='png'?starts(137,80,78,71,13,10,26,10):['jpg','jpeg'].includes(ext)?starts(255,216,255):ext==='gif'?['GIF87a','GIF89a'].includes(ascii(0,6)):ext==='webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':ext==='pdf'?ascii(0,5)==='%PDF-':['zip','docx','xlsx','pptx'].includes(ext)?starts(80,75,3,4)||starts(80,75,5,6):['doc','xls','ppt'].includes(ext)?starts(208,207,17,224,161,177,26,225):!bytes.includes(0);
  if(!valid)fail(400,'文件内容与扩展名不符，请重新选择。');
  return {name:name.trim(),type,size:bytes.length};
}
export function contentPayload(v,max){
  const format=v.format??'plain',attachments=v.attachments??[];
  if(!['plain','markdown'].includes(format)||!Array.isArray(attachments)||attachments.length>8||attachments.some(id=>typeof id!=='string'||!idPattern.test(id))||new Set(attachments).size!==attachments.length)fail(400,'文字格式或附件信息无效。');
  const body=safeText(v.body??'',max,false).trim();if(!body&&!attachments.length)fail(400,'请填写文字，或添加图片和附件。');
  return {body,format,attachments};
}
export const attachmentView=r=>({id:r.id,name:r.file_name,type:r.content_type,size:r.file_size});
export async function attachViews(db,kind,rows,convert){
  const byTarget=new Map();
  for(let i=0;i<rows.length;i+=50){const ids=rows.slice(i,i+50).map(r=>r.id);if(!ids.length)continue;const files=(await db.prepare(`SELECT id,file_name,content_type,file_size,target_id FROM community_attachments WHERE target_kind=? AND target_id IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at,id`).bind(kind,...ids).all()).results;
    for(const file of files){if(!byTarget.has(file.target_id))byTarget.set(file.target_id,[]);byTarget.get(file.target_id).push(attachmentView(file));}}
  return rows.map(row=>({...convert(row),format:row.format||'plain',attachments:byTarget.get(row.id)||[]}));
}
export async function attachmentConstraint(db,viewer,ids,existing=null){
  if(!ids.length)return {sql:'1=1',args:[]};
  const where=`user_id=? AND ((target_kind IS NULL AND created_at>?)${existing?' OR (target_kind=? AND target_id=?)':''}) AND id IN (${ids.map(()=>'?').join(',')})`;
  const sql=`SELECT COUNT(*) FROM community_attachments WHERE ${where}`;
  const args=[viewer.id,now()-86400,...(existing?[existing.kind,existing.id]:[]),...ids];
  const rows=(await db.prepare(`SELECT file_size FROM community_attachments WHERE ${where}`).bind(...args).all()).results;
  if(rows.length!==ids.length)fail(409,'附件已使用、已过期或不属于当前账户，请重新选择。');
  if(rows.reduce((s,r)=>s+r.file_size,0)>totalLimit)fail(413,'附件合计不能超过 30 MB。');
  return {sql:`(${sql})=?`,args:[...args,ids.length]};
}
export function attachStatement(db,kind,target,viewer,ids){
  if(!ids.length)return [];
  const table=kind==='post'?'community_posts':'community_comments';
  return [db.prepare(`UPDATE community_attachments SET target_kind=?,target_id=? WHERE user_id=? AND target_kind IS NULL AND id IN (${ids.map(()=>'?').join(',')}) AND EXISTS(SELECT 1 FROM ${table} WHERE id=? AND user_id=?)`).bind(kind,target,viewer.id,...ids,target,viewer.id)];
}
export async function attachmentRoute({path,method,request,env,db,viewer}){
  if(!path.startsWith('/api/community/attachments'))return null;
  const personal=()=>{if(!viewer.id)fail(401,'登录后才能添加图片或附件。');};
  if(path==='/api/community/attachments'&&method==='POST'){
    personal();let name;try{name=decodeURIComponent(request.headers.get('X-File-Name')||'');}catch{fail(400,'文件名无效。');}
    const bytes=await bodyBytes(request,fileLimit),meta=fileMetadata(name,bytes),id=crypto.randomUUID(),key='community/'+id,createdAt=now();
    const rows=(await db.prepare('SELECT id,object_key FROM community_attachments WHERE user_id=? AND target_kind IS NULL AND created_at<=? LIMIT 100').bind(viewer.id,createdAt-86400).all()).results;
    for(const stale of rows){const removed=await db.prepare('DELETE FROM community_attachments WHERE id=? AND user_id=? AND target_kind IS NULL AND created_at<=? RETURNING object_key').bind(stale.id,viewer.id,createdAt-86400).first();if(removed)await env.BUCKET.delete(removed.object_key);}
    const quota=await db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(file_size),0) AS size FROM community_attachments WHERE user_id=? AND created_at>?').bind(viewer.id,createdAt-86400).first();
    if(quota.count>=80||quota.size+meta.size>200*1024*1024)fail(429,'今天上传的附件较多，请明天再试。');
    await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:meta.type}});
    try{const row=await db.prepare('INSERT INTO community_attachments(id,user_id,file_name,content_type,file_size,object_key,sha256,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM community_attachments WHERE user_id=? AND created_at>?)<80 AND (SELECT COALESCE(SUM(file_size),0) FROM community_attachments WHERE user_id=? AND created_at>?)+?<=? RETURNING *').bind(id,viewer.id,meta.name,meta.type,meta.size,key,await digest(bytes),createdAt,viewer.id,createdAt-86400,viewer.id,createdAt-86400,meta.size,200*1024*1024).first();if(!row)fail(429,'今天上传的附件较多，请明天再试。');return {attachment:attachmentView(row)};}
    catch(e){await env.BUCKET.delete(key);throw e;}
  }
  const match=path.match(/^\/api\/community\/attachments\/([a-f0-9-]{36})$/);if(!match)fail(404,'找不到附件。');
  const file=await db.prepare('SELECT * FROM community_attachments WHERE id=?').bind(match[1]).first();if(!file)fail(404,'找不到附件。');
  if(method==='DELETE'){personal();const removed=await db.prepare('DELETE FROM community_attachments WHERE id=? AND user_id=? AND target_kind IS NULL RETURNING object_key').bind(file.id,viewer.id).first();if(!removed)fail(409,'只能移除本账户尚未提交的附件。');await env.BUCKET.delete(removed.object_key);return {ok:true};}
  if(!['GET','HEAD'].includes(method))fail(405,'不支持此操作。');
  let allowed=file.user_id===viewer.id;
  if(file.target_kind==='post'){const p=await db.prepare('SELECT user_id,status FROM community_posts WHERE id=?').bind(file.target_id).first();allowed=Boolean(p&&(p.status==='published'||p.user_id===viewer.id||viewer.core));}
  else if(file.target_kind==='comment'){const c=await db.prepare('SELECT c.user_id,c.status,p.user_id AS post_owner,p.status AS post_status FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.id=?').bind(file.target_id).first();allowed=Boolean(c&&(c.post_status==='published'||c.post_owner===viewer.id||viewer.core)&&(c.status==='published'||c.user_id===viewer.id||viewer.core));}
  if(!allowed)fail(404,'附件尚未公开或没有访问权限。');
  const object=method==='HEAD'?await env.BUCKET.head(file.object_key):await env.BUCKET.get(file.object_key);if(!object)fail(404,'附件暂时无法读取，请稍后重试。');
  const image=file.content_type.startsWith('image/');
  return new Response(method==='HEAD'?null:object.body,{headers:{'Content-Type':file.content_type,'Content-Length':String(file.file_size),'Content-Disposition':`${image?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
}
