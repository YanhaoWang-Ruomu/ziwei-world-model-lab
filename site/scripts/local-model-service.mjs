import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

export const LOCAL_MODEL='Qwen3.5-4B-Q4_K_M';
export const LOCAL_ORIGINS=new Set(['http://127.0.0.1:8788','http://127.0.0.1:8769','http://127.0.0.1:8770','http://127.0.0.1:8879','https://ziwei-world-model-lab.vocal-chime-3672.chatgpt.site']);
export function validateLocalRequest(data){
  if(!data||!Array.isArray(data.messages)||data.messages.length<1||data.messages.length>12)throw Error('消息格式不正确。');
  let textSize=0,images=0;
  const messages=data.messages.map(m=>{
    if(!['system','user','assistant'].includes(m.role))throw Error('不支持的消息角色。');
    const text=t=>{if(typeof t!=='string'||t.length>32000)throw Error('文字过长。');textSize+=t.length;return t;};
    if(typeof m.content==='string')return {role:m.role,content:text(m.content)};
    if(m.role!=='user'||!Array.isArray(m.content)||m.content.length>3)throw Error('图文消息格式不正确。');
    return {role:m.role,content:m.content.map(p=>{
      if(p.type==='text')return {type:'text',text:text(p.text)};
      const url=p.image_url?.url;
      if(p.type!=='image_url'||typeof url!=='string'||url.length>6000000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)||++images>1)throw Error('仅支持一张本机 PNG、JPEG 或 WebP 图片。');
      return {type:'image_url',image_url:{url}};
    })};
  });
  if(textSize>36000)throw Error('本次文字过长，请缩小研究范围。');
  return {model:LOCAL_MODEL,messages,stream:false,max_tokens:1536,temperature:0.2,chat_template_kwargs:{enable_thinking:false},...(data.json===true?{response_format:{type:'json_object'}}:{})};
}
function equal(a,b){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>观星台 · 本机 AI</title><style>body{margin:0;background:#101c27;color:#ece0bd;font:18px/1.8 system-ui}main{max-width:680px;margin:8vh auto;padding:32px;background:linear-gradient(130deg,#24373b,#15232e);border:1px solid #9a8053;border-radius:20px}h1{font-family:serif}button,a{font:inherit;color:#f7e8c5}button{background:#365852;border:1px solid #a28b62;padding:12px 18px;border-radius:8px;cursor:pointer}input{width:95%;background:#101c27;color:#e3d2a8;border:1px solid #806e51;padding:12px;font:15px monospace}small{color:#bcb69f}</style><main><p>观星台 · LOCAL AI</p><h1>本机图文研究助手</h1><p id="state">正在检查模型…</p><p>Qwen3.5-4B · 文字与图片在这台电脑处理。</p><p>在观星台“账户 → 本机图文 AI”中粘贴本次连接码，然后选择“连接并验证”。</p><input id="key" type="password" readonly aria-label="本次连接码"><p><button id="copy">复制连接码</button> <a href="http://127.0.0.1:8879/#account">打开本地观星台</a></p><small>连接码每次启动会变化，网页仅在当前会话中保留。关闭此窗口不会停止服务；使用“停止本机 AI”脚本可释放显存。模型不会自动读取电脑文件。</small><script>fetch('/pair-key').then(r=>r.json()).then(d=>{document.querySelector('#key').value=d.key;return fetch('/health',{headers:{Authorization:'Bearer '+d.key}})}).then(r=>r.json()).then(d=>document.querySelector('#state').textContent=d.ready?'模型已就绪，可以连接。':'模型正在加载，请稍后刷新。').catch(()=>document.querySelector('#state').textContent='服务未就绪，请检查启动窗口。');document.querySelector('#copy').onclick=async()=>{await navigator.clipboard.writeText(document.querySelector('#key').value);document.querySelector('#copy').textContent='已复制，请粘贴到观星台账户页';};</script></main></html>`;

export function createLocalModelService({key=randomBytes(32).toString('hex'),upstream='http://127.0.0.1:8787',upstreamKey='',fetcher=fetch,ownOrigin='http://127.0.0.1:8788',origins=LOCAL_ORIGINS}={}){
  const parsed=new URL(upstream);if(parsed.hostname!=='127.0.0.1'||parsed.protocol!=='http:'||parsed.username||parsed.password)throw Error('Model must bind to loopback.');
  let active=null;
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin,host=new URL(ownOrigin).host;
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    if(req.headers.host!==host||origin&&!origins.has(origin))return send(403,{error:'不允许此网页连接。'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){
      if(!origin||!origins.has(origin)||!['GET','POST'].includes(req.headers['access-control-request-method']))return send(403,{error:'不允许的请求。'});
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Private-Network':'true','Cache-Control':'no-store'});return res.end();
    }
    if(req.url==='/'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});return res.end(page);
    }
    if(req.url==='/pair-key'&&req.method==='GET'){
      if(origin&&origin!==ownOrigin||req.headers['sec-fetch-site']!=='same-origin'&&origin!==ownOrigin)return send(403,{error:'请在本机连接页面复制连接码。'});
      return send(200,{key});
    }
    if(!equal(req.headers.authorization,'Bearer '+key))return send(401,{error:'请在本机连接页复制本次连接码。'});
    if(req.url==='/health'&&req.method==='GET'){
      try{const response=await fetcher(upstream+'/health',{headers:{Authorization:'Bearer '+upstreamKey},signal:AbortSignal.timeout(4000)});return send(200,{ready:response.ok,model:LOCAL_MODEL,vision:true,local:true});}catch{return send(503,{error:'模型尚未就绪，请稍后重试。'});}
    }
    if(req.url!=='/generate'||req.method!=='POST')return send(404,{error:'接口不存在。'});
    if(active)return send(409,{error:'本机模型正在处理其他任务，请稍后再试。'});
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'请求格式不正确。'});
    const controller=new AbortController();active=controller;const timer=setTimeout(()=>controller.abort(),180000);
    const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.once('close',disconnected);
    try{
      let bytes=0;const parts=[];for await(const part of req){bytes+=part.length;if(bytes>6500000){send(413,{error:'图片或文字过大。'});req.destroy();return;}parts.push(part);}
      let body;try{body=validateLocalRequest(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(e){return send(400,{error:e.message});}
      const response=await fetcher(upstream+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+upstreamKey},body:JSON.stringify(body),signal:controller.signal});
      if(!response.ok)return send(502,{error:'本机模型未能完成本次处理，请缩短内容后重试。'});
      const result=await response.json(),content=result.choices?.[0]?.message?.content;
      if(typeof content!=='string'||!content.trim()||content.length>20000||result.choices?.[0]?.finish_reason==='length')return send(502,{error:'模型回答不完整，请缩小问题范围。'});
      return send(200,{text:content,model:LOCAL_MODEL,usage:result.usage});
    }catch{if(!res.destroyed)send(503,{error:controller.signal.aborted?'本机处理已停止或超时，请缩小范围后重试。':'本机模型暂时不可用，请检查启动状态。'});}
    finally{clearTimeout(timer);res.removeListener('close',disconnected);if(active===controller)active=null;}
  });
  server.once('close',()=>active?.abort());return server;
}

