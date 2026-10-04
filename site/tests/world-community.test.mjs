import test from 'node:test';
import assert from 'node:assert/strict';
import {worldPayload,postPayload} from '../server/world-community.js';
test('world observations strictly reject chart fields, duplicate events and invalid dates',()=>{
  const data={title:'虚构',state:{context:'',resources:'',constraints:'',unknowns:''},events:[]};assert.deepEqual(worldPayload(data),data);
  for(const extra of [{birth:{}},{user_id:'other'},{probability:.9}])assert.throws(()=>worldPayload({...data,...extra}));
  const e={id:'a',date:'2026-09-30',kind:'observed',title:'虚构',detail:''};assert.throws(()=>worldPayload({...data,events:[e,e]}));assert.throws(()=>worldPayload({...data,events:[{...e,date:'2026-02-30'}]}));
});
test('publication requires explicit consent and rejects private references or forged status',()=>{
  const p={title:'虚构',body:'脱敏合成文字',kind:'case',tags:['合成','合成'],sharingConfirmed:true};assert.deepEqual(postPayload(p).tags,['合成']);
  for(const extra of [{sharingConfirmed:false},{sharingConfirmed:'true'},{caseId:'private'},{birth:{}},{status:'published'},{user_id:'other'},{kind:'rule'}])assert.throws(()=>postPayload({...p,...extra}));
});
