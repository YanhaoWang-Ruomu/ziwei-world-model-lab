import {createRecognizer} from './text-recognition.mjs';
import {imageMatchRegions} from './search-highlights.mjs';

// One recognition job at a time, including when readers quickly switch pages.
// Coordinates exist only in the current view; no book content is sent elsewhere.
let queue=Promise.resolve();
export function mountImageHighlights({scan,img,link,query,normalize,similar=true,isCurrent=()=>true}){
  const wrap=document.createElement('div');wrap.className='search-image-stage';link.replaceWith(wrap);wrap.append(link);
  const fit=()=>{if(img.naturalWidth&&img.naturalHeight)wrap.style.width=(img.naturalWidth/img.naturalHeight*640)+'px';};img.addEventListener('load',fit);fit();
  const layer=document.createElement('div');layer.className='search-image-overlay';layer.setAttribute('aria-hidden','true');wrap.append(layer);
  const tools=document.createElement('div');tools.className='search-highlight-tools';
  const status=document.createElement('span');status.setAttribute('role','status');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='book-secondary';toggle.textContent='隐藏影像高亮';toggle.setAttribute('aria-pressed','true');toggle.hidden=true;
  toggle.onclick=()=>{layer.hidden=!layer.hidden;toggle.textContent=layer.hidden?'显示影像高亮':'隐藏影像高亮';toggle.setAttribute('aria-pressed',String(!layer.hidden));};
  const retry=document.createElement('button');retry.type='button';retry.className='book-secondary';retry.textContent='重新定位';retry.hidden=true;
  tools.append(status,toggle,retry);scan.insertBefore(tools,wrap);
  let disposed=false,pending=false,done=false;
  const active=()=>!disposed&&isCurrent()&&scan.isConnected;
  const abort=()=>{if(!active()||!scan.open)throw new DOMException('View changed','AbortError');};
  async function locate(){
    if(!query.trim()||done||pending||!active()||!scan.open)return;
    pending=true;retry.hidden=true;status.textContent='正在定位原页文字…首次定位可能需要几秒钟。';
    const task=async()=>{
      let bitmap,canvas,recognizer;
      try{
        abort();const response=await fetch(img.src,{cache:'no-store'});if(!response.ok)throw Error('暂时无法读取原页，请重试。');const blob=await response.blob();abort();
        bitmap=await createImageBitmap(blob);canvas=document.createElement('canvas');
        const scale=Math.min(1,3200/Math.max(bitmap.width,bitmap.height),Math.sqrt(7500000/(bitmap.width*bitmap.height)));
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        recognizer=createRecognizer({script:'mixed',layout:'auto',onProgress:message=>{abort();status.textContent=message;}});
        const data=await recognizer.recognize(canvas);abort();
        const matches=imageMatchRegions(data.regions||[],query,normalize,{similar});
        layer.replaceChildren();
        for(const rect of matches.rectangles){const box=document.createElement('span');box.className='search-image-box'+(rect.kind==='near'?' search-image-box-near':'');box.style.left=(rect.x/canvas.width*100)+'%';box.style.top=(rect.y/canvas.height*100)+'%';box.style.width=(rect.width/canvas.width*100)+'%';box.style.height=(rect.height/canvas.height*100)+'%';layer.append(box);}
        status.textContent=matches.count?`原页定位 ${matches.count} 处 · 金色为匹配区域，蓝色虚线为近似区域。识别框可能包含邻字，请对照影像核实。`:'本页影像中未能可靠定位该词句。可能只命中书名、校订稿或近似文字，请对照原页。';
        toggle.hidden=!matches.count;done=true;
      }catch(e){if(active()){status.textContent=e.name==='AbortError'?'展开原页后继续定位。':(e.message||'定位未完成，请重试。');retry.hidden=e.name==='AbortError';}}
      finally{await recognizer?.terminate();bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}pending=false;}
    };
    queue=queue.catch(()=>{}).then(task);await queue;
  }
  retry.onclick=()=>locate();const onToggle=()=>{if(scan.open)locate();};scan.addEventListener('toggle',onToggle);
  if(query.trim()){status.textContent='展开原页影像后定位搜索词。';if(scan.open)locate();}else tools.hidden=true;
  return ()=>{disposed=true;scan.removeEventListener('toggle',onToggle);img.removeEventListener('load',fit);layer.replaceChildren();};
}
