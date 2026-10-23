// Shared idle tracking for the portal and every authenticated tool.
export function startSession(user){
 if(!user?.id||window.__jinsulSessionStarted)return;
 window.__jinsulSessionStarted=true;
 let idleMs=(Number(user.idleMinutes)||30)*60000,lastActivity=Date.now(),lastPing=lastActivity,lastStored=0,ending=false,pending=false;
 const key='jinsul-session-activity:'+user.id;
 const stored=()=>{try{const n=Number(localStorage.getItem(key));if(Number.isFinite(n)&&n<=Date.now())lastActivity=Math.max(lastActivity,n)}catch{}};
 const publish=()=>{const n=Date.now();if(n-lastStored<5000)return;lastStored=n;try{localStorage.setItem(key,String(lastActivity))}catch{}};
 const expire=async()=>{if(ending)return;ending=true;try{await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true})}catch{}finally{location.assign('/login.html?reason=idle')}};
 const active=event=>{if(event&&!event.isTrusted)return;stored();if(Date.now()-lastActivity>=idleMs){void expire();return;}lastActivity=Date.now();publish();};
 async function tick(){
  if(ending)return;stored();const n=Date.now();
  if(n-lastActivity>=idleMs){await expire();return;}
  if(pending||lastActivity<=lastPing||n-lastPing<Math.min(60000,idleMs/4))return;
  pending=true;lastPing=n;
  try{const r=await fetch('/api/me',{cache:'no-store'});if(r.status===401){await expire();return;}if(r.ok){const value=await r.json();if(value.user?.idleMinutes)idleMs=value.user.idleMinutes*60000;}}catch{}finally{pending=false;}
 }
 publish();
 for(const type of ['pointerdown','keydown','input','scroll'])document.addEventListener(type,active,{passive:true,capture:true});
 window.addEventListener('storage',event=>{if(event.key===key)stored()});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void tick()});
 window.addEventListener('pageshow',()=>void tick());
 setInterval(()=>void tick(),Math.min(15000,Math.max(1000,idleMs/4)));
}
