import {HttpError,jsonBody,digest,now} from './security.js';
import {scenarioInput,runScenario,canonical,SCENARIO_ENGINE} from '../src/scenario-engine.mjs';
const present=r=>({id:r.id,branchId:r.branch_id,engineVersion:r.engine_version,inputHash:r.input_hash,inputSnapshot:JSON.parse(r.input_snapshot),result:JSON.parse(r.result),createdAt:r.created_at});
export const runSummary=r=>{const p=JSON.parse(r.result);return {id:r.id,branchId:r.branch_id,engineVersion:r.engine_version,inputHash:r.input_hash,ruleSet:p.ruleSet,finalState:p.finalState,steps:p.steps.length,events:p.events.length,createdAt:r.created_at};};
export async function scenarioRoute({path,method,request,db,viewer}){
  const branch=path.match(/^\/api\/world\/branches\/([a-f0-9-]{36})\/runs$/),run=path.match(/^\/api\/world\/runs\/([a-f0-9-]{36})(?:\/(replay))?$/);if(!branch&&!run)return null;
  if(!viewer.id)throw new HttpError(401,'请登录个人账户后使用分支推演。');
  if(branch&&method==='POST'){
    const b=await db.prepare('SELECT b.* FROM world_branches b JOIN world_projects p ON p.id=b.project_id WHERE b.id=? AND p.user_id=?').bind(branch[1],viewer.id).first();if(!b)throw new HttpError(404,'找不到这条个人分支。');
    let input,result;try{input=scenarioInput(await jsonBody(request,32768));result=runScenario(input);}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,e.message);}
    if(JSON.stringify(result).length>524288)throw new HttpError(413,'推演轨迹过大，请减少步骤、变量或规则。');
    const snapshot={engineVersion:SCENARIO_ENGINE,branch:JSON.parse(b.payload),input},hash=await digest(canonical(snapshot));
    await db.prepare('INSERT INTO world_runs(id,branch_id,engine_version,input_hash,input_snapshot,result,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM world_branches b JOIN world_projects p ON p.id=b.project_id WHERE b.id=? AND p.user_id=?) AND (SELECT COUNT(*) FROM world_runs WHERE branch_id=?)<10 ON CONFLICT(branch_id,input_hash) DO NOTHING').bind(crypto.randomUUID(),b.id,SCENARIO_ENGINE,hash,JSON.stringify(snapshot),JSON.stringify(result),now(),b.id,viewer.id,b.id).run();
    const row=await db.prepare('SELECT r.* FROM world_runs r JOIN world_branches b ON b.id=r.branch_id JOIN world_projects p ON p.id=b.project_id WHERE r.branch_id=? AND r.input_hash=? AND p.user_id=?').bind(b.id,hash,viewer.id).first();if(!row)throw new HttpError(409,'分支已删除或已达 10 份不同推演，请新建分支。');return {run:present(row)};
  }
  if(run){const r=await db.prepare('SELECT r.* FROM world_runs r JOIN world_branches b ON b.id=r.branch_id JOIN world_projects p ON p.id=b.project_id WHERE r.id=? AND p.user_id=?').bind(run[1],viewer.id).first();if(!r)throw new HttpError(404,'找不到这份个人推演。');
    if(!run[2]&&method==='GET')return {run:present(r)};
    if(run[2]&&method==='POST'){
      const v=await jsonBody(request,1024);if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).length)throw new HttpError(400,'重放只接受已保存的输入快照。');if(r.engine_version!==SCENARIO_ENGINE)throw new HttpError(409,'此引擎版本暂不能重放，请保留原记录。');
      const snapshot=JSON.parse(r.input_snapshot);if(await digest(canonical(snapshot))!==r.input_hash)throw new HttpError(409,'输入快照完整性校验失败。');const result=runScenario(snapshot.input);return {replay:{runId:r.id,matches:canonical(result)===canonical(JSON.parse(r.result)),inputHash:r.input_hash,engineVersion:r.engine_version,result}};
    }
  }
  throw new HttpError(405,'不支持此推演操作。');
}
