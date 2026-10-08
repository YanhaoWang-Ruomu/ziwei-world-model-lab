import {HttpError,jsonBody,bodyBytes,digest} from './security.js';
import {AI_PROVIDERS,canonicalBase,validateConnection} from '../src/ai-provider-catalog.mjs';
import {messagesFor,validateOutput} from '../src/local-ai-contracts.mjs';
import {publicAgentEvidence} from './research-agent.mjs';
import {EVALUATION_VERSION,evaluationInput,evaluationChecks} from '../src/ai-evaluation-fixtures.mjs';
export function allowedEndpoints(env){
  // Operator-controlled, exact base paths; user input can never extend this list.
  return String(env.AI_ALLOWED_BASE_URLS||'').split(',').filter(Boolean).map(x=>canonicalBase(x.trim()));
}
export async function requestPersonalAi({env={},db,viewer,connection,id,messages,fetcher=fetch}){
  if(!viewer?.id)throw new HttpError(401,'请先登录自己的账户。');
  let config;try{config=validateConnection(connection,allowedEndpoints(env));}catch(e){throw new HttpError(400,e.message);}
  if(!/^[a-f0-9-]{36}$/.test(id)||new TextEncoder().encode(JSON.stringify(messages)).length>18000)throw new HttpError(400,'任务标识或输入长度不正确。');
  const owner=await digest(viewer.id),day=new Date().toISOString().slice(0,10);
  // Count only: no key, source text, model response or monetary estimate is persisted.
  const reservation=await db.prepare(`INSERT OR IGNORE INTO personal_ai_usage(owner_hash,request_id,day,status)
    SELECT ?,?,?,'reserved' WHERE (SELECT COUNT(*) FROM personal_ai_usage WHERE owner_hash=? AND day=?)<100`).bind(owner,id,day,owner,day).run();
  if(reservation.meta?.changes!==1)throw new HttpError(429,'此请求已发送，或已达到个人每日 100 次上限（UTC 换日）。不会自动重复扣费；请检查服务商用量。');
  const update=async(status,input=null,output=null)=>db.prepare('UPDATE personal_ai_usage SET status=?,input_tokens=?,output_tokens=? WHERE owner_hash=? AND request_id=?').bind(status,input,output,owner,id).run();
  const payload={model:config.model,messages,max_tokens:1536,response_format:{type:'json_object'},stream:false};
  if(config.baseUrl.includes('dashscope'))payload.enable_thinking=false;
  if(config.baseUrl==='https://api.deepseek.com/v1')payload.thinking={type:'disabled'};
  let response;
  // Workerd accepts manual/follow only. Never follow a redirect carrying a user's key.
  try{response=await fetcher(config.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(90000)});}
  catch(error){await update('uncertain');const reason=error?.name==='TimeoutError'||error?.name==='AbortError'?'等待服务商响应超时（90 秒）。':'本站服务器未能连接服务商（请求未取得响应）。';throw new HttpError(502,reason+' 请求可能已经计费，本次不会自动重试。');}
  if(response.status>=300&&response.status<400){await response.body?.cancel();await update('failed');throw new HttpError(502,'接口返回了重定向。为保护密钥已停止，请核对服务商的正式接口地址；未自动重试。');}
  if(!response.ok){
    const status=response.status;await response.body?.cancel();await update('failed');
    const text=status===401?'密钥无效或已过期。':status===403?'密钥没有该模型或该区域的调用权限。':status===402||status===429?'服务商额度不足或请求受限，请查看其控制台。':status===404?'找不到接口或模型，请检查服务地址和模型 ID。':status===400?'该模型不接受当前 JSON 对话参数，请选用支持 JSON 输出的文本模型。':'服务商暂时无法完成请求。';
    throw new HttpError(502,text+' 未自动重试。');
  }
  let value;try{value=JSON.parse(new TextDecoder().decode(await bodyBytes(response,50000)));}catch{await update('invalid');throw new HttpError(502,'服务商响应过大或格式异常。未自动重试。');}
  const raw=value.choices?.[0]?.message?.content;
  const input=Number.isSafeInteger(value.usage?.prompt_tokens)?value.usage.prompt_tokens:null,output=Number.isSafeInteger(value.usage?.completion_tokens)?value.usage.completion_tokens:null;
  if(typeof raw!=='string'||value.choices?.[0]?.finish_reason!=='stop'){await update('incomplete',input,output);throw new HttpError(502,'模型没有返回完整文本，可能不支持当前接口，或达到输出上限。');}
  await update('completed',input,output);
  return {raw,usage:{inputTokens:input,outputTokens:output},model:config.model};
}
export async function personalAiRoute(context,{generate=requestPersonalAi}={}){
  const {path,method,request,viewer,env,db}=context;
  if(!path.startsWith('/api/ai/personal/'))return null;
  if(!viewer.id)throw new HttpError(401,'请先登录个人账户。');
  if(path==='/api/ai/personal/providers'&&method==='GET')return {providers:AI_PROVIDERS,additionalBaseUrls:allowedEndpoints(env)};
  if(method!=='POST'||!['/api/ai/personal/verify','/api/ai/personal/answer','/api/ai/personal/evaluate'].includes(path))throw new HttpError(404,'不存在此个人 AI 操作。');
  const data=await jsonBody(request,18000);
  if(data?.consent!==true)throw new HttpError(400,'请确认本次将调用自己的 API，可能产生服务商费用。');
  if(path.endsWith('/evaluate')){
    let fixture,input;try{({fixture,input}=evaluationInput(data.fixture));}catch(e){throw new HttpError(400,e.message);}
    const started=Date.now(),result=await generate({env,db,viewer,connection:data.connection,id:data.id,messages:messagesFor(input)});
    let checked;try{checked=validateOutput(input,result.raw);}catch{throw new HttpError(502,'验收未通过：模型回答的 JSON 格式或原文引用不正确。');}
    return {version:EVALUATION_VERSION,fixture:fixture.id,result:checked,model:result.model,usage:result.usage,elapsedMs:Date.now()-started,checks:evaluationChecks(fixture,checked),at:new Date().toISOString()};
  }
  if(path.endsWith('/verify')){
    const result=await generate({env,db,viewer,connection:data.connection,id:data.id,messages:[{role:'system',content:'Connection check. Return exactly this JSON object: {"ok":true}. No other text.'},{role:'user',content:'Return the connection-check JSON.'}]});
    let value;try{value=JSON.parse(result.raw);}catch{}
    if(value?.ok!==true)throw new HttpError(502,'接口可返回文字，但未通过 JSON 格式验证，请更换模型。');
    return {ok:true,model:result.model,usage:result.usage,verifiedAt:new Date().toISOString()};
  }
  if(typeof data.question!=='string'||!data.question.trim()||data.question.length>400||!Array.isArray(data.references)||!data.references.length||data.references.length>6)throw new HttpError(400,'请填写问题并选取公开依据。');
  const citations=await publicAgentEvidence(db,data.references),input={kind:'answer',question:data.question,citations};
  const result=await generate({env,db,viewer,connection:data.connection,id:data.id,messages:messagesFor(input)});
  await publicAgentEvidence(db,data.references);
  let checked;try{checked=validateOutput(input,result.raw);}catch{throw new HttpError(502,'AI 回答未通过原文引用核对，请调整问题后重新研究。');}
  return {...result,result:checked,input};
}
