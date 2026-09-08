
(function(){
'use strict';

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=v=>Number(v||0);
const sid=()=>session?.salonId;
const moneyFmt=v=>{try{return money(num(v))}catch(_){return '$ '+num(v).toLocaleString('es-AR')}};

async function post(url,body){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const out=await r.json().catch(()=>({}));
  if(!r.ok||!out.ok) throw new Error(out.error||('HTTP '+r.status));
  return out;
}
function replaceState(st){
  if(!st||typeof st!=='object')return;
  Object.keys(data).forEach(k=>delete data[k]);
  Object.assign(data,st);
}

/* ==========================
   CONTABILIDAD
   ========================== */
function salonMovements(){
  return (data.movements||[]).filter(m=>String(m.salonId)===String(sid()));
}
function isIn(m){return ['ingreso','cobro'].includes(String(m.type||'').toLowerCase())}
function isOut(m){return ['gasto','egreso'].includes(String(m.type||'').toLowerCase())}

window.fcMoneyV94=function(kind){
  const expense=['gasto','egreso'].includes(String(kind).toLowerCase());
  showModal(`
    <div class="modal-title">
      <div><h2>${expense?'Registrar egreso':'Ingresar dinero'}</h2>
      <p>${expense?'Salida manual de dinero':'Entrada manual de dinero'}</p></div>
      <button type="button" class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="fc-money-v94">
      <div class="form-grid">
        <div class="field"><label>Motivo</label>
          <select name="category">
            ${expense?'<option>Compra general</option><option>Servicio</option><option>Pago a proveedor</option><option>Gasto operativo</option><option>Otro egreso</option>':
            '<option>Monto inicial</option><option>Aporte del salón</option><option>Cobro general</option><option>Otro ingreso</option>'}
          </select>
        </div>
        <div class="field"><label>Importe</label><input name="amount" type="number" min="1" step="0.01" required></div>
        <div class="field"><label>Medio</label>
          <select name="method"><option>Efectivo</option><option>Transferencia</option><option>Mercado Pago</option><option>Tarjeta</option><option>Otro</option></select>
        </div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
        <div class="field span2"><label>Detalle</label><input name="detail"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="${expense?'danger':'primary'}" type="submit">${expense?'Registrar egreso':'Registrar ingreso'}</button>
      </div>
    </form>`);

  document.querySelector('#fc-money-v94').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const amount=num(f.amount);
    if(amount<=0)return toast('Ingresá un importe válido');
    const mid='mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    const movement={
      id:mid,salonId:sid(),type:expense?'Gasto':'Ingreso',
      category:String(f.category||''),amount,
      method:String(f.method||''),movementDate:String(f.date||''),
      concept:String(f.detail||'').trim() || String(f.category||''),
      manualMovement:true,createdAt:new Date().toISOString()
    };
    const submit=e.target.querySelector('[type="submit"]');
    submit.disabled=true;
    submit.textContent='Guardando...';
    try{
      const out=await post('/api/finance-v94',{action:'add',salonId:sid(),movement});
      replaceState(out.state);
      closeModal();
      toast(expense?'Egreso guardado':'Ingreso guardado');
      view='finance';
      renderSalonShell();
    }catch(err){
      submit.disabled=false;
      submit.textContent=expense?'Registrar egreso':'Registrar ingreso';
      toast('Error al guardar: '+err.message);
    }
  };
};

window.fcResetFinanceV94=async function(){
  if(!confirm('¿Poner TODA la contabilidad del salón en $0? No se borran salones, proveedores, fiestas ni productos.'))return;
  try{
    const out=await post('/api/finance-v94',{action:'reset',salonId:sid()});
    replaceState(out.state);
    toast('Contabilidad reiniciada en $0');
    view='finance';renderSalonShell();
  }catch(err){toast('No se pudo reiniciar: '+err.message)}
};

