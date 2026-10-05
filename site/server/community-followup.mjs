import {HttpError,jsonBody,now} from './security.js';
import {contentPayload,attachmentConstraint} from './community-attachments.mjs';
export async function communityFollowup({path,method,request,db,viewer,postPayload,posts,comments}){
  if(!path.startsWith('/api/community/'))return null;
  const fail=(n,t)=>{throw new HttpError(n,t);},personal=()=>{if(!viewer.id)fail(401,'请先登录个人账户。');};
  if(path==='/api/community/notifications'){
    personal();if(method==='GET')return {notifications:(await db.prepare("SELECT n.id,n.post_id AS postId,n.comment_id AS commentId,n.kind,n.read_at AS readAt,n.created_at AS createdAt FROM community_notifications n JOIN community_posts p ON p.id=n.post_id WHERE n.recipient=? AND (p.status='published' OR p.user_id=?) ORDER BY n.created_at DESC,n.id LIMIT 60").bind(viewer.id,viewer.id).all()).results};
    if(method==='POST'){const data=await jsonBody(request,2048);if(typeof data.id!=='string')fail(400,'请指定消息。');await db.prepare('UPDATE community_notifications SET read_at=? WHERE id=? AND recipient=?').bind(now(),data.id,viewer.id).run();return {ok:true};}fail(405,'不支持此消息操作。');
  }
  const match=/^\/api\/community\/(posts|comments)\/([a-f0-9-]{36})(?:\/(history))?$/.exec(path);if(!match||!match[3]&&method!=='PUT')return null;
  personal();const kind=match[1]==='posts'?'post':'comment',table=kind==='post'?'community_posts':'community_comments',row=await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(match[2]).first();
  if(!row||row.user_id!==viewer.id&&!(match[3]&&viewer.core))fail(404,'找不到可编辑的个人内容。');
  if(match[3]&&method==='GET')return {history:(await db.prepare('SELECT revision,payload,created_at AS createdAt FROM community_revisions WHERE kind=? AND target_id=? ORDER BY revision DESC LIMIT 100').bind(kind,row.id).all()).results.map(r=>({...r,content:JSON.parse(r.payload),payload:undefined}))};
  if(method!=='PUT'||match[3])fail(405,'不支持此编辑操作。');if(row.status==='withdrawn')fail(409,'内容已撤回，请重新投稿。');
  const data=await jsonBody(request,65536),{revision,...value}=data;
  if(!Number.isInteger(revision)||revision!==row.revision)fail(409,'内容已改变，请重新打开后再编辑。');
  if(kind==='comment'&&(value.sharingConfirmed!==true||Object.keys(value).some(k=>!['body','format','attachments','sharingConfirmed'].includes(k))))fail(400,'请确认评论内容并重新提交审核。');
  const p=kind==='post'?postPayload(value):contentPayload(value,4000),guard=await attachmentConstraint(db,viewer,p.attachments,{kind,id:row.id});
  const historyId=crypto.randomUUID(),stamp=now(),snapshot=(await (kind==='post'?posts([row]):comments([row])))[0];
  const statements=[db.prepare(`INSERT INTO community_revisions(id,kind,target_id,owner,revision,payload,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=? AND user_id=? AND revision=? AND status<>'withdrawn') AND ${guard.sql} AND (SELECT COUNT(*) FROM community_revisions WHERE owner=? AND created_at>?)<50 ON CONFLICT DO NOTHING`).bind(historyId,kind,row.id,viewer.id,revision,JSON.stringify(snapshot),stamp,row.id,viewer.id,revision,...guard.args,viewer.id,stamp-86400)];
  const success='EXISTS(SELECT 1 FROM community_revisions WHERE id=?)';
  statements.push(kind==='post'?db.prepare(`UPDATE ${table} SET title=?,body=?,format=?,kind=?,tags=?,status='pending',note='',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND ${success} RETURNING *`).bind(p.title,p.body,p.format,p.kind,JSON.stringify(p.tags),stamp,row.id,revision,historyId):db.prepare(`UPDATE ${table} SET body=?,format=?,status='pending',note='',revision=revision+1 WHERE id=? AND revision=? AND ${success} RETURNING *`).bind(p.body,p.format,row.id,revision,historyId));
  statements.push(db.prepare(`UPDATE community_attachments SET target_kind=NULL,target_id=NULL,created_at=? WHERE target_kind=? AND target_id=? ${p.attachments.length?'AND id NOT IN ('+p.attachments.map(()=>'?').join(',')+')':''} AND ${success}`).bind(stamp,kind,row.id,...p.attachments,historyId));
  if(p.attachments.length)statements.push(db.prepare(`UPDATE community_attachments SET target_kind=?,target_id=? WHERE user_id=? AND target_kind IS NULL AND id IN (${p.attachments.map(()=>'?').join(',')}) AND ${success}`).bind(kind,row.id,viewer.id,...p.attachments,historyId));
  const results=await db.batch(statements),updated=results[1].results[0];if(!updated)fail(409,'内容或附件已变化，或达到每日编辑上限，请刷新后重试。');
  return kind==='post'?{post:(await posts([updated]))[0]}:{comment:(await comments([updated]))[0]};
}
export function notificationStatements(db,v,actor,stamp){
  if(v.kind==='report')return [];
  const table=v.kind==='post'?'community_posts':'community_comments',postId=v.kind==='post'?'t.id':'t.post_id',commentId=v.kind==='post'?'NULL':'t.id';
  const guard="EXISTS(SELECT 1 FROM community_moderation m WHERE m.id=?)";
  const statements=[db.prepare(`INSERT INTO community_notifications(id,recipient,post_id,comment_id,kind,created_at) SELECT ?,t.user_id,${postId},${commentId},'review',? FROM ${table} t WHERE t.id=? AND ${guard}`).bind(actor+'-author',stamp,v.id,actor)];
  if(v.kind==='comment'&&v.decision==='published')statements.push(db.prepare(`INSERT INTO community_notifications(id,recipient,post_id,comment_id,kind,created_at) SELECT ?||p.user_id,p.user_id,c.post_id,c.id,'reply',? FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.id=? AND p.user_id<>c.user_id AND ${guard} UNION SELECT ?||parent.user_id,parent.user_id,c.post_id,c.id,'reply',? FROM community_comments c JOIN community_comments parent ON parent.id=c.parent_id WHERE c.id=? AND parent.user_id<>c.user_id AND ${guard}`).bind(actor+'-',stamp,v.id,actor,actor+'-',stamp,v.id,actor));
  return statements;
}
