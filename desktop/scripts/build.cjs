const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const env = { ...process.env, ELECTRON_BUILDER_CACHE: path.join(root, '.cache', 'builder'), CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), '--win', 'nsis', '--x64', '--publish', 'never'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
