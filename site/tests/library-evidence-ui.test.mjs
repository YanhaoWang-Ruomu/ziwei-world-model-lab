import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {initEvidenceReader,renderReadiness} from '../src/library-evidence.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('evidence reader clears pending results on account/scope changes and renders source text literally',async()=>{
  const window=new Window({url:'http://localhost/'}),prior={window:globalThis.window,document:globalThis.document};
  globalThis.window=window;globalThis.document=window.document;
  try{
    const {document}=window,el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;},btn=(text,fn,cls)=>{const n=el('button',cls,text);n.type='button';n.onclick=fn;return n;};
    const anchor=el('p');document.body.append(anchor);let finish,opened;
    const api=()=>new Promise(resolve=>{finish=resolve;});
    const reader=initEvidenceReader({api,el,btn,anchor,scope:()=>({query:'虚构测试',book:'book',level:'public'}),openSource:c=>{opened=c;}});
    const run=[...document.querySelectorAll('button')].find(b=>b.textContent==='整理原文依据');
    run.click();assert.equal(run.disabled,true);
    document.dispatchEvent(new window.Event('ziwei:session'));
    finish({citations:[{title:'old account',quote:'hidden',book_id:'x',page:1}],coverage:{}});await tick();
    assert.equal(document.querySelectorAll('.library-citation').length,0);assert.equal(run.disabled,false);
    run.click();finish({citations:[{title:'虚构标题',quote:'<img src=x onerror=alert(1)>虚构原文',book_id:'book',page:120,kind:'pdf',source:'extracted'}],coverage:{saved_pages:240,expected_pages:242,missing_pages:2}});await tick();
    assert.equal(document.querySelectorAll('.library-citation img').length,0);assert.match(document.querySelector('blockquote').textContent,/<img/);
    [...document.querySelectorAll('button')].find(b=>b.textContent==='打开原页核对').click();assert.equal(opened.page,120);
    reader.reset();assert.equal(document.querySelectorAll('.library-citation').length,0);
    const host=el('div');renderReadiness(host,{book_id:'book',expected_pages:242,saved_pages:240,text_pages:239,unconfirmed_pages:240,file_ready:false,missing_ranges:[[241,242]],empty_ranges:[[239,239]],image_missing_ranges:[],out_of_range_pages:0},{el,btn,openPage:(id,page)=>{opened={id,page};}});
    assert.match(host.textContent,/241—242/);host.querySelector('button').click();assert.equal(opened.page,239);
  }finally{window.happyDOM.abort();globalThis.window=prior.window;globalThis.document=prior.document;}
});
