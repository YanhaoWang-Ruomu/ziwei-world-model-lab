import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {identity} from '../server/security.js';
import {accountIdentity} from '../server/accounts.js';
import {resolveRole,sessionView} from '../server/roles.js';
import {cloudflareWorker} from '../server/cloudflare-adapter.mjs';
import {configurePlatformLogin} from '../src/platform-login.mjs';
import {inspectConfig} from '../scripts/cloudflare-check.mjs';

const founder='local:00000000-0000-4000-8000-000000000001';
const other='local:00000000-0000-4000-8000-000000000002';
const request=(headers={})=>new Request('https://fictional.example/api/session',{headers});
const validCookie='__Host-ziwei_account='+'a'.repeat(64);
const env={AUTH_MODE:'standalone',FOUNDER_ACCOUNT_ID:founder};
function database(account=null){return {prepare(sql){return {bind(...args){return this;},async first(){return sql.includes('JOIN personal_sessions')?account:null;}};}};}

test('standalone never trusts the Sites identity headers, even with matching owner email',()=>{
  const req=request({'oai-authenticated-user-id':founder,'oai-authenticated-user-email':'owner@fictional.test'});
  assert.deepEqual(identity(req,{...env,OWNER_EMAIL:'owner@fictional.test'}),{id:'',owner:false});
  assert.deepEqual(identity(req,{OWNER_EMAIL:'owner@fictional.test'}),{id:founder,owner:true});
});

test('standalone founder needs the configured account and a valid persisted session',async()=>{
  const platform={id:founder,owner:true};
  const good=await accountIdentity(request({cookie:validCookie}),database({id:founder,username:'fictional'}),platform,env);
  assert.equal(good.owner,true);assert.equal(good.authType,'password');assert.equal(good.platformId,'');
  for(const [headers,account,config] of [
    [{},null,env],
    [{cookie:'__Host-ziwei_account=invalid'},null,env],
    [{cookie:validCookie},null,env],
    [{cookie:validCookie},{id:other,username:'other'},env],
    [{cookie:validCookie},{id:founder,username:'fictional'},{AUTH_MODE:'standalone'}],
    [{cookie:validCookie},{id:founder,username:'fictional'},{AUTH_MODE:'standalone',FOUNDER_ACCOUNT_ID:'fictional'}]
  ])assert.equal((await accountIdentity(request(headers),database(account),platform,config)).owner,false);
});

test('Sites personal accounts still cannot inherit the platform founder privilege',async()=>{
  const viewer=await accountIdentity(request({cookie:validCookie}),database({id:founder,username:'fictional'}),{id:'platform-owner',owner:true},{FOUNDER_ACCOUNT_ID:founder});
  assert.equal(viewer.owner,false);assert.equal(viewer.platformId,'platform-owner');
  const platform=await accountIdentity(request(),database(),{id:'platform-owner',owner:true});
  assert.equal(platform.owner,true);assert.equal(platform.authType,'chatgpt');
});

test('standalone founder may switch to public view without losing the granted maximum level',async()=>{
  const viewer=await accountIdentity(request({cookie:validCookie}),database({id:founder}),{},env);
  viewer.platformLoginAvailable=false;
  await resolveRole(viewer,database(),request({cookie:'ziwei_view_role=public'}));
  const session=sessionView(viewer);
  assert.equal(session.founder,true);assert.equal(session.maxRole,'core');assert.equal(session.role,'public');assert.equal(session.owner,false);assert.equal(session.platformLoginAvailable,false);
});

test('production adapter removes spoofed headers and forces standalone authentication',async()=>{
  let called=0;
  const application={fetch(req,bindings,ctx){called++;assert.equal(req.headers.get('oai-authenticated-user-id'),null);assert.equal(req.headers.get('oai-authenticated-user-email'),null);assert.equal(req.headers.get('cookie'),validCookie);assert.equal(req.headers.get('origin'),'https://fictional.example');assert.equal(bindings.AUTH_MODE,'standalone');assert.equal(bindings.OWNER_EMAIL,'');assert.equal(bindings.FOUNDER_ACCOUNT_ID,founder);return new Response('ok');}};
  const response=await cloudflareWorker(application).fetch(request({cookie:validCookie,origin:'https://fictional.example','oai-authenticated-user-id':founder,'oai-authenticated-user-email':'owner@fictional.test'}),{...env,AUTH_MODE:'sites',OWNER_EMAIL:'owner@fictional.test'},{});
  assert.equal(await response.text(),'ok');assert.equal(called,1);
});

test('production adapter blocks preview shortcuts and keeps legacy login redirects local',async()=>{
  const adapter=cloudflareWorker({fetch(){assert.fail('must not call the application');}});
  for(const path of ['/__test/demo','/__preview/login'])assert.equal((await adapter.fetch(new Request('https://fictional.example'+path),{})).status,404);
  const result=await adapter.fetch(new Request('https://fictional.example/signin-with-chatgpt?return_to=https://untrusted.example'),{});
  assert.equal(result.status,303);assert.equal(result.headers.get('Location'),'/#account');
});

test('standalone account links use the personal login entry while Sites links are preserved',()=>{
  const window=new Window(),root=window.document;
  root.body.innerHTML='<a id="personal-signin" href="/signin-with-chatgpt?return_to=x">ChatGPT</a><a id="manage" href="/signin-with-chatgpt?return_to=y" target="_top">管理材料</a><a id="other" href="#cards">卡片</a>';
  configurePlatformLogin({platformLoginAvailable:true},root);assert.equal(root.querySelector('#personal-signin').hidden,false);
  configurePlatformLogin({platformLoginAvailable:false},root);
  assert.equal(root.querySelector('#personal-signin').hidden,true);assert.equal(root.querySelector('#manage').getAttribute('href'),'#account');assert.equal(root.querySelector('#manage').hasAttribute('target'),false);assert.equal(root.querySelector('#other').getAttribute('href'),'#cards');
  window.happyDOM.abort();
});

test('strict-free preparation refuses incomplete resources and metered R2 configuration',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.cloudflare.example.json',import.meta.url),'utf8'));
  const reasons=inspectConfig(config);
  assert.ok(reasons.some(s=>s.includes('D1')));assert.ok(reasons.some(s=>s.includes('文件存储')));
  config.d1_databases[0].database_id='00000000-0000-4000-8000-000000000003';
  config.r2_buckets=[{binding:'BUCKET',bucket_name:'fictional-only'}];
  assert.ok(inspectConfig(config).some(s=>s.includes('超额可能计费')));
  config.main='server/dev-worker.js';assert.ok(inspectConfig(config).some(s=>s.includes('本机预览')));
});
