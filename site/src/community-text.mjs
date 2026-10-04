// A deliberately small, HTML-free markup vocabulary shared by both editors.
export function safeCommunityLink(value) {
  try { const url=new URL(value); return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password ? url.href : null; }
  catch { return null; }
}

export function inlineTokens(text,depth=0) {
  if(depth>5)return [{type:'text',text}];
  const tokens=[],pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]+\]\([^\s)]+\)|https?:\/\/[^\s<>]+)/g;
  let position=0;
  for(const match of text.matchAll(pattern)){
    if(match.index>position)tokens.push({type:'text',text:text.slice(position,match.index)});
    const part=match[0];let token;
    if(part.startsWith('`'))token={type:'code',text:part.slice(1,-1)};
    else if(part.startsWith('**'))token={type:'strong',children:inlineTokens(part.slice(2,-2),depth+1)};
    else if(part.startsWith('*'))token={type:'em',children:inlineTokens(part.slice(1,-1),depth+1)};
    else if(part.startsWith('~~'))token={type:'del',children:inlineTokens(part.slice(2,-2),depth+1)};
    else {
      const link=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/),label=link?link[1]:part,href=safeCommunityLink(link?link[2]:part);
      token=href?{type:'a',text:label,href}:{type:'text',text:part};
    }
    tokens.push(token);position=match.index+part.length;
  }
  if(position<text.length)tokens.push({type:'text',text:text.slice(position)});
  return tokens;
}

export function communityBlocks(value,format='plain') {
  const text=String(value||'').replace(/\r\n?/g,'\n');
  if(format!=='markdown')return [{type:'plain',text}];
  const lines=text.split('\n'),blocks=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(!line.trim())continue;
    if(/^```/.test(line)){const code=[];while(++i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i]);blocks.push({type:'pre',text:code.join('\n')});continue;}
    if(/^\s*---+\s*$/.test(line)){blocks.push({type:'hr'});continue;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);if(heading){blocks.push({type:'h'+(heading[1].length+1),children:inlineTokens(heading[2])});continue;}
    const item=line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if(item){const type=item[1]?'ul':'ol',last=blocks.at(-1),list=last?.type===type?last:{type,items:[]};if(list!==last)blocks.push(list);list.items.push(inlineTokens(item[2]));continue;}
    if(/^>\s?/.test(line)){blocks.push({type:'blockquote',children:inlineTokens(line.replace(/^>\s?/,''))});continue;}
    const last=blocks.at(-1);if(last?.type==='p'&&i>0&&lines[i-1].trim())last.children.push({type:'text',text:'\n'},...inlineTokens(line));
    else blocks.push({type:'p',children:inlineTokens(line)});
  }
  return blocks;
}

export function renderCommunityText(root,text,format='plain') {
  const doc=root.ownerDocument;root.replaceChildren();root.classList.add('community-rich-text');
  function appendInline(parent,tokens){for(const token of tokens){if(token.type==='text'){parent.append(doc.createTextNode(token.text));continue;}const n=doc.createElement(token.type);if(token.type==='a'){n.href=token.href;n.target='_blank';n.rel='noopener noreferrer nofollow';}if(token.children)appendInline(n,token.children);else n.textContent=token.text;parent.append(n);}}
  for(const block of communityBlocks(text,format)){
    const n=doc.createElement(block.type==='plain'?'p':block.type);if(block.type==='plain')n.className='community-plain-text';
    if(block.items)for(const tokens of block.items){const li=doc.createElement('li');appendInline(li,tokens);n.append(li);}
    else if(block.children)appendInline(n,block.children);else if(block.text!==undefined)n.textContent=block.text;
    root.append(n);
  }
}

export const communityFileAccept='.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';
export const communityFileLimit=10*1024*1024;
export function renderCommunityFiles(root,files=[]) {
  const doc=root.ownerDocument;root.replaceChildren();root.classList.add('community-files');
  for(const file of files){if(!/^[a-f0-9-]{36}$/.test(file.id))continue;const link=doc.createElement('a');link.href='/api/community/attachments/'+file.id;link.target='_blank';link.rel='noopener noreferrer';
    if(file.type?.startsWith('image/')){link.className='community-image';const img=doc.createElement('img');img.src=link.href;img.alt=file.name;img.loading='lazy';link.append(img);}
    else {link.className='community-file';link.download=file.name;link.textContent=file.name+' · '+(file.size/1024).toFixed(0)+' KB';}
    root.append(link);
  }
}
