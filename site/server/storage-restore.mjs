import {HttpError,jsonBody,now,digest} from './security.js';
const q=name=>'"'+name+'"';
export function backupAssets(table,row){
  if(table==='books'&&row.file_ready)return [`books/${row.id}/original`];
  if(table==='pages'&&row.image_ready)return [`books/${row.book_id}/page-${row.page}.jpg`];
  if(table==='community_attachments')return [row.object_key];
  return [];
}
function summary(job,manifest){return {id:job.id,state:job.state,prepared:job.cursor,total:manifest.files.length,filesPrepared:job.asset_cursor,filesTotal:job.assets?JSON.parse(job.assets).length:null,counts:manifest.counts,createdAt:manifest.createdAt,mode:'missing-only',legacy:manifest.format===1};}
export function validateManifest(value,id,tables){
  if(!value||![1,2].includes(value.format)||value.id!==id||!Array.isArray(value.files)||!value.counts||typeof value.counts!=='object'||Array.isArray(value.counts)||value.files.some(f=>!f||!tables.includes(f.table)||typeof f.key!=='string'||!f.key.startsWith('backups/'+id+'/')||!Number.isInteger(f.count)||f.count<1||f.count>80||!Object.hasOwn(value.counts,f.table))||new Set(value.files.map(f=>f.key)).size!==value.files.length)throw new HttpError(400,'备份清单不完整或版本不支持。');
  for(const [table,count]of Object.entries(value.counts)){if(!tables.includes(table)||!Number.isInteger(count)||count<0||value.files.filter(f=>f.table===table).reduce((n,f)=>n+f.count,0)!==count)throw new HttpError(400,'备份记录数量不完整。');}
  if(value.format===2&&(!Array.isArray(value.assets)||value.assets.some(a=>!a||typeof a.key!=='string'||!(/^(books|community)\//.test(a.key))||!/^backups\/assets\/[a-f0-9]{64}$/.test(a.savedKey)||!Number.isSafeInteger(a.size)||a.size<0)||new Set(value.assets.map(a=>a.key)).size!==value.assets.length))throw new HttpError(400,'原文件备份清单不正确。');
  return value;
}
async function columns(db,table){return (await db.prepare(`PRAGMA table_info(${q(table)})`).all()).results;}
export async function restoreRoute({path,method,request,db,viewer,env,tables}){
  if(!viewer.founder)throw new HttpError(403,'完整备份恢复仅由创建者本人操作。');
  const owner=viewer.actor||viewer.id;
  if(path==='/api/storage/restore'&&method==='GET')return {jobs:(await db.prepare("SELECT id,state,created_at FROM storage_restore_jobs WHERE owner=? AND state<>'done' ORDER BY created_at DESC LIMIT 10").bind(owner).all()).results};
  if(path==='/api/storage/restore'&&method==='POST'){
    const data=await jsonBody(request,2048),backup=await db.prepare('SELECT manifest_key FROM storage_backups WHERE id=?').bind(String(data.backupId||'')).first();if(!backup)throw new HttpError(404,'未找到这份备份。');
    const object=await env.BUCKET.get(backup.manifest_key);if(!object)throw new HttpError(409,'备份清单暂不可读。');
    const manifest=validateManifest(await object.json(),data.backupId,tables),id=crypto.randomUUID();
    await db.prepare('INSERT INTO storage_restore_jobs(id,owner,backup_id,manifest,created_at) VALUES (?,?,?,?,?)').bind(id,owner,data.backupId,JSON.stringify(manifest),now()).run();return summary({id,state:'preparing',cursor:0,asset_cursor:0},manifest);
  }
  const match=/^\/api\/storage\/restore\/([a-f0-9-]{36})(?:\/(prepare|commit))?$/.exec(path);if(!match)throw new HttpError(404,'恢复任务不存在。');
  const job=await db.prepare('SELECT * FROM storage_restore_jobs WHERE id=? AND owner=?').bind(match[1],owner).first();if(!job)throw new HttpError(404,'恢复任务不存在。');
  const manifest=validateManifest(JSON.parse(job.manifest),job.backup_id,tables);
  if(method==='GET'&&!match[2])return summary(job,manifest);
  if(method==='DELETE'&&!match[2]){await db.prepare('DELETE FROM storage_restore_jobs WHERE id=? AND owner=?').bind(job.id,owner).run();return {cancelled:true};}
  if(method!=='POST')throw new HttpError(405,'不支持此恢复操作。');
  if(match[2]==='prepare'){
    if(job.state!=='preparing')return summary(job,manifest);
    const file=manifest.files[job.cursor];
    if(file){const object=await env.BUCKET.get(file.key);if(!object)throw new HttpError(409,'备份分卷暂不可读，未改变现有记录。');const raw=await object.text();if(file.checksum&&await digest(raw)!==file.checksum)throw new HttpError(409,'备份分卷校验失败。');
      const rows=JSON.parse(raw),names=(await columns(db,file.table)).map(c=>c.name);if(!Array.isArray(rows)||rows.length!==file.count||rows.some(r=>!r||Array.isArray(r)||typeof r!=='object'||Object.keys(r).some(k=>!names.includes(k))))throw new HttpError(400,'备份字段不兼容。');
      const start=manifest.files.slice(0,job.cursor).filter(f=>f.table===file.table).reduce((n,f)=>n+f.count,0);
      await db.batch([...rows.map((row,i)=>db.prepare('INSERT INTO storage_restore_rows(job_id,table_name,ordinal,payload) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(job.id,file.table,start+i,JSON.stringify(row))),db.prepare('UPDATE storage_restore_jobs SET cursor=cursor+1 WHERE id=? AND cursor=?').bind(job.id,job.cursor)]);job.cursor++;return summary(job,manifest);
    }
    if(!job.assets){
      const refs=new Set();for(const table of ['books','pages','community_attachments']){let offset=0;while(true){const rows=(await db.prepare('SELECT payload FROM storage_restore_rows WHERE job_id=? AND table_name=? ORDER BY ordinal LIMIT 80 OFFSET ?').bind(job.id,table,offset).all()).results;if(!rows.length)break;for(const row of rows)for(const key of backupAssets(table,JSON.parse(row.payload)))refs.add(key);offset+=rows.length;}}
      const snapshots=new Map((manifest.assets||[]).map(a=>[a.key,a]));job.assets=JSON.stringify([...refs].map(key=>({key,...snapshots.get(key)})));await db.prepare('UPDATE storage_restore_jobs SET assets=? WHERE id=?').bind(job.assets,job.id).run();
    }
    const assets=JSON.parse(job.assets),asset=assets[job.asset_cursor];
    if(asset){const current=await env.BUCKET.head(asset.key);if(!current){if(!asset.savedKey)throw new HttpError(409,'旧备份未包含这份原文件，请先补回原文件；现有记录未改变。');const saved=await env.BUCKET.get(asset.savedKey);if(!saved||saved.size!==asset.size)throw new HttpError(409,'备份原文件缺失或不完整。');await env.BUCKET.put(asset.key,saved.body,{httpMetadata:saved.httpMetadata,onlyIf:new Headers({'If-None-Match':'*'})});}await db.prepare('UPDATE storage_restore_jobs SET asset_cursor=asset_cursor+1 WHERE id=? AND asset_cursor=?').bind(job.id,job.asset_cursor).run();job.asset_cursor++;return summary(job,manifest);}
    for(const [table,count]of Object.entries(manifest.counts)){const actual=await db.prepare('SELECT COUNT(*) AS n FROM storage_restore_rows WHERE job_id=? AND table_name=?').bind(job.id,table).first();if(actual.n!==count)throw new HttpError(409,'准备记录不完整，请重新建立恢复任务。');}
    await db.prepare("UPDATE storage_restore_jobs SET state='ready' WHERE id=?").bind(job.id).run();job.state='ready';return summary(job,manifest);
  }
  if(match[2]==='commit'){
    const data=await jsonBody(request,2048);if(data.confirmed!==true||data.mode!=='missing-only')throw new HttpError(400,'请确认仅补回缺失记录；现有记录不会覆盖。');if(job.state==='done')return {restored:true,alreadyDone:true};if(job.state!=='ready')throw new HttpError(409,'请先完成全部备份检查。');
    const statements=[db.prepare('PRAGMA defer_foreign_keys=ON'),db.prepare('UPDATE storage_restore_jobs SET history_max=(SELECT COALESCE(MAX(id),0) FROM technique_history) WHERE id=?').bind(job.id)];
    for(const table of tables.filter(t=>manifest.counts[t]>0&&t!=='technique_history')){
      const fields=await columns(db,table),names=fields.map(c=>q(c.name)),expressions=fields.map(c=>c.name==='upload_id'?'NULL':`CASE WHEN json_type(payload,'$.${c.name}') IS NULL THEN ${c.dflt_value??'NULL'} ELSE json_extract(payload,'$.${c.name}') END`);
      // An existing username with a different account ID is not the same owner.
      // Abort the entire transaction instead of silently assigning orphaned records.
      const conflict=table==='personal_accounts'?'(id)':'';
      statements.push(db.prepare(`INSERT INTO ${q(table)} (${names}) SELECT ${expressions} FROM storage_restore_rows WHERE job_id=? AND table_name=? ON CONFLICT ${conflict} DO NOTHING`).bind(job.id,table));
    }
    // The normal insert trigger is useful during authoring; restoration imports
    // the saved history instead of manufacturing duplicate creation events.
    statements.push(db.prepare('DELETE FROM technique_history WHERE id>(SELECT history_max FROM storage_restore_jobs WHERE id=?)').bind(job.id));
    if(manifest.counts.technique_history){const fields=(await columns(db,'technique_history')).filter(c=>c.name!=='id');statements.push(db.prepare(`INSERT INTO technique_history (${fields.map(c=>q(c.name))}) SELECT ${fields.map(c=>`json_extract(s.payload,'$.${c.name}')`)} FROM storage_restore_rows s WHERE s.job_id=? AND s.table_name='technique_history' AND NOT EXISTS (SELECT 1 FROM technique_history h WHERE h.technique_id=json_extract(s.payload,'$.technique_id') AND h.revision=json_extract(s.payload,'$.revision') AND h.action=json_extract(s.payload,'$.action') AND h.occurred_at=json_extract(s.payload,'$.occurred_at'))`).bind(job.id));}
    statements.push(db.prepare("UPDATE storage_restore_jobs SET state='done' WHERE id=?").bind(job.id),db.prepare('DELETE FROM storage_restore_rows WHERE job_id=?').bind(job.id));
    try{await db.batch(statements);}catch{throw new HttpError(409,'恢复未提交，现有记录保留。请检查备份关联或稍后重试。');}
    return {restored:true,mode:'missing-only'};
  }
  throw new HttpError(405,'不支持此恢复操作。');
}