function financePanel(){
  if(session?.role!=='salon'||view!=='finance')return;
  const content=document.querySelector('#content'); if(!content)return;

  const ms=salonMovements();
  const income=ms.filter(isIn).reduce((a,m)=>a+num(m.amount),0);
  const expense=ms.filter(isOut).reduce((a,m)=>a+num(m.amount),0);
  const balance=income-expense;
  const methods={Efectivo:0,Transferencia:0,'Mercado Pago':0,Tarjeta:0,Otro:0};
  ms.filter(isIn).forEach(m=>{
    const x=String(m.method||'').toLowerCase();
    let k=x.includes('efect')?'Efectivo':x.includes('transfer')?'Transferencia':x.includes('mercado')?'Mercado Pago':x.includes('tarjet')?'Tarjeta':'Otro';
    methods[k]+=num(m.amount);
  });

  ['#v11-finance-dashboard','#v86-payment-dashboard','#v87-payment-dashboard','#v88-payment-dashboard','#v92-payment-dashboard','#fc-v94-finance'].forEach(sel=>content.querySelector(sel)?.remove());

  const board=document.createElement('div');
  board.id='fc-v94-finance';board.className='card';board.style.cssText='margin-bottom:16px;padding:15px';
  board.innerHTML=`
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      <div><h3 style="margin:0">📊 Caja y medios de pago</h3><small class="muted">Movimientos guardados en el servidor.</small></div>
      <div style="display:flex;gap:18px;flex-wrap:wrap">
        <div><small>Ingresos</small><b style="display:block">${moneyFmt(income)}</b></div>
        <div><small>Egresos</small><b style="display:block">${moneyFmt(expense)}</b></div>
        <div><small>Resultado</small><b style="display:block">${moneyFmt(balance)}</b></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px">
      ${Object.entries(methods).map(([k,v])=>`<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px"><small>${k}</small><b style="display:block">${moneyFmt(v)}</b></div>`).join('')}
    </div>`;
  content.prepend(board);

  let general=[...content.querySelectorAll('.card')].find(c=>String(c.querySelector('h3')?.textContent||'').toLowerCase().includes('movimientos generales'));
  if(!general){general=document.createElement('div');general.className='card';general.style.marginTop='16px';content.appendChild(general)}
  general.innerHTML=`<div class="section-title"><div><h3>Movimientos generales</h3><small class="muted">Ingresos y egresos confirmados por el servidor.</small></div></div>
  ${ms.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Detalle</th><th>Medio</th><th>Importe</th></tr></thead>
  <tbody>${ms.slice().reverse().map(m=>`<tr><td>${esc(m.movementDate||'')}</td><td>${esc(m.type||'')}</td><td>${esc(m.category||'')}</td><td>${esc(m.concept||'')}</td><td>${esc(m.method||'')}</td><td><b>${moneyFmt(m.amount)}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sin movimientos contables.</div>'}`;

  document.querySelectorAll('button').forEach(b=>{
    const t=String(b.textContent||'').toLowerCase();
    if(t.includes('ingresar dinero')){b.onclick=()=>fcMoneyV94('Ingreso');b.removeAttribute('onclick')}
    if(t.includes('registrar egreso')){b.onclick=()=>fcMoneyV94('Gasto');b.removeAttribute('onclick')}
    if(t.includes('poner movimientos en $0')){b.onclick=()=>fcResetFinanceV94();b.removeAttribute('onclick')}
  });
}

/* ==========================
   PROMOS DESTACADAS
   ========================== */
function salonNow(){return (data.salons||[]).find(s=>String(s.id)===String(sid()))}
function promoActive(s){
  if(!s||s.status!=='Aprobado'||s.featuredPromoEnabled!==true||s.featuredPromoActive!==true||!String(s.featuredPromoTitle||'').trim())return false;
  if(s.featuredPromoValidUntil && new Date(s.featuredPromoValidUntil+'T23:59:59')<new Date())return false;
  return true;
}
window.fcPromoEditorV94=function(){
  const s=salonNow(); if(!s)return;
  if(s.featuredPromoEnabled!==true)return toast('El administrador todavía no habilitó la publicación destacada');
  showModal(`<div class="modal-title"><div><h2>⭐ Publicación destacada</h2><p>Se verá en la portada pública de FiestaControl.</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
  <form id="fc-promo-v94"><div class="form-grid">
    <div class="field span2"><label>Título</label><input name="title" required value="${esc(s.featuredPromoTitle||'')}" placeholder="Ej.: 20% OFF en fiestas de domingo"></div>
    <div class="field"><label>Precio / beneficio</label><input name="price" value="${esc(s.featuredPromoPrice||'')}"></div>
    <div class="field"><label>Vigente hasta</label><input name="until" type="date" value="${esc(s.featuredPromoValidUntil||'')}"></div>
    <div class="field span2"><label>Texto de venta</label><textarea name="text">${esc(s.featuredPromoText||'')}</textarea></div>
    <div class="field span2"><label>Imagen</label><input id="fc-promo-img-v94" type="file" accept="image/*">${s.featuredPromoImage?`<img id="fc-promo-prev-v94" src="${s.featuredPromoImage}" style="display:block;max-width:420px;max-height:220px;object-fit:cover;border-radius:12px;margin-top:8px">`:'<img id="fc-promo-prev-v94" style="display:none;max-width:420px;max-height:220px;object-fit:cover;border-radius:12px;margin-top:8px">'}</div>
    <div class="field span2"><label><input name="active" type="checkbox" ${s.featuredPromoActive===true?'checked':''}> Publicar ahora</label></div>
  </div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary" type="submit">Guardar promoción</button></div></form>`);
  let image=s.featuredPromoImage||'';
  document.querySelector('#fc-promo-img-v94').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{image=r.result;const p=document.querySelector('#fc-promo-prev-v94');p.src=image;p.style.display='block'};r.readAsDataURL(f)};
  document.querySelector('#fc-promo-v94').onsubmit=async e=>{
    e.preventDefault(); const f=Object.fromEntries(new FormData(e.target));
    try{
      const out=await post('/api/promo-v94',{action:'save',salonId:s.id,promo:{title:f.title,price:f.price,text:f.text,validUntil:f.until,image,active:e.target.elements.active.checked}});
      replaceState(out.state); closeModal(); toast('Promoción guardada'); renderSalonShell();
    }catch(err){toast('No se pudo guardar: '+err.message)}
  };
};

function promoSalonAccess(){
  if(session?.role!=='salon')return;
  const s=salonNow(); if(!s)return;
  document.querySelectorAll('.fc-promo-access-v94').forEach(x=>x.remove());
  const top=document.querySelector('.top-actions');
  if(top && s.featuredPromoEnabled===true){
    const b=document.createElement('button');b.className='secondary fc-promo-access-v94';b.textContent='⭐ Promo destacada';b.onclick=fcPromoEditorV94;top.prepend(b);
  }
  if(view==='profile'){
    const content=document.querySelector('#content');if(!content)return;
    const card=document.createElement('div');card.className='card fc-promo-access-v94';card.style.marginTop='16px';
    card.innerHTML=s.featuredPromoEnabled===true?`<h3>⭐ Publicación destacada</h3><p class="muted">Habilitada por el administrador. Cargá la promoción que aparecerá en la portada.</p><button class="primary" onclick="fcPromoEditorV94()">${s.featuredPromoTitle?'Editar promoción':'Cargar promoción'}</button>`:`<h3>⭐ Publicación destacada</h3><p class="muted">Opción paga. Debe habilitarla el administrador general.</p>`;
    content.appendChild(card);
  }
}

function promoHtml(){
  const list=(data.salons||[]).filter(promoActive);
  if(!list.length)return '';
  return `<section id="fc-promos-home-v94" style="max-width:1460px;margin:22px auto;padding:0 18px"><div style="background:linear-gradient(135deg,#fff7ed,#f5f3ff);padding:20px;border-radius:24px;border:1px solid #e9d5ff">
  <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap"><div><div style="font-weight:900">⭐ PROMOS DESTACADAS</div><h2 style="margin:4px 0">Ofertas especiales de nuestros salones</h2></div><button class="ghost small" onclick="renderPublicSalonDirectory()">Ver salones →</button></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:14px">${list.map(s=>`<article style="background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 25px rgba(15,23,42,.08)">${s.featuredPromoImage?`<img src="${s.featuredPromoImage}" style="width:100%;height:190px;object-fit:cover">`:'<div style="height:150px;display:flex;align-items:center;justify-content:center;font-size:54px;background:#ede9fe">🎉</div>'}<div style="padding:14px"><span style="background:#ef4444;color:#fff;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900">DESTACADO</span><h3>${esc(s.featuredPromoTitle)}</h3><b>${esc(s.name)}</b>${s.featuredPromoPrice?`<div style="font-size:20px;font-weight:900;margin-top:8px">${esc(s.featuredPromoPrice)}</div>`:''}${s.featuredPromoText?`<p>${esc(s.featuredPromoText)}</p>`:''}<button class="primary w100" onclick="renderPublicSalonPage('${esc(s.id)}')">Ver salón</button></div></article>`).join('')}</div></div></section>`;
}
function injectPromosHome(){
  document.querySelector('#fc-promos-home-v94')?.remove();
  const html=promoHtml(); if(!html)return;
  const holder=document.createElement('div');holder.innerHTML=html;const sec=holder.firstElementChild;
  const home=document.querySelector('.fc-home');
  if(home){const features=home.querySelector('.fc-home-features');features?home.insertBefore(sec,features):home.appendChild(sec);return}
  const auth=document.querySelector('.auth');
  if(auth){document.querySelector('#app')?.appendChild(sec);return}
  const results=document.querySelector('#v27-results');
  if(results)results.parentElement.insertBefore(sec,results);
}

async function refreshPublicPromos(){
  if(session)return;
  try{
    const r=await fetch('/api/data',{cache:'no-store'});
    if(r.ok){const st=await r.json();replaceState(st);injectPromosHome()}
  }catch(_){}
}

let busy=false;
const obs=new MutationObserver(()=>{if(busy)return;busy=true;setTimeout(()=>{busy=false;financePanel();promoSalonAccess();injectPromosHome()},60)});
obs.observe(document.documentElement,{childList:true,subtree:true});
setInterval(()=>{financePanel();promoSalonAccess();if(!session)refreshPublicPromos()},2000);
setTimeout(()=>{financePanel();promoSalonAccess();injectPromosHome()},120);
})();
