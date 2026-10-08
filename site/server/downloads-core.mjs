const releaseBase='https://github.com/YanhaoWang-Ruomu/ziwei-world-model-lab/releases/download/';

export function requestedRange(value,size){
  if(!value)return {start:0,end:size-1,partial:false};
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match||(!match[1]&&!match[2]))return null;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
  return {start,end,partial:true};
}

export function approvedAsset(entry){
  if(!/^\d+\.\d+\.\d+$/.test(entry.version)||!/^GuanXingTai-[\w.-]+\.(exe|apk)$/.test(entry.filename)||!Number.isSafeInteger(entry.size)||entry.size<=0||!(/^[a-f0-9]{64}$/.test(entry.sha256)))return false;
  const platform=entry.filename.endsWith('.apk')?'android':'windows';
  return entry.assetUrl===`${releaseBase}${platform}-v${entry.version}/${entry.filename}`;
}

const unavailable=()=>new Response('安装包暂时无法读取，请稍后重试。',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});

// Keep the original same-origin download URL for installed Windows/Android clients.
// Only immutable public installers are requested; no account headers go upstream.
export async function serveReleaseDownload(request,manifest,history={},fetchAsset=fetch){
  const pathname=new URL(request.url).pathname;
  const entry=Object.values(manifest).find(item=>item?.url===pathname);
  if(!entry){
    const old=Object.entries(history).find(([,item])=>item?.url===pathname);
    const latest=old&&manifest[old[0].split('-')[0]];
    if(latest){
      if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
      return new Response(null,{status:302,headers:{Location:latest.url,'Cache-Control':'no-store'}});
    }
    return new Response('找不到此安装包。',{status:404});
  }
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  if(!approvedAsset(entry))return unavailable();
  const etag=`"${entry.sha256}"`;
  const headers=new Headers({'Content-Type':entry.type,'Content-Disposition':`attachment; filename="${entry.filename}"`,'X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','ETag':etag,'Cache-Control':'public, max-age=31536000, immutable, no-transform'});
  if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
  const ifRange=request.headers.get('If-Range');
  const range=requestedRange(!ifRange||ifRange===etag?request.headers.get('Range'):null,entry.size);
  if(!range){headers.set('Content-Range',`bytes */${entry.size}`);return new Response(null,{status:416,headers});}
  const {start,end,partial}=range,length=end-start+1,status=partial?206:200;
  const contentRange=`bytes ${start}-${end}/${entry.size}`;
  headers.set('Content-Length',String(length));
  if(partial)headers.set('Content-Range',contentRange);
  if(request.method==='HEAD')return new Response(null,{status,headers});
  let upstream;
  try{
    const upstreamHeaders=new Headers({Accept:'application/octet-stream','User-Agent':'GuanXingTai-download-service'});
    if(partial)upstreamHeaders.set('Range',`bytes=${start}-${end}`);
    upstream=await fetchAsset(entry.assetUrl,{method:'GET',headers:upstreamHeaders,redirect:'follow',signal:request.signal});
    const size=upstream.headers.get('Content-Length');
    if(upstream.status!==status||!upstream.body||(size!==null&&Number(size)!==length)||(partial&&upstream.headers.get('Content-Range')!==contentRange)){
      await upstream.body?.cancel().catch(()=>{});return unavailable();
    }
  }catch{return unavailable();}
  const reader=upstream.body.getReader();let remaining=length,closed=false;
  const stream=new ReadableStream({
    async pull(controller){
      try{
        const result=await reader.read();
        if(result.done){if(remaining)throw Error('Incomplete installer download');closed=true;controller.close();return;}
        if(result.value.byteLength>remaining)throw Error('Unexpected installer length');
        remaining-=result.value.byteLength;controller.enqueue(result.value);
        if(remaining===0){closed=true;await reader.cancel();controller.close();}
      }catch{closed=true;controller.error(new Error('Installer download interrupted'));await reader.cancel().catch(()=>{});}
    },
    async cancel(){if(!closed){closed=true;await reader.cancel().catch(()=>{});}}
  });
  return new Response(stream,{status,headers});
}
