import {worldCommunityRoute} from './world-community.js';
import {attachmentRoute} from './community-attachments.mjs';
import {activityHistoryRoute} from './activity-history.mjs';
import {scenarioRoute} from './scenario-runs.js';
import {searchLibrary} from './library-search.mjs';
import {deleteBook,activeBookGuard} from './book-deletion.mjs';
import * as OpenCC from 'opencc-js';
import { now, digest, randomToken, identity, assertOrigin, HttpError, bodyBytes, jsonBody, safeText, positiveInt, onlineLevel } from './security.js';
import { specialSubject, loginSpecial, logoutSpecial } from './special-access.js';
import { correctionFor, reviewRoute } from './review.js';
import { listCards } from './cards.js';
import { ruleRoute } from './rules.js';
import { resolveRole, sessionView, coreRoute, requireCards } from './roles.js';
import { submissionRoute } from './submissions.js';
import { modelRoute } from './model.js';
import { chartRoute } from './chart-route.mjs';
import { accountIdentity,accountRoute,logoutAccount } from './accounts.js';
import { casesRoute } from './chart-cases.js';
import {storageRoute,markStored,createBackup} from './storage.js';
import {techniqueRoute} from './techniques.js';
import {downloadRoute} from './downloads.js';
const convert = OpenCC.Converter({ from: 't', to: 'cn' });
export const normalize = value => convert(String(value).normalize('NFKC').toLowerCase()).replace(/[\p{P}\p{S}\s]/gu, '');
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
const bookFields = 'id,title,level,kind,status,page_count,file_name,file_size,file_ready,source_hash,created_at';
const objectKey = (id, suffix) => `books/${id}/${suffix}`;

function database(env) {
  if (!env.DB || !env.BUCKET) throw new HttpError(503, '书库暂时无法连接，请稍后重试。');
  return env.DB;
}
async function access(request, env) {
  const viewer = await accountIdentity(request,database(env),identity(request, env));
  viewer.importer = false;
  viewer.importBooks = (env.PUBLIC_IMPORT_BOOK_IDS || '').split(',');
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (token && env.PUBLIC_IMPORT_HASH && Number(env.PUBLIC_IMPORT_EXPIRES) > now()) viewer.importer = await digest(token) === env.PUBLIC_IMPORT_HASH;
  const cookies = request.headers.get('cookie') || '';
  const session = cookies.match(/(?:^|;\s*)__Host-ziwei_key=([a-f0-9]{64})/)?.[1] || '';
  viewer.session = session ? await digest(session) : '';
  viewer.specialSubject = await specialSubject(request, env);
  viewer.specialAuthenticated = Boolean(viewer.specialSubject);
  return resolveRole(viewer, database(env),request);
}
// The same predicate protects listings, search, text, images and original files.
function visibility(viewer) {return activeBookGuard(accessVisibility(viewer));}
function accessVisibility(viewer) {
  if (viewer.owner) return { sql: '1=1', args: [] };
  if(viewer.role==='public')return {sql:"b.level='public'",args:[]};
  if (viewer.allSpecial) return { sql: "b.level IN ('public','special')", args: [] };
  return { sql: `(b.level='public' OR EXISTS (SELECT 1 FROM grants g WHERE g.book_id=b.id AND g.revoked=0 AND g.expires_at>? AND ((g.kind='account' AND g.subject=? AND ?<>'') OR (g.kind='key' AND EXISTS (SELECT 1 FROM key_sessions s WHERE s.grant_id=g.id AND s.hash=? AND s.expires_at>?)))))`, args: [now(), viewer.id, viewer.id, viewer.session, now()] };
}
async function bookFor(db, id, viewer, write = false) {
  const book = await db.prepare('SELECT * FROM books WHERE id=?').bind(id).first();
  if (!book) throw new HttpError(404, '找不到这份材料，或尚未获得访问权限。');
  if(book.status==='deleting')throw new HttpError(410,'这份材料正在删除，已停止读取和修改。');
  if (write) {
    const importer = viewer.importer && book.level === 'public' && viewer.importBooks.includes(id);
    if (!viewer.owner && !importer) throw new HttpError(403, '材料导入和直接修改需要核心管理人权限。');
  } else if (!viewer.owner) {
    const guard = visibility(viewer);
    if (!await db.prepare(`SELECT b.id FROM books b WHERE b.id=? AND ${guard.sql}`).bind(id, ...guard.args).first()) throw new HttpError(404, '找不到这份材料，或尚未获得访问权限。');
  }
  return book;
}
function requireOwner(viewer) { if (!viewer.owner) throw new HttpError(403, '此操作需要核心管理人权限。'); }
function pageNumber(value, book) { return positiveInt(Number(value), book.page_count); }
function pageResult(row) { return { ...row, reviewed: JSON.parse(row.reviewed || '[]') }; }

