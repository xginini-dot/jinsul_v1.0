import {createHash} from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, readdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { apps } from './catalog.mjs';
import { sourceDirectory, snapshot } from './source.mjs';
import {applyDesign,documentTags} from './html-document.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const source = sourceDirectory, dist = path.join(root,'dist');
await mkdir(dist,{recursive:true});
for (const name of await readdir(path.join(root,'public'))) await cp(path.join(root,'public',name),path.join(dist,name),{recursive:true});

const assetNames=(await readdir(path.join(root,'public'))).filter(name=>/\.(?:js|css)$/.test(name)).sort();
const assetHash=createHash('sha256');
for(const name of assetNames)assetHash.update(name).update(await readFile(path.join(root,'public',name)));
assetHash.update(await readFile(path.join(source,'xlsx.full.min.js')));
const assetVersion=assetHash.digest('hex').slice(0,16);
const reusableAssets=new Set([...assetNames,'xlsx.full.min.js']);
function versionAssets(html){
 const edits=[];
 for(const tag of documentTags(html).filter(t=>!t.closing&&(t.name==='script'||t.name==='link'))){
  const attr=/\b(?:src|href)\s*=\s*(["'])(.*?)\1/i.exec(tag.text);
  if(!attr)continue;
  const name=attr[2].replace(/^\//,'');
  if(!reusableAssets.has(name))continue;
  const at=tag.start+tag.text.indexOf(attr[0])+attr[0].indexOf(attr[2]);
  edits.push({at,length:attr[2].length,value:attr[2]+'?v='+assetVersion});
 }
 for(const edit of edits.reverse())html=html.slice(0,edit.at)+edit.value+html.slice(edit.at+edit.length);
 return html;
}

const original = await readdir(source);
for (const app of apps) {
 const appSource=path.join(source,app.file);
 if (!original.includes(app.file)) throw new Error(`업무 파일 없음: ${app.file}`);
 let html = await readFile(appSource,'utf8');
 if(!html.includes('<html'))throw new Error(`정상 HTML이 아닙니다: ${app.file}`);
 // Design is added to actual document tags, never inside the embedded XLSX scripts.
 html = versionAssets(applyDesign(html));
 await writeFile(path.join(dist,app.file),html);
}
for (const name of ['xlsx.full.min.js','진설로고.png','hira-prices.json','hira-codes.json']) await copyFile(path.join(source,name),path.join(dist,name));
for(const name of await readdir(path.join(root,'public'))){
 if(name.endsWith('.html'))await writeFile(path.join(dist,name),versionAssets(await readFile(path.join(root,'public',name),'utf8')));
 if(name.endsWith('.js')){const script=await readFile(path.join(root,'public',name),'utf8');await writeFile(path.join(dist,name),script.replace(/(['"])\.\/portal\.js\1/g,(_,quote)=>quote+'./portal.js?v='+assetVersion+quote));}
}
await writeFile(path.join(dist,'catalog.json'),JSON.stringify(apps));
await writeFile(path.join(dist,'build-info.json'),JSON.stringify({commit:snapshot.commit,repository:snapshot.repository}));
console.log(`보안 배포본 생성: ${apps.length}개 업무 화면. 원본 파일 유지.`);
