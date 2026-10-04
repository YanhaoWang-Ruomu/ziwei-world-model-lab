import { operators, groupNames, resultNames, validateDefinition, evaluateRule, fictionalRule } from './rule-engine.mjs';

export function initRuleWorkbench({api,el,btn,openSource}) {
  const root=document.querySelector('#rule-workbench'),status=document.querySelector('#rule-status');
  const fold=window.OpenCC.Converter({from:'t',to:'cn'});
  let context=null,endpoint='',definition=fictionalRule(),facts={},dirty=false,demo=true,owner=false,generation=0,busy=false;
  let editor,test,validation,result,confirmButton,human;
  let draft=null;
  const stateNames={draft:'规则草稿',confirmed:'已确认规则',stale:'出处待复核'};
  const display=value=>value===null?'未提供':value===true?'是':value===false?'否':String(value);
  const editable=()=>demo||owner||Boolean(draft);
  function say(text){status.textContent=text;}
  function markDirty(){dirty=true;if(human)human.checked=false;if(confirmButton)confirmButton.disabled=true;validation?.replaceChildren();result?.replaceChildren();say(demo?'虚构练习已修改，不会保存到书库。':'规则有未保存的修改。');}
  function labeled(label,input){const wrap=el('label','rule-field',label);wrap.append(input);return wrap;}
  function input(value,onInput,{max=400,rows=0}={}){
    const node=el(rows?'textarea':'input');if(!rows)node.type='text';else node.rows=rows;
    node.value=value??'';node.maxLength=max;node.addEventListener('input',()=>{onInput(node.value);markDirty();});return node;
  }
  function select(items,value,onChange,label){const node=el('select');for(const [v,name] of items)node.append(new Option(name,v));node.value=value;node.setAttribute('aria-label',label);node.addEventListener('change',()=>onChange(node.value));return node;}
  function scalarInput(type,value,onChange,label) {
    let node;
    if(type==='boolean')node=select([['','请选择'],['true','是'],['false','否']],value===null?'':String(value),v=>onChange(v===''?null:v==='true'),label);
    else {node=el('input');node.type=type==='number'?'number':'text';if(type==='number')node.step='any';else node.maxLength=400;node.value=value??'';node.placeholder='未提供';node.setAttribute('aria-label',label);node.addEventListener('input',()=>onChange(type==='number'?(node.value===''||!Number.isFinite(node.valueAsNumber)?null:node.valueAsNumber):node.value));}
    return node;
  }
  function validationView(){
    validation.replaceChildren();
    try{const checked=validateDefinition(definition,fold);validation.append(el('strong','',checked.issues.length?'待确认':'结构检查通过'));const list=el('ul');for(const message of checked.issues)list.append(el('li','',message));validation.append(list);if(!checked.issues.length)validation.append(el('p','','条件和类型可以计算；仍需由你核对它们是否准确表达原文。'));return checked;}
    catch(e){validation.append(el('p','',e.message));return null;}
  }
  function syncFieldLabels(field){
    for(const option of editor.querySelectorAll('select[data-field-picker] option'))if(option.value===field.id)option.textContent=field.name||'未命名字段';
    for(const label of test.querySelectorAll('[data-case-field]'))if(label.dataset.caseField===field.id){label.firstChild.textContent=field.name||'未命名字段';label.querySelector('small').textContent=field.meaning||'含义尚未定义';label.querySelector('input,select').setAttribute('aria-label',`案例：${field.name||'未命名字段'}`);}
  }
  function conditionRows(group,container){
    definition[group].forEach((condition,index)=>{
      const row=el('div','rule-condition');
      const field=definition.fields.find(f=>f.id===condition.field);
      const picker=select([['','选择字段'],...definition.fields.map(f=>[f.id,f.name||'未命名字段'])],condition.field,value=>{condition.field=value;condition.value=null;condition.operator='eq';markDirty();renderEditor();},`${groupNames[group]} ${index+1} 字段`);picker.dataset.fieldPicker='';row.append(labeled('字段',picker));
      row.append(labeled('关系',select(Object.entries(operators).filter(([op])=>field?.type==='number'||['eq','ne'].includes(op)),condition.operator,value=>{condition.operator=value;markDirty();},`${groupNames[group]} ${index+1} 关系`)));
      row.append(labeled('比较值',scalarInput(field?.type||'text',condition.value,value=>{condition.value=value;markDirty();},`${groupNames[group]} ${index+1} 比较值`)));
      if(editable()){const remove=btn('移除',()=>{definition[group].splice(index,1);markDirty();renderEditor();});remove.setAttribute('aria-label',`移除${groupNames[group]}第 ${index+1} 项`);row.append(remove);}container.append(row);
    });
    if(!definition[group].length)container.append(el('p','rule-help',group==='excluded'?'没有排除条件。':'尚未填写条件。'));
    if(editable()&&definition[group].length<24)container.append(btn(`添加${groupNames[group]}`,()=>{definition[group].push({field:definition.fields[0]?.id||'',operator:'eq',value:null});markDirty();renderEditor();}));
  }
  function renderEditor(){
    const fieldsOpen=editor.querySelector('details.rule-step')?.open??!definition.fields.length;
    editor.replaceChildren();const form=el('fieldset','rule-edit-fields');form.disabled=!editable();
    const fields=el('details','rule-step');fields.open=fieldsOpen;fields.append(el('summary','',`1 · 定义字段（${definition.fields.length} 项）`),el('p','rule-help','写清名称、含义与单位。文字值按简繁等价比较，保留标点和大小写差异。'));
    for(const [index,field] of definition.fields.entries()){
      const box=el('div','rule-field-definition'),line=el('div','rule-two');
      const name=input(field.name,v=>{field.name=v;syncFieldLabels(field);},{max:80});
      line.append(labeled(`字段 ${index+1} 名称`,name),labeled('资料类型',select([['text','文字'],['number','数值'],['boolean','是 / 否']],field.type,v=>{field.type=v;delete facts[field.id];for(const group of Object.keys(groupNames))for(const c of definition[group])if(c.field===field.id){c.operator='eq';c.value=null;}markDirty();renderEditor();renderTest();},`字段 ${index+1} 类型`)));
      box.append(line,labeled('含义与单位',input(field.meaning,v=>{field.meaning=v;syncFieldLabels(field);},{max:2000,rows:2})));
      if(editable())box.append(btn('移除此字段',()=>{definition.fields.splice(index,1);delete facts[field.id];markDirty();renderEditor();renderTest();}));fields.append(box);
    }
    if(editable()&&definition.fields.length<24)fields.append(btn('添加字段',()=>{definition.fields.push({id:'f'+crypto.randomUUID().replaceAll('-',''),name:'',meaning:'',type:'text'});markDirty();renderEditor();editor.querySelector('details').open=true;renderTest();}));form.append(fields);
    const scope=el('div','rule-step');scope.append(el('h3','','2 · 适用范围'),labeled('范围说明',input(definition.scopeNote,v=>{definition.scopeNote=v;},{max:2000,rows:2})),labeled('范围方式',select([['conditions','以下范围条件全部成立'],['unrestricted','明确不限范围']],definition.scopeMode,v=>{definition.scopeMode=v;markDirty();renderEditor();},'范围方式')));
    if(definition.scopeMode==='conditions'||definition.scope.length)conditionRows('scope',scope);form.append(scope);
    for(const [group,title,help] of [['required','3 · 必要条件','以下条件需要全部成立。'],['excluded','4 · 排除条件','任何一项成立，整条规则就不适用。']]){const block=el('div','rule-step');block.append(el('h3','',title),el('p','rule-help',help));conditionRows(group,block);form.append(block);}
    const outcome=el('div','rule-step');outcome.append(el('h3','','5 · 判断结果与待核问题'),labeled('符合时的判断结果',input(definition.outcome,v=>{definition.outcome=v;},{max:4000,rows:3})),labeled('待核问题（没有则留空）',input(definition.unresolved,v=>{definition.unresolved=v;},{max:4000,rows:2})));form.append(outcome);editor.append(form);
    validation=el('div','rule-validation');validation.setAttribute('role','status');
    const actions=el('div','rule-actions');actions.append(btn('检查规则',validationView,'book-secondary'));
    if(draft){human=null;confirmButton=null;actions.append(btn('保存到本次提交',()=>{const checked=validationView();if(checked)draft.onDone(structuredClone(checked.definition));},'book-primary'),btn('返回卡片，不带入修改',()=>draft.onCancel()));}
    else if(owner&&!demo){actions.append(btn('保存规则草稿',saveRule,'book-primary'));human=el('input');human.type='checkbox';const check=el('label','review-check');check.append(human,document.createTextNode('我已核对保存的规则与原文含义，确认供有权限的读者使用。'));confirmButton=btn('确认已保存的规则',confirmRule,'book-secondary');confirmButton.disabled=dirty||!context.rule||!context.canConfirm;editor.append(check);actions.append(confirmButton);}
    else {human=null;confirmButton=null;}
    editor.append(actions,validation);
    if(!demo&&!context.canConfirm&&owner)editor.append(el('p','rule-warning','请先在原文页确认卡片及其校订版本，才能确认规则。'));
  }
  function renderTest(){
    test.replaceChildren();test.append(el('p','eyebrow','案例验证'),el('h3','','填写案例，逐项检查'),el('p','rule-help','未知道的资料请留空。案例仅在当前页面试算，不会作为书库记录保存。'));
    if(demo){const examples=el('div','rule-actions');for(const [label,sample] of [['符合示例',{sample:'青松',branches:3,blocked:false}],['不符合示例',{sample:'青松',branches:2,blocked:false}],['缺资料示例',{sample:'青松',blocked:false}]])examples.append(btn(label,()=>{facts={...sample};renderTest();runTest();}));test.append(examples);}
    for(const field of definition.fields){const control=scalarInput(field.type,Object.hasOwn(facts,field.id)?facts[field.id]:null,value=>{facts[field.id]=value;result?.replaceChildren();},`案例：${field.name||'未命名字段'}`);const wrap=labeled(field.name||'未命名字段',control);wrap.dataset.caseField=field.id;wrap.append(el('small','rule-help',field.meaning||'含义尚未定义'));test.append(wrap);}
    const actions=el('div','rule-actions');actions.append(btn('运行案例检查',runTest,'book-primary'),btn('清空案例',()=>{facts={};renderTest();}));test.append(actions);result=el('div','rule-result');result.setAttribute('role','status');test.append(result);
  }
  function showResult(value){
    result.replaceChildren();result.className=`rule-result result-${value.status}`;
    result.append(el('p','rule-run-kind',demo?'虚构练习':dirty?'未保存草稿试算':context.rule?.state==='confirmed'?'已确认规则试算':'草稿试算'),el('h3','',resultNames[value.status]),el('p','',value.reason));
    if(value.outcome)result.append(el('p','rule-outcome',value.outcome));
    if(value.issues.length){const list=el('ul');for(const issue of value.issues)list.append(el('li','',issue));result.append(list);}
    for(const check of value.checks){const item=el('div','rule-trace');item.append(el('strong','',`${groupNames[check.group]} ${check.number} · ${check.reason}`),el('p','',`${check.field} ${operators[check.operator]} ${display(check.expected)}`),el('p','rule-help',`案例资料：${display(check.actual)}`));result.append(item);}
    if(!demo)result.append(el('p','rule-help',`依据：《${context.card.book_title}》第 ${context.card.page} 页（段） · 校订版本 ${context.card.source_revision} · 卡片版本 ${context.card.revision}`));
  }
  async function verifyCurrent(){
    if(demo||draft)return;
    const previous=context,previousOwner=owner;
    const fresh=await api(endpoint);
    if(previousOwner&&!fresh.owner){const error=new Error('核心登录状态已变化，原规则已收起，请重新登录。');error.clearRule=true;throw error;}
    if(!fresh.sourceCurrent||fresh.owner!==previousOwner||fresh.card.revision!==previous.card.revision||fresh.card.source_revision!==previous.card.source_revision||fresh.canConfirm!==previous.canConfirm||fresh.rule?.revision!==previous.rule?.revision||(!previousOwner&&!fresh.rule))throw new Error('规则或原文已变化，请重新核对卡片并载入后再检查。');
  }
  async function perform(action){
    if(busy)return;busy=true;const current=generation;
    const controls=[...root.querySelectorAll('button,input,select,textarea')],previous=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
    try{await action(current);}catch(e){if(current===generation){say(e.message);result?.replaceChildren();if(!demo&&(!owner||e.clearRule||[401,403,404].includes(e.status))){root.replaceChildren(el('p','rule-warning','当前规则暂时无法查看，请重新从卡片库打开。'));context=null;endpoint='';}}}
    finally{if(current===generation){controls.forEach((c,i)=>c.disabled=previous[i]);busy=false;}}
  }
  async function runTest(){await perform(async current=>{await verifyCurrent();if(current!==generation)return;if(!demo&&context.rule?.state==='stale')throw new Error('出处待复核，请先核对并保存规则草稿，再运行案例检查。');showResult(evaluateRule(definition,facts,fold));});}
  async function saveRule(){await perform(async current=>{
    const url=endpoint;
    await api(url,{method:'PUT',body:JSON.stringify({baseRevision:context.rule?.revision||0,cardRevision:context.card.revision,definition})});
    if(current!==generation)return;const fresh=await api(url);if(current!==generation)return;
    context=fresh;definition=context.rule.definition;dirty=false;render();say('规则草稿已保存。检查通过并人工确认后，有权限的读者才能查看。');
  });}
  async function confirmRule(){await perform(async current=>{
    if(dirty)throw new Error('请先保存修改，再确认规则。');
    const url=endpoint;
    await api(url+'/confirm',{method:'POST',body:JSON.stringify({baseRevision:context.rule?.revision||0,cardRevision:context.card.revision,humanConfirmed:human.checked})});
    if(current!==generation)return;const fresh=await api(url);if(current!==generation)return;
    context=fresh;definition=context.rule.definition;dirty=false;render();say('规则已确认，访问权限跟随原书。');
  });}
  function render(){
    document.querySelector('#rule-demo').hidden=Boolean(draft);
    root.replaceChildren();const heading=el('div','rule-context');
    if(demo)heading.append(el('span','rule-badge','虚构练习 · 不保存到书库'),el('h3','','青松样本：先体验三种判断结果'));
    else {const card=context.card;heading.append(el('span','rule-badge',`${card.level==='special'?'特殊':'公开'} · ${context.rule?stateNames[context.rule.state]:'尚未整理规则'}`),el('h3','',card.title),el('blockquote','rule-source',card.quote));
      const basis=el('details');basis.append(el('summary','','对照卡片中的条件、结论与限制'));for(const [key,label] of [['conditions','适用条件'],['conclusion','原文结论'],['exceptions','例外与限制'],['questions','待核问题']])if(card[key])basis.append(el('h4','',label),el('p','rule-preserve',card[key]));heading.append(basis,el('p','rule-help',`出处：《${card.book_title}》第 ${card.page} 页（段） · 卡片版本 ${card.revision}`));
      const actions=el('div','rule-actions');if(draft)actions.append(el('p','rule-help','正在整理本次提交的规则。保存到提交后，还需返回卡片页提交或审核发布。'));else actions.append(btn('返回原文核对',()=>openSource(card)),btn('重新载入已保存规则',()=>open({book_id:card.book_id,page:card.page,id:card.id})));heading.append(actions);
      if(context.rule?.state==='stale')heading.append(el('p','rule-warning','卡片或原文版本已变化。重新核对规则并保存、确认后，才能供读者使用。'));
    }
    root.append(heading);
    if(!demo&&!owner&&!context.rule&&!draft){root.append(el('p','rule-empty','这张卡片暂无已确认的可用规则。请等待核心管理人整理。'));return;}
    const layout=el('div','rule-layout');editor=el('div','rule-editor');test=el('aside','rule-test');test.tabIndex=-1;layout.append(editor,test);root.append(layout);renderEditor();renderTest();
    heading.append(btn('填写案例与查看结果',()=>{test.scrollIntoView({behavior:'smooth',block:'start'});test.focus({preventScroll:true});},'book-primary'));
  }
  async function open(card){
    draft=null;
    const run=++generation;busy=false;say('正在载入规则…');root.replaceChildren();
    const url=`/api/books/${encodeURIComponent(card.book_id)}/pages/${card.page}/cards/${encodeURIComponent(card.id)}/rule`;
    try{const data=await api(url);if(run!==generation)return;context=data;endpoint=url;demo=false;owner=data.owner;dirty=false;facts={};
      definition=data.rule?.definition||{version:1,scopeMode:'conditions',scopeNote:'',outcome:data.card.conclusion,unresolved:data.card.questions,fields:[],scope:[],required:[],excluded:[]};render();say(data.rule?'已载入与卡片绑定的规则。':'请先定义字段，再把原文条件逐项填写。');}
    catch(e){if(run===generation){context=null;endpoint='';root.replaceChildren(el('p','rule-warning',e.message));say('载入失败，可从卡片库重新打开。');}}
    if(run===generation){location.hash='rules';document.querySelector('#rules').scrollIntoView({behavior:'smooth',block:'start'});}
  }
  function resetDemo(){++generation;draft=null;busy=false;demo=true;owner=false;context=null;endpoint='';definition=fictionalRule();facts={sample:'青松',branches:3,blocked:false};dirty=false;render();say('这是虚构的青松规则，可以修改条件并体验三种结果。');showResult(evaluateRule(definition,facts,fold));}
  document.querySelector('#rule-demo').addEventListener('click',resetDemo);
  document.addEventListener('ziwei:open-rule',event=>open(event.detail));
  resetDemo();
  return {resetDemo,editDraft(options){++generation;draft=options;busy=false;demo=false;owner=false;context={card:options.card,rule:null,canConfirm:true};endpoint='';definition=structuredClone(options.definition||{version:1,scopeMode:'conditions',scopeNote:'',outcome:options.card.conclusion||'',unresolved:options.card.questions||'',fields:[],scope:[],required:[],excluded:[]});facts={};dirty=false;render();say('本次提交的规则草稿');location.hash='rules';},clear(){++generation;draft=null;context=null;endpoint='';root.replaceChildren();status.textContent='';},async refresh(){
    if(!context||demo||draft||busy)return;
    const run=generation;
    try{await verifyCurrent();}catch(e){if(run!==generation)return;result?.replaceChildren();if(owner&&!e.clearRule&&![401,403,404].includes(e.status)){say(e.message);if(confirmButton)confirmButton.disabled=true;}else{++generation;context=null;endpoint='';root.replaceChildren(el('p','rule-warning','访问权限或规则版本已变化，请从卡片库重新打开。'));say('原规则已收起。');}}
  }};
}
