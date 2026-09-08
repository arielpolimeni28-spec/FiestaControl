
(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=v=>Number(v||0);
const sid=()=>session?.salonId;
const moneyFmt=v=>{
  try{return money(num(v))}
  catch(_){return '$ '+num(v).toLocaleString('es-AR')}
};

function openModal101(html){
  const body=$('#modal-body');
  const dlg=$('#modal');
  if(!body||!dlg){
    alert('No se pudo abrir la ventana.');
    return false;
  }
  body.innerHTML=html;
  try{
    if(typeof dlg.showModal==='function') dlg.showModal();
    else dlg.setAttribute('open','open');
  }catch(_){dlg.setAttribute('open','open')}
  return true;
}
function closeModal101(){
  const dlg=$('#modal');
  if(!dlg)return;
  try{dlg.close()}catch(_){dlg.removeAttribute('open')}
}
window.closeModal101=closeModal101;

async function fetchState101(){
  const r=await fetch('/api/data',{cache:'no-store'});
  if(!r.ok) throw new Error('No se pudo leer la base');
  const j=await r.json();
  return j?.data||j;
}
async function putState101(st){
  const r=await fetch('/api/data',{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(st),
    cache:'no-store'
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false) throw new Error(j.error||'No se pudo guardar');
  return j;
}
function replaceLocal101(st){
  if(!st||typeof st!=='object')return;
  Object.keys(data).forEach(k=>delete data[k]);
  Object.assign(data,st);
}
async function post101(url,body){
  const r=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false) throw new Error(j.error||('HTTP '+r.status));
  if(j.state) replaceLocal101(j.state);
  return j;
}

/* ===========================================================
   FINANZAS
   =========================================================== */

function salonMovements101(){
  return (data.movements||[]).filter(m=>String(m.salonId)===String(sid()));
}
function incoming101(m){
  return ['ingreso','cobro'].includes(String(m?.type||'').toLowerCase());
}
function outgoing101(m){
  return ['gasto','egreso'].includes(String(m?.type||'').toLowerCase());
}

async function persistMovement101(movement){
  // Ruta principal atómica.
  try{
    const out=await post101('/api/finance-v94',{
      action:'add',
      salonId:movement.salonId,
      movement
    });
    if(out.state){
      const exists=(out.state.movements||[]).some(x=>String(x.id)===String(movement.id));
      if(exists) return out.state;
    }
  }catch(err){
    console.warn('finance-v94 fallback:',err);
  }

  // Respaldo: leer último estado, agregar y guardar.
  const st=await fetchState101();
  st.movements=Array.isArray(st.movements)?st.movements:[];
  if(!st.movements.some(x=>String(x.id)===String(movement.id))){
    st.movements.push(movement);
  }
  await putState101(st);
  const verify=await fetchState101();
  if(!(verify.movements||[]).some(x=>String(x.id)===String(movement.id))){
    throw new Error('El servidor no confirmó el movimiento');
  }
  replaceLocal101(verify);
  return verify;
}

function openMoney101(expense){
  const ok=openModal101(`
    <div class="modal-title">
      <div>
        <h2>${expense?'Registrar egreso':'Ingresar dinero'}</h2>
        <p>${expense?'Salida manual de dinero':'Entrada manual de dinero'}</p>
      </div>
      <button type="button" class="ghost small" data-v101-close>✕</button>
    </div>

    <form id="v101-money-form">
      <div class="form-grid">
        <div class="field">
          <label>Concepto</label>
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
          <input name="detail" maxlength="180">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" data-v101-close>Cancelar</button>
        <button type="submit" class="${expense?'danger':'primary'}">${expense?'Guardar egreso':'Guardar ingreso'}</button>
      </div>
    </form>
  `);
  if(!ok)return;

  $$('[data-v101-close]',$('#modal-body')).forEach(b=>b.addEventListener('click',closeModal101));

  const form=$('#v101-money-form');
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const fd=new FormData(form);
    const amount=num(fd.get('amount'));
    if(amount<=0){toast('Ingresá un importe válido');return}

    const movement={
      id:'mov101_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      salonId:sid(),
      type:expense?'Gasto':'Ingreso',
      category:String(fd.get('category')||''),
      concept:String(fd.get('detail')||'').trim()||String(fd.get('category')||''),
      amount,
      method:String(fd.get('method')||''),
      movementDate:String(fd.get('date')||''),
      manualMovement:true,
      createdAt:new Date().toISOString(),
      sourceKey:'v101'
    };

    const submit=form.querySelector('[type="submit"]');
    submit.disabled=true;
    submit.textContent='Guardando...';

    try{
      const st=await persistMovement101(movement);
      replaceLocal101(st);
      closeModal101();
      toast(expense?'Egreso guardado correctamente':'Ingreso guardado correctamente');
      if(typeof renderSalonShell==='function'){
        view='finance';
        renderSalonShell();
      }
      setTimeout(renderFinance101,80);
    }catch(err){
      submit.disabled=false;
      submit.textContent=expense?'Guardar egreso':'Guardar ingreso';
      toast('Error al guardar: '+(err.message||err));
    }
  });
}

