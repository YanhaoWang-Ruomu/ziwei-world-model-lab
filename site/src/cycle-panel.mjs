// Keep one set of time controls while the chart itself is redrawn.
export function initCyclePanel({dock,onOpen}){
  const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
  const wheel=document.querySelector('#destiny-wheel'),home=make('div','cycle-control-home');
  wheel.before(home);
  const launcher=make('div','chart-cycle-launcher'),row=make('div','cycle-launcher-row');
  const trigger=make('button','cycle-menu-trigger'),label=make('span','', '本命'),chevron=make('span','cycle-menu-chevron','⌄');
  trigger.id='cycle-menu-trigger';trigger.type='button';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','cycle-menu-dialog');trigger.setAttribute('aria-expanded','false');chevron.setAttribute('aria-hidden','true');trigger.append(label,chevron);
  const now=document.querySelector('#cycle-now');now.textContent='今时今日';
  const period=make('button','cycle-compact-period');period.type='button';period.hidden=true;period.setAttribute('aria-haspopup','dialog');period.setAttribute('aria-controls','cycle-menu-dialog');
  row.append(trigger,now);launcher.append(row,period);home.append(launcher);home.hidden=true;
  const dialog=make('dialog','cycle-menu-dialog');dialog.id='cycle-menu-dialog';dialog.setAttribute('aria-labelledby','cycle-menu-title');
  const header=make('header','cycle-menu-header'),title=make('h2','','切换运限'),closeButton=make('button','','收起 ×');title.id='cycle-menu-title';closeButton.type='button';closeButton.setAttribute('aria-label','收起运限选择');
  header.append(title,closeButton);dialog.append(header,dock);document.body.append(dialog);
  function open(){if(trigger.disabled)return;onOpen();trigger.setAttribute('aria-expanded','true');if(!dialog.open)dialog.showModal();}
  function close(){if(dialog.open)dialog.close();}
  trigger.addEventListener('click',open);period.addEventListener('click',open);closeButton.addEventListener('click',close);
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
  dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');if(trigger.isConnected&&!trigger.disabled&&!document.querySelector('#chart-stage').hidden)trigger.focus({preventScroll:true});});
  return {
    mount(){const slot=wheel.querySelector('.square-cycle-slot');(slot||home).append(launcher);home.hidden=!!slot||trigger.disabled;},
    update({name,note}){label.textContent=name;trigger.setAttribute('aria-label',`切换运限，当前${name}`);period.textContent=note;period.hidden=!note;period.setAttribute('aria-label',`调整运限时间：${note}`);for(const b of [trigger,period,now])b.disabled=false;},
    clear(){close();home.append(launcher);home.hidden=true;for(const b of [trigger,period,now])b.disabled=true;},
    error(){open();},
    close
  };
}
