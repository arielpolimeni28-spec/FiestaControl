
(function(){
'use strict';

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=v=>Number(v||0);
const salonId=()=>session?.salonId;

async function getState(){
  const r=await fetch('/api/data',{cache:'no-store'});
  if(!r.ok)throw new Error('No se pudo leer la base');
  const raw=await r.json();
  return raw?.data||raw;
}
async function putState(st){
  const r=await fetch('/api/data',{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(st),
    cache:'no-store'
  });
  const out=await r.json().catch(()=>({}));
  if(!r.ok||out.ok===false)throw new Error(out.error||'No se pudo guardar');
}
function replaceLocal(st){
  if(!st||typeof st!=='object')return;
  Object.keys(data).forEach(k=>delete data[k]);
  Object.assign(data,st);
}

/* ============================================================
   FINANZAS V95
   Guardado desde la ÚLTIMA copia del servidor + verificación.
   ============================================================ */
async function saveMovementV95(movement){
  // Primero intenta el endpoint atómico V94 si está disponible.
  try{
    const r=await fetch('/api/finance-v94',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'add',salonId:movement.salonId,movement}),
      cache:'no-store'
    });
    const out=await r.json().catch(()=>({}));
    if(r.ok&&out.ok&&out.state){
      replaceLocal(out.state);
      return out.state;
    }
  }catch(_){}

  // Fallback robusto: lee la base actual, agrega y guarda la copia más nueva.
  const st=await getState();
  st.movements=Array.isArray(st.movements)?st.movements:[];
  if(!st.movements.some(m=>String(m.id)===String(movement.id))){
    st.movements.push(movement);
  }
  await putState(st);

  // Verificación real.
  const verify=await getState();
  if(!(verify.movements||[]).some(m=>String(m.id)===String(movement.id))){
    throw new Error('El servidor no confirmó el movimiento');
  }
  replaceLocal(verify);
  return verify;
}

