import application from './worker.js';
import {cloudflareWorker} from './cloudflare-adapter.mjs';
export default cloudflareWorker(application);
