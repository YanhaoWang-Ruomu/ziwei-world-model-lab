import {MODEL,messagesFor,validateOutput,verifySources} from './local-ai-contracts.mjs';
import {createLocalGenerator} from './local-ai-runtime.mjs';
import {createVault} from './vault-storage.mjs';

const vault=createVault({namespace:'ziwei-local-ai',lockEvent:'ziwei:ai-locked'}),generator=createLocalGenerator();
let viewer={},epoch=0,busy=false,api,refreshNotebook=()=>{},activeTask=null,cloudController=null;
const changed=()=>document.dispatchEvent(new Event('ziwei:ai-journal'));
const fold=x=>window.OpenCC?.Converter({from:'t',to:'cn'})(x)||x;
const tick=()=>new Date().toISOString();
const modelKey=(provider='local')=>provider==='qwen'?'qwen-plus-2025-12-01:prompt-1':JSON.stringify(MODEL);
async function access(input){
  const session=await api('/api/session');
  if((session.userId||'')!==(viewer.userId||'')||!!session.core!==!!viewer.core)throw Error('账户或权限已变化，请重新进入当前页面。');
  if(input.kind==='technique'&&!session.core)throw Error('技法 AI 原文整理仅供核心及创建者账户使用。');
  await verifySources(input,api);
}
async function persist(task){if(!vault.unlocked)throw Error('本机研究册已锁定，请先解锁再继续。');await vault.put(task);changed();}
export async function runLocalTask(task,{onProgress=()=>{},save=false}={}){
  if(busy)throw Error('已有本机 AI 任务正在运行。请等待完成或先停止。');
  messagesFor(task.input);
  if(task.model!==modelKey(task.provider))throw Error('模型或整理方式已更新，请新建任务，旧记录可供对照。');
  busy=true;const ticket=epoch;activeTask=task.id;
  const current=()=>{if(ticket!==epoch)throw Error('任务已停止或账户已变化。');};
  const execute=async()=>{
    if(save){const prior=await vault.get(task.id);current();if(prior)task=prior;}
    await access(task.input);current();
    if(save&&!task.created)throw Error('任务记录不完整。');
    task={...task,steps:[...(task.steps||[])]};
    if(!task.steps.some(s=>s.name==='sources'))task.steps.push({name:'sources',at:tick()});
    if(save)await persist(task);current();
    if(!task.raw){
      onProgress('正在准备本机模型…');
      let raw;
      if(task.provider==='qwen'){
        if(task.input.kind!=='answer'||!task.publicQuestionConfirmed)throw Error('千问只处理经确认的公开书库问答。');
        cloudController=new AbortController();onProgress('千问正在依据公开原文整理回答…');
        const data=await api('/api/ai/qwen/answer',{method:'POST',signal:cloudController.signal,body:JSON.stringify({id:task.requestId||task.id,question:task.input.question,publicQuestionConfirmed:true,references:task.input.citations.map(({book_id,page,start,end,source_hash,revision,source})=>({book_id,page,start,end,source_hash,revision,source}))})});
        current();raw=data.raw;task={...task,input:data.input,usage:data.usage};cloudController=null;
      }else raw=await generator.generate(messagesFor(task.input),message=>{if(ticket===epoch)onProgress(message);});current();
      task={...task,raw,steps:[...task.steps,{name:'generated',at:tick()}]};
      if(save)await persist(task);current();
    }
    await access(task.input);current();
    const result=validateOutput(task.input,task.raw,fold);
    task={...task,result,steps:task.steps.some(s=>s.name==='validated')?task.steps:[...task.steps,{name:'validated',at:tick()}],status:'review'};
    if(save)await persist(task);current();return task;
  };
  try{
    if(save){
      if(!navigator.locks)throw Error('当前浏览器不支持安全恢复锁，可使用不保存进度的临时任务。');
      return await navigator.locks.request('ziwei-ai-'+task.id,{ifAvailable:true},lock=>{if(!lock)throw Error('另一窗口正在处理此任务，请稍后继续。');return execute();});
    }
    return await execute();
  }finally{busy=false;activeTask=null;}
}
function newTask(input,provider='local',publicQuestionConfirmed=false){const id=crypto.randomUUID();return {id,requestId:id,kind:'ai-task',created:tick(),provider,publicQuestionConfirmed,model:modelKey(provider),input:structuredClone(input),steps:[],status:'pending'};}
function stop(){epoch++;generator.stop();cloudController?.abort();cloudController=null;}
export function createAiPanel({el,btn,getInput,onApply}){
  const root=el('details','local-ai-panel'),message=el('p'),output=el('div','local-ai-output'),save=el('input');save.type='checkbox';
  root.append(el('summary','','AI 助手 · 依据原文整理草稿'),el('p','muted','本机模式首次需下载约 630 MB 模型及运行文件，建议 Wi-Fi 和 2 GB 以上可用内存，不调用收费服务。千问模式只支持公开书库问答，需核心账户；会把问题及公开选段发送至阿里云北京。所有结果均需核对。'));
  const provider=el('select');provider.setAttribute('aria-label','AI 运行位置');provider.append(new Option('本机 AI · 无调用费用','local'));if(!onApply)provider.append(new Option('千问云端 · 仅公开书库','qwen'));
  const publicCheck=el('input');publicCheck.type='checkbox';const publicLabel=el('label','review-check');publicLabel.hidden=true;publicLabel.append(publicCheck,document.createTextNode('确认问题不含个人资料或私密技法，同意将问题和公开选段发送给千问。'));
  provider.onchange=async()=>{publicLabel.hidden=provider.value!=='qwen';publicCheck.checked=false;message.textContent='';if(provider.value!=='qwen'||!api)return;const token=epoch;try{const state=await api('/api/ai/qwen/status');if(token!==epoch||provider.value!=='qwen')return;message.textContent=state.enabled?`千问已就绪 · 今日已保守预留 ${state.reservedTodayCny.toFixed(2)} / 5 元。每次预留 0.25 元（不等于实际账单），以北京时间换日；停止请求仍可能计费。`:'千问尚未启用：需先在服务器配置密钥及预算。';}catch(e){if(token===epoch&&provider.value==='qwen')message.textContent=e.message;}};root.append(provider,publicLabel);
  const label=el('label','review-check');label.append(save,document.createTextNode('加密保存进度（需先在研究实验室解锁本机 AI 研究册）'));
  const run=btn('开始本机 AI 整理',async()=>{
    output.replaceChildren();message.textContent='';run.disabled=true;cancel.hidden=false;let ticket=epoch;
    try{
      if(!api)throw Error('页面尚未准备好，请稍后重试。');
      if(save.checked&&!vault.unlocked)throw Error('请先在研究实验室创建或解锁本机 AI 研究册。');
      if(provider.value==='qwen'&&!publicCheck.checked)throw Error('请先确认问题不含私密内容，并同意发送公开选段。');
      const input=getInput(),task=newTask(input,provider.value,publicCheck.checked),saved=save.checked;
      const done=await runLocalTask(task,{save:saved,onProgress:t=>{message.textContent=t;}});
      if(ticket!==epoch||!root.isConnected)return;
      renderTask(output,done,{el,btn,onApply:onApply?()=>{if(JSON.stringify(getInput())!==JSON.stringify(input))throw Error('原文已修改，请重新生成草稿。');onApply(done.result);}:null});
      message.textContent=saved?'AI 草稿已加密保存，可在研究实验室复盘。':'AI 草稿已生成，本次未保存进度。';
    }catch(e){if(ticket===epoch&&root.isConnected)message.textContent=e.message;}
    finally{run.disabled=false;cancel.hidden=true;}
  },'book-primary');run.textContent='开始 AI 整理';
  const cancel=btn('停止整理',()=>{stop();message.textContent='已停止。已保存的步骤可以继续；未完成的生成步骤需重新运行。';run.disabled=false;cancel.hidden=true;});cancel.hidden=true;
  message.setAttribute('role','status');root.append(label,run,cancel,message,output);
  const reset=()=>{stop();output.replaceChildren();message.textContent='';run.disabled=false;cancel.hidden=true;};
  const clear=()=>{output.replaceChildren();message.textContent='';};
  document.addEventListener('ziwei:ai-cleared',clear);
  return {root,reset,dispose(){reset();document.removeEventListener('ziwei:ai-cleared',clear);}};
}
function renderTask(host,task,{el,btn,onApply}){
  host.replaceChildren(el('p','local-ai-warning','AI 草稿 · 引用与格式检查不代表解释正确。请对照原文核实。'));
  const r=task.result;
  if(task.input.kind==='answer')for(const claim of r.claims){const c=task.input.citations[claim.source-1],article=el('article','library-citation');article.append(el('p','',claim.text),el('blockquote','',claim.quote),el('small','',`[${claim.source}] ${c.title} · 第 ${c.page} 页 / 段`));host.append(article);}
  else for(const [i,line] of r.lines.entries())host.append(el('p','',`${i+1}. ${line.condition}${line.accepted?'':'（需要手动整理）'}`),el('blockquote','',line.source));
  for(const u of r.uncertainties)host.append(el('p','tech-unresolved',u));
  if(onApply){const check=el('input');check.type='checkbox';const label=el('label','review-check');label.append(check,document.createTextNode('已逐条对照原文，愿意将候选条件带入编辑器继续核对。'));const status=el('p');host.append(label,btn('带入待核对条件',()=>{if(!check.checked){status.textContent='请先逐条核对并勾选确认。';return;}try{onApply();status.textContent='已带入编辑器，尚未保存、送审或发布。';}catch(e){status.textContent=e.message;}}),status);}
}
export function initLocalAi({api:request,el,btn}){
  api=request;
  const root=el('section','local-ai-panel'),auth=el('div'),password=el('input'),message=el('p'),list=el('div'),detail=el('div'),compare=el('div');
  root.id='local-ai-research';password.type='password';password.autocomplete='new-password';password.setAttribute('aria-label','本机 AI 研究册独立密码');password.placeholder='独立解锁密码（至少 12 位）';
  root.append(el('h2','','本机 AI 研究册'),el('p','muted','保存查阅依据、AI 草稿、运行步骤和后续反馈。模型不会自行发布内容或执行命盘规则。任务仅保存在当前浏览器的加密空间，不随账户同步到其他设备；忘记独立密码无法恢复。清理浏览器前请导出备份。'));
  const safe=fn=>async()=>{try{await fn();}catch(e){message.textContent=e.message;}};
  auth.append(password,btn('创建 / 解锁研究册',safe(async()=>{
    if(!viewer.authenticated||!viewer.userId)throw Error('请先登录个人账户，再创建本机研究册。');
    const token=epoch,user=viewer.userId;await vault.open(user,password.value);password.value='';if(token!==epoch){vault.lock();return;}
    message.textContent='研究册已解锁。可回书库或技法编辑器勾选加密保存进度。';await refreshNotebook();
  }), 'book-primary'));
  const actions=el('div','local-ai-actions');
  actions.append(btn('刷新研究记录',safe(()=>refreshNotebook())),btn('锁定研究册',()=>{stop();vault.lock();list.replaceChildren();detail.replaceChildren();compare.replaceChildren();document.dispatchEvent(new Event('ziwei:ai-cleared'));message.textContent='已锁定。';}),btn('停止当前任务',()=>{stop();message.textContent='已停止，可从最后保存的步骤继续。';}),btn('导出加密备份',safe(async()=>{
    const blob=new Blob([JSON.stringify(await vault.backup())],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='观星台-AI研究册-加密备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  })));
  const restoreFile=el('input'),restorePassword=el('input');restoreFile.type='file';restoreFile.accept='.json';restoreFile.setAttribute('aria-label','AI 研究册加密备份文件');restorePassword.type='password';restorePassword.placeholder='备份原密码';restorePassword.setAttribute('aria-label','备份原密码');
  const restore=el('details');restore.append(el('summary','','恢复加密备份'),restoreFile,restorePassword,btn('恢复到已解锁研究册',safe(async()=>{const file=restoreFile.files[0];if(!file||file.size>20*1024*1024)throw Error('请选择 20 MB 以内的研究册备份。');const value=JSON.parse(await file.text());if(value?.format!=='ziwei-encrypted-vault-v1'||value.records?.some(r=>r.data&&r.kind!=='ai-task'))throw Error('请选择 AI 研究册备份。');await vault.restore(value,restorePassword.value);restorePassword.value='';restoreFile.value='';await refreshNotebook();message.textContent='研究册已恢复。';})));
  root.append(auth,actions,restore,message,list,compare,detail);document.querySelector('#world')?.append(root);message.setAttribute('role','status');
  let selected=[];
  async function open(task){
    detail.replaceChildren();const token=epoch;await access(task.input);if(token!==epoch)return;
    const current=await vault.get(task.id);if(!current||token!==epoch)return;
    detail.append(el('h3','',current.input.kind==='answer'?current.input.question:'中文技法草稿'),el('p','muted',`创建于 ${current.created} · ${current.steps.map(s=>({sources:'原文检查',generated:'模型生成',validated:'结构检查'})[s.name]).join(' → ')||'待开始'} · ${current.provider==='qwen'?'千问 Plus 北京云端':'Qwen3 0.6B 本机'} / 整理方式 v1`));
    if(current.result){current.result=validateOutput(current.input,current.raw,fold);const output=el('div');renderTask(output,current,{el,btn});detail.append(output);}
    const resume=btn(current.result?'重新核对已保存草稿':'继续未完成步骤',safe(async()=>{const done=await runLocalTask(current,{save:true,onProgress:t=>{message.textContent=t;}});if(token!==epoch)return;await open(done);message.textContent='已完成至待人工核对步骤。';}));
    detail.append(resume,btn('创建对照分支，重新生成',safe(async()=>{const branch={...newTask(current.input,current.provider,current.publicQuestionConfirmed),parentId:current.id};await persist(branch);await open(branch);})),btn('删除这条研究记录',safe(async()=>{if(activeTask===current.id)throw Error('请先停止此任务。');await vault.remove(current.id);detail.replaceChildren();selected=selected.filter(x=>x!==current.id);compare.replaceChildren();await refreshNotebook();})));
    if(current.result){
      detail.append(el('h4','','事后反馈（保留原草稿）'));
      for(const f of current.feedback||[])detail.append(el('p','',`${f.at} · ${f.verdict}：${f.text}`));
      const note=el('textarea'),verdict=el('select');note.maxLength=2000;note.setAttribute('aria-label','实际情况与反例');note.placeholder='记录实际情况、反例或解释偏差，不以规则符合数当作发生概率。';for(const value of ['尚无法判断','得到支持','出现反例','资料不足'])verdict.append(new Option(value,value));verdict.setAttribute('aria-label','反馈判断');
      detail.append(verdict,note,btn('追加反馈',safe(async()=>{
        if(!note.value.trim())throw Error('请填写反馈依据。');if(!navigator.locks)throw Error('当前浏览器不支持安全保存锁。');
        await navigator.locks.request('ziwei-ai-'+current.id,async()=>{const latest=await vault.get(current.id);if(!latest||token!==epoch)throw Error('记录或账户已变化。');await persist({...latest,feedback:[...(latest.feedback||[]),{at:tick(),verdict:verdict.value,text:note.value.trim()}]});});await open(current);
      })));
    }
  }
  refreshNotebook=async()=>{
    const token=epoch;list.replaceChildren();auth.hidden=vault.unlocked;if(!vault.unlocked){list.append(el('p','muted','解锁后查看本机研究进度。'));return;}
    const rows=await vault.list({catalog:false,kind:'ai-task'});if(token!==epoch)return;
    for(const task of rows.sort((a,b)=>b.created.localeCompare(a.created))){
      // Do not expose stored material titles or results until current source access is rechecked.
      const row=el('div','local-ai-record');row.append(el('span','',`${task.created} · ${task.input.kind==='answer'?'书库问答':'技法整理'} · ${task.result?'待人工核对':'可继续'}`),btn('核对权限并打开',safe(()=>open(task))));
      const box=el('input');box.type='checkbox';box.checked=selected.includes(task.id);box.setAttribute('aria-label','选择此记录作对照');box.onchange=()=>{selected=selected.filter(x=>x!==task.id);if(box.checked){selected.push(task.id);if(selected.length>2){selected.shift();refreshNotebook();}}};row.append(box,btn('删除',safe(async()=>{if(activeTask===task.id)throw Error('请先停止此任务。');await vault.remove(task.id);detail.replaceChildren();compare.replaceChildren();selected=selected.filter(x=>x!==task.id);await refreshNotebook();})));list.append(row);
    }
    if(!rows.length)list.append(el('p','','尚无研究记录。在 AI 助手中勾选加密保存后开始任务。'));
    list.append(btn('并排对照两份草稿',safe(async()=>{
      compare.replaceChildren();if(selected.length!==2)throw Error('请勾选两份记录。');const tasks=[];
      for(const id of selected){const task=await vault.get(id);if(!task?.result)throw Error('请选择已生成的两份草稿。');await access(task.input);task.result=validateOutput(task.input,task.raw,fold);tasks.push(task);}if(token!==epoch)return;
      for(const task of tasks){const column=el('article');column.append(el('h3','',task.input.kind==='answer'?task.input.question:'技法原文对照'),el('p','muted',task.created));const content=el('div');renderTask(content,task,{el,btn});column.append(content);compare.append(column);}compare.className='local-ai-comparison';
    })));
  };
  document.addEventListener('ziwei:session',e=>{viewer=e.detail||{};stop();vault.lock();auth.hidden=false;password.value='';restorePassword.value='';list.replaceChildren();detail.replaceChildren();compare.replaceChildren();selected=[];document.dispatchEvent(new Event('ziwei:ai-cleared'));});
  const clear=()=>{stop();vault.lock();auth.hidden=false;list.replaceChildren();detail.replaceChildren();compare.replaceChildren();document.dispatchEvent(new Event('ziwei:ai-cleared'));};
  for(const event of ['ziwei:logout','ziwei:material-deleting','ziwei:material-deleted'])document.addEventListener(event,clear);
  window.addEventListener('pagehide',clear);
  document.addEventListener('ziwei:ai-journal',()=>{refreshNotebook().catch(()=>{message.textContent='本机记录未能读取，请重新解锁。';});});
  document.addEventListener('ziwei:ai-locked',()=>{auth.hidden=false;});
  refreshNotebook();
  return {root};
}
