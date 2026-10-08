// Provenance confirms a literal source and an unchanged condition, not its interpretation.
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='provenance').sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export const conditionSignature=condition=>JSON.stringify(canonical(condition));
export function bindConditionSource(condition,original,quote){
  const start=original.indexOf(quote);if(start<0||!quote)return condition;
  return {...condition,provenance:{start,end:start+quote.length,quote,signature:conditionSignature(condition)}};
}
export function conditionSource(condition,original){
  const p=condition?.provenance;if(!p)return {state:'missing'};
  if(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<=p.start||typeof p.quote!=='string'||p.quote.length>1600||original.slice(p.start,p.end)!==p.quote||p.signature!==conditionSignature(condition))return {state:'stale'};
  return {state:'linked',start:p.start,end:p.end,quote:p.quote};
}
export function renderConditionSource(condition,original,{el}){
  const source=conditionSource(condition,original),detail=el('details','tech-source-proof');
  detail.append(el('summary','',source.state==='linked'?'查看条件对应原句':source.state==='stale'?'原句对应已失效 · 请重新核对':'尚未关联原句 · 请人工核对'));
  if(source.state==='linked'){
    const line=el('p','raw-page-text');line.append(document.createTextNode(original.slice(Math.max(0,source.start-60),source.start)),el('mark','',source.quote),document.createTextNode(original.slice(source.end,source.end+60)));
    detail.append(line,el('p','muted','仅确认原句位置与条件未被修改；组合、例外和含义仍需人工核对。'));
  }else detail.append(el('p','muted','原文或条件已修改，或这条条件由手动建立。请对照全文核对，不将其视为 AI 已验证的规则。'));
  return detail;
}
