import { HttpError, jsonBody, now, positiveInt } from './security.js';
import { validateDefinition } from '../src/rule-engine.mjs';
import { requireCards } from './roles.js';

const conflict = () => new HttpError(409,'规则、卡片或原文已有变化，请重新打开并核对后再保存。');
const revision = value => {if(!Number.isSafeInteger(value)||value<0)throw new HttpError(400,'版本编号不正确。');return value;};
const currentSource = c => c.status==='approved' && c.correction_status==='confirmed' && c.source_revision===c.correction_revision;

// The parent route has already checked access to the source book.
export async function ruleRoute({action,method,request,db,book,viewer,fold}) {
  const match=action.match(/^pages\/(\d+)\/cards\/([a-f0-9-]{36})\/rule(?:\/(confirm))?$/);
  if(!match)return null;
  requireCards(viewer);
  const [,pageValue,cardId,confirm]=match,n=positiveInt(Number(pageValue),book.page_count);
  const card=await db.prepare('SELECT c.*,p.correction_revision,p.correction_status FROM technique_cards c JOIN pages p ON p.book_id=c.book_id AND p.page=c.page WHERE c.id=? AND c.book_id=? AND c.page=?').bind(cardId,book.id,n).first();
  if(!card||(!viewer.owner&&!currentSource(card)))throw new HttpError(404,'找不到当前可用的规则，或尚未获得访问权限。');
  const row=await db.prepare('SELECT * FROM card_rules WHERE card_id=?').bind(cardId).first();
  if(method==='GET'&&!confirm) {
    const usable=row && row.status==='confirmed' && row.card_revision===card.revision && currentSource(card);
    const visible=viewer.owner||usable;
    const sourceCurrent=card.source_revision===card.correction_revision;
    const rule=row&&visible?{...row,definition:JSON.parse(row.definition),state:row.card_revision!==card.revision||!sourceCurrent||(row.status==='confirmed'&&!currentSource(card))?'stale':row.status}:null;
    return {owner:viewer.owner,canConfirm:currentSource(card),sourceCurrent,rule,card:{id:card.id,book_id:book.id,page:n,title:card.title,quote:card.quote,conditions:card.conditions,exceptions:card.exceptions,conclusion:card.conclusion,questions:card.questions,revision:card.revision,source_revision:card.source_revision,source_hash:card.source_hash,book_title:book.title,level:book.level,kind:book.kind}};
  }
  if(!viewer.owner)throw new HttpError(403,'编辑和确认规则需要核心管理人权限。');
  const data=await jsonBody(request,65536);
  if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'提交内容格式不正确。');
  const base=revision(data.baseRevision),cardRevision=revision(data.cardRevision);
  if(cardRevision!==card.revision||card.source_revision!==card.correction_revision)throw conflict();
  if(confirm&&method==='POST') {
    if(!row||row.revision!==base||row.card_revision!==cardRevision||!currentSource(card))throw conflict();
    if(data.humanConfirmed!==true)throw new HttpError(400,'请先核对规则含义与原文出处，再勾选人工确认。');
    const {issues}=validateDefinition(JSON.parse(row.definition),fold);
    if(issues.length)throw new HttpError(400,'规则仍有待确认的问题，请先检查并修正。');
    const saved=await db.prepare("UPDATE card_rules SET status='confirmed',revision=revision+1,confirmed_at=?,updated_at=? WHERE card_id=? AND revision=? AND card_revision=? AND EXISTS (SELECT 1 FROM technique_cards c JOIN pages p ON p.book_id=c.book_id AND p.page=c.page WHERE c.id=? AND c.revision=? AND c.status='approved' AND c.source_revision=p.correction_revision AND p.correction_status='confirmed')").bind(now(),now(),cardId,base,cardRevision,cardId,cardRevision).run();
    if(!saved.meta.changes)throw conflict();
    return {ok:true,revision:base+1};
  }
  if(method!=='PUT'||confirm)throw new HttpError(405,'此操作不支持。');
  let checked;try{checked=validateDefinition(data.definition,fold);}catch{throw new HttpError(400,'规则格式不正确或超过限制，请检查字段与条件。');}
  const definition=JSON.stringify(checked.definition),time=now();
  const guard='EXISTS (SELECT 1 FROM technique_cards c JOIN pages p ON p.book_id=c.book_id AND p.page=c.page WHERE c.id=? AND c.revision=? AND c.source_revision=p.correction_revision)';
  const saved=base===0?
    await db.prepare(`INSERT INTO card_rules (card_id,definition,card_revision,updated_at) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(card_id) DO NOTHING`).bind(cardId,definition,cardRevision,time,cardId,cardRevision).run():
    await db.prepare(`UPDATE card_rules SET definition=?,card_revision=?,status='draft',revision=revision+1,updated_at=?,confirmed_at=NULL WHERE card_id=? AND revision=? AND ${guard}`).bind(definition,cardRevision,time,cardId,base,cardId,cardRevision).run();
  if(!saved.meta.changes)throw conflict();
  return {ok:true,revision:base+1,issues:checked.issues};
}
