'use strict';
const { BrowserWindow, Menu, dialog, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SITE, sameSite, safeExternal, ownBlob, authRoute, allowedPermission, cleanFilename } = require('./policy.cjs');

const securePreferences = {
  nodeIntegration: false, nodeIntegrationInWorker: false, contextIsolation: true,
  sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
  webviewTag: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false
};

function createDesktop({ session, stateDir, site = SITE, hidden = false, version = '1.0.1', checkUpdates = () => {} }) {
  const stateFile = path.join(stateDir, 'window-state.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* First launch. */ }
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(area.width, Math.max(640, Number(saved.width) || 1440)),
    height: Math.min(area.height, Math.max(480, Number(saved.height) || 960)),
    minWidth: Math.min(640, area.width), minHeight: Math.min(480, area.height),
    show: false, title: '观星台', backgroundColor: '#070e19',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { ...securePreferences, session }
  });
  let authWindow = null, externalPrompt = false, offline = false, closing = false;
  const fallbackPath = path.join(__dirname, 'offline.html');

  async function openExternal(url) {
    if (!safeExternal(url) || externalPrompt || win.isDestroyed()) return;
    externalPrompt = true;
    try {
      const result = await dialog.showMessageBox(win, {
        type: 'question', title: '打开外部网页', message: '在默认浏览器中打开此网页？',
        detail: new URL(url).hostname, buttons: ['打开网页', '取消'], defaultId: 1, cancelId: 1
      });
      if (result.response === 0) await shell.openExternal(url);
    } finally { externalPrompt = false; }
  }

  function guard(contents, auth = false) {
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.on('will-navigate', (event, url) => {
      if (auth) {
        if (sameSite(url, site) && !authRoute(url, site)) return;
        if (new URL(url).protocol === 'https:') return;
        event.preventDefault(); return;
      }
      if (authRoute(url, site)) { event.preventDefault(); startAuth(url); return; }
      if (sameSite(url, site) || ownBlob(url, site)) return;
      event.preventDefault(); void openExternal(url);
    });
    contents.on('will-redirect', (event, url) => {
      if (auth && safeExternal(url) && new URL(url).protocol === 'https:') return;
      if (!sameSite(url, site)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (authRoute(url, site)) { startAuth(url); return { action: 'deny' }; }
      if (ownBlob(url, site)) return {
        action: 'allow', overrideBrowserWindowOptions: {
          title: '观星台 · 文件预览', backgroundColor: '#070e19',
          webPreferences: { ...securePreferences, session }
        }
      };
      if (sameSite(url, site)) { void win.loadURL(url).catch(showOffline); return { action: 'deny' }; }
      void openExternal(url); return { action: 'deny' };
    });
    contents.on('did-create-window', child => {
      guard(child.webContents);
      child.setMenu(null);
    });
  }

  function startAuth(url) {
    if (authWindow && !authWindow.isDestroyed()) { authWindow.focus(); return; }
    authWindow = new BrowserWindow({
      width: 560, height: 760, parent: win, title: '观星台 · 账户登录',
      autoHideMenuBar: true, webPreferences: { ...securePreferences, session }
    });
    const popup = authWindow;
    guard(popup.webContents, true);
    popup.webContents.on('page-title-updated', event => event.preventDefault());
    popup.webContents.on('did-navigate', (_event, url) => {
      if (sameSite(url, site) && !authRoute(url, site)) {
        popup.close(); void win.loadURL(site + '/#account').catch(showOffline);
      } else if (safeExternal(url)) popup.setTitle('账户登录 · ' + new URL(url).hostname);
    });
    popup.on('closed', () => { authWindow = null; });
    void popup.loadURL(url).catch(() => {
      if (!popup.isDestroyed()) void dialog.showMessageBox(popup, {
        type: 'info', message: '登录页面暂时无法连接。',
        detail: '请关闭此窗口重试，也可以在观星台账户页使用用户名和密码登录。'
      });
    });
  }

  function showOffline() {
    if (closing || win.isDestroyed() || offline) return;
    offline = true;
    void win.loadFile(fallbackPath).catch(() => {});
  }
  function navigate(hash = '') {
    offline = false;
    return win.loadURL(site + '/' + hash).catch(showOffline);
  }
  guard(win.webContents);
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowedPermission(permission, details.requestingUrl || contents.getURL(), site));
  });
  session.setPermissionCheckHandler((_contents, permission, origin) => allowedPermission(permission, origin, site));
  session.setDevicePermissionHandler(() => false);
  session.on('will-download', (event, item, contents) => {
    if (!contents || (!sameSite(contents.getURL(), site) && !ownBlob(contents.getURL(), site))) {
      event.preventDefault(); return;
    }
    item.setSaveDialogOptions({ title: '保存观星台文件', defaultPath: cleanFilename(item.getFilename()) });
    item.once('done', (_event, state) => {
      if (state === 'interrupted' && !win.isDestroyed()) void dialog.showMessageBox(win, {
        type: 'warning', message: '文件未下载完成，请重新导出或下载。'
      });
    });
  });
  win.webContents.on('did-fail-load', (_event, code, _desc, _url, mainFrame) => {
    if (mainFrame && code !== -3) showOffline();
  });
  win.webContents.on('did-navigate', (_event, url) => { if (sameSite(url, site)) offline = false; });
  win.webContents.on('page-title-updated', event => { event.preventDefault(); win.setTitle('观星台'); });
  win.webContents.on('render-process-gone', showOffline);
  win.once('ready-to-show', () => {
    if (!hidden) { if (saved.maximized !== false) win.maximize(); win.show(); }
  });
  win.on('close', () => {
    closing = true;
    const bounds = win.getNormalBounds();
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile + '.tmp', JSON.stringify({ width: bounds.width, height: bounds.height, maximized: win.isMaximized() }));
      fs.renameSync(stateFile + '.tmp', stateFile);
    } catch { /* Window dimensions must never prevent a clean exit. */ }
  });
  const help = () => dialog.showMessageBox(win, {
    type: 'info', title: '观星台 · Windows 版', message: `观星台 ${version}`,
    detail: '账户和云端命例、书籍、技法卡与网站共用。\n本机私密书库保存在此软件的独立空间，请在书库页面导出加密备份。浏览器书库可通过备份导入。\n\n本版本需要联网；网站功能随线上版本更新。启动后会自动检查安装包更新，也可以在“帮助”菜单检查更新。确认安装后会退出并覆盖安装，保留本机资料。\n\nF11 全屏；Ctrl + 加号 / 减号缩放；Ctrl + 0 恢复大小。'
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '观星台', submenu: [
      { label: '星辰与命盘', click: () => navigate('#model') },
      { label: '书籍与文章', click: () => navigate('#library') },
      { label: '技法卡片库', click: () => navigate('#cards') },
      { label: '账户与登录', click: () => navigate('#account') },
      { type: 'separator' }, { label: '退出', role: 'quit' }
    ] },
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' },
      { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }
    ] },
    { label: '查看', submenu: [
      { label: '返回上一页', accelerator: 'Alt+Left', click: () => { if (win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack(); } },
      { label: '重新连接 / 刷新', accelerator: 'CmdOrCtrl+R', click: () => offline ? navigate() : win.webContents.reload() },
      { type: 'separator' },
      { label: '放大', role: 'zoomIn' }, { label: '缩小', role: 'zoomOut' }, { label: '恢复原始大小', role: 'resetZoom' },
      { type: 'separator' }, { label: '全屏', role: 'togglefullscreen', accelerator: 'F11' }
    ] },
    { label: '帮助', submenu: [
      { label: '检查更新', click: () => checkUpdates() },
      { label: '使用说明与版本', click: help },
      { label: '在浏览器打开官网', click: () => openExternal(site) }
    ] }
  ]));
  return { win, navigate, showOffline, securePreferences };
}
module.exports = { createDesktop, securePreferences };
