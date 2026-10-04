// Fictional integration UI only. Imported solely by the local dev entrypoint.
export const worldHarness=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/library.css"><link rel="stylesheet" href="/workspace.css"><link rel="stylesheet" href="/gilded-theme.css"><link rel="stylesheet" href="/research-community.css"></head><body>
<aside class="workspace-sidebar"><a class="workspace-brand" href="#world">紫微 · 研究</a><nav class="workspace-nav"><a href="#world" data-nav="world">世界状态与复盘</a><a href="#community" data-nav="community">社区讨论</a></nav></aside>
<header class="site-header"><div class="workspace-breadcrumb"><strong id="workspace-location"></strong></div></header><main id="top"><section id="world" class="workspace-panel" data-view="world"></section><section id="community" class="workspace-panel" data-view="community" hidden></section></main>
<script type="module">
import {initResearchCommunity} from '/research-community.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const btn=(t,fn,cls='book-secondary')=>{const n=el('button',cls,t);n.type='button';n.onclick=fn;return n;};
const api=async(p,o={})=>{const r=await fetch(p,{...o,headers:{...(typeof o.body==='string'?{'Content-Type':'application/json'}:{}),...o.headers},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
initResearchCommunity({api,el,btn});
function nav(){const view=location.hash.slice(1)||'world';document.querySelectorAll('[data-view]').forEach(n=>n.hidden=n.dataset.view!==view);document.querySelectorAll('[data-nav]').forEach(n=>n.setAttribute('aria-current',n.dataset.nav===view?'page':'false'));document.querySelector('#workspace-location').textContent=view==='world'?'世界状态与复盘':'社区讨论';document.dispatchEvent(new CustomEvent('ziwei:view',{detail:view}));}
window.addEventListener('hashchange',nav);nav();document.dispatchEvent(new CustomEvent('ziwei:session',{detail:await api('/api/session')}));window.uiReady=true;
</script></body></html>`;