window.openExpenseIncomeV95=function(kind){
  const expense=['gasto','egreso'].includes(String(kind).toLowerCase());

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${expense?'Registrar egreso':'Ingresar dinero'}</h2>
        <p>${expense?'Salida manual de dinero del salón':'Entrada manual de dinero al salón'}</p>
      </div>
      <button type="button" class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="fc-v95-money">
      <div class="form-grid">
        <div class="field">
          <label>Motivo</label>
          <select name="category">
            ${expense?`
              <option>Compra general</option>
              <option>Servicio</option>
              <option>Pago a proveedor</option>
              <option>Gasto operativo</option>
              <option>Otro egreso</option>
            `:`
              <option>Monto inicial</option>
              <option>Aporte del salón</option>
              <option>Cobro general</option>
              <option>Otro ingreso</option>
            `}
          </select>
        </div>

        <div class="field">
          <label>Importe</label>
          <input name="amount" type="number" min="1" step="0.01" required>
        </div>

        <div class="field">
          <label>Medio de pago</label>
          <select name="method" required>
            <option>Efectivo</option>
            <option>Transferencia</option>
            <option>Mercado Pago</option>
            <option>Tarjeta</option>
            <option>Otro</option>
          </select>
        </div>

        <div class="field">
          <label>Fecha</label>
          <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required>
        </div>

        <div class="field span2">
          <label>Detalle / observación</label>
          <input name="detail">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="${expense?'danger':'primary'}">${expense?'Registrar egreso':'Registrar ingreso'}</button>
      </div>
    </form>
  `);

  const form=document.querySelector('#fc-v95-money');
  form.onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(form));
    const amount=num(f.amount);
    if(amount<=0)return toast('Ingresá un importe válido');

    const mid='mov95_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    const movement={
      id:mid,
      salonId:salonId(),
      type:expense?'Gasto':'Ingreso',
      category:String(f.category||''),
      concept:String(f.detail||'').trim()||String(f.category||''),
      amount,
      method:String(f.method||''),
      movementDate:String(f.date||''),
      manualMovement:true,
      createdAt:new Date().toISOString(),
      sourceKey:'v95:'+mid
    };

    const btn=form.querySelector('[type="submit"]');
    btn.disabled=true;
    btn.textContent='Guardando...';

    try{
      await saveMovementV95(movement);
      closeModal();
      toast(expense?'Egreso guardado correctamente':'Ingreso guardado correctamente');
      view='finance';
      renderSalonShell();
      setTimeout(renderFinanceAuditV95,120);
    }catch(err){
      btn.disabled=false;
      btn.textContent=expense?'Registrar egreso':'Registrar ingreso';
      toast('Error: '+(err.message||err));
    }
  };
};

function moneyFmt(v){
  try{return money(num(v))}catch(_){return '$ '+num(v).toLocaleString('es-AR')}
}
function renderFinanceAuditV95(){
  if(session?.role!=='salon'||view!=='finance')return;
  const content=document.querySelector('#content');
  if(!content)return;

  const ms=(data.movements||[]).filter(m=>String(m.salonId)===String(salonId()));
  const incoming=ms.filter(m=>['ingreso','cobro'].includes(String(m.type||'').toLowerCase()));
  const outgoing=ms.filter(m=>['gasto','egreso'].includes(String(m.type||'').toLowerCase()));
  const inc=incoming.reduce((s,m)=>s+num(m.amount),0);
  const out=outgoing.reduce((s,m)=>s+num(m.amount),0);

  content.querySelector('#fc-v95-finance-summary')?.remove();
  const card=document.createElement('div');
  card.id='fc-v95-finance-summary';
  card.className='card';
  card.style.cssText='margin-bottom:16px;padding:15px';
  card.innerHTML=`
    <div class="section-title">
      <div><h3>📊 Contabilidad general</h3><small class="muted">Movimientos confirmados y guardados.</small></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px">
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px"><small>Total ingresos</small><strong style="display:block;font-size:20px">${moneyFmt(inc)}</strong></div>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px"><small>Total egresos</small><strong style="display:block;font-size:20px">${moneyFmt(out)}</strong></div>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px"><small>Resultado de caja</small><strong style="display:block;font-size:20px">${moneyFmt(inc-out)}</strong></div>
    </div>`;
  content.prepend(card);

  let movementsCard=[...content.querySelectorAll('.card')].find(c=>
    String(c.querySelector('h3')?.textContent||'').toLowerCase().includes('movimientos generales')
  );
  if(!movementsCard){
    movementsCard=document.createElement('div');
    movementsCard.className='card';
    movementsCard.style.marginTop='16px';
    content.appendChild(movementsCard);
  }

  movementsCard.innerHTML=`
    <div class="section-title">
      <div><h3>Movimientos generales</h3><small class="muted">Ingresos y egresos del salón.</small></div>
    </div>
    ${ms.length?`
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Detalle</th><th>Medio</th><th>Importe</th></tr></thead>
          <tbody>${ms.slice().reverse().map(m=>`
            <tr>
              <td>${esc(m.movementDate||'')}</td>
              <td>${esc(m.type||'')}</td>
              <td>${esc(m.category||'')}</td>
              <td>${esc(m.concept||'')}</td>
              <td>${esc(m.method||'')}</td>
              <td><b>${moneyFmt(m.amount)}</b></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`:'<div class="empty">Sin movimientos contables.</div>'}`;
}

/* Captura el clic ANTES que cualquier handler viejo. */
document.addEventListener('click',ev=>{
  if(session?.role!=='salon'||view!=='finance')return;
  const b=ev.target.closest('button');
  if(!b)return;
  const t=String(b.textContent||'').toLowerCase();
  if(t.includes('registrar egreso')){
    ev.preventDefault(); ev.stopImmediatePropagation();
    openExpenseIncomeV95('Gasto');
  }
  if(t.includes('ingresar dinero')){
    ev.preventDefault(); ev.stopImmediatePropagation();
    openExpenseIncomeV95('Ingreso');
  }
},true);


/* ============================================================
   PROMOS DESTACADAS V95
   - menú visible en salón
   - guardado contra la base actual
   - salida pública en HOME y VER SALONES
   ============================================================ */
function currentSalon(){
  return (data.salons||[]).find(s=>String(s.id)===String(salonId()));
}
function promoData(s){
  return {
    title:s.featuredPromoTitle||s.publicPromoTitle||'',
    price:s.featuredPromoPrice||s.publicPromoPrice||'',
    text:s.featuredPromoText||s.publicPromoText||'',
    image:s.featuredPromoImage||s.publicPromoImage||'',
    validUntil:s.featuredPromoValidUntil||s.publicPromoValidUntil||'',
    active:s.featuredPromoActive===true || s.publicPromoActive===true
  };
}
function promoVisible(s){
  if(!s||s.status!=='Aprobado'||s.featuredPromoEnabled!==true)return false;
  const p=promoData(s);
  if(!p.active||!String(p.title).trim())return false;
  if(p.validUntil && new Date(p.validUntil+'T23:59:59')<new Date())return false;
  return true;
}

async function savePromoV95(sid,promo){
  // Intenta endpoint V94.
  try{
    const r=await fetch('/api/promo-v94',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'save',salonId:sid,promo}),
      cache:'no-store'
    });
    const out=await r.json().catch(()=>({}));
    if(r.ok&&out.ok&&out.state){
      replaceLocal(out.state);
      return;
    }
  }catch(_){}

  // Fallback directo sobre la última base real.
  const st=await getState();
  const s=(st.salons||[]).find(x=>String(x.id)===String(sid));
  if(!s)throw new Error('No se encontró el salón');
  if(s.featuredPromoEnabled!==true)throw new Error('El administrador no habilitó la promoción');

  s.featuredPromoTitle=promo.title;
  s.featuredPromoPrice=promo.price;
  s.featuredPromoText=promo.text;
  s.featuredPromoImage=promo.image;
  s.featuredPromoValidUntil=promo.validUntil;
  s.featuredPromoActive=!!promo.active;
  s.featuredPromoUpdatedAt=new Date().toISOString();

  await putState(st);
  const verify=await getState();
  replaceLocal(verify);
}

