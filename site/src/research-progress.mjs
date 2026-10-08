import {fuseEvidence} from './evidence-ranking.mjs';
import {referenceOnly} from './research-agent-contracts.mjs';

// A durable pendingSearch is written BEFORE local indexing, so resuming it never repeats a paid call.
export async function finishPendingSearch(run,{search,verify,signal}){
  if(!run.pendingSearch)return run;
  if(!run.bookId||run.bookId==='all')throw Error('本机语义检索需要指定一本公开材料。');
  const hits=await search(run.bookId,run.pendingSearch.query,{signal});
  if(signal?.aborted)throw new DOMException('已停止','AbortError');
  const candidates=fuseEvidence(run.citations,hits,6);
  const checked=await verify(candidates.map(referenceOnly));
  if(signal?.aborted)throw new DOMException('已停止','AbortError');
  const result=structuredClone(run);result.citations=checked.citations;delete result.pendingSearch;result.status='paused';
  const event=result.events.at(-1);if(event){event.count=result.citations.length;event.retrieval='关键词 + 本机语义';}
  return result;
}
export const FEEDBACK_OUTCOMES={supported:'得到支持',contradicted:'出现反例',unclear:'尚无法判断'};
export function appendResearchFeedback(run,input,now=new Date().toISOString()){
  if(run.status!=='complete'||!run.result)throw Error('研究完成后才能添加复盘。');
  if((run.feedback||[]).length>=100)throw Error('本条研究已达到 100 条复盘记录。');
  if(!FEEDBACK_OUTCOMES[input.outcome])throw Error('请选择对照结果。');
  if(typeof input.observedOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.observedOn)||!Number.isFinite(Date.parse(input.observedOn))||new Date(input.observedOn).toISOString().slice(0,10)!==input.observedOn||input.observedOn>now.slice(0,10))throw Error('请填写有效的已发生日期，不能将未来情况记作实际反馈。');
  const fields={};for(const key of ['observation','lesson']){const value=input[key];if(typeof value!=='string'||!value.trim()||value.length>1000)throw Error('实际反馈和复盘说明均需填写，每项最多 1000 字。');fields[key]=value.trim();}
  const record={id:crypto.randomUUID(),recordedAt:now,observedOn:input.observedOn,outcome:input.outcome,...fields};
  return {...structuredClone(run),feedback:[...(run.feedback||[]),record]};
}
