'use strict';
const { app, session } = require('electron');
const path = require('node:path');
const { createDesktop } = require('./window.cjs');
const { APP_ID, applyWindowIdentity, repairShortcuts } = require('./identity.cjs');
const { createUpdater } = require('./updates.cjs');

// A stable directory keeps logins and the encrypted local vault across updates.
app.setName('观星台');
app.setPath('userData', path.join(app.getPath('appData'), 'GuanXingTai'));
app.setAppUserModelId(APP_ID);
app.on('browser-window-created', (_event, win) => applyWindowIdentity(win));
app.enableSandbox();
let desktop;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!desktop?.win || desktop.win.isDestroyed()) return;
    if (desktop.win.isMinimized()) desktop.win.restore();
    desktop.win.show(); desktop.win.focus();
  });
  app.whenReady().then(() => {
    let updater;
    repairShortcuts();
    desktop = createDesktop({ session: session.fromPartition('persist:observatory'), stateDir: app.getPath('userData'), version: app.getVersion(), checkUpdates: () => updater?.check(true) });
    updater = createUpdater(desktop.win);
    void desktop.navigate();
    if (app.isPackaged) setTimeout(() => updater.check(false), 7000).unref();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (app.isReady()) session.fromPartition('persist:observatory').flushStorageData(); });
}
