
(function(){
'use strict';

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const n=v=>Number(v||0);
const sid=()=>session?.salonId;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cash=v=>{try{return money(n(v))}catch(_){return '$ '+n(v).toLocaleString('es-AR')}};

function modal(html){
  const d=q('#modal'), b=q('#modal-body');
  if(!d||!b){alert('No se encontró la ventana del sistema');return false}
  b.innerHTML=html;
  try{ if(!d.open)d.showModal(); }catch(_){d.setAttribute('open','open')}
  return true;
}
function close(){const d=q('#modal');if(!d)return;try{d.close()}catch(_){d.removeAttribute('open')}}
function notify(s){try{toast(s)}catch(_){alert(s)}}

async function getState(){
  const r=await fetch('/api/data',{cache:'no-store'});
  if(!r.ok)throw Error('No se pudo leer la base');
  const j=await r.json(); return j?.data||j;
}
function local(st){
  if(!st||typeof st!=='object')return;
  Object.keys(data).forEach(k=>delete data[k]); Object.assign(data,st);
}
async function post(url,body){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false)throw Error(j.error||'Error del servidor');
  if(j.state)local(j.state);
  return j;
}
async function put(st){
  const r=await fetch('/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(st),cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false)throw Error(j.error||'No se pudo guardar');
}

/* FINANZAS: no se vuelve a dibujar la pantalla mientras el usuario hace clic. */
function openMovement(expense){
  if(!modal(`
  <div class="modal-title"><div><h2>${expense?'Registrar egreso':'Ingresar dinero'}</h2><p>Movimiento manual de caja.</p></div><button class="ghost small" id="x102">✕</button></div>
  <form id="money102"><div class="form-grid">
    <div class="field"><label>Concepto</label><select name="category">${expense?'<option>Compra general</option><option>Servicio</option><option>Pago a proveedor</option><option>Gasto operativo</option><option>Otro egreso</option>':'<option>Monto inicial</option><option>Aporte del salón</option><option>Cobro general</option><option>Otro ingreso</option>'}</select></div>
    <div class="field"><label>Importe</label><input name="amount" type="number" min="1" step=".01" required></div>
    <div class="field"><label>Medio de pago</label><select name="method"><option>Efectivo</option><option>Transferencia</option><option>Mercado Pago</option><option>Tarjeta</option><option>Otro</option></select></div>
    <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
    <div class="field span2"><label>Detalle</label><input name="detail"></div>
  </div><div class="form-actions"><button type="button" class="ghost" id="cancel102">Cancelar</button><button type="submit" class="${expense?'danger':'primary'}">${expense?'Guardar egreso':'Guardar ingreso'}</button></div></form>`))return;

  q('#x102').onclick=close; q('#cancel102').onclick=close;
  const f=q('#money102');
  f.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(f), amount=n(fd.get('amount'));
    if(amount<=0)return notify('Ingresá un importe válido');
    const movement={id:'m102_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),salonId:sid(),type:expense?'Gasto':'Ingreso',category:String(fd.get('category')||''),concept:String(fd.get('detail')||'').trim()||String(fd.get('category')||''),amount,method:String(fd.get('method')||''),movementDate:String(fd.get('date')||''),manualMovement:true,createdAt:new Date().toISOString()};
    const b=f.querySelector('[type=submit]');b.disabled=true;b.textContent='Guardando...';
    try{
      let saved=false;
      try{
        const out=await post('/api/finance-v94',{action:'add',salonId:sid(),movement});
        saved=!!(out.state?.movements||[]).find(x=>String(x.id)===movement.id);
      }catch(_){}
      if(!saved){
        const st=await getState(); st.movements=Array.isArray(st.movements)?st.movements:[];
        st.movements.push(movement); await put(st);
      }
      const verify=await getState();
      if(!(verify.movements||[]).some(x=>String(x.id)===movement.id))throw Error('El movimiento no quedó grabado');
      local(verify); close(); notify(expense?'Egreso guardado correctamente':'Ingreso guardado correctamente');
      drawFinanceDashboard();
    }catch(err){b.disabled=false;b.textContent=expense?'Guardar egreso':'Guardar ingreso';notify('Error: '+err.message)}
  };
}

async function resetFinance(){
  if(!confirm('¿Poner todos los movimientos contables del salón en $0? No se borran salones, proveedores, fiestas, productos ni stock.'))return;
  try{
    let ok=false;
    try{const out=await post('/api/finance-v94',{action:'reset',salonId:sid()});ok=!!out.state}catch(_){}
    if(!ok){
      const st=await getState();
      st.movements=(st.movements||[]).filter(x=>String(x.salonId)!==String(sid()));
      await put(st); local(await getState());
    }
    notify('Movimientos contables puestos en $0'); drawFinanceDashboard();
  }catch(err){notify('Error: '+err.message)}
}

/* Captura SIEMPRE los tres botones visibles, incluso si los dibujó código viejo. */
document.addEventListener('click',function(e){
  if(session?.role!=='salon')return;
  const b=e.target.closest('button'); if(!b)return;
  const t=String(b.textContent||'').trim().toLowerCase();
  if(t.includes('ingresar dinero')){
    e.preventDefault();e.stopImmediatePropagation();openMovement(false);return;
  }
  if(t.includes('registrar egreso')){
    e.preventDefault();e.stopImmediatePropagation();openMovement(true);return;
  }
  if(t.includes('poner movimientos en $0')||t.includes('poner movimientos en $ 0')){
    e.preventDefault();e.stopImmediatePropagation();resetFinance();return;
  }
},true);

function drawFinanceDashboard(){
  if(session?.role!=='salon'||view!=='finance')return;
  const c=q('#content');if(!c)return;
  const ms=(data.movements||[]).filter(x=>String(x.salonId)===String(sid()));
  const inc=ms.filter(x=>['ingreso','cobro'].includes(String(x.type||'').toLowerCase()));
  const out=ms.filter(x=>['gasto','egreso'].includes(String(x.type||'').toLowerCase()));
  const ti=inc.reduce((a,x)=>a+n(x.amount),0),te=out.reduce((a,x)=>a+n(x.amount),0);
  const methods={Efectivo:0,Transferencia:0,'Mercado Pago':0,Tarjeta:0,Otro:0};
  inc.forEach(x=>{const s=String(x.method||'').toLowerCase();const k=s.includes('efect')?'Efectivo':s.includes('transfer')?'Transferencia':s.includes('mercado')?'Mercado Pago':s.includes('tarjet')?'Tarjeta':'Otro';methods[k]+=n(x.amount)});

  let d=q('#finance-dashboard102');
  if(!d){d=document.createElement('div');d.id='finance-dashboard102';c.prepend(d)}
  d.innerHTML=`<div class="card" style="margin-bottom:16px"><div class="section-title"><div><h3>📊 Caja y medios de pago</h3><small class="muted">Resumen contable del salón.</small></div><b style="color:#7257ff">V102</b></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px">
  <div style="border:1px solid #e5e7eb;border-radius:11px;padding:11px"><small>Ingresos</small><b style="display:block">${cash(ti)}</b></div>
  <div style="border:1px solid #e5e7eb;border-radius:11px;padding:11px"><small>Egresos</small><b style="display:block">${cash(te)}</b></div>
  <div style="border:1px solid #e5e7eb;border-radius:11px;padding:11px"><small>Resultado</small><b style="display:block">${cash(ti-te)}</b></div>
  ${Object.entries(methods).map(([k,v])=>`<div style="border:1px solid #e5e7eb;border-radius:11px;padding:11px"><small>${k}</small><b style="display:block">${cash(v)}</b></div>`).join('')}
  </div></div>`;
}

/* PROMO DESTACADA PÚBLICA */
function activePromo(s){
 return s&&s.status==='Aprobado'&&s.featuredPromoEnabled===true&&s.featuredPromoActive===true&&String(s.featuredPromoTitle||'').trim()&&(!s.featuredPromoValidUntil||new Date(s.featuredPromoValidUntil+'T23:59:59')>=new Date());
}
let popupShown=false;
async function publicPromo(){
  if(session)return;
  let st;try{st=await getState()}catch(_){return}
  const list=(st.salons||[]).filter(activePromo);
  q('#public-promos102')?.remove();
  if(!list.length)return;

  const sec=document.createElement('section');sec.id='public-promos102';sec.style.cssText='max-width:1460px;margin:22px auto;padding:0 18px';
  sec.innerHTML=`<div style="background:linear-gradient(135deg,#fff7ed,#f5f3ff);border:1px solid #e9d5ff;border-radius:26px;padding:20px"><div style="font-size:12px;font-weight:900;color:#7c3aed">⭐ PROMOCIONES DESTACADAS</div><h2 style="margin:5px 0 15px">Ofertas para tu próxima fiesta</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:15px">${list.map(s=>`<article style="background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 26px rgba(15,23,42,.09)">${s.featuredPromoImage?`<img src="${s.featuredPromoImage}" style="width:100%;height:190px;object-fit:cover">`:'<div style="height:160px;display:flex;align-items:center;justify-content:center;font-size:58px;background:#ede9fe">🎉</div>'}<div style="padding:15px"><span style="background:#ef4444;color:#fff;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900">DESTACADO</span><h3>${esc(s.featuredPromoTitle)}</h3><b>${esc(s.name||'Salón')}</b>${s.featuredPromoPrice?`<div style="font-size:20px;font-weight:900;margin-top:8px">${esc(s.featuredPromoPrice)}</div>`:''}${s.featuredPromoText?`<p>${esc(s.featuredPromoText)}</p>`:''}<button class="primary w100 promo-view102" data-id="${esc(s.id)}">Ver salón</button></div></article>`).join('')}</div></div>`;
  sec.querySelectorAll('.promo-view102').forEach(b=>b.onclick=()=>typeof renderPublicSalonPage==='function'&&renderPublicSalonPage(b.dataset.id));
  const home=q('.fc-home'),res=q('#v27-results'),app=q('#app');
  if(home){const hero=q('.fc-home-hero',home);hero?hero.insertAdjacentElement('afterend',sec):home.prepend(sec)}
  else if(res)res.parentElement.insertBefore(sec,res);
  else if(app&&!q('.sidebar'))app.appendChild(sec);

  if(!popupShown){
    popupShown=true;
    const s=list[0];
    const overlay=document.createElement('div');overlay.id='promo-popup102';overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px';
    overlay.innerHTML=`<div style="width:min(520px,96vw);background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35)">${s.featuredPromoImage?`<img src="${s.featuredPromoImage}" style="width:100%;height:240px;object-fit:cover">`:''}<div style="padding:20px"><div style="font-size:12px;font-weight:900;color:#7c3aed">⭐ PUBLICACIÓN DESTACADA</div><h2 style="margin:6px 0">${esc(s.featuredPromoTitle)}</h2><b>${esc(s.name||'Salón')}</b>${s.featuredPromoPrice?`<div style="font-size:24px;font-weight:900;margin-top:8px">${esc(s.featuredPromoPrice)}</div>`:''}${s.featuredPromoText?`<p>${esc(s.featuredPromoText)}</p>`:''}<div style="display:flex;gap:9px;margin-top:15px"><button class="ghost" id="promo-close102">Ahora no</button><button class="primary" id="promo-open102">Ver promoción</button></div></div></div>`;
    document.body.appendChild(overlay);
    q('#promo-close102').onclick=()=>overlay.remove();
    q('#promo-open102').onclick=()=>{overlay.remove();if(typeof renderPublicSalonPage==='function')renderPublicSalonPage(s.id)};
  }
}

/* No MutationObserver que redibuje botones. Solo chequeos conservadores. */
setInterval(()=>{
  if(session?.role==='salon'&&view==='finance'&&!q('#finance-dashboard102'))drawFinanceDashboard();
  if(!session&&!q('#public-promos102'))publicPromo();
},1200);
setTimeout(()=>{drawFinanceDashboard();publicPromo()},250);

window.FiestaControlV102={openMovement,resetFinance,drawFinanceDashboard,publicPromo};
})();
