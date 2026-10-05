import {now,jsonBody,HttpError} from './security.js';
import {normalizeBirth} from '../src/chart-engine.mjs';
import {REMOTE_PROVIDER,defaultSettings} from '../src/chart-conventions.mjs';
import {preferencesFor,presentPreferences,bumpPreferences,validatedSettings,chartPreferencesRoute} from './chart-preferences.mjs';
import {caseTransferRoute} from './chart-case-transfer.mjs';
export function casePayload(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['title','birth','provider','settings'].includes(k)))throw new HttpError(400,'命例资料格式不正确。');
  const title=typeof data.title==='string'?data.title.trim():'';
  if(!title||title.length>60)throw new HttpError(400,'请填写 1–60 字的命例名称。');
  const keys=['name','date','time','gender','dayDivide','fixLeap','daylight'],birth=data.birth;
  if(!birth||Array.isArray(birth)||Object.keys(birth).some(k=>!keys.includes(k))||typeof birth.name!=='string'||birth.name.length>40)throw new HttpError(400,'出生资料格式不正确。');
  try{normalizeBirth(birth);}catch{throw new HttpError(400,'请核对出生日期、时间、性别与排盘口径。');}
  if(!['public',REMOTE_PROVIDER].includes(data.provider))throw new HttpError(400,'请选择有效的安星方法。');
  const settings=data.provider==='public'?validatedSettings(data.settings||defaultSettings(birth)):null;
  if(data.provider!=='public'&&data.settings)throw new HttpError(400,'自定义安星方案需使用公开算法。');
  if(settings&&(settings.options.dayDivide!==birth.dayDivide||settings.options.fixLeap!==birth.fixLeap))throw new HttpError(400,'命例与安星方案的口径不一致。');
  return {title,birth:Object.fromEntries(keys.map(k=>[k,birth[k]])),provider:data.provider,settings};
}
export const presentCase=row=>({id:row.id,...casePayload({title:row.title,birth:JSON.parse(row.birth),provider:row.provider,settings:row.settings?JSON.parse(row.settings):null}),revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at});
export async function casesRoute(context){
  const preferenceResult=await chartPreferencesRoute(context);if(preferenceResult!==null)return preferenceResult;
  const {path,method,request,db,viewer}=context;
  if(path!=='/api/cases'&&!path.startsWith('/api/cases/'))return null;
  if(!viewer.id)throw new HttpError(401,'请先登录个人账户，再保存或查看自己的命例。特殊共享密钥不作为个人账户。');
  const pref=await preferencesFor(db,viewer.id);
  const transfer=await caseTransferRoute({...context,pref});if(transfer!==null)return transfer;
  if(path==='/api/cases'){
    if(method==='GET')return {cases:(await db.prepare('SELECT * FROM chart_cases WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 300').bind(viewer.id).all()).results.map(presentCase),preferences:presentPreferences(pref)};
    if(method==='POST'){
      const data=casePayload(await jsonBody(request,8192)),id=crypto.randomUUID(),t=now();
      const rows=await db.batch([bumpPreferences(db,viewer.id),db.prepare('INSERT INTO chart_cases(id,user_id,title,birth,provider,settings,revision,created_at,updated_at) SELECT ?,?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM chart_cases WHERE user_id=?)<300 RETURNING *').bind(id,viewer.id,data.title,JSON.stringify(data.birth),data.provider,data.settings?JSON.stringify(data.settings):null,t,t,viewer.id)]);
      const row=rows[1].results[0];
      if(!row)throw new HttpError(409,'命例已达 300 份，请先整理不再需要的记录。');
      return {case:presentCase(row)};
    }
  }
  const match=path.match(/^\/api\/cases\/([a-f0-9-]{36})$/);
  if(match){
    const row=await db.prepare('SELECT * FROM chart_cases WHERE id=? AND user_id=?').bind(match[1],viewer.id).first();
    if(!row)throw new HttpError(404,'找不到这份命例。');
    if(method==='GET')return {case:presentCase(row)};
    if(method==='DELETE'){
      await db.batch([db.prepare('UPDATE chart_preferences SET default_case_id=CASE WHEN default_case_id=? THEN NULL ELSE default_case_id END,auto_open=CASE WHEN default_case_id=? THEN 0 ELSE auto_open END,revision=revision+1,updated_at=? WHERE user_id=?').bind(row.id,row.id,now(),viewer.id),db.prepare('DELETE FROM chart_cases WHERE id=? AND user_id=?').bind(row.id,viewer.id)]);return {ok:true};
    }
    if(method==='PUT'){
      const body=await jsonBody(request,8192),{revision,...input}=body||{};
      if(!Number.isInteger(revision))throw new HttpError(400,'请重新打开命例后再保存。');
      const data=casePayload(input);
      const rows=await db.batch([bumpPreferences(db,viewer.id),db.prepare('UPDATE chart_cases SET title=?,birth=?,provider=?,settings=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING *').bind(data.title,JSON.stringify(data.birth),data.provider,data.settings?JSON.stringify(data.settings):null,now(),row.id,viewer.id,revision)]);
      const updated=rows[1].results[0];
      if(!updated)throw new HttpError(409,'这份命例已在另一页面修改，请重新打开，或另存一份。');
      return {case:presentCase(updated)};
    }
  }
  throw new HttpError(405,'此命例操作不支持。');
}
