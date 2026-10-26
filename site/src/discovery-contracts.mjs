export const DISCOVERY_VERSION=1;
export function supportsWebDiscovery(baseUrl,model){
  return baseUrl==='https://dashscope.aliyuncs.com/compatible-mode/v1'&&/^qwen-(?:plus|flash)(?:-latest|-\d{4}-\d{2}-\d{2})?$/.test(model||'');
}
export function publicWebUrl(value){
  if(typeof value!=='string'||value.length>2000)return null;
  try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(u.hostname)||/(?:^|\.)(?:localhost|local|internal|onion)$/.test(u.hostname))return null;u.hash='';return u.href;}catch{return null;}
}
export function discoveryInput(data){
  if(data?.publicConfirmed!==true||typeof data.question!=='string'||!data.question.trim()||data.question.length>400)throw Error('请填写 400 字以内的公开问题，并确认不含私密内容。');
  const bookId=data.bookId||'all';if(typeof bookId!=='string'||bookId.length>100)throw Error('材料范围无效。');
  const queries=data.queries?.length?data.queries:[data.question.trim().slice(0,80)];
  if(!Array.isArray(queries)||queries.length>3||queries.some(q=>typeof q!=='string'||!q.trim()||q.length>80))throw Error('补充检索词最多三组，每组 80 字。');
  const domains=data.domains||[];if(!Array.isArray(domains)||domains.length>3||domains.some(d=>typeof d!=='string'||d.length>200||!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)||publicWebUrl('https://'+d+'/')!=='https://'+d+'/'))throw Error('最多填写三个公开网站域名，例如 example.org。');
  const freshness=data.freshness??0;if(![0,7,30,180,365].includes(freshness))throw Error('搜索时间范围无效。');
  return {question:data.question.trim(),bookId,queries:[...new Set(queries.map(q=>q.trim()))],domains:[...new Set(domains)],freshness};
}
export function fuseDiscoveryResults(lists){
  const records=new Map();
  for(const list of lists){const seen=new Set();for(const [i,c] of list.entries()){const key=JSON.stringify([c.book_id,c.page,c.start,c.end,c.source_hash,c.revision,c.source]);if(seen.has(key))continue;seen.add(key);const previous=records.get(key);records.set(key,{citation:c,score:(previous?.score||0)+1/(60+i+1)});}}
  return [...records.values()].sort((a,b)=>b.score-a.score).slice(0,6).map(x=>x.citation);
}
export function normalizeWebAnswer(value,books,domains=[]){
  const message=value?.output?.choices?.[0];
  if(message?.finish_reason!=='stop'||typeof message.message?.content!=='string'||message.message.content.length>14000)throw Error('联网回答不完整，未作为研究结论。');
  const rawSources=value.output.search_info?.search_results;
  if(!Array.isArray(rawSources)||!rawSources.length)throw Error('服务商没有返回搜索来源，本次不能当作联网查询成功；不会自动重试。');
  const sources=[],seen=new Set();
  for(const item of rawSources.slice(0,50)){const url=publicWebUrl(item?.url),id=item?.index;if(!url||!Number.isInteger(id)||id<1||id>100||seen.has(id))continue;const host=new URL(url).hostname;if(domains.length&&!domains.some(d=>host===d||host.endsWith('.'+d)))continue;seen.add(id);sources.push({id,title:String(item.title||host).slice(0,240),url});}
  const paragraphs=[];let unverifiedCount=0;
  for(const text of message.message.content.split(/\n+/).map(t=>t.trim()).filter(Boolean)){
    const web=[...new Set([...text.matchAll(/\[ref_(\d+)\]/g)].map(m=>Number(m[1])))],book=[...new Set([...text.matchAll(/\[book_(\d+)\]/g)].map(m=>Number(m[1])))];
    if((!web.length&&!book.length)||web.some(n=>!seen.has(n))||book.some(n=>n<1||n>books.length)){unverifiedCount++;continue;}
    paragraphs.push({text,web,book});
  }
  if(!sources.length||!paragraphs.some(p=>p.web.length))throw Error('回答没有可核对的网页出处，已保留书库结果；不会自动重试。');
  return {sources,paragraphs,unverifiedCount};
}
export function stableDiscoveryJson(value){
  if(Array.isArray(value))return '['+value.map(stableDiscoveryJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableDiscoveryJson(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
