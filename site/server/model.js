import { HttpError, jsonBody, safeText } from './security.js';
import { evaluateRule, validateDefinition } from '../src/rule-engine.mjs';
const joins='FROM card_rules r JOIN technique_cards c ON c.id=r.card_id JOIN pages p ON p.book_id=c.book_id AND p.page=c.page JOIN books b ON b.id=c.book_id';
const current="r.status='confirmed' AND r.card_revision=c.revision AND c.status='approved' AND c.source_revision=p.correction_revision AND p.correction_status='confirmed'";
export async function modelRoute({path,method,request,db,viewer,guard,fold,url}) {
  if(!path.startsWith('/api/model/'))return null;
  if(path==='/api/model/rules'&&method==='GET') {
    const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0)));
    const count=await db.prepare(`SELECT COUNT(*) AS total ${joins} WHERE ${current} AND ${guard.sql}`).bind(...guard.args).first();
    const rows=await db.prepare(`SELECT c.id,c.title,b.level,r.revision,r.definition ${joins} WHERE ${current} AND ${guard.sql} ORDER BY c.updated_at DESC,c.id LIMIT 50 OFFSET ?`).bind(...guard.args,offset).all();
    return {rules:rows.results.map(row=>({id:row.id,title:row.title,level:row.level,revision:row.revision,fields:JSON.parse(row.definition).fields})),total:count.total,offset};
  }
  if(path==='/api/model/check'&&method==='POST') {
    const data=await jsonBody(request,16384),id=safeText(data.id,36);
    const row=await db.prepare(`SELECT c.id,r.revision,r.definition ${joins} WHERE c.id=? AND ${current} AND ${guard.sql}`).bind(id,...guard.args).first();
    if(!row)throw new HttpError(404,'这条规则尚未发布、已经更新或当前无权使用。');
    if(data.revision!==row.revision)throw new HttpError(409,'规则已更新，请重新选择并填写。');
    const definition=JSON.parse(row.definition);
    if(validateDefinition(definition,fold).issues.length)throw new HttpError(409,'这条规则需要重新确认。');
    if(!data.facts||typeof data.facts!=='object'||Array.isArray(data.facts))throw new HttpError(400,'案例内容格式不正确。');
    const result=evaluateRule(definition,data.facts,fold);
    // Public case use does not expose the card library or unpublished definitions.
    return {status:result.status,outcome:result.outcome||'',issues:result.issues,checks:viewer.role==='public'?[]:result.checks};
  }
  throw new HttpError(405,'此操作不支持。');
}
