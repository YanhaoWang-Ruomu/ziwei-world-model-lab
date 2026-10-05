// Populate only the explicitly identified fictional preview, using its local demo identity.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8770',cookie='local_preview_subject=community-demo';
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('Fictional preview setup failed: '+r.status);return r.json();}
assert.equal((await api('/api/storage')).testStore,true);
const {defaultSettings}=await import('../src/chart-conventions.mjs');
const born={name:'虚构示例 · 青岚',date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false};
const existing=(await api('/api/cases')).cases;
let primary=existing.find(r=>r.title==='虚构示例 · 青岚');
if(!primary)primary=(await api('/api/cases','POST',{title:born.name,birth:born,provider:'public',settings:defaultSettings()})).case;
if(!existing.some(r=>r.title==='虚构示例 · 星禾'))await api('/api/cases','POST',{title:'虚构示例 · 星禾',birth:{...born,name:'虚构示例 · 星禾',gender:'女',date:'2002-03-20',time:'18:30'},provider:'public',settings:defaultSettings()});
const pref=(await api('/api/chart-preferences')).preferences;
await api('/api/chart-preferences','PUT',{...pref,defaultCaseId:primary.id,autoOpen:true});
if(!(await api('/api/chart-profiles')).profiles.some(p=>p.name==='虚构演示 · 常用方案'))await api('/api/chart-profiles','POST',{name:'虚构演示 · 常用方案',settings:defaultSettings()});
console.log('Fictional preview ready: http://127.0.0.1:8770/__test/demo?role=reader&view=model');
