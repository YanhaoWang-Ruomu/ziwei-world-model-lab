import {HttpError,jsonBody} from './security.js';
import {pageText} from '../src/evidence-ranking.mjs';
import {searchEvidence} from './library-evidence.mjs';
import {requestQwen} from './qwen-ai.mjs';
import {requestPersonalAi} from './personal-ai.mjs';
import {validateAgentInput,agentMessages,parseAgentAction,mergeAgentEvidence} from '../src/research-agent-contracts.mjs';
export async function publicAgentEvidence(db,references){
  if(!Array.isArray(references)||references.length>6)throw new HttpError(400,'最多核对六段原文。');
  const citations=[];
  for(const ref of references){
    if(!ref||typeof ref.book_id!=='string'||ref.book_id.length>100||!Number.isInteger(ref.page)||ref.page<1||!Number.isInteger(ref.start)||!Number.isInteger(ref.end)||ref.start<0||ref.end<=ref.start||ref.end-ref.start>600)throw new HttpError(400,'研究原页位置无效。');
    const row=await db.prepare("SELECT p.*,b.title,b.kind,b.source_hash FROM pages p JOIN books b ON b.id=p.book_id WHERE p.book_id=? AND p.page=? AND b.level='public' AND b.status<>'deleting'").bind(ref.book_id,ref.page).first();
    if(!row)throw new HttpError(403,'研究包含不再公开的材料，请新建研究。');const source=pageText(row);
    if(ref.source_hash!==row.source_hash||(ref.revision||0)!==(row.correction_revision||0)||ref.source!==source.source||ref.end>source.text.length)throw new HttpError(409,'原页已变化，请重新开始研究。');
    citations.push({...ref,quote:source.text.slice(ref.start,ref.end),title:row.title,kind:row.kind});
  }
  return citations;
}
export async function researchAgentRoute(context,{generate,search=searchEvidence}={}){
  const {path,method,request,viewer,db}=context;if(!['/api/ai/research/step','/api/ai/research/sources'].includes(path))return null;
  if(method!=='POST')throw new HttpError(405,'请从 AI 研究对话开始。');
  if(!viewer.id)throw new HttpError(401,'请先登录个人账户。');
  if(path.endsWith('/sources')){const data=await jsonBody(request,6000);return {citations:await publicAgentEvidence(db,data.references)};}
  const data=await jsonBody(request,16000);try{validateAgentInput(data);}catch(e){throw new HttpError(400,e.message);}
  if(data.connection){if(data.consent!==true)throw new HttpError(400,'请先确认使用个人 API。');}
  else if(!viewer.owner)throw new HttpError(403,'本站千问仅供核心账户使用；其他账户可配置自己的 API。');
  const citations=await publicAgentEvidence(db,data.references);
  const result=await (generate||(data.connection?requestPersonalAi:requestQwen))({env:context.env,db,viewer,connection:data.connection,id:data.callId,messages:agentMessages(data,citations)});
  let decision;try{decision=parseAgentAction(result.raw,data,citations);}catch(e){throw new HttpError(502,e.message);}
  if(decision.action==='search'){
    const url=new URL(request.url);url.pathname='/api/evidence/search';url.search=new URLSearchParams({q:decision.query,book:'all',level:'public'}).toString();
    const found=await search({...context,url,query:decision.query,guard:{sql:"b.level='public' AND b.status<>'deleting'",args:[]}});
    const evidence=mergeAgentEvidence(citations,found.citations);
    await publicAgentEvidence(db,evidence);
    return {decision,citations:evidence,usage:result.usage};
  }
  await publicAgentEvidence(db,data.references);
  return {decision,citations,usage:result.usage};
}
