export function initPalaceDialog({onStep}){
  const inspector=document.querySelector('#palace-inspector'),anchor=document.createComment('palace detail position');
  inspector.before(anchor);
  const dialog=document.createElement('dialog');dialog.id='palace-dialog';dialog.setAttribute('aria-label','宫位完整资料');
  const header=document.createElement('div');header.className='palace-dialog-toolbar';
  for(const [text,label,action] of [['←','上一个宫位',()=>onStep(-1)],['→','下一个宫位',()=>onStep(1)],['收起 ×','关闭宫位详情',()=>dialog.close()]]){
    const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.addEventListener('click',action);header.append(b);
  }
  dialog.append(header);document.body.append(dialog);
  const compact=matchMedia('(max-width: 1024px)');
  dialog.addEventListener('close',()=>{anchor.after(inspector);document.querySelector('.palace-select[aria-pressed="true"], #destiny-wheel [tabindex="0"]')?.focus({preventScroll:true});});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  compact.addEventListener('change',()=>{if(!compact.matches&&dialog.open)dialog.close();});
  return {
    open(force=false){if(!compact.matches&&!force)return;if(!dialog.open){dialog.append(inspector);dialog.showModal();}inspector.scrollTop=0;},
    close(){if(dialog.open)dialog.close();},
  };
}
