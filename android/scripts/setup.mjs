import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const root=path.resolve(import.meta.dirname,'..','.tools');fs.mkdirSync(root,{recursive:true});
async function download(url,name,expected,algorithm='sha256'){
 const file=path.join(root,name);if(!fs.existsSync(file)){const r=await fetch(url);if(!r.ok)throw Error('Download failed '+r.status);await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(file));}
 const hash=crypto.createHash(algorithm);for await(const part of fs.createReadStream(file))hash.update(part);
 if(hash.digest('hex').toLowerCase()!==expected.toLowerCase())throw Error('Checksum failed: '+name);console.log('Verified '+name);
}
const releases=await(await fetch('https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse')).json();
const pkg=releases[0].binary.package;
const xml=await(await fetch('https://dl.google.com/android/repository/repository2-1.xml')).text();
fs.writeFileSync(path.join(root,'repository.xml'),xml);
const archives=[];
for(const id of ['platforms;android-35','build-tools;35.0.0','platform-tools']){
 const element=xml.match(new RegExp('<remotePackage path="'+id+'"[\\s\\S]*?</remotePackage>'))?.[0];if(!element)throw Error('Missing '+id);
 const choices=[...element.matchAll(/<archive>[\s\S]*?<\/archive>/g)].map(x=>x[0]);const archive=choices.find(x=>x.includes('<host-os>windows</host-os>'))||choices.find(x=>!x.includes('<host-os>'));
 const url=archive.match(/<url>([^<]+)<\/url>/)[1],checksum=archive.match(/<checksum[^>]*>([^<]+)<\/checksum>/)[1];
 archives.push({id,url:'https://dl.google.com/android/repository/'+url,name:id.replaceAll(';','-')+'.zip',checksum});
}
await Promise.all([download(pkg.link,'jdk.zip',pkg.checksum),...archives.map(x=>download(x.url,x.name,x.checksum,x.checksum.length===40?'sha1':'sha256'))]);
fs.writeFileSync(path.join(root,'downloads.json'),JSON.stringify({jdk:pkg.link,archives},null,2));
