// A small declarative evaluator. It never executes text as code.
export const operators = { eq:'等于', ne:'不等于', gt:'大于', gte:'大于或等于', lt:'小于', lte:'小于或等于' };
export const groupNames = { scope:'适用范围', required:'必要条件', excluded:'排除条件' };
export const resultNames = { matches:'符合', does_not_match:'不符合', insufficient:'信息不足', needs_clarification:'待确认' };
const groups = Object.keys(groupNames);
const scalar = value => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value,max) => typeof value === 'string' && value.length <= max;
const key = (value,fold) => fold(value.normalize('NFKC').trim());
const error = () => { throw new Error('规则格式不正确或超过限制，请检查字段与条件。'); };

export function readDefinition(input) {
  if (!object(input) || input.version !== 1 || !['conditions','unrestricted'].includes(input.scopeMode) || !text(input.scopeNote,2000) || !text(input.outcome,4000) || !text(input.unresolved,4000)) error();
  if (!Array.isArray(input.fields) || input.fields.length > 24) error();
  const ids = new Set();
  const fields = input.fields.map(f => {
    if (!object(f) || typeof f.id !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(f.id) || ids.has(f.id) || !text(f.name,80) || !text(f.meaning,2000) || !['text','number','boolean'].includes(f.type)) error();
    ids.add(f.id); return {id:f.id,name:f.name,meaning:f.meaning,type:f.type};
  });
  const result = {version:1,scopeMode:input.scopeMode,scopeNote:input.scopeNote,outcome:input.outcome,unresolved:input.unresolved,fields};
  for (const group of groups) {
    if (!Array.isArray(input[group]) || input[group].length > 24) error();
    result[group] = input[group].map(c => {
      if (!object(c) || typeof c.field !== 'string' || c.field.length > 40 || typeof c.operator !== 'string' || !Object.hasOwn(operators,c.operator) || !scalar(c.value) || (typeof c.value === 'string' && c.value.length > 400)) error();
      return {field:c.field,operator:c.operator,value:c.value};
    });
  }
  return result;
}

function typeOK(value,type) { return type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === (type === 'text' ? 'string' : 'boolean'); }
function compare(actual,condition,fold) {
  const a=typeof actual === 'string'?key(actual,fold):actual;
  const b=typeof condition.value === 'string'?key(condition.value,fold):condition.value;
  switch(condition.operator) {
    case 'eq': return a===b;
    case 'ne': return a!==b;
    case 'gt': return a>b;
    case 'gte': return a>=b;
    case 'lt': return a<b;
    case 'lte': return a<=b;
  }
}

// Satisfiability for one independent typed field. Exclusions are negated because
// every excluded condition must be false for a rule to match.
function possible(field,conditions,fold) {
  const equals=conditions.filter(c=>c.operator==='eq');
  if(equals.length) return conditions.every(c=>compare(equals[0].value,c,fold));
  if(field.type==='boolean') return [true,false].some(v=>conditions.every(c=>compare(v,c,fold)));
  if(field.type==='text') return true;
  let low=-Infinity,high=Infinity,lowOpen=false,highOpen=false;
  for(const c of conditions) {
    if(c.operator==='gt'||c.operator==='gte') {
      if(c.value>low){low=c.value;lowOpen=c.operator==='gt';}
      else if(c.value===low)lowOpen ||= c.operator==='gt';
    }
    if(c.operator==='lt'||c.operator==='lte') {
      if(c.value<high){high=c.value;highOpen=c.operator==='lt';}
      else if(c.value===high)highOpen ||= c.operator==='lt';
    }
  }
  if(low>high || (low===high && (lowOpen||highOpen)))return false;
  return low!==high || conditions.every(c=>compare(low,c,fold));
}

