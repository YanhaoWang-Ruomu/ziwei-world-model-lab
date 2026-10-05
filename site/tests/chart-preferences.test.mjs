import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
import {SETTING_FIELDS,defaultSettings,normalizeSettings,encodeSettings,decodeSettings} from '../src/chart-conventions.mjs';
import {makeChart,exportChart,cycleAt} from '../src/chart-engine.mjs';
import {decadeChoices,chooseDecade,currentDecade} from '../src/cycle-navigation.mjs';
import {casePayload} from '../server/chart-cases.js';
import {normalizeCaseBundle,planCaseImport} from '../server/chart-case-transfer.mjs';
import {initChartCases} from '../src/chart-cases.mjs';
import {initChartSettings} from '../src/chart-settings.mjs';
const birth={name:'虚构测试',date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false};
const record=()=>casePayload({title:'虚构命例',birth:{...birth},provider:'public'});
test('all supported option combinations have portable, checked, birth-free codes',()=>{
  const codes=new Set();for(let n=0;n<64;n++){const value=defaultSettings();SETTING_FIELDS.forEach((f,i)=>value.options[f.key]=f.values[(n>>i)&1]);const code=encodeSettings(value);codes.add(code);assert.deepEqual(decodeSettings(code.toLowerCase()),value);assert.ok(code.length<18);assert.throws(()=>decodeSettings(code.slice(0,-1)+(code.endsWith('0')?'1':'0')));}
  assert.equal(codes.size,64);assert.throws(()=>decodeSettings('8GTQQ'));assert.throws(()=>normalizeSettings({...defaultSettings(),engine:'future'}));assert.throws(()=>normalizeSettings({...defaultSettings(),options:{...defaultSettings().options,unreviewedRule:'not accepted'}}));
});
test('settings change public calculations and interleaved charts restore their own options',()=>{
  const input={...birth,date:'2024-02-08'},a=makeChart(input),settings=defaultSettings(input);settings.options.yearDivide='exact';settings.options.algorithm='zhongzhou';
  const b=makeChart({...input,settings});assert.notDeepEqual(a.chart.palaces,b.chart.palaces);
  const expected=cycleAt(a,'2026-03-05','12:00');cycleAt(b,'2026-03-05','12:00');assert.deepEqual(cycleAt(a,'2026-03-05','12:00'),expected);
  const recovered=makeChart({...input,settings:decodeSettings(encodeSettings(settings))});assert.deepEqual(recovered.chart,b.chart);
  assert.throws(()=>makeChart({...birth,settings:{...defaultSettings(),options:{...defaultSettings().options,dayDivide:'current'}}}),/不一致/);
});
test('legacy chart exports become validated cases; imports do not carry charts or rules',()=>{
  const legacy=exportChart(makeChart(birth));const imported=normalizeCaseBundle(legacy);assert.equal(imported.records[0].provider,'public');assert.deepEqual(imported.records[0].settings,defaultSettings());assert.equal('chart' in imported.records[0],false);
  const data={kind:'guanxingtai_cases',version:1,records:[record(),record(),{...record(),title:'另一虚构命例'}]};const plan=planCaseImport(normalizeCaseBundle(data),[record()]);assert.equal(plan.added,1);assert.equal(plan.skipped,2);
  const empty=planCaseImport(normalizeCaseBundle(data),[]);assert.deepEqual(empty.entries.map(e=>e.status),['new','duplicate','new']);
  assert.throws(()=>normalizeCaseBundle({...data,records:[{...record(),user_id:'foreign'}]}));assert.throws(()=>normalizeCaseBundle({...data,defaultIndex:20}));assert.throws(()=>normalizeCaseBundle({kind:'foreign-backup',records:[record()]}));assert.throws(()=>normalizeCaseBundle({...data,records:Array(301).fill(record())}));
});
test('lunar birthday age settings navigate into the selected decade, not the preceding one',()=>{
  const settings=defaultSettings(birth);settings.options.ageDivide='birthday';const result=makeChart({...birth,settings});
  for(const target of decadeChoices(result).filter(d=>d.index!==null).slice(0,3)){const stamp=chooseDecade(result,null,target.key);assert.equal(currentDecade(result,cycleAt(result,stamp.date,stamp.time)).key,target.key);}
});
function dom(){const win=new Window({url:'http://localhost/#model',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}}),keys=['window','document','location','FormData','Event','CustomEvent','Option','fetch'],old=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)if(k!=='fetch')Object.defineProperty(globalThis,k,{value:k==='window'?win:win[k],configurable:true,writable:true});globalThis.Option=function(t,v){const n=win.document.createElement('option');n.text=t;n.value=v;return n;};win.document.write(fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8'));return {win,async close(){await win.happyDOM.abort();await win.happyDOM.close();for(const k of keys){if(old[k])Object.defineProperty(globalThis,k,old[k]);else delete globalThis[k];}}};}
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const response=data=>({ok:true,json:async()=>data});
test('signed-in startup opens only the owned default, once, with its snapshot',async()=>{
  const f=dom(),opened=[],saved={id:'fiction',...record()},preferences={defaultCaseId:'fiction',autoOpen:true,defaultSettings:null,revision:2};try{
    globalThis.fetch=async path=>response(path==='/api/session'?{authenticated:true,userId:'account-a'}:path==='/api/chart-preferences'?{preferences}:{case:saved});
    initChartCases({getChart:()=>null,loadChart:async(r,options)=>{opened.push({r,options});return true;}});await tick();assert.equal(opened.length,1);assert.deepEqual(opened[0].r.settings,defaultSettings());assert.equal(opened[0].options.automatic,true);
    document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{authenticated:true,userId:'account-a',role:'core'}}));await tick();assert.equal(opened.length,1);
  }finally{await f.close();}
});
test('late default responses never replace user input or cross an account switch',async()=>{
  const f=dom(),opened=[];let release;try{
    globalThis.fetch=async path=>path==='/api/session'?response({authenticated:true,userId:'a'}):new Promise(resolve=>{release=resolve;});
    initChartCases({getChart:()=>null,loadChart:async r=>opened.push(r)});await tick();document.querySelector('#birth-form').dispatchEvent(new Event('input'));
    release(response({preferences:{autoOpen:true,defaultCaseId:'fiction'}}));await tick();assert.equal(opened.length,0);
    document.dispatchEvent(new CustomEvent('ziwei:session',{detail:{authenticated:true,userId:'b'}}));await tick();document.dispatchEvent(new Event('ziwei:logout'));release(response({preferences:{autoOpen:true,defaultCaseId:'fiction'}}));await tick();assert.equal(opened.length,0);
  }finally{await f.close();}
});
test('code import previews differences before applying and updates the birth form options',async()=>{
  const f=dom();try{globalThis.fetch=async()=>response({profiles:[]});let applied;const ui=initChartSettings({onApply:value=>{applied=value;}});document.dispatchEvent(new Event('ziwei:open-chart-settings'));await tick();const next=defaultSettings();next.options.algorithm='zhongzhou';next.options.dayDivide='current';const dialog=document.querySelector('#chart-method-dialog');dialog.querySelector('[data-method-import]').value=encodeSettings(next);dialog.querySelector('[data-method-preview]').click();assert.equal(applied,undefined);assert.equal(dialog.querySelector('[data-method-diff]').hidden,false);dialog.querySelector('[data-method-diff] button').click();assert.equal(applied,undefined);dialog.querySelector('[data-method-apply]').click();assert.deepEqual(applied,next);assert.deepEqual(ui.read(),next);assert.equal(document.querySelector('#chart-provider').value,'public');}finally{await f.close();}
});
test('new blank charts reuse the account default, while logout clears that preference',async()=>{
  const f=dom();try{globalThis.fetch=async()=>response({profiles:[]});const ui=initChartSettings({onApply:()=>{}}),preferred=defaultSettings();preferred.options.algorithm='zhongzhou';preferred.options.dayDivide='current';
    document.dispatchEvent(new CustomEvent('ziwei:chart-preferences',{detail:{defaultSettings:preferred}}));document.querySelector('#birth-form').reset();document.dispatchEvent(new Event('ziwei:chart-cleared'));assert.deepEqual(ui.read(),preferred);
    document.dispatchEvent(new Event('ziwei:logout'));document.querySelector('#birth-form').reset();document.dispatchEvent(new Event('ziwei:chart-cleared'));assert.deepEqual(ui.read(),defaultSettings());
  }finally{await f.close();}
});
