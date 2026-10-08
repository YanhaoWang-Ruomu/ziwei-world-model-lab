import { HttpError, now, jsonBody, safeText } from './security.js';

export async function resolveRole(viewer, db, request) {
  viewer.founder = viewer.owner;
  const member = viewer.id && !viewer.founder && await db.prepare('SELECT user_id FROM core_members WHERE user_id=? AND revoked=0').bind(viewer.id).first();
  const grant = await db.prepare("SELECT g.id FROM grants g WHERE g.revoked=0 AND g.expires_at>? AND ((g.kind='account' AND g.subject=? AND ?<>'') OR (g.kind='key' AND EXISTS (SELECT 1 FROM key_sessions s WHERE s.grant_id=g.id AND s.hash=? AND s.expires_at>?))) LIMIT 1").bind(now(),viewer.id,viewer.id,viewer.session,now()).first();
  const assignment=viewer.id?await db.prepare('SELECT role FROM account_levels WHERE user_id=?').bind(viewer.id).first():null;
  viewer.maxRole=viewer.founder?'core':assignment?.role||(member?'core':viewer.specialAuthenticated||grant?'special':'public');
  const requested=request?.headers.get('cookie')?.match(/(?:^|;\s*)ziwei_view_role=(public|special|core)(?:;|$)/)?.[1];
  const ranks=['public','special','core'];
  viewer.role=requested&&ranks.indexOf(requested)<=ranks.indexOf(viewer.maxRole)?requested:viewer.maxRole;
  viewer.allSpecial=viewer.role!=='public'&&(viewer.maxRole==='core'||assignment?.role==='special'||viewer.specialAuthenticated);
  viewer.core = viewer.role==='core';
  // Compatibility alias for existing business administration. Only founder may administer core membership.
  viewer.owner = viewer.core;
  viewer.actor = viewer.id ? `account:${viewer.id}` : viewer.specialSubject ? `shared:${viewer.specialSubject}` : grant ? `grant:${grant.id}` : '';
  viewer.actorLabel = viewer.id ? viewer.id : viewer.specialSubject ? '特殊共享账号' : '材料密钥用户';
  return viewer;
}
export function requireCards(viewer) {
  if (!['special','core'].includes(viewer.role)) throw new HttpError(403,'技法卡片需要特殊级或核心权限。');
}
export function sessionView(viewer) {
  return {authenticated:Boolean(viewer.id),owner:viewer.core,core:viewer.core,founder:viewer.founder,
    role:viewer.role,maxRole:viewer.maxRole,availableRoles:['public','special','core'].slice(0,['public','special','core'].indexOf(viewer.maxRole)+1),userId:viewer.id,username:viewer.username||'',authType:viewer.authType||'',specialAuthenticated:viewer.specialAuthenticated,
    sharedAccount:Boolean(viewer.specialAuthenticated&&!viewer.id),platformLoginAvailable:viewer.platformLoginAvailable!==false,
    capabilities:{model:true,books:true,cards:viewer.role!=='public',submit:viewer.role!=='public',review:viewer.core,manage:viewer.core,manageCore:viewer.founder}};
}
export async function coreRoute({path,method,request,viewer,db}) {
  if(path==='/api/account-levels'){
    if(!viewer.founder||!viewer.core)throw new HttpError(403,'请切换到创建者核心级管理账户权限。');
    if(method==='GET')return {members:(await db.prepare("SELECT a.id AS user_id,a.username AS label,COALESCE(l.role,CASE WHEN c.revoked=0 THEN 'core' ELSE 'public' END) AS role FROM personal_accounts a LEFT JOIN account_levels l ON l.user_id=a.id LEFT JOIN core_members c ON c.user_id=a.id UNION SELECT l.user_id,l.label,l.role FROM account_levels l WHERE NOT EXISTS(SELECT 1 FROM personal_accounts a WHERE a.id=l.user_id) UNION SELECT c.user_id,c.label,'core' AS role FROM core_members c WHERE c.revoked=0 AND NOT EXISTS(SELECT 1 FROM account_levels l WHERE l.user_id=c.user_id) AND NOT EXISTS(SELECT 1 FROM personal_accounts a WHERE a.id=c.user_id) LIMIT 500").all()).results};
    if(method==='POST'){
      const data=await jsonBody(request,4096),id=safeText(data.userId,200),label=safeText(data.label,80);
      if(data.humanConfirmed!==true||id===viewer.id||!/^[a-zA-Z0-9_:@.-]+$/.test(id)||!['public','special','core'].includes(data.role))throw new HttpError(400,'请核对账户、级别并确认；创建者自身权限不可修改。');
      await db.prepare('INSERT INTO account_levels(user_id,label,role,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET label=excluded.label,role=excluded.role,updated_at=excluded.updated_at').bind(id,label,data.role,now()).run();return {ok:true};
    }
    throw new HttpError(405,'不支持此操作。');
  }
  if (!path.startsWith('/api/core-members')) return null;
  if (!viewer.founder||!viewer.core) throw new HttpError(403,'只有网站创建者本人可以授予或撤销核心权限。');
  if (path==='/api/core-members' && method==='GET') return {members:(await db.prepare('SELECT user_id,label,created_at,updated_at,revoked FROM core_members ORDER BY updated_at DESC').all()).results};
  if (path==='/api/core-members' && method==='POST') {
    const data=await jsonBody(request,4096),id=safeText(data.userId,200),label=safeText(data.label,80);
    if (data.humanConfirmed!==true || id===viewer.id || !/^[a-zA-Z0-9_:@.-]+$/.test(id)) throw new HttpError(400,'请核对对方的账号识别码并勾选授权确认。');
    await db.prepare('INSERT INTO core_members (user_id,label,granted_by,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET label=excluded.label,granted_by=excluded.granted_by,updated_at=excluded.updated_at,revoked=0').bind(id,label,viewer.id,now(),now()).run();
    await db.prepare("INSERT INTO account_levels(user_id,label,role,updated_at) VALUES(?,?,'core',?) ON CONFLICT(user_id) DO UPDATE SET label=excluded.label,role='core',updated_at=excluded.updated_at").bind(id,label,now()).run();
    return {ok:true};
  }
  const match=path.match(/^\/api\/core-members\/([^/]+)$/);
  if (match && method==='DELETE') {
    const id=decodeURIComponent(match[1]);if(id===viewer.id)throw new HttpError(400,'创建者权限不能在这里撤销。');
    await db.prepare('UPDATE core_members SET revoked=1,updated_at=? WHERE user_id=?').bind(now(),id).run();
    await db.prepare("UPDATE account_levels SET role='public',updated_at=? WHERE user_id=? AND role='core'").bind(now(),id).run();return {ok:true};
  }
  throw new HttpError(405,'此操作不支持。');
}
