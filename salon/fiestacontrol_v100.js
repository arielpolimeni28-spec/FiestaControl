
(function(){'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const N=v=>Number(v||0), SID=()=>session?.salonId;
const M=v=>{try{return money(N(v))}catch(_){return '$ '+N(v).toLocaleString('es-AR')}};
async function state(){const r=await fetch('/api/data',{cache:'no-store'});if(!r.ok)throw Error('No se pudo leer la base');const j=await r.json();return j?.data||j}
function use(st){if(!st)return;Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,st)}
async function post(body){const r=await fetch('/api/finance-v94',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||'No se pudo guardar');if(j.state)use(j.state);return j}

window.money100=function(expense){
 showModal(`<div class="modal-title"><div><h2>${expense?'Registrar egreso':'Ingresar dinero'}</h2><p>Movimiento manual de caja.</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
 <form id="f100"><div class="form-grid">
 <div class="field"><label>Concepto</label><select name="category">${expense?'<option>Compra general</option><option>Servicio</option><option>Pago a proveedor</option><option>Gasto operativo</option><option>Otro egreso</option>':'<option>Monto inicial</option><option>Aporte del salón</option><option>Cobro general</option><option>Otro ingreso</option>'}</select></div>
 <div class="field"><label>Importe</label><input name="amount" type="number" min="1" step=".01" required></div>
 <div class="field"><label>Medio</label><select name="method"><option>Efectivo</option><option>Transferencia</option><option>Mercado Pago</option><option>Tarjeta</option><option>Otro</option></select></div>
 <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
 <div class="field span2"><label>Detalle</label><input name="detail"></div></div>
 <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="${expense?'danger':'primary'}" type="submit">${expense?'Guardar egreso':'Guardar ingreso'}</button></div></form>`);
 const f=document.querySelector('#f100');
 f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),amt=N(fd.get('amount'));if(amt<=0)return toast('Importe inválido');
 const mv={id:'v100_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),salonId:SID(),type:expense?'Gasto':'Ingreso',category:String(fd.get('category')||''),concept:String(fd.get('detail')||'').trim()||String(fd.get('category')||''),amount:amt,method:String(fd.get('method')||''),movementDate:String(fd.get('date')||''),manualMovement:true,createdAt:new Date().toISOString()};
 const b=f.querySelector('[type=submit]');b.disabled=true;b.textContent='Guardando...';
 try{await post({action:'add',salonId:SID(),movement:mv});const st=await state();if(!(st.movements||[]).some(x=>String(x.id)===mv.id))throw Error('El servidor no confirmó el movimiento');use(st);closeModal();toast(expense?'Egreso guardado':'Ingreso guardado');view='finance';renderSalonShell()}catch(err){b.disabled=false;b.textContent=expense?'Guardar egreso':'Guardar ingreso';toast('Error: '+err.message)}};
};
window.reset100=async()=>{if(!confirm('¿Poner toda la contabilidad del salón en $0? No se borran salones, proveedores, fiestas, personal, productos ni stock.'))return;try{await post({action:'reset',salonId:SID()});toast('Contabilidad en $0');view='finance';renderSalonShell()}catch(e){toast('Error: '+e.message)}};

