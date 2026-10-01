// Bridge the existing tools' theme conventions without changing their calculations.
(()=>{
 const keys=['jinsul-portal-theme','jinsul-theme','jinsul_theme','jinsulTheme','jinsulWorkTheme','jinsulIncentiveTheme','jinsul-stat-theme','jinsul-bit-1visit-theme','jinsul-onevisit-theme','jinsul-ysarang-onevisit-theme','jinsul-dashboard-theme','jinsul-birthday-theme','jinsul-la-theme','jinsul-treatment-combo-theme','jinsul-ysarang-visit-theme'];
 const classes={light:'light','light-mode':'light','theme-light':'light',dark:'dark','dark-mode':'dark','theme-dark':'dark'};
 let observer;
 const current=()=>document.documentElement.dataset.theme==='dark'?'dark':'light';
 function apply(value){value=value==='dark'?'dark':'light';observer?.disconnect();document.documentElement.dataset.theme=value;for(const key of keys)localStorage.setItem(key,value);if(document.body)for(const [name,mode]of Object.entries(classes))document.body.classList.toggle(name,mode===value);observer?.observe(document.documentElement,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['class','data-theme']});}
 apply(localStorage.getItem('jinsul-portal-theme')||'light');
 document.addEventListener('DOMContentLoaded',()=>{apply(localStorage.getItem('jinsul-portal-theme')||'light');observer=new MutationObserver(records=>{let changed;for(const record of records){if(record.target===document.documentElement&&record.attributeName==='data-theme')changed=current();if(record.target===document.body&&record.attributeName==='class'){const old=new Set((record.oldValue||'').split(/\s+/));for(const [name,mode]of Object.entries(classes)){const has=document.body.classList.contains(name);if(old.has(name)!==has)changed=has?mode:mode==='light'?'dark':'light';}}}if(changed)apply(changed);});observer.observe(document.documentElement,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['class','data-theme']});});
 window.JinsulTheme={apply,toggle(){const desired=current()==='dark'?'light':'dark';const native=Array.from(document.querySelectorAll('button')).find(b=>!b.closest('#jinsul-shell')&&/theme|darkmode/i.test(b.id+' '+b.className));native?.click();apply(desired);}};
})();
