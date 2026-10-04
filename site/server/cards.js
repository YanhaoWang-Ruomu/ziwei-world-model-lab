import { safeText, HttpError } from './security.js';

export function cardIndex(card, normalize) {
  return normalize(['title','topic','quote','conditions','conclusion','exceptions','terminology','questions','notes'].map(k=>card[k]||'').join('\n'));
}
const joins = 'FROM technique_cards c JOIN books b ON b.id=c.book_id JOIN pages p ON p.book_id=c.book_id AND p.page=c.page';
const state = "CASE WHEN c.source_revision<>p.correction_revision OR (c.status='approved' AND p.correction_status<>'confirmed') THEN 'stale' WHEN c.status='approved' AND p.correction_status='confirmed' THEN 'approved' ELSE 'draft' END";

export async function listCards({ db, viewer, guard, url, normalize }) {
  const params=url.searchParams; const args=[...guard.args]; let scope=guard.sql;
  if(!viewer.owner)scope+=" AND c.status='approved' AND p.correction_status='confirmed' AND c.source_revision=p.correction_revision";
  const level=params.get('level')||'all';
  if(!['all','public','special'].includes(level))throw new HttpError(400,'请选择公开或特殊卡片。');
  if(level!=='all'){scope+=' AND b.level=?';args.push(level);}

  // Older cards are indexed in bounded batches, without exposing their contents.
  // A revision guard prevents concurrent edits from receiving a stale index.
  const pending=await db.prepare(`SELECT c.* ${joins} WHERE ${scope} AND c.search_text IS NULL LIMIT 100`).bind(...args).all();
  if(pending.results.length){
    await db.batch(pending.results.map(c=>db.prepare('UPDATE technique_cards SET topic_key=?,search_text=? WHERE id=? AND revision=? AND search_text IS NULL').bind(normalize(c.topic),cardIndex(c,normalize),c.id,c.revision)));
    const remaining=await db.prepare(`SELECT c.id ${joins} WHERE ${scope} AND c.search_text IS NULL LIMIT 1`).bind(...args).first();
    if(remaining)return { preparing:true };
  }
  const [bookRows,topicRows]=await Promise.all([
    db.prepare(`SELECT DISTINCT b.id,b.title ${joins} WHERE ${scope} ORDER BY b.title,b.id`).bind(...args).all(),
    db.prepare(`SELECT c.topic_key AS value,MIN(c.topic) AS label ${joins} WHERE ${scope} GROUP BY c.topic_key ORDER BY label`).bind(...args).all(),
  ]);
  let filter=scope;const values=[...args];
  const book=params.get('book');if(book&&book!=='all'){filter+=' AND b.id=?';values.push(safeText(book,60));}
  if(params.has('topic')){filter+=' AND c.topic_key=?';values.push(normalize(safeText(params.get('topic'),80,false)));}
  const query=safeText(params.get('q')||'',160,false);
  if(query.trim()&&!normalize(query))filter+=' AND 0=1';
  else for(const word of query.trim().split(/[\s,，、;；]+/u).map(normalize).filter(Boolean).slice(0,8)){filter+=' AND instr(c.search_text,?)>0';values.push(word);}
  const groups=await db.prepare(`SELECT ${state} AS state,COUNT(*) AS count ${joins} WHERE ${filter} GROUP BY state`).bind(...values).all();
  const counts={approved:0,draft:0,stale:0};for(const row of groups.results)counts[row.state]=row.count;
  const selected=params.get('status')||'all';
  if(!['all','approved','draft','stale'].includes(selected))throw new HttpError(400,'卡片状态不正确。');
  if(selected!=='all'){filter+=` AND (${state})=?`;values.push(selected);}
  const total=selected==='all'?Object.values(counts).reduce((a,b)=>a+b,0):counts[selected];
  const requested=Number(params.get('offset')||0);
  const offset=Number.isSafeInteger(requested)?Math.max(0,Math.min(requested,Math.max(0,Math.floor((total-1)/20)*20))):0;
  const rows=await db.prepare(`SELECT c.*,b.title AS book_title,b.level,b.kind AS book_kind,${state} AS state ${joins} WHERE ${filter} ORDER BY c.updated_at DESC,c.id LIMIT 20 OFFSET ?`).bind(...values,offset).all();
  const cards=rows.results.map(({search_text,topic_key,...card})=>card);
  return { cards,total,offset,counts,books:bookRows.results,topics:topicRows.results,owner:viewer.owner };
}
