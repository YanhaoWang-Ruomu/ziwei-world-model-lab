import { HttpError, jsonBody, safeText, now, digest, positiveInt } from './security.js';
import { cardIndex } from './cards.js';
import { requireCards } from './roles.js';

const revisionNumber = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw new HttpError(400, '版本编号不正确。');
  return value;
};
const unresolvedGlyph = text => /[□�]|\[(?:疑|缺|待核)|【(?:疑|缺|待核)/u.test(text);
const requireOwner = viewer => { if (!viewer.owner) throw new HttpError(403, '校订与整理需要核心管理人权限。'); };
const conflict = () => new HttpError(409, '内容已有新版本，请重新打开这一页后再保存。');

export function correctionFor(row, owner) {
  // Unconfirmed text and notes are never exposed through reader endpoints.
  if (!owner && row.correction_status !== 'confirmed') return { correction_status: 'unreviewed', correction_revision: 0 };
  const value = { correction_status: row.correction_status, correction_revision: row.correction_revision,
    corrected_text: row.corrected_text, correction_updated_at: row.correction_updated_at };
  if (owner) Object.assign(value, { unresolved: row.unresolved, correction_note: row.correction_note });
  return value;
}

// The caller checks book-level read/write access before entering this handler.
export async function reviewRoute({ action, method, request, db, book, viewer, normalize }) {
  const match = action.match(/^pages\/(\d+)\/(revisions|cards)(?:\/([a-f0-9-]{36})(\/approve)?)?$/);
  if (!match) return null;
  const [, pageValue, collection, cardId, approve] = match;
  if(collection==='cards')requireCards(viewer);
  const n = positiveInt(Number(pageValue), book.page_count);
  const page = await db.prepare('SELECT * FROM pages WHERE book_id=? AND page=?').bind(book.id, n).first();
  if (!page) throw new HttpError(404, '这一页尚未识别。');
  if (collection === 'revisions') {
    requireOwner(viewer);
    if (cardId) throw new HttpError(404, '此地址不存在。');
    if (method === 'GET') {
      const rows = await db.prepare('SELECT revision,corrected_text,unresolved,note,status,raw_hash,created_at FROM page_revisions WHERE book_id=? AND page=? ORDER BY revision DESC LIMIT 20').bind(book.id,n).all();
      return { revisions: rows.results };
    }
    if (method !== 'POST') throw new HttpError(405, '此操作不支持。');
    const data = await jsonBody(request);
    const base = revisionNumber(data.baseRevision);
    const text = safeText(data.text,120000,false);
    const unresolved = safeText(data.unresolved || '',4000,false);
    const note = safeText(data.note || '',4000,false);
    const confirmed = data.confirmed === true;
    if (confirmed && (data.humanConfirmed !== true || unresolved.trim() || unresolvedGlyph(text))) throw new HttpError(400, '请先处理疑字，并勾选已逐字对照原页。');
    const status = confirmed ? 'confirmed' : 'draft';
    const time = now(); const rawHash = await digest(page.raw_text);
    // A D1 batch is transactional. The version guard prevents lost updates.
    const changes = await db.batch([
      db.prepare('INSERT INTO page_revisions (book_id,page,revision,corrected_text,unresolved,note,status,raw_hash,created_at) SELECT book_id,page,correction_revision+1,?,?,?,?,?,? FROM pages WHERE book_id=? AND page=? AND correction_revision=?').bind(text,unresolved,note,status,rawHash,time,book.id,n,base),
      db.prepare('UPDATE pages SET correction_revision=correction_revision+1,corrected_text=?,correction_search=?,correction_status=?,unresolved=?,correction_note=?,correction_updated_at=? WHERE book_id=? AND page=? AND correction_revision=?').bind(text,confirmed?normalize(text):'',status,unresolved,note,time,book.id,n,base),
    ]);
    if (!changes[0].meta.changes) throw conflict();
    return { ok: true, revision: base+1, status };
  }

  if (method === 'GET' && !cardId) {
    const guard = viewer.owner ? '' : " AND c.status='approved' AND p.correction_status='confirmed' AND c.source_revision=p.correction_revision";
    const rows = await db.prepare(`SELECT c.*,CASE WHEN c.source_revision<>p.correction_revision OR p.correction_status<>'confirmed' THEN 1 ELSE 0 END AS source_changed FROM technique_cards c JOIN pages p ON p.book_id=c.book_id AND p.page=c.page WHERE c.book_id=? AND c.page=?${guard} ORDER BY c.created_at,c.id`).bind(book.id,n).all();
    return { cards: rows.results };
  }
  requireOwner(viewer);
  const data = await jsonBody(request);
  if (approve && method === 'POST') {
    const base = revisionNumber(data.baseRevision);
    if (data.humanConfirmed !== true) throw new HttpError(400, '请确认卡片的条件、结论及原文出处。');
    const card = await db.prepare('SELECT * FROM technique_cards WHERE id=? AND book_id=? AND page=?').bind(cardId,book.id,n).first();
    if (!card) throw new HttpError(404, '找不到这张卡片。');
    if (card.revision !== base) throw conflict();
    if (page.correction_status !== 'confirmed' || card.source_revision !== page.correction_revision || !(card.quote.trim() && page.corrected_text.includes(card.quote)) || card.questions.trim() || unresolvedGlyph(card.quote) || !card.conditions.trim() || !card.conclusion.trim()) throw new HttpError(409, '请先确认本页校订稿，核对原文摘录，补齐条件和结论并处理待核问题，再保存卡片。');
    const result = await db.prepare("UPDATE technique_cards SET status='approved',revision=revision+1,approved_at=?,updated_at=? WHERE id=? AND book_id=? AND page=? AND revision=? AND EXISTS (SELECT 1 FROM pages p WHERE p.book_id=? AND p.page=? AND p.correction_revision=? AND p.correction_status='confirmed')").bind(now(),now(),cardId,book.id,n,base,book.id,n,card.source_revision).run();
    if (!result.meta.changes) throw conflict();
    return { ok: true };
  }
  if (approve || !((method === 'POST' && !cardId) || (method === 'PUT' && cardId))) throw new HttpError(405, '此操作不支持。');
  const sourceRevision = revisionNumber(data.sourceRevision);
  if (sourceRevision !== page.correction_revision) throw conflict();
  const source = sourceRevision ? page.corrected_text : page.raw_text;
  const title = safeText(data.title,160); const quote = safeText(data.quote,12000);
  const topic = safeText(data.topic ?? '',80,false).trim();
  if (!source.includes(quote)) throw new HttpError(400, '原文摘录须逐字复制自本页当前文字，不能改写。');
  const fields = ['conditions','conclusion','exceptions','terminology','questions','notes'].map(k=>safeText(data[k] || '',6000,false));
  const searchText=cardIndex({title,quote,topic,...Object.fromEntries(['conditions','conclusion','exceptions','terminology','questions','notes'].map((k,i)=>[k,fields[i]]))},normalize);
  const textHash = await digest(source); const time = now(); const id = cardId || crypto.randomUUID();
  if (cardId) {
    const result = await db.prepare("UPDATE technique_cards SET title=?,quote=?,topic=?,topic_key=?,search_text=?,conditions=?,conclusion=?,exceptions=?,terminology=?,questions=?,notes=?,source_revision=?,source_hash=?,source_text_hash=?,status='draft',revision=revision+1,updated_at=?,approved_at=NULL WHERE id=? AND book_id=? AND page=? AND revision=? AND EXISTS (SELECT 1 FROM pages p WHERE p.book_id=? AND p.page=? AND p.correction_revision=?)").bind(title,quote,topic,normalize(topic),searchText,...fields,sourceRevision,book.source_hash,textHash,time,id,book.id,n,revisionNumber(data.baseRevision),book.id,n,sourceRevision).run();
    if (!result.meta.changes) throw conflict();
  } else {
    const result = await db.prepare('INSERT INTO technique_cards (id,book_id,page,title,quote,topic,topic_key,search_text,conditions,conclusion,exceptions,terminology,questions,notes,source_revision,source_hash,source_text_hash,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM pages WHERE book_id=? AND page=? AND correction_revision=?)').bind(id,book.id,n,title,quote,topic,normalize(topic),searchText,...fields,sourceRevision,book.source_hash,textHash,time,time,book.id,n,sourceRevision).run();
    if (!result.meta.changes) throw conflict();
  }
  return { ok: true, id };
}
