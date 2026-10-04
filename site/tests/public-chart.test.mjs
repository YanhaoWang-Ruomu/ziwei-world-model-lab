import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateResponse} from '../server/chart-route.mjs';
import {makeChart} from '../src/chart-engine.mjs';
const birth={date:'2000-08-16',time:'03:30',gender:'男',dayDivide:'forward',fixLeap:true,daylight:false};
test('public server uses the same public package as the browser, without serializing the engine',()=>{
  for(const scope of ['natal','decadal','yearly','monthly','daily','hourly']){
    const result=calculateResponse({birth,scope,stamp:{date:'2026-10-04',time:'12:00'},command:{kind:'initialize'}});
    assert.equal(result.result.provider,'public-server');
    assert.equal(result.result.chart.palaces.length,12);
    assert.deepEqual(result.result.chart,makeChart(birth).chart);
    assert.equal('engine' in result.result,false);
    assert.equal(JSON.parse(JSON.stringify(result)).scope,scope);
    assert.ok(result.nav);
  }
});
test('invalid dates and unexpected personal fields are rejected',()=>{
  assert.throws(()=>calculateResponse({birth:{...birth,name:'fictional'},scope:'natal',stamp:{date:'2026-10-04',time:'12:00'}}));
  assert.throws(()=>calculateResponse({birth:{...birth,date:'2000-02-31'},scope:'natal',stamp:{date:'2026-10-04',time:'12:00'}}));
});