window.openPromoV95=function(){
  const s=currentSalon();
  if(!s)return;
  if(s.featuredPromoEnabled!==true)return toast('El administrador debe habilitar la Publicación destacada');

  const p=promoData(s);
  showModal(`
    <div class="modal-title">
      <div><h2>⭐ Publicación destacada</h2><p>Esta promoción se mostrará a los clientes en la página principal.</p></div>
      <button class="ghost small" type="button" onclick="closeModal()">✕</button>
    </div>
    <form id="fc-v95-promo">
      <div class="form-grid">
        <div class="field span2"><label>Título</label><input name="title" required value="${esc(p.title)}" placeholder="Ej.: 20% OFF en fiestas de domingo"></div>
        <div class="field"><label>Precio / beneficio</label><input name="price" value="${esc(p.price)}" placeholder="Ej.: Desde $450.000"></div>
        <div class="field"><label>Vigente hasta</label><input name="until" type="date" value="${esc(p.validUntil)}"></div>
        <div class="field span2"><label>Texto de venta</label><textarea name="text">${esc(p.text)}</textarea></div>
        <div class="field span2"><label>Imagen de la promoción</label><input id="fc-v95-promo-img" type="file" accept="image/*">${p.image?`<img id="fc-v95-promo-preview" src="${p.image}" style="display:block;max-width:440px;max-height:230px;object-fit:cover;border-radius:12px;margin-top:8px">`:'<img id="fc-v95-promo-preview" style="display:none;max-width:440px;max-height:230px;object-fit:cover;border-radius:12px;margin-top:8px">'}</div>
        <div class="field span2"><label><input name="active" type="checkbox" ${p.active?'checked':''}> Publicar ahora</label></div>
      </div>
      <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button type="submit" class="primary">Guardar y publicar</button></div>
    </form>`);

  let image=p.image;
  document.querySelector('#fc-v95-promo-img').onchange=e=>{
    const f=e.target.files?.[0]; if(!f)return;
    const r=new FileReader();
    r.onload=()=>{image=r.result;const prev=document.querySelector('#fc-v95-promo-preview');prev.src=image;prev.style.display='block'};
    r.readAsDataURL(f);
  };

  const form=document.querySelector('#fc-v95-promo');
  form.onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(form));
    const btn=form.querySelector('[type="submit"]');
    btn.disabled=true;btn.textContent='Guardando...';
    try{
      await savePromoV95(s.id,{
        title:String(f.title||'').trim(),
        price:String(f.price||'').trim(),
        text:String(f.text||'').trim(),
        image,
        validUntil:String(f.until||''),
        active:form.elements.active.checked
      });
      closeModal();
      toast('Promoción destacada guardada');
      renderSalonShell();
    }catch(err){
      btn.disabled=false;btn.textContent='Guardar y publicar';
      toast('Error: '+err.message);
    }
  };
};

