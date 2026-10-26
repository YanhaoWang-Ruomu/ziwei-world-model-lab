export const NATIVE_ENDPOINT='http://127.0.0.1:8788';
export const NATIVE_MODEL='Qwen3.5-4B-Q4_K_M';
export function createNativeConnection({fetcher=(...args)=>fetch(...args)}={}){
  let key='',model='',generation=0;const requests=new Set();
  function disconnect(){generation++;key='';model='';for(const controller of requests)controller.abort();requests.clear();}
  async function request(route,{body,signal,token=key}={}){
    if(!token)throw Error('请在账户页连接本机图文 AI。');
    const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});requests.add(controller);
    const timer=setTimeout(abort,body?185000:6000);
    try{
      const response=await fetcher(NATIVE_ENDPOINT+route,{method:body?'POST':'GET',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw Error(data.error||'本机 AI 暂时不可用。');return data;
    }catch(e){if(controller.signal.aborted)throw Error('本机 AI 已停止或超时。');if(e instanceof TypeError)throw Error('无法连接本机 AI。请先启动本机服务，并允许浏览器访问此电脑的本地网络。');throw e;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);requests.delete(controller);}
  }
  return {
    get ready(){return Boolean(key);},get model(){return model;},disconnect,
    async connect(candidate){disconnect();if(!/^[a-f0-9]{64}$/.test(candidate))throw Error('请复制完整的本次连接码。');const ticket=generation,data=await request('/health',{token:candidate});if(ticket!==generation)throw Error('连接已取消。');if(data.ready!==true||data.local!==true||data.model!==NATIVE_MODEL||data.vision!==true)throw Error('本机图文模型尚未就绪，请稍后重试。');key=candidate;model=data.model;return data;},
    async generate(messages,{signal,json=true}={}){const ticket=generation,data=await request('/generate',{body:{messages,json},signal});if(ticket!==generation)throw Error('本机 AI 连接已切换。');if(data.model!==model||typeof data.text!=='string')throw Error('模型返回格式不正确。');return data;}
  };
}
export const nativeAi=createNativeConnection();
export function initNativeAi({el,btn}){
  const root=el('section','local-ai-panel'),code=el('input'),status=el('p');root.id='native-ai-settings';code.type='password';code.autocomplete='off';code.spellcheck=false;code.maxLength=64;code.setAttribute('aria-label','本机 AI 本次连接码');status.setAttribute('role','status');
  const link=el('a','book-secondary','打开本机连接页 ↗');link.href=NATIVE_ENDPOINT+'/';link.target='_blank';link.rel='noopener noreferrer';
  root.append(el('h3','','本机图文 AI'),el('p','muted','启动电脑上的本机 AI 服务，复制连接码后验证。连接只在当前页面会话中保留；退出账户即断开。连接后可在研究对话、书库问答和技法整理中选择本机图文模型。'),link,code,
    btn('连接并验证',async()=>{status.textContent='正在连接本机模型…';try{const candidate=code.value.trim();code.value='';await nativeAi.connect(candidate);status.textContent=`已连接 ${nativeAi.model} · 图文处理留在本机，无 API 调用费用。`;document.dispatchEvent(new Event('ziwei:native-ai-connected'));}catch(e){status.textContent=e.message;}}),
    btn('断开本机 AI',()=>{nativeAi.disconnect();status.textContent='本页面已断开。电脑服务仍在运行。';document.dispatchEvent(new Event('ziwei:native-ai-disconnected'));}),status);
  const clear=()=>{nativeAi.disconnect();code.value='';status.textContent='';document.dispatchEvent(new Event('ziwei:native-ai-disconnected'));};
  document.addEventListener('ziwei:logout',clear);document.addEventListener('ziwei:session',clear);window.addEventListener('pagehide',clear);document.querySelector('#account')?.append(root);return {root};
}