export function validateDefinition(input,fold=value=>value) {
  const definition=readDefinition(input), issues=[];
  if(!definition.fields.length)issues.push('请定义至少一个需要检查的字段。');
  if(!definition.scopeNote.trim())issues.push('请写明适用范围的含义。');
  if(definition.scopeMode==='conditions'&&!definition.scope.length)issues.push('请填写适用范围条件，或明确选择不限范围。');
  if(definition.scopeMode==='unrestricted'&&definition.scope.length)issues.push('不限范围时，请移除适用范围条件。');
  if(!definition.required.length)issues.push('请填写至少一项必要条件。');
  if(!definition.outcome.trim())issues.push('请填写符合规则时的判断结果。');
  if(definition.unresolved.trim())issues.push('还有待核问题，请先处理并清空待核问题栏。');
  const names=new Set();
  for(const [i,f] of definition.fields.entries()) {
    if(!f.name.trim()||!f.meaning.trim())issues.push(`字段 ${i+1} 的名称或含义尚未定义。`);
    const name=key(f.name,fold);if(name&&names.has(name))issues.push(`字段 ${i+1} 与其他字段重名（简繁写法也视为相同名称）。`);names.add(name);
  }
  const map=new Map(definition.fields.map(f=>[f.id,f]));
  for(const group of groups)for(const [i,c] of definition[group].entries()) {
    const f=map.get(c.field),label=`${groupNames[group]}第 ${i+1} 项`;
    if(!f){issues.push(`${label}尚未选择已定义的字段。`);continue;}
    if(!typeOK(c.value,f.type)||(typeof c.value==='string'&&!c.value.trim()))issues.push(`${label}缺少比较值，或比较值与字段类型不符。`);
    if(f.type!=='number'&&!['eq','ne'].includes(c.operator))issues.push(`${label}只有数值字段可以比较大小。`);
  }
  if(!issues.length) {
    const inverse={eq:'ne',ne:'eq',gt:'lte',gte:'lt',lt:'gte',lte:'gt'};
    for(const f of definition.fields) {
      const positive=[...definition.scope,...definition.required].filter(c=>c.field===f.id);
      if(!possible(f,positive,fold))issues.push(`“${f.name}”的范围或必要条件相互矛盾，无法同时成立。`);
      else {
        const exclusions=definition.excluded.filter(c=>c.field===f.id).map(c=>({...c,operator:inverse[c.operator]}));
        if(!possible(f,[...positive,...exclusions],fold))issues.push(`“${f.name}”的排除条件覆盖了全部适用情况，请核对。`);
      }
    }
  }
  return {definition,issues};
}

export function evaluateRule(input,facts,fold=value=>value) {
  const {definition,issues}=validateDefinition(input,fold);
  if(issues.length)return {status:'needs_clarification',issues,checks:[],outcome:'',reason:'规则有未确认的内容，本次未作判断。'};
  if(!object(facts))throw new Error('案例资料格式不正确。');
  const map=new Map(definition.fields.map(f=>[f.id,f])), checks=[];
  for(const group of groups)for(const [i,c] of definition[group].entries()) {
    const f=map.get(c.field),present=Object.hasOwn(facts,c.field),actual=present?facts[c.field]:null;
    const missing=!present||actual===null||actual===undefined||(typeof actual==='string'&&!actual.trim());
    const valid=!missing&&typeOK(actual,f.type)&&(typeof actual!=='string'||actual.length<=400);
    const passed=valid?compare(actual,c,fold):null;
    checks.push({group,number:i+1,field:f.name,meaning:f.meaning,operator:c.operator,expected:c.value,actual:valid?actual:null,passed,reason:missing?'未提供资料':!valid?'资料类型不符或超过长度限制':group==='excluded'?(passed?'排除条件成立':'排除条件不成立'):(passed?'条件成立':'条件不成立')});
  }
  const failed=checks.some(c=>c.group==='excluded'?c.passed===true:c.passed===false);
  const unknown=checks.some(c=>c.passed===null);
  const status=failed?'does_not_match':unknown?'insufficient':'matches';
  return {status,issues:[],checks,outcome:status==='matches'?definition.outcome:'',reason:failed?'已有不成立的范围或必要条件，或存在成立的排除条件。':unknown?'尚有条件无法判断，请补充相应资料。':'范围与必要条件均成立，且没有成立的排除条件。'};
}

export function fictionalRule() {
  return {version:1,scopeMode:'conditions',scopeNote:'仅检查虚构青松样本，不对应真实技法。',outcome:'记录为符合本条虚构规则的样本。',unresolved:'',fields:[
    {id:'sample',name:'样本名称',type:'text',meaning:'虚构样本的类别名称。'},
    {id:'branches',name:'分支数量',type:'number',meaning:'本次观察到的分支数，以个为单位。'},
    {id:'blocked',name:'是否暂停',type:'boolean',meaning:'是表示本次样本暂停检查。'}
  ],scope:[{field:'sample',operator:'eq',value:'青松'}],required:[{field:'branches',operator:'gte',value:3}],excluded:[{field:'blocked',operator:'eq',value:true}]};
}
