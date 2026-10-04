fetch('/downloads-manifest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(releases=>{
  for(const [platform,release] of Object.entries(releases)){
    const element=document.querySelector(`[data-release="${platform}"]`);
    if(element)element.textContent=`版本 ${release.version} · ${(release.size/1048576).toFixed(1)} MB`;
    const button=document.querySelector(`[data-download="${platform}"]`);
    if(button&&/^\/downloads\/GuanXingTai-[\w.-]+\.(exe|apk)$/.test(release.url))button.href=release.url;
    const p=document.createElement('p');p.textContent=release.filename+'\nSHA-256: '+release.sha256;document.querySelector('#checksums').append(p);
  }
}).catch(()=>{document.querySelector('#checksums').textContent='暂时无法读取校验信息，请稍后刷新。';});
const appVersion=/GuanXingTaiAndroid\/(\d+)\.(\d+)\.(\d+)/.exec(navigator.userAgent);
if(appVersion&&appVersion.slice(1).some((n,i)=>Number(n)>(i===0?1:0)))document.querySelector('#native-update').hidden=false;
