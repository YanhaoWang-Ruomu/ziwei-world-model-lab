// Public source downloads stay on the official download service; no installer is vendored.
import manifest from '../src/downloads-manifest.json' with {type:'json'};
const official='https://ziwei-world-model-lab.vocal-chime-3672.chatgpt.site';
export async function downloadRoute(request){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const pathname=new URL(request.url).pathname;
  const entry=Object.values(manifest).find(item=>item&&item.url===pathname);
  if(!entry)return new Response('请从官方下载页选择当前版本。',{status:404});
  return new Response(null,{status:302,headers:{Location:new URL(pathname,official).href,'Cache-Control':'no-store'}});
}
