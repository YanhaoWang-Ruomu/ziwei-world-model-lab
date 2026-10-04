'use strict';
const { app, dialog } = require('electron');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { SITE } = require('./policy.cjs');
const { validateRelease } = require('./update-policy.cjs');

// No account cookies or renderer access are needed for the public release feed.
function fetchBytes(url, limit, consume) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'Cache-Control': 'no-cache' }, timeout: 20000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(Error('Download unavailable')); return; }
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > limit) { response.destroy(Error('Download too large')); return; }
        try { consume(chunk, size); } catch (error) { response.destroy(error); }
      });
      response.on('end', () => resolve(size));
      response.on('error', reject);
      response.on('aborted', () => reject(Error('Download interrupted')));
    });
    request.on('timeout', () => request.destroy(Error('Download timeout')));
    request.on('error', reject);
  });
}
function createUpdater(win) {
  let busy = false;
  async function check(manual = false) {
    if (busy || win.isDestroyed()) return;
    busy = true;
    let file, descriptor, interactive = manual;
    try {
      const parts = [];
      await fetchBytes(SITE + '/downloads-manifest.json?t=' + Date.now(), 65536, chunk => parts.push(chunk));
      const release = validateRelease(JSON.parse(Buffer.concat(parts).toString('utf8')).windows, app.getVersion());
      if (!release) {
        if (manual) await dialog.showMessageBox(win, { message: '已是最新版本', detail: `观星台 ${app.getVersion()}`, buttons: ['确定'] });
        return;
      }
      const answer = await dialog.showMessageBox(win, { type: 'info', title: '观星台更新', message: `发现新版本 ${release.version}`,
        detail: `${release.notes || '改进功能与使用体验。'}\n\n安装包 ${(release.size / 1048576).toFixed(1)} MB。下载期间可以继续使用；安装前会再次询问。`, buttons: ['下载更新', '稍后'], defaultId: 0, cancelId: 1 });
      if (answer.response !== 0 || win.isDestroyed()) return;
      interactive = true;
      const folder = path.join(app.getPath('userData'), 'updates');
      fs.mkdirSync(folder, { recursive: true });
      file = path.join(folder, release.filename + '.part');
      descriptor = fs.openSync(file, 'w');
      const hash = crypto.createHash('sha256');
      const size = await fetchBytes(release.address, release.size, (chunk, total) => {
        fs.writeSync(descriptor, chunk); hash.update(chunk);
        if (!win.isDestroyed()) win.setProgressBar(total / release.size);
      });
      fs.closeSync(descriptor); descriptor = undefined;
      if (size !== release.size || hash.digest('hex') !== release.sha256) throw Error('Download integrity failure');
      const installer = path.join(folder, release.filename);
      fs.renameSync(file, installer); file = undefined;
      if (win.isDestroyed()) return;
      win.setProgressBar(-1);
      const install = await dialog.showMessageBox(win, { title: '更新已准备好', message: '现在安装并重新打开观星台？', detail: '请先保存当前未提交的内容。软件会退出并覆盖安装，账户与本机资料会保留。', buttons: ['立即安装', '稍后'], defaultId: 1, cancelId: 1 });
      if (install.response !== 0) return;
      await win.webContents.session.cookies.flushStore();
      win.webContents.session.flushStorageData();
      // NSIS requires /D to be last and unquoted; no shell interprets the path.
      const child = spawn(installer, ['/S', '--updated', '--force-run', '/D=' + path.dirname(process.execPath)], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref(); app.quit();
    } catch {
      if (!win.isDestroyed() && interactive) await dialog.showMessageBox(win, { type: 'warning', message: '暂时无法完成更新', detail: '请检查网络后，从“帮助 → 检查更新”重试。未通过完整校验的安装包不会运行。', buttons: ['确定'] });
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (file) { try { fs.unlinkSync(file); } catch {} }
      if (!win.isDestroyed()) win.setProgressBar(-1);
      busy = false;
    }
  }
  return { check };
}
module.exports = { createUpdater };
