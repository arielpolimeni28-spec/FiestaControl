
(function(){
'use strict';

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=v=>{try{return v?new Date(v).toLocaleString('es-AR'):''}catch(_){return String(v||'')}};

function s(){try{return session||{}}catch(_){return window.session||{}}}
function audience(){
  const r=norm(s().role||s().userRole||s().type||s().userType||'');
  if(r.includes('proveedor')||r.includes('provider')||r.includes('supplier'))return 'provider';
  if(r.includes('salon'))return 'salon';
  const side=norm(document.querySelector('.sidebar')?.innerText||'');
  if(side.includes('portal proveedor'))return 'provider';
  if(side.includes('panel del salon')||side.includes('salon activo'))return 'salon';
  return '';
}
function userKey(){
  const x=s();
  return String(x.salonId||x.providerId||x.supplierId||x.marketSupplierId||x.userId||x.id||x.email||x.userEmail||'anon');
}
function isAdminMsg(m){
  const from=norm(m?.from||m?.fromEmail||m?.email||m?.author||m?.authorEmail||m?.createdBy||m?.createdByEmail||'');
  return from==='admin@fiestacontrol.com';
}
function ensure(){
  data.adminCommunityMessages=data.adminCommunityMessages||[];
  data.communityMessages=data.communityMessages||[];
  data.communityMessageReads=data.communityMessageReads||[];
}
function messages(){
  ensure();
  const map=new Map();
  (data.adminCommunityMessages||[]).forEach(m=>{
    if(m&&m.active!==false)map.set(String(m.id),{...m,from:'admin@fiestacontrol.com',audience:'all'});
  });
  (data.communityMessages||[]).forEach(m=>{
    if(m&&m.active!==false&&isAdminMsg(m))map.set(String(m.id),{
      ...m,
      title:m.title||m.subject||'Mensaje del administrador',
      text:m.text||m.message||m.body||m.content||'',
      audience:'all'
    });
  });
  return [...map.values()].sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
}
function isRead(idv){
  ensure();
  const u=userKey();
  return data.communityMessageReads.some(r=>String(r.messageId)===String(idv)&&String(r.userKey)===u);
}
function markRead(idv){
  ensure();
  if(isRead(idv))return;
  data.communityMessageReads.push({id:id(),messageId:idv,userKey:userKey(),readAt:new Date().toISOString()});
  save();
}
function count(){return messages().filter(m=>!isRead(m.id)).length}

function findCard(){
  const h=[...document.querySelectorAll('h1,h2,h3,h4,b,strong')].find(x=>norm(x.textContent).includes('mensajes del administrador'));
  return h?.closest('.card')||null;
}
function render(){
  if(!audience())return;
  const card=findCard();
  if(!card)return;
  const list=messages();
  let header=card.querySelector('.section-title');
  if(!header){
    const h=[...card.querySelectorAll('h1,h2,h3,h4')].find(x=>norm(x.textContent).includes('mensajes del administrador'));
    header=h?.parentElement||null;
  }
  [...card.children].forEach(ch=>{if(ch!==header)ch.remove()});
  const host=document.createElement('div');
  host.style.marginTop='12px';
  host.className='fc-v81-admin-list';
  host.innerHTML=list.length?list.map(m=>`
    <article style="padding:14px 0;border-bottom:1px solid #e5e7eb">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <b>${m.priority==='important'?'⚠️ ':''}${esc(m.title||m.subject||'Mensaje del administrador')}</b>
          ${isRead(m.id)?'<span style="font-size:11px;margin-left:8px;color:#64748b">LEÍDO</span>':'<span style="font-size:11px;margin-left:8px;font-weight:800">NUEVO</span>'}
          <div style="margin-top:8px;white-space:pre-wrap;line-height:1.5">${esc(m.text||m.message||m.body||m.content||'')}</div>
        </div>
        <small class="muted">${esc(fmt(m.createdAt||m.date||''))}</small>
      </div>
      <button type="button" class="secondary small" data-r="${esc(m.id)}" style="margin-top:10px">${isRead(m.id)?'✓ Leído':'Marcar como leído'}</button>
    </article>`).join(''):'<div class="empty">No hay mensajes del administrador.</div>';
  card.appendChild(host);
  host.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{markRead(b.dataset.r);render();badge()});
}
function badge(){
  const n=count();
  const item=[...document.querySelectorAll('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item')].find(el=>norm(el.textContent).includes('comunidad'));
  if(!item)return;
  item.querySelectorAll('[class*="community-badge"]').forEach(x=>x.remove());
  if(n){
    const b=document.createElement('span');
    b.className='fc-v81-community-badge';
    b.style.cssText='margin-left:8px;min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:#ef4444;color:#fff';
    b.textContent=String(n);
    item.appendChild(b);
  }
}
async function fetchData(){
  const res=await fetch('/api/data',{cache:'no-store'});
  if(!res.ok)throw new Error();
  const remote=await res.json();
  return remote?.data||remote;
}
function merge(src){
  if(Array.isArray(src?.adminCommunityMessages))data.adminCommunityMessages=src.adminCommunityMessages;
  if(Array.isArray(src?.communityMessages))data.communityMessages=src.communityMessages;
  if(Array.isArray(src?.communityMessageReads))data.communityMessageReads=src.communityMessageReads;
  if(src?.adminMessagesResetV81===true)data.adminMessagesResetV81=true;
}
async function resetOnce(src){
  if(src?.adminMessagesResetV81===true){data.adminMessagesResetV81=true;return false}
  ensure();
  data.adminCommunityMessages=[];
  data.communityMessages=(data.communityMessages||[]).filter(m=>!isAdminMsg(m));
  data.communityMessageReads=[];
  data.adminMessagesResetV81=true;
  data.adminMessagesResetAtV81=new Date().toISOString();
  save();
  return true;
}
let busy=false;
async function sync(){
  if(busy)return;
  busy=true;
  try{
    const src=await fetchData();
    const didReset=await resetOnce(src);
    if(!didReset)merge(src);
  }catch(_){}
  badge();
  render();
  busy=false;
}
document.addEventListener('click',ev=>{
  const item=ev.target.closest('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item');
  if(item&&norm(item.textContent).includes('comunidad')){
    sync();
    setTimeout(render,100);
    setTimeout(render,300);
  }
},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync()});
window.addEventListener('focus',sync);
setTimeout(sync,50);
setInterval(sync,2000);
window.syncAdminMessagesV81=sync;
})();