async function resetFinance101(){
  if(!confirm('¿Poner toda la contabilidad del salón en $0? No se borran salones, proveedores, fiestas, personal, productos ni stock.'))return;

  try{
    let done=false;
    try{
      const out=await post101('/api/finance-v94',{action:'reset',salonId:sid()});
      if(out.state){replaceLocal101(out.state);done=true}
    }catch(_){}

    if(!done){
      const st=await fetchState101();
      st.movements=(st.movements||[]).filter(m=>String(m.salonId)!==String(sid()));
      st.providerPayments=(st.providerPayments||[]).filter(x=>String(x.salonId)!==String(sid()));
      st.servicePayments=(st.servicePayments||[]).filter(x=>String(x.salonId)!==String(sid()));
      await putState101(st);
      replaceLocal101(await fetchState101());
    }
    toast('Contabilidad reiniciada en $0');
    view='finance';
    renderSalonShell();
  }catch(err){
    toast('No se pudo reiniciar: '+err.message);
  }
}

function renderFinance101(){
  if(session?.role!=='salon'||view!=='finance')return;
  const c=$('#content');
  if(!c)return;

  const ms=salonMovements101();
  const ins=ms.filter(incoming101);
  const outs=ms.filter(outgoing101);
  const totalIn=ins.reduce((a,m)=>a+num(m.amount),0);
  const totalOut=outs.reduce((a,m)=>a+num(m.amount),0);

  const methods={
    'Efectivo':0,
    'Transferencia':0,
    'Mercado Pago':0,
    'Tarjeta':0,
    'Otro':0
  };
  ins.forEach(m=>{
    const s=String(m.method||'').toLowerCase();
    const k=s.includes('efect')?'Efectivo':
            s.includes('transfer')?'Transferencia':
            s.includes('mercado')?'Mercado Pago':
            s.includes('tarjet')?'Tarjeta':'Otro';
    methods[k]+=num(m.amount);
  });

  c.innerHTML=`
    <div id="v101-finance">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div class="toolbar" style="margin:0">
          <button id="v101-income" class="primary">+ Ingresar dinero</button>
          <button id="v101-expense" class="danger">- Registrar egreso</button>
          <button id="v101-reset" class="secondary">💰 Poner movimientos en $0</button>
        </div>
        <small style="font-weight:800;color:#7257ff">FINANZAS V101</small>
      </div>

      <div class="card">
        <div class="section-title">
          <div>
            <h3>📊 Contabilidad general</h3>
            <small class="muted">Único tablero financiero del salón.</small>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px">
            <small>Total ingresos</small>
            <strong style="display:block;font-size:23px">${moneyFmt(totalIn)}</strong>
          </div>
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px">
            <small>Total egresos</small>
            <strong style="display:block;font-size:23px">${moneyFmt(totalOut)}</strong>
          </div>
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px">
            <small>Resultado de caja</small>
            <strong style="display:block;font-size:23px">${moneyFmt(totalIn-totalOut)}</strong>
          </div>
        </div>

        <h4 style="margin:18px 0 8px">Ingresos por medio de pago</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px">
          ${Object.entries(methods).map(([k,v])=>`
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px">
              <small>${esc(k)}</small>
              <b style="display:block">${moneyFmt(v)}</b>
            </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>Movimientos generales</h3>
            <small class="muted">Ingresos y egresos confirmados.</small>
          </div>
        </div>
        ${ms.length?`
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Detalle</th><th>Medio</th><th>Importe</th></tr>
              </thead>
              <tbody>
                ${ms.slice().reverse().map(m=>`
                  <tr>
                    <td>${esc(m.movementDate||'')}</td>
                    <td>${esc(m.type||'')}</td>
                    <td>${esc(m.category||'')}</td>
                    <td>${esc(m.concept||'')}</td>
                    <td>${esc(m.method||'')}</td>
                    <td><b>${moneyFmt(m.amount)}</b></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`:'<div class="empty">Sin movimientos contables.</div>'}
      </div>
    </div>
  `;

  $('#v101-income')?.addEventListener('click',()=>openMoney101(false));
  $('#v101-expense')?.addEventListener('click',()=>openMoney101(true));
  $('#v101-reset')?.addEventListener('click',resetFinance101);
}

/* ===========================================================
   PUBLICACIONES DESTACADAS
   =========================================================== */

function currentSalon101(){
  return (data.salons||[]).find(s=>String(s.id)===String(sid()));
}
function promoActive101(s){
  if(!s||s.status!=='Aprobado')return false;
  if(s.featuredPromoEnabled!==true)return false;
  if(s.featuredPromoActive!==true)return false;
  if(!String(s.featuredPromoTitle||'').trim())return false;
  if(s.featuredPromoValidUntil){
    const end=new Date(s.featuredPromoValidUntil+'T23:59:59');
    if(end<new Date())return false;
  }
  return true;
}

async function setPromoPermission101(salonId,enabled){
  try{
    const out=await post101('/api/promo-v94',{action:'permission',salonId,enabled});
    if(out.state){replaceLocal101(out.state);return}
  }catch(_){}

  const st=await fetchState101();
  const s=(st.salons||[]).find(x=>String(x.id)===String(salonId));
  if(!s)throw new Error('Salón inexistente');
  s.featuredPromoEnabled=!!enabled;
  if(!enabled)s.featuredPromoActive=false;
  await putState101(st);
  replaceLocal101(await fetchState101());
}

async function savePromo101(salonId,promo){
  try{
    const out=await post101('/api/promo-v94',{action:'save',salonId,promo});
    if(out.state){replaceLocal101(out.state);return}
  }catch(_){}

  const st=await fetchState101();
  const s=(st.salons||[]).find(x=>String(x.id)===String(salonId));
  if(!s)throw new Error('Salón inexistente');
  if(s.featuredPromoEnabled!==true)throw new Error('El administrador no habilitó la publicación');
  s.featuredPromoTitle=promo.title;
  s.featuredPromoPrice=promo.price;
  s.featuredPromoText=promo.text;
  s.featuredPromoImage=promo.image;
  s.featuredPromoValidUntil=promo.validUntil;
  s.featuredPromoActive=!!promo.active;
  s.featuredPromoUpdatedAt=new Date().toISOString();
  await putState101(st);
  replaceLocal101(await fetchState101());
}

function openPromoEditor101(){
  const s=currentSalon101();
  if(!s)return;
  if(s.featuredPromoEnabled!==true){
    toast('La publicación destacada debe ser habilitada por el administrador');
    return;
  }

  const ok=openModal101(`
    <div class="modal-title">
      <div>
        <h2>⭐ Publicación destacada</h2>
        <p>Esta promoción será visible para quienes buscan contratar un salón.</p>
      </div>
      <button type="button" class="ghost small" data-v101-close>✕</button>
    </div>

    <form id="v101-promo-form">
      <div class="form-grid">
        <div class="field span2">
          <label>Título de la promoción</label>
          <input name="title" required maxlength="90" value="${esc(s.featuredPromoTitle||'')}" placeholder="Ej.: 20% OFF en fiestas de domingo">
        </div>
        <div class="field">
          <label>Precio / beneficio</label>
          <input name="price" maxlength="70" value="${esc(s.featuredPromoPrice||'')}" placeholder="Ej.: Desde $450.000">
        </div>
        <div class="field">
          <label>Vigente hasta</label>
          <input name="until" type="date" value="${esc(s.featuredPromoValidUntil||'')}">
        </div>
        <div class="field span2">
          <label>Texto de venta</label>
          <textarea name="text" maxlength="400">${esc(s.featuredPromoText||'')}</textarea>
        </div>
        <div class="field span2">
          <label>Imagen principal</label>
          <input id="v101-promo-image" type="file" accept="image/*">
          ${s.featuredPromoImage
            ? `<img id="v101-promo-preview" src="${s.featuredPromoImage}" style="display:block;margin-top:8px;max-width:460px;width:100%;max-height:240px;object-fit:cover;border-radius:12px">`
            : `<img id="v101-promo-preview" style="display:none;margin-top:8px;max-width:460px;width:100%;max-height:240px;object-fit:cover;border-radius:12px">`}
        </div>
        <div class="field span2">
          <label style="display:flex;align-items:center;gap:9px">
            <input name="active" type="checkbox" ${s.featuredPromoActive===true?'checked':''}>
            <span><b>Publicar ahora</b><br><small>La promoción aparecerá en la portada pública.</small></span>
          </label>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" data-v101-close>Cancelar</button>
        <button type="submit" class="primary">Guardar publicación</button>
      </div>
    </form>
  `);
  if(!ok)return;

  $$('[data-v101-close]',$('#modal-body')).forEach(b=>b.addEventListener('click',closeModal101));

  let image=s.featuredPromoImage||'';
  $('#v101-promo-image')?.addEventListener('change',ev=>{
    const f=ev.target.files?.[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      image=r.result;
      const p=$('#v101-promo-preview');
      if(p){p.src=image;p.style.display='block'}
    };
    r.readAsDataURL(f);
  });

  const form=$('#v101-promo-form');
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const fd=new FormData(form);
    const btn=form.querySelector('[type="submit"]');
    btn.disabled=true;
    btn.textContent='Guardando...';
    try{
      await savePromo101(s.id,{
        title:String(fd.get('title')||'').trim(),
        price:String(fd.get('price')||'').trim(),
        text:String(fd.get('text')||'').trim(),
        image,
        validUntil:String(fd.get('until')||''),
        active:form.elements.active.checked
      });
      closeModal101();
      toast('Publicación destacada guardada');
      renderSalonShell();
    }catch(err){
      btn.disabled=false;
      btn.textContent='Guardar publicación';
      toast('Error: '+err.message);
    }
  });
}

