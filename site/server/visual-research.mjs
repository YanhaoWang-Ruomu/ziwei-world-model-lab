import {HttpError,digest} from './security.js';
import {pageText} from '../src/evidence-ranking.mjs';
export async function visualResearchRoute({path,method,url,viewer,db,env}){
  if(!['/api/ai/visual/page','/api/ai/visual/image'].includes(path))return null;
  if(method!=='GET')throw new HttpError(405,'请从书页比较入口读取。');
  if(!viewer.id)throw new HttpError(401,'请先登录个人账户。');
  const id=url.searchParams.get('book'),page=Number(url.searchParams.get('page'));
  if(!/^[-\w]{1,100}$/.test(id||'')||!Number.isInteger(page)||page<1)throw new HttpError(400,'书页位置无效。');
  const load=()=>db.prepare("SELECT p.*,b.title,b.source_hash FROM pages p JOIN books b ON b.id=p.book_id WHERE p.book_id=? AND p.page=? AND b.level='public' AND b.status<>'deleting'").bind(id,page).first();
  const row=await load();if(!row)throw new HttpError(403,'该页不存在或不再公开，不能用于本次试验。');
  const text=pageText(row).text;
  const version=await digest(JSON.stringify([row.source_hash,row.correction_revision||0,text,Boolean(row.image_ready)]));
  if(path.endsWith('/page'))return {bookId:id,page,title:row.title,text:text.slice(0,24000),textTruncated:text.length>24000,version,imageReady:Boolean(row.image_ready)};
  if(url.searchParams.get('version')!==version)throw new HttpError(409,'原页已变化，请重新读取。');
  if(!row.image_ready)throw new HttpError(404,'此页影像尚未保存。');
  const object=await env.BUCKET.get(`books/${id}/page-${page}.jpg`);
  if(!object)throw new HttpError(404,'此页影像尚未保存。');
  if(object.size>8*1024*1024){await object.body?.cancel();throw new HttpError(413,'原页影像过大，请缩小后再进行本机比较。');}
  const latest=await load();if(!latest||!latest.image_ready||latest.source_hash!==row.source_hash||(latest.correction_revision||0)!==(row.correction_revision||0)||pageText(latest).text!==text){await object.body?.cancel();throw new HttpError(409,'材料权限或版本已变化。');}
  return new Response(object.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
