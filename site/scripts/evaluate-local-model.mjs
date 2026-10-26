// Public, fictional fixtures only. No user file discovery, private rules or paid API calls.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {localResearchStep} from '../src/native-research.mjs';
import {validateOutput} from '../src/local-ai-contracts.mjs';
const base='http://127.0.0.1:8788',root=path.resolve(process.argv[2]||fileURLToPath(new URL('../../local-ai-runtime',import.meta.url)));
const {key}=await(await fetch(base+'/pair-key',{headers:{Origin:base}})).json();
const results=[];
async function generate(messages,{json=true}={}){const response=await fetch(base+'/generate',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({messages,json}),signal:AbortSignal.timeout(185000)});const value=await response.json();if(!response.ok)throw Error(value.error);return value;}
async function check(name,work){const started=Date.now();try{const observation=await work();results.push({name,passed:true,milliseconds:Date.now()-started,observation});console.log(name+': PASS');}catch(e){results.push({name,passed:false,milliseconds:Date.now()-started,error:e.message});console.log(name+': FAIL '+e.message);}}
function assert(condition,message){if(!condition)throw Error(message);}
const ask=async text=>JSON.parse((await generate([{role:'user',content:text+' 只输出要求的 JSON，不附加说明。'}])).text);
await check('arithmetic',async()=>{const r=await ask('虚构温室有3个花盆，每盆每天20毫升水，每天共多少？输出 {"ml":数值}');assert(r.ml===60,'Incorrect total');return r;});
await check('converse_is_not_implied',async()=>{const r=await ask('虚构规定：所有蓝盆都会浇水。甲盆浇了水。能否据此确定甲盆是蓝色？输出 {"can_determine":布尔值,"reason":"一句话"}');assert(r.can_determine===false,'Affirmed the consequent');return r;});
await check('observation_is_not_causation',async()=>{const r=await ask('虚构观察：放音乐的花盆长得更快，但这些花盆也得到更多阳光。没有随机分组。能否证明音乐导致生长加快？输出 {"causal_proven":布尔值,"reason":"一句话"}');assert(r.causal_proven===false,'Confounding ignored');return r;});
await check('insufficient_evidence',async()=>{const r=await ask('资料只说虚构蓝盆今天浇了水，没有给毫升数。问浇了多少毫升？输出 {"ml":数值或null,"uncertain":布尔值}');assert(r.ml===null&&r.uncertain===true,'Invented missing amount');return r;});
await check('literal_citation',async()=>{const input={kind:'answer',question:'虚构蓝盆每天几次？',citations:[{quote:'虚构蓝盆每天浇水一次，每次20毫升。'}]};const raw=(await generate([{role:'system',content:'只根据给定资料输出 JSON：{"claims":[{"text":"结论","source":1,"quote":"逐字引用"}],"uncertainties":[]}'},{role:'user',content:'[1] '+input.citations[0].quote+' 问题：'+input.question}])).text;return validateOutput(input,raw);});
await check('agent_search_then_answer',async()=>{
 const quote='虚构蓝盆每天浇水一次，每次20毫升。',citation={book_id:'fiction',page:120,start:0,end:quote.length,source_hash:'fiction-hash',revision:0,source:'extracted',title:'虚构园圃',quote};
 const data={goal:'查找虚构蓝盆每天浇水次数和用量，引用记录。',bookId:'fiction',publicConfirmed:true,step:0,callId:'a'.repeat(36),references:[],followups:[],queries:[]};let toolCalls=0;
 const api=async(url,options)=>{if(url.includes('/sources'))return {citations:JSON.parse(options.body).references.map(r=>({...r,title:citation.title,quote}))};if(url.startsWith('/api/evidence/search?')){toolCalls++;return {citations:[citation]};}throw Error('Unexpected tool');};
 const connection={ready:true,model:'Qwen3.5-4B-Q4_K_M',generate};const first=await localResearchStep(data,{api,connection});assert(first.decision.action==='search'&&toolCalls===1,'Did not search: '+JSON.stringify(first.decision));
 const second=await localResearchStep({...data,step:1,queries:[first.decision.query],references:[citation]},{api,connection});assert(second.decision.action==='answer'&&second.decision.claims.length>0,'Did not answer from evidence');return {first:first.decision,second:second.decision};
});
const imagePath=fileURLToPath(new URL('../tests/fixtures/local-model-vision.png',import.meta.url));
if(fs.existsSync(imagePath))await check('fictional_chinese_image',async()=>{const image='data:image/png;base64,'+fs.readFileSync(imagePath).toString('base64');const r=JSON.parse((await generate([{role:'user',content:[{type:'text',text:'读取图中文字。输出 JSON：{"a_ml":甲盆每天毫升数,"b_ml":乙盆每天毫升数,"total_ml":合计毫升数}。不要猜测。'},{type:'image_url',image_url:{url:image}}]}])).text);assert(r.a_ml===20&&r.b_ml===30&&r.total_ml===50,'Image quantities incorrect');return r;});
else results.push({name:'fictional_chinese_image',passed:false,error:'Synthetic image fixture missing'});
const report={createdAt:new Date().toISOString(),model:'Qwen3.5-4B-Q4_K_M',thinking:false,scope:'Small fictional smoke suite; not general accuracy or causal validity evidence',results};
fs.appendFileSync(path.join(root,'evaluation-history.jsonl'),JSON.stringify(report)+'\n');fs.writeFileSync(path.join(root,'evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length}));if(results.some(r=>!r.passed))process.exitCode=1;
