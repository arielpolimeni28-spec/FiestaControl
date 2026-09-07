
// FiestaControl V79 - fija el contenido REAL de "Mensajes del administrador"
(function(){
'use strict';

const norm79=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc79=v=>String(v??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const fmt79=v=>{
  if(!v)return '';
  try{return new Date(v).toLocaleString('es-AR')}catch(_){return String(v)}
};

function sess79(){try{return session||{}}catch(_){return window.session||{}}}
function audience79(){
  const s=sess79();
  const r=norm79(s.role||s.userRole||s.type||s.userType||'');
  if(r.includes('provider')||r.includes('proveedor')||r.includes('supplier'))return 'provider';
  if(r.includes('salon'))return 'salon';

  const side=norm79(document.querySelector('.sidebar')?.innerText||'');
  if(side.includes('portal proveedor'))return 'provider';
  if(side.includes('panel del salon')||side.includes('salon activo'))return 'salon';
  return '';
}
function allowed79(m){
  const a=audience79();
  if(!a)return false;

  // Regla V80:
  // Todo mensaje enviado por admin@fiestacontrol.com es global
  // y debe verse en TODOS los salones y proveedores.
  if(adminGeneric79(m))return a==='salon'||a==='provider';

  const aud=norm79(m.audience||m.target||m.to||'all');
  if(!aud||['all','todos','ambos'].includes(aud))return true;
  if(a==='salon' && ['salon','salons','salones'].includes(aud))return true;
  if(a==='provider' && ['provider','providers','proveedor','proveedores','supplier'].includes(aud))return true;
  return false;
}
function adminGeneric79(m){
  const from=norm79(m.from||m.fromEmail||m.email||m.author||m.authorEmail||m.createdBy||m.createdByEmail||'');
  return from==='admin@fiestacontrol.com';
}
function allAdminMessages79(){
  const out=new Map();

  (data.adminCommunityMessages||[]).forEach(m=>{
    if(!m||m.active===false)return;

    // La colección adminCommunityMessages es el canal oficial de admin@fiestacontrol.com.
    // Se fuerza como mensaje global para salones y proveedores.
    const mm={
      ...m,
      from:m.from||m.fromEmail||m.authorEmail||'admin@fiestacontrol.com',
      audience:'all'
    };
    if(allowed79(mm))out.set(String(mm.id),mm);
  });

  // Compatibilidad: si alguna versión guardó el mensaje admin en communityMessages.
  (data.communityMessages||[]).forEach(m=>{
    if(m&&m.active!==false&&adminGeneric79(m)&&allowed79(m)){
      const mm={
        ...m,
        title:m.title||m.subject||'Mensaje del administrador',
        text:m.text||m.message||m.body||m.content||'',
        priority:m.priority||'normal'
      };
      out.set(String(mm.id),mm);
    }
  });

  return [...out.values()].sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
}
function userKey79(){
  const s=sess79();
  return String(s.salonId||s.providerId||s.supplierId||s.marketSupplierId||s.userId||s.id||s.email||s.userEmail||'anon');
}
function ensureRead79(){data.communityMessageReads=data.communityMessageReads||[]}
function isRead79(idv){
  ensureRead79();
  const u=userKey79();
  return data.communityMessageReads.some(r=>String(r.messageId)===String(idv)&&String(r.userKey)===u);
}
function markRead79(idv){
  ensureRead79();
  if(isRead79(idv))return;
  data.communityMessageReads.push({id:id(),messageId:idv,userKey:userKey79(),readAt:new Date().toISOString()});
  save();
}
function findAdminCard79(){
  const heads=[...document.querySelectorAll('h1,h2,h3,h4,b,strong')];
  const h=heads.find(x=>norm79(x.textContent).includes('mensajes del administrador'));
  if(!h)return null;
  return h.closest('.card')||h.parentElement?.parentElement||null;
}
function renderCard79(){
  const card=findAdminCard79();
  if(!card||!audience79())return;

  const msgs=allAdminMessages79();
  const fingerprint=msgs.map(m=>`${m.id}:${isRead79(m.id)?1:0}:${m.createdAt||m.date||''}`).join('|');
  if(card.dataset.v79Fingerprint===fingerprint && card.querySelector('.fc-v79-admin-list'))return;

  card.dataset.v79Fingerprint=fingerprint;

  // conserva encabezado, reemplaza solamente el contenido inferior
  const sectionTitle=card.querySelector('.section-title') || card.querySelector('h3')?.parentElement;
  [...card.children].forEach(ch=>{
    if(ch!==sectionTitle)ch.remove();
  });

  const host=document.createElement('div');
  host.className='fc-v79-admin-list';
  host.style.marginTop='12px';

  if(!msgs.length){
    host.innerHTML='<div class="empty">No hay mensajes del administrador.</div>';
  }else{
    host.innerHTML=msgs.map(m=>`
      <article style="padding:14px 0;border-bottom:1px solid #e5e7eb">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div style="min-width:0;flex:1">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <b>${m.priority==='important'?'⚠️ ':''}${esc79(m.title||m.subject||'Mensaje del administrador')}</b>
              ${isRead79(m.id)?'<span style="font-size:11px;color:#64748b">LEÍDO</span>':'<span style="font-size:11px;font-weight:800">NUEVO</span>'}
            </div>
            <div style="margin-top:7px;white-space:pre-wrap;line-height:1.5">${esc79(m.text||m.message||m.body||m.content||'')}</div>
          </div>
          <small class="muted">${esc79(fmt79(m.createdAt||m.date||''))}</small>
        </div>
        <div style="margin-top:10px">
          <button type="button" class="secondary small" data-v79-read="${esc79(m.id)}">
            ${isRead79(m.id)?'✓ Leído':'Marcar como leído'}
          </button>
        </div>
      </article>
    `).join('');
  }

  card.appendChild(host);

  host.querySelectorAll('[data-v79-read]').forEach(btn=>{
    btn.onclick=()=>{
      markRead79(btn.dataset.v79Read);
      card.dataset.v79Fingerprint='';
      renderCard79();
      updateBadge79();
    };
  });
}

function updateBadge79(){
  const count=allAdminMessages79().filter(m=>!isRead79(m.id)).length;
  const candidates=[...document.querySelectorAll('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item')];
  const item=candidates.find(el=>norm79(el.textContent).includes('comunidad'));
  if(!item)return;

  item.querySelectorAll('.fc-v77-community-badge,.fc-v78-community-badge,.fc-v79-community-badge').forEach(x=>x.remove());
  if(count){
    const b=document.createElement('span');
    b.className='fc-v79-community-badge';
    b.style.cssText='margin-left:8px;min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:#ef4444;color:#fff';
    b.textContent=String(count);
    item.appendChild(b);
  }
}

async function sync79(){
  if(!audience79())return;
  try{
    const res=await fetch('/api/data',{cache:'no-store'});
    if(!res.ok)return;
    const remote=await res.json();
    const src=(remote&&remote.data)?remote.data:remote;

    if(Array.isArray(src?.adminCommunityMessages)){
      data.adminCommunityMessages=src.adminCommunityMessages;
    }
    if(Array.isArray(src?.communityMessages)){
      data.communityMessages=src.communityMessages;
    }
    if(Array.isArray(src?.communityMessageReads)){
      data.communityMessageReads=src.communityMessageReads;
    }

    updateBadge79();
    renderCard79();
  }catch(_){}
}

function init79(){
  updateBadge79();
  renderCard79();

  const observer=new MutationObserver(()=>{
    renderCard79();
    updateBadge79();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  setInterval(sync79,4000);
  setTimeout(sync79,300);
  setTimeout(renderCard79,700);
}

setTimeout(init79,100);
window.renderAdminMessages79=renderCard79;
})();
