import test from 'node:test';
import assert from 'node:assert/strict';
import {VIEW_LABELS,viewAccess} from '../src/workspace-access.mjs';
test('public navigation keeps available pages open and management entries locked',()=>{
  for(const key of ['model','world','community','library','account'])assert.equal(viewAccess({role:'public'},key).allowed,true);
  for(const key of ['review','rules','materials','private','members','lab','history','cards'])assert.equal(viewAccess({role:'public'},key).allowed,false);
  assert.equal(viewAccess({role:'public'},'constructor').allowed,false);
});
test('granted special and core levels unlock only their authorized surfaces',()=>{
  assert.equal(viewAccess({role:'special'},'cards').allowed,true);
  assert.equal(viewAccess({role:'special'},'rules').allowed,false);
  const core={role:'core',core:true};
  for(const key of Object.keys(VIEW_LABELS).filter(k=>k!=='members'))assert.equal(viewAccess(core,key).allowed,true,key);
  assert.equal(viewAccess(core,'members').allowed,false);
  assert.equal(viewAccess({...core,founder:true},'members').allowed,true);
});
test('switching down from core relocks management; a maximum grant is not an active role',()=>{
  for(const key of ['review','rules','materials','lab','history','members']){
    assert.equal(viewAccess({role:'public',maxRole:'core',core:true,founder:true},key).allowed,false);
    assert.equal(viewAccess({role:'special',maxRole:'core',core:true,founder:true},key).allowed,false);
  }
});
