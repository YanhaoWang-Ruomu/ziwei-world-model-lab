import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {highlightRanges,imageMatchRegions} from '../src/search-highlights.mjs';
import {ocrRegions} from '../src/text-recognition.mjs';
const require=createRequire(import.meta.url),{normalize}=require('../src/library-search.js');
test('simplified and traditional matches preserve original offsets including punctuation and Unicode',()=>{
  const source='𠮷，虛構青松\n觀察文章。青松观察文章';
  const ranges=highlightRanges(source,'青松观察文章',normalize);
  assert.deepEqual(ranges.map(r=>source.slice(r.start,r.end)),['青松\n觀察文章','青松观察文章']);
  assert.ok(ranges.every(r=>r.kind==='exact'));
  assert.equal(source,'𠮷，虛構青松\n觀察文章。青松观察文章');
  assert.deepEqual(highlightRanges('ＡＢＣ 虚构','abc',normalize).map(r=>r.end-r.start),[3]);
  assert.deepEqual(highlightRanges('𠮷木','𠮷',normalize),[{start:0,end:2,kind:'exact'}]);
});
test('near matches mark a contiguous passage and never claim an exact quotation',()=>{
  const source='白云飘过。青松有三分支。山石在远处。';
  const ranges=highlightRanges(source,'青松有三个分支',normalize);
  assert.equal(ranges.length,1);assert.equal(source.slice(ranges[0].start,ranges[0].end),'青松有三分支');assert.equal(ranges[0].kind,'near');
  assert.deepEqual(highlightRanges(source,'青松有三个分支',normalize,{similar:false}),[]);
  assert.deepEqual(highlightRanges(source,'海洋气象记录',normalize),[]);
  assert.deepEqual(highlightRanges(source,'！！！',normalize),[]);
  assert.deepEqual(highlightRanges(source,'青杉',normalize),[]);
});
test('multiple terms, repeated hits and merged overlapping terms',()=>{
  const text='白云与青松，白云与青松。';
  assert.equal(highlightRanges(text,'白云 青松',normalize).length,4);
  assert.equal(highlightRanges('青松树下','青松 青松树',normalize).length,1);
  assert.equal(highlightRanges('青松 '.repeat(800),'青松',normalize).length,500);
});
test('vertical OCR regions retain right-to-left columns and correct pixel coordinates',()=>{
  const word=(text,x,y)=>({text,bbox:{x0:x,y0:y,x1:x+30,y1:y+30}});
  const data={blocks:[{paragraphs:[{lines:[{words:[word('山',20,20),word('松',100,70),word('青',100,20),word('石',20,70)]}]}]}]};
  const regions=ocrRegions(data,'vertical',200,160);
  assert.equal(regions.map(r=>r.text).join(''),'青松山石');
  const matches=imageMatchRegions(regions,'青松',normalize);
  assert.equal(matches.count,1);assert.deepEqual(matches.rectangles.map(r=>[r.x,r.y,r.width,r.height]),[[100,20,30,30],[100,70,30,30]]);
  assert.equal(imageMatchRegions(regions,'流水',normalize).count,0);
});
test('symbol boxes are used when present; invalid/out-of-image regions are excluded',()=>{
  const data={blocks:[{paragraphs:[{lines:[{words:[{text:'觀察',bbox:{x0:10,y0:20,x1:60,y1:50},symbols:[{text:'觀',bbox:{x0:10,y0:20,x1:30,y1:50}},{text:'察',bbox:{x0:35,y0:20,x1:60,y1:50}}]},{text:'坏',bbox:{x0:NaN,y0:2,x1:4,y1:7}},{text:'外',bbox:{x0:250,y0:250,x1:270,y1:270}}]}]}]}]};
  const regions=ocrRegions(data,'horizontal',200,100);assert.equal(regions.length,2);
  assert.deepEqual(imageMatchRegions(regions,'察',normalize).rectangles.map(r=>r.x),[35]);
});
test('zero-width vertical symbols fall back to the measured word region',()=>{
  const data={blocks:[{paragraphs:[{lines:[{words:[{text:'青松',bbox:{x0:60,y0:20,x1:90,y1:100},symbols:[{text:'青',bbox:{x0:0,y0:10,x1:0,y1:20}},{text:'松',bbox:{x0:0,y0:10,x1:0,y1:20}}]}]}]}]}]};
  const result=ocrRegions(data,'vertical',200,200);assert.deepEqual(result,[{text:'青松',x:60,y:20,width:30,height:80}]);
  assert.equal(imageMatchRegions(result,'青松',normalize).count,1);
});
