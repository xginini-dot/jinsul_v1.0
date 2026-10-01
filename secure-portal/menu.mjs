import {apps,groups} from './catalog.mjs';
export const defaultMenu=()=>({categories:groups.map((name,i)=>({id:'category-'+i,name})),apps:apps.map((a,i)=>({file:a.file,title:a.title,description:a.description,category:'category-'+groups.indexOf(a.group),note:'',visible:true}))});
export function validateMenu(menu){
 if(!menu||!Array.isArray(menu.categories)||!Array.isArray(menu.apps)||menu.categories.length>30||menu.apps.length!==apps.length)throw new Error('카테고리 또는 업무 목록을 확인해 주세요.');
 const ids=new Set(),names=new Set(),files=new Set();
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 for(const c of menu.categories){if(!c||!/^[-a-zA-Z0-9]{1,60}$/.test(c.id)||ids.has(c.id)||!text(c.name,40)||names.has(c.name.trim())||['전체','즐겨찾기'].includes(c.name.trim()))throw new Error('카테고리 이름은 중복 없이 1~40자로 입력해 주세요.');ids.add(c.id);names.add(c.name.trim());}
 for(const a of menu.apps){if(!a||!apps.some(x=>x.file===a.file)||files.has(a.file)||!text(a.title,80)||typeof a.description!=='string'||a.description.length>500||typeof a.note!=='string'||a.note.length>3000||typeof a.visible!=='boolean'||!ids.has(a.category))throw new Error('업무 이름·내용·카테고리를 확인해 주세요.');files.add(a.file);}
 return {categories:menu.categories.map(c=>({id:c.id,name:c.name.trim()})),apps:menu.apps.map(a=>({file:a.file,title:a.title.trim(),description:a.description,note:a.note,category:a.category,visible:a.visible}))};
}
export async function readMenu(env){const row=await env.DB.prepare('SELECT value,revision FROM portal_menu WHERE id=1').first();return row?{menu:JSON.parse(row.value),revision:row.revision}:{menu:defaultMenu(),revision:0};}
export async function userMenu(env,user){const {menu}=await readMenu(env);const allowed=JSON.parse(user.permissions);return {categories:menu.categories,apps:menu.apps.filter(a=>a.visible&&(user.role==='admin'||allowed.includes(apps.find(x=>x.file===a.file).group))).map(a=>({...apps.find(x=>x.file===a.file),...a,originalTitle:apps.find(x=>x.file===a.file).title,originalDescription:apps.find(x=>x.file===a.file).description,categoryName:menu.categories.find(c=>c.id===a.category).name}))};}
