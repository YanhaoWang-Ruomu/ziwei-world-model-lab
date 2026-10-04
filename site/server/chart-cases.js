import {now,jsonBody,HttpError} from './security.js';
import {normalizeBirth} from '../src/chart-engine.mjs';
export function casePayload(data){
  if(!data||Array.isArray(data)||Object.keys(data).some(k=>!['title','birth','provider'].includes(k)))throw new HttpError(400,'命例资料格式不正确。');
  const title=typeof data.title==='string'?data.title.trim():'';
  if(!title||title.length>60)throw new HttpError(400,'请填写 1–60 字的命例名称。');
  const keys=['name','date','time','gender','dayDivide','fixLeap','daylight'],birth=data.birth;
  if(!birth||Array.isArray(birth)||Object.keys(birth).some(k=>!keys.includes(k))||typeof birth.name!=='string'||birth.name.length>40)throw new HttpError(400,'出生资料格式不正确。');
  try{normalizeBirth(birth);}catch{throw new HttpError(400,'请核对出生日期、时间、性别与排盘口径。');}
  if(!['public','ruomu-server'].includes(data.provider))throw new HttpError(400,'请选择有效的安星方法。');
  return {title,birth:Object.fromEntries(keys.map(k=>[k,birth[k]])),provider:data.provider};
}
const present=row=>({id:row.id,title:row.title,birth:JSON.parse(row.birth),provider:row.provider,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at});
export async function casesRoute({path,method,request,db,viewer}){
  if(path!=='/api/cases'&&!path.startsWith('/api/cases/'))return null;
  if(!viewer.id)throw new HttpError(401,'请先登录个人账户，再保存或查看自己的命例。特殊共享密钥不作为个人账户。');
  if(path==='/api/cases'){
    if(method==='GET')return {cases:(await db.prepare('SELECT * FROM chart_cases WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 300').bind(viewer.id).all()).results.map(present)};
    if(method==='POST'){
      const data=casePayload(await jsonBody(request,4096)),id=crypto.randomUUID(),t=now();
      const row=await db.prepare('INSERT INTO chart_cases(id,user_id,title,birth,provider,revision,created_at,updated_at) SELECT ?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM chart_cases WHERE user_id=?)<300 RETURNING *').bind(id,viewer.id,data.title,JSON.stringify(data.birth),data.provider,t,t,viewer.id).first();
      if(!row)throw new HttpError(409,'命例已达 300 份，请先整理不再需要的记录。');
      return {case:present(row)};
    }
  }
  const match=path.match(/^\/api\/cases\/([a-f0-9-]{36})$/);
  if(match){
    const row=await db.prepare('SELECT * FROM chart_cases WHERE id=? AND user_id=?').bind(match[1],viewer.id).first();
    if(!row)throw new HttpError(404,'找不到这份命例。');
    if(method==='GET')return {case:present(row)};
    if(method==='DELETE'){
      await db.prepare('DELETE FROM chart_cases WHERE id=? AND user_id=?').bind(row.id,viewer.id).run();return {ok:true};
    }
    if(method==='PUT'){
      const body=await jsonBody(request,4096),{revision,...input}=body||{};
      if(!Number.isInteger(revision))throw new HttpError(400,'请重新打开命例后再保存。');
      const data=casePayload(input);
      const updated=await db.prepare('UPDATE chart_cases SET title=?,birth=?,provider=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING *').bind(data.title,JSON.stringify(data.birth),data.provider,now(),row.id,viewer.id,revision).first();
      if(!updated)throw new HttpError(409,'这份命例已在另一页面修改，请重新打开，或另存一份。');
      return {case:present(updated)};
    }
  }
  throw new HttpError(405,'此命例操作不支持。');
}
