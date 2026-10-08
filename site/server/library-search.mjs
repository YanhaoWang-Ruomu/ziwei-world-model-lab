import {queryParts, rankText, matchLabel, bestSnippet} from '../src/search-ranking.mjs';
import {retrievalTerms,termStats,bm25Scores,reciprocalRanks,bestPassage} from '../src/evidence-ranking.mjs';

const order=(a,b)=>b.score-a.score||a.created_at-b.created_at||(a.book_id<b.book_id?-1:a.book_id>b.book_id?1:0)||a.page-b.page;
const identity=value=>value;
function reviewedItems(value){try{const items=JSON.parse(value||'[]');return Array.isArray(items)?items:[];}catch{return [];}}

export async function searchLibrary({db, url, guard, normalize, query}) {
  const parts = queryParts(query, normalize);
  const offset = Math.max(0, Math.min(100000, Math.floor(Number(url.searchParams.get('offset')) || 0)));
  const similar = url.searchParams.get('match') !== 'exact';
  const related = url.searchParams.get('match') === 'related' && Boolean(parts.q);
  const terms=related?retrievalTerms(query,normalize):[],candidates=[],df=terms.map(()=>0);
  let corpusLength=0;
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
      if(related){
        const stats=termStats([...texts,row.title].join('\n'),terms,normalize);corpusLength+=stats.length;
        stats.tf.forEach((tf,i)=>{if(tf)df[i]++;});
        if(score>=55||stats.tf.some(Boolean))candidates.push({book_id:row.book_id,page:row.page,created_at:row.created_at,score,...stats});
        continue;
      }
      if(parts.q&&score<(similar?55:94))continue;
      total++;
      best.push({...row,reviewed,score});best.sort(order);if(best.length>offset+20)best.pop();
    }
    cursor=results.at(-1);if(results.length<40)break;
  }
  coverage.missing_pages=Math.max(0,coverage.expected_pages-coverage.saved_pages);
  if(related){
    const scores=bm25Scores(candidates,{count:coverage.saved_pages,totalLength:corpusLength,df}),key=r=>`${r.book_id}:${r.page}`;
    candidates.forEach((row,i)=>{row.bm25=scores[i];});
    const lexical=candidates.filter(r=>r.score>=55).sort(order);
    const keywords=candidates.filter(r=>r.bm25>0).sort((a,b)=>b.bm25-a.bm25||order(a,b));
    const ranks=reciprocalRanks([lexical.map(key),keywords.map(key)]);
    const tier=r=>r.score===100?3:r.score>=94?2:1;
    candidates.sort((a,b)=>tier(b)-tier(a)||(ranks.get(key(b))||0)-(ranks.get(key(a))||0)||order(a,b));
    total=candidates.length;
    // Only retrieve full texts for the selected page of results, not the entire corpus.
    const selected=await Promise.all(candidates.slice(offset,offset+20).map(async candidate=>{
      const row=await db.prepare(`SELECT p.book_id,p.page,p.raw_text,p.reviewed,p.engine,p.image_ready,
        CASE WHEN p.correction_status='confirmed' THEN p.corrected_text ELSE '' END AS corrected_text,
        b.title,b.level,b.kind,b.created_at FROM pages p JOIN books b ON b.id=p.book_id
        WHERE p.book_id=? AND p.page=? AND ${where}`).bind(candidate.book_id,candidate.page,...args).first();
      return row?{...row,score:candidate.score,reviewed:reviewedItems(row.reviewed)}:null;
    }));
    best.push(...selected.filter(Boolean));
  }
  return {total, offset, coverage, match:related?'related':similar?'similar':'exact', hits:(related?best:best.slice(offset,offset+20)).map(row => {
    const reviewed = row.reviewed;
    const texts = [row.corrected_text, ...reviewed.map(r=>r.text), row.raw_text].filter(Boolean);
    const best = texts.map(text=>({text,score:rankText(text,parts,normalize,{similar})})).sort((a,b)=>b.score-a.score)[0];
    const {created_at,aliases,...hit}=row;
    const passage=related?bestPassage(best?.text||'',query,normalize):null;
    return {...hit, reviewed, match_label:parts.q?(row.score>=55?matchLabel(row.score):'关键词关联'):'全文浏览', snippet:passage?.quote||bestSnippet(best?.text || '', query, normalize)};
  })};
}
