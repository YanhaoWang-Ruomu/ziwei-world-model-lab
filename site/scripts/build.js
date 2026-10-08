const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src');
const destination = path.join(root, 'dist');
async function build() {
  const {approvedAsset}=await import(require('node:url').pathToFileURL(path.join(root,'server','downloads-core.mjs')).href);
  const installers=JSON.parse(fs.readFileSync(path.join(source,'downloads-manifest.json'),'utf8'));
  if(Object.values(installers).some(entry=>!approvedAsset(entry)))throw Error('Publish and verify the installer assets before building the website.');
  // Resolve and verify the sole disposable output before replacing the old static build.
  if (path.dirname(destination) !== root || path.basename(destination) !== 'dist' || (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink())) throw Error('Unsafe build destination');
  // Keep the output directory itself: Windows preview watchers hold a handle to it.
  fs.mkdirSync(destination, {recursive:true});
  const client = path.join(destination, 'client');
  fs.mkdirSync(client, { recursive: true });
  // Preview fixtures and separately hosted installers are excluded from publication.
  for (const name of ['design-preview', 'style-preview', 'release-assets']) {
    const preview = path.resolve(client, name);
    if (path.dirname(preview) !== client || (fs.existsSync(preview) && fs.lstatSync(preview).isSymbolicLink())) throw Error('Unsafe preview output');
    fs.rmSync(preview, {recursive:true,force:true});
  }
  // Book data and images are never public static assets: every read goes through authorization.
  for (const name of fs.readdirSync(source)) {
    if (!['data','book-pages','release-assets'].includes(name)) fs.cpSync(path.join(source,name),path.join(client,name),{recursive:true});
  }
  const vendor=path.join(client,'vendor');fs.mkdirSync(vendor,{recursive:true});
  function copy(module,relative,target){const base=fs.realpathSync(path.join(root,'node_modules',module));fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(base,relative),target,{recursive:true});}
  copy('opencc-js','dist/umd/full.js',path.join(vendor,'opencc.js'));
  copy('opencc-js','LICENSE',path.join(vendor,'opencc-LICENSE'));
  for(const name of ['pdf.mjs','pdf.worker.mjs'])copy('pdfjs-dist',`build/${name}`,path.join(vendor,'pdf',name));
  for(const name of ['cmaps','standard_fonts','wasm','LICENSE'])copy('pdfjs-dist',name,path.join(vendor,'pdf',name));
  for(const name of ['tesseract.min.js','worker.min.js','tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt'])copy('tesseract.js',`dist/${name}`,path.join(vendor,'tesseract',name));
  const tessRoot=path.dirname(require.resolve('tesseract.js/package.json'));
  const core=path.dirname(require.resolve('tesseract.js-core/package.json',{paths:[tessRoot]}));
  for(const name of fs.readdirSync(core).filter(n=>/lstm\.wasm(?:\.js)?$/.test(n)||/^LICENSE/.test(n)))fs.copyFileSync(path.join(core,name),path.join(vendor,'tesseract',name));
  const models=path.join(root,'vendor-models');
  fs.cpSync(models,path.join(vendor,'tessdata'),{recursive:true});
  const browserBuild=await require('esbuild').build({entryPoints:[path.join(source,'cosmos.js')],outfile:path.join(client,'cosmos.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,metafile:true});
  await require('esbuild').build({entryPoints:[path.join(source,'semantic-worker.mjs')],outfile:path.join(client,'semantic-worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
  const transformerRoot=fs.realpathSync(path.join(root,'node_modules','@huggingface','transformers'));
  const onnxRoot=path.resolve(path.dirname(require.resolve('onnxruntime-web',{paths:[transformerRoot]})),'..');
  const onnxVendor=path.join(vendor,'onnx');fs.mkdirSync(onnxVendor,{recursive:true});
  // Transformers 3.8.1's browser bundle imports the JSEP runtime even for WASM-only inference.
  // Ship that exact pair; the unused second runtime adds 10 MiB to every deployment.
  const onnxAssets=['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'];
  for(const name of fs.readdirSync(onnxVendor).filter(n=>/^ort-wasm.*\.(?:mjs|wasm)$/.test(n)&&!onnxAssets.includes(n)))fs.unlinkSync(path.join(onnxVendor,name));
  for(const name of onnxAssets)fs.copyFileSync(path.join(onnxRoot,'dist',name),path.join(onnxVendor,name));
  fs.copyFileSync(path.join(transformerRoot,'LICENSE'),path.join(vendor,'transformers-LICENSE'));
  fs.copyFileSync(path.join(root,'licenses','onnxruntime-LICENSE'),path.join(onnxVendor,'LICENSE'));
  if(Object.keys(browserBuild.metafile.inputs).some(file=>path.resolve(root,file).startsWith(path.join(root,'server')+path.sep)))throw Error('Server-only chart logic entered the public browser bundle.');
  copy('iztro','LICENSE',path.join(vendor,'iztro-LICENSE'));
  // This package distributes its MIT notice in the source header.
  const astronomySource=fs.readFileSync(require.resolve('astronomy-engine'),'utf8');
  fs.writeFileSync(path.join(vendor,'astronomy-engine-LICENSE'),astronomySource.slice(0,astronomySource.indexOf('*/')+2));
  const iztroBase=path.dirname(require.resolve('iztro/package.json'));
  for(const module of ['dayjs','lunar-lite','lunar-typescript','i18next']){
    let base=path.dirname(require.resolve(module,{paths:[iztroBase]}));
    while(!fs.existsSync(path.join(base,'package.json'))&&path.dirname(base)!==base)base=path.dirname(base);
    const license=fs.readdirSync(base).find(name=>/^license(?:\.md|\.txt)?$/i.test(name));
    if(license)fs.copyFileSync(path.join(base,license),path.join(vendor,module+'-LICENSE'));
  }
  fs.mkdirSync(path.join(destination,'.openai'),{recursive:true});
  // Deployment identifiers are configured by each installation; none are exported.
  fs.cpSync(path.join(root,'drizzle'),path.join(destination,'.openai','drizzle'),{recursive:true});
  await require('esbuild').build({entryPoints:[path.join(root,'server','worker.js')],outfile:path.join(destination,'server','index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
  console.log('Built authorized library Worker and browser assets; book contents excluded from static files.');
}
build().catch(e=>{console.error(e.message);process.exitCode=1;});
