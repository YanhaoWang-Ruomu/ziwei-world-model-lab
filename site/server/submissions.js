import { HttpError, jsonBody, safeText, now, digest, positiveInt } from './security.js';
import { requireCards } from './roles.js';
import { cardIndex } from './cards.js';
import { validateDefinition } from '../src/rule-engine.mjs';

const fields=['conditions','conclusion','exceptions','terminology','questions','notes'];
const conflict=()=>new HttpError(409,'出处、卡片或审核状态已有变化。请重新打开当前版本后提交。');
const version=x=>{if(!Number.isSafeInteger(x)||x<0)throw new HttpError(400,'版本编号不正确。');return x;};
function payloadFor(value,fold) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'卡片内容格式不正确。');
  const data={title:safeText(value.title,160),quote:safeText(value.quote,12000),topic:safeText(value.topic||'',80,false)};
  for(const field of fields)data[field]=safeText(value[field]||'',6000,false);
  data.definition=null;
  if(value.definition){try{data.definition=validateDefinition(value.definition,fold).definition;}catch{throw new HttpError(400,'规则格式不正确，请重新整理。');}}
  return data;
}
function sourceValid(page,revision,payload) {
  return page && page.correction_status==='confirmed' && page.correction_revision===revision && page.corrected_text.includes(payload.quote);
}
function publicRow(row) {
  const {author_key,reviewer_key,review_token,payload,published_payload,...safe}=row;
  return {...safe,payload:JSON.parse(payload),published_payload:published_payload?JSON.parse(published_payload):null};
}
export async function submissionRoute({path,method,request,db,viewer,guard,bookFor,normalize,fold,url}) {
  if(!path.startsWith('/api/submissions'))return null;
  requireCards(viewer);
  if(path==='/api/submissions'&&method==='GET') {
    const args=[...guard.args];let where=guard.sql;
    const scope=url.searchParams.get('scope')||'all';if(!['all','mine'].includes(scope))throw new HttpError(400,'提交范围不正确。');
    if(!viewer.core||scope==='mine'){where+=' AND s.author_key=?';args.push(viewer.actor);}
    const status=url.searchParams.get('status')||'all';
    if(!['all','pending','approved','rejected'].includes(status))throw new HttpError(400,'审核状态不正确。');
    if(status!=='all'){where+=' AND s.status=?';args.push(status);}
    const count=await db.prepare(`SELECT COUNT(*) AS total FROM card_submissions s JOIN books b ON b.id=s.book_id WHERE ${where}`).bind(...args).first();
    const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0)));
    const rows=await db.prepare(`SELECT s.*,b.title AS book_title,b.level FROM card_submissions s JOIN books b ON b.id=s.book_id WHERE ${where} ORDER BY s.created_at DESC,s.id LIMIT 20 OFFSET ?`).bind(...args,offset).all();
    return {submissions:rows.results.map(publicRow),total:count.total,offset};
  }
  if(path==='/api/submissions'&&method==='POST') {
    const data=await jsonBody(request,100000),book=await bookFor(db,safeText(data.bookId,60),viewer),n=positiveInt(data.page,book.page_count);
    const payload=payloadFor(data.payload,fold),sourceRevision=version(data.sourceRevision),base=version(data.baseCardRevision);
    const page=await db.prepare('SELECT * FROM pages WHERE book_id=? AND page=?').bind(book.id,n).first();
    if(!sourceValid(page,sourceRevision,payload))throw conflict();
    let cardId=null;
    if(data.cardId){cardId=safeText(data.cardId,36);const card=await db.prepare('SELECT * FROM technique_cards WHERE id=? AND book_id=? AND page=?').bind(cardId,book.id,n).first();
      if(!card||card.revision!==base||card.source_revision!==sourceRevision||(!viewer.core&&card.status!=='approved'))throw conflict();
    }else if(base!==0)throw conflict();
    const id=crypto.randomUUID();
    // Bounded submissions prevent accidental repeated clicks from filling the queue indefinitely.
    const result=await db.prepare("INSERT INTO card_submissions (id,book_id,page,card_id,author_key,author_label,payload,base_card_revision,source_revision,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM card_submissions WHERE author_key=? AND created_at>?)<100").bind(id,book.id,n,cardId,viewer.actor,viewer.actorLabel,JSON.stringify(payload),base,sourceRevision,now(),viewer.actor,now()-86400).run();
    if(!result.meta.changes)throw new HttpError(429,'今天的提交次数已达到上限，请明天继续。');
    return {ok:true,id};
  }
  const match=path.match(/^\/api\/submissions\/([a-f0-9-]{36})(?:\/(approve|reject))?$/);
  if(!match)throw new HttpError(404,'找不到这份提交。');
  const [,id,decision]=match;
  const row=await db.prepare('SELECT * FROM card_submissions WHERE id=?').bind(id).first();
  if(!row||(!viewer.core&&row.author_key!==viewer.actor))throw new HttpError(404,'找不到这份提交。');
  const book=await bookFor(db,row.book_id,viewer);
  const page=await db.prepare('SELECT * FROM pages WHERE book_id=? AND page=?').bind(row.book_id,row.page).first();
  const card=row.card_id?await db.prepare('SELECT * FROM technique_cards WHERE id=?').bind(row.card_id).first():null;
  if(method==='GET'&&!decision)return {submission:publicRow({...row,book_title:book.title,level:book.level}),sourceCurrent:sourceValid(page,row.source_revision,JSON.parse(row.payload))&&(!row.card_id||card?.revision===row.base_card_revision),sourceText:page?.correction_status==='confirmed'?page.corrected_text:'',currentCard:viewer.core?card:null};
  if(!viewer.core)throw new HttpError(403,'审核与发布需要核心管理人权限。');
  if(method!=='POST'||!decision)throw new HttpError(405,'此操作不支持。');
  const data=await jsonBody(request,100000),note=safeText(data.note||'',4000,false);
  if(row.status!=='pending')throw conflict();
  if(decision==='reject') {
    if(!note.trim())throw new HttpError(400,'请填写退回原因，方便提交人修改。');
    const result=await db.prepare("UPDATE card_submissions SET status='rejected',decision_note=?,reviewer_key=?,decided_at=? WHERE id=? AND status='pending'").bind(note,viewer.actor,now(),id).run();
    if(!result.meta.changes)throw conflict();return {ok:true};
  }
  const payload=payloadFor(data.payload,fold);
  if(data.humanConfirmed!==true)throw new HttpError(400,'请勾选已核对原文与规则，再批准发布。');
  if(!sourceValid(page,row.source_revision,payload)||row.card_id&&(!card||card.revision!==row.base_card_revision))throw conflict();
  if(!payload.conditions.trim()||!payload.conclusion.trim()||payload.questions.trim()||/[□�]|\[(?:疑|缺|待核)|【(?:疑|缺|待核)/u.test(payload.quote))throw new HttpError(400,'请补齐条件、结论并处理待核问题。');
  if(!payload.definition||validateDefinition(payload.definition,fold).issues.length)throw new HttpError(400,'请先整理并核对可计算规则，再发布给模型调用。');
  const cardId=row.card_id||crypto.randomUUID(),revision=row.card_id?row.base_card_revision+1:1,time=now(),token=crypto.randomUUID();
  const claim=db.prepare("UPDATE card_submissions SET status='approved',decision_note=?,reviewer_key=?,decided_at=?,published_card_id=?,published_payload=?,review_token=? WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM pages p WHERE p.book_id=? AND p.page=? AND p.correction_revision=? AND p.correction_status='confirmed') AND (card_id IS NULL OR EXISTS (SELECT 1 FROM technique_cards c WHERE c.id=card_id AND c.revision=base_card_revision))").bind(note,viewer.actor,time,cardId,JSON.stringify(payload),token,id,book.id,row.page,row.source_revision);
  const claimed="EXISTS (SELECT 1 FROM card_submissions WHERE id=? AND review_token=? AND status='approved')";
  const values=[payload.title,payload.quote,payload.topic,normalize(payload.topic),cardIndex(payload,normalize),...fields.map(k=>payload[k]),row.source_revision,book.source_hash,await digest(page.corrected_text)];
  const writeCard=row.card_id?
    db.prepare(`UPDATE technique_cards SET title=?,quote=?,topic=?,topic_key=?,search_text=?,conditions=?,conclusion=?,exceptions=?,terminology=?,questions=?,notes=?,source_revision=?,source_hash=?,source_text_hash=?,status='approved',revision=revision+1,approved_at=?,updated_at=? WHERE id=? AND ${claimed}`).bind(...values,time,time,cardId,id,token):
    db.prepare(`INSERT INTO technique_cards (id,book_id,page,title,quote,topic,topic_key,search_text,conditions,conclusion,exceptions,terminology,questions,notes,source_revision,source_hash,source_text_hash,status,revision,created_at,updated_at,approved_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'approved',1,?,?,? WHERE ${claimed}`).bind(cardId,book.id,row.page,...values,time,time,time,id,token);
  const writeRule=db.prepare(`INSERT INTO card_rules (card_id,definition,card_revision,status,revision,updated_at,confirmed_at) SELECT ?,?,?,'confirmed',1,?,? WHERE ${claimed} ON CONFLICT(card_id) DO UPDATE SET definition=excluded.definition,card_revision=excluded.card_revision,status='confirmed',revision=card_rules.revision+1,updated_at=excluded.updated_at,confirmed_at=excluded.confirmed_at`).bind(cardId,JSON.stringify(payload.definition),revision,time,time,id,token);
  // Claim, card replacement and executable rule become visible in one transaction.
  const result=await db.batch([claim,writeCard,writeRule]);
  if(!result[0].meta.changes)throw conflict();
  return {ok:true,cardId,revision};
}
