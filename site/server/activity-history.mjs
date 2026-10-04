import {HttpError,safeText} from './security.js';

const categories=new Set(['all','techniques','pages','excerpts','community','reports']);
// Metadata only. Original technique snapshots remain behind their existing core-only endpoint.
const historySources=`
SELECT 'techniques:'||h.id AS id,'techniques' AS category,h.technique_id AS target,
 COALESCE(json_extract(h.payload,'$.title'),'技法') AS title,h.action AS action,h.actor AS actor,
 h.occurred_at AS occurred_at,h.revision AS revision,0 AS page,'' AS book
 FROM technique_history h
UNION ALL
SELECT 'pages:'||p.book_id||':'||p.page||':'||p.revision,'pages',p.book_id,b.title,
 p.status,'',p.created_at,p.revision,p.page,p.book_id
 FROM page_revisions p JOIN books b ON b.id=p.book_id WHERE b.status<>'deleting'
UNION ALL
SELECT 'excerpts:submit:'||s.id,'excerpts',s.id,COALESCE(json_extract(s.payload,'$.title'),'书籍摘录'),
 'submit',s.author_key,s.created_at,0,s.page,s.book_id
 FROM card_submissions s JOIN books b ON b.id=s.book_id WHERE b.status<>'deleting'
UNION ALL
SELECT 'excerpts:decision:'||s.id,'excerpts',s.id,COALESCE(json_extract(s.payload,'$.title'),'书籍摘录'),
 s.status,COALESCE(s.reviewer_key,''),s.decided_at,0,s.page,s.book_id
 FROM card_submissions s JOIN books b ON b.id=s.book_id WHERE s.decided_at IS NOT NULL AND b.status<>'deleting'
UNION ALL
SELECT 'moderation:'||m.id,CASE WHEN m.target_kind='report' THEN 'reports' ELSE 'community' END,m.target_id,
 CASE WHEN m.target_kind='report' THEN '社区举报' ELSE COALESCE(p.title,cp.title,'社区内容') END,
 m.decision,m.actor,m.created_at,0,0,''
 FROM community_moderation m
 LEFT JOIN community_posts p ON m.target_kind='post' AND p.id=m.target_id
 LEFT JOIN community_comments c ON m.target_kind='comment' AND c.id=m.target_id
 LEFT JOIN community_posts cp ON cp.id=c.post_id`;

export async function activityHistoryRoute({path,method,viewer,db,url}){
  if(!['/api/activity/history','/api/review/summary'].includes(path))return null;
  if(!viewer.core||viewer.role!=='core')throw new HttpError(403,'历史记录与审核统计需要核心管理人权限。');
  if(method!=='GET')throw new HttpError(405,'仅支持读取。');
  if(path==='/api/review/summary'){
    const counts=await db.prepare(`SELECT
      (SELECT COUNT(*) FROM authored_techniques WHERE status='pending') AS techniques,
      (SELECT COUNT(*) FROM card_submissions s JOIN books b ON b.id=s.book_id WHERE s.status='pending' AND b.status<>'deleting') AS excerpts,
      (SELECT COUNT(*) FROM community_posts WHERE status='pending')+(SELECT COUNT(*) FROM community_comments WHERE status='pending') AS community,
      (SELECT COUNT(*) FROM community_reports WHERE status='open') AS reports`).first();
    return {counts};
  }
  const category=url.searchParams.get('category')||'all',q=safeText(url.searchParams.get('q')||'',160,false);
  if(!categories.has(category))throw new HttpError(400,'请选择有效的历史分类。');
  const where=[],args=[];if(category!=='all'){where.push('category=?');args.push(category);}if(q){where.push('instr(title,?)>0');args.push(q);}
  const cursor=url.searchParams.get('before');
  if(cursor){let value;try{value=JSON.parse(cursor);}catch{throw new HttpError(400,'历史分页位置无效。');}
    if(!Array.isArray(value)||value.length!==2||!Number.isSafeInteger(value[0])||value[0]<0||typeof value[1]!=='string'||value[1].length>220)throw new HttpError(400,'历史分页位置无效。');
    where.push('(occurred_at<? OR (occurred_at=? AND id<?))');args.push(value[0],value[0],value[1]);
  }
  const rows=(await db.prepare(`SELECT * FROM (${historySources}) ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY occurred_at DESC,id DESC LIMIT 31`).bind(...args).all()).results;
  const records=rows.slice(0,30),last=records.at(-1);
  return {records,next:rows.length>30?JSON.stringify([last.occurred_at,last.id]):null};
}
