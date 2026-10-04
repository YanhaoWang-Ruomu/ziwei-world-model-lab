import {HttpError,assertOrigin,jsonBody} from './security.js';

export function activeBookGuard(guard){return {sql:`b.status<>'deleting' AND (${guard.sql})`,args:guard.args};}

// A persistent tombstone hides partially deleted materials until a retry has
// finished. Never remove the parent row before its private objects are removed.
export async function deleteBook({db,bucket,viewer,request,id}){
  if(!viewer.owner)throw new HttpError(403,'删除材料需要核心或创建者权限。');
  assertOrigin(request);
  const data=await jsonBody(request,2048);
  if(data.confirmed!==true||typeof data.title!=='string'||typeof data.sourceHash!=='string')throw new HttpError(400,'请填写书名并确认删除范围。');
  const book=await db.prepare('SELECT id,title,source_hash,status,upload_id FROM books WHERE id=?').bind(id).first();
  if(!book)return {ok:true,alreadyDeleted:true};
  if(data.title!==book.title||data.sourceHash!==book.source_hash)throw new HttpError(409,'书名或文件信息不一致，请刷新材料列表后重新确认。');
  const prefix=`books/${id}/`;
  await db.prepare("UPDATE books SET status='deleting' WHERE id=?").bind(id).run();
  try{
    if(book.upload_id){
      try{await bucket.resumeMultipartUpload(prefix+'original',book.upload_id).abort();}
      catch(error){if(!/NoSuchUpload|\b10024\b/.test(String(error?.message||error)))throw error;}
      await db.prepare('UPDATE books SET upload_id=NULL WHERE id=?').bind(id).run();
    }
    // Start at the prefix each time, avoiding pagination skips after deletion.
    while(true){
      const listing=await bucket.list({prefix,limit:1000});
      const keys=listing.objects.map(object=>object.key);
      if(!keys.length)break;
      if(keys.some(key=>!key.startsWith(prefix)))throw Error('Unexpected object prefix');
      await bucket.delete(keys);
    }
    // The schema cascades pages, revisions, grants/sessions, extracted cards,
    // card rules, submissions and legacy upload records. Drafts have no FK.
    await db.batch([
      db.prepare('DELETE FROM workspace_drafts WHERE book_id=?').bind(id),
      db.prepare("DELETE FROM books WHERE id=? AND status='deleting'").bind(id),
    ]);
  }catch{
    throw new HttpError(503,'材料已停止展示，文件清理尚未完成。请在材料管理中点击“继续删除”，不要重新上传。');
  }
  return {ok:true,deleted:true};
}
