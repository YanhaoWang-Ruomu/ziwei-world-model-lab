const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar');
const root = path.join(__dirname, '..');
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const entries = asar.listPackage(archive).map(p => p.replaceAll('\\', '/'));
const allowed = ['/app', '/app/main.cjs', '/app/window.cjs', '/app/policy.cjs', '/app/identity.cjs', '/app/updates.cjs', '/app/update-policy.cjs', '/app/offline.html', '/app/offline.css', '/app/icon.png', '/package.json'];
assert.deepEqual(entries.sort(), allowed.sort(), 'Unexpected files in application archive');
for (const item of allowed.filter(p => p.startsWith('/app/'))) {
  assert.deepEqual(asar.extractFile(archive, item.slice(1)), fs.readFileSync(path.join(root, item.slice(1))), 'Packaged file mismatch: ' + item);
}
assert.deepEqual(fs.readFileSync(path.join(root,'release/win-unpacked/resources/app-icon.ico')),fs.readFileSync(path.join(root,'build/icon.ico')));
const version = require('../package.json').version;
const filename = `GuanXingTai-Setup-${version}-x64.exe`;
const installer = path.join(root, 'release', filename);
const hash = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
fs.writeFileSync(path.join(root, 'release/SHA256SUMS.txt'), hash + '  '+filename+'\n');
console.log('PASS: only approved desktop files packaged; no private data, server rules or tests');
console.log('PASS: packaged application files match verified source');
console.log('Installer SHA256: ' + hash);
