// Declarative chart predicates. No source text is executed as code.
export const SCOPES={natal:'本命',decadal:'大限',yearly:'流年',monthly:'流月',daily:'流日',hourly:'流时'};
export const PALACES=['命宫','兄弟','夫妻','子女','财帛','疾厄','迁移','仆役','官禄','田宅','福德','父母'];
export const BRANCHES='子丑寅卯辰巳午未申酉戌亥'.split('');
export const RELATIONS={independent:'分别满足（不限制位置）',same:'落在同一地支宫位',opposite:'互为对宫'};
export function conditionScopes(c){return c?.flight?[c.scope,c.flight.target?.scope]:c?.compare?[c.scope,c.compare.scope]:[c?.scope];}
export const STARS='紫微 天机 太阳 武曲 天同 廉贞 天府 太阴 贪狼 巨门 天相 天梁 七杀 破军 文昌 文曲 左辅 右弼 天魁 天钺 禄存 天马 擎羊 陀罗 火星 铃星 地空 地劫 红鸾 天喜 天姚 咸池 天刑 天空'.split(' ');
function parseSimpleTechnique(text,fold=v=>v){
  const conditions=[],unresolved=[];
  const scopes=Object.values(SCOPES).join('|'),stars=STARS.join('|'),palaces=PALACES.join('|');
  for(const raw of text.split(/[\n；;。]+/).map(s=>s.trim()).filter(Boolean)){
    const line=fold(raw).replace(/\s/g,'').replace(/交友/g,'仆役');
    const m=line.match(new RegExp(`^(排除[:：]?)?(${scopes})[：:]?(${stars})(?:在|入|坐|坐守)(${palaces})(?:宫)?(?:化([禄权科忌]))?$`));
    if(m)conditions.push({scope:Object.keys(SCOPES).find(k=>SCOPES[k]===m[2]),star:m[3],palace:m[4],mutagen:m[5]||'',exclude:Boolean(m[1])});
    else {
      const p=line.match(new RegExp(`^(排除[:：]?)?(${scopes})[：:]?(${palaces})(?:宫)?(?:有|坐守|坐|见)(${stars})(?:化([禄权科忌]))?$`));
      if(p)conditions.push({scope:Object.keys(SCOPES).find(k=>SCOPES[k]===p[2]),star:p[4],palace:p[3],mutagen:p[5]||'',exclude:Boolean(p[1])});else {
        const b=line.match(new RegExp(`^(排除[:：]?)?(${scopes})[：:]?(${stars})(?:在|入|坐|坐守)([${BRANCHES.join('')}](?:(?:或|、|/)[${BRANCHES.join('')}])*)(?:位|宫)?(?:化([禄权科忌]))?$`));
        if(b)conditions.push({scope:Object.keys(SCOPES).find(k=>SCOPES[k]===b[2]),star:b[3],palace:'',branches:[...new Set(b[4].split(/或|、|\//))],mutagen:b[5]||'',exclude:Boolean(b[1])});else unresolved.push(raw);
      }
    }
  }
  return {version:1,mode:'all',conditions,unresolved};
}
export function parseTechnique(text,fold=v=>v){
  const rule={version:1,mode:'all',conditions:[],unresolved:[]},groupModes={};let nextGroup=0;
  for(const raw of text.split(/[\n；;。]+/).map(t=>t.trim()).filter(Boolean)){
    const simple=parseSimpleTechnique(raw,fold);if(!simple.unresolved.length){rule.conditions.push(...simple.conditions);continue;}
    // Only explicit complete clauses are combined. Ambiguous prose remains
    // unresolved; we do not infer omitted stars, scopes or causal claims.
    const clauses=fold(raw).replace(/（/g,'(').replace(/）/g,')').split(/并且|且|同时/),parsed=[],modes={};let groupCount=nextGroup,valid=true;
    for(let clause of clauses){clause=clause.trim();if(clause.startsWith('(')&&clause.endsWith(')'))clause=clause.slice(1,-1);if(/[()]/.test(clause)){valid=false;break;}
      const alternatives=clause.split(/或(?:者)?(?=本命|大限|流年|流月|流日|流时)/),group=alternatives.length>1?'ABCDEF'[groupCount++]:'';
      if(alternatives.length>1&&!group){valid=false;break;}
      for(const alternative of alternatives){const part=parseSimpleTechnique(alternative,fold);if(part.unresolved.length||part.conditions.length!==1||group&&part.conditions[0].exclude){valid=false;break;}parsed.push({...part.conditions[0],...(group?{group}:{})});}
      if(group)modes[group]='any';if(!valid)break;
    }
    if(valid&&parsed.length>1){rule.conditions.push(...parsed);Object.assign(groupModes,modes);nextGroup=groupCount;}else rule.unresolved.push(raw);
  }
  if(Object.keys(groupModes).length)rule.groupModes=groupModes;return rule;
}
export function techniqueLogic(rule){const groups=rule.groupModes||{};return '组合之间'+(rule.mode==='all'?'全部满足':'任一满足')+Object.entries(groups).map(([name,mode])=>'；组 '+name+' 内'+(mode==='all'?'全部满足':'任一满足')).join('')+'；排除条件始终单独检查';}
export function validateTechnique(rule){
  const issues=[];
  if(!rule||rule.version!==1||!['all','any'].includes(rule.mode))return ['规则格式无效'];
  if(!Array.isArray(rule.conditions)||!rule.conditions.length||rule.conditions.length>24)return ['请设置 1–24 条条件'];
  if(!Array.isArray(rule.unresolved)||rule.unresolved.length)issues.push('仍有中文内容未确认');
  if(!rule.conditions.some(c=>c&&!c.exclude))issues.push('至少需要一条满足条件');
  if(rule.groupModes!==undefined&&(!rule.groupModes||typeof rule.groupModes!=='object'||Array.isArray(rule.groupModes)||Object.entries(rule.groupModes).some(([key,value])=>!['A','B','C','D','E','F'].includes(key)||!['all','any'].includes(value))))issues.push('条件组格式无效');
  const validSide=(c,allowAny=false)=>c&&Object.hasOwn(SCOPES,c.scope)&&['',...STARS].includes(c.star)&&['',...PALACES].includes(c.palace)&&['','禄','权','科','忌'].includes(c.mutagen)&&(c.branches===undefined||Array.isArray(c.branches)&&c.branches.length<=12&&c.branches.every(b=>BRANCHES.includes(b)))&&(allowAny||Boolean(c.star||c.palace||c.mutagen||c.branches?.length));
  for(const c of rule.conditions){
    if(c?.group&&(!['A','B','C','D','E','F'].includes(c.group)||!['all','any'].includes(rule.groupModes?.[c.group])||c.exclude))issues.push('请选择有效的条件组；排除条件不可加入组');
    if(!validSide(c)||typeof c.exclude!=='boolean')issues.push('每侧至少选择一项有效的星曜、宫位、地支或四化；层级也必须有效');
    if(c?.compare&&(!validSide(c.compare)||c.compare.scope===c.scope||!Object.hasOwn(RELATIONS,c.relation)))issues.push('两层对照需要不同层级、有效的对照条件和位置关系');
    if(c?.compare!==undefined&&(c.compare===null||typeof c.compare!=='object'||Array.isArray(c.compare)))issues.push('两层对照格式无效');
    if(c?.flight!==undefined){
      const f=c.flight;
      if(!f||typeof f!=='object'||Array.isArray(f)||c.compare||!validSide(f.target,true)||!['','禄','权','科','忌'].includes(f.mutagen)||c.mutagen!==''||f.target?.mutagen!==''||f.target?.compare||f.target?.flight)issues.push('宫干飞化条件无效：请分别设置来源、引动四化和目标');
      if(!(c.star||c.palace||c.branches?.length))issues.push('飞化来源至少需要指定星曜、宫位或地支');
    }
  }
  return issues;
}
export function describeCondition(c){
  const side=s=>[SCOPES[s.scope],s.star||'不限星曜',s.palace?(s.palace==='命宫'?s.palace:s.palace+'宫'):'不限宫位',s.branches?.length?s.branches.join('／')+'位':'',s.mutagen?'化'+s.mutagen:''].filter(Boolean).join(' · ');
  return `${c.group?'组 '+c.group+' · ':''}${c.exclude?'排除：':''}${side(c)}${c.flight?' 所在宫干 → '+(c.flight.mutagen?'化'+c.flight.mutagen:'任一四化')+' → '+side(c.flight.target):c.compare?' ↔ '+side(c.compare)+' · '+RELATIONS[c.relation]:''}`;
}
export function evaluateTechnique(rule,chart,cycle,flights){
  const issues=validateTechnique(rule);if(issues.length)return {status:'needs_clarification',issues};
  function candidates(c){
    const layer=c.scope==='natal'?null:cycle?.[c.scope],palaces=chart?.palaces;
    if(!Array.isArray(palaces)||!palaces.length||c.scope!=='natal'&&!layer)return null;
    if(c.palace&&c.scope!=='natal'&&(!Array.isArray(layer.palaceNames)||layer.palaceNames.length<palaces.length))return null;
    if(c.mutagen&&c.scope!=='natal'&&(!Array.isArray(layer.mutagen)||layer.mutagen.length!==4))return null;
    if(c.branches?.length&&palaces.some(p=>!BRANCHES.includes(p.earthlyBranch)))return null;
    return palaces.filter((p,i)=>{
      if(c.palace&&(c.scope==='natal'?p.name:layer.palaceNames[i])!==c.palace)return false;
      if(c.branches?.length&&!c.branches.includes(p.earthlyBranch))return false;
      if(!c.star&&!c.mutagen)return true;
      return [...(p.majorStars||[]),...(p.minorStars||[]),...(p.adjectiveStars||[])].some(s=>(!c.star||s.name===c.star)&&(!c.mutagen||(c.scope==='natal'?s.mutagen===c.mutagen:layer.mutagen['禄权科忌'.indexOf(c.mutagen)]===s.name)));
    });
  }
  const checks=rule.conditions.map(c=>{
    const left=candidates(c),right=c.flight?candidates(c.flight.target):c.compare?candidates(c.compare):null,base={text:describeCondition(c),exclude:c.exclude};
    if(left===null||(c.compare||c.flight)&&right===null)return {...base,value:null};
    if(c.flight){
      const matched=[];
      for(const source of left){
        const sourceIndex=chart.palaces.indexOf(source),paths=flights?.[sourceIndex];
        // Use the current chart's own flight map; never substitute annual four-transformations.
        if(!Array.isArray(paths)||paths.length!==4||new Set(paths.map(f=>f?.mutagen)).size!==4)return {...base,value:null};
        for(const f of paths){
          const target=chart.palaces[f?.targetIndex];
          if(!f||f.sourceIndex!==sourceIndex||!Number.isInteger(f.targetIndex)||!target||!['禄','权','科','忌'].includes(f.mutagen)||!STARS.includes(f.star)||(source.heavenlyStem&&f.stem!==source.heavenlyStem)||![...(target.majorStars||[]),...(target.minorStars||[]),...(target.adjectiveStars||[])].some(s=>s.name===f.star))return {...base,value:null};
          if((!c.flight.mutagen||f.mutagen===c.flight.mutagen)&&right.includes(target)&&(!c.flight.target.star||c.flight.target.star===f.star))matched.push({sourceBranch:source.earthlyBranch,sourceStem:f.stem||source.heavenlyStem||'',star:f.star,mutagen:f.mutagen,targetBranch:target.earthlyBranch});
        }
      }
      return {...base,value:matched.length>0,flights:matched};
    }
    let value=left.length>0;
    if(c.compare){
      if(c.relation==='independent')value=value&&right.length>0;
      else {
        if([...left,...right].some(p=>!BRANCHES.includes(p.earthlyBranch)))return {...base,value:null};
        value=left.some(a=>right.some(b=>c.relation==='same'?a.earthlyBranch===b.earthlyBranch:(BRANCHES.indexOf(a.earthlyBranch)+6)%12===BRANCHES.indexOf(b.earthlyBranch)));
      }
    }
    return {...base,value,branch:left.map(p=>p.earthlyBranch).filter(Boolean).join('／'),...(c.compare?{comparisonBranches:right.map(p=>p.earthlyBranch).filter(Boolean)}:{})};
  });
  if(checks.some(c=>c.value===null))return {status:'insufficient',checks};
  const groups=new Map(),values=[],blocked=checks.some(c=>c.exclude&&c.value);
  checks.forEach((check,i)=>{if(check.exclude)return;const group=rule.conditions[i].group;if(!group)values.push(check.value);else{if(!groups.has(group))groups.set(group,[]);groups.get(group).push(check.value);}});
  for(const [group,list]of groups)values.push(rule.groupModes[group]==='all'?list.every(Boolean):list.some(Boolean));
  return {status:!blocked&&(rule.mode==='all'?values.every(Boolean):values.some(Boolean))?'matches':'does_not_match',checks};
}
