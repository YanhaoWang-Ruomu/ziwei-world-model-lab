import test from 'node:test';
import assert from 'node:assert/strict';
import {communityBlocks,inlineTokens,safeCommunityLink} from '../src/community-text.mjs';
import {fileMetadata,contentPayload,fileLimit} from '../server/community-attachments.mjs';
import {postPayload} from '../server/world-community.js';

test('old plain text remains literal, rich text supports common formatting',()=>{
  assert.deepEqual(communityBlocks('**虚构文字**\n- 旧列表'),[{type:'plain',text:'**虚构文字**\n- 旧列表'}]);
  const blocks=communityBlocks('## 虚构标题\n\n**粗体** *斜体* ~~删除~~ `代码`\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n> 引用\n\n```\n<script>虚构</script>\n```','markdown');
  assert.deepEqual(blocks.map(x=>x.type),['h3','p','ul','ol','blockquote','pre']);
  assert.deepEqual(blocks[1].children.filter(x=>x.type!=='text').map(x=>x.type),['strong','em','del','code']);
  assert.equal(blocks[2].items.length,2);assert.equal(blocks[3].items.length,2);
});
test('unsafe URLs and HTML cannot become executable markup',()=>{
  for(const s of ['javascript:alert(1)','data:text/html,evil','//example.test','https://user:pass@example.test','file:///x'])assert.equal(safeCommunityLink(s),null);
  assert.equal(safeCommunityLink('https://example.test/path'),'https://example.test/path');
  assert.equal(inlineTokens('[网页](https://example.test)')[0].type,'a');
  assert.equal(inlineTokens('[无效](javascript:evil)')[0].type,'text');
  const blocks=communityBlocks('<img src=x onerror=evil>\n<script>evil</script>','markdown');
  assert.equal(blocks[0].children.every(t=>t.type==='text'),true);
});
test('attachments are explicit, bounded, and cannot turn into arbitrary fields',()=>{
  assert.equal(contentPayload({body:'虚构'},100).format,'plain');
  const id='00000000-0000-4000-8000-000000000001';
  assert.equal(contentPayload({attachments:[id]},100).body,'');
  for(const value of [{body:''},{body:'x',format:'html'},{attachments:['bad']},{attachments:[id,id]},{body:'x'.repeat(101)}])assert.throws(()=>contentPayload(value,100));
  assert.throws(()=>postPayload({title:'虚构',body:'文字',kind:'case',tags:[],sharingConfirmed:true,attachmentUrl:'https://elsewhere.test'}));
});
test('file validation checks extension, size, signature and filename',()=>{
  const png=new Uint8Array([137,80,78,71,13,10,26,10]);assert.equal(fileMetadata('虚构图片.PNG',png).type,'image/png');
  assert.equal(fileMetadata('虚构.txt',new TextEncoder().encode('虚构文字')).type,'text/plain');
  for(const name of ['../x.png','x.exe','x.svg','x.html','x\n.txt'])assert.throws(()=>fileMetadata(name,png));
  assert.throws(()=>fileMetadata('伪图.png',new TextEncoder().encode('<html>')));
  assert.throws(()=>fileMetadata('空.txt',new Uint8Array()));assert.throws(()=>fileMetadata('超限.txt',new Uint8Array(fileLimit+1)));
});
