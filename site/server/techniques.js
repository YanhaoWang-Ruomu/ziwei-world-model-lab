import {HttpError,jsonBody,now,safeText} from './security.js';
import {validateTechnique,evaluateTechnique,conditionScopes} from '../src/technique-engine.mjs';
import {requireCards} from './roles.js';
import {techniqueHistoryRoute} from './technique-history.js';
export async function techniqueRoute({path,method,request,viewer,db,url}){
  if(!path.startsWith('/api/techniques'))return null;
  const history=await techniqueHistoryRoute({path,method,viewer,db,url});if(history)return history;
  if(path==='/api/techniques/match'&&method==='POST'){
    const data=await jsonBody(request,180000),row=await db.prepare("SELECT * FROM authored_techniques WHERE id=? AND published_payload IS NOT NULL").bind(safeText(data.id,40)).first();
    const payload=row&&JSON.parse(row.published_payload);
    if(!row||(payload.level==='special'&&viewer.role==='public'))throw new HttpError(404,'规则尚未发布或未获授权。');
    if(data.revision!==row.published_revision)throw new HttpError(409,'规则版本已更新，请重新开始筛选。');
    if(payload.publicationMode==='reference')throw new HttpError(400,'这是原文参考卡片，尚未配置可执行规则，不能用于自动筛选年月。');
    if(data.chart?.palaces?.length!==12||!data.cycle)throw new HttpError(400,'需要完整命盘与运限资料。');
    const scopes=['natal','decadal','yearly','monthly','daily','hourly'];
    if(!['current','yearly','monthly','daily','hourly'].includes(data.unit)||(data.unit!=='current'&&payload.rule.conditions.some(c=>conditionScopes(c).some(s=>scopes.indexOf(s)>scopes.indexOf(data.unit)))))throw new HttpError(400,'技法任一侧包含更细的运限条件，不能用于判断整个所选区间。');
    const result=evaluateTechnique(payload.rule,data.chart,data.cycle,data.flights);
    return {...(viewer.core?result:{status:result.status,checks:[]}),outcome:result.status==='matches'?payload.outcome:''};
  }
  const visible="(published_payload IS NOT NULL AND (json_extract(published_payload,'$.level')='public' OR ?=1)) OR author=? OR ?=1";
  if(path==='/api/techniques'&&method==='GET'){
    const q=safeText(url.searchParams.get('q')||'',160,false),review=url.searchParams.get('review')==='1',mine=url.searchParams.get('mine')==='1';
    if(review&&!viewer.core)throw new HttpError(403,'审核需要核心权限。');
    // Restricted source must not be exposed indirectly through a prose search.
    const source='COALESCE(published_payload,payload)';
    const searchable=viewer.core?'payload':`COALESCE(json_extract(${source},'$.title'),'') || ' ' || COALESCE(json_extract(${source},'$.topic'),'') || ' ' || COALESCE(json_extract(${source},'$.outcome'),'')`;
    const rows=(await db.prepare(`SELECT * FROM authored_techniques WHERE (${visible}) AND instr(${searchable},?)>0 ${review?"AND status='pending'":''} ${mine?'AND author=?':''} ORDER BY updated_at DESC LIMIT 200`).bind(viewer.role!=='public'?1:0,viewer.role!=='public'?viewer.actor:'',viewer.core?1:0,q,...(mine?[viewer.role!=='public'?viewer.actor:'']:[])).all()).results;
    return {cards:rows.map(r=>{const published=r.published_payload?{id:r.id,revision:r.published_revision,status:'approved',releaseVersion:r.release_version,payload:JSON.parse(r.published_payload)}:null;
      const payload=JSON.parse(r.payload);
      if(viewer.core){const {published_payload,...record}=r;return {...record,payload,published,mine:r.author===viewer.actor};}
      const p=published?.payload||payload;return {mine:r.author===viewer.actor,id:r.id,revision:published?.revision||r.revision,status:published?'approved':r.status,level:p.level,releaseVersion:r.release_version,payload:{title:p.title,topic:p.topic,level:p.level,outcome:p.outcome,publicationMode:p.publicationMode}};
    })};
  }
  requireCards(viewer);
  if(!viewer.actor)throw new HttpError(403,'请先登录个人账户。');
  if(path==='/api/techniques'&&method==='POST'){
    const data=await jsonBody(request,40000),payload=clean(data.payload);
    const id=crypto.randomUUID();await db.prepare('INSERT INTO authored_techniques(id,author,payload,level,status,revision,note,updated_at) VALUES(?,?,?,?,\'draft\',1,\'\',?)').bind(id,viewer.actor,JSON.stringify(payload),payload.level,now()).run();return {id,revision:1};
  }
  const match=path.match(/^\/api\/techniques\/([a-f0-9-]{36})(?:\/(submit|approve|reject))?$/);if(!match)throw new HttpError(404,'未找到技法。');
  const row=await db.prepare('SELECT * FROM authored_techniques WHERE id=?').bind(match[1]).first();
  if(!row||(!viewer.core&&row.author!==viewer.actor))throw new HttpError(404,'未找到可编辑的技法。');
  if(row.published_payload&&!viewer.core)throw new HttpError(403,'已发布技法仅核心及创建者可修订。');
  const data=await jsonBody(request,40000);if(data.revision!==row.revision)throw new HttpError(409,'技法已更新，请重新载入。');
  let payload=JSON.parse(row.payload),state=row.status,note=row.note;
  if(!match[2]&&method==='PUT'){
    if(state==='pending'&&!viewer.core)throw new HttpError(409,'待审核内容由核心管理人整理。');
    payload=clean(data.payload);if(state!=='pending'){state='draft';note='';}
  }else if(method==='POST'&&match[2]==='submit'){
    if(!['draft','rejected'].includes(state))throw new HttpError(409,'当前状态不能提交。');
    if(data.humanConfirmed!==true)throw new HttpError(400,'请确认将以上文字提交核心管理人审核。');
    state='pending';note='';
  }else if(method==='POST'&&['approve','reject'].includes(match[2])){
    if(!viewer.core)throw new HttpError(403,'仅核心管理人可审核。');
    if(state!=='pending')throw new HttpError(409,'这份提交已经处理。');
    note=safeText(data.note||'',2000,false);
    if(match[2]==='approve'){
      const publicationMode=data.publicationMode??'executable';
      if(!['reference','executable'].includes(publicationMode))throw new HttpError(400,'请选择原文参考或可运算发布。');
      if(data.humanConfirmed!==true)throw new HttpError(400,'请勾选已核对原文，确认本次审核操作。');
      if(publicationMode==='executable'){
        if(!payload.outcome.trim())throw new HttpError(400,'发布前请补充“符合条件时的提示”。');
        if(validateTechnique(payload.rule).length)throw new HttpError(400,'发布前请补全可执行条件、处理待确认文字，并勾选核对。');
      }
      payload.publicationMode=publicationMode;state='approved';
    }else{if(!note.trim())throw new HttpError(400,'请填写退回原因。');state='rejected';}
  }else throw new HttpError(405,'操作不支持。');
  const publishing=state==='approved',serialized=JSON.stringify(payload);
  const result=await db.prepare('UPDATE authored_techniques SET payload=?,level=?,status=?,note=?,reviewer=?,revision=revision+1,updated_at=?,last_actor=?,published_payload=?,published_revision=?,release_version=? WHERE id=? AND revision=?').bind(serialized,payload.level,state,note,viewer.core?viewer.actor:null,now(),viewer.actor,publishing?serialized:row.published_payload,publishing?row.revision+1:row.published_revision,publishing?row.release_version+1:row.release_version,row.id,row.revision).run();
  if(!result.meta.changes)throw new HttpError(409,'已有其他修改，请刷新。');return {ok:true,revision:row.revision+1};
}
function clean(data){
  if(!data||!['public','special'].includes(data.level))throw new HttpError(400,'线上技法请选择公开或特殊；私密内容只存本机。');
  if(typeof data.title!=='string'||!data.title.trim())throw new HttpError(400,'请填写技法标题。');
  if(typeof data.text!=='string'||!data.text.trim())throw new HttpError(400,'请填写中文技法原文。');
  const payload={title:safeText(data.title,160),topic:safeText(data.topic||'',80,false),text:safeText(data.text,12000),outcome:safeText(data.outcome??'',2000,false),level:data.level,rule:data.rule??{version:1,mode:'all',conditions:[],unresolved:[]}};
  if(!payload.rule||payload.rule.version!==1||!['all','any'].includes(payload.rule.mode)||!Array.isArray(payload.rule.conditions)||payload.rule.conditions.length>24||payload.rule.conditions.some(c=>!c||typeof c!=='object')||!Array.isArray(payload.rule.unresolved)||payload.rule.unresolved.some(v=>typeof v!=='string')||JSON.stringify(payload.rule).length>14000)throw new HttpError(400,'请先整理条件。');
  return payload;
}
