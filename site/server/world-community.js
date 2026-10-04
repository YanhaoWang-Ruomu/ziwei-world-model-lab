import {HttpError,jsonBody,now,safeText} from './security.js';
import {runSummary} from './scenario-runs.js';
import {contentPayload,attachViews,attachmentConstraint,attachStatement} from './community-attachments.mjs';
const uid=()=>crypto.randomUUID();
const fail=(s,m)=>{throw new HttpError(s,m);};
const text=(v,n,required=true)=>safeText(v,n,required).trim();
function shape(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail(400,'提交字段不正确。');}
function revision(v){if(!Number.isInteger(v)||v<1)fail(400,'请刷新记录后再操作。');return v;}
function personal(viewer){if(!viewer.id)fail(401,'请登录个人账户。共享密钥不能保存个人研究或发帖。');}
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,'日期不正确。');return v;}
export function worldPayload(v){
  shape(v,['title','state','events']);shape(v.state,['context','resources','constraints','unknowns']);
  const state=Object.fromEntries(['context','resources','constraints','unknowns'].map(k=>[k,text(v.state[k],2000,false)]));
  if(!Array.isArray(v.events)||v.events.length>200)fail(400,'每份研究最多保存 200 条事件。');
  const ids=new Set();const events=v.events.map(e=>{shape(e,['id','date','kind','title','detail']);if(typeof e.id!=='string'||!/^[a-zA-Z0-9-]{1,60}$/.test(e.id)||ids.has(e.id))fail(400,'事件标识重复或无效。');ids.add(e.id);if(!['observed','planned'].includes(e.kind))fail(400,'请区分现实观察与计划。');return {id:e.id,date:date(e.date),kind:e.kind,title:text(e.title,100),detail:text(e.detail,2000,false)};}).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  return {title:text(v.title,100),state,events};
}
export function postPayload(v){
  shape(v,['title','body','format','attachments','kind','tags','sharingConfirmed']);if(v.sharingConfirmed!==true)fail(400,'提交前必须明确确认仅公开这里填写的内容。');
  if(!['case','technique'].includes(v.kind)||!Array.isArray(v.tags)||v.tags.length>5)fail(400,'类型或标签不正确。');
  const tags=[...new Set(v.tags.map(t=>text(t,24)))];return {title:text(v.title,100),...contentPayload(v,12000),kind:v.kind,tags};
}
const project=r=>({id:r.id,title:r.title,...JSON.parse(r.payload),revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at});
const record=r=>({id:r.id,...JSON.parse(r.payload),createdAt:r.created_at});
const post=(r,v)=>({id:r.id,title:r.title,body:r.body,kind:r.kind,tags:JSON.parse(r.tags),status:r.status,revision:r.revision,note:r.user_id===v.id||v.core?r.note:'',mine:r.user_id===v.id,favorite:Boolean(r.favorite),createdAt:r.created_at});
const comment=(r,v)=>({id:r.id,postId:r.post_id,body:r.body,status:r.status,revision:r.revision,note:r.user_id===v.id||v.core?r.note:'',mine:r.user_id===v.id,createdAt:r.created_at});
export async function worldCommunityRoute({path,method,request,db,viewer,url}){
  if(!/^\/api\/(world|community)(\/|$)/.test(path))return null;
  const body=()=>jsonBody(request,65536);
  const posts=rows=>attachViews(db,'post',rows,r=>post(r,viewer));
  const comments=rows=>attachViews(db,'comment',rows,r=>comment(r,viewer));
  async function own(id){personal(viewer);const r=await db.prepare('SELECT * FROM world_projects WHERE id=? AND user_id=?').bind(id,viewer.id).first();if(!r)fail(404,'找不到这份个人研究。');return r;}
  async function visible(id){const r=await db.prepare('SELECT p.*,EXISTS(SELECT 1 FROM community_favorites f WHERE f.post_id=p.id AND f.user_id=?) AS favorite FROM community_posts p WHERE p.id=?').bind(viewer.id||'',id).first();if(!r||(r.status!=='published'&&r.user_id!==viewer.id&&!viewer.core))fail(404,'讨论不存在或尚未公开。');return r;}
  if(path==='/api/world/projects'){
    personal(viewer);
    if(method==='GET')return {projects:(await db.prepare('SELECT id,title,revision,created_at,updated_at FROM world_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(viewer.id).all()).results};
    if(method==='POST'){const p=worldPayload(await body()),id=uid(),t=now();const row=await db.prepare('INSERT INTO world_projects(id,user_id,title,payload,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM world_projects WHERE user_id=?)<100 RETURNING *').bind(id,viewer.id,p.title,JSON.stringify({state:p.state,events:p.events}),t,t,viewer.id).first();if(!row)fail(409,'个人研究已达 100 份，请先整理。');return {project:project(row)};}
  }
  let m=path.match(/^\/api\/world\/projects\/([a-f0-9-]{36})(?:\/(branches))?$/);
  if(m){const r=await own(m[1]);
    if(!m[2]&&method==='GET'){const branches=(await db.prepare('SELECT * FROM world_branches WHERE project_id=? ORDER BY created_at,id').bind(r.id).all()).results.map(record);const reviews=(await db.prepare('SELECT r.* FROM world_reviews r JOIN world_branches b ON b.id=r.branch_id WHERE b.project_id=? ORDER BY r.created_at,r.id').bind(r.id).all()).results.map(x=>({...record(x),branchId:x.branch_id}));const runs=(await db.prepare('SELECT r.id,r.branch_id,r.engine_version,r.input_hash,r.result,r.created_at FROM world_runs r JOIN world_branches b ON b.id=r.branch_id WHERE b.project_id=? ORDER BY r.created_at,r.id').bind(r.id).all()).results.map(runSummary);return {project:project(r),branches,reviews,runs};}
    if(!m[2]&&method==='PUT'){const input=await body();shape(input,['title','state','events','revision']);const {revision:rev,...v}=input;const p=worldPayload(v);const row=await db.prepare('UPDATE world_projects SET title=?,payload=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING *').bind(p.title,JSON.stringify({state:p.state,events:p.events}),now(),r.id,viewer.id,revision(rev)).first();if(!row)fail(409,'已在另一页面修改，请重新打开。');return {project:project(row)};}
    if(!m[2]&&method==='DELETE'){const v=await body();shape(v,['revision']);const deleted=await db.prepare('DELETE FROM world_projects WHERE id=? AND user_id=? AND revision=? RETURNING id').bind(r.id,viewer.id,revision(v.revision)).first();if(!deleted)fail(409,'记录已改变，请刷新后再删除。');return {ok:true};}
    if(m[2]&&method==='POST'){const v=await body();shape(v,['revision','title','hypothesis','action','expected','observeOn']);const p={title:text(v.title,100),hypothesis:text(v.hypothesis,2000),action:text(v.action,2000),expected:text(v.expected,2000),observeOn:date(v.observeOn),baseline:{...project(r)}};
      const row=await db.prepare('INSERT INTO world_branches(id,project_id,payload,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM world_projects WHERE id=? AND user_id=? AND revision=?) AND (SELECT COUNT(*) FROM world_branches WHERE project_id=?)<30 RETURNING *').bind(uid(),r.id,JSON.stringify(p),now(),r.id,viewer.id,revision(v.revision),r.id).first();if(!row)fail(409,'状态已改变或分支已达 30 条，请刷新。');return {branch:record(row)};}
  }
  m=path.match(/^\/api\/world\/branches\/([a-f0-9-]{36})\/reviews$/);
  if(m&&method==='POST'){personal(viewer);const r=await db.prepare('SELECT b.id FROM world_branches b JOIN world_projects p ON p.id=b.project_id WHERE b.id=? AND p.user_id=?').bind(m[1],viewer.id).first();if(!r)fail(404,'找不到这条个人分支。');const v=await body();shape(v,['date','result','outcome','learning','runId']);if(!['supported','contradicted','unclear'].includes(v.outcome))fail(400,'请选择复盘结论。');if(v.runId!==undefined&&v.runId!==''&&(typeof v.runId!=='string'||!await db.prepare('SELECT id FROM world_runs WHERE id=? AND branch_id=?').bind(v.runId,r.id).first()))fail(404,'这份推演不属于当前分支。');const p={date:date(v.date),result:text(v.result,4000),outcome:v.outcome,learning:text(v.learning,4000,false),...(v.runId?{runId:v.runId}:{})};const row=await db.prepare('INSERT INTO world_reviews(id,branch_id,payload,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM world_reviews WHERE branch_id=?)<100 RETURNING *').bind(uid(),r.id,JSON.stringify(p),now(),r.id).first();if(!row)fail(409,'分支复盘已达上限。');return {review:record(row)};}
  if(path==='/api/community/posts'){
    if(method==='GET'){const scope=url.searchParams.get('scope')||'public';if(!['public','mine','favorites'].includes(scope))fail(400,'查询范围无效。');if(scope!=='public')personal(viewer);const q=text(url.searchParams.get('q')||'',100,false),tag=text(url.searchParams.get('tag')||'',24,false),offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>10000)fail(400,'分页无效。');
      const predicate=scope==='mine'?'p.user_id=?':scope==='favorites'?"p.status='published' AND EXISTS(SELECT 1 FROM community_favorites f WHERE f.post_id=p.id AND f.user_id=?)":"p.status='published'";const args=scope==='public'?[]:[viewer.id];const where=`${predicate} AND (?='' OR instr(lower(p.title||' '||p.body),lower(?))>0) AND (?='' OR EXISTS(SELECT 1 FROM json_each(p.tags) WHERE value=?))`;args.push(q,q,tag,tag);
      const rows=(await db.prepare(`SELECT p.*,EXISTS(SELECT 1 FROM community_favorites f WHERE f.post_id=p.id AND f.user_id=?) AS favorite FROM community_posts p WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT 21 OFFSET ?`).bind(viewer.id||'',...args,offset).all()).results;return {posts:await posts(rows.slice(0,20)),hasMore:rows.length>20};}
    if(method==='POST'){
      personal(viewer);const p=postPayload(await body()),t=now(),id=uid(),guard=await attachmentConstraint(db,viewer,p.attachments);
      const results=await db.batch([db.prepare(`INSERT INTO community_posts(id,user_id,title,body,format,kind,tags,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM community_posts WHERE user_id=? AND created_at>?)<10 AND ${guard.sql} RETURNING *`).bind(id,viewer.id,p.title,p.body,p.format,p.kind,JSON.stringify(p.tags),t,t,viewer.id,t-86400,...guard.args),...attachStatement(db,'post',id,viewer,p.attachments)]);
      const row=results[0].results[0];if(!row)fail(409,'每天最多提交 10 篇讨论；请同时检查附件是否已提交。');return {post:(await posts([row]))[0]};
    }
  }
  m=path.match(/^\/api\/community\/posts\/([a-f0-9-]{36})(?:\/(comments|favorite))?$/);
  if(m){const p=await visible(m[1]);
    if(!m[2]&&method==='GET'){const rows=(await db.prepare("SELECT * FROM community_comments WHERE post_id=? AND (status='published' OR user_id=? OR ?=1) ORDER BY created_at,id LIMIT 200").bind(p.id,viewer.id||'',viewer.core?1:0).all()).results;return {post:(await posts([p]))[0],comments:await comments(rows)};}
    if(!m[2]&&method==='DELETE'){personal(viewer);if(p.user_id!==viewer.id)fail(403,'只能撤回自己的讨论。');const v=await body();shape(v,['revision']);const r=await db.prepare("UPDATE community_posts SET status='withdrawn',revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING id").bind(now(),p.id,viewer.id,revision(v.revision)).first();if(!r)fail(409,'讨论状态已改变，请刷新。');return {ok:true};}
    if(m[2]==='comments'&&method==='POST'){
      personal(viewer);const v=await body();shape(v,['body','format','attachments','sharingConfirmed']);if(v.sharingConfirmed!==true)fail(400,'请确认公开评论。');
      const c=contentPayload(v,4000),t=now(),id=uid(),guard=await attachmentConstraint(db,viewer,c.attachments);
      const results=await db.batch([db.prepare(`INSERT INTO community_comments(id,post_id,user_id,body,format,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM community_posts WHERE id=? AND status='published') AND (SELECT COUNT(*) FROM community_comments WHERE user_id=? AND created_at>?)<50 AND (SELECT COUNT(*) FROM community_comments WHERE post_id=?)<200 AND ${guard.sql} RETURNING *`).bind(id,p.id,viewer.id,c.body,c.format,t,p.id,viewer.id,t-86400,p.id,...guard.args),...attachStatement(db,'comment',id,viewer,c.attachments)]);
      const row=results[0].results[0];if(!row)fail(409,'讨论已停止公开、评论达到上限，或附件已提交。');return {comment:(await comments([row]))[0]};
    }
    if(m[2]==='favorite'&&['POST','DELETE'].includes(method)){personal(viewer);if(method==='POST'){const r=await db.prepare("INSERT INTO community_favorites(user_id,post_id,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM community_posts WHERE id=? AND status='published') ON CONFLICT(user_id,post_id) DO UPDATE SET created_at=excluded.created_at RETURNING post_id").bind(viewer.id,p.id,now(),p.id).first();if(!r)fail(404,'只能收藏公开讨论。');}else await db.prepare('DELETE FROM community_favorites WHERE user_id=? AND post_id=?').bind(viewer.id,p.id).run();return {ok:true};}
  }
  m=path.match(/^\/api\/community\/comments\/([a-f0-9-]{36})$/);
  if(m&&method==='DELETE'){personal(viewer);const v=await body();shape(v,['revision']);const r=await db.prepare("UPDATE community_comments SET status='withdrawn',revision=revision+1 WHERE id=? AND user_id=? AND revision=? RETURNING id").bind(m[1],viewer.id,revision(v.revision)).first();if(!r)fail(409,'评论不存在或状态已改变。');return {ok:true};}
  if(path==='/api/community/reports'&&method==='POST'){personal(viewer);const v=await body();shape(v,['targetKind','targetId','reason']);if(!['post','comment'].includes(v.targetKind))fail(400,'举报对象无效。');const id=text(v.targetId,36),reason=text(v.reason,1000);let target;if(v.targetKind==='post')target=await db.prepare("SELECT id FROM community_posts WHERE id=? AND status='published'").bind(id).first();else target=await db.prepare("SELECT c.id FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.id=? AND c.status='published' AND p.status='published'").bind(id).first();if(!target)fail(404,'举报对象未公开。');const r=await db.prepare("INSERT INTO community_reports(id,user_id,target_kind,target_id,reason,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM community_reports WHERE user_id=? AND created_at>?)<20 ON CONFLICT(user_id,target_kind,target_id) DO NOTHING RETURNING id").bind(uid(),viewer.id,v.targetKind,id,reason,now(),viewer.id,now()-86400).first();if(!r)fail(409,'已经举报过该内容，或达到每日上限。');return {ok:true};}
  if(path.startsWith('/api/community/moderation')){
    if(!viewer.core)fail(403,'社区审核需要当前核心权限。');personal(viewer);
    if(path==='/api/community/moderation/target'&&method==='GET'){
      const commentId=url.searchParams.get('comment');
      const c=commentId?await db.prepare('SELECT * FROM community_comments WHERE id=?').bind(commentId).first():null;
      if(commentId&&!c)fail(404,'评论不存在。');const p=await visible(c?.post_id||url.searchParams.get('post')||'');
      return {postId:p.id,post:(await posts([p]))[0],comment:c?(await comments([c]))[0]:null};
    }
    if(path==='/api/community/moderation'&&method==='GET')return {posts:await posts((await db.prepare("SELECT * FROM community_posts WHERE status='pending' ORDER BY created_at LIMIT 100").all()).results),comments:await comments((await db.prepare("SELECT * FROM community_comments WHERE status='pending' ORDER BY created_at LIMIT 100").all()).results),reports:(await db.prepare("SELECT id,target_kind,target_id,reason,created_at FROM community_reports WHERE status='open' ORDER BY created_at LIMIT 100").all()).results};
    if(path==='/api/community/moderation'&&method==='POST'){const v=await body();shape(v,['kind','id','revision','decision','reason']);if(!['post','comment','report'].includes(v.kind)||!(v.kind==='report'?['resolved']:['published','rejected','hidden']).includes(v.decision))fail(400,'审核操作无效。');const reason=text(v.reason,1000),id=text(v.id,36),t=now();const table={post:'community_posts',comment:'community_comments',report:'community_reports'}[v.kind];let sql,args;
      if(v.kind==='report'){sql=`UPDATE ${table} SET status='resolved',note=? WHERE id=? AND status='open'`;args=[reason,id];}
      else {sql=`UPDATE ${table} SET status=?,note=?,revision=revision+1${v.kind==='post'?',updated_at=?':''} WHERE id=? AND revision=? AND status<>'withdrawn' AND (?<>'published' OR status='pending')${v.kind==='comment'&&v.decision==='published'?" AND EXISTS(SELECT 1 FROM community_posts p WHERE p.id=community_comments.post_id AND p.status='published')":''}`;args=[v.decision,reason,...(v.kind==='post'?[t]:[]),id,revision(v.revision),v.decision];}
      // batch is transactional; changes() ties the audit record to this successful decision.
      const results=await db.batch([db.prepare(sql).bind(...args),db.prepare('INSERT INTO community_moderation(id,target_kind,target_id,actor,decision,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(uid(),v.kind,id,viewer.id,v.decision,reason,t)]);if(results[0].meta.changes!==1)fail(409,'内容已改变或已撤回，请刷新队列。');return {ok:true};}
  }
  fail(405,'不支持此操作。');
}
