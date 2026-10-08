import manifest from '../src/downloads-manifest.json' with {type:'json'};
import {serveReleaseDownload} from './downloads-core.mjs';
export {requestedRange} from './downloads-core.mjs';
export function downloadRoute(request){return serveReleaseDownload(request,manifest);}
