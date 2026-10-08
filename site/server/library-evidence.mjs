import {pageText,bestPassage} from '../src/evidence-ranking.mjs';
import {searchLibrary} from './library-search.mjs';
import {digest} from './security.js';

export function pageRanges(numbers) {
  const sorted=[...new Set(numbers)].sort((a,b)=>a-b),ranges=[];
  for(const n of sorted){const last=ranges.at(-1);if(last&&last[1]+1===n)last[1]=n;else ranges.push([n,n]);}
  return ranges;
}
export async function bookReadiness(db,book,url) {
  // The report returns metadata only, and is reached only after bookFor authorization.
  const {results}=await db.prepare(`SELECT page,image_ready,correction_status,
    length(trim(raw_text)) AS raw_length,
    CASE WHEN correction_status='confirmed' THEN length(trim(corrected_text)) ELSE 0 END AS corrected_length,
    CASE WHEN json_valid(reviewed) THEN EXISTS(SELECT 1 FROM json_each(reviewed) r WHERE length(trim(json_extract(r.value,'$.text')))>0) ELSE 0 END AS reviewed_text
    FROM pages WHERE book_id=? ORDER BY page`).bind(book.id).all();
  const expected=Number(book.page_count)||0,rows=new Map(results.filter(r=>r.page>=1&&r.page<=expected).map(r=>[r.page,r]));
  const missing=[],empty=[],images=[],unconfirmed=[];
  for(let n=1;n<=expected;n++){
    const row=rows.get(n);if(!row){missing.push(n);continue;}
    if(!(row.raw_length||row.corrected_length||row.reviewed_text))empty.push(n);
    if(book.kind==='pdf'&&!row.image_ready)images.push(n);
    if(row.correction_status!=='confirmed')unconfirmed.push(n);
  }
  const first=Math.min(Math.max(1,expected),Math.max(1,Math.floor(Number(url?.searchParams.get('page'))||1)));
  const pages=[];
  for(let page=first;page<=Math.min(expected,first+24);page++){
    const row=rows.get(page),hasText=Boolean(row&&(row.raw_length||row.corrected_length||row.reviewed_text));
    pages.push({page,saved:Boolean(row),searchable:hasText,image_ready:book.kind==='pdf'?Boolean(row?.image_ready):null,
      confirmed:row?.correction_status==='confirmed',text_source:row?.corrected_length?'confirmed':row?.raw_length?'extracted':row?.reviewed_text?'reviewed':null});
  }
  return {book_id:book.id,expected_pages:expected,saved_pages:rows.size,text_pages:rows.size-empty.length,
    pages,page_start:first,next_page:first+25<=expected?first+25:null,
    file_ready:Boolean(book.file_ready),complete:!missing.length&&!empty.length,
    // A complete scan is not a claim of OCR accuracy or manual review.
    missing_ranges:pageRanges(missing),empty_ranges:pageRanges(empty),image_missing_ranges:pageRanges(images),
    unconfirmed_pages:unconfirmed.length,out_of_range_pages:results.length-rows.size};
}
export async function bookCorpusBatch(db,book,url) {
  const cursor=Math.max(0,Math.min(2000,Math.floor(Number(url.searchParams.get('after'))||0)));
  const {results}=await db.prepare(`SELECT page,raw_text,reviewed,corrected_text,correction_status,correction_revision
    FROM pages WHERE book_id=? AND page>? AND page<=? ORDER BY page LIMIT 8`).bind(book.id,cursor,book.page_count).all();
  const pages=await Promise.all(results.map(async row=>{
    const source=pageText(row);
    return {page:row.page,...source,revision:row.correction_revision||0,fingerprint:await digest(source.source+'\n'+source.text)};
  }));
  return {book_id:book.id,title:book.title,kind:book.kind,source_hash:book.source_hash,expected_pages:book.page_count,
    pages,next:results.length===8?results.at(-1).page:null};
}
export async function searchEvidence(options) {
  const url=new URL(options.url);url.searchParams.set('match','related');url.searchParams.set('offset','0');
  const result=await searchLibrary({...options,url});
  const citations=[];
  for(const row of result.hits){
    // Fetch again with the guard: evidence never expands a caller's material scope.
    const fresh=await options.db.prepare(`SELECT p.*,b.title,b.source_hash,b.kind FROM pages p JOIN books b ON b.id=p.book_id
      WHERE p.book_id=? AND p.page=? AND ${options.guard.sql}`).bind(row.book_id,row.page,...options.guard.args).first();
    if(!fresh)continue;
    const source=pageText(fresh),part=bestPassage(source.text,options.query,options.normalize);
    if(!part||(part.rank===0&&row.match_label!=='书名匹配'))continue;
    const {rank,...quote}=part;
    citations.push({book_id:row.book_id,page:row.page,title:fresh.title,kind:fresh.kind,...quote,source:source.source,
      revision:fresh.correction_revision||0,source_hash:fresh.source_hash,exact:options.normalize(quote.quote).includes(options.normalize(options.query)),method:row.match_label});
    if(citations.length===8)break;
  }
  return {query:options.query,citations,coverage:result.coverage,total:result.total,mode:'source-excerpts'};
}