function finance100(){
 if(session?.role!=='salon'||view!=='finance')return;const c=document.querySelector('#content');if(!c)return;
 const ms=(data.movements||[]).filter(x=>String(x.salonId)===String(SID()));
 const inc=ms.filter(x=>['ingreso','cobro'].includes(String(x.type||'').toLowerCase())),out=ms.filter(x=>['gasto','egreso'].includes(String(x.type||'').toLowerCase()));
 const ti=inc.reduce((a,x)=>a+N(x.amount),0),te=out.reduce((a,x)=>a+N(x.amount),0),meth={Efectivo:0,Transferencia:0,'Mercado Pago':0,Tarjeta:0,Otro:0};
 inc.forEach(x=>{let s=String(x.method||'').toLowerCase(),k=s.includes('efect')?'Efectivo':s.includes('transfer')?'Transferencia':s.includes('mercado')?'Mercado Pago':s.includes('tarjet')?'Tarjeta':'Otro';meth[k]+=N(x.amount)});
 c.innerHTML=`<div id="v100-finance"><div class="toolbar" style="margin-bottom:14px"><button class="primary" onclick="money100(false)">+ Ingresar dinero</button><button class="danger" onclick="money100(true)">- Registrar egreso</button><button class="secondary" onclick="reset100()">💰 Poner movimientos en $0</button></div>
 <div class="card"><div class="section-title"><div><h3>📊 Contabilidad general</h3><small class="muted">Único tablero financiero.</small></div></div>
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"><div class="card"><small>Ingresos</small><b style="display:block;font-size:22px">${M(ti)}</b></div><div class="card"><small>Egresos</small><b style="display:block;font-size:22px">${M(te)}</b></div><div class="card"><small>Resultado de caja</small><b style="display:block;font-size:22px">${M(ti-te)}</b></div></div>
 <h4>Ingresos por medio de pago</h4><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">${Object.entries(meth).map(([k,v])=>`<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px"><small>${k}</small><b style="display:block">${M(v)}</b></div>`).join('')}</div></div>
 <div class="card" style="margin-top:16px"><div class="section-title"><div><h3>Movimientos generales</h3><small class="muted">Movimientos confirmados por el servidor.</small></div></div>${ms.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Detalle</th><th>Medio</th><th>Importe</th></tr></thead><tbody>${ms.slice().reverse().map(x=>`<tr><td>${E(x.movementDate||'')}</td><td>${E(x.type||'')}</td><td>${E(x.category||'')}</td><td>${E(x.concept||'')}</td><td>${E(x.method||'')}</td><td><b>${M(x.amount)}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sin movimientos.</div>'}</div></div>`;
}
const old=renderSalonView;renderSalonView=function(){const r=old();if(view==='finance')setTimeout(finance100,0);return r};

function okPromo(s){return s&&s.status==='Aprobado'&&s.featuredPromoEnabled===true&&s.featuredPromoActive===true&&String(s.featuredPromoTitle||'').trim()&&(!s.featuredPromoValidUntil||new Date(s.featuredPromoValidUntil+'T23:59:59')>=new Date())}
async function promos100(){
 if(session)return;let st;try{st=await state()}catch(_){return}document.querySelector('#v100-promos')?.remove();const list=(st.salons||[]).filter(okPromo);if(!list.length)return;
 const sec=document.createElement('section');sec.id='v100-promos';sec.style.cssText='max-width:1460px;margin:24px auto;padding:0 18px';sec.innerHTML=`<div style="background:linear-gradient(135deg,#fff7ed,#f5f3ff);border:1px solid #e9d5ff;border-radius:26px;padding:22px"><div style="font-size:12px;font-weight:900;color:#7c3aed">⭐ PROMOCIONES DESTACADAS</div><h2 style="margin:5px 0 16px">Ofertas para tu próxima fiesta</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px">${list.map(s=>`<article style="background:#fff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,.09)">${s.featuredPromoImage?`<img src="${s.featuredPromoImage}" style="width:100%;height:205px;object-fit:cover">`:'<div style="height:170px;display:flex;align-items:center;justify-content:center;font-size:60px;background:#ede9fe">🎉</div>'}<div style="padding:16px"><span style="background:#ef4444;color:#fff;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900">DESTACADO</span><h3>${E(s.featuredPromoTitle)}</h3><b>${E(s.name||'Salón')}</b>${s.featuredPromoPrice?`<div style="font-size:21px;font-weight:900;margin-top:8px">${E(s.featuredPromoPrice)}</div>`:''}${s.featuredPromoText?`<p>${E(s.featuredPromoText)}</p>`:''}<button class="primary w100" data-id="${E(s.id)}">Ver salón</button></div></article>`).join('')}</div></div>`;
 sec.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>typeof renderPublicSalonPage==='function'&&renderPublicSalonPage(b.dataset.id));
 const home=document.querySelector('.fc-home');if(home){const hero=home.querySelector('.fc-home-hero');hero?hero.insertAdjacentElement('afterend',sec):home.prepend(sec);return}
 const res=document.querySelector('#v27-results');if(res){res.parentElement.insertBefore(sec,res);return}
 const app=document.querySelector('#app');if(app&&!document.querySelector('.sidebar'))app.appendChild(sec);
}
let busy=false;new MutationObserver(()=>{if(busy)return;busy=true;setTimeout(()=>{busy=false;if(session?.role==='salon'&&view==='finance')finance100();if(!session)promos100()},80)}).observe(document.documentElement,{childList:true,subtree:true});
setInterval(()=>{if(!session)promos100()},5000);setTimeout(()=>{if(session?.role==='salon'&&view==='finance')finance100();if(!session)promos100()},150);
window.renderFinanceV100=finance100;window.renderPublicPromosV100=promos100;
})();
