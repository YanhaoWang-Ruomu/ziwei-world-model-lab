import {METHOD_FIELDS,SETTING_FIELDS} from './chart-conventions.mjs';

// Native radio groups provide keyboard navigation and exclusive choices;
// the switch-shaped indicator is visual only.
export function createMethodControls(host,{prefix,onChange}){
  const controls=new Map(),make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
  host.classList.add('method-options');
  function group(field,parent){
    const box=make('fieldset','method-group'),legend=make('legend','',field.key==='algorithm'?'基础杂曜版本':field.label);
    box.dataset.methodGroup=field.key;box.append(legend);
    const inputs=[];
    function row(text,value,disabled=false){
      const label=make('label','method-option'),input=make('input');input.type='radio';input.name=prefix+'-'+field.key;input.value=String(value);input.disabled=disabled;
      input.setAttribute('aria-label',field.label+' · '+text);
      const copy=make('span','method-option-copy',text);if(disabled)copy.append(make('small','method-unavailable','待接入'));
      const indicator=make('span','method-toggle');indicator.setAttribute('aria-hidden','true');
      label.append(input,copy,indicator);box.append(label);
      if(!disabled){inputs.push(input);input.addEventListener('change',()=>{if(input.checked)onChange(field.key,field.values[Number(input.value)]);});}
    }
    field.values.forEach((_,i)=>row(field.labels[i],i));
    for(const label of field.unavailable||[])row(label,'unavailable-'+label,true);
    if(field.hint)box.append(make('p','method-group-hint',field.hint));
    if(field.key==='algorithm')box.append(make('p','method-group-hint','决定其余杂曜的基础排法；上方逐项选择优先。'));
    controls.set(field.key,inputs);parent.append(box);
  }
  for(const field of METHOD_FIELDS)group(field,host);
  const calendar=make('details','method-calendar');calendar.append(make('summary','','历法与基础版本'));
  for(const field of SETTING_FIELDS)group(field,calendar);host.append(calendar);
  return {fill(options){for(const [key,inputs]of controls){const field=[...METHOD_FIELDS,...SETTING_FIELDS].find(f=>f.key===key);inputs.forEach((input,i)=>{input.checked=options[key]===field.values[i];});}},controls};
}
