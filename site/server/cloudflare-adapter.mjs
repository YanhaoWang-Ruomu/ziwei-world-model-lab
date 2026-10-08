// Production entry adapter: never import the local identity simulator here.
export function cloudflareWorker(application){
  return {async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(path.startsWith('/__test')||path.startsWith('/__preview'))return new Response('Not found',{status:404});
    if(path==='/signin-with-chatgpt'||path==='/signout')return new Response(null,{status:303,headers:{Location:'/#account','Cache-Control':'no-store'}});
    const headers=new Headers(request.headers);
    for(const name of [...headers.keys()])if(name.toLowerCase().startsWith('oai-'))headers.delete(name);
    return application.fetch(new Request(request,{headers}),{...env,AUTH_MODE:'standalone',OWNER_EMAIL:''},ctx);
  }};
}