async function main(){
  const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../../local-ai-runtime',import.meta.url)));
  const executable=path.join(root,'bin','llama-server.exe');
  for(const file of [executable,path.join(root,'Qwen3.5-4B-Q4_K_M.gguf'),path.join(root,'mmproj-F16.gguf')])if(!fs.existsSync(file))throw Error('请先安装并校验本机模型。');
  const upstreamKey=randomBytes(32).toString('hex'),pidFile=path.join(root,'running.json');
  const child=spawn(executable,['-m',path.join(root,'Qwen3.5-4B-Q4_K_M.gguf'),'--mmproj',path.join(root,'mmproj-F16.gguf'),'--host','127.0.0.1','--port','8787','--alias',LOCAL_MODEL,'--ctx-size','8192','--parallel','1','--batch-size','128','--ubatch-size','128','--n-gpu-layers','99','--jinja','--no-webui','--log-disable'],{windowsHide:true,stdio:'ignore',env:{...process.env,LLAMA_API_KEY:upstreamKey}});
  const server=createLocalModelService({upstreamKey});let closing=false;
  const close=()=>{if(closing)return;closing=true;child.kill();server.close();try{fs.unlinkSync(pidFile);}catch{};};
  child.once('error',()=>{console.error('无法启动本机模型，请检查运行库。');close();process.exitCode=1;});
  child.once('exit',code=>{if(!closing){console.error('本机模型进程已退出，退出码 '+code);close();process.exitCode=1;}});
  server.once('error',()=>{console.error('本机服务端口已占用，请关闭重复启动窗口。');close();process.exitCode=1;});
  server.listen(8788,'127.0.0.1',()=>{fs.writeFileSync(pidFile,JSON.stringify({service:process.pid,model:child.pid}));console.log('本机连接页：http://127.0.0.1:8788/（模型加载需要稍候）');});
  for(const event of ['SIGINT','SIGTERM'])process.on(event,close);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
