// Match a folded copy while retaining UTF-16 offsets into the untouched source.
export function indexedText(text, normalize) {
  let folded='', offset=0;const positions=[];
  for(const char of String(text)){
    const value=normalize(char);folded+=value;
    for(let i=0;i<value.length;i++)positions.push([offset,offset+char.length]);
    offset+=char.length;
  }
  const whole=normalize(text);
  // Phrase-aware OpenCC replacements normally retain length; use those glyphs
  // with the same source offsets when they do.
  if(whole.length===folded.length)folded=whole;
  return {folded,positions};
}

function literalRanges(text,term){
  const ranges=[];let from=0,index;
  while(term&&(index=text.indexOf(term,from))!==-1&&ranges.length<500){ranges.push({start:index,end:index+term.length,kind:'exact'});from=index+term.length;}
  return ranges;
}

function nearRanges(text,term){
  // Substring edit distance permits missing/mistyped OCR characters, but never
  // highlights scattered characters as if they formed a quotation.
  if(term.length<4||term.length>160)return [];
  const limit=Math.min(8,Math.floor(term.length*.22)),found=[];
  let previous=Uint16Array.from({length:term.length+1},(_,i)=>i),starts=new Int32Array(term.length+1);
  let row=new Uint16Array(term.length+1),nextStarts=new Int32Array(term.length+1);
  for(let i=0;i<text.length;i++){
    row[0]=0;nextStarts[0]=i+1;
    for(let j=1;j<=term.length;j++){
      const diagonal=previous[j-1]+(text[i]===term[j-1]?0:1),insertion=previous[j]+1,deletion=row[j-1]+1;
      if(diagonal<=insertion&&diagonal<=deletion){row[j]=diagonal;nextStarts[j]=starts[j-1];}
      else if(insertion<=deletion){row[j]=insertion;nextStarts[j]=starts[j];}
      else{row[j]=deletion;nextStarts[j]=nextStarts[j-1];}
    }
    const cost=row[term.length],start=nextStarts[term.length],end=i+1;
    if(cost<=limit&&end-start>=term.length-limit){
      const last=found.at(-1),candidate={start,end,kind:'near',cost};
      if(last&&start<last.end){if(cost<last.cost||(cost===last.cost&&Math.abs(end-start-term.length)<Math.abs(last.end-last.start-term.length)))found[found.length-1]=candidate;}
      else if(found.length<500)found.push(candidate);
    }
    [previous,row]=[row,previous];[starts,nextStarts]=[nextStarts,starts];
  }
  return found;
}

export function highlightRanges(text,query,normalize,{similar=true}={}){
  const {folded,positions}=indexedText(text,normalize),term=normalize(query);
  if(!term||!positions.length)return [];
  let ranges=literalRanges(folded,term);
  if(!ranges.length){
    const tokens=[...new Set(String(query).trim().split(/[\s,，、;；]+/u).map(normalize).filter(Boolean))];
    if(tokens.length>1)ranges=tokens.flatMap(t=>literalRanges(folded,t));
    else if(similar)ranges=nearRanges(folded,term);
  }
  const mapped=ranges.map(r=>({start:positions[r.start][0],end:positions[r.end-1][1],kind:r.kind})).sort((a,b)=>a.start-b.start||b.end-a.end);
  const merged=[];
  for(const range of mapped){const last=merged.at(-1);if(last&&range.start<last.end){last.end=Math.max(last.end,range.end);if(range.kind==='exact')last.kind='exact';}else if(merged.length<500)merged.push(range);}
  return merged;
}

export function highlightText(node,text,query,normalize,options){
  node.replaceChildren();const ranges=highlightRanges(text,query,normalize,options);let offset=0;
  for(const range of ranges){node.append(document.createTextNode(text.slice(offset,range.start)));const mark=document.createElement('mark');mark.className='search-highlight '+(range.kind==='near'?'search-highlight-near':'');mark.textContent=text.slice(range.start,range.end);mark.title=range.kind==='near'?'近似文字，请核对原文':'搜索词匹配（支持简繁）';node.append(mark);offset=range.end;}
  node.append(document.createTextNode(text.slice(offset)));return ranges;
}

export function imageMatchRegions(regions,query,normalize,options){
  let text='';const spans=[];
  for(const r of regions){const start=text.length;text+=r.text+'\n';spans.push({start,end:text.length-1,region:r});}
  const ranges=highlightRanges(text,query,normalize,options),rectangles=[];
  for(let match=0;match<ranges.length;match++){
    const range=ranges[match];
    for(const span of spans){if(span.start>=range.end)break;if(span.end>range.start&&span.start<range.end)rectangles.push({...span.region,kind:range.kind,match});}
  }
  return {rectangles,count:ranges.length};
}
