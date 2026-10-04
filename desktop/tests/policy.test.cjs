const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../app/policy.cjs');
test('navigation accepts only the exact site origin', () => {
  assert.ok(p.sameSite(p.SITE + '/#account'));
  for (const url of [p.SITE + '.evil.test/', 'http://' + new URL(p.SITE).host, 'https://evil.test/?' + p.SITE, 'file:///C:/Windows/system.ini', 'javascript:alert(1)', 'invalid']) assert.equal(p.sameSite(url), false);
});
test('external links never invoke local or executable protocols', () => {
  for (const url of ['file:///a', 'cmd:calc', 'powershell:test', 'javascript:alert(1)', 'https://name:secret@example.com', 'data:text/html,test']) assert.equal(p.safeExternal(url), false);
  assert.ok(p.safeExternal('https://example.com/book'));
});
test('blob previews and authentication stay associated with the site', () => {
  assert.ok(p.ownBlob('blob:' + p.SITE + '/fictional'));
  assert.equal(p.ownBlob('blob:https://other.test/fictional'), false);
  assert.ok(p.authRoute(p.SITE + '/signin-with-chatgpt?return_to=%2F'));
  assert.equal(p.authRoute('https://other.test/signin-with-chatgpt'), false);
});
test('hardware and clipboard permissions are not silently granted', () => {
  for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read', 'midi', 'pointerLock']) assert.equal(p.allowedPermission(permission, p.SITE), false);
  assert.ok(p.allowedPermission('fullscreen', p.SITE));
  assert.equal(p.allowedPermission('fullscreen', 'https://other.test'), false);
});
test('download filename cannot select a path or Windows device', () => {
  assert.equal(p.cleanFilename('../../fictional.json'), 'fictional.json');
  assert.equal(p.cleanFilename('C:\\fake\\示例.json'), '示例.json');
  assert.equal(p.cleanFilename('CON.txt'), '观星台导出文件');
  assert.equal(p.cleanFilename('a:b?.json'), 'a_b_.json');
});
