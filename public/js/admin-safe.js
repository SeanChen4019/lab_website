window.adminEscape = function(value) { return String(value ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); };
// The mobile sidebar is hidden by the legacy stylesheet; expose the same authorized links.
document.addEventListener('DOMContentLoaded',function(){const menu=document.querySelector('.admin-sidebar .sidebar-menu');if(!menu)return;const details=document.createElement('details');details.className='admin-mobile-nav';const summary=document.createElement('summary');summary.textContent='管理导航';details.append(summary,menu.cloneNode(true));document.body.prepend(details);});
// One in-flight save per legacy form prevents double-click publication.
document.addEventListener('DOMContentLoaded',function(){
 const wrapped=new Set();
 document.querySelectorAll('button[onclick]').forEach(button=>{
  const match=/^(save[A-Za-z0-9_]*)\(\)$/.exec(button.getAttribute('onclick')||'');
  if(!match||wrapped.has(match[1])||typeof window[match[1]]!=='function')return;
  const name=match[1],original=window[name];let pending=false;wrapped.add(name);
  window[name]=async function(...args){
   if(pending)return;pending=true;
   const buttons=[...document.querySelectorAll('button[onclick="'+name+'()"]')];buttons.forEach(b=>b.disabled=true);
   try{return await original.apply(this,args);}finally{pending=false;buttons.forEach(b=>b.disabled=false);}
  };
 });
});
