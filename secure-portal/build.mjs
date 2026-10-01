import { mkdir, readFile, writeFile, copyFile, readdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { apps } from './catalog.mjs';
import { sourceDirectory, snapshot } from './source.mjs';
import {applyDesign} from './html-document.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const source = sourceDirectory, dist = path.join(root,'dist');
await mkdir(dist,{recursive:true});
for (const name of await readdir(path.join(root,'public'))) await cp(path.join(root,'public',name),path.join(dist,name),{recursive:true});
const original = await readdir(source);
for (const app of apps) {
 const appSource=path.join(source,app.file);
 if (!original.includes(app.file)) throw new Error(`업무 파일 없음: ${app.file}`);
 let html = await readFile(appSource,'utf8');
 if(!html.includes('<html'))throw new Error(`정상 HTML이 아닙니다: ${app.file}`);
 // Design is added to actual document tags, never inside the embedded XLSX scripts.
 html = applyDesign(html);
 await writeFile(path.join(dist,app.file),html);
}
for (const name of ['xlsx.full.min.js','진설로고.png','hira-prices.json','hira-codes.json']) await copyFile(path.join(source,name),path.join(dist,name));
await writeFile(path.join(dist,'catalog.json'),JSON.stringify(apps));
await writeFile(path.join(dist,'build-info.json'),JSON.stringify({commit:snapshot.commit,repository:snapshot.repository}));
console.log(`보안 배포본 생성: ${apps.length}개 업무 화면. 원본 파일 유지.`);
