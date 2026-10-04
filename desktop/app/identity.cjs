'use strict';
const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const APP_ID = 'site.guanxingtai.desktop';
function applyWindowIdentity(win) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const icon = path.join(process.resourcesPath, 'app-icon.ico');
  win.setIcon(icon);
  win.setAppDetails({ appId: APP_ID, appIconPath: icon, appIconIndex: 0,
    relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: '观星台' });
}
function repairShortcuts() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const locations = [path.join(app.getPath('desktop'), '观星台.lnk'),
    path.join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs/观星台.lnk'),
    path.join(app.getPath('appData'), 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar/观星台.lnk')];
  for (const shortcut of locations) {
    try {
      if (!fs.existsSync(shortcut)) continue;
      const old = shell.readShortcutLink(shortcut);
      if (path.basename(old.target).toLowerCase() !== 'guanxingtai.exe') continue;
      shell.writeShortcutLink(shortcut, 'update', { target: process.execPath, cwd: path.dirname(process.execPath),
        icon: path.join(process.resourcesPath, 'app-icon.ico'), iconIndex: 0, appUserModelId: APP_ID });
    } catch { /* A locked shortcut must not prevent startup. */ }
  }
}
module.exports = { APP_ID, applyWindowIdentity, repairShortcuts };