function ensureSalonPromo101(){
  if(session?.role!=='salon')return;
  const s=currentSalon101();
  if(!s)return;

  $$('.v101-promo-entry').forEach(x=>x.remove());

  if(s.featuredPromoEnabled===true){
    const top=$('.top-actions');
    if(top){
      const b=document.createElement('button');
      b.className='secondary v101-promo-entry';
      b.textContent='⭐ Publicación destacada';
      b.addEventListener('click',openPromoEditor101);
      top.prepend(b);
    }
    const nav=$('.nav');
    if(nav){
      const b=document.createElement('button');
      b.className='v101-promo-entry';
      b.textContent='⭐ Promoción destacada';
      b.addEventListener('click',openPromoEditor101);
      nav.appendChild(b);
    }
  }

  if(view==='profile'){
    const content=$('#content');
    if(content && !$('#v101-promo-card')){
      const card=document.createElement('div');
      card.id='v101-promo-card';
      card.className='card';
      card.style.marginTop='16px';
      card.innerHTML=s.featuredPromoEnabled===true
        ? `<div class="section-title"><div><h3>⭐ Publicación destacada</h3><small class="muted">Habilitada por el administrador.</small></div></div><button id="v101-open-promo" class="primary">${s.featuredPromoTitle?'Editar publicación':'Cargar publicación'}</button>`
        : `<div class="section-title"><div><h3>⭐ Publicación destacada</h3><small class="muted">Opción paga. Debe habilitarla el administrador general.</small></div></div>`;
      content.appendChild(card);
      $('#v101-open-promo')?.addEventListener('click',openPromoEditor101);
    }
  }
}

