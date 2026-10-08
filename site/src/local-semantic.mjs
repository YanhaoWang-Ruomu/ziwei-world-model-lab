import {passages} from './evidence-ranking.mjs';

export function createLocalSemantic({api,workerFactory=()=>new Worker(new URL('./semantic-worker.mjs',import.meta.url),{type:'module'}),onProgress=()=>{}}) {
  let worker=null,sequence=0,generation=0,scope='',pending=new Map();
  function clear(){
    generation++;worker?.terminate();worker=null;scope='';
    for(const {reject} of pending.values())reject(new DOMException('已停止','AbortError'));
    pending.clear();
  }
  function call(op,payload={}){
    if(!worker){
      worker=workerFactory();
      worker.onmessage=({data})=>{
        const request=pending.get(data.id);if(!request)return;
        if(data.phase==='download'){onProgress(`首次使用正在下载本机语义模型：当前文件 ${data.progress}%`);return;}
        pending.delete(data.id);data.error?request.reject(new Error(data.error)):request.resolve(data);
      };
      worker.onerror=()=>{const requests=[...pending.values()];pending.clear();clear();for(const p of requests)p.reject(new Error('本机语义模型无法启动，请使用关键词查阅。'));};
    }
    const id=++sequence;
    return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,op,...payload});});
  }
  async function search(bookId,query,{signal}={}){
    if(!bookId||bookId==='all')throw new Error('请先选择一本材料，再启用本机语义检索。');
    if(scope!==bookId){clear();scope=bookId;}
    const run=generation;const check=()=>{if(run!==generation||signal?.aborted)throw new DOMException('已停止','AbortError');};
    const abort=()=>clear();signal?.addEventListener('abort',abort,{once:true});
    const excerpts=new Map();let after=0,count=0;
    try{
      check();await call('begin');
      do{
        // Re-fetch every batch on every search: no stale grant, deleted page or correction cache.
        const batch=await api(`/api/books/${encodeURIComponent(bookId)}/corpus?after=${after}`,{signal});check();
        const chunks=[];
        for(const page of batch.pages){
          count++;
          for(const part of passages(page.text)){
            const id=`${bookId}/${page.page}/${page.fingerprint}/${part.start}`;
            excerpts.set(id,{book_id:bookId,page:page.page,title:batch.title,kind:batch.kind,source_hash:batch.source_hash,
              ...part,source:page.source,revision:page.revision,method:'语义相关 · 请核对原文'});
            chunks.push({id,text:part.quote});
          }
        }
        if(excerpts.size>12000)throw new Error('这份材料超过本机语义处理容量，请改用关键词查阅；没有使用截断后的结果。');
        onProgress(`本机正在处理第 ${count} / ${batch.expected_pages} 页（段），可随时停止。`);
        if(chunks.length)await call('add',{chunks});check();
        if(batch.next!==null&&batch.next<=after)throw new Error('页码进度异常，请重试。');
        after=batch.next;
      }while(after!==null);
      check();const result=await call('search',{query});check();
      // Validate access once more before displaying in-memory matches.
      await api(`/api/books/${encodeURIComponent(bookId)}/readiness`,{signal});check();
      return result.hits.map(hit=>excerpts.get(hit.key)).filter(Boolean);
    }catch(error){if(run===generation)clear();throw error;}
    finally{signal?.removeEventListener('abort',abort);}
  }
  return {search,clear};
}
