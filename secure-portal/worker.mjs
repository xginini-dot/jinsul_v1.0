import { apps, groups } from './catalog.mjs';
import {readMenu,userMenu,validateMenu} from './menu.mjs';
const encoder = new TextEncoder();
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const hex = bytes => Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async text => hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
export function equal(a,b) { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false; let diff=0; for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i); return diff===0; }
export function validPassword(password) { return typeof password==='string'&&password.length>0; }
export async function passwordHash(password,salt,pepper) {
 const key = await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const material = await crypto.subtle.sign('HMAC',key,encoder.encode(password));
 const base = await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},base,256));
}
const now = () => Math.floor(Date.now()/1000);
const cookie = token => `__Host-jinsul=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
const clearCookie = '__Host-jinsul=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
const publicUser = u => ({id:u.id,username:u.username,name:u.name,role:u.role,permissions:JSON.parse(u.permissions),active:!!u.active,mustChange:!!u.must_change});
async function body(request,max=8192) {
 if(Number(request.headers.get('Content-Length')||0)>max)fail('요청이 너무 큽니다.',413);
 const text=await request.text(); if(text.length>max)fail('요청이 너무 큽니다.',413);
 try { const data=JSON.parse(text); if(!data||Array.isArray(data)||typeof data!=='object')fail('잘못된 요청'); return data; } catch { fail('잘못된 요청입니다.'); }
}
async function audit(env,actor,action,target='') { await env.DB.prepare('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)').bind(actor,action,target,now()).run(); }
async function limit(env,key,max) {
 const time=now();
 const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count').bind(key,time+900,time,time).first();
 if(row.count>max)fail('로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.',429);
}
async function session(request,env) {
 const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-jinsul=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return null;
 const hash=await digest(token),time=now();
 const user=await env.DB.prepare('SELECT u.*,s.token_hash,s.last_seen FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen>? AND s.version=u.version AND u.active=1').bind(hash,time,time-1800).first();
 if(user&&user.last_seen<=time-60)await env.DB.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').bind(time,hash).run();
 return user;
}
function validateAccount(data) {
 if(typeof data.username!=='string'||!/^[a-zA-Z0-9._-]{3,40}$/.test(data.username))fail('아이디는 영문·숫자·._- 3~40자입니다.');
 if(typeof data.name!=='string'||!data.name.trim()||data.name.length>60)fail('이름을 1~60자로 입력해 주세요.');
 if(!['admin','manager','staff'].includes(data.role))fail('권한을 확인해 주세요.');
 if(!Array.isArray(data.permissions)||data.permissions.some(p=>!groups.includes(p)))fail('업무 권한을 확인해 주세요.');
}
async function api(request,env,path,user) {
 if(request.method==='POST'&&path==='/api/bootstrap') {
  await limit(env,'bootstrap:'+await digest(request.headers.get('CF-Connecting-IP')||'local'),5);
  const data=await body(request);
  if(!env.BOOTSTRAP_TOKEN||!equal(await digest(data.token||''),await digest(env.BOOTSTRAP_TOKEN)))fail('초기 설정 키를 확인해 주세요.',403);
  if(!validPassword(data.password))fail('비밀번호를 입력해 주세요.');
  validateAccount({...data,role:'admin',permissions:groups});
  const salt=randomToken(),hash=await passwordHash(data.password,salt,env.PASSWORD_PEPPER);
  const result=await env.DB.prepare("INSERT INTO users(id,username,name,role,permissions,password_hash,salt,must_change,created_at) SELECT ?,?,?,'admin',?,?,?,0,? WHERE NOT EXISTS(SELECT 1 FROM users)").bind(crypto.randomUUID(),data.username.toLowerCase(),data.name.trim(),JSON.stringify(groups),hash,salt,now()).run();
  if(!result.meta.changes)fail('최초 관리자 설정이 이미 완료되었습니다.',409);
  await audit(env,'bootstrap','관리자 초기 설정',data.username);
  return json({ok:true});
 }
 if(request.method==='POST'&&path==='/api/login') {
  const data=await body(request),username=String(data.username||'').toLowerCase();
  await limit(env,'ip:'+await digest(request.headers.get('CF-Connecting-IP')||'local'),30);
  await limit(env,'user:'+await digest(username),10);
  if(typeof data.password!=='string'||!data.password.length)fail('아이디 또는 비밀번호를 확인해 주세요.',401);
  const found=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  const hash=await passwordHash(data.password,found?.salt||'dummy-account-salt',env.PASSWORD_PEPPER);
  if(!found||!found.active||!equal(hash,found.password_hash)) { await audit(env,null,'로그인 실패',username.slice(0,40)); fail('아이디 또는 비밀번호를 확인해 주세요.',401); }
  const token=randomToken();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,version,expires_at,last_seen) VALUES(?,?,?,?,?)').bind(await digest(token),found.id,found.version,now()+28800,now()).run();
  await audit(env,found.id,'로그인',found.username);
  return json({user:publicUser(found)},200,{'Set-Cookie':cookie(token)});
 }
 if(!user)fail('로그인이 필요합니다.',401);
 if(request.method==='POST'&&path==='/api/logout') {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();
  return json({ok:true},200,{'Set-Cookie':clearCookie});
 }
 if(request.method==='GET'&&path==='/api/me')return json({user:publicUser(user)});
 if(request.method==='POST'&&path==='/api/password') {
  const data=await body(request);
  await limit(env,'password:'+user.id,10);
  if(typeof data.current!=='string'||!data.current.length||!equal(await passwordHash(data.current,user.salt,env.PASSWORD_PEPPER),user.password_hash))fail('현재 비밀번호를 확인해 주세요.',403);
  if(!validPassword(data.password)||data.password===data.current)fail('기존과 다른 비밀번호를 입력해 주세요.');
  const salt=randomToken();
  await env.DB.batch([
   env.DB.prepare('UPDATE users SET password_hash=?,salt=?,must_change=0,version=version+1 WHERE id=?').bind(await passwordHash(data.password,salt,env.PASSWORD_PEPPER),salt,user.id),
   env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
  ]);
  await audit(env,user.id,'비밀번호 변경',user.username);
  return json({ok:true},200,{'Set-Cookie':clearCookie});
 }
 if(user.must_change)fail('먼저 임시 비밀번호를 변경해 주세요.',403);
 if(path==='/api/workspace'&&request.method==='GET')return json({user:publicUser(user),...await userMenu(env,user)});
 if(path==='/api/catalog'&&request.method==='GET')return json(await userMenu(env,user));
 if(user.role!=='admin')fail('관리자 권한이 필요합니다.',403);
 if(path==='/api/menu'&&request.method==='GET')return json(await readMenu(env));
 if(path==='/api/menu'&&request.method==='POST'){
  const data=await body(request,262144);
  let menu;try{menu=validateMenu(data.menu);}catch(error){fail(error.message);}
  if(!Number.isInteger(data.revision)||data.revision<0)fail('다시 불러온 뒤 저장해 주세요.');
  const result=await env.DB.prepare('INSERT INTO portal_menu(id,value,revision) SELECT 1,?,1 WHERE ?=0 OR EXISTS(SELECT 1 FROM portal_menu WHERE id=1 AND revision=?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=portal_menu.revision+1 WHERE portal_menu.revision=?').bind(JSON.stringify(menu),data.revision,data.revision,data.revision).run();
  if(!result.meta.changes)fail('다른 관리자가 먼저 변경했습니다. 다시 불러온 뒤 수정해 주세요.',409);
  await audit(env,user.id,'업무·카테고리 변경');return json({ok:true,revision:data.revision+1});
 }
 if(path==='/api/users'&&request.method==='GET') {
  const {results}=await env.DB.prepare('SELECT id,username,name,role,permissions,active,must_change FROM users ORDER BY created_at DESC').all();
  return json({users:results.map(publicUser)});
 }
 if(path==='/api/audit'&&request.method==='GET')return json(await env.DB.prepare('SELECT a.action,a.target,a.created_at,COALESCE(u.name,\'시스템\') AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 100').all());
 if(path==='/api/users'&&request.method==='POST') {
  const data=await body(request); validateAccount(data);
  if(!validPassword(data.password))fail('임시 비밀번호를 입력해 주세요.');
  const salt=randomToken();
  try { await env.DB.prepare('INSERT INTO users(id,username,name,role,permissions,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),data.username.toLowerCase(),data.name.trim(),data.role,JSON.stringify([...new Set(data.permissions)]),await passwordHash(data.password,salt,env.PASSWORD_PEPPER),salt,now()).run(); }
  catch(error) { if(String(error).includes('UNIQUE'))fail('이미 사용 중인 아이디입니다.',409); throw error; }
  await audit(env,user.id,'계정 생성',data.username); return json({ok:true},201);
 }
 const match=path.match(/^\/api\/users\/([a-f0-9-]{36})(\/reset)?$/);
 if(match&&request.method==='POST') {
  const target=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(match[1]).first();
  if(!target)fail('계정을 찾을 수 없습니다.',404);
  const data=await body(request);
  if(match[2]) {
   if(target.id===user.id)fail('본인 비밀번호는 비밀번호 변경 메뉴를 이용해 주세요.');
   if(!validPassword(data.password))fail('임시 비밀번호를 입력해 주세요.');
   const salt=randomToken();
   await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,salt=?,must_change=1,version=version+1 WHERE id=?').bind(await passwordHash(data.password,salt,env.PASSWORD_PEPPER),salt,target.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]);
   await audit(env,user.id,'비밀번호 초기화',target.username);
  } else {
   validateAccount({...data,username:target.username});
   if(typeof data.active!=='boolean')fail('계정 상태를 확인해 주세요.');
   if(target.id===user.id&&(data.role!=='admin'||!data.active))fail('본인 관리자 권한은 해제하거나 정지할 수 없습니다.');
   const result=await env.DB.prepare("UPDATE users SET name=?,role=?,permissions=?,active=?,version=version+1 WHERE id=? AND (role!='admin' OR ( ?='admin' AND ?=1) OR (SELECT COUNT(*) FROM users WHERE role='admin' AND active=1)>1)").bind(data.name.trim(),data.role,JSON.stringify([...new Set(data.permissions)]),data.active?1:0,target.id,data.role,data.active?1:0).run();
   if(!result.meta.changes)fail('마지막 관리자는 유지해야 합니다.',409);
   await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id).run();
   await audit(env,user.id,'계정·권한 변경',target.username);
  }
  return json({ok:true});
 }
 fail('요청을 찾을 수 없습니다.',404);
}
export async function handle(request,env) {
 const url=new URL(request.url),path=decodeURIComponent(url.pathname);
 const htmlRoutes=['login','setup','account','admin','index',...apps.map(app=>app.file.slice(0,-5))];
 const legacyRoute=path.replace(/^\//,'').replace(/\/$/,'');
 if(['GET','HEAD'].includes(request.method)&&htmlRoutes.includes(legacyRoute)&&path!=='/')return new Response(null,{status:302,headers:{Location:'/'+encodeURI(legacyRoute)+'.html','Cache-Control':'no-store'}});
 if(!['GET','HEAD','POST'].includes(request.method))return json({error:'허용되지 않은 요청입니다.'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'요청 출처를 확인할 수 없습니다.'},403);
 const publicPaths=['/login.html','/setup.html','/setup.js','/portal.css','/fonts.css','/login.js','/진설로고.png'];
 const fontPath=/^\/fonts\/(Paperlogy-[1-9][A-Za-z]+\.(?:ttf|woff2)|OFL-license\.txt)$/.test(path);
 if((publicPaths.includes(path)||fontPath)&&request.method!=='POST')return env.ASSETS.fetch(request);
 if(!env.DB||!env.PASSWORD_PEPPER||env.PASSWORD_PEPPER.length<32)return json({error:'서버 초기 설정이 필요합니다. 관리자에게 문의해 주세요.'},503);
 const user=await session(request,env);
 if(path.startsWith('/api/'))return api(request,env,path,user);
 if(request.method==='POST')return json({error:'허용되지 않은 요청입니다.'},405);
 if(!user)return new Response(null,{status:302,headers:{Location:'/login.html','Cache-Control':'no-store'}});
 if(user.must_change&&!['/account.html','/portal.css','/account.js','/portal.js'].includes(path))return new Response(null,{status:302,headers:{Location:'/account.html','Cache-Control':'no-store'}});
 if((path==='/admin.html'||path==='/admin.js')&&user.role!=='admin')return json({error:'관리자 권한이 필요합니다.'},403);
 const app=apps.find(a=>'/'+a.file===path);
 if(app&&user.role!=='admin'&&!JSON.parse(user.permissions).includes(app.group))return json({error:'해당 업무의 접근 권한이 없습니다.'},403);
 const support=['/','/index.html','/account.html','/account.js','/admin.html','/admin.js','/portal.js','/portal.css','/shell.js','/shell.css','/design.css','/theme.js','/xlsx.full.min.js','/hira-prices.json','/hira-codes.json','/catalog.json','/build-info.json','/진설로고.png'];
 if(!app&&!support.includes(path))return json({error:'페이지를 찾을 수 없습니다.'},404);
 if(path==='/catalog.json')return json(await userMenu(env,user));
 if(path==='/'){const assetURL=new URL(request.url);assetURL.pathname='/index.html';return env.ASSETS.fetch(new Request(assetURL,request));}
 return env.ASSETS.fetch(request);
}
export default {
 async fetch(request,env) {
  let response;
  try { response=await handle(request,env); } catch(error) { response=json({error:error.status?error.message:'처리 중 오류가 발생했습니다. 관리자에게 문의해 주세요.'},error.status||500); }
  const secured=new Response(response.body,response);
  const assetPath=new URL(request.url).pathname;
  const reusable=/^\/(?:fonts\/|fonts\.css$|진설로고\.png$)/.test(assetPath);
  const shared=/^\/(?:portal|shell|design|theme|admin|account|login|setup)\.(?:js|css)$/.test(assetPath)||assetPath==='/xlsx.full.min.js';
  const successful=secured.ok||secured.status===304;
  secured.headers.set('Cache-Control',successful&&reusable?'public, max-age=86400':successful&&shared?(/^[a-f0-9]{16}$/.test(new URL(request.url).searchParams.get('v')||'')?'private, max-age=86400, immutable':'private, max-age=0, must-revalidate'):'no-store');
  secured.headers.set('X-Content-Type-Options','nosniff');
  secured.headers.set('X-Frame-Options','SAMEORIGIN');
  secured.headers.set('Referrer-Policy','same-origin');
  secured.headers.set('Strict-Transport-Security','max-age=31536000');
  return secured;
 },
 async scheduled(event,env) {
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<? OR last_seen<?').bind(now(),now()-1800),env.DB.prepare('DELETE FROM rate_limits WHERE reset_at<?').bind(now()),env.DB.prepare('DELETE FROM audit WHERE created_at<?').bind(now()-90*86400)]);
 }
};
