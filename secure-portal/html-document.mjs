export const initialShell="<div id=\"jinsul-shell\" data-jinsul-pending=\"true\"><a href=\"/\" class=\"jinsul-home\"><span class=\"jinsul-logo-symbol\" aria-hidden=\"true\"><img src=\"/진설로고.png\" alt=\"\"></span>JINSUL · 업무 포털</a><span class=\"jinsul-loading\" role=\"status\">업무 메뉴를 불러오는 중</span></div>";
// Scan actual document tags, skipping raw script/style content. Preserve source bytes.
export function documentTags(html){
 const tags=[], pattern=/<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>|<!--[\s\S]*?-->/gi;
 let match;
 while((match=pattern.exec(html))){
  if(match[0].startsWith('<!--'))continue;
  const name=match[1].toLowerCase(),closing=match[0].startsWith('</');
  tags.push({name,closing,start:match.index,end:pattern.lastIndex,text:match[0]});
  if(!closing&&(name==='script'||name==='style')){
   const end=new RegExp('</'+name+'\\s*>','gi');end.lastIndex=pattern.lastIndex;
   const close=end.exec(html);if(!close)throw new Error('Unclosed '+name);
   tags.push({name,closing:true,start:close.index,end:end.lastIndex,text:close[0]});pattern.lastIndex=end.lastIndex;
  }
 }
 return tags;
}
export function applyDesign(html){
 const tags=documentTags(html),head=tags.find(t=>t.name==='head'&&!t.closing),end=tags.find(t=>t.name==='head'&&t.closing),body=tags.find(t=>t.name==='body'&&!t.closing);
 if(!head||!end||!body)throw new Error('Missing document head/body');
 const insertions=[{at:body.end,text:initialShell},{at:head.end,text:'<script src="/theme.js"></script><script defer src="/shell.js"></script>'},{at:end.start,text:'<link rel="stylesheet" href="/shell.css"><link rel="stylesheet" href="/design.css">'},{at:body.end-1,text:' data-jinsul-ui="professional"'}];
 for(const tag of tags.filter(t=>t.name==='img'&&!t.closing)){
  const src=/\bsrc\s*=\s*(["'])(.*?)\1/i.exec(tag.text);
  if(src&&/로고|%EB%A1%9C%EA%B3%A0|logo/i.test(tag.text)){
   const offset=tag.text.indexOf(src[0])+src[0].indexOf(src[2]);
   insertions.push({at:tag.start+offset,remove:src[2].length,text:'/진설로고.png'});
  }
 }
 for(const insertion of insertions.sort((a,b)=>b.at-a.at))html=html.slice(0,insertion.at)+insertion.text+html.slice(insertion.at+(insertion.remove||0));
 return html.replace(/https:\/\/xginini-dot\.github\.io\/jinsul_v1\.0\//gi,'/');
}
