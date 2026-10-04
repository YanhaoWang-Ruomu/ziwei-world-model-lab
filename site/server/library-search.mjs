import {queryParts, rankText, matchLabel, bestSnippet} from '../src/search-ranking.mjs';

const order=(a,b)=>b.score-a.score||a.created_at-b.created_at||(a.book_id<b.book_id?-1:a.book_id>b.book_id?1:0)||a.page-b.page;
const identity=value=>value;
function reviewedItems(value){try{const items=JSON.parse(value||'[]');return Array.isArray(items)?items:[];}catch{return [];}}

export async function searchLibrary({db, url, guard, normalize, query}) {
  const parts = queryParts(query, normalize);
  const offset = Math.max(0, Math.min(100000, Math.floor(Number(url.searchParams.get('offset')) || 0)));
  const similar = url.searchParams.get('match') !== 'exact';
  if (query.trim() && !parts.q) return {total:0, hits:[], offset};
  let where = guard.sql; const args = [...guard.args];
  const book = url.searchParams.get('book'), level = url.searchParams.get('level');
  if (book && book !== 'all') { where += ' AND b.id=?'; args.push(book); }
  if (['public','special'].includes(level)) { where += ' AND b.level=?'; args.push(level); }
  // Apply the same permission boundary before evaluating titles or page text.
  const visible=await db.prepare(`SELECT b.id,b.title,b.page_count FROM books b WHERE ${where}`).bind(...args).all();
  const titles=new Map(visible.results.map(b=>{const score=rankText(b.title,parts,normalize,{similar});return [b.id,score===100?97:score];}));
  const coverage={expected_pages:visible.results.reduce((n,b)=>n+(Number(b.page_count)||0),0),saved_pages:0,text_pages:0,empty_pages:0};
  const best=[];let total=0,cursor=null;
  // Old uploads can retain an obsolete folded index. Search their preserved
  // text using today's converter, in bounded batches, without changing records.
  // Permission predicates are applied in every batch, before reading any text.
  while(true){
    const after=cursor?' AND (p.book_id>? OR (p.book_id=? AND p.page>?))':'';
    const {results}=await db.prepare(`SELECT p.book_id,p.page,p.raw_text,p.reviewed,p.aliases,p.engine,p.image_ready,
      CASE WHEN p.correction_status='confirmed' THEN p.corrected_text ELSE '' END AS corrected_text,
      b.title,b.level,b.kind,b.created_at FROM pages p JOIN books b ON b.id=p.book_id
      WHERE ${where}${after} ORDER BY p.book_id,p.page LIMIT 40`)
      .bind(...args,...(cursor?[cursor.book_id,cursor.book_id,cursor.page]:[])).all();
    if(!results.length)break;
    for(const row of results){
      coverage.saved_pages++;
      const reviewed=reviewedItems(row.reviewed),texts=[row.corrected_text,...reviewed.map(r=>r.text),row.raw_text].filter(t=>typeof t==='string'&&t.trim());
      const folded=texts.map(text=>normalize(text));
      if(folded.some(Boolean))coverage.text_pages++;else coverage.empty_pages++;
      const textScore=parts.q?rankText(folded.join('|'),parts,identity,{similar}):0;
      const aliasMatch=parts.q&&(String(row.aliases||'').split('|').some(a=>normalize(a)===parts.q)||reviewed.some(r=>Array.isArray(r.aliases)&&r.aliases.some(a=>normalize(a)===parts.q)));
      const score=Math.max(textScore,titles.get(row.book_id)||0,aliasMatch?94:0);
      if(parts.q&&score<(similar?55:94))continue;
      total++;
      best.push({...row,reviewed,score});best.sort(order);if(best.length>offset+20)best.pop();
    }
    cursor=results.at(-1);if(results.length<40)break;
  }
  coverage.missing_pages=Math.max(0,coverage.expected_pages-coverage.saved_pages);
  return {total, offset, coverage, match:similar?'similar':'exact', hits:best.slice(offset,offset+20).map(row => {
    const reviewed = row.reviewed;
    const texts = [row.corrected_text, ...reviewed.map(r=>r.text), row.raw_text].filter(Boolean);
    const best = texts.map(text=>({text,score:rankText(text,parts,normalize,{similar})})).sort((a,b)=>b.score-a.score)[0];
    const {created_at,aliases,...hit}=row;
    return {...hit, reviewed, match_label:parts.q?matchLabel(row.score):'全文浏览', snippet:bestSnippet(best?.text || '', query, normalize)};
  })};
}
