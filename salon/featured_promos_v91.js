
(function(){
'use strict';

const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const N=v=>String(v||'').trim().toLowerCase();
const salons=()=>Array.isArray(data?.salons)?data.salons:[];

function currentSalon(){
  return salons().find(s=>String(s.id)===String(session?.salonId));
}
function allowed(s){
  return !!(s && s.featuredPromoEnabled===true);
}
function active(s){
  if(!s || s.status!=='Aprobado' || s.publicProfileEnabled===false) return false;
  if(s.featuredPromoEnabled!==true || s.featuredPromoActive!==true) return false;
  if(!String(s.featuredPromoTitle||'').trim()) return false;
  if(s.featuredPromoValidUntil){
    const end=new Date(String(s.featuredPromoValidUntil)+'T23:59:59');
    if(end < new Date()) return false;
  }
  return true;
}
function promos(){
  return salons().filter(active).sort((a,b)=>
    String(b.featuredPromoUpdatedAt||'').localeCompare(String(a.featuredPromoUpdatedAt||''))
  );
}

function promoCards(){
  const list=promos();
  if(!list.length) return '';
  return `
    <section id="fc-v91-promos" style="max-width:1460px;margin:22px auto 0;padding:0 18px">
      <div style="background:linear-gradient(135deg,#fff7ed 0%,#f5f3ff 55%,#eef2ff 100%);
                  border:1px solid #e9d5ff;border-radius:26px;padding:20px;
                  box-shadow:0 14px 38px rgba(30,41,59,.10)">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:16px">
          <div>
            <div style="font-size:12px;font-weight:900;letter-spacing:.08em">⭐ PROMOS DESTACADAS</div>
            <h2 style="margin:4px 0 2px;font-size:30px">Ofertas especiales de nuestros salones</h2>
            <small style="color:#64748b">Promociones seleccionadas y habilitadas por FiestaControl</small>
          </div>
          <button class="ghost small" onclick="renderPublicSalonDirectory()">Ver todos los salones →</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px">
          ${list.slice(0,6).map(s=>`
            <article style="background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;
                            box-shadow:0 12px 28px rgba(15,23,42,.09)">
              ${s.featuredPromoImage
                ? `<img src="${s.featuredPromoImage}" alt="${E(s.featuredPromoTitle)}"
                        style="width:100%;height:190px;object-fit:cover;display:block">`
                : `<div style="height:160px;background:linear-gradient(135deg,#ede9fe,#fee2e2);
                               display:flex;align-items:center;justify-content:center;font-size:58px">🎉</div>`}
              <div style="padding:15px">
                <span style="display:inline-block;background:#ef4444;color:#fff;border-radius:999px;
                             padding:5px 9px;font-size:10px;font-weight:900">⭐ DESTACADO</span>
                <h3 style="margin:9px 0 3px;font-size:21px">${E(s.featuredPromoTitle)}</h3>
                <b style="display:block">${E(s.name||'Salón')}</b>
                ${s.zone?`<small style="display:block;color:#64748b;margin-top:3px">📍 ${E(s.zone)}</small>`:''}
                ${s.featuredPromoPrice?`<div style="font-size:21px;font-weight:900;margin-top:9px">${E(s.featuredPromoPrice)}</div>`:''}
                ${s.featuredPromoText?`<p style="margin:8px 0 0;line-height:1.45">${E(s.featuredPromoText)}</p>`:''}
                ${s.featuredPromoValidUntil?`<small style="display:block;color:#64748b;margin-top:8px">
                  Vigente hasta ${E(s.featuredPromoValidUntil)}</small>`:''}
                <button class="primary w100" style="margin-top:13px"
                        onclick="renderPublicSalonPage('${E(s.id)}')">Ver salón</button>
              </div>
            </article>`).join('')}
        </div>
      </div>
    </section>`;
}

function injectPublic(){
  document.querySelectorAll('#fc-v91-promos').forEach(x=>x.remove());
  const html=promoCards();
  if(!html) return;

  const holder=document.createElement('div');
  holder.innerHTML=html;
  const section=holder.firstElementChild;

  const home=document.querySelector('.fc-home');
  if(home){
    const features=home.querySelector('.fc-home-features');
    if(features) home.insertBefore(section,features);
    else home.appendChild(section);
    return;
  }

  const auth=document.querySelector('.auth');
  if(auth){
    const app=document.querySelector('#app');
    if(app) app.appendChild(section);
    return;
  }

  const results=document.querySelector('#v27-results');
  if(results && results.parentElement){
    results.parentElement.insertBefore(section,results);
  }
}

function promoForm(){
  const s=currentSalon();
  if(!s || !allowed(s)) return toast('La publicación destacada debe ser habilitada por el administrador');

  showModal(`
    <div class="modal-title">
      <div>
        <h2>⭐ Publicación destacada</h2>
        <p>Cargá la promoción que aparecerá en la portada pública de FiestaControl.</p>
      </div>
      <button type="button" class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="fc-v91-promo-form">
      <div class="form-grid">
        <div class="field span2">
          <label>Título de venta</label>
          <input name="title" maxlength="80" required value="${E(s.featuredPromoTitle||'')}"
                 placeholder="Ej.: 20% OFF en fiestas de domingo">
        </div>
        <div class="field">
          <label>Precio / beneficio</label>
          <input name="price" maxlength="70" value="${E(s.featuredPromoPrice||'')}"
                 placeholder="Ej.: Desde $450.000">
        </div>
        <div class="field">
          <label>Vigente hasta</label>
          <input name="until" type="date" value="${E(s.featuredPromoValidUntil||'')}">
        </div>
        <div class="field span2">
          <label>Texto de venta</label>
          <textarea name="text" maxlength="350"
                    placeholder="Explicá qué incluye la promo">${E(s.featuredPromoText||'')}</textarea>
        </div>
        <div class="field span2">
          <label>Imagen principal de la promoción</label>
          <input id="fc-v91-promo-image" type="file" accept="image/*">
          ${s.featuredPromoImage
            ? `<img id="fc-v91-preview" src="${s.featuredPromoImage}"
                    style="display:block;width:100%;max-width:440px;max-height:230px;object-fit:cover;
                           border-radius:12px;margin-top:8px">`
            : `<img id="fc-v91-preview"
                    style="display:none;width:100%;max-width:440px;max-height:230px;object-fit:cover;
                           border-radius:12px;margin-top:8px">`}
        </div>
        <div class="field span2">
          <label style="display:flex;gap:10px;align-items:center">
            <input name="active" type="checkbox" ${s.featuredPromoActive===true?'checked':''}>
            <span><b>Publicar ahora</b><br><small>Al guardar aparecerá en la pantalla principal.</small></span>
          </label>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar y publicar</button>
      </div>
    </form>`);

  let image=s.featuredPromoImage||'';
  document.querySelector('#fc-v91-promo-image').onchange=e=>{
    const f=e.target.files?.[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      image=r.result;
      const p=document.querySelector('#fc-v91-preview');
      p.src=image; p.style.display='block';
    };
    r.readAsDataURL(f);
  };

  document.querySelector('#fc-v91-promo-form').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    s.featuredPromoTitle=String(fd.get('title')||'').trim();
    s.featuredPromoPrice=String(fd.get('price')||'').trim();
    s.featuredPromoText=String(fd.get('text')||'').trim();
    s.featuredPromoValidUntil=String(fd.get('until')||'');
    s.featuredPromoImage=image;
    s.featuredPromoActive=e.target.elements.active.checked;
    s.featuredPromoUpdatedAt=new Date().toISOString();
    save();
    closeModal();
    toast('Promoción destacada guardada');
    setTimeout(()=>{ if(typeof renderSalonShell==='function') renderSalonShell(); },80);
  };
}
window.openFeaturedPromoV91=promoForm;

function injectSalonAccess(){
  if(session?.role!=='salon') return;
  const s=currentSalon();
  if(!s) return;

  document.querySelectorAll('.fc-v91-promo-access').forEach(x=>x.remove());

  // Always show in "Mi salón"; if enabled, it is actionable.
  const content=document.querySelector('#content');
  if(view==='profile' && content){
    const card=document.createElement('div');
    card.className='card fc-v91-promo-access';
    card.style.cssText='margin-top:16px;padding:16px';
    card.innerHTML=allowed(s)?`
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 4px">⭐ Publicación destacada</h3>
          <small class="muted">Habilitada por FiestaControl. Cargá tu promoción paga para la portada.</small>
        </div>
        <span style="font-size:12px;font-weight:800;padding:6px 10px;border-radius:999px;background:#ecfdf5">HABILITADA</span>
      </div>
      <div style="margin-top:14px">
        <button class="primary" onclick="openFeaturedPromoV91()">
          ${s.featuredPromoTitle?'Editar promoción':'Cargar promoción'}
        </button>
      </div>`:`
      <div>
        <h3 style="margin:0 0 4px">⭐ Publicación destacada</h3>
        <small class="muted">Esta opción es paga y debe ser habilitada por el administrador general.</small>
      </div>
      <div class="admin-notice" style="margin-top:12px">
        <span>🔒</span><div><b>No habilitada</b><small>Consultá con FiestaControl para activarla.</small></div>
      </div>`;
    content.appendChild(card);
  }

  // When enabled, also show a quick top button so it is impossible to miss.
  if(allowed(s)){
    const top=document.querySelector('.top-actions');
    if(top && !top.querySelector('.fc-v91-promo-access')){
      const b=document.createElement('button');
      b.className='secondary fc-v91-promo-access';
      b.textContent='⭐ Promo destacada';
      b.onclick=promoForm;
      top.prepend(b);
    }
  }
}

// Re-run after any legacy renderer replaces the DOM.
let queued=false;
const obs=new MutationObserver(()=>{
  if(queued)return;
  queued=true;
  setTimeout(()=>{
    queued=false;
    injectPublic();
    injectSalonAccess();
  },50);
});
obs.observe(document.documentElement,{childList:true,subtree:true});

window.addEventListener('focus',()=>{injectPublic();injectSalonAccess()});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){injectPublic();injectSalonAccess()}
});

setTimeout(()=>{injectPublic();injectSalonAccess()},100);
setTimeout(()=>{injectPublic();injectSalonAccess()},500);

})();
