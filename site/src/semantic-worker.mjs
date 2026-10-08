import {pipeline,env} from '@huggingface/transformers';
import {cosine} from './evidence-ranking.mjs';
// A pinned downloadable model; text is evaluated by WASM in this worker, never an inference API.
env.allowLocalModels=false;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/onnx/',self.location.href).href;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
let extractor,chain=Promise.resolve(),cache=new Map(),active=new Set();
async function embed(text,prefix,requestId){
  extractor??=pipeline('feature-extraction','Xenova/multilingual-e5-small',{
    revision:'761b726dd34fb83930e26aab4e9ac3899aa1fa78',dtype:'q8',device:'wasm',
    progress_callback:event=>{if(event.status==='progress')self.postMessage({id:requestId,progress:Math.round(event.progress||0),phase:'download'});}
  });
  const pipe=await extractor;
  const encoded=await pipe.tokenizer(prefix+text,{truncation:false});
  if(encoded.input_ids.dims.at(-1)>512)throw new Error('token-capacity');
  const tensor=await pipe(prefix+text,{pooling:'mean',normalize:true,truncation:true,max_length:512});
  return Array.from(tensor.data);
}
self.onmessage=({data})=>{
  // Serialize inference to avoid overlapping WASM executions and half-built indexes.
  chain=chain.then(async()=>{
    const {id,op}=data;
    try{
      if(op==='begin'){active=new Set();self.postMessage({id,ok:true});return;}
      if(op==='add'){
        for(const chunk of data.chunks){
          if(active.size>=12000&&!active.has(chunk.id))throw new Error('capacity');
          active.add(chunk.id);
          if(!cache.has(chunk.id))cache.set(chunk.id,await embed(chunk.text,'passage: ',id));
        }
        self.postMessage({id,ok:true});return;
      }
      if(op==='search'){
        for(const key of cache.keys())if(!active.has(key))cache.delete(key);
        const query=await embed(data.query,'query: ',id);
        const matches=[...active].map(key=>({key,score:cosine(query,cache.get(key))})).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
        // One best passage per page, so a long page cannot crowd out all other sources.
        const seen=new Set(),hits=[];
        for(const match of matches){const page=match.key.split('/').slice(0,2).join('/');if(seen.has(page))continue;seen.add(page);hits.push(match);if(hits.length===8)break;}
        self.postMessage({id,hits});return;
      }
      throw new Error('operation');
    }catch{
      // Never return model exceptions containing input text.
      self.postMessage({id,error:'本机语义处理未完成。请检查模型下载连接或设备可用内存，可继续使用关键词查阅。'});
    }
  });
};
