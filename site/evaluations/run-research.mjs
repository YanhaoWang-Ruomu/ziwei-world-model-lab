// Run only the fixed public fictional fixtures. No user material discovery or paid API.
import fs from 'node:fs';
import {evaluateResearchCase,RESEARCH_CASES,RESEARCH_SUITE,evaluationSummary} from '../src/research-evaluations.mjs';
import {visualMessages,parseVisualResult} from '../src/visual-research.mjs';
const endpoint='http://127.0.0.1:8788';
const paired=await fetch(endpoint+'/pair-key',{headers:{Origin:endpoint},signal:AbortSignal.timeout(6000)});
if(!paired.ok)throw Error('本机服务未就绪。');const {key}=await paired.json();
const health=await(await fetch(endpoint+'/health',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(6000)})).json();
if(!health.ready)throw Error('本机模型未就绪。');
const image='data:image/png;base64,'+fs.readFileSync(new URL('../src/fixtures/research-vision.png',import.meta.url)).toString('base64');
const connection={model:health.model,async generate(messages,{signal,json=true}={}){const response=await fetch(endpoint+'/generate',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({messages,json}),signal:signal||AbortSignal.timeout(185000)});const value=await response.json();if(!response.ok)throw Error(value.error||'本机生成未完成。');return value;}};
const report={suite:RESEARCH_SUITE,created:new Date().toISOString(),model:health.model,scope:'Fixed fictional fixtures only; not general reasoning, ancient OCR accuracy or causal validity',results:[]};
for(const item of RESEARCH_CASES){const start=Date.now();try{const result=await evaluateResearchCase(item.id,{connection,image});report.results.push(result);console.log(item.id+': '+(result.mechanicalPass?'PASS':'CHECK'));}catch(e){report.results.push({id:item.id,error:e.message,elapsedMs:Date.now()-start,humanReviews:[]});console.log(item.id+': ERROR');}}
try{report.visualTrial=parseVisualResult((await connection.generate(visualMessages('甲盆和乙盆每天各需多少毫升水？',image))).text);console.log('visual-page: '+(report.visualTrial.readable?'READABLE':'CHECK'));}catch(e){report.visualTrial={error:e.message};console.log('visual-page: ERROR');}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(evaluationSummary(report)));if(report.results.some(r=>r.error||!r.mechanicalPass)||report.visualTrial.error)process.exitCode=1;
