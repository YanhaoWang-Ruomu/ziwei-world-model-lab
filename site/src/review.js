import {createRecognizer} from './text-recognition.mjs';
// Source-bound workbench. Recognition runs on this device, never a hosted AI API.
export async function renderReview(root, page, { owner, canCards=true, api, el, btn, reload }) {
  const base=`/api/books/${page.book_id}/pages/${page.page}`;
  const statusName={unreviewed:'尚未人工校订',draft:'校订草稿 · 待核对',confirmed:'核心管理人已逐字确认'};
  const section=el('section','review-workbench');
  section.append(el('h3','','本页校订'),el('p','review-state',statusName[page.correction_status]||statusName.unreviewed));
  root.append(section);
  if (page.correction_status==='confirmed') {
    section.append(el('p','book-quote-note',`校订版本 ${page.correction_revision} · 原始提取文字在上方保留`),el('blockquote','corrected-page-text',page.corrected_text||'本页无文字'));
    const copied=el('span','book-copy-status');copied.setAttribute('role','status');
    section.append(btn('复制校订稿与出处',async()=>{try{await navigator.clipboard.writeText(`《${page.title}》｜${page.kind==='pdf'?'PDF 页':'文章段'} ${page.page}\n${page.corrected_text}\n人工校订版本 ${page.correction_revision}\n源文件 SHA-256：${page.source_hash}`);copied.textContent='已复制';}catch{copied.textContent='请选中文字手动复制';}}),copied);
  }
  function field(label,value='',rows=3,max=6000) {
    const wrap=el('label','review-field',label);const input=el('textarea');input.value=value;input.rows=rows;input.maxLength=max;wrap.append(input);return {wrap,input};
  }
  function check(label) {const wrap=el('label','review-check');const input=el('input');input.type='checkbox';wrap.append(input,document.createTextNode(label));return {wrap,input};}
  async function perform(container,status,action) {
    const controls=[...container.querySelectorAll('button,input,textarea')];const prior=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
    try {await action();} catch(e){status.textContent=e.message;} finally{controls.forEach((c,i)=>c.disabled=prior[i]);}
  }
  if (owner) {
    const editor=el('details','review-editor');editor.open=page.correction_status!=='confirmed';editor.append(el('summary','','对照原页并编辑校订稿'));
    editor.append(el('p','book-quote-note','保留原有简繁字形。看不清的字可用 □ 标记，并记入疑字栏；保存草稿不会向读者公开。'));
    const grid=el('div','proof-grid');const original=el('div','proof-original');
    if(page.image_ready){const link=el('a');link.href=`${base}/image`;link.target='_blank';link.rel='noopener';const image=el('img');image.src=link.href;image.alt=`第 ${page.page} 页原始影像`;image.loading='lazy';link.append(image);original.append(el('p','book-quote-note','原页影像 · 点击放大'),link);}
    else original.append(el('p','book-quote-note','原始文件提取文字'),el('pre','proof-source',page.raw_text));
    const form=el('div');const text=field('校订稿',page.correction_revision?page.corrected_text:page.raw_text,16,120000);
    const doubts=field('疑字与待核位置',page.unresolved||'',3,4000);const note=field('本次修改说明',page.correction_note||'',2,4000);
    const human=check('我已逐字对照原页，确认本页校订稿。');const status=el('p','review-status');status.setAttribute('role','status');
    const save=confirmed=>perform(form,status,async()=>{status.textContent='正在保存…';await api(`${base}/revisions`,{method:'POST',body:JSON.stringify({baseRevision:page.correction_revision||0,text:text.input.value,unresolved:doubts.input.value,note:note.input.value,confirmed,humanConfirmed:human.input.checked})});await reload();});
    if(page.image_ready){
      const recognition=el('details','page-reocr');recognition.append(el('summary','','用新版识别本页影像'));
      const layout=el('select'),script=el('select');layout.setAttribute('aria-label','重新识别排版');script.setAttribute('aria-label','重新识别文字');
      for(const [value,label] of [['auto','逐页自动判断'],['vertical','竖排，从右往左'],['horizontal','横排']])layout.append(new Option(label,value));
      for(const [value,label] of [['mixed','简繁混排 / 不确定'],['traditional','繁体为主'],['simplified','简体为主']])script.append(new Option(label,value));
      const result=el('pre','proof-source'),message=el('p','review-status');message.setAttribute('role','status');let candidate='';
      const use=btn('将识别结果放入校订编辑框',()=>{text.input.value=candidate;human.input.checked=false;note.input.value='本机重新识别原页影像，待逐字校对。';status.textContent='识别结果已放入编辑框，尚未保存。请核对后保存草稿或确认校订。';});use.hidden=true;
      const run=btn('开始本机识别',async()=>{
        run.disabled=true;layout.disabled=true;script.disabled=true;use.hidden=true;result.textContent='';
        const recognizer=createRecognizer({layout:layout.value,script:script.value,onProgress:m=>message.textContent=m});let bitmap,canvas;
        try{const response=await fetch(`${base}/image`,{cache:'no-store'});if(!response.ok)throw Error('无法读取本页原影像，请检查登录与访问权限。');bitmap=await createImageBitmap(await response.blob());canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);const output=await recognizer.recognize(canvas);candidate=output.text;result.textContent=candidate||'未识别出文字，请对照原页。';use.hidden=!candidate;message.textContent='识别完成。仅生成候选文字，原始记录及已确认校订稿均未改动。';}
        catch(e){message.textContent=e?.message||String(e);}finally{await recognizer.terminate();bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}run.disabled=false;layout.disabled=false;script.disabled=false;}
      });
      recognition.append(el('p','book-quote-note','原文件与旧文字保留。先比较候选文字，再放入编辑框；只有手动保存才新增校订版本。'),layout,script,run,message,result,use);form.append(recognition);
    }
    const actions=el('div','review-actions');actions.append(btn('保存校订草稿',()=>save(false)),btn('确认本页校订',()=>save(true),'book-primary'));
    form.append(text.wrap,doubts.wrap,note.wrap,human.wrap,actions,status);grid.append(original,form);editor.append(grid);
    editor.append(el('p','book-quote-note','确认后，读者可查看及检索校订稿。再次保存为草稿会暂时收起校订稿及依赖旧版本的卡片，待重新确认。'));
    section.append(editor);
    const history=el('details','revision-history');history.append(el('summary','','修改记录（最近 20 次）'));let loaded=false;
    history.addEventListener('toggle',async()=>{if(!history.open||loaded)return;loaded=true;const output=el('div');history.append(output);try{const data=await api(`${base}/revisions`);if(!data.revisions.length)output.append(el('p','','还没有修改记录。'));for(const r of data.revisions){const item=el('details');item.append(el('summary','',`版本 ${r.revision} · ${statusName[r.status]} · ${new Date(r.created_at*1000).toLocaleString()}`),el('pre','proof-source',r.corrected_text),el('p','',r.unresolved?`待核：${r.unresolved}`:'无待核问题'),el('p','',`修改说明：${r.note||'未填写'}`));output.append(item);}}catch(e){loaded=false;output.textContent=e.message;}});
    section.append(history);
  }

  if(!canCards)return;
  const cardsBox=el('section','technique-workbench');cardsBox.append(el('h3','','本页技法卡片'),el('p','book-quote-note','卡片保留原文出处。特殊用户的整理进入审核队列，通过后发布。'));root.append(cardsBox);
  if(!owner&&page.correction_status==='confirmed')cardsBox.append(btn('从本页整理新卡片',()=>document.dispatchEvent(new CustomEvent('ziwei:submit-card',{detail:{book_id:page.book_id,page:page.page,level:page.level}})),'book-primary'));
  if(owner)cardsBox.append(el('p','book-quote-note','这里只整理当前书库材料；个人私密技法请在本机入口保存。'));
  let cards;try{cards=(await api(`${base}/cards`)).cards;}catch(e){cardsBox.append(el('p','review-status',e.message));return;}
  if(!cards.length)cardsBox.append(el('p','book-empty-copy',owner?'本页还没有卡片，可在下方开始整理。':'本页暂无已确认卡片。'));
  const labels=[['conditions','适用条件'],['conclusion','原文结论'],['exceptions','例外与限制'],['terminology','术语说明'],['questions','待核问题'],['notes','整理说明']];
  function cardEditor(card) {
    const form=el('div','card-editor');const inputs={};
    for(const [key,label,max] of [['title','卡片标题',160],['topic','主题（可自行命名，留空为未分类）',80],['quote','原文摘录（逐字复制本页文字）',12000],...labels.map(([k,l])=>[k,l,6000])]){const f=field(label,card?.[key]||'',key==='quote'?4:2,max);inputs[key]=f.input;form.append(f.wrap);}
    form.append(el('p','book-quote-note',`来源：《${page.title}》第 ${page.page} 页（段） · ${page.correction_revision?`校订版本 ${page.correction_revision}`:'原始提取文字'}。保存卡片时绑定此版本。`));
    const status=el('p','review-status');status.setAttribute('role','status');
    const save=btn(card?'保存修改为草稿':'保存卡片草稿',()=>perform(form,status,async()=>{status.textContent='正在保存…';const data=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]));await api(`${base}/cards${card?`/${card.id}`:''}`,{method:card?'PUT':'POST',body:JSON.stringify({...data,sourceRevision:page.correction_revision||0,baseRevision:card?.revision})});await reload();}),'book-primary');
    form.append(save);
    if(card){const human=check('我已核对保存的摘录、条件和结论，确认这张卡片可供有权限的读者查看。');const approve=btn('确认卡片',()=>perform(form,status,async()=>{await api(`${base}/cards/${card.id}/approve`,{method:'POST',body:JSON.stringify({baseRevision:card.revision,humanConfirmed:human.input.checked})});await reload();}));for(const input of Object.values(inputs))input.addEventListener('input',()=>{approve.disabled=true;status.textContent='内容已修改，请先保存草稿，再重新确认。';});form.append(human.wrap,approve);}
    form.append(status);return form;
  }
  for(const card of cards){
    const item=el('details','technique-card');const state=card.source_changed?'出处待重新核对':card.status==='approved'?'已确认':'草稿';
    item.append(el('summary','',`${card.title} · ${state}`),el('p','book-quote-note',`主题：${card.topic||'未分类'}`),el('blockquote','book-quotation',card.quote));
    for(const [key,label] of labels)if(card[key])item.append(el('h4','',label),el('p','card-value',card[key]));
    item.append(el('p','book-quote-note',`出处：《${page.title}》第 ${card.page} 页（段） · 校订版本 ${card.source_revision} · 卡片版本 ${card.revision}`),el('p','book-quote-note',`源文件指纹 ${card.source_hash}`));
    if(owner){const edit=el('details');edit.append(el('summary','','编辑与审核卡片'),cardEditor(card));item.append(edit);}
    item.append(btn(owner?'编辑规则与测试':'编辑并提交审核',()=>document.dispatchEvent(new CustomEvent(owner?'ziwei:open-rule':'ziwei:submit-card',{detail:{...card,level:page.level}})),'book-secondary'));cardsBox.append(item);
  }
  if(owner){const create=el('details','technique-card');create.append(el('summary','','＋ 从本页整理新卡片'),cardEditor());cardsBox.append(create);}
}
