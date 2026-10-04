import {evaluateRule,validateDefinition} from './rule-engine.mjs';
export const SCENARIO_ENGINE='generic-transition/1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=m=>{throw new Error(m);};
function shape(v,keys){if(!object(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('推演字段不正确。');}
function text(v,max,required=true){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail('推演文字为空或超过限制。');return v.trim();}
function id(v){if(typeof v!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(v)||['constructor','prototype','__proto__'].includes(v))fail('变量、规则或行动标识无效。');return v;}
const fits=(v,type)=>type==='number'?typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000000:type==='boolean'?typeof v==='boolean':typeof v==='string'&&v.length<=120;
function list(v,max,min=1){if(!Array.isArray(v)||v.length<min||v.length>max)fail('推演条目数量超出限制。');return v;}
export function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
function definition(rule,fields){return {version:1,scopeMode:'unrestricted',scopeNote:rule.rationale,outcome:rule.label,unresolved:'',fields,scope:[],required:rule.when,excluded:[]};}
export function scenarioInput(input){
  shape(input,['ruleSet','initial','steps','uncertainty']);shape(input.ruleSet,['name','version','source','fields','rules']);const r=input.ruleSet;
  if(!Number.isSafeInteger(r.version)||r.version<1||r.version>1000000||!['user-assumption','fictional-demo'].includes(r.source))fail('规则版本或来源无效；只接受用户假设或虚构演示。');
  const ids=new Set(),fields=list(r.fields,12).map(f=>{shape(f,['id','name','type','meaning']);const key=id(f.id);if(ids.has(key)||!['number','text','boolean'].includes(f.type))fail('变量重复或类型无效。');ids.add(key);return {id:key,name:text(f.name,80),type:f.type,meaning:text(f.meaning,400)};});
  shape(input.initial,fields.map(f=>f.id));const initial=Object.fromEntries(fields.map(f=>{const v=Object.hasOwn(input.initial,f.id)?input.initial[f.id]:null;if(v!==null&&!fits(v,f.type))fail('初始状态与变量类型不符或超过限制。');return [f.id,v];}));
  const ruleIds=new Set(),map=new Map(fields.map(f=>[f.id,f]));
  const rules=list(r.rules,10).map(rule=>{
    shape(rule,['id','label','action','when','effects','event','rationale','uncertainty']);const key=id(rule.id);if(ruleIds.has(key))fail('规则标识重复。');ruleIds.add(key);
    const when=list(rule.when,8).map(c=>{shape(c,['field','operator','value']);return {field:id(c.field),operator:text(c.operator,4),value:c.value};});
    const effectIds=new Set(),effects=list(rule.effects,8).map(e=>{shape(e,['field','operation','value']);const f=map.get(id(e.field));if(!f||effectIds.has(f.id)||!['set','add'].includes(e.operation)||!fits(e.value,f.type)||(e.operation==='add'&&f.type!=='number'))fail('状态更新字段、类型、操作或重复写入无效。');effectIds.add(f.id);return {field:f.id,operation:e.operation,value:e.value};});
    const normalized={id:key,label:text(rule.label,100),action:id(rule.action),when,effects,event:text(rule.event,400,false),rationale:text(rule.rationale,800),uncertainty:text(rule.uncertainty,800)};
    if(validateDefinition(definition(normalized,fields)).issues.length)fail('规则条件矛盾、引用无效或比较类型不符。');return normalized;
  });
  const steps=list(input.steps,12).map(s=>{shape(s,['label','action','assumptions']);return {label:text(s.label,100),action:id(s.action),assumptions:text(s.assumptions,800)};});
  const result={ruleSet:{name:text(r.name,100),version:r.version,source:r.source,fields,rules},initial,steps,uncertainty:text(input.uncertainty,2000)};
  if(canonical(result).length>32768)fail('推演输入超过 32 KB。');return result;
}
export function runScenario(raw){
  const input=scenarioInput(raw),{ruleSet}=input;let state={...input.initial};const events=[],uncertainties=[input.uncertainty],steps=[];
  for(const [index,step]of input.steps.entries()){
    const before={...state},trace=[];let selected=0;
    for(const rule of ruleSet.rules){
      if(rule.action!==step.action){trace.push({ruleId:rule.id,label:rule.label,status:'action_skipped',reason:'本步行动不适用。',checks:[],changes:[],rationale:rule.rationale,uncertainty:rule.uncertainty});continue;}
      selected++;const match=evaluateRule(definition(rule,ruleSet.fields),state),item={ruleId:rule.id,label:rule.label,status:match.status,reason:match.reason,checks:match.checks,changes:[],rationale:rule.rationale,uncertainty:rule.uncertainty};
      if(match.status==='matches'){
        const next={...state};let unknown=false;
        for(const effect of rule.effects){if(effect.operation==='add'&&next[effect.field]===null){unknown=true;break;}next[effect.field]=effect.operation==='set'?effect.value:next[effect.field]+effect.value;if(!fits(next[effect.field],ruleSet.fields.find(f=>f.id===effect.field).type))fail('状态更新超出数值或文字边界，本次未保存。');}
        if(unknown){item.status='insufficient';item.reason='累加目标状态未知，本条规则未作任何更新。';}
        else {item.status='applied';item.changes=rule.effects.map(e=>({field:e.field,before:state[e.field],after:next[e.field]}));state=next;if(rule.event){const event={step:index+1,ruleId:rule.id,text:rule.event,kind:'scenario',basis:rule.rationale};events.push(event);item.event=event;}}
      }
      if(item.status==='insufficient')uncertainties.push(`第 ${index+1} 步 · ${rule.id}：${item.reason}`);
      uncertainties.push(rule.uncertainty);trace.push(item);
    }
    if(!selected)uncertainties.push(`第 ${index+1} 步的行动没有适用的转移规则，状态保持。`);
    steps.push({index:index+1,...step,before,after:{...state},trace});
  }
  return {engineVersion:SCENARIO_ENGINE,ruleSet:{name:ruleSet.name,version:ruleSet.version,source:ruleSet.source},semantics:'每步按规则数组顺序各检查一次；后续规则读取已更新状态；不隐式循环。',epistemicStatus:'假设条件下的规则推演，不是现实事件预测或概率。',steps,events,finalState:{...state},uncertainties:[...new Set(uncertainties)],explanation:{kind:'deterministic-summary',text:`按 ${ruleSet.rules.length} 条显式规则完成 ${steps.length} 步检查，生成 ${events.length} 条情景事件。解释来自保存轨迹，未调用 AI。`}};
}
export function fictionalScenario(){return {ruleSet:{name:'虚构资源与进展',version:1,source:'fictional-demo',fields:[{id:'budget',name:'剩余资源',type:'number',meaning:'虚构资源单位，不是命理分数。'},{id:'progress',name:'进展',type:'number',meaning:'合成任务完成数。'},{id:'blocked',name:'暂停',type:'boolean',meaning:'人为设定的行动约束。'},{id:'ready',name:'达到假设目标',type:'boolean',meaning:'仅对应此虚构演示目标。'}],rules:[{id:'advance',label:'使用一单位资源',action:'advance',when:[{field:'budget',operator:'gte',value:1},{field:'blocked',operator:'eq',value:false}],effects:[{field:'budget',operation:'add',value:-1},{field:'progress',operation:'add',value:1}],event:'虚构任务推进一次。',rationale:'演示假设：有资源且未暂停时，每次行动消耗一单位资源并推进一个任务。',uncertainty:'实际资源成本与进展未验证。'},{id:'milestone',label:'检查演示目标',action:'advance',when:[{field:'progress',operator:'gte',value:2},{field:'ready',operator:'eq',value:false}],effects:[{field:'ready',operation:'set',value:true}],event:'达到假设中的虚构里程碑。',rationale:'演示目标人为设置为两个任务。',uncertainty:'达到演示目标不等于现实成功。'}]},initial:{budget:3,progress:0,blocked:false,ready:false},steps:[1,2,3].map(n=>({label:'第 '+n+' 次虚构行动',action:'advance',assumptions:'假设期间没有外部新增资源或阻碍。'})),uncertainty:'全部为虚构演示，不来自紫微公式；现实反馈须单独记录。'};}
