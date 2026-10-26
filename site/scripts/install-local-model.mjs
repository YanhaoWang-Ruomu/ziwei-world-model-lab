import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const manifest=JSON.parse(fs.readFileSync(new URL('./local-model-manifest.json',import.meta.url),'utf8'));
const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../../local-ai-runtime',import.meta.url)));
fs.mkdirSync(root,{recursive:true});
async function hash(file){const h=createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
for(const item of manifest.files){
  const target=path.join(root,item.name),part=target+'.part';
  if(fs.existsSync(target)&&fs.statSync(target).size===item.bytes&&await hash(target)===item.sha256){console.log(item.name+': verified');continue;}
  let start=fs.existsSync(part)?fs.statSync(part).size:0;
  const response=await fetch(item.url,{headers:start?{Range:`bytes=${start}-`}:{},signal:AbortSignal.timeout(3600000)});
  if(!response.ok)throw Error(`Download failed (${response.status}): ${item.name}`);
  if(response.status!==206)start=0;
  else if(!response.headers.get('content-range')?.startsWith(`bytes ${start}-`))throw Error('Unexpected download range');
  let done=start,last=Date.now();
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_encoding,cb){done+=chunk.length;if(Date.now()-last>15000){console.log(`${item.name}: ${Math.round(done/item.bytes*100)}%`);last=Date.now();}cb(null,chunk);}}),fs.createWriteStream(part,{flags:start?'a':'w'}));
  if(fs.statSync(part).size!==item.bytes||await hash(part)!==item.sha256)throw Error(`Download verification failed: ${item.name}`);
  fs.renameSync(part,target);console.log(item.name+': verified');
}
fs.writeFileSync(path.join(root,'installation.json'),JSON.stringify(manifest,null,2));
console.log('Pinned public model and runtime downloads verified.');
