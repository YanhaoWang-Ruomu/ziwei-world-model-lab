import {techniqueRoute} from './techniques.js';
import {HttpError,jsonBody,now,safeText} from './security.js';
export async function techniqueResearch({path,method,request,db,viewer}){
  if(path!=='/api/world/technique-research')return null;
  if(!viewer.id)throw new HttpError(401,'请先登录个人账户。');if(method!=='POST')throw new HttpError(405,'请从技法推演结果建立研究。');
  const input=await jsonBody(request,180000);if(input.confirmed!==true)throw new HttpError(400,'请确认将当前匹配结果保存到个人研究。');
  const matchPath='/api/techniques/match',result=await techniqueRoute({path:matchPath,method:'POST',request:new Request(new URL(matchPath,request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),db,viewer,url:new URL(matchPath,request.url)});
  if(!['matches','does_not_match'].includes(result.status))throw new HttpError(400,'规则或命盘资料不完整，不能建立匹配研究。');
  const card=await db.prepare('SELECT published_payload,published_revision,release_version FROM authored_techniques WHERE id=?').bind(input.id).first();if(!card||card.published_revision!==input.revision)throw new HttpError(409,'技法版本已更新，请重新判断。');
  const title=safeText(JSON.parse(card.published_payload).title,160).slice(0,80),date=safeText(input.date,10),time=safeText(input.time||'12:00',5);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new HttpError(400,'观察日期或时间不正确。');
  const projectId=crypto.randomUUID(),branchId=crypto.randomUUID(),stamp=now(),state={context:'技法「'+title+'」在 '+date+' '+time+' 的条件核对。',resources:'使用账户已有命盘与已发布技法。',constraints:'匹配结果是规则条件判断；后续行动与现实影响需要明确假设和实际证据。',unknowns:'尚未验证规则与现实结果之间的关系。'};
  const assessment={cardId:input.id,revision:input.revision,releaseVersion:card.release_version,title,status:result.status,outcome:result.outcome,date,time,unit:input.unit,chart:input.chart,cycle:input.cycle};
  const baseline={id:projectId,title:('技法研究 · '+title).slice(0,100),state,events:[],revision:1,createdAt:stamp,updatedAt:stamp,assessment};
  const branch={title:'匹配结果与现实对照',hypothesis:'检验所选技法与后续观察是否一致。',action:'记录实际观察，再决定是否采取行动。',expected:'保存证据，不预设现实结果。',observeOn:date,baseline};
  const rows=await db.batch([
    db.prepare('INSERT INTO world_projects(id,user_id,title,payload,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM world_projects WHERE user_id=?)<100 RETURNING id').bind(projectId,viewer.id,baseline.title,JSON.stringify({state,events:[]}),stamp,stamp,viewer.id),
    db.prepare('INSERT INTO world_branches(id,project_id,payload,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM world_projects WHERE id=? AND user_id=?)').bind(branchId,projectId,JSON.stringify(branch),stamp,projectId,viewer.id)
  ]);
  if(!rows[0].results.length)throw new HttpError(409,'个人研究已达上限，请先整理。');return {projectId,branchId};
}
