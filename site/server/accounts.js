import {now,digest,randomToken,jsonBody,HttpError} from './security.js';
import {passwordHash} from './special-access.js';

const cookieName='__Host-ziwei_account';
const cookie=(token,seconds)=>`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict${seconds===null?'':`; Max-Age=${seconds}`}`;
const cookieToken=request=>(request.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-ziwei_account=([a-f0-9]{64})(?:;|$)/)?.[1]||'';
function equals(a,b){let diff=a.length^b.length;for(let i=0;i<64;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export function usernameKey(value){
  if(typeof value!=='string')throw new HttpError(400,'请输入用户名。');
  const name=value.normalize('NFKC').trim();
  if(!/^[\p{L}\p{N}_-]{3,32}$/u.test(name))throw new HttpError(400,'用户名请用 3–32 位中英文、数字、下划线或短横线。');
  return {name,key:name.toLowerCase()};
}
async function limit(request,db,kind,key){
  const t=now(),address=await digest(request.headers.get('cf-connecting-ip')||'unknown');
  const limits=[{key:`account:${kind}:ip:${address}`,count:kind==='register'?5:15,seconds:900},
    {key:`account:${kind}:all`,count:kind==='register'?60:180,seconds:60}];
  if(kind==='login')limits.push({key:`account:login:user:${await digest(key)}`,count:12,seconds:900});
  const results=await db.batch(limits.map(l=>db.prepare('INSERT INTO login_attempts(bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts').bind(l.key,t+l.seconds,t,t)));
  if(results.some((r,i)=>r.results[0].attempts>limits[i].count))throw new HttpError(429,'尝试次数较多，请 15 分钟后再试。');
}
export async function accountIdentity(request,db,platform){
  const hasCookie=(request.headers.get('cookie')||'').includes(cookieName+'=');
  const token=cookieToken(request);
  if(!hasCookie)return {...platform,platformId:platform.id,authType:platform.id?'chatgpt':''};
  const account=token?await db.prepare('SELECT a.id,a.username FROM personal_accounts a JOIN personal_sessions s ON s.user_id=a.id WHERE s.hash=? AND s.expires_at>?').bind(await digest(token),now()).first():null;
  // A selected local account never inherits the privileges of a platform session.
  return {id:account?.id||'',owner:false,platformId:platform.id,authType:account?'password':'',username:account?.username||''};
}
export async function logoutAccount(request,db){
  const token=cookieToken(request);if(token)await db.prepare('DELETE FROM personal_sessions WHERE hash=?').bind(await digest(token)).run();
  return cookie('',0);
}
export async function accountRoute({path,method,request,db}){
  if(!['/api/account/register','/api/account/login'].includes(path))return null;
  if(method!=='POST')throw new HttpError(405,'请从账户页面登录或注册。');
  const data=await jsonBody(request,4096),kind=path.endsWith('register')?'register':'login';
  if(!data||Array.isArray(data)||Object.keys(data).some(k=>!['username','password','remember'].includes(k)))throw new HttpError(400,'账户资料格式不正确。');
  const {name,key}=usernameKey(data.username);
  if(typeof data.password!=='string'||data.password.length>128||!data.password||(data.remember!==undefined&&typeof data.remember!=='boolean'))throw new HttpError(400,'请核对用户名与密码。');
  await limit(request,db,kind,key);
  let account;
  if(kind==='register'){
    if(data.password.length<12)throw new HttpError(400,'请设置至少 12 位密码，可以使用容易记住的长句。');
    const id='local:'+crypto.randomUUID(),salt=randomToken(),hash=await passwordHash(data.password,salt);
    const inserted=await db.prepare('INSERT INTO personal_accounts(id,username,username_key,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(username_key) DO NOTHING RETURNING id,username').bind(id,name,key,salt,hash,now()).first();
    if(!inserted)throw new HttpError(409,'这个用户名已被使用，请换一个或直接登录。');
    account=inserted;
  }else{
    account=await db.prepare('SELECT id,username,password_salt,password_hash FROM personal_accounts WHERE username_key=?').bind(key).first();
    const actual=await passwordHash(data.password,account?.password_salt||'0'.repeat(64));
    if(!equals(actual,account?.password_hash||'0'.repeat(64))||!account)throw new HttpError(403,'用户名或密码不正确。');
  }
  const token=randomToken(),previous=cookieToken(request),expires=now()+(data.remember?30:1)*86400;
  await db.batch([
    db.prepare('DELETE FROM personal_sessions WHERE expires_at<=? OR hash=?').bind(now(),previous?await digest(previous):''),
    db.prepare('DELETE FROM login_attempts WHERE expires_at<=?').bind(now()),
    db.prepare('INSERT INTO personal_sessions(hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),account.id,expires),
  ]);
  return {cookie:cookie(token,data.remember?30*86400:null),account:{id:account.id,username:account.username}};
}
