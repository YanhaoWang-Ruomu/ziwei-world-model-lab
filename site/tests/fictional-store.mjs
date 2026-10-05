// In-memory, generated-schema fixtures only. Never opens a preview/user store.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function fictionalStore(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const entry of journal.entries){if(!/^\d{4}_[a-z0-9_]+$/.test(entry.tag))throw Error('Unexpected schema filename');sql.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));}
  const db={prepare(statement){let args=[];const query={bind(...values){args=values;return query;},_execute(){const results=sql.prepare(statement).all(...args).map(r=>({...r}));return {results,meta:{changes:Number(sql.prepare('SELECT changes() AS n').get().n)}};},async all(){return query._execute();},async first(){return query._execute().results[0]||null;},async run(){return query._execute();}};return query;},async batch(statements){sql.exec('BEGIN');try{const values=statements.map(s=>s._execute());sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}},close(){sql.close();}};
  const objects=new Map(),head=key=>{const row=objects.get(key);return row?{key,size:row.bytes.length,etag:row.etag,httpMetadata:row.httpMetadata}:null;};
  const BUCKET={objects,async head(key){return head(key);},async get(key,options={}){const info=head(key);if(!info)return null;if(options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==info.etag)return info;const row=objects.get(key),blob=new Blob([row.bytes]);return {...info,body:blob.stream(),text:()=>blob.text(),json:async()=>JSON.parse(await blob.text())};},async put(key,input,options={}){if(options.onlyIf?.get?.('If-None-Match')==='*'&&objects.has(key))return null;const bytes=new Uint8Array(await new Response(input).arrayBuffer()),etag=createHash('sha256').update(bytes).digest('hex');objects.set(key,{bytes,etag,httpMetadata:options.httpMetadata||{}});return head(key);},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);},async list({prefix='',limit=1000}={}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(head)};}};
  return {db,DB:db,BUCKET,LOCAL_PREVIEW:'1',PREVIEW_PURPOSE:'fictional-persistence'};
}
export function fixtureRequest(path,method='GET',data,cookie=''){return new Request('https://fictional.invalid'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://fictional.invalid',Cookie:cookie,'cf-connecting-ip':'192.0.2.1'},...(data===undefined?{}:{body:JSON.stringify(data)})});}
