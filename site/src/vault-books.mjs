import {toBase64,fromBase64,fingerprint} from './vault-storage.mjs';
export const SOURCE_CHUNK_SIZE=1024*1024;
export async function saveBookSource(vault,file,metadata={}){
  const generation=vault.generation,hash=await fingerprint(await file.arrayBuffer());
  const existing=(await vault.list()).find(r=>r.kind==='book'&&r.sourceHash===hash);
  const book=existing||{...metadata,id:crypto.randomUUID(),kind:'book',completedPages:0};
  Object.assign(book,{sourceHash:hash,fileName:file.name,mime:/\.pdf$/i.test(file.name)?'application/pdf':'text/plain',fileChunks:Math.ceil(file.size/SOURCE_CHUNK_SIZE),sourceReady:false,updatedAt:Date.now()});
  const check=()=>{if(!vault.unlocked||vault.generation!==generation)throw Error('书库已锁定，已保存的进度保留。');};
  check();await vault.put(book);
  for(let i=0;i<book.fileChunks;i++){check();await vault.put({id:`${book.id}.file.${i}`,kind:'book-file',bookId:book.id,data:toBase64(new Uint8Array(await file.slice(i*SOURCE_CHUNK_SIZE,(i+1)*SOURCE_CHUNK_SIZE).arrayBuffer()))});}
  check();book.sourceReady=true;await vault.put(book);return book;
}
export async function readBookSource(vault,book){
  if(book.file)return new Blob([fromBase64(book.file)],{type:book.mime||'application/pdf'});
  if(!book.sourceReady)throw Error('原文件尚未保存完整，请重新选择同一个文件继续导入。');
  const parts=[],generation=vault.generation;
  for(let i=0;i<book.fileChunks;i++){const row=await vault.get(`${book.id}.file.${i}`);if(!row||vault.generation!==generation)throw Error('原文件未保存完整，请重新导入原文件。');parts.push(fromBase64(row.data));}
  return new Blob(parts,{type:book.mime});
}
export async function recognizeBookPages(vault,book,pageCount,extract,{shouldStop=()=>false,onProgress=()=>{}}={}){
  const generation=vault.generation,check=()=>{if(!vault.unlocked||vault.generation!==generation)throw Error('书库已锁定，识别进度保留。');};
  book={...book,pageCount,status:'paused'};check();await vault.put(book);
  let completed=0;
  for(let page=1;page<=pageCount;page++){
    check();if(shouldStop())break;
    let saved=await vault.get(`${book.id}.page.${page}`);
    if(!saved){const result=await extract(page);check();saved={...result,id:`${book.id}.page.${page}`,kind:'book-page',bookId:book.id,page};await vault.put(saved);}
    completed++;book.completedPages=completed;book.updatedAt=Date.now();check();await vault.put(book);onProgress(completed,pageCount);
  }
  book.completedPages=completed;book.status=completed===pageCount?'ready':'paused';check();await vault.put(book);return book;
}
