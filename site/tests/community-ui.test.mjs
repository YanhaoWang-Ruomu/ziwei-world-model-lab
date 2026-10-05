import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {initCommunity} from '../src/community.js';
import {communityEditor} from '../src/community-editor.js';

test('comment login returns to the same post; rich replies and review live in their own sections',async()=>{
  const win=new Window({url:'http://localhost/#community',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  for(const key of ['document','location','sessionStorage','FormData','Event','CustomEvent','Option'])Object.defineProperty(globalThis,key,{value:win[key],configurable:true,writable:true});
  // Happy DOM exposes the option element constructor rather than the browser convenience constructor.
  if(!globalThis.Option)globalThis.Option=function(text,value){const n=win.document.createElement('option');n.text=text;n.value=value;return n;};
  const doc=win.document;doc.body.innerHTML='<section id="community"></section><section id="review"><section id="community-review"></section></section>';
  const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const btn=(text,fn,cls='book-secondary')=>{const n=el('button',cls,text);n.type='button';n.addEventListener('click',fn);return n;};
  const pid='00000000-0000-4000-8000-000000000001',cid='00000000-0000-4000-8000-000000000002',fid='00000000-0000-4000-8000-000000000003';
  const p={id:pid,title:'虚构讨论',body:'**虚构粗体**\n\n<script>不会执行</script>',format:'markdown',tags:[],attachments:[],kind:'case',status:'published',revision:2};
  const replies=[],calls=[];let authenticated=false;
  const api=async(path,options={})=>{
    calls.push({path,options});const method=options.method||'GET';
    if(path==='/api/community/notifications')return {notifications:[]};
    if(path.startsWith('/api/community/posts?'))return {posts:[structuredClone(p)],hasMore:false};
    if(path==='/api/community/posts/'+pid)return {post:structuredClone(p),comments:authenticated?structuredClone(replies):[]};
    if(path==='/api/community/posts/'+pid+'/comments'){
      assert.equal(authenticated,true);const v=JSON.parse(options.body);assert.equal(v.sharingConfirmed,true);replies.push({...v,attachments:[],id:cid,postId:pid,status:'pending',mine:true,revision:1});return {comment:replies.at(-1)};
    }
    if(path==='/api/community/attachments'&&method==='POST')return {attachment:{id:fid,name:'虚构.txt',type:'text/plain',size:9}};
    if(path==='/api/community/comments/'+cid&&method==='PUT'){const v=JSON.parse(options.body);assert.equal(v.sharingConfirmed,true);assert.equal(v.revision,replies[0].revision);replies[0]={...replies[0],...v,revision:v.revision+1,status:'pending'};return {comment:structuredClone(replies[0])};}
    if(path==='/api/community/moderation')return {posts:[],comments:structuredClone(replies),reports:[]};
    if(path.startsWith('/api/community/moderation/target'))return {postId:pid,post:structuredClone(p),comment:structuredClone(replies[0])};
    throw Error('Unexpected fictional request '+path);
  };
  const tick=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
  const session=v=>doc.dispatchEvent(new win.CustomEvent('ziwei:session',{detail:{authenticated,...v}}));
  const button=(text,root=doc)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
  initCommunity({api,el,btn});session({core:false});await tick();
  button('虚构讨论').click();await tick();
  assert.equal(doc.querySelector('.community-detail strong').textContent,'虚构粗体');assert.equal(doc.querySelectorAll('.community-detail script').length,0);
  assert.match(doc.querySelector('.community-detail').textContent,/<script>/);
  assert.equal(doc.querySelector('.community-comment-form'),null);assert.ok(button('登录 / 注册后评论'));
  assert.equal(calls.some(c=>c.path==='/api/community/moderation'),false);
  button('登录 / 注册后评论').click();assert.equal(win.location.hash,'#account');
  doc.dispatchEvent(new win.Event('ziwei:logout'));authenticated=true;session({core:false});await tick();
  assert.equal(win.location.hash,'#community');assert.ok(doc.querySelector('.community-comment-form'));assert.equal(doc.activeElement,doc.querySelector('.community-comment-form textarea'));
  assert.equal(win.sessionStorage.getItem('community-login-return'),null);
  const cf=doc.querySelector('.community-comment-form');cf.querySelector('textarea').value='**虚构评论**\n\n- 合成列表';cf.querySelector('[name=confirmed]').checked=true;
  button('提交评论审核',cf).click();await tick();
  assert.match(doc.querySelector('.community-comments [role=status]').textContent,/评论已保存/);assert.equal(doc.querySelector('.community-comment strong').textContent,'虚构评论');assert.equal(doc.querySelectorAll('.community-comment li').length,1);
  assert.ok(doc.querySelector('.community-comment-form').compareDocumentPosition(doc.querySelector('.community-comment-list'))&win.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(doc.querySelector('#community .community-moderation'),null);assert.equal(doc.querySelector('#community .community-review-shortcut'),null);
  const editPanel=[...doc.querySelectorAll('.community-comment details')].find(d=>d.querySelector('summary').textContent==='编辑并重新送审');assert.ok(editPanel);assert.equal(editPanel.querySelector('textarea'),null);editPanel.open=true;editPanel.dispatchEvent(new win.Event('toggle'));await tick();
  const ef=editPanel.querySelector('form');assert.equal(ef.querySelector('textarea').value,'**虚构评论**\n\n- 合成列表');ef.querySelector('textarea').value='**修订虚构评论**';ef.querySelector('[name=confirmed]').checked=true;button('保存并送审',ef).click();await tick();assert.equal(doc.querySelector('.community-comment strong').textContent,'修订虚构评论');assert.equal(replies[0].revision,2);
  authenticated=true;win.location.hash='review';session({core:true});await tick();
  assert.match(doc.querySelector('#community-review').textContent,/待审评论/);assert.ok(button('保存审核决定',doc.querySelector('#review')));assert.equal(button('保存审核决定',doc.querySelector('#community')),undefined);
  button('查看所属讨论',doc.querySelector('#review')).click();await tick();assert.match(doc.querySelector('.community-review-target').textContent,/虚构讨论/);assert.equal(win.location.hash,'#review');assert.ok(button('隐藏内容',doc.querySelector('#review')));
  session({core:false});await tick();assert.equal(doc.querySelector('#community-review .community-review-target'),null);assert.equal(doc.querySelector('#community-review .community-comment'),null);
  // Shared editor: formatting, preview, file upload and payload are exercised without a browser or real records.
  const editor=communityEditor({api,el,btn,label:'虚构编辑'});doc.body.append(editor.root);editor.input.value='虚构';editor.input.setSelectionRange(0,2);button('粗体',editor.root).click();assert.equal(editor.input.value,'**虚构**');
  button('预览排版',editor.root).click();assert.equal(editor.root.querySelector('.community-editor-preview strong').textContent,'虚构');button('继续编辑',editor.root).click();
  const transfer=new win.DataTransfer();transfer.items.add(new win.File(['虚构附件'],'虚构.txt',{type:'text/plain'}));const file=editor.root.querySelector('input[type=file]');file.files=transfer.files;file.dispatchEvent(new win.Event('change'));await tick();
  assert.deepEqual(editor.value().attachments,[fid]);assert.ok(editor.root.querySelector('.community-file'));editor.reset();assert.throws(()=>editor.value());
  await win.happyDOM.abort();await win.happyDOM.close();
});
