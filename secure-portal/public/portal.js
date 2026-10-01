export async function api(path,data){const response=await fetch(path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const value=await response.json();if(!response.ok){if(response.status===401&&location.pathname!='/login.html')location.href='/login.html';throw new Error(value.error||'처리에 실패했습니다.')}return value;}
export function theme(){const apply=value=>{document.documentElement.dataset.theme=value;localStorage.setItem('jinsul-portal-theme',value);const b=document.querySelector('#theme');if(b)b.textContent=value==='dark'?'라이트 모드':'다크 모드';};apply(localStorage.getItem('jinsul-portal-theme')||'light');document.querySelector('#theme')?.addEventListener('click',()=>apply(document.documentElement.dataset.theme==='dark'?'light':'dark'));}
export async function identity(){const result=await api(document.querySelector('#cards')?'/api/workspace':'/api/me');const {user}=result;workspace=result;if(user.mustChange&&location.pathname!='/account.html'){location.href='/account.html';return null;}const name=document.querySelector('#identity');if(name)name.textContent=`${user.name} · ${{admin:'관리자',manager:'책임자',staff:'직원'}[user.role]}`;document.querySelector('#logout')?.addEventListener('click',async()=>{try{await api('/api/logout',{});location.href='/login.html';}catch(e){document.querySelector('#message').textContent=e.message;}});return user;}
let workspace;
theme();
if(document.querySelector('#cards')){
 try{
  const user=await identity();if(user){
   document.querySelector('#admin').hidden=user.role!=='admin';
   const {apps,categories}=workspace;let group='전체';const storageKey='jinsul-favorites:'+user.id;
   const nav=document.querySelector('#navigation');nav.querySelectorAll('[data-group]:not([data-group="전체"]):not([data-group="즐겨찾기"])').forEach(b=>b.remove());
   for(const c of categories){if(!apps.some(a=>a.category===c.id))continue;const b=document.createElement('button');b.dataset.group=c.name;b.textContent=c.name;nav.insertBefore(b,document.querySelector('#admin'));}
   for(const app of apps)app.group=app.categoryName;
   let favorites;try{favorites=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(favorites))favorites=[];}catch{favorites=[];}
   for(const button of document.querySelectorAll('[data-group]'))if(!['전체','즐겨찾기'].includes(button.dataset.group)&&!apps.some(a=>a.group===button.dataset.group))button.hidden=true;
   const cards=document.querySelector('#cards'),entries=new Map(),fragment=document.createDocumentFragment();
   for(const app of apps){
    const card=document.createElement('article');card.className='card';
    const tag=document.createElement('span');tag.className='group';tag.textContent=app.group;
    const title=document.createElement('h2');title.textContent=app.title;
    const description=document.createElement('p');description.textContent=app.description;
    const link=document.createElement('a');link.href='/'+app.file;link.textContent='업무 열기 →';
    const star=document.createElement('button');star.className='star';star.setAttribute('aria-label',app.title+' 즐겨찾기');
    star.onclick=()=>{favorites=favorites.includes(app.file)?favorites.filter(f=>f!==app.file):[...favorites,app.file];localStorage.setItem(storageKey,JSON.stringify(favorites));render();};
    card.append(tag,title,description,link,star);fragment.append(card);entries.set(app.file,{card,star,search:(app.title+' '+app.description+' '+app.group).toLowerCase()});
   }
   cards.replaceChildren(fragment);
   function render(){
    const q=document.querySelector('#search').value.trim().toLowerCase();let count=0;
    for(const app of apps){const entry=entries.get(app.file),favorite=favorites.includes(app.file);const visible=(group==='전체'||group==='즐겨찾기'&&favorite||app.group===group)&&entry.search.includes(q);entry.card.hidden=!visible;if(visible)count++;entry.star.textContent=favorite?'★':'☆';entry.star.setAttribute('aria-pressed',String(favorite));}
    document.querySelector('#count').textContent=count+'개 업무';document.querySelector('#heading').textContent=group==='전체'?'전체 업무':group;document.querySelector('#message').textContent=count?'':'해당하는 업무가 없습니다.';
   }
   let renderFrame;function scheduleRender(){cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(render);}
   document.querySelector('#search').addEventListener('input',scheduleRender);document.querySelector('#navigation').addEventListener('click',event=>{const button=event.target.closest('[data-group]');if(!button)return;group=button.dataset.group;document.querySelectorAll('[data-group]').forEach(b=>b.classList.toggle('active',b===button));render();});render();
  }
 }catch(error){document.querySelector('#message').textContent=error.message;}
}
