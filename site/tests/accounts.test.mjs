import test from 'node:test';
import assert from 'node:assert/strict';
import {usernameKey} from '../server/accounts.js';
import {casePayload} from '../server/chart-cases.js';
import {defaultSettings} from '../src/chart-conventions.mjs';
import {soundEnabledByPreference} from '../src/scene-sound.mjs';
test('username canonicalization cannot create case or width aliases',()=>{
  assert.deepEqual(usernameKey(' Ｔｅｓｔ用户 '),{name:'Test用户',key:'test用户'});
  for(const name of ['ab','a/b','a b','<script>','a'.repeat(33)])assert.throws(()=>usernameKey(name));
});
test('case payload validates a fictional date and whitelists fields',()=>{
  const data={title:'虚构案例',birth:{name:'虚构人',date:'2001-01-01',time:'23:05',gender:'女',dayDivide:'forward',fixLeap:true,daylight:false},provider:'public'};
  assert.deepEqual(casePayload(data),{...data,settings:defaultSettings(data.birth)});
  assert.throws(()=>casePayload({...data,birth:{...data.birth,formula:'not-accepted'}}));
  assert.throws(()=>casePayload({...data,birth:{...data.birth,date:'2001-02-29'}}));
  assert.throws(()=>casePayload({...data,provider:'unknown'}));
});
test('ambient sound defaults on and respects an explicit mute',()=>{
  assert.equal(soundEnabledByPreference(null),true);assert.equal(soundEnabledByPreference('on'),true);assert.equal(soundEnabledByPreference('off'),false);
});
