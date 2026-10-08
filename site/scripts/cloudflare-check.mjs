import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export function inspectConfig(config,{strictFree=true}={}){
  const blockers=[];
  if(config.main!=='server/cloudflare-worker.mjs')blockers.push('必须使用 Cloudflare 独立身份入口，不能发布本机预览入口。');
  if(config.vars?.AUTH_MODE!=='standalone')blockers.push('独立账户身份配置尚未完成。');
  if(config.vars?.OWNER_EMAIL)blockers.push('不能用原 Sites 的邮箱身份头授予 Cloudflare 权限。');
  const db=config.d1_databases?.find(item=>item.binding==='DB');
  if(!db||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(db.database_id||''))blockers.push('尚未配置独立的 Cloudflare D1 数据库。');
  const bucket=config.r2_buckets?.find(item=>item.binding==='BUCKET');
  if(!bucket)blockers.push('完整云端书库、社区附件和云备份需要文件存储；严格零费用模式尚未配置该服务。');
  if(strictFree&&config.r2_buckets?.length)blockers.push('R2 超额可能计费，不符合本次严格零费用限制。');
  const routes=config.assets?.run_worker_first;
  if(!Array.isArray(routes)||!routes.includes('/api/*')||!routes.includes('/downloads/*'))blockers.push('接口与下载必须先通过 Worker，其他静态文件直接托管。');
  if(config.assets?.directory!=='dist/client')blockers.push('静态发布范围只能是 dist/client。');
  return blockers;
}
export function inspectAssets(directory){
  let files=0,bytes=0,largest=0;const blockers=[];
  if(!fs.existsSync(directory))return {files,bytes,largest,blockers:['尚未生成网页构建产物。']};
  function walk(dir){
    for(const item of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,item.name);
      if(item.isSymbolicLink()){blockers.push('静态目录存在符号链接，请核对发布范围。');continue;}
      if(item.isDirectory()){
        if(/^(?:data|book-pages|release-assets|\.local-data|\.wrangler|\.openai|\.git)$/i.test(item.name)){blockers.push('静态目录含不应公开的目录，检查停止。');continue;}
        walk(file);continue;
      }
      const size=fs.statSync(file).size;files++;bytes+=size;largest=Math.max(largest,size);
      if(size>25*1024*1024)blockers.push('静态文件超过 Cloudflare 的单文件 25 MiB 上限。');
    }
  }
  walk(directory);
  if(files>20000)blockers.push('静态文件数量超过 Workers Free 的 20,000 个上限。');
  return {files,bytes,largest,blockers};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length>1)throw Error('仅接受一个配置路径；本检查不会创建资源或发布。');
    const configFile=path.resolve(root,args[0]||'wrangler.cloudflare.example.json');
    if(path.dirname(configFile)!==root||!/^wrangler\.cloudflare\.(?:example|local)\.json$/.test(path.basename(configFile)))throw Error('请选择当前站点目录内的 Cloudflare 示例或本地配置。');
    const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
    const assets=inspectAssets(path.join(root,'dist','client'));
    const blockers=[...inspectConfig(config),...assets.blockers];
    console.log(JSON.stringify({mode:'strict-free-preparation',readyToDeploy:blockers.length===0,staticFiles:assets.files,staticMiB:Number((assets.bytes/1024/1024).toFixed(2)),largestAssetMiB:Number((assets.largest/1024/1024).toFixed(2)),blockers},null,2));
    if(blockers.length)process.exitCode=2;
  }catch{console.error('Cloudflare 部署检查未完成，请核对指定的配置文件。未读取用户资料或创建云端资源。');process.exitCode=1;}
}
