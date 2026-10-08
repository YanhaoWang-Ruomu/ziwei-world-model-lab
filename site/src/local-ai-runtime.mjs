export function createLocalGenerator({workerFactory=()=>new Worker(new URL('./local-ai-worker.mjs',import.meta.url),{type:'module'})}={}){
  let worker=null,pending=null,serial=0;
  function stop(){worker?.terminate();worker=null;pending?.reject(new Error('已停止本机 AI；已保存的步骤可在研究实验室继续。'));pending=null;}
  async function generate(messages,onProgress=()=>{}){
    if(pending)throw Error('已有本机 AI 任务正在运行，请先停止或等待完成。');
    worker??=workerFactory();const id=++serial;
    return new Promise((resolve,reject)=>{
      pending={id,reject};
      worker.onmessage=({data})=>{if(data.id!==id||data.id!==pending?.id)return;if(data.progress){onProgress(data.progress);return;}pending=null;data.error?reject(Error(data.error)):resolve(data.text);};
      worker.onerror=()=>{if(pending?.id!==id)return;const p=pending;pending=null;worker?.terminate();worker=null;p.reject(Error('本机 AI 工作进程中断，可重新继续任务。'));};
      worker.postMessage({id,messages});
    });
  }
  return {generate,stop};
}
