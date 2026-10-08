import {HttpError,jsonBody,bodyBytes} from './security.js';
import {pageText} from '../src/evidence-ranking.mjs';
import {messagesFor,validateOutput} from '../src/local-ai-contracts.mjs';
export const QWEN_MODEL='qwen-plus-2025-12-01';
export const DAILY_LIMIT=5000000,RESERVATION=250000; // micro-CNY; conservative 0.25 per attempt, at most 20/day.
const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
export const beijingDay=(date=new Date())=>new Date(date.getTime()+8*3600000).toISOString().slice(0,10);
export function qwenEnabled(env){return env.QWEN_ENABLED==='1'&&Boolean(env.DASHSCOPE_API_KEY)&&env.QWEN_BUDGET_CNY==='5'&&env.QWEN_PRICING_VERIFIED==='2026-10-09';}
export async function qwenRoute({path,method,request,db,viewer,env,fetcher=fetch,day=beijingDay()}){
  if(!path.startsWith('/api/ai/qwen'))return null;
  // Access to paid inference is deliberately limited to core accounts in this first release.
  if(!viewer.id||!viewer.owner)throw new HttpError(403,'千问云端助手需使用核心及创建者账户。');
  const enabled=qwenEnabled(env);
  if(path==='/api/ai/qwen/status'&&method==='GET'){
    const used=enabled?await db.prepare('SELECT COALESCE(SUM(reserved_micro),0) reserved FROM ai_usage WHERE day=?').bind(day).first():null;
    return {enabled,model:QWEN_MODEL,region:'北京',dailyBudgetCny:5,reservationPerRequestCny:.25,reservedTodayCny:(used?.reserved||0)/1000000};
  }
  if(path!=='/api/ai/qwen/answer'||method!=='POST')throw new HttpError(404,'不存在此 AI 操作。');
  if(!enabled)throw new HttpError(503,'千问尚未配置密钥、价格核对或每日 5 元上限；可使用本机 AI。');
  const data=await jsonBody(request,16000);
  if(!data||Object.keys(data).some(k=>!['id','question','references','publicQuestionConfirmed'].includes(k))||data.publicQuestionConfirmed!==true||typeof data.question!=='string'||!data.question.trim()||data.question.length>400||!/^[-a-f0-9]{36}$/.test(data.id)||!Array.isArray(data.references)||!data.references.length||data.references.length>6)throw new HttpError(400,'请确认问题不含私密内容，并选择公开原文依据。');
  const citations=[];
  for(const ref of data.references){
    if(!ref||typeof ref.book_id!=='string'||ref.book_id.length>100||!Number.isInteger(ref.page)||ref.page<1||!Number.isInteger(ref.start)||!Number.isInteger(ref.end)||ref.start<0||ref.end<=ref.start||ref.end-ref.start>600)throw new HttpError(400,'原文位置不完整，请重新检索。');
    // Re-read only public sources. A forged client level or uploaded quote can never reach the provider.
    const row=await db.prepare("SELECT p.*,b.title,b.kind,b.source_hash FROM pages p JOIN books b ON b.id=p.book_id WHERE p.book_id=? AND p.page=? AND b.level='public' AND b.status<>'deleting'").bind(ref.book_id,ref.page).first();
    if(!row)throw new HttpError(403,'千问只处理公开材料，当前选段包含未公开或已删除材料。');
    const source=pageText(row);
    if(row.source_hash!==ref.source_hash||(row.correction_revision||0)!==(ref.revision||0)||source.source!==ref.source||ref.end>source.text.length)throw new HttpError(409,'原文已变化，请重新查阅。');
    citations.push({...ref,title:row.title,kind:row.kind,quote:source.text.slice(ref.start,ref.end)});
  }
  const input={kind:'answer',question:data.question,citations},messages=messagesFor(input);
  const generated=await requestQwen({env,db,id:data.id,messages,fetcher,day});
  let validated;try{validated=validateOutput(input,generated.raw);}catch{throw new HttpError(502,'千问草稿未通过引用核对，请缩小问题范围后重试。');}
  return {...generated,result:validated,input,model:QWEN_MODEL,budget:{reservedCny:.25,dailyLimitCny:5}};
}
export async function requestQwen({env,db,id,messages,fetcher=fetch,day=beijingDay()}){
  if(!qwenEnabled(env))throw new HttpError(503,'请先完成千问密钥与预算配置。');
  if(new TextEncoder().encode(JSON.stringify(messages)).length>18000)throw new HttpError(413,'原文过长，请减少选段。');
  // A single INSERT SELECT reserves budget atomically across accounts and concurrent workers.
  // Failed and interrupted attempts retain their reservation: a retry never silently incurs another charge.
  const reserve=await db.prepare(`INSERT OR IGNORE INTO ai_usage(request_id,day,reserved_micro,status,model)
    SELECT ?,?,?,'reserved',? WHERE COALESCE((SELECT SUM(reserved_micro) FROM ai_usage WHERE day=?),0)+?<=?`).bind(id,day,RESERVATION,QWEN_MODEL,day,RESERVATION,DAILY_LIMIT).run();
  if(reserve.meta?.changes!==1)throw new HttpError(429,'已达到本站今日 AI 预算，或此任务已调用过。请使用本机 AI；若需重试，请明确新建任务。');
  let response;
  try{response=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{Authorization:'Bearer '+env.DASHSCOPE_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:QWEN_MODEL,messages,enable_thinking:false,enable_search:false,response_format:{type:'json_object'},max_tokens:1536,temperature:0})});}
  catch{await db.prepare("UPDATE ai_usage SET status='uncertain' WHERE request_id=?").bind(id).run();throw new HttpError(502,'千问连接未完成；本次预留额度保留，不会自动重试。');}
  if(!response.ok){await response.body?.cancel();await db.prepare("UPDATE ai_usage SET status='failed' WHERE request_id=?").bind(id).run();throw new HttpError(502,'千问未接受请求，请在百炼控制台检查密钥权限、余额与模型服务状态。');}
  let result;try{result=JSON.parse(new TextDecoder().decode(await bodyBytes(response,50000)));}catch{throw new HttpError(502,'千问返回格式异常，本次不会自动重试。');}
  const raw=result.choices?.[0]?.message?.content;
  if(result.choices?.[0]?.finish_reason!=='stop')throw new HttpError(502,'千问回答未完整结束，请减少资料后新建任务。');
  const usage=result.usage||{},prompt=Number.isInteger(usage.prompt_tokens)?usage.prompt_tokens:null,completion=Number.isInteger(usage.completion_tokens)?usage.completion_tokens:null;
  await db.prepare("UPDATE ai_usage SET status='completed',input_tokens=?,output_tokens=? WHERE request_id=?").bind(prompt,completion,id).run();
  // No prompt, book text, response body, key or account identifier is written to the usage ledger.
  return {raw,usage:{inputTokens:prompt,outputTokens:completion}};
}