function ensureAdminPromo101(){
  if(session?.role!=='superadmin')return;

  const rows=$$('#content tbody tr');
  rows.forEach(tr=>{
    if(tr.querySelector('.v101-admin-promo'))return;
    const name=tr.querySelector('td b')?.textContent?.trim();
    if(!name)return;
    const salon=(data.salons||[]).find(s=>String(s.name||'').trim()===name);
    if(!salon)return;
    const cell=tr.lastElementChild;
    if(!cell)return;

    const b=document.createElement('button');
    b.className=(salon.featuredPromoEnabled===true?'danger':'secondary')+' small v101-admin-promo';
    b.textContent=salon.featuredPromoEnabled===true?'Quitar destacado':'Habilitar destacado';
    b.addEventListener('click',async()=>{
      b.disabled=true;
      try{
        await setPromoPermission101(salon.id, salon.featuredPromoEnabled!==true);
        toast(salon.featuredPromoEnabled===true?'Promoción habilitada':'Promoción deshabilitada');
        if(typeof superSalons==='function')superSalons();
      }catch(err){
        toast('Error: '+err.message);
        b.disabled=false;
      }
    });
    cell.appendChild(b);
  });
}

async function renderPublicPromos101(){
  if(session)return;
  let st;
  try{st=await fetchState101()}catch(_){return}

  $('#v101-public-promos')?.remove();

  const list=(st.salons||[])
    .filter(promoActive101)
    .sort((a,b)=>String(b.featuredPromoUpdatedAt||'').localeCompare(String(a.featuredPromoUpdatedAt||'')));

  if(!list.length)return;

  const sec=document.createElement('section');
  sec.id='v101-public-promos';
  sec.style.cssText='max-width:1460px;margin:22px auto 28px;padding:0 18px';
  sec.innerHTML=`
    <div style="background:linear-gradient(135deg,#fff7ed,#f5f3ff,#eef2ff);border:1px solid #e9d5ff;border-radius:28px;padding:22px;box-shadow:0 16px 42px rgba(30,41,59,.12)">
      <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <div style="font-size:12px;font-weight:900;letter-spacing:.08em;color:#7c3aed">⭐ PROMOCIONES DESTACADAS</div>
          <h2 style="margin:5px 0 2px;font-size:30px">Encontrá una promo para tu próxima fiesta</h2>
          <small style="color:#64748b">Salones promocionados en FiestaControl</small>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
        ${list.map(s=>`
          <article style="background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 12px 30px rgba(15,23,42,.10)">
            ${s.featuredPromoImage
              ? `<img src="${s.featuredPromoImage}" alt="${esc(s.featuredPromoTitle)}" style="width:100%;height:210px;object-fit:cover;display:block">`
              : `<div style="height:180px;background:linear-gradient(135deg,#ede9fe,#fee2e2);display:flex;align-items:center;justify-content:center;font-size:62px">🎉</div>`}
            <div style="padding:16px">
              <span style="display:inline-block;background:#ef4444;color:white;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900">⭐ DESTACADO</span>
              <h3 style="margin:9px 0 3px;font-size:22px">${esc(s.featuredPromoTitle)}</h3>
              <b>${esc(s.name||'Salón')}</b>
              ${s.zone?`<small style="display:block;color:#64748b;margin-top:4px">📍 ${esc(s.zone)}</small>`:''}
              ${s.featuredPromoPrice?`<div style="font-size:22px;font-weight:900;margin-top:9px">${esc(s.featuredPromoPrice)}</div>`:''}
              ${s.featuredPromoText?`<p style="line-height:1.45">${esc(s.featuredPromoText)}</p>`:''}
              ${s.featuredPromoValidUntil?`<small style="display:block;color:#64748b">Vigente hasta ${esc(s.featuredPromoValidUntil)}</small>`:''}
              <button class="primary w100 v101-view-salon" data-id="${esc(s.id)}" style="margin-top:12px">Ver salón</button>
            </div>
          </article>`).join('')}
      </div>
    </div>
  `;

  sec.querySelectorAll('.v101-view-salon').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.id;
    if(typeof renderPublicSalonPage==='function')renderPublicSalonPage(id);
  }));

  const home=$('.fc-home');
  if(home){
    const hero=$('.fc-home-hero',home);
    if(hero)hero.insertAdjacentElement('afterend',sec);
    else home.prepend(sec);
    return;
  }

  const results=$('#v27-results');
  if(results){
    results.parentElement.insertBefore(sec,results);
    return;
  }

  const app=$('#app');
  if(app&&!$('.sidebar'))app.appendChild(sec);
}

/* ===========================================================
   EJECUCIÓN / REPARACIÓN DE RENDER
   =========================================================== */

function repair101(){
  if(session?.role==='salon'){
    if(view==='finance')renderFinance101();
    ensureSalonPromo101();
  }
  if(session?.role==='superadmin')ensureAdminPromo101();
  if(!session)renderPublicPromos101();
}

let queued=false;
const obs=new MutationObserver(()=>{
  if(queued)return;
  queued=true;
  setTimeout(()=>{
    queued=false;
    repair101();
  },70);
});
obs.observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')repair101();
});
window.addEventListener('focus',repair101);

setInterval(()=>{
  if(!session)renderPublicPromos101();
},4000);

setTimeout(repair101,120);

window.renderFinanceV101=renderFinance101;
window.renderPublicPromosV101=renderPublicPromos101;
window.openMoneyV101=openMoney101;
window.openPromoV101=openPromoEditor101;

})();
