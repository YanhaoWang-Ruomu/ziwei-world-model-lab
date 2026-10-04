// Run only against the dedicated fictional persistence-test preview, never user data.
const assert=require('node:assert/strict');
const base='http://127.0.0.1:8770',suffix=Date.now().toString(36),password='Fictional-test-only-428';
let count=0;
async function request(path,{cookie='',method='GET',body,origin=base,ip='192.0.2.81'}={}){
  const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();return {status:r.status,data,cookies:r.headers.getSetCookie(),cache:r.headers.get('Cache-Control')};
}
function eq(actual,expected){assert.deepEqual(actual,expected);count++;}
const body={title:'隔离测试 · 虚构命例',birth:{name:'虚构甲',date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false},provider:'public'};
(async()=>{
  eq((await request('/api/storage')).data.testStore,true);
  eq((await request('/api/cases')).status,401);
  eq((await request('/api/account/register',{method:'POST',body:{username:'reject'+suffix,password,role:'core'}})).status,400);
  eq((await request('/api/account/register',{method:'POST',origin:'https://example.invalid',body:{username:'reject'+suffix,password}})).status,403);
  const a=await request('/api/account/register',{method:'POST',body:{username:'fictionA'+suffix,password,remember:true}});eq(a.status,200);
  const aCookie=a.cookies.find(c=>c.startsWith('__Host-ziwei_account=')).split(';')[0];
  assert.match(a.cookies.join(';'),/HttpOnly; Secure; SameSite=Strict; Max-Age=2592000/);count++;
  const aSession=await request('/api/session',{cookie:aCookie});eq(aSession.data.role,'public');eq(aSession.data.authType,'password');eq(aSession.data.authenticated,true);
  eq((await request('/api/account/register',{method:'POST',body:{username:('fictionA'+suffix).toUpperCase(),password}})).status,409);
  const b=await request('/api/account/register',{method:'POST',body:{username:'fictionB'+suffix,password},ip:'192.0.2.82'});eq(b.status,200);
  const bCookie=b.cookies.find(c=>c.startsWith('__Host-ziwei_account=')).split(';')[0];
  eq((await request('/api/account/login',{method:'POST',body:{username:'fictionA'+suffix,password:'wrong-password'}})).status,403);
  const created=await request('/api/cases',{method:'POST',cookie:aCookie,body});eq(created.status,200);eq(created.data.case.birth,body.birth);assert.match(created.cache,/no-store/);count++;
  const id=created.data.case.id;
  eq((await request('/api/cases',{cookie:aCookie})).data.cases.length,1);
  eq((await request('/api/cases',{cookie:bCookie})).data.cases.length,0);
  for(const cookie of [bCookie,'local_preview_owner=1'])for(const method of ['GET','PUT','DELETE'])eq((await request('/api/cases/'+id,{cookie,method,body:method==='PUT'?{...body,revision:1}:undefined})).status,404);
  eq((await request('/api/cases',{cookie:aCookie,method:'POST',body:{...body,birth:{...body.birth,date:'2026-02-30'}}})).status,400);
  eq((await request('/api/cases',{cookie:aCookie,method:'POST',body:{...body,user_id:b.data.account.id}})).status,400);
  const changed=await request('/api/cases/'+id,{cookie:aCookie,method:'PUT',body:{...body,title:'虚构甲更新',revision:1}});eq(changed.data.case.revision,2);
  eq((await request('/api/cases/'+id,{cookie:aCookie,method:'PUT',body:{...body,revision:1}})).status,409);
  const logout=await request('/api/logout',{cookie:aCookie,method:'POST'});eq(logout.data.platformSignout,false);eq((await request('/api/cases',{cookie:aCookie})).status,401);
  const login=await request('/api/account/login',{method:'POST',body:{username:'fictionA'+suffix,password}});eq(login.status,200);
  const restored=login.cookies.find(c=>c.startsWith('__Host-ziwei_account=')).split(';')[0];
  eq((await request('/api/cases',{cookie:restored})).data.cases[0].title,'虚构甲更新');
  // Local identity cannot inherit the simultaneously signed-in site's founder privilege.
  eq((await request('/api/session',{cookie:restored+'; local_preview_owner=1'})).data.founder,false);
  eq((await request('/api/session',{cookie:'__Host-ziwei_account='+'1'.repeat(64)+'; local_preview_owner=1'})).data.authenticated,false);
  eq((await request('/api/core-members',{cookie:restored})).status,403);
  const other=await request('/api/cases',{method:'POST',cookie:bCookie,body:{...body,title:'虚构乙'}});eq(other.status,200);
  eq((await request('/api/cases/'+id,{cookie:restored,method:'DELETE'})).status,200);
  eq((await request('/api/cases/'+id,{cookie:restored})).status,404);
  eq((await request('/api/cases',{cookie:bCookie})).data.cases.length,1);
  // Remove only the synthetic case created in this test. No source books are accessed.
  await request('/api/cases/'+other.data.case.id,{cookie:bCookie,method:'DELETE'});
  await request('/api/logout',{cookie:restored,method:'POST'});await request('/api/logout',{cookie:bCookie,method:'POST'});
  console.log(`PASS ${count} account and case isolation checks`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
