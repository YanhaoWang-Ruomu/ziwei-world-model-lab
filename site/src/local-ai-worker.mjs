import {pipeline,env} from '@huggingface/transformers';
import {MODEL} from './local-ai-contracts.mjs';
env.allowLocalModels=false;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/onnx/',self.location.href).href;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
let generator;
self.onmessage=async({data:{id,messages}})=>{
  try{
    generator??=pipeline('text-generation',MODEL.id,{revision:MODEL.revision,dtype:MODEL.dtype,device:'wasm',progress_callback:e=>{
      if(e.status==='progress')self.postMessage({id,progress:`下载本机模型文件 ${Math.floor(e.progress||0)}%`});
    }});
    const pipe=await generator;
    const prompt=pipe.tokenizer.apply_chat_template(messages,{tokenize:false,add_generation_prompt:true,enable_thinking:false});
    const tokens=await pipe.tokenizer(prompt,{truncation:false});
    if(tokens.input_ids.dims.at(-1)>2600){self.postMessage({id,error:'文字超过本机处理长度，请减少原文段数或分段整理。'});return;}
    self.postMessage({id,progress:'本机 AI 正在整理，首次运行可能需要数分钟；可以随时停止。'});
    const result=await pipe(prompt,{max_new_tokens:640,do_sample:false,return_full_text:false});
    self.postMessage({id,text:result[0].generated_text});
  }catch{self.postMessage({id,error:'本机模型未完成运行。请检查下载连接、浏览器支持和可用内存；原有查阅与手动编辑仍可使用。'});generator=null;}
};
