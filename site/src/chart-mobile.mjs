import {initOrreryExplorer} from './orrery-explorer.mjs';
// The working chart fills the available viewport; forms live in sheets.
export function initChartMobile({onReset,onDetails}){
  const $=s=>document.querySelector(s),stage=$('#chart-stage'),deck=stage.querySelector('.wheel-deck'),wheel=$('#destiny-wheel');
  const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
  const button=(text,action)=>{const b=make('button','',text);b.type='button';b.addEventListener('click',action);return b;};
  const bar=make('div','chart-mobile-bar');bar.setAttribute('aria-label','命盘快捷操作');
  const birth=button('命例 / 起盘',()=>open('birth')),settings=button('设置',()=>open('settings'));
  const details=button('宫位详情',onDetails),reset=button('总览',onReset);details.disabled=reset.disabled=true;
  const techniques=button('技法',()=>document.dispatchEvent(new Event('ziwei:open-techniques')));bar.append(birth,reset,details,techniques,settings);deck.prepend(bar);
  const dialog=make('dialog','chart-mobile-sheet');dialog.id='chart-mobile-sheet';
  const header=make('header',''),title=make('h2','','命例'),close=button('收起 ×',()=>dialog.close());header.append(title,close);
  const content=make('div','chart-mobile-sheet-body');dialog.append(header,content);document.body.append(dialog);
  const instrument=initOrreryExplorer(),instrumentEntry=button('展开太阳系与南北斗 ↗',()=>instrument.open(instrumentEntry));instrumentEntry.className='orrery-settings-entry';
  let moved=[],lastTrigger=null;
  function restore(){for(const [element,anchor]of moved){anchor.after(element);anchor.remove();}moved=[];instrumentEntry.remove();lastTrigger?.focus({preventScroll:true});}
  function open(kind){
    if(dialog.open)dialog.close();lastTrigger=document.activeElement;
    title.textContent=kind==='birth'?'命例与起盘':'观盘设置';
    const selectors=kind==='birth'?['.birth-panel']:['.chart-layout-switch','.atlas-toolbar','.cycle-utility','.chart-stem-proof'];
    for(const selector of selectors){const element=$(selector),anchor=document.createComment('chart sheet return');element.before(anchor);moved.push([element,anchor]);content.append(element);}
    if(kind==='settings')content.append(instrumentEntry);
    dialog.dataset.kind=kind;dialog.showModal();content.scrollTop=0;
  }
  dialog.addEventListener('close',restore);
  document.addEventListener('ziwei:chart-updated',()=>{birth.textContent='命例 / 改时间';if(dialog.open&&dialog.dataset.kind==='birth')dialog.close();});
  document.addEventListener('ziwei:chart-selection',event=>{const active=Number.isInteger(event.detail.selected);details.disabled=reset.disabled=!active;details.textContent=active?event.detail.name+'详情':'宫位详情';});
  function sync(){
    const active=!stage.hidden&&!$('#model').hidden;
    document.body.classList.toggle('chart-fit-active',active);
    if(!active&&dialog.open)dialog.close();
    if(active){window.scrollTo({top:0,behavior:'instant'});wheel.dataset.reading='overview';}
  }
  const observer=new MutationObserver(sync);observer.observe(stage,{attributes:true,attributeFilter:['hidden']});observer.observe($('#model'),{attributes:true,attributeFilter:['hidden']});
  const fit=new ResizeObserver(([entry])=>{
    const {width,height}=entry.contentRect;
    wheel.dataset.density=height/4<128?'tight':width/4>=210&&height/4>=185?'spacious':'compact';
  });fit.observe(wheel);
  document.addEventListener('ziwei:view',sync);sync();
  return {close(){if(dialog.open)dialog.close();}};
}