function ensurePromoAccessV95(){
  if(session?.role!=='salon')return;
  const s=currentSalon(); if(!s)return;

  document.querySelectorAll('.fc-v95-promo-button').forEach(x=>x.remove());

  if(s.featuredPromoEnabled===true){
    const top=document.querySelector('.top-actions');
    if(top){
      const b=document.createElement('button');
      b.className='secondary fc-v95-promo-button';
      b.textContent='⭐ Publicación destacada';
      b.onclick=openPromoV95;
      top.prepend(b);
    }

    const nav=document.querySelector('.nav');
    if(nav){
      const b=document.createElement('button');
      b.className='fc-v95-promo-button';
      b.innerHTML='⭐ Promoción destacada';
      b.onclick=openPromoV95;
      nav.appendChild(b);
    }
  }
}

function promoCardsV95(st){
  const list=(st.salons||[]).filter(promoVisible);
  if(!list.length)return '';

  return `<section id="fc-v95-public-promos" style="max-width:1460px;margin:24px auto;padding:0 18px">
    <div style="background:linear-gradient(135deg,#fff7ed,#f5f3ff,#eef2ff);border:1px solid #e9d5ff;border-radius:26px;padding:20px;box-shadow:0 14px 38px rgba(30,41,59,.10)">
      <div style="display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap;margin-bottom:16px">
        <div><div style="font-size:12px;font-weight:900;letter-spacing:.08em">⭐ PROMOS DESTACADAS</div><h2 style="margin:4px 0 0;font-size:30px">Promociones especiales para tu próxima fiesta</h2><small style="color:#64748b">Salones promocionados en FiestaControl</small></div>
        <button class="ghost small" onclick="renderPublicSalonDirectory()">Ver todos los salones →</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px">
        ${list.map(s=>{const p=promoData(s);return `
          <article style="background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 12px 28px rgba(15,23,42,.09)">
            ${p.image?`<img src="${p.image}" alt="${esc(p.title)}" style="width:100%;height:200px;object-fit:cover;display:block">`:'<div style="height:170px;background:linear-gradient(135deg,#ede9fe,#fee2e2);display:flex;align-items:center;justify-content:center;font-size:58px">🎉</div>'}
            <div style="padding:15px">
              <span style="display:inline-block;background:#ef4444;color:white;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900">⭐ DESTACADO</span>
              <h3 style="margin:9px 0 3px;font-size:21px">${esc(p.title)}</h3>
              <b>${esc(s.name||'Salón')}</b>
              ${s.zone?`<small style="display:block;color:#64748b;margin-top:3px">📍 ${esc(s.zone)}</small>`:''}
              ${p.price?`<div style="font-size:21px;font-weight:900;margin-top:9px">${esc(p.price)}</div>`:''}
              ${p.text?`<p style="margin:8px 0 0;line-height:1.45">${esc(p.text)}</p>`:''}
              <button class="primary w100" style="margin-top:13px" onclick="renderPublicSalonPage('${esc(s.id)}')">Ver salón</button>
            </div>
          </article>`}).join('')}
      </div>
    </div>
  </section>`;
}

async function injectPublicPromosV95(){
  if(session)return;
  try{
    const st=await getState();
    document.querySelector('#fc-v95-public-promos')?.remove();
    const html=promoCardsV95(st);
    if(!html)return;
    const h=document.createElement('div');h.innerHTML=html;const sec=h.firstElementChild;

    const home=document.querySelector('.fc-home');
    if(home){
      const hero=home.querySelector('.fc-home-hero');
      if(hero)hero.insertAdjacentElement('afterend',sec);
      else home.prepend(sec);
      return;
    }
    const auth=document.querySelector('.auth');
    if(auth){document.querySelector('#app')?.appendChild(sec);return}
    const results=document.querySelector('#v27-results');
    if(results)results.parentElement.insertBefore(sec,results);
  }catch(_){}
}

/* Se ejecuta último y repara después de renders viejos. */
let lock=false;
const obs=new MutationObserver(()=>{
  if(lock)return;lock=true;
  setTimeout(()=>{
    lock=false;
    renderFinanceAuditV95();
    ensurePromoAccessV95();
    injectPublicPromosV95();
  },70);
});
obs.observe(document.documentElement,{childList:true,subtree:true});

setInterval(()=>{
  renderFinanceAuditV95();
  ensurePromoAccessV95();
  injectPublicPromosV95();
},2000);

setTimeout(()=>{
  renderFinanceAuditV95();
  ensurePromoAccessV95();
  injectPublicPromosV95();
},150);

})();
