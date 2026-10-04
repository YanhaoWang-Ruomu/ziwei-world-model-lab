import {HttpError,safeText} from './security.js';
export async function techniqueHistoryRoute({path,method,viewer,db,url}){
  if(!path.startsWith('/api/techniques/history'))return null;
  if(!viewer.core)throw new HttpError(403,'历史记录仅核心及创建者账户可查看。');
  if(method!=='GET')throw new HttpError(405,'历史记录只读。');
  const item=path.match(/^\/api\/techniques\/history\/(\d+)$/);
  if(item){const row=await db.prepare('SELECT * FROM technique_history WHERE id=?').bind(Number(item[1])).first();if(!row)throw new HttpError(404,'未找到记录。');return {record:{...row,payload:JSON.parse(row.payload)}};}
  if(path!=='/api/techniques/history')throw new HttpError(404,'未找到记录。');
  const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
  if(!Number.isSafeInteger(before)||before<1)throw new HttpError(400,'分页位置无效。');
  const id=safeText(url.searchParams.get('card')||'',40,false),q=safeText(url.searchParams.get('q')||'',160,false);
  const rows=(await db.prepare("SELECT id,technique_id,revision,release_version,action,actor,status,occurred_at,json_extract(payload,'$.title') AS title FROM technique_history WHERE id<? AND (?='' OR technique_id=?) AND instr(json_extract(payload,'$.title'),?)>0 ORDER BY id DESC LIMIT 31").bind(before,id,id,q).all()).results;
  const more=rows.length>30,records=rows.slice(0,30);return {records,next:more?records.at(-1).id:null};
}
