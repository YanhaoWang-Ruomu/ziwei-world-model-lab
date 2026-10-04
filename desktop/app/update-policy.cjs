'use strict';
const { SITE } = require('./policy.cjs');
const versionParts = version => {
  if (typeof version !== 'string' || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)) throw Error('Invalid version');
  return version.split('.').map(Number);
};
function newer(next, current) {
  const a = versionParts(next), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function validateRelease(entry, current) {
  if (!entry || !newer(entry.version, current)) return null;
  const filename = `GuanXingTai-Setup-${entry.version}-x64.exe`;
  if (entry.filename !== filename || entry.url !== '/downloads/' + filename ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 350 * 1024 * 1024) throw Error('Invalid release');
  return { ...entry, address: SITE + entry.url };
}
module.exports = { newer, validateRelease };
