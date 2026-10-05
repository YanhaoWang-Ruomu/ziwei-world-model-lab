import {HttpError,jsonBody,now} from './security.js';

// No content or credentials are returned by the health check.
const tables=['community_attachments','world_runs','world_projects','world_branches','world_reviews','community_posts','community_comments','community_favorites','community_reports','community_moderation','personal_accounts','chart_cases','chart_preferences','chart_profiles','books','pages','page_revisions','technique_cards','card_rules','card_submissions','core_members','grants','workspace_drafts','account_levels','authored_techniques','technique_history'];
const quoted=table=>'"'+table+'"';
export const storageLocation=env=>env.LOCAL_PREVIEW==='1'?'local':'cloud';
export async function markStored(db){
  await db.prepare("INSERT INTO storage_state(id,dirty_version) VALUES ('main',1) ON CONFLICT(id) DO UPDATE SET dirty_version=dirty_version+1").run();
}
export async function createBackup(env,force=false){
  const db=env.DB,t=now();
  await db.prepare("INSERT INTO storage_state(id) VALUES ('main') ON CONFLICT(id) DO NOTHING").run();
  const state=await db.prepare("UPDATE storage_state SET lock_until=? WHERE id='main' AND lock_until<? AND (?=1 OR (dirty_version>backup_version AND backup_at<?)) RETURNING dirty_version").bind(t+300,t,force?1:0,t-3600).first();
  if(!state)return {busy:true};
  const id=crypto.randomUUID(),prefix='backups/'+id,counts={},files=[];
  try{
    // Do not promote a paged backup if another completed save was observed.
    for(const table of tables){
      let offset=0,part=0;counts[table]=0;
      while(true){
        const rows=(await db.prepare(`SELECT * FROM ${quoted(table)} ORDER BY rowid LIMIT 80 OFFSET ?`).bind(offset).all()).results;
        if(!rows.length)break;
        const key=`${prefix}/${table}-${part++}.json`;
        await env.BUCKET.put(key,JSON.stringify(rows),{httpMetadata:{contentType:'application/json'}});
        files.push({table,key,count:rows.length});counts[table]+=rows.length;offset+=rows.length;
      }
    }
    const current=await db.prepare("SELECT dirty_version FROM storage_state WHERE id='main'").first();
    if(current.dirty_version!==state.dirty_version)throw new Error('Concurrent write; retry on the next checkpoint');
    const manifestKey=prefix+'/manifest.json';
    await env.BUCKET.put(manifestKey,JSON.stringify({format:1,id,createdAt:t,location:storageLocation(env),counts,files,originalFiles:'books/; immutable source files remain in the private file store'}),{httpMetadata:{contentType:'application/json'}});
    await db.batch([
      db.prepare('INSERT INTO storage_backups(id,created_at,manifest_key,counts) VALUES (?,?,?,?)').bind(id,t,manifestKey,JSON.stringify(counts)),
      db.prepare("UPDATE storage_state SET backup_version=?,backup_at=?,lock_until=0,backup_error=0 WHERE id='main'").bind(state.dirty_version,t),
    ]);
    return {id,createdAt:t,counts};
  }catch{
    await db.prepare("UPDATE storage_state SET lock_until=0,backup_error=1 WHERE id='main'").run();
    return {pending:true};
  }
}
async function checkDraft(data,viewer,db,bookFor){
  if(!viewer.actor)throw new HttpError(401,'请先登录，再保存个人草稿。');
  if(!data||!['material','submission','review','rule','correction','card'].includes(data.kind)||typeof data.key!=='string'||!/^[a-zA-Z0-9:_-]{1,180}$/.test(data.key))throw new HttpError(400,'草稿类型不正确。');
  if(['material','review','rule','correction','card'].includes(data.kind)&&!viewer.core)throw new HttpError(403,'此草稿需要核心管理人权限。');
  if(data.kind==='submission'&&!['core','special'].includes(viewer.role))throw new HttpError(403,'需要特殊级权限。');
  if(data.kind!=='material')await bookFor(db,data.bookId,viewer);
  if(data.payload?.level==='private')throw new HttpError(400,'私密内容请只在本机私密入口保存。');
}
export async function storageRoute({path,method,request,db,viewer,env,bookFor,url}){
  if(!path.startsWith('/api/storage')&&!path.startsWith('/api/drafts'))return null;
  if(path==='/api/storage'&&method==='GET'){
    await db.prepare('SELECT 1').first();await env.BUCKET.list({limit:1});
    const result={location:storageLocation(env),persistent:true,accountSaved:Boolean(viewer.id),passwords:'hashed',personalCases:viewer.id?(await db.prepare('SELECT COUNT(*) AS n FROM chart_cases WHERE user_id=?').bind(viewer.id).first()).n:0};
    if(env.LOCAL_PREVIEW==='1'&&env.PREVIEW_PURPOSE==='fictional-persistence')result.testStore=true;
    if(viewer.core){
      const names=tables.filter(t=>viewer.founder||!['personal_accounts','chart_cases','chart_preferences','chart_profiles','core_members'].includes(t));
      const counts=await db.batch(names.map(table=>db.prepare(`SELECT COUNT(*) AS n FROM ${quoted(table)}`)));
      result.counts=Object.fromEntries(names.map((name,i)=>[name,counts[i].results[0].n]));
      result.backup=await db.prepare("SELECT backup_at,backup_error,dirty_version,backup_version FROM storage_state WHERE id='main'").first();
      const books=(await db.prepare('SELECT id,file_ready FROM books').all()).results;
      let missing=0;
      for(const b of books)if(b.file_ready&&!await env.BUCKET.head(`books/${b.id}/original`))missing++;
      result.missingOriginals=missing;
      result.incomplete=(await db.prepare("SELECT COUNT(*) AS n FROM books WHERE status<>'ready'").first()).n;
    }
    return result;
  }
  if(path==='/api/storage/backups'){
    if(!viewer.founder)throw new HttpError(403,'完整记录备份仅由创建者本人管理。');
    if(method==='POST')return createBackup(env,true);
    if(method==='GET')return {backups:(await db.prepare('SELECT id,created_at,counts FROM storage_backups ORDER BY created_at DESC LIMIT 30').all()).results.map(r=>({...r,counts:JSON.parse(r.counts)}))};
  }
  if(path==='/api/drafts'){
    if(!viewer.actor)throw new HttpError(401,'请先登录，再保存个人草稿。');
    if(method==='GET'){
      const key=url.searchParams.get('key');
      if(!key)return {drafts:(await db.prepare('SELECT key,kind,book_id,revision,updated_at FROM workspace_drafts WHERE owner_key=? ORDER BY updated_at DESC').bind(viewer.actor).all()).results};
      const row=await db.prepare('SELECT * FROM workspace_drafts WHERE owner_key=? AND key=?').bind(viewer.actor,key).first();
      if(!row)return {draft:null};
      await checkDraft({key:row.key,kind:row.kind,bookId:row.book_id},viewer,db,bookFor);
      return {draft:{key:row.key,kind:row.kind,bookId:row.book_id,payload:JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at}};
    }
    const data=await jsonBody(request,1500000);await checkDraft(data,viewer,db,bookFor);
    if(method==='PUT'){
      if(!Number.isInteger(data.revision)||data.revision<0||!data.payload||typeof data.payload!=='object'||Array.isArray(data.payload))throw new HttpError(400,'请重新载入草稿后保存。');
      const payload=JSON.stringify(data.payload);if(new TextEncoder().encode(payload).length>900000)throw new HttpError(413,'草稿较大，请先保存为文件，再导入材料。');
      const updated=data.revision===0?
        await db.prepare('INSERT INTO workspace_drafts(owner_key,key,kind,book_id,payload,revision,updated_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(owner_key,key) DO NOTHING RETURNING revision').bind(viewer.actor,data.key,data.kind,data.bookId||null,payload,now()).first():
        await db.prepare('UPDATE workspace_drafts SET payload=?,revision=revision+1,updated_at=? WHERE owner_key=? AND key=? AND kind=? AND book_id IS ? AND revision=? RETURNING revision').bind(payload,now(),viewer.actor,data.key,data.kind,data.bookId||null,data.revision).first();
      if(!updated)throw new HttpError(409,'草稿已在另一页面更新，请重新载入后继续。');
      return {saved:true,revision:updated.revision};
    }
    if(method==='DELETE'){
      if(!Number.isInteger(data.revision))throw new HttpError(400,'请提供草稿版本。');
      const r=await db.prepare('DELETE FROM workspace_drafts WHERE owner_key=? AND key=? AND revision=?').bind(viewer.actor,data.key,data.revision).run();
      if(!r.meta.changes)throw new HttpError(409,'草稿版本已变化，未删除。');return {ok:true};
    }
  }
  throw new HttpError(405,'此保存操作不支持。');
}
