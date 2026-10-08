// Source-preserving retrieval primitives, shared by the server and local reader.
const questionWords = new Set(['如何','什么','是否','怎么','可以','哪些','这个','关于','里面','哪里']);
export function retrievalTokens(text, normalize) {
  const tokens=[];
  for(const part of String(text||'').match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu)||[]) {
    const value=normalize(part);
    if(/\p{Script=Han}/u.test(value)) {
      const chars=Array.from(value);
      if(chars.length===1)tokens.push(chars[0]);
      else for(let i=1;i<chars.length;i++)tokens.push(chars[i-1]+chars[i]);
    } else if(value)tokens.push(value);
  }
  return tokens;
}
export function retrievalTerms(query,normalize) {
  return [...new Set(retrievalTokens(query,normalize))].filter(t=>!questionWords.has(t)).slice(0,64);
}
export function termStats(text,terms,normalize) {
  const tokens=retrievalTokens(text,normalize),counts=new Map();
  for(const token of tokens)counts.set(token,(counts.get(token)||0)+1);
  return {length:tokens.length,tf:terms.map(t=>counts.get(t)||0)};
}
export function bm25Scores(records,{count=records.length,totalLength=records.reduce((s,r)=>s+r.length,0),df}={}) {
  const frequencies=df||Array.from({length:records[0]?.tf.length||0},(_,i)=>records.filter(r=>r.tf[i]>0).length);
  const avg=Math.max(1,totalLength/Math.max(1,count)),k=1.2,b=.75;
  return records.map(row=>row.tf.reduce((score,tf,i)=>score+(tf?Math.log(1+(count-frequencies[i]+.5)/(frequencies[i]+.5))*tf*(k+1)/(tf+k*(1-b+b*row.length/avg)):0),0));
}
export function reciprocalRanks(lists) {
  const scores=new Map();
  for(const list of lists)for(const [i,id] of [...new Set(list)].entries())scores.set(id,(scores.get(id)||0)+1/(60+i+1));
  return scores;
}
export function pageText(row) {
  let reviewed=[];try{reviewed=typeof row.reviewed==='string'?JSON.parse(row.reviewed):row.reviewed||[];}catch{}
  if(!Array.isArray(reviewed))reviewed=[];
  if(row.correction_status==='confirmed'&&String(row.corrected_text||'').trim())return {text:row.corrected_text,source:'confirmed'};
  if(String(row.raw_text||'').trim())return {text:row.raw_text,source:'extracted'};
  return {text:reviewed.map(r=>typeof r.text==='string'?r.text:'').filter(Boolean).join('\n'),source:'reviewed'};
}
export function passages(text,limit=320,overlap=48) {
  const value=String(text||'');const result=[];
  for(let start=0;start<value.length;) {
    let end=Math.min(start+limit,value.length);
    // Keep offsets in the original UTF-16 string and avoid cutting surrogate pairs.
    if(end<value.length&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;
    const quote=value.slice(start,end);
    if(quote.trim())result.push({start,end,quote});
    if(end===value.length)break;
    start=end-Math.min(overlap,Math.floor(limit/3));
    if(/[\uDC00-\uDFFF]/.test(value[start]))start++;
  }
  return result;
}
export function bestPassage(text,query,normalize) {
  const chunks=passages(text),terms=retrievalTerms(query,normalize),q=normalize(query);
  const stats=chunks.map(c=>termStats(c.quote,terms,normalize)),scores=bm25Scores(stats);
  return chunks.map((c,i)=>({...c,rank:(q&&normalize(c.quote).includes(q)?1000:0)+scores[i]})).sort((a,b)=>b.rank-a.rank||a.start-b.start)[0]||null;
}
export function cosine(a,b) {
  if(a.length!==b.length||!a.length)return 0;
  let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa&&bb?dot/Math.sqrt(aa*bb):0;
}
export function fuseEvidence(lexical,semantic,limit=6) {
  const key=r=>`${r.book_id}:${r.page}`,ranks=reciprocalRanks([lexical.map(key),semantic.map(key)]),rows=new Map();
  for(const row of lexical)rows.set(key(row),row);
  // Keep an exact quotation; otherwise use the passage selected by local semantics.
  for(const row of semantic)if(!rows.get(key(row))?.exact)rows.set(key(row),row);
  const exact=new Set(lexical.filter(r=>r.exact).map(key));
  return [...rows.values()].sort((a,b)=>Number(exact.has(key(b)))-Number(exact.has(key(a)))||(ranks.get(key(b))||0)-(ranks.get(key(a))||0)||key(a).localeCompare(key(b))).slice(0,limit);
}
