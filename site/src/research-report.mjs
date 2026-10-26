export function researchQuality(run){
  const steps=run.events||[],claims=run.result?.claims||[],citations=run.citations||[];
  return {searched:steps.some(s=>s.action==='search'),steps:run.step||0,sources:citations.length,
    citationValid:!!run.result&&claims.every(c=>Number.isInteger(c.source)&&typeof c.quote==='string'&&c.quote.trim()&&citations[c.source-1]?.quote.includes(c.quote)),
    draftReady:run.status==='complete'&&!!run.result,feedbackCount:run.feedback?.length||0,
    unresolved:run.result?.uncertainties?.length||0};
}
export function researchReport(run){
  const q=researchQuality(run);
  if(!q.draftReady||!q.citationValid)throw Error('请先完成研究并重新核对出处，再导出报告。');
  const lines=['观星台 · 研究报告',`问题：${run.goal}`,`建立时间：${run.created}`,`运行方式：${run.provider}`,`材料范围：${run.bookTitle||'公开书库'}`,
    '性质：待人工核对的文献研究草稿；不是事件发生概率或已验证的因果结论。','','研究过程'];
  for(const [i,e]of (run.events||[]).entries())lines.push(`${i+1}. ${e.action==='search'?'检索':e.action==='clarify'?'澄清':'生成草稿'}：${e.query||e.question||''}${e.count!==undefined?'（'+e.count+' 段依据）':''}`);
  lines.push('','结论与出处');
  for(const c of run.result.claims){const s=run.citations[c.source-1];lines.push(c.text,`原文：${c.quote}`,`出处：《${s.title}》第 ${s.page} 页；原文位置 ${s.start}–${s.end}；修订 ${s.revision||0}；源文件标识 ${s.source_hash}`,'');}
  lines.push('待确认与分歧',...(run.result.uncertainties.length?run.result.uncertainties:['模型未列出待确认项，仍需人工核对。']),'','后续反馈');
  for(const f of run.feedback||[])lines.push(`${f.recordedAt}｜实际日期 ${f.observedOn}｜${f.outcome}`,f.observation,f.lesson);
  if(!run.feedback?.length)lines.push('尚无反馈。');
  return lines.join('\n');
}
