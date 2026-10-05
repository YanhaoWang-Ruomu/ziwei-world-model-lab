import {HttpError,jsonBody,now} from './security.js';
import {normalizeSettings} from '../src/chart-conventions.mjs';
export const presentPreferences=row=>({defaultCaseId:row.default_case_id,autoOpen:Boolean(row.auto_open),defaultSettings:row.default_settings?JSON.parse(row.default_settings):null,revision:row.revision});
export async function preferencesFor(db,userId) {
  await db.prepare('INSERT INTO chart_preferences(user_id,updated_at) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING').bind(userId,now()).run();
  return db.prepare('SELECT * FROM chart_preferences WHERE user_id=?').bind(userId).first();
}
export function bumpPreferences(db,userId) {return db.prepare('UPDATE chart_preferences SET revision=revision+1,updated_at=? WHERE user_id=?').bind(now(),userId);}
export function validatedSettings(value) {try{return normalizeSettings(value);}catch(e){throw new HttpError(400,e.message);}}
const profile=row=>({id:row.id,name:row.name,settings:JSON.parse(row.settings),revision:row.revision,updatedAt:row.updated_at});
const known=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
export async function chartPreferencesRoute({path,method,request,db,viewer}) {
  if(path!=='/api/chart-preferences'&&path!=='/api/chart-profiles'&&!path.startsWith('/api/chart-profiles/'))return null;
  if(!viewer.id)throw new HttpError(401,'请先登录个人账户，再保存自己的命盘与安星方案。');
  if(path==='/api/chart-preferences') {
    const current=await preferencesFor(db,viewer.id);
    if(method==='GET')return {preferences:presentPreferences(current)};
    if(method==='PUT') {
      const body=await jsonBody(request,4096);
      if(!known(body,['revision','defaultCaseId','autoOpen','defaultSettings'])||!Number.isInteger(body.revision)||typeof body.autoOpen!=='boolean'||!(body.defaultCaseId===null||typeof body.defaultCaseId==='string'))throw new HttpError(400,'请核对默认命盘设置。');
      if(body.autoOpen&&!body.defaultCaseId)throw new HttpError(400,'请先选择一份默认命盘。');
      if(body.defaultCaseId&&!await db.prepare('SELECT id FROM chart_cases WHERE id=? AND user_id=?').bind(body.defaultCaseId,viewer.id).first())throw new HttpError(404,'找不到这份个人命例。');
      const settings=body.defaultSettings===null?null:validatedSettings(body.defaultSettings);
      const row=await db.prepare('UPDATE chart_preferences SET default_case_id=?,auto_open=?,default_settings=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(body.defaultCaseId,body.autoOpen?1:0,settings?JSON.stringify(settings):null,now(),viewer.id,body.revision).run();
      if(!row.meta.changes)throw new HttpError(409,'设置已在另一页面更新，请刷新后再保存。');
      return {preferences:presentPreferences(await preferencesFor(db,viewer.id))};
    }
  }
  if(path==='/api/chart-profiles') {
    if(method==='GET')return {profiles:(await db.prepare('SELECT * FROM chart_profiles WHERE user_id=? ORDER BY updated_at DESC,id').bind(viewer.id).all()).results.map(profile)};
    if(method==='POST') {
      const body=await jsonBody(request,4096);
      if(!known(body,['name','settings'])||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>40)throw new HttpError(400,'请填写 1–40 字的方案名称。');
      const settings=validatedSettings(body.settings),t=now();
      const row=await db.prepare('INSERT INTO chart_profiles(id,user_id,name,settings,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM chart_profiles WHERE user_id=?)<50 RETURNING *').bind(crypto.randomUUID(),viewer.id,body.name.trim(),JSON.stringify(settings),t,t,viewer.id).first();
      if(!row)throw new HttpError(409,'最多保存 50 份方案，请先整理已有方案。');
      return {profile:profile(row)};
    }
  }
  const match=path.match(/^\/api\/chart-profiles\/([a-f0-9-]{36})$/);
  if(match) {
    const row=await db.prepare('SELECT * FROM chart_profiles WHERE id=? AND user_id=?').bind(match[1],viewer.id).first();
    if(!row)throw new HttpError(404,'找不到这份安星方案。');
    if(method==='DELETE') {await db.prepare('DELETE FROM chart_profiles WHERE id=? AND user_id=?').bind(row.id,viewer.id).run();return {ok:true};}
    if(method==='PUT') {
      const body=await jsonBody(request,4096);
      if(!known(body,['name','settings','revision'])||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>40||!Number.isInteger(body.revision))throw new HttpError(400,'方案资料不完整。');
      const settings=validatedSettings(body.settings);
      const changed=await db.prepare('UPDATE chart_profiles SET name=?,settings=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING *').bind(body.name.trim(),JSON.stringify(settings),now(),row.id,viewer.id,body.revision).first();
      if(!changed)throw new HttpError(409,'方案已在另一页面更新，请重新打开。');
      return {profile:profile(changed)};
    }
  }
  throw new HttpError(405,'此设置操作不支持。');
}
