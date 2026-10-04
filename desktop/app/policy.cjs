'use strict';
const SITE = 'https://ziwei-world-model-lab.vocal-chime-3672.chatgpt.site';
function parse(value) { try { return new URL(value); } catch { return null; } }
function sameSite(value, site = SITE) {
  const url = parse(value);
  return Boolean(url && url.origin === new URL(site).origin && !url.username && !url.password);
}
function safeExternal(value) {
  const url = parse(value);
  return Boolean(url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password);
}
function ownBlob(value, site = SITE) {
  return value.startsWith('blob:') && sameSite(value.slice(5), site);
}
function authRoute(value, site = SITE) {
  return sameSite(value, site) && ['/signin-with-chatgpt', '/signout-with-chatgpt'].includes(new URL(value).pathname);
}
function allowedPermission(permission, origin, site = SITE) {
  return permission === 'fullscreen' && sameSite(origin, site);
}
function cleanFilename(value) {
  const name = String(value || '观星台导出文件').split(/[\\/]/).pop()
    .replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 160);
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? '观星台导出文件' : name;
}
module.exports = { SITE, sameSite, safeExternal, ownBlob, authRoute, allowedPermission, cleanFilename };
