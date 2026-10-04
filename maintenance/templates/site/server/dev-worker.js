// Local development only. Never deploy this identity simulator to the Internet.
import worker from './worker.js';
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(!['127.0.0.1','localhost'].includes(url.hostname))return new Response('Local only',{status:403});
  if(['/signin-with-chatgpt','/signout-with-chatgpt'].includes(url.pathname)){
    const signed=url.pathname==='/signin-with-chatgpt';
    return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':`local_preview_owner=${signed?'1':''}; Path=/; HttpOnly; SameSite=Lax${signed?'':'; Max-Age=0'}`}});
  }
  const headers=new Headers(request.headers);
  for(const name of [...headers.keys()])if(name.startsWith('oai-authenticated-user-'))headers.delete(name);
  if(/(?:^|;\s*)local_preview_owner=1(?:;|$)/.test(request.headers.get('cookie')||'')){
    headers.set('oai-authenticated-user-id','local-owner');
    headers.set('oai-authenticated-user-email','owner@local.test');
  }
  const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
  return worker.fetch(new Request(request.url,{method:request.method,headers,body}),{...env,LOCAL_PREVIEW:'1'},ctx);
}};
