// Local fixture store only. Exercise the real model, public search and citation verifier together.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {localResearchStep} from '../src/native-research.mjs';
const base='http://127.0.0.1:8770',modelBase='http://127.0.0.1:8788';
assert.equal((await fetch(base+'/__test/demo?role=public')).status,200);
const api=async(url,options={})=>{const response=await fetch(base+url,{...options,headers:{Origin:base,Cookie:'local_preview_owner=1','Content-Type':'application/json'}});const data=await response.json();if(!response.ok)throw Error(`${response.status}: ${data.error}`);return data;};
const id='fiction-native-agent',sourceHash=createHash('sha256').update('fictional-native-agent-v1').digest('hex');
await api('/api/books',{method:'POST',body:JSON.stringify({id,title:'虚构温室本机 AI 测试',level:'public',pageCount:1,kind:'text',sourceHash,fileName:'fiction.txt',fileSize:128})});
await api(`/api/books/${id}/pages/1`,{method:'PUT',body:JSON.stringify({rawText:'这是虚构测试。虚构蓝盆每天浇水一次，每次20毫升。虚构红盆每天浇水两次，每次10毫升。',engine:'article'})});
const {key}=await(await fetch(modelBase+'/pair-key',{headers:{Origin:modelBase}})).json();let generated=0;
const connection={ready:true,model:'Qwen3.5-4B-Q4_K_M',async generate(messages){generated++;const r=await fetch(modelBase+'/generate',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({messages,json:true})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}};
const input={goal:'查找虚构蓝盆每天浇水次数和用量，并引用原文。',bookId:id,publicConfirmed:true,step:0,callId:crypto.randomUUID(),references:[],followups:[],queries:[]};
const first=await localResearchStep(input,{api,connection});assert.equal(first.decision.action,'search');assert.ok(first.citations.length>0);
const second=await localResearchStep({...input,step:1,callId:crypto.randomUUID(),references:first.citations,queries:[first.decision.query]},{api,connection});assert.equal(second.decision.action,'answer');assert.ok(second.decision.claims.length>0);assert.equal(generated,2);
console.log(JSON.stringify({passed:true,modelCalls:generated,search:first.decision.query,claims:second.decision.claims,scope:'fictional local HTTP integration'}));
