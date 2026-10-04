import {ocrLanguages,decodeArticle,embeddedText,usableText,createRecognizer,renderPage} from './text-recognition.mjs';
export {ocrLanguages} from './text-recognition.mjs';
let stop=false;
export function pauseImport(){stop=true;}
export async function importMaterial({api,file,text,title,level,layout='auto',script='mixed',recognitionMode='auto',encoding='utf-8',resumeId,onProgress,onCreated=()=>{}}) {
  stop=false;
  ocrLanguages(script,layout);
  if(!['auto','scan'].includes(recognitionMode))throw Error('识别模式不正确。');
  if(!['public','special','local'].includes(level))throw new Error('请先选择材料级别。');
  if(!file && !text.trim())throw new Error('请选择文件或粘贴文章。');
  if(file && text.trim())throw new Error('文件和粘贴文章请分别导入。');
  file ||= new File([text],`${title}.txt`,{type:'text/plain'});
  if(file.size>512*1024*1024)throw new Error('单份文件目前支持最大 512 MB。');
  const pdf=/\.pdf$/i.test(file.name);if(!pdf&&!/\.(txt|md)$/i.test(file.name))throw new Error('请选择 PDF、TXT 或 Markdown 文件。');
  onProgress('正在核对文件…',0);
  const bytes=await file.arrayBuffer();const sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  let pdfDocument,loadingTask,parts,pdfjs;
  if(pdf){pdfjs=await import('./vendor/pdf/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf/pdf.worker.mjs',import.meta.url).href;loadingTask=pdfjs.getDocument({data:bytes.slice(0),isEvalSupported:false,useSystemFonts:true,cMapUrl:new URL('./vendor/pdf/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdf/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdf/wasm/',import.meta.url).href});pdfDocument=await loadingTask.promise;}
  else {const article=decodeArticle(bytes,text.trim()?'utf-8':encoding);const characters=Array.from(article);parts=[];for(let i=0;i<characters.length;i+=12000)parts.push(characters.slice(i,i+12000).join(''));if(!parts.length)throw new Error('这份文件没有文字。');}
  const pageCount=pdf?pdfDocument.numPages:parts.length;if(pageCount>2000)throw new Error('单份材料目前支持最多 2000 页。');
  const {id}=await api('/api/books',{method:'POST',body:JSON.stringify({id:resumeId,title,level,kind:pdf?'pdf':'text',pageCount,sourceHash,fileName:file.name,fileSize:file.size})});
  onCreated(id);
  const existing=await api(`/api/books/${id}`);const indexed=new Set(existing.indexedPages.map(p=>p.page));const completed=new Set(existing.indexedPages.filter(p=>!pdf||p.image_ready).map(p=>p.page));
  const upload=await api(`/api/books/${id}/file/start`,{method:'POST'});
  if(!upload.complete){const chunks=[];const size=8*1024*1024;for(let i=0;i<file.size;i+=size){onProgress(`正在保存原文件 ${Math.round(i/file.size*100)}%`,3);chunks.push(await api(`/api/books/${id}/file/parts/${chunks.length+1}`,{method:'PUT',body:file.slice(i,i+size),headers:{'Content-Type':'application/octet-stream'}}));}await api(`/api/books/${id}/file/complete`,{method:'POST',body:JSON.stringify({parts:chunks})});}
  const recognizer=createRecognizer({script,layout,onProgress:message=>onProgress(message,Math.round(completed.size/pageCount*100))});
  let reviewPages=0;
  try {
    for(let n=1;n<=pageCount;n++){
      if(stop){onProgress('已暂停。已保存内容保留，可重新选择同一文件继续。',Math.round(completed.size/pageCount*100));return {id,complete:false};}
      if(completed.has(n))continue;
      onProgress(`正在识别第 ${n} / ${pageCount} 页，请保持页面打开。`,Math.round((n-1)/pageCount*100));
      let rawText,engine,canvas,page;
      if(pdf){page=await pdfDocument.getPage(n);const tc=await page.getTextContent();rawText=embeddedText(tc,layout);engine='embedded-text';
        canvas=await renderPage(page);
        if(!indexed.has(n)&&(recognitionMode==='scan'||!usableText(rawText)||rawText.replace(/\s/g,'').length<30)){
          const recognized=await recognizer.recognize(canvas);rawText=recognized.text;engine='browser-ocr';if(recognized.needsReview)reviewPages++;
        }
      }else{rawText=parts[n-1];engine='article';}
      if(!indexed.has(n))await api(`/api/books/${id}/pages/${n}`,{method:'PUT',body:JSON.stringify({rawText,engine})});
      if(canvas){const image=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.88));await api(`/api/books/${id}/pages/${n}/image`,{method:'PUT',body:image,headers:{'Content-Type':'image/jpeg'}});canvas.width=0;canvas.height=0;page.cleanup();}completed.add(n);
    }
    await api(`/api/books/${id}/complete`,{method:'POST'});onProgress(`已完成：${title}，共 ${pageCount} 页（段），可查询全文。${reviewPages?` ${reviewPages} 页含混排字形或低置信文字，请对照原页校订。`:" 机器识别仍需对照原页校订。"}`,100);
    return {id,complete:true};
  }finally{await recognizer.terminate();if(loadingTask)await loadingTask.destroy();}
}
