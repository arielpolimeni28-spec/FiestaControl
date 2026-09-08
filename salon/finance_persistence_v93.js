
(function(){
'use strict';

const sid=()=>session?.salonId;
const num=v=>Number(v||0);

async function postJSON(url,body){
  const r=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const out=await r.json().catch(()=>({}));
  if(!r.ok||!out.ok)throw new Error(out.error||('HTTP '+r.status));
  return out;
}

window.openMoneyV93=function(type='Ingreso'){
  const expense=['gasto','egreso'].includes(String(type).toLowerCase());
  showModal(`
    <div class="modal-title">
      <div><h2>${expense?'Registrar egreso':'Ingresar dinero'}</h2>
      <p>${expense?'Salida de dinero del salón':'Entrada de dinero al salón'}</p></div>
      <button class="ghost small" type="button" onclick="closeModal()">✕</button>
    </div>
    <form id="fc-money-v93">
      <div class="form-grid">
        <div class="field"><label>Motivo</label>
          <select name="category">
            ${expense?`
              <option>Compra general</option><option>Servicio</option>
              <option>Pago a proveedor</option><option>Gasto operativo</option><option>Otro egreso</option>
            `:`
              <option>Monto inicial</option><option>Aporte del salón</option>
              <option>Cobro general</option><option>Otro ingreso</option>
            `}
          </select>
        </div>
        <div class="field"><label>Importe</label><input name="amount" type="number" min="1" step="0.01" required></div>
        <div class="field"><label>Medio de pago</label>
          <select name="method"><option>Efectivo</option><option>Transferencia</option><option>Mercado Pago</option><option>Tarjeta</option><option>Otro</option></select>
        </div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
        <div class="field span2"><label>Detalle</label><input name="detail"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="${expense?'danger':'primary'}">${expense?'Registrar egreso':'Registrar ingreso'}</button>
      </div>
    </form>`);

  document.querySelector('#fc-money-v93').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const amount=num(f.amount);
    if(amount<=0)return toast('Ingresá un importe válido');

    const mid=id();
    const movement={
      id:mid,
      salonId:sid(),
      type:expense?'Gasto':'Ingreso',
      category:String(f.category||'Movimiento manual'),
      concept:String(f.detail||'').trim()
        ? `${String(f.category||'Movimiento manual')} · ${String(f.detail).trim()}`
        : String(f.category||'Movimiento manual'),
      amount,
      method:String(f.method||''),
      movementDate:String(f.date||new Date().toISOString().slice(0,10)),
      manualMovement:true,
      sourceKey:`v93:server:${mid}`,
      createdAt:new Date().toISOString()
    };

    const submit=e.target.querySelector('button[type="submit"],button:not([type])');
    if(submit)submit.disabled=true;

    try{
      const out=await postJSON('/api/movement',{movement});
      // Fuente de verdad: respuesta confirmada del servidor.
      const state=out.state||{};
      Object.keys(data).forEach(k=>delete data[k]);
      Object.assign(data,state);

      closeModal();
      toast(expense?'Egreso guardado definitivamente':'Ingreso guardado definitivamente');
      view='finance';
      renderSalonShell();
    }catch(err){
      if(submit)submit.disabled=false;
      toast('No se pudo guardar: '+(err.message||err));
    }
  };
};

window.zeroMoneyV93=async function(){
  if(!confirm('¿Poner TODA la contabilidad del salón en $0? No se borran salones, proveedores, fiestas ni productos.'))return;
  try{
    const out=await postJSON('/api/finance-reset',{salonId:sid()});
    const state=out.state||{};
    Object.keys(data).forEach(k=>delete data[k]);
    Object.assign(data,state);
    toast('Toda la contabilidad quedó en $0');
    view='finance';
    renderSalonShell();
  }catch(err){
    toast('No se pudo reiniciar: '+(err.message||err));
  }
};

// Repara SIEMPRE los botones finales, aunque versiones viejas redibujen Finanzas.
function bind(){
  if(session?.role!=='salon'||view!=='finance')return;
  document.querySelectorAll('button').forEach(b=>{
    const t=String(b.textContent||'').toLowerCase();
    if(t.includes('ingresar dinero')){
      b.onclick=()=>openMoneyV93('Ingreso');
      b.removeAttribute('onclick');
    }
    if(t.includes('registrar egreso')){
      b.onclick=()=>openMoneyV93('Gasto');
      b.removeAttribute('onclick');
    }
    if(t.includes('poner movimientos en $0')){
      b.onclick=()=>zeroMoneyV93();
      b.removeAttribute('onclick');
    }
  });
}

let q=false;
const mo=new MutationObserver(()=>{
  if(q)return;q=true;
  setTimeout(()=>{q=false;bind()},30);
});
mo.observe(document.documentElement,{childList:true,subtree:true});
setInterval(bind,500);
setTimeout(bind,100);

})();
