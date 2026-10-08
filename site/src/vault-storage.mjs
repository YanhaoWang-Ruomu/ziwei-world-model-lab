const enc=new TextEncoder(),dec=new TextDecoder();
export const toBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export const fromBase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function fingerprint(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function derive(password,salt){const raw=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:250000},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
function openDatabase(name){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('无法打开本机保存空间。'));});}
function indexedStore(name='ziwei-private-vault'){
  const database=()=>openDatabase(name);
  async function one(mode,action){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),r=action(tx.objectStore('records'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('本机保存失败，请检查剩余空间。'));});}finally{db.close();}}
  return {get:id=>one('readonly',s=>s.get(id)),put:value=>one('readwrite',s=>s.put(value)),remove:id=>one('readwrite',s=>s.delete(id)),
    async putIfHeader(value,expectedIv){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.get(value.owner+':header');r.onsuccess=()=>{if(r.result?.iv!==expectedIv){tx.abort();return;}s.put(value);};tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('加密空间已重置或保存失败，请重新解锁。'));});}finally{db.close();}},
    async resetOwner(account,header,expectedIv,archive,current){const db=await database();try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.get(account+':header');
      r.onsuccess=()=>{if(!current()||r.result?.iv!==expectedIv){tx.abort();return;}
        const cursor=s.openCursor(IDBKeyRange.bound(account+':',account+':\uffff'));
        cursor.onsuccess=()=>{if(!current()){tx.abort();return;}const c=cursor.result;if(c){const row=c.value;if(row.owner===account&&row.kind!=='vault-archive'){s.put({...row,id:archive.archiveOwner+row.id.slice(account.length),owner:archive.archiveOwner});c.delete();}c.continue();}
          else{s.put(header);if(expectedIv)s.put(archive);}};
      };tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('重置未完成，原加密空间保持不变。请检查空间或重新登录。'));
    });}finally{db.close();}},
    async create(value){try{await one('readwrite',s=>s.add(value));return true;}catch(e){if(await one('readonly',s=>s.get(value.id)))return false;throw e;}},
    async publish(ids){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),s=tx.objectStore('records');for(const id of ids){const r=s.get(id);r.onsuccess=()=>{if(!r.result){tx.abort();return;}s.put({...r.result,kind:r.result.kind.replace(/^pending-/,'')});};}tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('恢复尚未提交，请重新尝试。'));});}finally{db.close();}},
    async scan(owner,{metadata=false,catalog=false,parent,kind}={}){const db=await database();try{return await new Promise((resolve,reject)=>{const out=[],tx=db.transaction('records'),r=tx.objectStore('records').openCursor(IDBKeyRange.bound(owner+':',owner+':\uffff'));
      r.onsuccess=()=>{const c=r.result;if(!c)return;const v=c.value;if(v.owner===owner&&(!catalog||!v.kind||['book','technique'].includes(v.kind))&&(parent===undefined||v.parent===parent)&&(!kind||v.kind===kind))out.push(metadata?{id:v.id,iv:v.iv,check:v.check,kind:v.kind,parent:v.parent,size:v.data?.length||0}:v);c.continue();};tx.oncomplete=()=>resolve(out);tx.onerror=tx.onabort=()=>reject(Error('本机读取未完成。'));});}finally{db.close();}}
  };
}
export function createVault({storage,namespace='ziwei-private-vault',lockEvent='ziwei:vault-locked'}={}){
  if(!['ziwei-private-vault','ziwei-local-ai','ziwei-personal-ai'].includes(namespace))throw Error('Unknown local store');
  storage??=indexedStore(namespace);
  let key=null,owner='',headerIv='',epoch=0;
  const lock=()=>{key=null;epoch++;globalThis.document?.dispatchEvent(new Event(lockEvent));};
  const channel=typeof window!=='undefined'&&typeof BroadcastChannel==='function'?new BroadcastChannel(namespace+'-reset'):null;
  if(channel)channel.onmessage=e=>{if(e.data?.owner===owner){lock();globalThis.document?.dispatchEvent(new CustomEvent('ziwei:local-password-reset',{detail:{namespace}}));}};
  const requireOpen=()=>{if(!key)throw Error('请先解锁本机私密书库。');};
  async function open(user,password){lock();const ticket=epoch,account=toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(user))));const header=await storage.get(account+':header');
    if(!header&&password.length<12)throw Error('新书库的解锁密码至少 12 位，请妥善保存。');
    let openedIv=header?.iv;const salt=header?fromBase64(header.salt):crypto.getRandomValues(new Uint8Array(16)),next=await derive(password,salt);
    if(header){try{const check=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(header.iv)},next,fromBase64(header.check));if(dec.decode(check)!=='ziwei-vault-v1')throw Error();}catch{throw Error('书库解锁密码不正确。');}}
    else{const iv=crypto.getRandomValues(new Uint8Array(12)),check=await crypto.subtle.encrypt({name:'AES-GCM',iv},next,enc.encode('ziwei-vault-v1'));if(ticket!==epoch)throw Error('账户已变化，请重新解锁。');const value={id:account+':header',owner:account,salt:toBase64(salt),iv:toBase64(iv),check:toBase64(new Uint8Array(check))};openedIv=value.iv;if(storage.create){if(!await storage.create(value)){if(ticket!==epoch)throw Error('账户已变化。');return open(user,password);}}else await storage.put(value);}
    if(ticket!==epoch)throw Error('账户已变化，请重新解锁。');const latest=await storage.get(account+':header');if(ticket!==epoch||latest?.iv!==openedIv)throw Error('加密空间已变化，请重新解锁。');owner=account;headerIv=latest.iv;key=next;
  }
  async function decode(row,active=key){if(!row?.data)return null;return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(row.iv)},active,fromBase64(row.data))));}
  async function put(value,{pending=false}={}){requireOpen();const ticket=epoch,account=owner,id=value.id||crypto.randomUUID(),iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify({...value,id})));
    if(ticket!==epoch)throw Error('书库已锁定，保存已停止。');const row={id:account+':'+id,owner:account,kind:(pending?'pending-':'')+(value.kind||'book'),parent:value.bookId||null,iv:toBase64(iv),data:toBase64(new Uint8Array(data))};if(storage.putIfHeader)await storage.putIfHeader(row,headerIv);else await storage.put(row);return id;
  }
  async function get(id){requireOpen();const ticket=epoch,value=await decode(await storage.get(owner+':'+id));if(ticket!==epoch)throw Error('书库已锁定。');return value;}
  async function list(options={}){if(!key)return [];const ticket=epoch,active=key,rows=await storage.scan(owner,{catalog:options.parent===undefined,...options}),out=[];for(const row of rows){const value=await decode(row,active);if(value)out.push(value);}return ticket===epoch?out:[];}
  async function remove(id){requireOpen();const ticket=epoch,account=owner,rows=await storage.scan(account,{parent:id,metadata:true});for(const row of rows){if(ticket!==epoch)throw Error('书库已锁定。');await storage.remove(row.id);}if(ticket!==epoch)throw Error('书库已锁定。');await storage.remove(account+':'+id);}
  async function* backupVolumes(maxSize=16*1024*1024){requireOpen();const ticket=epoch,account=owner,header=await storage.get(owner+':header'),snapshot=await storage.scan(owner,{metadata:true}),pending=new Set(snapshot.filter(r=>r.kind?.startsWith('pending-')).map(r=>r.id.slice(account.length+1))),ids=snapshot.filter(r=>r.size&&!r.kind?.startsWith('pending-')&&!pending.has(r.parent)),backupId=crypto.randomUUID();let part=1,records=[header],size=JSON.stringify(header).length;
    const packet=async(last)=>{const content=JSON.stringify(records);return {format:'ziwei-encrypted-vault-parts-v2',backupId,part:part++,last,records,checksum:await fingerprint(content)};};
    for(const item of ids){if(ticket!==epoch)throw Error('书库已锁定，导出已停止。');const row=await storage.get(item.id);if(!row||row.iv!==item.iv)throw Error('书库已变化，请重新开始完整备份。');const length=JSON.stringify(row).length;
      if(records.length>1&&size+length>maxSize){yield await packet(false);records=[header];size=JSON.stringify(header).length;}
      records.push(row);size+=length;
    }
    if(ticket!==epoch||JSON.stringify(await storage.scan(account,{metadata:true}))!==JSON.stringify(snapshot))throw Error('备份期间书库已变化，请重新导出；未完成的分卷不能用于整库恢复。');
    yield await packet(true);
  }
  async function publish(ids,ticket){if(ticket!==epoch)throw Error('书库已锁定，恢复未提交。');const keys=ids.map(id=>owner+':'+id);if(storage.publish)await storage.publish(keys);else for(const id of keys){const row=await storage.get(id);await storage.put({...row,kind:row.kind.replace(/^pending-/,'')});}}
  async function restore(value,password){requireOpen();const ticket=epoch;if(value?.format!=='ziwei-encrypted-vault-v1'||!Array.isArray(value.records))throw Error('备份格式不正确。');const header=value.records.find(r=>r.check&&r.salt);if(!header)throw Error('备份缺少解锁信息。');const backupKey=await derive(password,fromBase64(header.salt));
    try{if(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(header.iv)},backupKey,fromBase64(header.check)))!=='ziwei-vault-v1')throw Error();}catch{throw Error('原备份密码不正确或文件损坏。');}
    const prefix='restore-'+crypto.randomUUID()+'-',ids=[];
    for(const row of value.records.filter(r=>r.data)){const entry=await decode(row,backupKey);if(ticket!==epoch)throw Error('书库已锁定。');entry.id=prefix+entry.id;if(entry.bookId)entry.bookId=prefix+entry.bookId;await put(entry,{pending:true});ids.push(entry.id);}await publish(ids,ticket);
  }
  async function restoreVolumes(files,password,onProgress=()=>{}){requireOpen();const ticket=epoch;let backupId='',total=0;const entries=[];
    // Verify the complete set before writing any record. Read one volume at a time.
    for(const file of files){if(file.size>250*1024*1024)throw Error('请选择不超过 250 MB 的分卷。');const v=JSON.parse(await file.text());if(v.format!=='ziwei-encrypted-vault-parts-v2'||!Array.isArray(v.records)||!Number.isInteger(v.part)||v.part<1||!v.backupId||backupId&&backupId!==v.backupId||entries.some(e=>e.part===v.part)||await fingerprint(JSON.stringify(v.records))!==v.checksum)throw Error('分卷缺失、混用或损坏，请选择同一次备份的所有文件。');backupId=v.backupId;if(!/^[a-f0-9-]{36}$/.test(backupId))throw Error('备份标识不正确。');if(v.last){if(total)throw Error('备份结束标记重复。');total=v.part;}entries.push({file,part:v.part,checksum:v.checksum});}
    entries.sort((a,b)=>a.part-b.part);if(!total||entries.length!==total||entries.some((e,i)=>e.part!==i+1))throw Error('尚未选齐所有分卷，未进行恢复。');
    const first=JSON.parse(await entries[0].file.text()),header=first.records.find(r=>r.check&&r.salt);if(!header)throw Error('备份缺少解锁信息。');const backupKey=await derive(password,fromBase64(header.salt));
    try{if(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(header.iv)},backupKey,fromBase64(header.check)))!=='ziwei-vault-v1')throw Error();}catch{throw Error('原备份密码不正确。');}
    const prefix='restore-'+crypto.randomUUID()+'-',publish=[];let restoredBooks=0;
    for(const entry of entries){const volume=JSON.parse(await entry.file.text());if(await fingerprint(JSON.stringify(volume.records))!==entry.checksum)throw Error('分卷已变化，请重新选择。');
      for(const row of volume.records.filter(r=>r.data)){if(ticket!==epoch)throw Error('书库已锁定，恢复已停止。');const item=await decode(row,backupKey);if(!item?.id||typeof item.id!=='string')throw Error('备份记录格式不正确。');item.id=prefix+item.id;if(item.bookId)item.bookId=prefix+item.bookId;
        if(['book','technique'].includes(item.kind))restoredBooks++;publish.push(item.id);await put(item,{pending:true});}
      onProgress(entry.part,total);
    }
    if(ticket!==epoch)throw Error('书库已锁定，恢复未提交。');const keys=publish.map(id=>owner+':'+id);if(storage.publish)await storage.publish(keys);else for(const id of keys){const row=await storage.get(id);await storage.put({...row,kind:row.kind.replace(/^pending-/, '')});}
    return {volumes:total,records:restoredBooks};
  }
  const accountKey=async user=>{if(typeof user!=='string'||!user)throw Error('请先登录个人账户。');return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(user))));};
  async function resetPassword(user,password,confirmation,isCurrent=()=>true){
    if(confirmation!=='重建加密空间')throw Error('请输入“重建加密空间”确认。');
    if(typeof password!=='string'||password.length<12||password.length>128)throw Error('新解锁密码需要 12–128 位。');
    if(!storage.resetOwner)throw Error('当前保存空间不支持安全重置。');
    lock();const ticket=epoch,account=await accountKey(user),previous=await storage.get(account+':header'),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),next=await derive(password,salt),check=await crypto.subtle.encrypt({name:'AES-GCM',iv},next,enc.encode('ziwei-vault-v1'));
    const id=crypto.randomUUID(),archive={id:account+':archive:'+id,owner:account,kind:'vault-archive',archiveOwner:account+'~archive~'+id,createdAt:new Date().toISOString()};
    if(ticket!==epoch||!isCurrent())throw Error('账户已变化，未重置。');
    await storage.resetOwner(account,{id:account+':header',owner:account,salt:toBase64(salt),iv:toBase64(iv),check:toBase64(new Uint8Array(check))},previous?.iv,archive,()=>ticket===epoch&&isCurrent());
    channel?.postMessage({owner:account});globalThis.document?.dispatchEvent(new CustomEvent('ziwei:local-password-reset',{detail:{namespace}}));return {archived:Boolean(previous)};
  }
  async function archives(user){const account=await accountKey(user);return (await storage.scan(account,{kind:'vault-archive'})).map(r=>({id:r.id,createdAt:r.createdAt}));}
  async function restoreArchive(user,id,password){requireOpen();const ticket=epoch,account=await accountKey(user);if(account!==owner||typeof id!=='string'||!id.startsWith(account+':archive:'))throw Error('无法读取其他账户的旧资料。');const archive=await storage.get(id);if(archive?.owner!==account||archive.kind!=='vault-archive'||!archive.archiveOwner.startsWith(account+'~archive~'))throw Error('旧资料记录不存在。');const records=await storage.scan(archive.archiveOwner);if(ticket!==epoch)throw Error('加密空间已锁定。');await restore({format:'ziwei-encrypted-vault-v1',records},password);}
  return {open,lock,put,get,list,remove,restore,restoreVolumes,backupVolumes,resetPassword,archives,restoreArchive,get generation(){return epoch;},get unlocked(){return Boolean(key);},async backup(){requireOpen();return {format:'ziwei-encrypted-vault-v1',records:await storage.scan(owner)};}};
}
