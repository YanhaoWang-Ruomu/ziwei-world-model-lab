import {now,jsonBody,HttpError} from './security.js';
import {casePayload,presentCase} from './chart-cases.js';
import {defaultSettings} from '../src/chart-conventions.mjs';
import {preferencesFor,presentPreferences} from './chart-preferences.mjs';
const birthKeys=['name','date','time','gender','dayDivide','fixLeap','daylight'];
const snapshot=record=>casePayload(Object.fromEntries(['title','birth','provider','settings'].map(k=>[k,record[k]])));
const key=record=>JSON.stringify(snapshot(record));
export function normalizeCaseBundle(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'请选择观星台导出的命例文件。');
  if(value.kind==='ziwei_natal_chart'&&value.schemaVersion===1) {
    const input=value.input||{},provider=value.provider==='public-browser'?'public':value.provider;
    const settings=provider==='public'?(input.settings||{...defaultSettings(input),options:{...defaultSettings(input).options,...Object.fromEntries(['yearDivide','horoscopeDivide','ageDivide','dayDivide','algorithm'].filter(k=>value.convention?.[k]!==undefined).map(k=>[k,value.convention[k]]))}}):null;
    return {kind:'guanxingtai_cases',version:1,records:[casePayload({title:input.name||'导入的命盘',birth:Object.fromEntries(birthKeys.map(k=>[k,input[k]])),provider,settings})],defaultIndex:null,autoOpen:false};
  }
  if(value.kind!=='guanxingtai_cases'||value.version!==1||!Array.isArray(value.records)||!value.records.length||value.records.length>300)throw new HttpError(400,'文件格式或版本不支持；每次可导入 1–300 份观星台命例。');
  const records=value.records.map(casePayload),defaultIndex=value.defaultIndex??null;
  if(defaultIndex!==null&&(!Number.isInteger(defaultIndex)||defaultIndex<0||defaultIndex>=records.length))throw new HttpError(400,'文件中的默认命盘索引无效。');
  return {kind:'guanxingtai_cases',version:1,records,defaultIndex,autoOpen:Boolean(value.autoOpen)&&defaultIndex!==null};
}
export function planCaseImport(bundle,existing) {
  const saved=new Set(existing.map(key)),seen=new Set();let added=0;
  const entries=bundle.records.map(record=>{const k=key(record),status=saved.has(k)?'existing':seen.has(k)?'duplicate':'new';seen.add(k);if(status==='new')added++;return {record,status};});
  return {entries,added,skipped:entries.length-added};
}
async function recordsFor(db,id){return (await db.prepare('SELECT * FROM chart_cases WHERE user_id=? ORDER BY created_at,id').bind(id).all()).results.map(presentCase);}
function insertions(db,userId,records,ids=records.map(()=>crypto.randomUUID())) {const t=now(),statements=[];for(let i=0;i<records.length;i+=10){const group=records.slice(i,i+10);statements.push(db.prepare('INSERT INTO chart_cases(id,user_id,title,birth,provider,settings,revision,created_at,updated_at) VALUES '+group.map(()=>'(?,?,?,?,?,?,1,?,?)').join(',')).bind(...group.flatMap((data,j)=>[ids[i+j],userId,data.title,JSON.stringify(data.birth),data.provider,data.settings?JSON.stringify(data.settings):null,t,t])));}return statements;}
export async function caseTransferRoute({path,method,request,db,viewer,pref}) {
  if(path==='/api/cases/export'&&method==='GET') {
    const id=new URL(request.url).searchParams.get('id');
    let records=await recordsFor(db,viewer.id);if(id)records=records.filter(r=>r.id===id);
    if(!records.length)throw new HttpError(404,'没有可导出的命例。');
    const index=records.findIndex(r=>r.id===pref.default_case_id);
    return {kind:'guanxingtai_cases',version:1,exportedAt:new Date().toISOString(),records:records.map(snapshot),defaultIndex:index<0?null:index,autoOpen:Boolean(pref.auto_open)&&index>=0};
  }
  if(!['/api/cases/import-preview','/api/cases/import'].includes(path)||method!=='POST')return null;
  const body=await jsonBody(request,2*1024*1024),bundle=normalizeCaseBundle(body?.bundle),existing=await recordsFor(db,viewer.id),plan=planCaseImport(bundle,existing);
  if(path.endsWith('import-preview'))return {revision:pref.revision,total:existing.length,...plan};
  if(!['merge','restore'].includes(body.mode)||!Number.isInteger(body.revision))throw new HttpError(400,'请先预览导入内容并选择导入方式。');
  if(body.revision!==pref.revision)throw new HttpError(409,'命例库已发生变化，请重新预览导入。');
  const restoring=body.mode==='restore';
  if(restoring&&body.confirmRestore!==true)throw new HttpError(400,'整库恢复会替换本账户命例，请先备份并明确确认。');
  if(!restoring&&existing.length+plan.added>300)throw new HttpError(409,'合并后会超过 300 份命例，请先整理命例库。');
  // D1 batches are atomic; a failed NOT NULL guard rolls back every statement.
  const statements=[db.prepare('UPDATE chart_preferences SET revision=CASE WHEN revision=? THEN revision+1 ELSE NULL END,updated_at=? WHERE user_id=?').bind(body.revision,now(),viewer.id)];
  let imported=0;
  if(restoring) {
    statements.push(db.prepare('DELETE FROM chart_cases WHERE user_id=?').bind(viewer.id));
    const ids=bundle.records.map(()=>crypto.randomUUID());
    statements.push(...insertions(db,viewer.id,bundle.records,ids));imported=ids.length;
    statements.push(db.prepare('UPDATE chart_preferences SET default_case_id=?,auto_open=? WHERE user_id=?').bind(bundle.defaultIndex===null?null:ids[bundle.defaultIndex],bundle.autoOpen?1:0,viewer.id));
  } else {const additions=plan.entries.filter(entry=>entry.status==='new').map(entry=>entry.record);statements.push(...insertions(db,viewer.id,additions));imported=additions.length;}
  try{await db.batch(statements);}catch{throw new HttpError(409,'导入未完成，现有命例没有被部分替换。请刷新后重新预览。');}
  return {imported,skipped:restoring?0:plan.skipped,preferences:presentPreferences(await preferencesFor(db,viewer.id))};
}
