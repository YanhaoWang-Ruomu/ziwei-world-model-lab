'use strict';
// This executable test uses an isolated profile and a fictional local server only.
const { app, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createDesktop } = process.env.GUANXINGTAI_TEST_PACKAGED === '1'
  ? require('../release/win-unpacked/resources/app.asar/app/window.cjs')
  : require('../app/window.cjs');
const reopenPath = process.argv[2];
const allowedRoot = path.resolve(__dirname, '..', '.test-data');
if (reopenPath && !path.resolve(reopenPath).startsWith(allowedRoot + path.sep)) throw Error('Only isolated test profiles are allowed');
const testRoot = reopenPath || path.join(allowedRoot, 'smoke-' + Date.now());
fs.mkdirSync(testRoot, { recursive: true });
app.setPath('userData', testRoot);
app.enableSandbox();
const vaultSource = path.join(__dirname, '../../site/src/private-vault.mjs');
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>虚构测试</title><style>body{color:#e5d2a5;background:#07111e;font:20px sans-serif;padding:32px}</style><h1>观星台 · 虚构桌面测试</h1><p>仅用于验证窗口、保存和导出。</p><script type="module">import {createVault} from '/vault.mjs';window.vault=createVault();</script></html>`;
const server = http.createServer((req, res) => {
  if (['/search-ranking.mjs','/text-recognition.mjs'].includes(req.url)) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(__dirname, '../../site/src',req.url.slice(1)))); }
  else if (req.url === '/vault.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(vaultSource)); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); }
});
let desk;
async function run() {
  await app.whenReady();
  const port = reopenPath ? JSON.parse(fs.readFileSync(path.join(testRoot, 'result.json'))).port : 0;
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const site = 'http://127.0.0.1:' + server.address().port;
  const ses = session.fromPartition('persist:fictional');
  desk = createDesktop({ session: ses, stateDir: testRoot, site, hidden: true });
  const wc = desk.win.webContents;
  await desk.navigate();
  assert.equal(await wc.executeJavaScript('typeof require'), 'undefined');
  assert.equal(wc.getLastWebPreferences().sandbox, true);
  assert.equal(wc.getLastWebPreferences().contextIsolation, true);
  assert.equal(wc.getLastWebPreferences().nodeIntegration, false);
  console.log('PASS: sandbox, isolation, no renderer Node access');
  if (reopenPath) {
    assert.equal(await wc.executeJavaScript(`localStorage.getItem('fictional-setting')`), 'retained');
    assert.equal(await wc.executeJavaScript(`(async()=>{await vault.open('fictional-desktop-user','fictional-password-123');return (await vault.list())[0].title;})()`), '虚构资料');
    assert.equal((await ses.cookies.get({name:'fictional-session'}))[0].value, 'fixture-only');
    console.log('PASS: encrypted vault, settings and persistent login survived full process restart');
    desk.win.close(); server.close(); app.exit(0); return;
  }
  await wc.executeJavaScript(`(async()=>{await vault.open('fictional-desktop-user','fictional-password-123');await vault.put({id:'sample',kind:'book',title:'虚构资料',text:'fictional only'});localStorage.setItem('fictional-setting','retained');})()`);
  await ses.cookies.set({ url: site, name: 'fictional-session', value: 'fixture-only', expirationDate: Date.now()/1000 + 3600 });
  ses.flushStorageData(); await ses.cookies.flushStore();
  const loaded = once(wc, 'did-finish-load'); wc.reload(); await loaded;
  assert.equal(await wc.executeJavaScript(`localStorage.getItem('fictional-setting')`), 'retained');
  assert.equal(await wc.executeJavaScript(`(async()=>{await vault.open('fictional-desktop-user','fictional-password-123');return (await vault.list())[0].title;})()`), '虚构资料');
  assert.equal((await ses.cookies.get({ name: 'fictional-session' }))[0].value, 'fixture-only');
  console.log('PASS: fictional encrypted vault, settings and session survive reload');
  const downloadPath = path.join(testRoot, 'fictional-export.json');
  const downloaded = new Promise((resolve, reject) => ses.once('will-download', (_event, item) => {
    item.setSavePath(downloadPath); item.once('done', (_e, state) => state === 'completed' ? resolve() : reject(Error(state)));
  }));
  await wc.executeJavaScript(`(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['{"fictional":true}'],{type:'application/json'}));a.download='fictional-export.json';a.click();})()`);
  await downloaded; assert.equal(JSON.parse(fs.readFileSync(downloadPath)).fictional, true);
  console.log('PASS: blob export downloads through the desktop session');
  for (const [width, height] of [[1440,900],[800,600]]) {
    desk.win.setSize(width, height);
    assert.ok(await wc.executeJavaScript('innerWidth > 0 && innerHeight > 0'));
  }
  desk.win.setFullScreen(true); desk.win.setFullScreen(false);
  const fallbackLoaded = once(wc, 'did-finish-load'); desk.showOffline(); await fallbackLoaded;
  assert.ok(await wc.executeJavaScript(`document.body.textContent.includes('静候星河重连')`));
  fs.writeFileSync(path.join(testRoot, 'offline.png'), (await wc.capturePage()).toPNG());
  await desk.navigate(); assert.equal(new URL(wc.getURL()).origin, site);
  console.log('PASS: window sizes, fullscreen, offline fallback and reconnect');
  desk.win.close(); assert.ok(fs.existsSync(path.join(testRoot, 'window-state.json')));
  console.log('PASS: window state saved; all tests used fictional local data');
  fs.writeFileSync(path.join(testRoot, 'result.json'), JSON.stringify({passed:true,profile:testRoot,port:server.address().port}));
  server.close(); app.exit(0);
}
setTimeout(() => { console.error('FAIL: desktop test timed out'); app.exit(1); }, 45000).unref();
run().catch(error => { console.error(error.stack); server.close(); app.exit(1); });