async function route(request, env) {
  const url = new URL(request.url); const path = url.pathname; const method = request.method;
  if(path.startsWith('/downloads/'))return downloadRoute(request,env);
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  const viewer = await access(request, env);
  if (method !== 'GET' && method !== 'HEAD') { if (!viewer.importer) assertOrigin(request); }
  if (path === '/api/session' && method === 'GET') return json(sessionView(viewer));
  if(path==='/api/session/level'&&method==='POST'){
    const data=await jsonBody(request,1024),roles=['public','special','core'];
    if(!roles.includes(data.role)||roles.indexOf(data.role)>roles.indexOf(viewer.maxRole))throw new HttpError(403,'该级别尚未授权。');
    return json({ok:true},200,{'Set-Cookie':`ziwei_view_role=${data.role}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});
  }
  const db = database(env);
  if (path === '/api/logout' && method === 'POST') {
    const specialCookie = await logoutSpecial(request, db);
    if (viewer.session) await db.prepare('DELETE FROM key_sessions WHERE hash=?').bind(viewer.session).run();
    const response = json({ok:true,platformSignout:Boolean(viewer.platformId)});
    response.headers.append('Set-Cookie','ziwei_view_role=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    response.headers.append('Set-Cookie',await logoutAccount(request,db));
    response.headers.append('Set-Cookie',specialCookie);
    response.headers.append('Set-Cookie','__Host-ziwei_key=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return response;
  }
  const context={path,method,request,db,viewer,env,guard:visibility(viewer),bookFor,normalize,fold:convert,url};
  const activity=await activityHistoryRoute(context);if(activity!==null)return json(activity);
  const attachment=await attachmentRoute(context);if(attachment!==null)return attachment instanceof Response?attachment:json(attachment);
  const scenario=await scenarioRoute(context);if(scenario!==null)return json(scenario);
  const research=await worldCommunityRoute(context);if(research!==null)return json(research);
  const technique=await techniqueRoute(context);if(technique!==null)return json(technique);
  const storage=await storageRoute(context);if(storage!==null)return json(storage);
  const account=await accountRoute(context);if(account!==null){
    const response=json({ok:true,account:account.account});response.headers.append('Set-Cookie',account.cookie);
    response.headers.append('Set-Cookie',await logoutSpecial(request,db));
    if(viewer.session)await db.prepare('DELETE FROM key_sessions WHERE hash=?').bind(viewer.session).run();
    response.headers.append('Set-Cookie','__Host-ziwei_key=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return response;
  }
  const cases=await casesRoute(context);if(cases!==null)return json(cases);
  const chart=await chartRoute(context);if(chart!==null)return json(chart);
  const core=await coreRoute(context);if(core!==null)return json(core);
  const submission=await submissionRoute(context);if(submission!==null)return json(submission);
  const model=await modelRoute(context);if(model!==null)return json(model);
  if(path==='/api/cards' && method==='GET'){requireCards(viewer);return json(await listCards(context));}
  if (path === '/api/special/login' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': await loginSpecial(request, env, db) });
  if (path === '/api/special/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': await logoutSpecial(request, db) });
  if (path === '/api/books' && method === 'GET') {
    // Core managers retain the metadata needed to retry interrupted deletion.
    const guard = viewer.owner?accessVisibility(viewer):visibility(viewer);
    const { results } = await db.prepare(`SELECT ${bookFields.split(',').map(x => `b.${x}`).join(',')},(SELECT COUNT(*) FROM pages p WHERE p.book_id=b.id) AS indexed_pages,(SELECT COUNT(*) FROM pages p WHERE p.book_id=b.id AND p.correction_status='confirmed') AS confirmed_pages FROM books b WHERE ${guard.sql} ORDER BY b.created_at,b.id`).bind(...guard.args).all();
    return json({ books: results });
  }
  if (path === '/api/books' && method === 'POST') {
    if(!viewer.core&&!viewer.importer)throw new HttpError(403,'添加书籍与文章需要核心管理人权限。');
    const data = await jsonBody(request, 16384); const level = onlineLevel(data.level);
    if (viewer.importer && !viewer.owner && level !== 'public') throw new HttpError(403, '导入通道仅接收明确公开的材料。');
    const id = data.id && /^[a-z0-9-]{3,60}$/.test(data.id) ? data.id : crypto.randomUUID();
    if (viewer.importer && !viewer.owner && !viewer.importBooks.includes(id)) throw new HttpError(403, '材料不在本次授权导入范围。');
    const title = safeText(data.title, 160); const count = positiveInt(data.pageCount, 2000);
    const hash = safeText(data.sourceHash, 64); if (!/^[a-f0-9]{64}$/.test(hash)) throw new HttpError(400, '文件指纹不正确。');
    const fileName = safeText(data.fileName, 240); const size = positiveInt(data.fileSize, 512 * 1024 * 1024);
    const kind = ['pdf', 'text'].includes(data.kind) ? data.kind : null; if (!kind) throw new HttpError(400, '请选择 PDF 或文字文章。');
    const exists = await db.prepare('SELECT * FROM books WHERE id=?').bind(id).first();
    if (exists) {
      await bookFor(db, id, viewer, true);
      if (exists.source_hash !== hash) throw new HttpError(409, '文件与已有材料不一致。');
      return json({ id, resumed: true });
    }
    if(!data.id&&viewer.core){
      const same=await db.prepare("SELECT id FROM books WHERE source_hash=? AND level=? AND file_size=? AND status<>'deleting' ORDER BY created_at LIMIT 1").bind(hash,level,size).first();
      if(same)return json({id:same.id,resumed:true});
    }
    await db.prepare('INSERT INTO books (id,title,level,kind,page_count,source_hash,file_name,file_size,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, title, level, kind, count, hash, fileName, size, now()).run();
    return json({ id }, 201);
  }
  if (path === '/api/my-uploads' && method === 'GET') {requireOwner(viewer);return json({books:[]});}
  if (path === '/api/search' && method === 'GET') {
    const query = safeText(url.searchParams.get('q') || '', 160, false);
    return json(await searchLibrary({db,url,guard:visibility(viewer),normalize,query}));
  }
  if (path === '/api/unlock' && method === 'POST') {
    const { key } = await jsonBody(request, 4096);
    if (typeof key !== 'string' || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(key)) throw new HttpError(403, '密钥无效、已到期或已被撤销。');
    const [id, secret] = key.split('.');
    const grant = await db.prepare("SELECT * FROM grants WHERE id=? AND kind='key' AND revoked=0 AND expires_at>?").bind(id, now()).first();
    if (!grant || await digest(secret) !== grant.subject) throw new HttpError(403, '密钥无效、已到期或已被撤销。');
    const session = randomToken(); const expiry = Math.min(grant.expires_at, now() + 8 * 3600);
    await db.prepare('INSERT INTO key_sessions (hash,grant_id,expires_at) VALUES (?,?,?)').bind(await digest(session), id, expiry).run();
    return json({ bookId: grant.book_id }, 200, { 'Set-Cookie': `__Host-ziwei_key=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${expiry - now()}` });
  }
  if (path === '/api/lock' && method === 'POST') {
    if (viewer.session) await db.prepare('DELETE FROM key_sessions WHERE hash=?').bind(viewer.session).run();
    return json({ ok: true }, 200, { 'Set-Cookie': '__Host-ziwei_key=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  const match = path.match(/^\/api\/books\/([a-z0-9-]{3,60})(?:\/(.*))?$/);
  if (!match) throw new HttpError(404, '此地址不存在。');
  const [, id, action = ''] = match; const writing = !['GET','HEAD'].includes(method);
  if(!action&&method==='DELETE')return json(await deleteBook({db,bucket:env.BUCKET,viewer,request,id}));
  const book = await bookFor(db, id, viewer, writing);
  const review = await reviewRoute({ action, method, request, db, book, viewer, normalize });
  if (review !== null) return json(review);
  const rule=await ruleRoute({action,method,request,db,book,viewer,fold:convert});
  if(rule!==null)return json(rule);
  if (!action && method === 'GET') {
    const { results } = await db.prepare('SELECT page,engine,image_ready FROM pages WHERE book_id=? ORDER BY page').bind(id).all();
    const publicBook = Object.fromEntries(bookFields.split(',').map(k => [k, book[k]]));
    return json({ ...publicBook, indexedPages: results });
  }
  if (!action && method === 'PATCH') {
    requireOwner(viewer); const data = await jsonBody(request, 4096); const level = onlineLevel(data.level);
    await db.prepare('UPDATE books SET level=? WHERE id=?').bind(level, id).run();
    return json({ ok: true });
  }
  if (action === 'complete' && method === 'POST') {
    const coverage = await db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(image_ready),0) AS images FROM pages WHERE book_id=?').bind(id).first();
    if (coverage.count !== book.page_count || !book.file_ready || (book.kind === 'pdf' && coverage.images !== book.page_count)) throw new HttpError(409, '原文件、部分页或页图尚未导入完成，可继续导入。');
    const done=await db.prepare("UPDATE books SET status='ready' WHERE id=? AND status<>'deleting'").bind(id).run();if(!done.meta.changes)throw new HttpError(410,'材料已删除或正在删除。');return json({ ok: true });
  }
  if (action === 'file/start' && method === 'POST') {
    if (book.file_ready) return json({ complete: true });
    if (book.upload_id) return json({ uploadId: book.upload_id });
    const upload = await env.BUCKET.createMultipartUpload(objectKey(id, 'original'), { httpMetadata: { contentType: book.kind === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8' } });
    const started=await db.prepare("UPDATE books SET upload_id=? WHERE id=? AND status<>'deleting'").bind(upload.uploadId, id).run();
    if(!started.meta.changes){await upload.abort();throw new HttpError(410,'材料已删除或正在删除。');}
    return json({ uploadId: upload.uploadId });
  }
  const part = action.match(/^file\/parts\/(\d+)$/);
  if (part && method === 'PUT') {
    if (!book.upload_id || book.file_ready) throw new HttpError(409, '请先开始上传。');
    const partNumber = positiveInt(Number(part[1]), 103);
    const bytes = await bodyBytes(request, 8 * 1024 * 1024);
    const upload = env.BUCKET.resumeMultipartUpload(objectKey(id, 'original'), book.upload_id);
    return json(await upload.uploadPart(partNumber, bytes));
  }
  if (action === 'file/complete' && method === 'POST') {
    if (book.file_ready) return json({ ok: true });
    const data = await jsonBody(request, 32768);
    if (!book.upload_id || !Array.isArray(data.parts) || data.parts.length < 1 || data.parts.length > 103 || data.parts.some((p,i) => p.partNumber !== i+1 || typeof p.etag !== 'string')) throw new HttpError(400, '上传分段信息不完整。');
    const upload = env.BUCKET.resumeMultipartUpload(objectKey(id, 'original'), book.upload_id);
    const object = await upload.complete(data.parts);
    if (object.size !== book.file_size) throw new HttpError(409, '文件大小校验未通过。');
    const saved=await db.prepare("UPDATE books SET file_ready=1,upload_id=NULL WHERE id=? AND status<>'deleting'").bind(id).run();
    if(!saved.meta.changes){await env.BUCKET.delete(objectKey(id,'original'));throw new HttpError(410,'材料已删除或正在删除。');}
    return json({ ok: true });
  }
  if (action === 'file' && method === 'GET') {
    if (!book.file_ready) throw new HttpError(404, '原文件尚未上传完成。');
    return serveObject(env, objectKey(id, 'original'), request, book.file_name);
  }
  const pageMatch = action.match(/^pages\/(\d+)(\/image)?$/);
  if (pageMatch) {
    const n = pageNumber(pageMatch[1], book); const isImage = Boolean(pageMatch[2]);
    if (isImage && method === 'GET') return serveObject(env, objectKey(id, `page-${n}.jpg`), request);
    if (isImage && method === 'PUT') {
      const bytes = await bodyBytes(request, 8 * 1024 * 1024);
      if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new HttpError(400, '页图必须是 JPEG 图片。');
      const existing = await db.prepare('SELECT image_ready FROM pages WHERE book_id=? AND page=?').bind(id,n).first();
      if (!existing) throw new HttpError(409,'请先保存该页文字。');
      if (existing.image_ready) throw new HttpError(409,'原页影像已保存，不能覆盖。');
      await env.BUCKET.put(objectKey(id, `page-${n}.jpg`), bytes, { httpMetadata: { contentType: 'image/jpeg' } });
      const saved=await db.prepare("UPDATE pages SET image_ready=1 WHERE book_id=? AND page=? AND EXISTS(SELECT 1 FROM books WHERE id=? AND status<>'deleting')").bind(id,n,id).run();
      if(!saved.meta.changes){await env.BUCKET.delete(objectKey(id,`page-${n}.jpg`));throw new HttpError(410,'材料已删除或正在删除。');}return json({ ok: true });
    }
    if (!isImage && method === 'GET') {
      const row = await db.prepare('SELECT * FROM pages WHERE book_id=? AND page=?').bind(id,n).first();
      if (!row) throw new HttpError(404, '这一页尚未识别。');
      const original = Object.fromEntries(['book_id','page','raw_text','reviewed','engine','image_ready'].map(k=>[k,row[k]]));
      return json({ ...pageResult(original), ...correctionFor(row,viewer.owner), title: book.title, kind: book.kind, level: book.level, source_hash: book.source_hash, page_count: book.page_count });
    }
    if (!isImage && method === 'PUT') {
      const data = await jsonBody(request); const text = safeText(data.rawText, 120000, false);
      const engine = ['paddle-v5','browser-ocr','embedded-text','article'].includes(data.engine) ? data.engine : null;
      if (!engine) throw new HttpError(400, '识别方式不正确。');
      const reviewed = Array.isArray(data.reviewed) ? data.reviewed : [];
      if (!viewer.owner && !viewer.importer && reviewed.length) throw new HttpError(403, '访客上传不包含书库校对记录。');
      if (reviewed.length > 10) throw new HttpError(400, '选段过多。');
      const clean = reviewed.map(r => ({ title: safeText(r.title,160), text: safeText(r.text,6000), note: safeText(r.note || '',2000,false), aliases: Array.isArray(r.aliases) ? r.aliases.slice(0,20).map(a=>safeText(a,160)) : [], status: 'ai_visual_review', humanConfirmed: false }));
      const result = await db.prepare('INSERT INTO pages (book_id,page,raw_text,normalized,reviewed,review_search,aliases,engine) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(book_id,page) DO NOTHING').bind(id,n,text,normalize(text),JSON.stringify(clean),normalize(clean.map(r=>r.text).join('\n')),clean.flatMap(r=>r.aliases).map(a=>`|${normalize(a)}|`).join(''),engine).run();
      if (!result.meta.changes) {
        const original = await db.prepare('SELECT raw_text,engine,reviewed FROM pages WHERE book_id=? AND page=?').bind(id,n).first();
        if (original.raw_text !== text || original.engine !== engine || original.reviewed !== JSON.stringify(clean)) throw new HttpError(409,'原始文字已保存，修改请使用本页校订稿。');
      }
      return json({ ok: true });
    }
  }
  if (action === 'grants' && method === 'GET') {
    requireOwner(viewer);
    return json({ grants: (await db.prepare('SELECT id,kind,label,expires_at,revoked FROM grants WHERE book_id=? ORDER BY expires_at DESC').bind(id).all()).results });
  }
  if (action === 'grants' && method === 'POST') {
    requireOwner(viewer); const data = await jsonBody(request, 4096);
    if (book.level !== 'special') throw new HttpError(400, '请先将材料设为特殊。');
    const kind = data.kind; if (!['key','account'].includes(kind)) throw new HttpError(400, '授权方式不正确。');
    const expiry = now() + positiveInt(data.days,365)*86400; const grantId = crypto.randomUUID(); const secret = randomToken();
    const subject = kind === 'key' ? await digest(secret) : safeText(data.subject,200);
    const label = safeText(data.label || (kind === 'key' ? '访问密钥' : '账号授权'),100);
    await db.prepare('INSERT INTO grants (id,book_id,kind,subject,label,expires_at) VALUES (?,?,?,?,?,?)').bind(grantId,id,kind,subject,label,expiry).run();
    return json({ id: grantId, key: kind === 'key' ? `${grantId}.${secret}` : undefined, expiresAt: expiry },201);
  }
  const revoke = action.match(/^grants\/([a-f0-9-]{36})$/);
  if (revoke && method === 'DELETE') {
    requireOwner(viewer); await db.prepare('UPDATE grants SET revoked=1 WHERE id=? AND book_id=?').bind(revoke[1],id).run(); return json({ ok: true });
  }
  throw new HttpError(405, '此操作不支持。');
}
async function serveObject(env, key, request, fileName) {
  const object = await env.BUCKET.get(key, { range: request.headers });
  if (!object) throw new HttpError(404, '文件尚未准备完成。');
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy':'no-referrer', 'Accept-Ranges':'bytes' });
  object.writeHttpMetadata(headers);
  if (fileName) headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  let status = 200;
  if (request.headers.has('Range') && object.range) { const { offset, length } = object.range; headers.set('Content-Range', `bytes ${offset}-${offset+length-1}/${object.size}`); status=206; }
  return new Response(object.body, {status,headers});
}
export default { async fetch(request, env, ctx) {
  try {
    const response=await route(request,env),path=new URL(request.url).pathname;
    if(response.ok&&path!=='/api/techniques/match'&&!/^\/api\/world\/runs\/[a-f0-9-]{36}\/replay$/.test(path)&&!['GET','HEAD'].includes(request.method)&&/^\/api\/(world|community|books|cases|drafts|submissions|core-members|account-levels|techniques|account\/register)(?:\/|$)/.test(path)){
      // A delayed backup must never turn a committed save into a false failure.
      try{await markStored(env.DB);const backup=createBackup(env);if(ctx?.waitUntil)ctx.waitUntil(backup);else await backup;}catch{}
    }
    return response;
  }
  catch(e) { return json({ error: e instanceof HttpError ? e.message : '服务暂时不可用。已保存的内容会保留，请稍后重试。' }, e instanceof HttpError ? e.status : 503); }
} };
