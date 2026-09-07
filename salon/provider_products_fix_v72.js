// FiestaControl V72 - Mis productos sin bloquear ninguna otra sección
(function(){
'use strict';

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc2=v=>{try{return esc(v)}catch(_){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}};
const money2=v=>{try{return money(v)}catch(_){return '$ '+Number(v||0).toLocaleString('es-AR')}};

function isProviderPortal(){
  return norm(document.querySelector('.sidebar')?.innerText||'').includes('portal proveedor');
}
function getSession(){try{return session||{}}catch(_){return window.session||{}}}

function currentProvider(){
  const list=data.marketSuppliers||[];
  const s=getSession();
  const ids=[s.marketSupplierId,s.providerId,s.supplierId,s.userId,s.id].filter(Boolean).map(String);
  let p=list.find(x=>ids.includes(String(x.id)));
  if(p)return p;

  const email=norm(s.email||s.userEmail||'');
  if(email){
    p=list.find(x=>norm(x.email)===email);
    if(p)return p;
  }

  const sidebar=norm(document.querySelector('.sidebar')?.innerText||'');
  return list.find(x=>
    (x.email&&sidebar.includes(norm(x.email))) ||
    (x.fantasyName&&sidebar.includes(norm(x.fantasyName))) ||
    (x.businessName&&sidebar.includes(norm(x.businessName))) ||
    (x.name&&sidebar.includes(norm(x.name)))
  )||null;
}
function pName(p){return String(p?.fantasyName||p?.businessName||p?.business||p?.name||p?.email||'Proveedor')}

function productsOf(p){
  const map=new Map();

  (Array.isArray(p?.products)?p.products:[]).forEach(x=>{
    if(!x?.id)return;
    map.set(String(x.id),{
      id:x.id,
      name:x.name||x.product||'Producto',
      category:x.category||'',
      price:Number(x.price||x.cost||0),
      description:x.description||'',
      photo:x.photo||x.image||'',
      visibleToSalons:x.visibleToSalons!==false,
      active:x.active!==false
    });
  });

  (data.providerProducts||[])
    .filter(x=>
      String(x.providerId||'')===String(p?.id||'') ||
      (!!x.providerEmail&&!!p?.email&&norm(x.providerEmail)===norm(p.email))
    )
    .forEach(x=>map.set(String(x.id),{...(map.get(String(x.id))||{}),...x}));

  return [...map.values()]
    .filter(x=>x.active!==false)
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}

function syncProduct(p,obj){
  data.providerProducts=data.providerProducts||[];

  let i=data.providerProducts.findIndex(x=>String(x.id)===String(obj.id));
  const ext={...obj,providerId:p.id,providerEmail:p.email||'',providerName:pName(p),active:true};
  if(i>=0)data.providerProducts[i]={...data.providerProducts[i],...ext};
  else data.providerProducts.push(ext);

  p.products=Array.isArray(p.products)?p.products:[];
  let j=p.products.findIndex(x=>String(x.id)===String(obj.id));
  const core={
    id:obj.id,name:obj.name,category:obj.category,price:obj.price,
    description:obj.description,photo:obj.photo,
    visibleToSalons:obj.visibleToSalons,active:true
  };
  if(j>=0)p.products[j]={...p.products[j],...core};
  else p.products.push(core);
}

function openProduct(productId=''){
  const p=currentProvider();
  if(!p)return toast('No se pudo identificar el proveedor');

  const old=productId?productsOf(p).find(x=>String(x.id)===String(productId)):null;

  showModal(`
    <div class="modal-title">
      <div><h2>${old?'Editar producto':'Agregar producto'}</h2><p>${esc2(pName(p))}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="fc-v72-product-form">
      <div class="form-grid">
        <div class="field span2">
          <label>Foto del producto</label>
          <input name="photo" type="file" accept="image/*">
          ${old?.photo?`<img src="${old.photo}" style="display:block;margin-top:10px;width:120px;height:120px;object-fit:cover;border-radius:12px">`:''}
        </div>
        <div class="field span2"><label>Producto</label><input name="name" required value="${esc2(old?.name||'')}"></div>
        <div class="field"><label>Categoría</label><input name="category" required value="${esc2(old?.category||'')}"></div>
        <div class="field"><label>Costo</label><input name="price" type="number" min="0" step="0.01" required value="${Number(old?.price||0)}"></div>
        <div class="field span2"><label>Descripción</label><textarea name="description" required>${esc2(old?.description||'')}</textarea></div>
        <div class="field span2">
          <label style="display:flex;align-items:center;gap:10px">
            <input name="visible" type="checkbox" ${old?.visibleToSalons===false?'':'checked'}>
            <span><b>Visible para los salones</b></span>
          </label>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar producto</button>
      </div>
    </form>
  `);

  document.querySelector('#fc-v72-product-form').onsubmit=ev=>{
    ev.preventDefault();
    const fd=new FormData(ev.target);
    const file=ev.target.querySelector('[name="photo"]')?.files?.[0];

    const finish=photo=>{
      const obj={
        id:old?.id||id(),
        name:String(fd.get('name')||'').trim(),
        category:String(fd.get('category')||'').trim(),
        price:Number(fd.get('price')||0),
        description:String(fd.get('description')||'').trim(),
        photo:photo||old?.photo||'',
        visibleToSalons:fd.has('visible'),
        active:true
      };
      syncProduct(p,obj);
      save();
      closeModal();
      renderProducts();
      toast('Producto guardado');
    };

    if(file){
      const r=new FileReader();
      r.onload=()=>finish(String(r.result||''));
      r.onerror=()=>finish('');
      r.readAsDataURL(file);
    }else finish('');
  };
}

function deleteProduct(pid){
  const p=currentProvider();
  if(!p)return;
  const prod=productsOf(p).find(x=>String(x.id)===String(pid));
  if(!prod)return toast('Producto no encontrado');
  if(!confirm(`¿Borrar "${prod.name}"?`))return;

  data.providerProducts=(data.providerProducts||[]).filter(x=>String(x.id)!==String(pid));
  p.products=(Array.isArray(p.products)?p.products:[]).filter(x=>String(x.id)!==String(pid));
  save();
  renderProducts();
  toast('Producto eliminado');
}

function renderProducts(){
  const p=currentProvider();
  if(!p)return toast('No se pudo identificar el proveedor');

  const content=document.querySelector('#content');
  if(!content)return;

  const list=productsOf(p);
  const title=document.querySelector('#title');
  const subtitle=document.querySelector('#subtitle');
  if(title)title.textContent='Mis productos';
  if(subtitle)subtitle.textContent='Catálogo del proveedor visible para los salones.';

  content.innerHTML=`
    <div class="card" id="fc-v72-products">
      <div class="section-title">
        <div>
          <h2>Mis productos</h2>
          <small class="muted">Los productos visibles son los que verán los salones en Proveedores de la comunidad.</small>
        </div>
        <button class="primary" id="fc-v72-add">+ Agregar producto</button>
      </div>

      ${list.length?`
        <div class="table-wrap" style="margin-top:14px">
          <table class="table">
            <thead>
              <tr>
                <th>Foto</th><th>Producto</th><th>Categoría</th><th>Costo</th>
                <th>Descripción</th><th>Visible</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(x=>`
                <tr>
                  <td>${x.photo?`<img src="${x.photo}" style="width:58px;height:58px;object-fit:cover;border-radius:9px">`:`<div style="width:58px;height:58px;border-radius:9px;background:#f1f2f6;display:flex;align-items:center;justify-content:center">📦</div>`}</td>
                  <td><b>${esc2(x.name)}</b></td>
                  <td>${esc2(x.category||'')}</td>
                  <td><b>${money2(x.price||0)}</b></td>
                  <td>${esc2(x.description||'')}</td>
                  <td>${x.visibleToSalons!==false?'✅ Sí':'🚫 No'}</td>
                  <td>
                    <button class="secondary small" data-edit="${esc2(x.id)}">✏️ Editar</button>
                    <button class="danger small" data-del="${esc2(x.id)}">🗑️ Borrar</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`:
        '<div class="empty" style="margin-top:14px">Todavía no hay productos cargados.</div>'}
    </div>
  `;

  document.querySelector('#fc-v72-add').onclick=()=>openProduct();
  content.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openProduct(b.dataset.edit));
  content.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.del));
}

function removePedidosMensajes(){
  if(!isProviderPortal())return;
  [...document.querySelectorAll('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item')].forEach(el=>{
    if(norm(el.textContent).includes('pedidos y mensajes')){
      (el.closest('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item')||el).remove();
    }
  });
}

// Solo intercepta "Mis productos". NINGÚN observer ni intervalo vuelve a dibujar la pantalla.
document.addEventListener('click',ev=>{
  if(!isProviderPortal())return;
  const item=ev.target.closest('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item');
  if(!item)return;

  if(norm(item.textContent)==='mis productos'){
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    renderProducts();
    return false;
  }
},true);

setTimeout(removePedidosMensajes,200);
setInterval(removePedidosMensajes,2000);

window.FCProviderProductsV72={render:renderProducts,open:openProduct};
})();
