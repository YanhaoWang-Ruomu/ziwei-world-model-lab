import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const args=process.argv.slice(2), value=key=>args.includes(key)?args[args.indexOf(key)+1]:undefined;
const sourceRoot=path.resolve(value('--source-root')||path.join(root,'..'));
const siteRoot=path.join(sourceRoot,'site');
const repository='https://github.com/YanhaoWang-Ruomu/ziwei-world-model-lab.git';
const manifest=JSON.parse(fs.readFileSync(new URL('./public-files.json',import.meta.url),'utf8'));
const denied=/(?:^|\/)(?:\.git|\.local-data|\.wrangler|\.signing|\.dev\.vars|node_modules|private_library|book-pages|release-assets|releases|release|backups?|uploads?)(?:\/|$)|(?:^|\/)chart-method(?:\.test)?\.mjs$|(?:^|\/)data\/|\.(?:pdf|sqlite3?|db|p12|pfx|pem|key|keystore|jks|apk|exe|tar\.gz|local\.json)$/i;
function safeFile(base,relative){
  if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..')||denied.test(relative))throw Error('A path is outside the public file policy.');
  const result=path.resolve(base,relative);
  if(!result.startsWith(base+path.sep))throw Error('Path escapes the public workspace.');
  let current=base;
  for(const part of relative.split('/')){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Symbolic links are not allowed in a public export.');}
  return result;
}
function run(command,argv,cwd,options={}){
  // Trust only this explicitly created export directory, without editing global Git settings.
  if(command==='git')argv=['-c',`safe.directory=${root.replaceAll('\\','/')}`,...argv];
  const result=spawnSync(command,argv,{cwd,windowsHide:true,maxBuffer:64*1024*1024,...options});
  if(result.error||result.status!==0)throw Error(`${path.basename(command)} failed (${result.status??'unavailable'}). ${options.stdio==='inherit'?'See the command output.':'No private source or credentials were printed.'}`);
  return result.stdout;
}
function git(argv,cwd=root){return run('git',argv,cwd).toString('utf8').trim();}
function write(relative,content){const file=safeFile(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
function replaceChecked(text,from,to,name){if(!text.includes(from))throw Error(`Public adaptation needs review: ${name}`);return text.replace(from,to);}
function adapt(relative,buffer){
  if(!/\.(?:[cm]?js|html|css|json|ps1|md|txt|ts)$/.test(relative))return buffer;
  let text=buffer.toString('utf8');
  // This is a separate implementation using the public package, never the private module.
  if(relative==='site/server/chart-route.mjs')text=replaceChecked(text,"from './chart-method.mjs'","from './chart-public.mjs'",relative);
  if(relative.startsWith('site/src/'))text=text.replaceAll('ruomu-server','public-server').replaceAll('若木安星 · 资料优先','公开算法 · 服务端计算').replaceAll('若木安星已生效','公开算法已生效');
  if(relative==='site/src/index.html'){
    text=replaceChecked(text,'value="public-server" selected','value="public-server"',relative);
    text=replaceChecked(text,'value="public">公开算法','value="public" selected>公开算法',relative);
  }
  if(relative==='site/scripts/build.js')text=replaceChecked(text,"fs.copyFileSync(path.join(root,'.openai','hosting.json'),path.join(destination,'.openai','hosting.json'));","// Deployment identifiers are configured by each installation; none are exported.",relative);
  if(relative==='site/scripts/preview.mjs')text=replaceChecked(text,"'8769'","String(process.env.PORT||'8879')",relative);
  if(relative==='site/package.json'){
    const pkg=JSON.parse(text);pkg.scripts.test='node --test tests/*.test.mjs';pkg.scripts['test:public']='node --test tests/public-chart.test.mjs';text=JSON.stringify(pkg,null,2)+'\n';
  }
  if(relative==='android/scripts/build.ps1')text=text.replace(/^\$pythonExe = .*$/m,"$pythonExe = if ($env:PYTHON) { $env:PYTHON } else { 'python' }");
  return Buffer.from(text);
}
function audit(files){
  let bytes=0;
  const secrets=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{30,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,/\bAKIA[0-9A-Z]{16}\b/];
  for(const relative of files){
    const file=safeFile(root,relative),info=fs.statSync(file);
    if(!info.isFile()||info.size>90*1024*1024)throw Error(`Unsupported public file: ${relative}`);
    bytes+=info.size;
    if(/\.(?:[cm]?js|html|css|json|ps1|md|txt|ts|sql|ya?ml|java|xml|py|cjs)$/.test(relative)){
      const text=fs.readFileSync(file,'utf8');
      if(secrets.some(pattern=>pattern.test(text)))throw Error(`Potential credential in ${relative}; export stopped without printing it.`);
    }
  }
  console.log(`Public audit: ${files.length} allowed files, ${(bytes/1024/1024).toFixed(1)} MiB; excluded paths are never read.`);
}
async function main(){
  if(sourceRoot===root||!fs.existsSync(path.join(siteRoot,'.git')))throw Error('Set --source-root to the original project containing site/.git.');
  const commit=git(['rev-parse','--verify',`${value('--ref')||'HEAD'}^{commit}`],siteRoot);
  const records=[];
  const modes=new Map(git(['ls-tree','-r',commit,'--',...manifest.site],siteRoot).split('\n').map(line=>{const [metadata,file]=line.split('\t');return [file,metadata.split(' ')[0]];}));
  for(const relative of manifest.site){
    safeFile(siteRoot,relative);
    // Read only explicitly approved paths from one immutable, published source commit.
    const mode=modes.get(relative);
    if(mode!=='100644'&&mode!=='100755')throw Error(`Public source file missing or not regular: ${relative}`);
    const raw=run('git',['cat-file','blob',`${commit}:${relative}`],siteRoot);
    const output=`site/${relative}`,data=adapt(output,raw);write(output,data);records.push({path:output,sha256:createHash('sha256').update(data).digest('hex')});
  }
  for(const kind of ['desktop','android'])for(const relative of manifest[kind]){
    const base=path.join(sourceRoot,kind),data=adapt(`${kind}/${relative}`,fs.readFileSync(safeFile(base,relative)));
    write(`${kind}/${relative}`,data);records.push({path:`${kind}/${relative}`,sha256:createHash('sha256').update(data).digest('hex')});
  }
  for(const relative of manifest.generated){
    const source=safeFile(path.join(root,'maintenance','templates'),relative);
    write(relative,fs.readFileSync(source));
  }
  write('maintenance/export-state.json',JSON.stringify({schemaVersion:1,sourceCommit:commit,files:records},null,2)+'\n');
  const expected=new Set([...records.map(r=>r.path),...manifest.generated,'maintenance/export-state.json',...manifest.maintenance]);
  // Refuse unexpected files; never add the source repository or its old history.
  for(const relative of expected)safeFile(root,relative);
  audit([...expected]);
  if(!args.includes('--push')){console.log(`Exported source ${commit.slice(0,12)}. Build, test and review the public copy before --push.`);return;}
  if(!args.includes('--reviewed'))throw Error('Review the exported changes and run validation, then pass --reviewed --push.');
  if(!fs.existsSync(path.join(root,'.git')))throw Error('Initialize this public repository before pushing.');
  if(git(['remote','get-url','origin'])!==repository)throw Error('Unexpected GitHub destination; no push performed.');
  for(const f of git(['ls-files']).split('\n').filter(Boolean))if(!expected.has(f))throw Error(`Tracked file is outside the approved public manifest: ${f}`);
  // Prevent an unrelated file staged by another tool from slipping into this commit.
  for(const f of git(['diff','--cached','--name-only']).split('\n').filter(Boolean))if(!expected.has(f))throw Error(`Unexpected staged file: ${f}`);
  run('git',['add','--',...expected],root);
  const change=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'diff','--cached','--quiet'],{cwd:root,windowsHide:true});
  if(change.status===1)run('git',['commit','-m',`Sync public application from ${commit.slice(0,12)}`],root,{stdio:'inherit'});
  else if(change.status!==0)throw Error('Unable to check staged changes.');
  run('git',['push','-u','origin','main'],root,{stdio:'inherit'});
  const local=git(['rev-parse','HEAD']),remote=git(['ls-remote','origin','refs/heads/main']).split(/\s/)[0];
  if(local!==remote)throw Error('Remote verification failed.');
  console.log(`GitHub synchronized: ${repository.replace(/\.git$/,'')} @ ${local.slice(0,12)}`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
