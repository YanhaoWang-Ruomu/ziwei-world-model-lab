import test from 'node:test';
import assert from 'node:assert/strict';
import {initWorkspace} from '../src/workspace.js';
import {VIEW_LABELS} from '../src/workspace-access.mjs';
class Element extends EventTarget{
  constructor(dataset={}){super();this.dataset=dataset;this.attributes=new Map();this.hidden=true;this.classList={toggle(){}};}
  setAttribute(k,v){this.attributes.set(k,String(v));}
  getAttribute(k){return this.attributes.get(k)??null;}
  removeAttribute(k){this.attributes.delete(k);}
  set href(v){this.setAttribute('href',v);}get href(){return this.getAttribute('href');}
}
test('real workspace navigation keeps locked entries visible, blocks clicks and direct hashes, and refreshes on role changes',()=>{
  const original=Object.fromEntries(['window','document','location','setInterval'].map(k=>[k,globalThis[k]]));
  const nav=Object.keys(VIEW_LABELS).map(key=>new Element({nav:key}));
  const panels=Object.keys(VIEW_LABELS).map(key=>new Element({view:key}));
  const elements=new Map(),document=new EventTarget();document.body={dataset:{}};
  document.querySelector=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
  document.querySelectorAll=selector=>selector==='[data-nav]'?nav:selector==='[data-view]'?panels:[];
  try{
    globalThis.document=document;globalThis.window=new EventTarget();globalThis.location={hash:'#community'};globalThis.setInterval=()=>0;
    const workspace=initWorkspace({api:()=>{throw Error('Navigation must not fetch protected contents');},onSession:()=>{}});
    workspace.setViewer({role:'public'});
    const review=nav.find(n=>n.dataset.nav==='review');
    assert.equal(review.hidden,false);assert.equal(review.getAttribute('aria-disabled'),'true');assert.equal(review.href,null);
    assert.equal(review.dispatchEvent(new Event('click',{cancelable:true})),false);
    location.hash='#review';workspace.navigate();assert.equal(workspace.current,'model');
    assert.equal(panels.find(p=>p.dataset.view==='review').hidden,true);
    workspace.setViewer({role:'core',core:true,authenticated:true});
    assert.equal(review.href,'#review');assert.equal(review.getAttribute('aria-disabled'),'false');assert.equal(workspace.current,'review');
    assert.equal(nav.find(n=>n.dataset.nav==='members').href,null);
    workspace.setViewer({role:'public',maxRole:'core',authenticated:true});
    assert.equal(review.href,null);assert.equal(workspace.current,'model');assert.equal(review.hidden,false);
    assert.ok(nav.every(n=>!n.hidden));
  }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
