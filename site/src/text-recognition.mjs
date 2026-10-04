export function ocrLanguages(script = 'mixed', layout = 'horizontal') {
  if (!['traditional','simplified','mixed'].includes(script)) throw Error('请选择繁体、简体或简繁混排。');
  if (!['auto','horizontal','vertical'].includes(layout)) throw Error('请选择自动、横排或竖排。');
  return (script === 'mixed' ? ['chi_tra','chi_sim'] : [script === 'simplified' ? 'chi_sim' : 'chi_tra']).map(x => x + (layout === 'vertical' ? '_vert' : ''));
}

export function decodeArticle(bytes, encoding = 'utf-8') {
  if (!['utf-8','gb18030','big5','utf-16le','utf-16be'].includes(encoding)) throw Error('请选择支持的文字编码。');
  const data = new Uint8Array(bytes);
  if (data[0] === 255 && data[1] === 254) encoding = 'utf-16le';
  if (data[0] === 254 && data[1] === 255) encoding = 'utf-16be';
  try { return new TextDecoder(encoding, {fatal:true}).decode(data); }
  catch { throw Error('文字编码不匹配，请选择 GB18030 或 Big5 等原文件编码，也可直接粘贴文章。'); }
}

function groups(items, axis, tolerance) {
  const result = [];
  for (const item of [...items].sort((a,b)=>a[axis]-b[axis])) {
    const last = result.at(-1);
    if (!last || Math.abs(item[axis] - last[0][axis]) > tolerance) result.push([item]);
    else last.push(item);
  }
  return result;
}

export function embeddedText(content, layout = 'auto') {
  const items = content.items.filter(i => i.str?.trim()).map(i => ({...i,x:i.transform?.[4]||0,y:i.transform?.[5]||0}));
  if (!items.length) return '';
  const sizes = items.map(i=>Math.max(4,Math.abs(i.transform?.[0]||i.height||12))).sort((a,b)=>a-b);
  const size = sizes[Math.floor(sizes.length/2)];
  const vertical = layout === 'vertical' || (layout === 'auto' && items.filter(i=>i.dir==='ttb').length > items.length/2);
  if (vertical) return groups(items,'x',size*.55).reverse().map(col=>col.sort((a,b)=>b.y-a.y).map(i=>i.str).join('')).join('\n');
  // PDF.js supplies logical item order for complex horizontal columns. Keep that
  // order instead of flattening unrelated columns into one line by y coordinate.
  return items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('').trim();
}

export function usableText(text) {
  const chars = Array.from(text.replace(/\s/g,''));
  if (!chars.length) return false;
  const bad = chars.filter(c=>/[\uFFFD\u0000-\u0008\uE000-\uF8FF]/u.test(c)).length;
  const letters = chars.filter(c=>/[\p{L}\p{N}]/u.test(c)).length;
  return bad / chars.length < .04 && letters / chars.length > .45;
}

export function orderedOcrText(data, layout) {
  if (layout !== 'vertical' || !data.blocks?.length) return (data.text || '').trim();
  const words = data.blocks.flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])))
    .filter(w=>w.text?.trim()&&w.bbox).map(w=>({...w,x:(w.bbox.x0+w.bbox.x1)/2,y:w.bbox.y0}));
  if (!words.length) return (data.text || '').trim();
  const widths = words.map(w=>w.bbox.x1-w.bbox.x0).sort((a,b)=>a-b);
  const tolerance = Math.max(3,widths[Math.floor(widths.length/2)]*.65);
  return groups(words,'x',tolerance).reverse().map(col=>col.sort((a,b)=>a.y-b.y).map(w=>w.text.trim()).join('')).join('\n');
}

export function ocrRegions(data,layout,width,height){
  let words=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])))
    .filter(w=>w.text?.trim()&&w.bbox).map(w=>({...w,x:(w.bbox.x0+w.bbox.x1)/2,y:w.bbox.y0}));
  if(layout==='vertical'&&words.length){const widths=words.map(w=>w.bbox.x1-w.bbox.x0).sort((a,b)=>a-b);words=groups(words,'x',Math.max(3,widths[Math.floor(widths.length/2)]*.65)).reverse().flatMap(col=>col.sort((a,b)=>a.y-b.y));}
  const regions=[];
  for(const word of words){
    const valid=b=>b&&[b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)&&b.x1>b.x0&&b.y1>b.y0;
    const symbols=word.symbols?.filter(s=>s.text?.trim());
    // Some vertical models return zero-width symbol boxes. In that case use
    // the real word/column region instead of inventing per-character positions.
    const useSymbols=symbols?.length&&symbols.every(s=>valid(s.bbox)&&s.bbox.x0>=word.bbox.x0-2&&s.bbox.x1<=word.bbox.x1+2&&s.bbox.y0>=word.bbox.y0-2&&s.bbox.y1<=word.bbox.y1+2);
    const pieces=useSymbols?symbols:[word];
    for(const piece of pieces){
      const b=piece.bbox;if(![b.x0,b.y0,b.x1,b.y1].every(Number.isFinite))continue;
      const x=Math.max(0,b.x0),y=Math.max(0,b.y0),right=Math.min(width,b.x1),bottom=Math.min(height,b.y1);
      if(right>x&&bottom>y)regions.push({text:piece.text,x,y,width:right-x,height:bottom-y});
    }
  }
  return regions;
}

