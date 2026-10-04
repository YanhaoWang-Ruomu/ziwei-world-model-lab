// Local preview only. The production build always enters worker.js directly.
import worker from './worker.js';
import {worldHarness} from '../tests/world-community-harness.js';
import {communityDemo} from '../tests/community-demo.mjs';
export default { async fetch(request,env,ctx) {
  const url=new URL(request.url);
  if(!['127.0.0.1','localhost'].includes(url.hostname))return new Response('Local only',{status:403});
  if(url.pathname==='/__test/demo'&&env.PREVIEW_PURPOSE==='fictional-persistence'){
    const role=url.searchParams.get('role')||'public',headers=new Headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    for(const key of ['local_preview_owner','local_preview_core','local_preview_subject','local_preview_viewer','ziwei_view_role'])headers.append('Set-Cookie',`${key}=; Path=/; Max-Age=0; SameSite=Lax`);
    const cookie={reader:'local_preview_subject=community-demo',core:'local_preview_core=1',founder:'local_preview_owner=1'}[role];
    if(cookie)headers.append('Set-Cookie',cookie+'; Path=/; HttpOnly; SameSite=Lax');
    return new Response(communityDemo(role,url.searchParams.get('view')), {headers});
  }
  if(url.pathname==='/__test/world'&&env.PREVIEW_PURPOSE==='fictional-persistence')return new Response(worldHarness,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  if(url.pathname==='/signin-with-chatgpt'||url.pathname==='/signout-with-chatgpt') {
    const signed=url.pathname==='/signin-with-chatgpt';
    return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':`local_preview_owner=${signed?'1':''}; Path=/; HttpOnly; SameSite=Lax${signed?'':'; Max-Age=0'}`}});
  }
  const headers=new Headers(request.headers);
  for(const k of [...headers.keys()])if(k.startsWith('oai-authenticated-user-'))headers.delete(k);
  if(/(?:^|;\s*)local_preview_owner=1(?:;|$)/.test(request.headers.get('cookie')||'')) {
    headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email','owner@local.test');
  } else if (/(?:^|;\s*)local_preview_core=1(?:;|$)/.test(request.headers.get('cookie')||'')) {
    headers.set('oai-authenticated-user-id','local-core');headers.set('oai-authenticated-user-email','core@local.test');
  } else if (/(?:^|;\s*)local_preview_subject=([a-z0-9-]{1,80})(?:;|$)/.test(request.headers.get('cookie')||'')) {
    const subject=(request.headers.get('cookie')||'').match(/(?:^|;\s*)local_preview_subject=([a-z0-9-]{1,80})(?:;|$)/)[1];
    headers.set('oai-authenticated-user-id','local-reader-'+subject);headers.set('oai-authenticated-user-email','reader@local.test');
  } else if (/(?:^|;\s*)local_preview_viewer=1(?:;|$)/.test(request.headers.get('cookie')||'')) {
    headers.set('oai-authenticated-user-id','local-reader');headers.set('oai-authenticated-user-email','reader@local.test');
  }
  // The local proxy must finish receiving the body before an early authorization
  // rejection; otherwise workerd may cancel its incoming stream before returning 403.
  const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
  return worker.fetch(new Request(request.url,{method:request.method,headers,body}),{...env,LOCAL_PREVIEW:'1'},ctx);
}};
