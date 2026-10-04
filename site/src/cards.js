export function initCardLibrary({ api, el, btn, openSource }) {
  const $=selector=>document.querySelector(selector);
  let generation=0,offset=0,owner=false;
  const stateNames={approved:'已确认',draft:'草稿',stale:'出处待复核'};
  const fields=[['conditions','适用条件'],['conclusion','原文结论'],['exceptions','例外与限制'],['terminology','术语说明'],['questions','待核问题'],['notes','整理说明']];
  function options(select,items,first) {
    const previous=select.value;
    select.replaceChildren(new Option(first,'all'),...items.map(x=>new Option(x.label,x.value)));
    select.value=[...select.options].some(x=>x.value===previous)?previous:'all';
    return previous!==select.value;
  }
  function renderCard(card) {
    const article=el('article','catalog-card');const badges=el('div','catalog-badges');
    badges.append(el('span',`catalog-state state-${card.state}`,stateNames[card.state]),el('span','catalog-topic',card.topic||'未分类'),el('span','',card.level==='special'?'特殊':'公开'));
    article.append(badges,el('h3','',card.title),el('blockquote','catalog-quote',card.quote.length>220?card.quote.slice(0,220)+'…':card.quote));
    const summary=el('dl','catalog-summary');
    for(const [key,label] of fields.slice(0,2)){summary.append(el('dt','',label),el('dd','',card[key]?(card[key].length>180?card[key].slice(0,180)+'…':card[key]):'尚未填写'));}article.append(summary);
    const source=`《${card.book_title}》 · ${card.book_kind==='pdf'?'PDF 页':'文章段'} ${card.page}`;
    article.append(el('p','catalog-source',source));
    if(card.state==='stale')article.append(el('p','catalog-stale-note','原文校订版本已变化，请回到原页重新核对并确认。'));
    const detail=el('details','catalog-full');detail.append(el('summary','','展开完整卡片'));
    detail.append(el('h4','','原文摘录'),el('blockquote','catalog-full-text',card.quote));
    for(const [key,label] of fields)if(card[key])detail.append(el('h4','',label),el('p','catalog-full-text',card[key]));
    detail.append(el('p','catalog-source',`绑定校订版本 ${card.source_revision} · 卡片版本 ${card.revision}`),el('p','catalog-fingerprint',`源文件指纹 ${card.source_hash}`));article.append(detail);
    const actions=el('div','catalog-actions');actions.append(btn(owner?'查看原文与校订':'查看原文',async()=>{try{await openSource(card);}catch(e){$('#cards-status').textContent=e.message;}},'book-secondary'),btn(owner?'编辑规则与测试':'编辑并提交审核',()=>document.dispatchEvent(new CustomEvent(owner?'ziwei:open-rule':'ziwei:submit-card',{detail:card})),'book-primary'));article.append(actions);
    return article;
  }
  async function load(reset=true) {
    if(reset)offset=0;
    const request=++generation;
    $('#cards-results').replaceChildren();$('#cards-pagination').replaceChildren();$('#cards-counts').replaceChildren();
    $('#cards-status').textContent='正在查找卡片…';$('#cards-results').setAttribute('aria-busy','true');
    try {
      const params=new URLSearchParams({q:$('#cards-query').value,level:$('#cards-level').value,book:$('#cards-book').value,status:$('#cards-state').value,offset:String(offset)});
      if($('#cards-topic').value!=='all')params.set('topic',$('#cards-topic').value.slice(2));
      let data;
      for(let attempt=0;attempt<8;attempt++){
        data=await api(`/api/cards?${params}`);if(request!==generation)return;
        if(!data.preparing)break;
        $('#cards-status').textContent='正在为已有卡片整理检索索引…';
      }
      if(data.preparing){$('#cards-status').textContent='已有卡片的索引仍在整理，请继续查询。';$('#cards-results').append(btn('继续查询',()=>load()));return;}
      owner=data.owner;$('#cards-owner-filter').hidden=!owner;
      const changedBook=options($('#cards-book'),data.books.map(b=>({value:b.id,label:b.title})),'全部书籍与文章');
      const changedTopic=options($('#cards-topic'),data.topics.map(t=>({value:'t:'+t.value,label:t.label||'未分类'})),'全部主题');
      if(changedBook||changedTopic){await load();return;}
      offset=data.offset;
      $('#cards-status').textContent=`找到 ${data.total} 张卡片${data.total?` · 显示 ${offset+1}–${offset+data.cards.length}`:''}`;
      const labels=owner?['approved','draft','stale']:['approved'];
      for(const state of labels){const label=el('span','catalog-count');label.append(el('strong','',String(data.counts[state])),document.createTextNode(` ${stateNames[state]}`));$('#cards-counts').append(label);}
      $('#cards-access-note').textContent=owner?'你可以整理草稿、核对出处并审核卡片。卡片的访问级别跟随原书。':'这里只展示你有权查看、且对应当前校订版本的已确认卡片。';
      if(!data.cards.length){const empty=el('div','catalog-empty');empty.append(el('h3','','当前范围没有卡片'),el('p','',owner?'可以更换筛选条件，或打开原文页，在“本页技法卡片”中整理第一张卡片。':'可以更换筛选条件；特殊材料中的卡片需要先获得访问权限。'));
        const link=el('a','book-secondary',owner?'去原文页整理':'前往书库');link.href='#library';empty.append(link);if(!owner){const special=el('a','book-secondary','特殊级登录');special.href='#special';empty.append(special);}$('#cards-results').append(empty);
      }else for(const card of data.cards)$('#cards-results').append(renderCard(card));
      if(offset>0)$('#cards-pagination').append(btn('上一组卡片',()=>{offset-=20;load(false);}));
      if(offset+20<data.total)$('#cards-pagination').append(btn('下一组卡片',()=>{offset+=20;load(false);}));
    } catch(e){if(request===generation){$('#cards-status').textContent=e.message;$('#cards-results').append(btn('重试卡片查询',()=>load(false)));}}
    finally{if(request===generation)$('#cards-results').setAttribute('aria-busy','false');}
  }
  $('#cards-form').addEventListener('submit',e=>{e.preventDefault();load();});
  for(const id of ['cards-level','cards-book','cards-topic','cards-state'])$('#'+id).addEventListener('change',()=>load());
  $('#cards-reset').addEventListener('click',()=>{$('#cards-query').value='';for(const id of ['cards-level','cards-book','cards-topic','cards-state'])$('#'+id).value='all';load();});
  return { async refresh(viewer) {++generation;$('#cards-results').replaceChildren();$('#cards-counts').replaceChildren();$('#cards-pagination').replaceChildren();if(viewer.role==='public'){options($('#cards-book'),[],'全部书籍与文章');options($('#cards-topic'),[],'全部主题');return;}owner=Boolean(viewer.owner);$('#cards-owner-filter').hidden=!owner;if(!owner)$('#cards-state').value='all';await load();} };
}
