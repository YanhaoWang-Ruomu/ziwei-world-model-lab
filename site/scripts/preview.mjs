import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
// This is the sole user preview store. Integration tests must use another port/store.
const persist=path.join(root,'.local-data/live');
const migration=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local','--persist-to',persist,'--config','wrangler.jsonc'],{cwd:root,stdio:'inherit',windowsHide:true});
if(migration.status!==0)process.exit(migration.status||1);
const server=spawn(process.execPath,[cli,'dev','--local','--ip','127.0.0.1','--port',String(process.env.PORT||'8879'),'--persist-to',persist,'--config','wrangler.jsonc'],{cwd:root,stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
server.on('exit',code=>process.exit(code||0));
