import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stage=path.resolve(root,'..','.cache','download-storage');
const repo='YanhaoWang-Ruomu/ziwei-world-model-lab';
const api=`https://api.github.com/repos/${repo}`;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'releases/manifest.json'),'utf8'));
const mode=process.argv[2];
if(!['--prepare','--publish','--verify'].includes(mode))throw Error('Choose a migration step.');
fs.mkdirSync(stage,{recursive:true});
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const expected=[];
for(const platform of ['windows','android']){
  const entry=manifest[platform];
  if(!entry||!/^\d+\.\d+\.\d+$/.test(entry.version)||!/^GuanXingTai-[\w.-]+\.(exe|apk)$/.test(entry.filename)||!Number.isSafeInteger(entry.size)||entry.size>512*1024*1024||!(/^[a-f0-9]{64}$/.test(entry.sha256)))throw Error('Unexpected release metadata.');
  const file=path.join(stage,entry.filename);
  const tag=`${platform}-v${entry.version}`;
  const assetUrl=`https://github.com/${repo}/releases/download/${tag}/${entry.filename}`;
  expected.push({...entry,platform,file,tag,assetUrl});
}
if(mode==='--prepare'){
  for(const entry of expected){
    if(!Array.isArray(entry.chunks)||entry.chunks.length>40)throw Error('No bounded installer chunk list.');
    const buffers=entry.chunks.map((chunk,index)=>{
      const exact=`/release-assets/${entry.platform}/${entry.version}/${String(index).padStart(3,'0')}.bin`;
      if(chunk!==exact)throw Error('Unexpected installer chunk path.');
      const source=path.resolve(root,'src',chunk.slice(1));
      const permitted=fs.realpathSync(path.join(root,'src','release-assets'))+path.sep;
      if(!fs.realpathSync(source).startsWith(permitted))throw Error('Installer chunk is outside the release directory.');
      return fs.readFileSync(source);
    });
    const bytes=Buffer.concat(buffers);
    if(bytes.length!==entry.size||digest(bytes)!==entry.sha256)throw Error('Installer checksum mismatch.');
    if(fs.existsSync(entry.file)&&digest(fs.readFileSync(entry.file))!==entry.sha256)throw Error('Staging file conflicts with the approved installer.');
    fs.writeFileSync(entry.file,bytes);
    console.log(JSON.stringify({platform:entry.platform,version:entry.version,size:bytes.length,sha256:entry.sha256,prepared:true}));
  }
  process.exit(0);
}
let authorization;
if(mode==='--publish'){
  const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
  const token=credential.stdout?.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
  if(credential.status!==0||!token)throw Error('GitHub login is unavailable to this process.');
  authorization=`Bearer ${token}`;
}
async function github(url,{method='GET',data,body,type}={}){
  const target=new URL(url);
  if(!['api.github.com','uploads.github.com'].includes(target.hostname))throw Error('Unexpected GitHub API destination.');
  const response=await fetch(url,{method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'GuanXingTai-release-migration',...(authorization?{Authorization:authorization}:{}),...(body?{'Content-Type':type||'application/octet-stream','Content-Length':String(body.size)}:data?{'Content-Type':'application/json'}:{})},body:body||(data?JSON.stringify(data):undefined),redirect:'error',signal:AbortSignal.timeout(180000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error(`GitHub operation failed (${response.status}).`);
  return response.json();
}
const report=[];
for(const entry of expected){
  if(mode==='--publish'){
    if(!fs.existsSync(entry.file)||fs.statSync(entry.file).size!==entry.size||digest(fs.readFileSync(entry.file))!==entry.sha256)throw Error('Prepared installer failed verification.');
    let release=await github(`${api}/releases/tags/${entry.tag}`);
    if(!release){
      const drafts=await github(`${api}/releases?per_page=100`);
      release=drafts.find(item=>item.tag_name===entry.tag);
    }
    if(!release)release=await github(`${api}/releases`,{method:'POST',data:{tag_name:entry.tag,target_commitish:'main',name:`观星台 ${entry.platform==='windows'?'Windows':'Android'} ${entry.version}`,body:`现有正式安装包的独立下载存储。软件版本与文件内容保持一致。\n\n${entry.notes}\n\nSHA-256: ${entry.sha256}`,draft:true,prerelease:false,make_latest:'false'}});
    let asset=release.assets.find(item=>item.name===entry.filename);
    if(!asset){
      if(!release.draft)throw Error('Published release is missing its installer; it was left unchanged.');
      const blob=await fs.openAsBlob(entry.file);
      asset=await github(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(entry.filename)}`,{method:'POST',body:blob,type:entry.type});
    }
    if(asset.size!==entry.size||asset.digest!==`sha256:${entry.sha256}`||(!release.draft&&asset.browser_download_url!==entry.assetUrl)){
      console.log(JSON.stringify({platform:entry.platform,draft:release.draft,bytesMatch:asset.size===entry.size,digestMatch:asset.digest===`sha256:${entry.sha256}`,urlMatch:asset.browser_download_url===entry.assetUrl}));
      throw Error('Uploaded asset metadata differs from the approved installer.');
    }
    if(release.draft)release=await github(`${api}/releases/${release.id}`,{method:'PATCH',data:{draft:false,make_latest:'false'}});
    console.log(JSON.stringify({platform:entry.platform,published:true,releaseUrl:release.html_url,assetUrl:entry.assetUrl,size:asset.size,digest:asset.digest}));
  }
  // GitHub supplies the complete uploaded object's SHA-256. Check that whole-file
  // digest, then sample anonymous downloads without repeatedly transferring 106 MiB.
  const published=await github(`${api}/releases/tags/${entry.tag}`);
  const uploaded=published?.assets.find(item=>item.name===entry.filename);
  if(!uploaded||uploaded.digest!==`sha256:${entry.sha256}`||uploaded.size!==entry.size||uploaded.browser_download_url!==entry.assetUrl)throw Error('Published installer digest mismatch.');
  const response=await fetch(entry.assetUrl,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(30000)});
  if(response.status!==200||Number(response.headers.get('content-length'))!==entry.size)throw Error('Public installer download is unavailable.');
  const local=fs.readFileSync(entry.file);
  for(const start of [0,Math.floor(entry.size/2),Math.max(0,entry.size-4096)]){
    const end=Math.min(entry.size-1,start+4095);
    const range=await fetch(entry.assetUrl,{headers:{Range:`bytes=${start}-${end}`},redirect:'follow',signal:AbortSignal.timeout(30000)});
    if(range.status!==206||range.headers.get('content-range')!==`bytes ${start}-${end}/${entry.size}`||!Buffer.from(await range.arrayBuffer()).equals(local.subarray(start,end+1)))throw Error('Public installer does not support verified range downloads.');
  }
  const {file,chunks,chunkSize,...metadata}=entry;report.push(metadata);
  console.log(JSON.stringify({platform:entry.platform,publicDownloadVerified:true,rangeVerified:true,size:entry.size,sha256:entry.sha256}));
}
fs.writeFileSync(path.join(stage,'verified.json'),JSON.stringify(report,null,2)+'\n');

if(mode==='--publish'){
  const clientPath=path.join(root,'src','downloads-manifest.json');
  const client=JSON.parse(fs.readFileSync(clientPath,'utf8'));
  for(const item of report){
    if(manifest[item.platform]?.sha256!==item.sha256||client[item.platform]?.sha256!==item.sha256)throw Error('Installer metadata changed before activation.');
    manifest[item.platform].assetUrl=item.assetUrl;client[item.platform].assetUrl=item.assetUrl;
  }
  fs.writeFileSync(path.join(root,'releases','manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(clientPath,JSON.stringify(client,null,2)+'\n');
  console.log('Verified external installer URLs saved; the website can now be built.');
}
