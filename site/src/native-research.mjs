import {nativeAi} from './native-ai.mjs';
import {agentMessages,parseAgentAction,mergeAgentEvidence,referenceOnly,validateAgentInput} from './research-agent-contracts.mjs';
// Only public references go to site APIs. The question, followups and model response stay on this device.
export async function localResearchStep(data,{api,signal,connection=nativeAi,onDecision=async()=>{},pendingDecision}={}){
  validateAgentInput(data);if(!connection.ready)throw Error('请先在账户页连接本机图文 AI。');
  const sources=references=>api('/api/ai/research/sources',{method:'POST',signal,body:JSON.stringify({references})});
  let citations=(await sources(data.references)).citations;
  if(data.bookId&&data.bookId!=='all'&&citations.some(c=>c.book_id!==data.bookId))throw Error('引用超出了选定材料。');
  const raw=pendingDecision?JSON.stringify(pendingDecision):(await connection.generate(agentMessages(data,citations),{signal,json:true})).text;
  if(signal?.aborted)throw Error('研究已停止。');
  const decision=parseAgentAction(raw,data,citations);
  // Persist the validated tool decision before its request: resume does not repeat generation.
  if(!pendingDecision)await onDecision(decision);
  if(signal?.aborted)throw Error('研究已停止。');
  if(decision.action==='search'){
    const params=new URLSearchParams({q:decision.query,book:data.bookId||'all',level:'public'});
    const found=await api('/api/evidence/search?'+params,{signal});
    const merged=mergeAgentEvidence(citations,found.citations||[]);
    if(data.bookId&&data.bookId!=='all'&&merged.some(c=>c.book_id!==data.bookId))throw Error('检索结果超出了选定材料。');
    citations=(await sources(merged.map(referenceOnly))).citations;
  }else citations=(await sources(data.references)).citations;
  if(decision.action!=='search')parseAgentAction(JSON.stringify(decision),data,citations);
  return {decision,citations,model:connection.model};
}
