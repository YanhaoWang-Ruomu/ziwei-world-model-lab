import { validateDefinition } from './rule-engine.mjs';
import {attachDraft} from './storage.js';
export function initSubmissions({api,el,btn,ruleWorkbench,onPublished,openSource}) {
  const $=s=>document.querySelector(s),fold=window.OpenCC.Converter({from:'t',to:'cn'});
  const names={pending:'待审核',approved:'已发布',rejected:'已退回'};
  let viewer={},generation=0,offset=0,reviewOffset=0;
  let activeDraft;
  const labels=[['title','卡片标题',160],['topic','主题',80],['quote','原文摘录（保留简繁原字）',12000],['conditions','适用条件',6000],['conclusion','原文结论',6000],['exceptions','例外与限制',6000],['terminology','术语说明',6000],['questions','待核问题',6000],['notes','整理说明',6000]];
  function clearEditor(){activeDraft?.close();activeDraft=null;$('#submission-editor').replaceChildren();$('#review-editor').replaceChildren();}
  async function refresh(next=viewer){const changed=JSON.stringify(viewer)!==JSON.stringify(next);viewer=next;if(changed){clearEditor();offset=0;reviewOffset=0;}const run=++generation;
    for(const id of ['submission-list','review-list'])$('#'+id).replaceChildren();
    if(viewer.role==='public')return;
    $('#submission-account-note').textContent=viewer.sharedAccount?'当前使用共享账号：使用同一账号的人会看到共同的提交记录。':'这里只显示你的技法提交，包含自编技法与书籍摘录；社区投稿仍在社区中查看。';
    async function fill(review){const root=$(review?'#review-list':'#submission-list'),status=$(review?'#review-status':'#submission-status'),select=$(review?'#review-filter':'#submission-filter'),start=review?reviewOffset:offset;
      try{const params=new URLSearchParams({status:select.value,offset:String(start),scope:review?'all':'mine'}),data=await api('/api/submissions?'+params);if(run!==generation)return;
        status.textContent=data.total+' 份书籍摘录提交';if(!data.submissions.length)root.append(el('div','workspace-empty',review?'当前没有需要处理的书籍摘录提交。':'还没有书籍摘录提交记录。'));
        for(const row of data.submissions){const item=el('article','submission-row'),meta=el('div','submission-meta');meta.append(el('span','submission-state '+row.status,names[row.status]),el('span','muted',new Date(row.created_at*1000).toLocaleString()));item.append(meta,el('h3','',row.payload.title),el('p','muted','《'+row.book_title+'》 · 第 '+row.page+' 页（段） · '+(row.card_id?'修改已有卡片':'新增卡片')));if(review)item.append(el('p','muted','提交人：'+row.author_label));if(row.decision_note)item.append(el('p','decision-note','审核意见：'+row.decision_note));item.append(btn(review&&row.status==='pending'?'打开并审核':'查看提交',()=>openSubmission(row.id),review&&row.status==='pending'?'book-primary':'book-secondary'));root.append(item);}
        const pages=el('div','page-controls');if(start>0)pages.append(btn('上一组提交',()=>{if(review)reviewOffset-=20;else offset-=20;refresh();}));if(start+20<data.total)pages.append(btn('下一组提交',()=>{if(review)reviewOffset+=20;else offset+=20;refresh();}));root.append(pages);
      }catch(e){if(run===generation)status.textContent=e.message;}
    }
    await Promise.all([fill(false),...(viewer.core?[fill(true)]:[])]);if(run===generation)document.dispatchEvent(new Event('ziwei:review-updated'));
  }
  function editor({book,page,card,payload,submission,sourceText,sourceCurrent=true,currentCard}) {
    const review=Boolean(submission&&viewer.core&&submission.status==='pending'),readOnly=Boolean(submission&&!review),target=review?'review':'submissions';
    activeDraft?.close();activeDraft=null;const root=$(review?'#review-editor':'#submission-editor');root.replaceChildren();const form=el('form','submission-form'),inputs={};
    let definition=payload.definition?structuredClone(payload.definition):null;
    const heading=el('div','submission-editor-heading');heading.append(el('span','workspace-kicker',review?'核心审核':readOnly?'提交记录':'卡片编辑'),el('h2','',review?'核对并发布卡片':readOnly?payload.title:card?'提交卡片修改':'整理新卡片'));
    form.append(heading,el('p','muted',`《${book.title}》 · 第 ${page.page} 页（段） · 校订版本 ${page.correction_revision}`));
    const source=el('details','proposal-source');source.append(el('summary','','展开本页校订原文'),el('p','raw-page-text',sourceText));form.append(source);
    if(review&&currentCard){const before=el('details','proposal-source');before.append(el('summary','','对比当前正式卡片'));for(const [key,label]of labels)if((payload[key]||'')!==(currentCard[key]||'')){before.append(el('h3','',label),el('p','',`当前：${currentCard[key]||'未填写'}`),el('p','',`本次：${payload[key]||'未填写'}`));}form.append(before);}
    if(readOnly&&submission.published_payload){const original=el('details','proposal-source');original.append(el('summary','','查看最初提交的文字'));for(const [key,label]of labels)if(submission.payload[key])original.append(el('h3','',label),el('p','',submission.payload[key]));form.append(original);}
    if(!sourceCurrent)form.append(el('p','rule-warning','出处或正式卡片已经更新。这份提交暂不能发布，请回到原文或卡片库，以当前版本重新整理。'));
    const grid=el('div','submission-fields');for(const [key,label,max] of labels){const wrap=el('label',key==='quote'?'wide':'',label),input=el(key==='title'||key==='topic'?'input':'textarea');input.value=payload[key]||'';input.maxLength=max;input.name=key;input.disabled=readOnly;if(input.tagName==='TEXTAREA')input.rows=key==='quote'?4:3;if(['title','quote'].includes(key))input.required=true;wrap.append(input);inputs[key]=input;grid.append(wrap);}form.append(grid);
    const rulebox=el('div','submission-rule');const ruleStatus=el('p');function describeRule(){let count=0;try{count=definition?validateDefinition(definition,fold).issues.length:0;}catch{count=1;}ruleStatus.textContent=!definition?'尚未整理可计算规则。可以先提交文字，由核心管理人补全后发布。':count?`规则还有 ${count} 个问题需要核对，暂不能发布。`:'规则结构检查通过，发布前仍需核对是否准确表达原文。';}
    describeRule();rulebox.append(el('h3','','模型调用规则'),ruleStatus);
    const readPayload=()=>({...Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value])),definition});
    if(!readOnly)rulebox.append(btn('整理可计算规则',()=>{const data=readPayload();ruleWorkbench.editDraft({card:{...data,id:card?.id,book_id:book.id,book_title:book.title,level:book.level,page:page.page,source_revision:page.correction_revision,revision:card?.revision||0},definition,onDone:value=>{definition=value;describeRule();location.hash=target;root.scrollIntoView({behavior:'smooth'});},onCancel:()=>{location.hash=target;}});}));
    if(readOnly&&definition){const detail=el('details');detail.append(el('summary','','查看提交的规则说明'),el('p','',definition.scopeNote),el('p','',`符合时：${definition.outcome}`));rulebox.append(detail);}form.append(rulebox);
    if(submission?.decision_note)form.append(el('p','decision-note',`审核意见：${submission.decision_note}`));
    const status=el('p','submission-status');status.setAttribute('role','status');const actions=el('div','submission-actions');
    const close=btn('收起',()=>{activeDraft?.close();activeDraft=null;root.replaceChildren();});actions.append(close);
    let note,human;
    if(review){note=el('textarea');note.name='reviewNote';note.rows=2;note.maxLength=4000;const label=el('label','','审核意见（退回时必填）');label.append(note);form.append(label);
      human=el('input');human.type='checkbox';const confirm=el('label','review-check');confirm.append(human,document.createTextNode('我已核对原文、条件、结论及计算规则，批准发布供模型调用。'));form.append(confirm);
      actions.append(btn('退回修改',()=>decide('reject'),'book-secondary'));const approve=el('button','book-primary','审核通过并发布');approve.type='submit';approve.disabled=!sourceCurrent;actions.append(approve);
    }else if(!readOnly){const submit=el('button','book-primary','提交核心审核');submit.type='submit';actions.append(submit);form.append(el('p','muted','提交后进入审核队列；审核通过之前，已发布的卡片和模型规则保持当前版本。'));}
    if(readOnly&&submission.published_card_id)actions.append(btn('查看原文与已发布卡片',()=>openSource({book_id:book.id,page:page.page,level:book.level})));
    if(readOnly&&submission.status==='rejected')actions.append(btn('按当前版本重新编辑',()=>start({book_id:book.id,page:page.page,level:book.level,id:submission.card_id},submission.payload),'book-primary'));
    form.append(actions,status);root.append(form);location.hash=target;root.scrollIntoView({behavior:'smooth',block:'start'});
    if(!readOnly)activeDraft=attachDraft({api,el,btn,form,key:review?'review:'+submission.id:`submission:${book.id}:${page.page}:${card?.id||'new'}`,kind:review?'review':'submission',bookId:book.id,
      read:()=>({payload:readPayload(),note:note?.value||'',sourceRevision:page.correction_revision,baseCardRevision:card?.revision||0}),
      write:saved=>{if(saved.sourceRevision!==page.correction_revision||saved.baseCardRevision!==(card?.revision||0))throw new Error('出处版本已经变化，请先核对当前原文，旧草稿仍保留。');for(const [key,input]of Object.entries(inputs))input.value=saved.payload?.[key]||'';definition=saved.payload?.definition||null;if(note)note.value=saved.note||'';if(human)human.checked=false;describeRule();}});
    async function perform(action){const controls=[...form.querySelectorAll('input,textarea,button')],prior=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);try{await action();}catch(e){status.textContent=e.message;}finally{controls.forEach((c,i)=>c.disabled=prior[i]);}}
    async function decide(decision){await perform(async()=>{await api(`/api/submissions/${submission.id}/${decision}`,{method:'POST',body:JSON.stringify({payload:readPayload(),note:note.value,humanConfirmed:human.checked})});await activeDraft?.discard();activeDraft?.close();activeDraft=null;root.replaceChildren(el('div','workspace-success',decision==='approve'?'已通过审核。正式卡片与模型规则已同步发布。':'已退回，提交人可在记录中查看原因。'));await refresh();if(decision==='approve')await onPublished();});}
    form.addEventListener('submit',event=>{event.preventDefault();if(review){decide('approve');return;}if(readOnly)return;perform(async()=>{await api('/api/submissions',{method:'POST',body:JSON.stringify({bookId:book.id,page:page.page,cardId:card?.id||null,sourceRevision:page.correction_revision,baseCardRevision:card?.revision||0,payload:readPayload()})});await activeDraft?.discard();activeDraft?.close();activeDraft=null;root.replaceChildren(el('div','workspace-success','已提交核心管理人审核。你可以在下方查看处理进度。'));await refresh();});});
  }
  async function openSubmission(id){const run=generation;try{const data=await api('/api/submissions/'+id);if(run!==generation)return;const s=data.submission;editor({book:{id:s.book_id,title:s.book_title,level:s.level},page:{page:s.page,correction_revision:s.source_revision},card:s.card_id?{id:s.card_id,revision:s.base_card_revision}:null,payload:s.published_payload||s.payload,submission:s,sourceText:data.sourceText,sourceCurrent:data.sourceCurrent,currentCard:data.currentCard});}catch(e){$(viewer.core?'#review-status':'#submission-status').textContent=e.message;}}
  async function start(card,carryPayload){const run=generation;try{const page=await api(`/api/books/${card.book_id}/pages/${card.page}`);let definition=null,current=card;
      if(card.id){const data=await api(`/api/books/${card.book_id}/pages/${card.page}/cards`);current=data.cards.find(c=>c.id===card.id);if(!current)throw new Error('卡片版本或权限已变化，请重新打开。');const rule=await api(`/api/books/${card.book_id}/pages/${card.page}/cards/${card.id}/rule`);definition=rule.rule?.definition||null;}
      if(run!==generation)return;if(page.correction_status!=='confirmed')throw new Error('请先由核心管理人确认这一页的校订稿。');
      editor({book:{id:card.book_id,title:page.title,level:page.level},page,card:card.id?current:null,payload:{...current,...carryPayload,definition:carryPayload?.definition||definition},sourceText:page.corrected_text});
    }catch(e){$('#submission-status').textContent=e.message;location.hash='submissions';}}
  document.addEventListener('ziwei:submit-card',event=>start(event.detail));
  for(const id of ['submission-filter','review-filter'])$('#'+id).addEventListener('change',()=>{offset=0;reviewOffset=0;refresh();});
  $('#submission-refresh').addEventListener('click',()=>refresh());$('#review-refresh').addEventListener('click',()=>refresh());
  return {refresh,clear(){++generation;clearEditor();$('#submission-list').replaceChildren();$('#review-list').replaceChildren();}};
}
