import {READING_FIXTURES,evaluationInput,evaluationChecks} from './ai-evaluation-fixtures.mjs';
import {messagesFor,validateOutput} from './local-ai-contracts.mjs';
import {localResearchStep} from './native-research.mjs';
export const RESEARCH_SUITE='public-fictional-research-v1';
export const RESEARCH_CASES=[...READING_FIXTURES.map(f=>({id:f.id,label:f.name,expected:f.expected})),
  {id:'logic',label:'逻辑边界',expected:'浇水不代表一定是蓝盆；不能肯定后件。'},
  {id:'causal',label:'因果边界',expected:'阳光是混杂因素，当前观察不能证明音乐促进生长。'},
  {id:'vision',label:'图像读数',expected:'虚构图中甲盆20毫升、乙盆30毫升，合计50毫升。'},
  {id:'agent',label:'工具中断恢复',expected:'先检索；模拟工具中断后复用已保存决定，再引用虚构第120页回答。'}];
const parse=raw=>JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
export async function evaluateResearchCase(id,{connection,signal,image,now=()=>Date.now()}){
  if(!RESEARCH_CASES.some(c=>c.id===id))throw Error('未知的验收题。');
  const started=now();let calls=0;
  const generate=async(messages,options={})=>{if(signal?.aborted)throw Error('已暂停验收。');calls++;return connection.generate(messages,{...options,signal,json:true});};
  let checks,observation;
  if(READING_FIXTURES.some(f=>f.id===id)){
    const {input,fixture}=evaluationInput(id),raw=(await generate(messagesFor(input))).text;
    const result=validateOutput(input,raw);checks=evaluationChecks(fixture,result);
    checks={citations:checks.citationValid,requiredContent:fixture.refuse?checks.refusalObserved:checks.expectedMarkersPresent};observation=JSON.stringify(result);
  }else if(id==='logic'||id==='causal'){
    const question=id==='logic'?'虚构规则：所有蓝盆都浇水。甲盆浇水了。能否确定甲盆是蓝盆？':'虚构观察：放音乐的花盆长得快，但也得到更多阳光，没有随机分组。能否证明音乐导致生长加快？';
    const result=parse((await generate([{role:'user',content:question+'只输出 JSON：{"can_conclude":布尔值,"reason":"一句话"}'}])).text);
    checks={format:typeof result.can_conclude==='boolean'&&typeof result.reason==='string'&&result.reason.trim().length>0,boundary:result.can_conclude===false};observation=JSON.stringify(result);
  }else if(id==='vision'){
    if(!image)throw Error('虚构图片未能加载。');
    const result=parse((await generate([{role:'user',content:[{type:'text',text:'只读取这张虚构图片，输出 JSON：{"a_ml":甲盆毫升数,"b_ml":乙盆毫升数,"total_ml":合计毫升数}。看不清填null。'},{type:'image_url',image_url:{url:image}}]}])).text);
    checks={imageValues:result.a_ml===20&&result.b_ml===30&&result.total_ml===50};observation=JSON.stringify(result);
  }else{
    const quote='虚构蓝盆每天浇水一次，每次20毫升。',citation={book_id:'fictional-evaluation',page:120,start:0,end:quote.length,quote,source_hash:'fictional-suite-v1',revision:0,source:'extracted',title:'虚构园圃'};
    const data={goal:'查找虚构蓝盆每天浇水次数和用量，并引用记录。',bookId:citation.book_id,publicConfirmed:true,step:0,callId:crypto.randomUUID(),references:[],followups:[],queries:[]};
    let interrupted=false,pending=null,searchCalls=0;
    const api=async(url,options)=>{if(url.endsWith('/sources'))return {citations:JSON.parse(options.body).references.map(r=>({...citation,...r}))};if(url.startsWith('/api/evidence/search?')){searchCalls++;if(!interrupted){interrupted=true;throw Error('FICTIONAL_TOOL_INTERRUPTION');}return {citations:[citation]};}throw Error('未知的虚构工具。');};
    const adapter={ready:true,model:connection.model,generate};
    try{await localResearchStep(data,{api,connection:adapter,signal,onDecision:async d=>{pending=d;}});}catch(e){if(e.message!=='FICTIONAL_TOOL_INTERRUPTION')throw e;}
    if(!interrupted||pending?.action!=='search')throw Error('模型没有先调用检索工具。');
    const before=calls,found=await localResearchStep(data,{api,connection:adapter,signal,pendingDecision:pending});
    const reused=calls===before;
    const answer=await localResearchStep({...data,step:1,callId:crypto.randomUUID(),queries:[pending.query],references:found.citations},{api,connection:adapter,signal});
    checks={searched:searchCalls===2,resumeWithoutRegeneration:reused,citedAnswer:answer.decision.action==='answer'&&answer.decision.claims.length>0};observation=JSON.stringify(answer.decision);
  }
  if(signal?.aborted)throw Error('已暂停验收。');
  return {id,checks,mechanicalPass:Object.values(checks).every(v=>v===true),observation:observation.slice(0,6000),elapsedMs:now()-started,modelCalls:calls,humanReviews:[]};
}
export function evaluationSummary(run){
  const results=run.results||[];
  return {completed:results.length,total:RESEARCH_CASES.length,passed:results.filter(r=>r.mechanicalPass===true).length,failed:results.filter(r=>r.mechanicalPass===false).length,
    errors:results.filter(r=>r.error).length,reviewed:results.filter(r=>r.humanReviews?.length).length,elapsedMs:results.reduce((n,r)=>n+(r.elapsedMs||0),0)};
}
