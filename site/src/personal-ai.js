import {createVault} from './vault-storage.mjs';
import {AI_PROVIDERS,validateConnection} from './ai-provider-catalog.mjs';
import {READING_FIXTURES} from './ai-evaluation-fixtures.mjs';
import {vaultPasswordReset} from './vault-password-reset.mjs';
const vault=createVault({namespace:'ziwei-personal-ai',lockEvent:'ziwei:personal-ai-locked'});
let viewer={},epoch=0,api,activeId='',allowed=[],refresh=()=>{},controllers=new Set();
const changed=()=>document.dispatchEvent(new Event('ziwei:personal-ai-changed'));
function lock(){epoch++;for(const c of controllers)c.abort();controllers.clear();activeId='';vault.lock();changed();}
async function account(){const ticket=epoch,s=await api('/api/session');if(ticket!==epoch||!s.authenticated||!s.userId||s.userId!==viewer.userId)throw Error('请先登录并解锁此账户的 AI 配置。');return ticket;}
export async function personalAiStatus(){
  if(!vault.unlocked)return {ready:false,message:'请到账户 → 我的 AI 接口，添加并解锁个人配置。'};
  const ticket=await account(),p=await vault.get(activeId);if(ticket!==epoch)throw Error('账户已变化。');
  return {ready:!!p?.verifiedAt,id:p?.id,verifiedAt:p?.verifiedAt,name:p?.name,model:p?.model,message:p?.verifiedAt?`${p.name} · ${p.model} · 已验证`:'请先验证配置并设为当前使用。'};
}
export async function callPersonalAi(path,data,{signal,profile}={}){
  if(!['/api/ai/personal/answer','/api/ai/research/step','/api/ai/personal/evaluate'].includes(path))throw Error('不支持此 AI 操作。');
  const ticket=await account(),p=await vault.get(activeId);if(ticket!==epoch||!p?.verifiedAt)throw Error('请先验证并选用个人 API 配置。');
  if(profile&&(profile.id!==p.id||profile.verifiedAt!==p.verifiedAt))throw Error('个人接口已切换或修改，请新建研究以使用新配置。');
  const controller=new AbortController();controllers.add(controller);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  try{const result=await api(path,{method:'POST',signal:controller.signal,body:JSON.stringify({...data,consent:true,connection:{baseUrl:p.baseUrl,model:p.model,apiKey:p.apiKey}})});if(ticket!==epoch)throw Error('账户已切换，已清除返回结果。');return result;}
  finally{controllers.delete(controller);signal?.removeEventListener('abort',abort);}
}
export function initPersonalAi({api:request,el,btn}){
  api=request;
  const root=el('section','local-ai-panel personal-ai-settings');root.id='personal-ai-settings';
  const status=el('p'),auth=el('div'),password=el('input'),content=el('div'),list=el('div'),fields=el('fieldset'),name=el('input'),provider=el('select'),base=el('input'),model=el('input'),key=el('input'),consent=el('input');
  password.type='password';password.autocomplete='new-password';password.placeholder='本机 API 配置独立密码（至少 12 位）';password.setAttribute('aria-label','API 配置解锁密码');key.type='password';key.autocomplete='off';key.maxLength=512;key.placeholder='填写密钥；不会显示已保存的密钥';consent.type='checkbox';base.type='url';model.maxLength=160;name.maxLength=60;
  let editing=null,working=false;
  const safe=fn=>async()=>{if(working)return;working=true;fields.disabled=true;const ticket=epoch;try{await fn();}catch(e){if(ticket===epoch)status.textContent=e.message;}finally{working=false;fields.disabled=false;}};
  const field=(title,input)=>{const label=el('label','personal-ai-field',title);label.append(input);return label;};
  root.append(el('h2','','我的 AI 接口'),el('p','muted','每个账户可保存多个接口并切换使用。密钥在当前设备按账户加密保存，不随账户同步；换设备需重新配置。解锁密码无法找回。调用时密钥经本站服务器转发至所选服务商，本站不保存密钥。'));
  auth.append(password,btn('创建 / 解锁 API 配置',safe(async()=>{const ticket=await account();await vault.open(viewer.userId,password.value);password.value='';if(ticket!==epoch){vault.lock();return;}const config=await api('/api/ai/personal/providers');if(ticket!==epoch)return;allowed=config.additionalBaseUrls||[];const pref=await vault.get('preferences');if(ticket!==epoch)return;activeId=pref?.activeId||'';await refresh();status.textContent='已解锁当前账户的本机 AI 配置。';changed();}),'book-primary'));
  for(const p of AI_PROVIDERS)provider.append(new Option(p.name,p.id));provider.append(new Option('其他可信 OpenAI 兼容接口','custom'));
  const invalidate=()=>{consent.checked=false;status.textContent='更改配置后需要重新验证。';};
  provider.onchange=()=>{const p=AI_PROVIDERS.find(p=>p.id===provider.value);base.value=p?.baseUrl||'';model.value=p?.model||'';key.value='';invalidate();};
  for(const n of [base,model,key,name])n.addEventListener('input',invalidate);
  function reset(){editing=null;name.value='';provider.value=AI_PROVIDERS[0].id;provider.onchange();consent.checked=false;}
  const agreement=field('同意发送一次连接验证请求，可能产生费用；使用此配置只发送公开资料。',consent);
  model.placeholder='可直接输入服务商提供的模型 ID';
  fields.append(field('配置名称',name),field('服务商 / 接口类型',provider),field('接口地址（Base URL）',base),field('模型 ID（可手动修改）',model),el('p','muted','qwen-plus 是默认填写值，不是唯一可选模型。请按百炼控制台填写已开通、支持 JSON 输出的文本模型 ID。'),field('API 密钥',key),agreement);
  const verify=btn('验证连接并加密保存',safe(async()=>{
    const ticket=await account();if(!vault.unlocked)throw Error('请先解锁配置。');if(!consent.checked)throw Error('请先勾选调用确认。');
    const saved=editing?await vault.get(editing):null;if(ticket!==epoch)return;
    const connection=validateConnection({baseUrl:base.value.trim(),model:model.value.trim(),apiKey:key.value.trim()||(saved?.baseUrl===base.value.trim()?saved.apiKey:'')},allowed);
    const displayName=name.value.trim()||AI_PROVIDERS.find(p=>p.id===provider.value)?.name||'个人接口';
    fields.disabled=true;working=true;const controller=new AbortController();controllers.add(controller);status.textContent='正在真实调用所选模型，验证连接与 JSON 输出…';
    try{
      const result=await api('/api/ai/personal/verify',{method:'POST',signal:controller.signal,body:JSON.stringify({id:crypto.randomUUID(),connection,consent:true})});if(ticket!==epoch)return;
      const id=editing||crypto.randomUUID();await vault.put({id,kind:'ai-connection',name:displayName,...connection,verifiedAt:result.verifiedAt});if(ticket!==epoch)return;
      activeId=id;await vault.put({id:'preferences',kind:'ai-preferences',activeId});if(ticket!==epoch)return;
      reset();await refresh();status.textContent='连接及 JSON 输出验证成功，已加密保存并设为当前接口。可以前往书库问答或 AI 研究对话使用。';changed();
    }finally{controllers.delete(controller);working=false;fields.disabled=false;}
  }),'book-primary');
  fields.append(verify,btn('取消编辑 / 新增另一配置',()=>{reset();status.textContent='请填写新的配置。';}));
  const usage=el('p','muted','支持 OpenAI 兼容的文本对话与 JSON 输出接口。自定义地址须由创建者加入可信列表，暂不支持本机地址、原生 Claude / Gemini 协议和图片生成。验证成功表示该模型当次可用，不保证后续余额或可用性。个人接口按服务商实际账单计费，本站不承诺人民币封顶；每账户每日最多 100 次调用（含验证，UTC 换日），请另在服务商设置预算。');
  const evaluation=el('details'),evaluationOutput=el('div'),evaluationConsent=el('input');evaluationConsent.type='checkbox';
  evaluation.append(el('summary','','模型实际能力验收'),el('p','muted','仅使用固定虚构资料。每次点击调用当前已验证模型一次，并在本机加密保存结果。引用通过不代表解释正确，仍需你核对。'),field('同意本次模型验收可能产生服务商费用。',evaluationConsent));
  const renderEvaluation=record=>{
    evaluationOutput.replaceChildren();const fixture=READING_FIXTURES.find(x=>x.id===record.fixture);if(!fixture)return;
    evaluationOutput.append(el('h3','',fixture.name+' · '+record.model),el('p','muted',record.at+' · '+record.elapsedMs+' 毫秒'),el('p','','验收问题：'+fixture.question),el('p','','预期：'+fixture.expected));
    for(const c of record.result.claims)evaluationOutput.append(el('p','',c.text),el('blockquote','',c.quote));
    for(const u of record.result.uncertainties)evaluationOutput.append(el('p','',u));
    evaluationOutput.append(el('p','muted','引用原文检查已通过。关键词检查：'+(record.checks.expectedMarkersPresent?'满足':'需复核')+'；无依据拒答形式：'+(record.checks.refusalObserved?'已观察到':'未观察到')+'。这些是机械检查，不能代替人工评价。'));
    for(const [value,label]of [['pass','人工核对：符合预期'],['fail','人工核对：不符合预期']])evaluationOutput.append(btn(label,safe(async()=>{const ticket=await account();await vault.put({...record,humanVerdict:value,reviewedAt:new Date().toISOString()});if(ticket!==epoch)return;status.textContent='人工评价已加密保存。';})));
  };
  for(const fixture of READING_FIXTURES)evaluation.append(btn('验收：'+fixture.name,safe(async()=>{
    if(!evaluationConsent.checked)throw Error('请先确认验收调用费用。');const ticket=await account();evaluationOutput.replaceChildren();status.textContent='正在用固定虚构资料验收模型…';
    const result=await callPersonalAi('/api/ai/personal/evaluate',{fixture:fixture.id,id:crypto.randomUUID()});if(ticket!==epoch)return;
    const record={...result,id:crypto.randomUUID(),kind:'ai-evaluation'};await vault.put(record);if(ticket!==epoch)return;evaluationConsent.checked=false;renderEvaluation(record);status.textContent='验收结果已加密保存，请人工核对。';
  })));
  evaluation.append(btn('查看最近一次验收',safe(async()=>{const ticket=await account(),records=await vault.list({catalog:false,kind:'ai-evaluation'});if(ticket!==epoch)return;records.sort((a,b)=>b.at.localeCompare(a.at));if(records[0])renderEvaluation(records[0]);else status.textContent='当前账户还没有模型验收记录。';})),evaluationOutput);
  content.append(list,fields,usage,evaluation,btn('锁定 API 配置',()=>{lock();reset();refresh();evaluationOutput.replaceChildren();evaluationConsent.checked=false;status.textContent='已锁定，进行中的请求不会自动重试。';}));
  status.setAttribute('role','status');root.append(auth,content,status);document.querySelector('#account')?.append(root);
  refresh=async()=>{const ticket=epoch;auth.hidden=vault.unlocked;content.hidden=!vault.unlocked;list.replaceChildren();if(!vault.unlocked)return;const profiles=await vault.list({catalog:false,kind:'ai-connection'});if(ticket!==epoch)return;for(const p of profiles){const row=el('article','personal-ai-profile');row.append(el('strong','',p.name+(activeId===p.id?' · 当前使用':'')),el('p','muted',p.model+' · '+p.baseUrl),el('small','','上次验证：'+p.verifiedAt),btn('使用此配置',safe(async()=>{const token=await account();await vault.put({id:'preferences',kind:'ai-preferences',activeId:p.id});if(token!==epoch)return;activeId=p.id;await refresh();changed();})),btn('修改',safe(async()=>{const token=await account();const full=await vault.get(p.id);if(token!==epoch)return;editing=p.id;name.value=full.name;base.value=full.baseUrl;model.value=full.model;provider.value=AI_PROVIDERS.find(x=>x.baseUrl===full.baseUrl)?.id||'custom';key.value='';consent.checked=false;status.textContent='保留原地址时，密钥留空可沿用；修改地址必须重新填写密钥。';})),btn('删除配置',safe(async()=>{const token=await account();await vault.remove(p.id);if(token!==epoch)return;if(activeId===p.id){activeId='';await vault.put({id:'preferences',kind:'ai-preferences',activeId:''});}if(editing===p.id)reset();await refresh();changed();})));list.append(row);}if(!profiles.length)list.append(el('p','','尚未添加个人 API。'));};
  const clear=()=>{lock();reset();password.value='';status.textContent='';evaluationOutput.replaceChildren();evaluationConsent.checked=false;refresh();};
  document.addEventListener('ziwei:session',e=>{viewer=e.detail||{};clear();});document.addEventListener('ziwei:logout',()=>{viewer={};clear();});window.addEventListener('pagehide',clear);
  root.append(vaultPasswordReset({vault,title:'AI 接口解锁',getViewer:()=>viewer,el,btn,onReset:async()=>{clear();await refresh();},onRestored:refresh}));
  document.addEventListener('ziwei:local-password-reset',e=>{if(e.detail?.namespace!=='ziwei-personal-ai')return;evaluationOutput.replaceChildren();activeId='';refresh();changed();});
  reset();status.textContent='请先登录，再解锁本机 API 配置。';refresh();return {root};
}