export function recognitionQuality(data) {
  const text = data.text || '', count = (text.match(/[\p{L}\p{N}]/gu)||[]).length;
  if (!usableText(text)) return 0;
  return Math.min(100, Math.max(0,Number(data.confidence)||0)) * .85 + Math.min(15,count / 2);
}

function contrastCanvas(canvas) {
  const copy = document.createElement('canvas'); copy.width=canvas.width;copy.height=canvas.height;
  const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);
  const image=ctx.getImageData(0,0,copy.width,copy.height),hist=new Uint32Array(256);
  for(let i=0;i<image.data.length;i+=4)hist[Math.round(.299*image.data[i]+.587*image.data[i+1]+.114*image.data[i+2])]++;
  const count=copy.width*copy.height;let sum=0,low=0,high=255;
  for(let i=0;i<256;i++){sum+=hist[i];if(sum<count*.01)low=i;if(sum<count*.99)high=i;}
  for(let i=0;i<image.data.length;i+=4){const gray=.299*image.data[i]+.587*image.data[i+1]+.114*image.data[i+2];const v=Math.round(Math.max(0,Math.min(255,(gray-low)*255/Math.max(40,high-low))));image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}
  ctx.putImageData(image,0,0);return copy;
}

export function createRecognizer({script='mixed',layout='auto',onProgress=()=>{}}={}) {
  ocrLanguages(script,layout);
  let worker,activeLayout;
  async function run(canvas,direction,enhanced=false) {
    if (!worker || activeLayout!==direction) {
      if(worker)await worker.terminate();worker=null;
      onProgress(`正在准备${direction==='vertical'?'竖排':'横排'}识别…`);
      worker=await window.Tesseract.createWorker(ocrLanguages(script,direction),1,{
        workerPath:new URL('./vendor/tesseract/worker.min.js',import.meta.url).href,
        // The portable non-SIMD LSTM core also works on devices whose advertised
        // SIMD support cannot load this build's SSE dot-product implementation.
        corePath:new URL('./vendor/tesseract/tesseract-core-lstm.wasm.js',import.meta.url).href,
        langPath:new URL('./vendor/tessdata/',import.meta.url).href,gzip:false,cacheMethod:'write',logger:()=>{}
      });activeLayout=direction;
    }
    await worker.setParameters({tessedit_pageseg_mode:direction==='vertical'?'5':'3',preserve_interword_spaces:'1',user_defined_dpi:'300'});
    onProgress(`正在${enhanced?'增强后重新':''}识别${direction==='vertical'?'竖排':'横排'}文字…`);
    const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
    return {text:orderedOcrText(data,direction),regions:ocrRegions(data,direction,canvas.width,canvas.height),confidence:Number(data.confidence)||0,quality:recognitionQuality(data),layout:direction};
  }
  return {
    async recognize(canvas) {
      const directions=layout==='auto'?['horizontal','vertical']:[layout];
      const candidates=[];
      for(const direction of directions)candidates.push(await run(canvas,direction));
      candidates.sort((a,b)=>b.quality-a.quality);let best=candidates[0];
      if(best.quality<75){const improved=contrastCanvas(canvas);try{const candidate=await run(improved,best.layout,true);if(candidate.quality>best.quality)best=candidate;}finally{improved.width=0;improved.height=0;}}
      // Mixed language models can choose an alternate simplified/traditional
      // glyph even with high confidence. Always request source-image review.
      return {...best,needsReview:script==='mixed'||best.quality<75};
    },
    async terminate(){if(worker)await worker.terminate();worker=null;}
  };
}

export async function renderPage(page) {
  const base=page.getViewport({scale:1});
  const scale=Math.min(3.5,3200/Math.max(base.width,base.height),Math.sqrt(7500000/(base.width*base.height)));
  const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;
  return canvas;
}
