export function birthForServer(input){
  return Object.fromEntries(['date','time','gender','dayDivide','fixLeap','daylight'].map(k=>[k,input[k]]));
}
export async function requestChart(input,{stamp,scope='natal',command={kind:'at'},signal}={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  try{
    const response=await fetch('/api/chart/calculate',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({birth:birthForServer(input),stamp,scope,command}),signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'服务器排盘暂不可用。');
    if(data.schemaVersion!==1||data.result?.provider!=='public-server'||data.result.chart?.palaces?.length!==12||!data.cycle||!data.nav)throw Error('排盘返回的数据不完整。');
    return data;
  }catch(error){
    if(signal?.aborted)throw Error('已取消本次起盘。');
    if(error.name==='AbortError'||error instanceof TypeError)throw Error('服务器暂未响应，请重试；也可手动选择公开算法。');
    throw error;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
