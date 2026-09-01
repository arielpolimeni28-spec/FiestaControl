const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
const fmtDate=d=>new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(d+'T12:00:00'));
const id=()=>Math.random().toString(36).slice(2,10), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const STORE='fiestacontrol_v18_server_cache', SESSION='fiestacontrol_session_v18';
const SERVER_MODE=window.__FC_SERVER_MODE__===true;
const PUBLIC_BASE_URL=(window.__FC_PUBLIC_BASE_URL__||location.origin||'').replace(/\/$/,'');
const SYNC_CHANNEL='fiestacontrol_live_sync_v11';
let liveChannel=null;try{liveChannel=new BroadcastChannel(SYNC_CHANNEL)}catch(e){}
const seed={
 salons:[],
 admins:[{id:'adm1',name:'Administrador General',email:'admin@fiestacontrol.com',password:'admin123'}],
 events:[],staff:[],assignments:[],suppliers:[],orders:[],cards:[],communityPosts:[],marketSuppliers:[],servicePayments:[],
 settings:{supportWhatsApp:'',paymentLink:''}
};
let data=(SERVER_MODE&&window.__FC_SERVER_DATA__)?JSON.parse(JSON.stringify(window.__FC_SERVER_DATA__)):(JSON.parse(localStorage.getItem(STORE)||'null')||JSON.parse(JSON.stringify(seed)));
data.salons=data.salons||[]; data.admins=data.admins||seed.admins; data.events=data.events||[]; data.staff=data.staff||[]; data.assignments=data.assignments||[]; data.suppliers=data.suppliers||[]; data.orders=data.orders||[]; data.cards=data.cards||[]; data.communityPosts=data.communityPosts||[]; data.marketSuppliers=data.marketSuppliers||[]; data.servicePayments=data.servicePayments||[]; data.settings=data.settings||{supportWhatsApp:'',paymentLink:''};
let session=JSON.parse(sessionStorage.getItem(SESSION)||'null'); let view='dashboard';
let lastStoreSnapshot=JSON.stringify(data);
let fcSavePending=0;
let fcSaveQueue=Promise.resolve();
const save=()=>{
  const raw=JSON.stringify(data);
  lastStoreSnapshot=raw;
  if(SERVER_MODE){
    fcSavePending++;
    fcSaveQueue=fcSaveQueue.then(async()=>{
      const r=await fetch('/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:raw,cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
    }).catch(e=>{
      console.error('Error guardando en servidor',e);
      setTimeout(()=>toast('No se pudo guardar en el servidor'),0);
    }).finally(()=>{fcSavePending=Math.max(0,fcSavePending-1)});
  }else{
    localStorage.setItem(STORE,raw);
    if(liveChannel){try{liveChannel.postMessage({type:'data-changed',at:Date.now()})}catch(e){}}
  }
};
const setSession=s=>{session=s;s?sessionStorage.setItem(SESSION,JSON.stringify(s)):sessionStorage.removeItem(SESSION)};
function toast(t){let e=$('#toast');if(!e)return;e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
function showModal(html){$('#modal-body').innerHTML=html;$('#modal').showModal()} window.closeModal=()=>$('#modal').close();
function salon(){return data.salons.find(s=>s.id===session?.salonId)}; function se(){return data.events.filter(e=>e.salonId===session.salonId)}; function ss(){return data.staff.filter(e=>e.salonId===session.salonId)}; function sp(){return data.suppliers.filter(e=>e.salonId===session.salonId)}; function so(){return data.orders.filter(e=>e.salonId===session.salonId)};
function confirmedCount(e){return (e?.rsvps||[]).filter(x=>x.status==='Sí').length}
function declinedCount(e){return (e?.rsvps||[]).filter(x=>x.status==='No').length}
function todayKey(){let d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${d.getFullYear()}-${m}-${day}`}
function todayEvents(){return se().filter(e=>e.date===todayKey()).sort((a,b)=>(a.start||'').localeCompare(b.start||''))}
function render(){if(!session)return renderAuth(); session.role==='superadmin'?renderSuper():renderSalonShell()}
function renderAuth(mode='login'){$('#app').innerHTML=`<div class="auth"><section class="auth-hero"><div class="auth-brand"><div class="mark">FC</div><b>FiestaControl</b></div><div class="auth-copy"><h1>Tu salón, ordenado de punta a punta.</h1><p>Agenda, reservas, cobros, invitaciones, confirmaciones, personal, proveedores y números del negocio en un solo lugar.</p><div class="hero-points"><div class="hero-point"><strong>🎉 Fiestas</strong><small>Todo el evento en una ficha.</small></div><div class="hero-point"><strong>💳 Caja</strong><small>Señas, saldos y gastos claros.</small></div><div class="hero-point"><strong>📲 WhatsApp</strong><small>Invitaciones y pedidos listos.</small></div></div></div><small>FiestaControl · Plataforma SaaS para salones</small></section><section class="auth-panel"><div class="auth-card"><h2>${mode==='login'?'Ingresar':'Registrar mi salón'}</h2><p class="muted">${mode==='login'?'Accedé a tu panel de gestión.':'Creá la cuenta del salón. Quedará pendiente de aprobación.'}</p><div class="tabs"><button id="tab-login" class="${mode==='login'?'active':''}">Ingresar</button><button id="tab-register" class="${mode==='register'?'active':''}">Registrar salón</button></div>${mode==='login'?loginForm():registerForm()}<div class="demo-box"><b>Sistema listo para producción</b><br>Los nuevos salones quedan pendientes de aprobación.</div></div></section></div>`;$('#tab-login').onclick=()=>renderAuth('login');$('#tab-register').onclick=()=>renderAuth('register'); bindAuth(mode)}
function loginForm(){return `<div class="register-callout"><div><b>¿Tu salón todavía no tiene cuenta?</b><small>Registralo acá y quedará pendiente de aprobación.</small></div><button type="button" class="secondary" onclick="renderAuth('register')">Registrar mi salón</button></div><form id="auth-form"><div class="field"><label>Email</label><input name="email" type="email" required placeholder="nombre@salon.com"></div><div class="field"><label>Contraseña</label><input name="password" type="password" required></div><button class="primary w100">Ingresar al panel</button></form>`}
function registerForm(){return `<form id="auth-form"><div class="form-grid"><div class="field span2"><label>Nombre del salón</label><input name="name" required></div><div class="field"><label>Responsable</label><input name="owner" required></div><div class="field"><label>WhatsApp</label><input name="phone"></div><div class="field span2"><label>Dirección</label><input name="address" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Contraseña</label><input name="password" type="password" required minlength="4"></div></div><button class="primary w100">Crear cuenta del salón</button></form>`}
function bindAuth(mode){$('#auth-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));if(mode==='login'){let a=data.admins.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(a){setSession({role:'superadmin',userId:a.id,name:a.name});return render()}let s=data.salons.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(!s)return toast('Email o contraseña incorrectos');if(s.status==='Pendiente')return toast('Tu salón aún está pendiente de aprobación');if(s.status==='Suspendido')return toast('La cuenta del salón está suspendida');setSession({role:'salon',salonId:s.id,name:s.owner});render()}else{if(data.salons.some(x=>x.email.toLowerCase()===f.email.toLowerCase()))return toast('Ese email ya está registrado');let s={id:id(),...f,status:'Pendiente',plan:'Inicial',created:new Date().toISOString().slice(0,10),brandColor:'#7257ff',logo:''};data.salons.push(s);save();showModal(`<div class="modal-title"><div><h2>Registro recibido ✅</h2><p>${esc(s.name)}</p></div></div><p>La cuenta quedó <b>pendiente de aprobación</b> por el administrador de FiestaControl.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('login')">Volver al ingreso</button></div>`)}}}
window.renderAuth=renderAuth;
function logout(){setSession(null);render()} window.logout=logout;
const salonNav=[['dashboard','🏠','Inicio'],['calendar','📅','Agenda'],['events','🎉','Fiestas'],['cards','💌','Tarjetas virtuales'],['community','🌐','Comunidad'],['staff','👥','Personal'],['suppliers','🚚','Proveedores'],['finance','💰','Finanzas'],['profile','⚙️','Mi salón']];
function renderSalonShell(){let s=salon(),today=todayEvents();$('#app').innerHTML=`<div class="shell salon-shell" style="--tenant-accent:${esc(s.brandColor||'#7257ff')}"><aside class="sidebar"><div class="brand"><div class="mark">FC</div><div><b>FiestaControl</b><small>Panel del salón</small></div></div><div class="tenant tenant-brand">${s.logo?`<img src="${s.logo}" alt="Logo" class="tenant-logo">`:`<div class="tenant-logo placeholder">${esc((s.name||'S').slice(0,1))}</div>`}<div><small>Salón activo</small><strong>${esc(s.name)}</strong></div></div>${today.length?`<button class="today-side-alert" onclick="view='events';renderSalonShell()"><span>🎉</span><div><b>${today.length} fiesta${today.length>1?'s':''} hoy</b><small>Ver agenda del día</small></div></button>`:''}<nav class="nav">${salonNav.map(([v,i,n])=>`<button data-v="${v}" class="${view===v?'active':''}">${i} ${n}${v==='events'&&today.length?`<span class="nav-badge">${today.length}</span>`:''}</button>`).join('')}</nav><div class="side-foot"><div class="user-chip"><b>${esc(s.owner)}</b><small>${esc(s.email)}</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div><h1 id="title"></h1><p id="subtitle"></p></div><div class="top-actions"><button class="ghost" onclick="openPublicPreview()">👁 Vista cliente</button><button class="primary" onclick="openEventForm()">+ Nueva fiesta</button></div></header><section class="content" id="content"></section></main></div><div id="toast" class="toast"></div>`;$$('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;renderSalonShell()});renderSalonView();showTodayEventWarning()}
function showTodayEventWarning(){if(session?.role!=='salon')return;let ev=todayEvents();if(!ev.length)return;let k=`fiestacontrol_today_warning_${session.salonId}_${todayKey()}`;if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');setTimeout(()=>showModal(`<div class="modal-title"><div><h2>🎉 Fiestas de hoy</h2><p>Tenés ${ev.length} evento${ev.length>1?'s':''} programado${ev.length>1?'s':''} para hoy.</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><div class="today-modal-list">${ev.map(e=>`<button class="today-event-row" onclick="closeModal();openEvent('${e.id}')"><span class="today-time">${esc(e.start||'--:--')}</span><span><b>${esc(e.child)}</b><small>${esc(e.client||'')} · ${esc(e.status||'')}</small></span><strong>Ver →</strong></button>`).join('')}</div><div class="form-actions"><button class="secondary" onclick="closeModal();view='calendar';renderSalonShell()">Ver agenda</button><button class="primary" onclick="closeModal();view='events';renderSalonShell()">Ver fiestas de hoy</button></div>`),180)}

function setTitle(t,s){$('#title').textContent=t;$('#subtitle').textContent=s}
function renderSalonView(){({dashboard:renderDashboard,calendar:renderCalendar,events:renderEvents,cards:renderCards,community:renderCommunity,staff:renderStaff,suppliers:renderSuppliers,finance:renderFinance,profile:renderProfile}[view]||renderDashboard)()}
function renderDashboard(){setTitle('Dashboard','Resumen operativo y económico de tu salón');let ev=se(), upcoming=ev.filter(e=>e.date>=todayKey()).sort((a,b)=>a.date.localeCompare(b.date)), billed=ev.reduce((a,e)=>a+e.total,0), paid=ev.reduce((a,e)=>a+e.paid,0), balance=billed-paid, confirmed=ev.filter(e=>['Confirmada','Señada'].includes(e.status)).length;let months=['Abr','May','Jun','Jul','Ago','Sep'], vals=[260,390,310,520,610,950];$('#content').innerHTML=`${todayEvents().length?`<div class="today-dashboard-alert"><div class="today-dashboard-icon">🎉</div><div><span class="eyebrow">AGENDA DE HOY</span><h2>Tenés ${todayEvents().length} fiesta${todayEvents().length>1?'s':''} programada${todayEvents().length>1?'s':''} para hoy</h2><p>${todayEvents().map(e=>`${esc(e.start)} · ${esc(e.child)}`).join(' &nbsp;•&nbsp; ')}</p></div><button class="primary" onclick="view='events';renderSalonShell()">Ver fiestas de hoy</button></div>`:''}<div class="grid stats"><div class="card stat"><div class="stat-icon">🎉</div><small>Fiestas activas</small><strong>${confirmed}</strong><em>${upcoming.length} próximas en agenda</em></div><div class="card stat"><div class="stat-icon">💳</div><small>Facturado</small><strong>${money(billed)}</strong><em>Reservas cargadas</em></div><div class="card stat"><div class="stat-icon">✅</div><small>Cobrado</small><strong>${money(paid)}</strong><em>${billed?Math.round(paid/billed*100):0}% del total</em></div><div class="card stat"><div class="stat-icon">⏳</div><small>Por cobrar</small><strong>${money(balance)}</strong><em class="warn">Seguimiento de saldos</em></div></div>
<div class="card" style="margin-top:16px"><div class="section-title"><h3>Acciones rápidas</h3><small class="muted">Lo más usado en el día a día</small></div><div class="quick-grid"><button class="quick" onclick="openEventForm()"><span>➕</span><strong>Nueva reserva</strong><small>Cargar una fiesta</small></button><button class="quick" onclick="view='calendar';renderSalonShell()"><span>📅</span><strong>Ver disponibilidad</strong><small>Abrir agenda</small></button><button class="quick" onclick="view='suppliers';renderSalonShell()"><span>📦</span><strong>Nuevo pedido</strong><small>Proveedor + WhatsApp</small></button><button class="quick" onclick="view='cards';renderSalonShell()"><span>💌</span><strong>Crear tarjeta</strong><small>Invitación virtual</small></button><button class="quick" onclick="view='finance';renderSalonShell()"><span>💰</span><strong>Revisar caja</strong><small>Cobros y pendientes</small></button></div></div>
<div class="grid two" style="margin-top:16px"><div class="card"><div class="section-title"><h3>Próximas fiestas</h3><button class="ghost small" onclick="view='events';renderSalonShell()">Ver todas</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Evento</th><th>Horario</th><th>Estado</th><th>Saldo</th></tr></thead><tbody>${upcoming.slice(0,5).map(e=>`<tr><td>${fmtDate(e.date)}</td><td><b>${esc(e.child)}</b><br><small class="muted">${esc(e.client)}</small></td><td>${e.start}</td><td><span class="pill ${e.status.toLowerCase()}">${e.status}</span></td><td class="${e.total-e.paid?'bad':'good'}"><b>${money(e.total-e.paid)}</b></td></tr>`).join('')}</tbody></table></div></div><div class="card"><div class="section-title"><h3>Alertas</h3></div>${upcoming.filter(e=>e.total-e.paid>0).slice(0,3).map(e=>`<div class="alert"><span>⚠️</span><div><b>${esc(e.child)} tiene saldo pendiente</b><small>${fmtDate(e.date)} · faltan ${money(e.total-e.paid)}</small></div></div>`).join('')||'<div class="empty">Sin alertas.</div>'}<div class="alert"><span>📦</span><div><b>${so().filter(o=>o.status==='Pendiente').length} pedido(s) pendientes</b><small>Revisá proveedores antes de la próxima fiesta.</small></div></div></div></div>
<div class="grid two" style="margin-top:16px"><div class="card"><div class="section-title"><h3>Ingresos por mes</h3><small class="muted">Vista demo</small></div><div class="chart">${vals.map((v,i)=>`<div class="bar-col"><div class="bar" style="height:${v/10+40}px" data-label="$${v} mil"></div>${months[i]}</div>`).join('')}</div></div><div class="card"><div class="section-title"><h3>Ocupación del mes</h3></div><p><b>3 de 8 turnos</b> reservados</p><div class="progress"><i style="width:38%"></i></div><p class="muted" style="font-size:12px">Todavía tenés disponibilidad para comercializar fechas.</p></div></div>`}
function renderEvents(){setTitle('Fiestas','Reservas, clientes, cobros e invitaciones');let ev=se().sort((a,b)=>a.date.localeCompare(b.date));$('#content').innerHTML=`<div class="toolbar"><button class="primary" onclick="openEventForm()">+ Nueva fiesta</button><input id="search" placeholder="Buscar cliente o cumpleañero"></div><div class="card table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Cumple</th><th>Cliente</th><th>Paquete</th><th>Estado</th><th>Total</th><th>Saldo</th><th>Confirmados</th><th></th></tr></thead><tbody id="eventrows">${eventRows(ev)}</tbody></table></div>`;$('#search').oninput=e=>$('#eventrows').innerHTML=eventRows(ev.filter(x=>(x.child+' '+x.client).toLowerCase().includes(e.target.value.toLowerCase())))}
function eventRows(ev){return ev.map(e=>`<tr><td>${fmtDate(e.date)}</td><td><b>${esc(e.child)}</b><br><small class="muted">${e.age} años</small></td><td>${esc(e.client)}</td><td>${esc(e.package)}</td><td><span class="pill ${e.status.toLowerCase()}">${e.status}</span></td><td>${money(e.total)}</td><td class="${e.total-e.paid?'bad':'good'}"><b>${money(e.total-e.paid)}</b></td><td><span class="pill aprobado">✅ ${confirmedCount(e)}</span></td><td><button class="secondary small" onclick="openEvent('${e.id}')">Abrir</button></td></tr>`).join('')||'<tr><td colspan="9" class="empty">No hay fiestas cargadas.</td></tr>'}
function renderCalendar(){setTitle('Agenda','Disponibilidad y ocupación del salón');let d=new Date(2026,8,1), first=d.getDay(), days=new Date(2026,9,0).getDate(), cells=[];for(let i=0;i<first;i++)cells.push('<div class="day off"></div>');for(let n=1;n<=days;n++){let ds=`2026-09-${String(n).padStart(2,'0')}`, ev=se().filter(e=>e.date===ds);cells.push(`<div class="day"><div class="day-number">${n}</div>${ev.map(e=>`<button class="event-chip" onclick="openEvent('${e.id}')">${e.start} · ${esc(e.child)}</button>`).join('')}</div>`)}$('#content').innerHTML=`<div class="card"><div class="calendar-head"><h3>Septiembre 2026</h3><div><span class="pill confirmada">Reservado</span> <span class="pill consulta">Consulta</span></div></div><div class="calendar">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(x=>`<div class="weekday">${x}</div>`).join('')}${cells.join('')}</div></div>`}
function cardFor(eid){return data.cards.find(c=>c.eventId===eid&&c.salonId===session.salonId)}
const cardThemes={
  superheroes:{name:'Superhéroes',icon:'🦸',image:'assets/superheroes.svg',bg:'linear-gradient(145deg,#172554,#7c3aed)'},
  princesas:{name:'Princesas & fantasía',icon:'👑',image:'assets/princesas.svg',bg:'linear-gradient(145deg,#fb7185,#c084fc)'},
  futbol:{name:'Fútbol',icon:'⚽',image:'assets/futbol.svg',bg:'linear-gradient(145deg,#0f766e,#166534)'},
  dinosaurios:{name:'Dinosaurios',icon:'🦖',image:'assets/dinosaurios.svg',bg:'linear-gradient(145deg,#14532d,#84cc16)'},
  gamer:{name:'Gamer',icon:'🎮',image:'assets/gamer.svg',bg:'linear-gradient(145deg,#111827,#6d28d9)'},
  espacio:{name:'Espacio',icon:'🚀',image:'assets/espacio.svg',bg:'linear-gradient(145deg,#0f172a,#312e81)'}
};
function cardHTML(e,c,compact=false){let s=salon(),t=cardThemes[c?.theme||'superheroes']||cardThemes.superheroes,title=c?.title||`¡${e.child} cumple ${e.age}!`,msg=c?.message||'Te esperamos para compartir una tarde llena de diversión.',extra=c?.extra||'¡No faltes!',img=c?.customImage||t.image;return `<div class="virtual-card photo-card ${compact?'compact':''}" style="background:${t.bg}"><img class="card-theme-photo" src="${img}" alt="${esc(t.name)}"><div class="card-photo-shade"></div><div class="card-layer">${s.logo?`<img src="${s.logo}" class="invite-salon-logo" alt="${esc(s.name)}">`:''}<div class="card-spark">${esc(c?.emoji||t.icon)}</div><div class="card-kicker">ESTÁS INVITADO/A</div><h2>${esc(title)}</h2><p class="card-message">${esc(msg)}</p><div class="card-info"><b>📅 ${fmtDate(e.date)}</b><span>🕒 ${e.start} a ${e.end}</span><span>📍 ${esc(s.name)}</span><small>${esc(s.address)}</small></div><div class="card-extra">${esc(extra)}</div><div class="card-brand">Creada con FiestaControl</div></div></div>`}
function renderCards(){setTitle('Tarjetas virtuales','Diseñá y compartí invitaciones para cada fiesta');let ev=se().sort((a,b)=>a.date.localeCompare(b.date));if(!ev.length){$('#content').innerHTML='<div class="card empty">Primero tenés que crear una fiesta para poder armar su tarjeta virtual.<br><br><button class="primary" onclick="openEventForm()">+ Crear fiesta</button></div>';return}$('#content').innerHTML=`<div class="cards-intro"><div><h2>💌 Diseñador de invitaciones</h2><p>Elegí una fiesta, personalizá la tarjeta y compartila con los invitados.</p></div><button class="primary" onclick="openCardEditor('${ev[0].id}')">+ Crear / editar tarjeta</button></div><div class="card-gallery">${ev.map(e=>{let c=cardFor(e.id);return `<div class="card card-project"><div class="project-head"><div><small>${fmtDate(e.date)} · ${e.start}</small><h3>${esc(e.child)} · ${e.age} años</h3></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill aprobado">✅ ${confirmedCount(e)} confirmados</span><span class="pill ${c?'aprobado':'consulta'}">${c?'Diseñada':'Sin diseñar'}</span></div></div>${cardHTML(e,c,true)}<div class="card-actions"><button class="secondary" onclick="openCardEditor('${e.id}')">🎨 Diseñar</button><button class="ghost" onclick="openInvitation('${e.id}')">👁 Ver</button><button class="secondary" onclick="openPublicInvitationTab('${e.id}')">🎟️ Confirmación</button><button class="ghost" onclick="downloadCard('${e.id}')">⬇ PNG</button><button class="primary" onclick="shareCardWhatsApp('${e.id}')">WhatsApp</button></div></div>`}).join('')}</div>`}
function openCardEditor(eid){let e=data.events.find(x=>x.id===eid),c=cardFor(eid)||{theme:'superheroes',emoji:'🦸',title:`¡${e.child} cumple ${e.age}!`,message:'Te esperamos para compartir una tarde llena de diversión.',extra:'¡No faltes!',customImage:''};showModal(`<div class="modal-title"><div><h2>Diseñar tarjeta</h2><p>${esc(e.child)} · ${fmtDate(e.date)}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><div class="designer-grid"><form id="card-form"><div class="field"><label>Elegí una temática</label><div class="theme-grid visual-themes">${Object.entries(cardThemes).map(([k,t])=>`<label class="theme-option visual ${c.theme===k?'selected':''}"><input type="radio" name="theme" value="${k}" ${c.theme===k?'checked':''}><img src="${t.image}" alt="${esc(t.name)}"><span><b>${t.name}</b><small>${t.icon} Diseño incluido</small></span></label>`).join('')}</div></div><div class="upload-theme"><div><b>¿Quiere un personaje o fondo específico?</b><small>El salón puede subir su propia imagen para esta invitación.</small></div><label class="secondary file-button">📷 Subir imagen<input id="custom-card-image" type="file" accept="image/*" hidden></label></div><input type="hidden" name="customImage" value="${esc(c.customImage||'')}"><div class="form-grid"><div class="field"><label>Emoji / ícono</label><input name="emoji" value="${esc(c.emoji||'🦸')}" maxlength="4"></div><div class="field"><label>Título</label><input name="title" value="${esc(c.title)}" required></div><div class="field span2"><label>Mensaje</label><textarea name="message" rows="3">${esc(c.message)}</textarea></div><div class="field span2"><label>Frase final</label><input name="extra" value="${esc(c.extra)}"></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar tarjeta</button></div></form><div id="card-preview">${cardHTML(e,c)}</div></div>`);let form=$('#card-form');function preview(){let f=Object.fromEntries(new FormData(form));$('#card-preview').innerHTML=cardHTML(e,f)}form.oninput=preview;form.onchange=()=>{preview();$$('.theme-option',form).forEach(x=>x.classList.toggle('selected',x.querySelector('input').checked))};$('#custom-card-image').onchange=ev=>{let file=ev.target.files[0];if(!file)return;let r=new FileReader();r.onload=()=>{form.elements.customImage.value=r.result;preview();toast('Imagen aplicada a la tarjeta')};r.readAsDataURL(file)};form.onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(form)),existing=cardFor(eid);if(existing)Object.assign(existing,f);else data.cards.push({id:id(),salonId:session.salonId,eventId:eid,...f});save();toast('Tarjeta guardada');closeModal();view='cards';renderSalonShell()}}
function shareCardWhatsApp(eid){let e=data.events.find(x=>x.id===eid),c=cardFor(eid),s=salon(),title=c?.title||`¡${e.child} cumple ${e.age}!`,msg=c?.message||'Te esperamos para compartir una tarde llena de diversión.',t=`💌 ${title}\n\n${msg}\n\n📅 ${fmtDate(e.date)}\n🕒 ${e.start} a ${e.end}\n📍 ${s.name}\n${s.address}\n\n✅ Confirmá tu asistencia con el salón.`;window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,'_blank')}window.shareCardWhatsApp=shareCardWhatsApp;
function downloadCard(eid){let e=data.events.find(x=>x.id===eid),c=cardFor(eid)||{},s=salon(),theme=c.theme||'magia',palette={magia:['#7b54ff','#ff91c8'],futbol:['#134e28','#b8e83d'],espacio:['#101b4b','#8b54df'],arcoiris:['#ff6b9e','#6d78ff'],elegante:['#1c2230','#a8874a']}[theme],cv=document.createElement('canvas');cv.width=1080;cv.height=1350;let ctx=cv.getContext('2d'),g=ctx.createLinearGradient(0,0,1080,1350);g.addColorStop(0,palette[0]);g.addColorStop(1,palette[1]);ctx.fillStyle=g;ctx.fillRect(0,0,1080,1350);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='100px sans-serif';ctx.fillText(c.emoji||cardThemes[theme].icon,540,180);ctx.font='bold 32px sans-serif';ctx.fillText('ESTÁS INVITADO/A',540,260);ctx.font='bold 66px sans-serif';wrapText(ctx,c.title||`¡${e.child} cumple ${e.age}!`,540,380,900,78);ctx.font='32px sans-serif';wrapText(ctx,c.message||'Te esperamos para compartir una tarde llena de diversión.',540,590,850,44);ctx.fillStyle='rgba(255,255,255,.16)';roundRect(ctx,120,760,840,330,30);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.fillText(`📅 ${fmtDate(e.date)}`,540,845);ctx.fillText(`🕒 ${e.start} a ${e.end}`,540,910);ctx.font='bold 34px sans-serif';ctx.fillText(s.name,540,985);ctx.font='28px sans-serif';wrapText(ctx,s.address,540,1040,760,38);ctx.font='bold 34px sans-serif';ctx.fillText(c.extra||'¡No faltes!',540,1185);ctx.font='22px sans-serif';ctx.fillText('Creada con FiestaControl',540,1290);let a=document.createElement('a');a.download=`tarjeta-${e.child.toLowerCase().replace(/\s+/g,'-')}.png`;a.href=cv.toDataURL('image/png');a.click()}window.downloadCard=downloadCard;
function wrapText(ctx,text,x,y,maxWidth,lineHeight){let words=String(text).split(' '),line='';for(let n=0;n<words.length;n++){let test=line+words[n]+' ';if(ctx.measureText(test).width>maxWidth&&n>0){ctx.fillText(line,x,y);line=words[n]+' ';y+=lineHeight}else line=test}ctx.fillText(line,x,y)}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function renderStaff(){setTitle('Personal','Equipo, roles y pagos por evento');let st=ss();$('#content').innerHTML=`<div class="toolbar"><button class="primary" onclick="openStaffForm()">+ Agregar personal</button></div><div class="card table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Rol</th><th>Valor habitual</th><th>WhatsApp</th></tr></thead><tbody>${st.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.role)}</td><td>${money(s.defaultFee)}</td><td>${esc(s.phone||'-')}</td></tr>`).join('')}</tbody></table></div>`}
function renderSuppliers(){setTitle('Proveedores','Pedidos, costos, deudas y contacto');let ps=sp();$('#content').innerHTML=`<div class="toolbar"><button class="primary" onclick="openSupplierForm()">+ Nuevo proveedor</button><button class="secondary" onclick="openOrderForm()">+ Nuevo pedido</button></div><div class="grid two"><div class="card"><div class="section-title"><h3>Proveedores</h3></div><div class="list">${ps.map(p=>`<div class="list-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div><div style="text-align:right"><b class="${p.balance?'bad':'good'}">${money(p.balance)}</b><small>${p.balance?'Adeudado':'Al día'}</small></div></div>`).join('')}</div></div><div class="card"><div class="section-title"><h3>Pedidos</h3></div><div class="list">${so().map(o=>{let p=data.suppliers.find(x=>x.id===o.supplierId),e=data.events.find(x=>x.id===o.eventId);return `<div class="list-item"><div><strong>${esc(p?.name)}</strong><small>${esc(e?.child)} · ${esc(o.status)}</small></div><button class="secondary small" onclick="sendOrderWhatsApp('${o.id}')">WhatsApp</button></div>`}).join('')||'<div class="empty">Sin pedidos.</div>'}</div></div></div>`}
function renderFinance(){setTitle('Finanzas','Ingresos, saldos y compromisos');let ev=se(),b=ev.reduce((a,e)=>a+e.total,0),p=ev.reduce((a,e)=>a+e.paid,0),staffDebt=data.assignments.filter(a=>!a.paid&&ev.some(e=>e.id===a.eventId)).reduce((a,x)=>a+x.amount,0),supDebt=sp().reduce((a,x)=>a+x.balance,0);$('#content').innerHTML=`<div class="grid stats"><div class="card stat"><small>Facturación</small><strong>${money(b)}</strong></div><div class="card stat"><small>Cobrado</small><strong class="good">${money(p)}</strong></div><div class="card stat"><small>Clientes deben</small><strong class="bad">${money(b-p)}</strong></div><div class="card stat"><small>Compromisos</small><strong class="warn">${money(staffDebt+supDebt)}</strong></div></div><div class="card" style="margin-top:16px"><div class="section-title"><h3>Cuenta corriente de fiestas</h3></div><table class="table"><thead><tr><th>Evento</th><th>Total</th><th>Cobrado</th><th>Saldo</th></tr></thead><tbody>${ev.map(e=>`<tr><td>${fmtDate(e.date)} · <b>${esc(e.child)}</b></td><td>${money(e.total)}</td><td class="good">${money(e.paid)}</td><td class="${e.total-e.paid?'bad':'good'}">${money(e.total-e.paid)}</td></tr>`).join('')}</tbody></table></div>`}
function renderProfile(){let s=salon();setTitle('Mi salón','Identidad, datos comerciales y configuración');$('#content').innerHTML=`<div class="profile-hero"><div class="profile-brand-preview">${s.logo?`<img src="${s.logo}" alt="Logo de ${esc(s.name)}">`:`<div class="profile-logo-placeholder">${esc((s.name||'S').slice(0,1))}</div>`}<div><small>IDENTIDAD DEL SALÓN</small><h2>${esc(s.name)}</h2><p>${esc(s.address)}</p></div></div><button class="primary" onclick="editSalonProfile()">✏️ Editar perfil y logo</button></div><div class="grid two"><div class="card"><div class="section-title"><h3>Datos del salón</h3></div><div class="list"><div class="list-item"><div><strong>${esc(s.name)}</strong><small>${esc(s.address)}</small></div></div><div class="list-item"><div><strong>${esc(s.owner)}</strong><small>${esc(s.email)}</small></div></div><div class="list-item"><div><strong>WhatsApp</strong><small>${esc(s.phone||'Sin cargar')}</small></div></div><div class="list-item"><div><strong>Plan ${esc(s.plan)}</strong><small>Estado: ${esc(s.status)}</small></div><span class="pill aprobado">Activo</span></div></div></div><div class="card"><div class="section-title"><h3>Cómo se verá tu marca</h3></div><div class="brand-demo" style="--brand:${esc(s.brandColor||'#7257ff')}">${s.logo?`<img src="${s.logo}" class="brand-demo-logo" alt="Logo">`:`<div class="brand-demo-logo placeholder">${esc((s.name||'S').slice(0,1))}</div>`}<h2>${esc(s.name)}</h2><p>Tu logo aparece en el panel y en las invitaciones virtuales.</p></div></div></div>`}
function openEventForm(eid){let e=eid?data.events.find(x=>x.id===eid):null;showModal(`<div class="modal-title"><div><h2>${e?'Editar fiesta':'Nueva fiesta'}</h2><p>Datos principales de la reserva</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="event-form"><div class="form-grid"><div class="field"><label>Cumpleañero/a</label><input name="child" required value="${esc(e?.child||'')}"></div><div class="field"><label>Edad</label><input name="age" type="number" value="${e?.age||''}"></div><div class="field"><label>Cliente / responsable</label><input name="client" required value="${esc(e?.client||'')}"></div><div class="field"><label>WhatsApp</label><input name="phone" value="${esc(e?.phone||'')}"></div><div class="field"><label>Fecha</label><input name="date" type="date" required value="${e?.date||''}"></div><div class="field"><label>Estado</label><select name="status">${['Consulta','Señada','Confirmada','Finalizada','Cancelada'].map(x=>`<option ${e?.status===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Desde</label><input name="start" type="time" required value="${e?.start||'17:00'}"></div><div class="field"><label>Hasta</label><input name="end" type="time" required value="${e?.end||'20:00'}"></div><div class="field"><label>Paquete</label><input name="package" value="${esc(e?.package||'Clásico')}"></div><div class="field"><label>Invitados estimados</label><input name="guests" type="number" value="${e?.guests||0}"></div><div class="field"><label>Precio total</label><input name="total" type="number" value="${e?.total||0}"></div><div class="field"><label>Ya cobrado</label><input name="paid" type="number" value="${e?.paid||0}"></div><div class="field span2"><label>Observaciones</label><textarea name="notes">${esc(e?.notes||'')}</textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Guardar fiesta</button></div></form>`);$('#event-form').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));['age','guests','total','paid'].forEach(k=>f[k]=Number(f[k]||0));e?Object.assign(e,f):data.events.push({id:id(),salonId:session.salonId,...f,rsvps:[]});save();closeModal();toast('Fiesta guardada');renderSalonShell()}}
window.openEventForm=openEventForm;
function openEvent(eid){let e=data.events.find(x=>x.id===eid),r=e.rsvps||[];showModal(`<div class="modal-title"><div><h2>${esc(e.child)} · ${fmtDate(e.date)}</h2><p>${esc(e.client)} · ${e.start} a ${e.end}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><div class="grid stats" style="grid-template-columns:repeat(3,1fr)"><div class="card"><small class="muted">Total</small><strong>${money(e.total)}</strong></div><div class="card"><small class="muted">Saldo</small><strong class="${e.total-e.paid?'bad':'good'}">${money(e.total-e.paid)}</strong></div><div class="card"><small class="muted">Confirmados</small><strong>${r.filter(x=>x.status==='Sí').length}</strong></div></div><div class="toolbar" style="margin-top:16px"><button class="primary small" onclick="openPayment('${eid}')">Registrar pago</button><button class="secondary small" onclick="openInvitation('${eid}')">Invitación</button><button class="ghost small" onclick="copyInvitation('${eid}')">Copiar WhatsApp</button><button class="ghost small" onclick="openEventForm('${eid}')">Editar</button></div><div class="list"><div class="list-item"><div><strong>Paquete ${esc(e.package)}</strong><small>${e.guests} invitados estimados</small></div><span class="pill ${e.status.toLowerCase()}">${e.status}</span></div><div class="list-item"><div><strong>Observaciones</strong><small>${esc(e.notes||'Sin observaciones')}</small></div></div></div>`)}window.openEvent=openEvent;
function openPayment(eid){let e=data.events.find(x=>x.id===eid);showModal(`<div class="modal-title"><div><h2>Registrar pago</h2><p>Saldo ${money(e.total-e.paid)}</p></div></div><form id="pf"><div class="field"><label>Importe</label><input name="amount" type="number" min="1" required></div><div class="form-actions"><button class="ghost" type="button" onclick="openEvent('${eid}')">Cancelar</button><button class="primary">Registrar</button></div></form>`);$('#pf').onsubmit=x=>{x.preventDefault();e.paid+=Number(new FormData(x.target).get('amount'));save();toast('Pago registrado');openEvent(eid)}}window.openPayment=openPayment;
function openInvitation(eid){let e=data.events.find(x=>x.id===eid),c=cardFor(eid);showModal(`${cardHTML(e,c)}<div class="form-actions"><button class="secondary" onclick="openRSVP('${eid}')">✅ Confirmar asistencia</button><button class="ghost" onclick="downloadCard('${eid}')">⬇ Descargar PNG</button><button class="primary" onclick="shareCardWhatsApp('${eid}')">Compartir WhatsApp</button></div>`)}window.openInvitation=openInvitation;
function copyInvitation(eid){shareCardWhatsApp(eid)}window.copyInvitation=copyInvitation;
function openRSVP(eid){let e=data.events.find(x=>x.id===eid);showModal(`<div class="modal-title"><div><h2>Confirmar asistencia</h2><p>Cumple de ${esc(e.child)}</p></div></div><form id="rf"><div class="form-grid"><div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>¿Asiste?</label><select name="status"><option>Sí</option><option>No</option></select></div><div class="field span2"><label>Observación</label><input name="note" placeholder="Alergias, alimentación, etc."></div></div><div class="form-actions"><button class="ghost" type="button" onclick="openInvitation('${eid}')">Volver</button><button class="primary">Confirmar</button></div></form>`);$('#rf').onsubmit=x=>{x.preventDefault();e.rsvps=e.rsvps||[];e.rsvps.push(Object.fromEntries(new FormData(x.target)));save();toast('Asistencia registrada');openEvent(eid)}}window.openRSVP=openRSVP;
function openStaffForm(){showModal(`<div class="modal-title"><div><h2>Agregar personal</h2></div></div><form id="sf"><div class="form-grid"><div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Rol</label><input name="role" required></div><div class="field"><label>WhatsApp</label><input name="phone"></div><div class="field"><label>Valor por fiesta</label><input name="defaultFee" type="number"></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar</button></div></form>`);$('#sf').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));f.defaultFee=Number(f.defaultFee||0);data.staff.push({id:id(),salonId:session.salonId,...f});save();closeModal();renderSalonShell()}}window.openStaffForm=openStaffForm;
function openSupplierForm(){showModal(`<div class="modal-title"><div><h2>Nuevo proveedor</h2></div></div><form id="spf"><div class="form-grid"><div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Categoría</label><input name="category" required></div><div class="field"><label>WhatsApp</label><input name="phone"></div><div class="field"><label>Saldo adeudado</label><input name="balance" type="number"></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar</button></div></form>`);$('#spf').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));f.balance=Number(f.balance||0);data.suppliers.push({id:id(),salonId:session.salonId,...f});save();closeModal();renderSalonShell()}}window.openSupplierForm=openSupplierForm;
function openOrderForm(){let ev=se(),ps=sp();if(!ev.length||!ps.length)return toast('Necesitás una fiesta y un proveedor');showModal(`<div class="modal-title"><div><h2>Nuevo pedido</h2><p>Después lo enviás por WhatsApp</p></div></div><form id="of"><div class="form-grid"><div class="field"><label>Fiesta</label><select name="eventId">${ev.map(e=>`<option value="${e.id}">${fmtDate(e.date)} · ${esc(e.child)}</option>`).join('')}</select></div><div class="field"><label>Proveedor</label><select name="supplierId">${ps.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field span2"><label>Detalle</label><textarea name="detail" required></textarea></div><div class="field"><label>Importe</label><input name="amount" type="number"></div><div class="field"><label>Estado</label><select name="status"><option>Pendiente</option><option>Pedido</option><option>Recibido</option><option>Pagado</option></select></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar</button></div></form>`);$('#of').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));f.amount=Number(f.amount||0);data.orders.push({id:id(),salonId:session.salonId,...f});save();closeModal();renderSalonShell()}}window.openOrderForm=openOrderForm;
function sendOrderWhatsApp(oid){let o=data.orders.find(x=>x.id===oid),p=data.suppliers.find(x=>x.id===o.supplierId),e=data.events.find(x=>x.id===o.eventId),t=`Hola ${p.name}, te paso pedido para la fiesta de ${e.child} del ${fmtDate(e.date)}:\n\n${o.detail}\n\nGracias.`;window.open(`https://wa.me/${(p.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(t)}`,'_blank')}window.sendOrderWhatsApp=sendOrderWhatsApp;
function editSalonProfile(){let s=salon();showModal(`<div class="modal-title"><div><h2>Editar salón</h2><p>Personalizá la identidad que verán tus clientes.</p></div></div><form id="ep"><div class="logo-upload-box">${s.logo?`<img id="logo-preview" src="${s.logo}" alt="Logo">`:`<div id="logo-preview" class="logo-preview-placeholder">${esc((s.name||'S').slice(0,1))}</div>`}<div><b>Logo del salón</b><small>PNG o JPG. Quedará guardado en esta demo.</small><label class="secondary file-button">📷 Elegir logo<input id="salon-logo-file" type="file" accept="image/*" hidden></label><button type="button" class="ghost small" onclick="removeSalonLogo()">Quitar logo</button></div></div><input type="hidden" name="logo" value="${esc(s.logo||'')}"><div class="form-grid"><div class="field span2"><label>Nombre</label><input name="name" value="${esc(s.name)}"></div><div class="field"><label>Responsable</label><input name="owner" value="${esc(s.owner)}"></div><div class="field"><label>WhatsApp</label><input name="phone" value="${esc(s.phone)}"></div><div class="field span2"><label>Dirección</label><input name="address" value="${esc(s.address)}"></div><div class="field"><label>Color de marca</label><input name="brandColor" type="color" value="${esc(s.brandColor||'#7257ff')}"></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar cambios</button></div></form>`);let form=$('#ep');$('#salon-logo-file').onchange=e=>{let file=e.target.files[0];if(!file)return;let r=new FileReader();r.onload=()=>{form.elements.logo.value=r.result;let p=$('#logo-preview');if(p.tagName==='IMG')p.src=r.result;else p.outerHTML=`<img id="logo-preview" src="${r.result}" alt="Logo">`};r.readAsDataURL(file)};form.onsubmit=x=>{x.preventDefault();Object.assign(s,Object.fromEntries(new FormData(x.target)));save();closeModal();renderSalonShell()}}window.editSalonProfile=editSalonProfile;
function removeSalonLogo(){let f=$('#ep');if(!f)return;f.elements.logo.value='';let p=$('#logo-preview');p.outerHTML=`<div id="logo-preview" class="logo-preview-placeholder">${esc((salon().name||'S').slice(0,1))}</div>`}window.removeSalonLogo=removeSalonLogo;
function openPublicPreview(){let e=se().sort((a,b)=>a.date.localeCompare(b.date))[0];if(e)openInvitation(e.id);else toast('Creá una fiesta primero')}window.openPublicPreview=openPublicPreview;

function renderCommunity(){
 setTitle('Comunidad de Salones','Noticias, promociones, beneficios y novedades de toda la red');
 let s=salon();
 let posts=[...(data.communityPosts||[])].filter(p=>p.target==='Todos'||p.target===s.plan||p.target===s.id).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.created.localeCompare(a.created));
 let unread=posts.filter(p=>!(p.readBy||[]).includes(s.id)).length;
 $('#content').innerHTML=`<div class="community-hero"><div><div class="eyebrow light">COMUNIDAD FIESTACONTROL</div><h2>Conectados hacemos crecer cada salón.</h2><p>Novedades, promociones, beneficios, ideas y comunicaciones oficiales para los salones de la red.</p></div><div class="community-badge"><b>${posts.length}</b><small>publicaciones</small><span>${unread} nuevas</span></div></div><div class="community-layout"><div class="community-feed">${posts.map(p=>communityPostCard(p,s)).join('')||'<div class="card empty">Todavía no hay publicaciones.</div>'}</div><aside class="community-side"><div class="card"><h3>Tu comunidad</h3><div class="community-stat"><span>🏪</span><div><b>${data.salons.filter(x=>x.status==='Aprobado').length}</b><small>salones activos</small></div></div><div class="community-stat"><span>📣</span><div><b>${posts.filter(p=>p.type==='Promoción').length}</b><small>promociones publicadas</small></div></div><p class="muted">Las publicaciones oficiales son administradas por FiestaControl.</p></div></aside></div>`;
 posts.forEach(p=>{p.readBy=p.readBy||[];if(!p.readBy.includes(s.id))p.readBy.push(s.id)}); save();
}
function communityPostCard(p,s){let comments=p.comments||[];return `<article class="card community-post ${p.pinned?'pinned':''}"><div class="post-head"><div><span class="post-type ${p.type.toLowerCase().replace(/ó/g,'o')}">${p.type}</span>${p.pinned?'<span class="pin">📌 Fijado</span>':''}</div><small>${new Date(p.created).toLocaleString('es-AR')}</small></div><h3>${esc(p.title)}</h3><p>${esc(p.body).replace(/\n/g,'<br>')}</p>${p.promoCode?`<div class="promo-code">🎁 Código/beneficio: <b>${esc(p.promoCode)}</b></div>`:''}<div class="post-foot"><span>Publicado por <b>${esc(p.author||'FiestaControl')}</b></span><button class="ghost small" onclick="toggleComments('${p.id}')">💬 ${comments.length} comentario(s)</button></div><div class="comments" id="comments-${p.id}" style="display:none">${comments.map(c=>`<div class="comment"><b>${esc(c.salonName)}</b><span>${esc(c.text)}</span><small>${new Date(c.created).toLocaleString('es-AR')}</small></div>`).join('')||'<div class="muted">Sin comentarios todavía.</div>'}<form onsubmit="addCommunityComment(event,'${p.id}')"><input name="text" placeholder="Escribí un comentario..." required><button class="secondary small">Enviar</button></form></div></article>`}
function toggleComments(pid){let e=$('#comments-'+pid);if(e)e.style.display=e.style.display==='none'?'block':'none'} window.toggleComments=toggleComments;
function addCommunityComment(ev,pid){ev.preventDefault();let p=data.communityPosts.find(x=>x.id===pid),s=salon(),text=new FormData(ev.target).get('text');p.comments=p.comments||[];p.comments.push({id:id(),salonId:s.id,salonName:s.name,text,created:new Date().toISOString()});save();renderCommunity()} window.addCommunityComment=addCommunityComment;
function superCommunity(){
 let posts=[...(data.communityPosts||[])].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.created.localeCompare(a.created));
 let totalReads=posts.reduce((a,p)=>a+(p.readBy||[]).length,0), totalComments=posts.reduce((a,p)=>a+(p.comments||[]).length,0);
 $('#content').innerHTML=`<div class="admin-hero community-admin-hero"><div><div class="eyebrow light">ADMINISTRACIÓN DE COMUNIDAD</div><h2>Tu canal directo con todos los salones.</h2><p>Publicá novedades, promociones, alertas, beneficios y comunicaciones segmentadas.</p><div class="hero-admin-actions"><button class="hero-btn" onclick="openCommunityPostForm()">+ Nueva publicación</button></div></div><div class="hero-orb"><span>📣</span><b>${posts.length}</b><small>publicaciones</small></div></div><div class="admin-kpis"><div class="admin-kpi purple"><span>📣</span><div><small>Publicaciones</small><strong>${posts.length}</strong><em>en la comunidad</em></div></div><div class="admin-kpi cyan"><span>👁</span><div><small>Lecturas</small><strong>${totalReads}</strong><em>acumuladas</em></div></div><div class="admin-kpi green"><span>💬</span><div><small>Comentarios</small><strong>${totalComments}</strong><em>de los salones</em></div></div><div class="admin-kpi amber"><span>📌</span><div><small>Fijadas</small><strong>${posts.filter(p=>p.pinned).length}</strong><em>prioridad alta</em></div></div></div><div class="card"><div class="section-title"><div><small class="eyebrow">PUBLICACIONES</small><h3>Comunidad FiestaControl</h3></div><button class="primary small" onclick="openCommunityPostForm()">+ Publicar</button></div>${posts.map(p=>`<div class="admin-community-row"><div class="post-icon">${p.type==='Promoción'?'🎁':p.type==='Alerta'?'🚨':p.type==='Beneficio'?'⭐':'📰'}</div><div class="grow"><div><span class="post-type ${p.type.toLowerCase().replace(/ó/g,'o')}">${p.type}</span>${p.pinned?'<span class="pin">📌 Fijado</span>':''}</div><strong>${esc(p.title)}</strong><small>${esc(p.target)} · ${(p.readBy||[]).length} lecturas · ${(p.comments||[]).length} comentarios</small></div><div class="actions"><button class="secondary small" onclick="openCommunityPostForm('${p.id}')">Editar</button><button class="ghost small" onclick="togglePinCommunity('${p.id}')">${p.pinned?'Desfijar':'Fijar'}</button><button class="danger small" onclick="deleteCommunityPost('${p.id}')">Borrar</button></div></div>`).join('')||'<div class="empty">No hay publicaciones.</div>'}</div>`;
}
function openCommunityPostForm(pid){let p=pid?data.communityPosts.find(x=>x.id===pid):null;showModal(`<div class="modal-title"><div><h2>${p?'Editar':'Nueva'} publicación</h2><p>Comunidad de salones</p></div></div><form id="community-form"><div class="form-grid"><div class="field"><label>Tipo</label><select name="type"><option ${p?.type==='Noticia'?'selected':''}>Noticia</option><option ${p?.type==='Promoción'?'selected':''}>Promoción</option><option ${p?.type==='Beneficio'?'selected':''}>Beneficio</option><option ${p?.type==='Alerta'?'selected':''}>Alerta</option><option ${p?.type==='Capacitación'?'selected':''}>Capacitación</option></select></div><div class="field"><label>Destinatarios</label><select name="target"><option ${!p||p.target==='Todos'?'selected':''}>Todos</option><option ${p?.target==='Inicial'?'selected':''}>Inicial</option><option ${p?.target==='Profesional'?'selected':''}>Profesional</option><option ${p?.target==='Premium'?'selected':''}>Premium</option>${data.salons.filter(s=>s.status==='Aprobado').map(s=>`<option value="${s.id}" ${p?.target===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field span2"><label>Título</label><input name="title" required value="${esc(p?.title||'')}"></div><div class="field span2"><label>Mensaje</label><textarea name="body" rows="6" required>${esc(p?.body||'')}</textarea></div><div class="field"><label>Código o beneficio (opcional)</label><input name="promoCode" value="${esc(p?.promoCode||'')}"></div><div class="field checkbox-field"><label><input type="checkbox" name="pinned" ${p?.pinned?'checked':''}> Fijar publicación arriba</label></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">${p?'Guardar cambios':'Publicar ahora'}</button></div></form>`);$('#community-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));f.pinned=e.target.elements.pinned.checked;if(p){Object.assign(p,f)}else data.communityPosts.push({id:id(),...f,author:'FiestaControl',created:new Date().toISOString(),comments:[],readBy:[]});save();closeModal();superCommunity();toast(p?'Publicación actualizada':'Publicación enviada a la comunidad')}} window.openCommunityPostForm=openCommunityPostForm;
function togglePinCommunity(pid){let p=data.communityPosts.find(x=>x.id===pid);p.pinned=!p.pinned;save();superCommunity()} window.togglePinCommunity=togglePinCommunity;
function deleteCommunityPost(pid){if(!confirm('¿Borrar esta publicación de la comunidad?'))return;data.communityPosts=data.communityPosts.filter(x=>x.id!==pid);save();superCommunity()} window.deleteCommunityPost=deleteCommunityPost;

function renderSuper(){view=view==='dashboard'?'platform':view;let nav=[['platform','✨','Resumen'],['salons','🏪','Salones'],['requests','📝','Solicitudes'],['communityAdmin','📣','Comunidad'],['plans','💳','Planes']];$('#app').innerHTML=`<div class="shell super-shell"><aside class="sidebar super-sidebar"><div class="brand"><div class="mark admin-mark">FC</div><div><b>FiestaControl</b><small>Super Administrador</small></div></div><div class="super-mini"><span>⚡</span><div><small>PLATAFORMA</small><strong>Centro de operaciones</strong></div></div><nav class="nav">${nav.map(([v,i,n])=>`<button data-v="${v}" class="${view===v?'active':''}">${i} ${n}</button>`).join('')}</nav><div class="side-foot"><div class="user-chip"><b>${esc(session.name)}</b><small>Control total</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar admin-topbar"><div><div class="eyebrow">FIESTACONTROL ADMIN</div><h1 id="title">Panel general</h1><p id="subtitle">Todo el negocio de la plataforma en una sola vista</p></div><div class="top-actions"><button class="ghost" onclick="view='requests';renderSuper()">🔔 Solicitudes</button><button class="primary" onclick="openCreateSalon()">+ Crear salón</button></div></header><section class="content" id="content"></section></main></div><div id="toast" class="toast"></div>`;$$('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;renderSuper()});renderSuperView()}
function renderSuperView(){if(view==='salons')return superSalons();if(view==='requests')return superRequests();if(view==='plans')return superPlans();if(view==='communityAdmin')return superCommunity();superPlatform()}
function superPlatform(){let active=data.salons.filter(s=>s.status==='Aprobado').length,pending=data.salons.filter(s=>s.status==='Pendiente').length,suspended=data.salons.filter(s=>s.status==='Suspendido').length,totalEvents=data.events.length,totalBilled=data.events.reduce((a,e)=>a+Number(e.total||0),0),recent=data.salons.slice(-4).reverse();$('#content').innerHTML=`<div class="admin-hero"><div><div class="eyebrow light">CENTRO DE CONTROL</div><h2>La plataforma, de un vistazo.</h2><p>Altas, actividad, facturación y estado de todos los salones registrados.</p><div class="hero-admin-actions"><button class="hero-btn" onclick="view='requests';renderSuper()">📝 Revisar ${pending} solicitud(es)</button><button class="hero-btn ghosty" onclick="view='salons';renderSuper()">🏪 Ver salones</button></div></div><div class="hero-orb"><span>🎉</span><b>${totalEvents}</b><small>fiestas cargadas</small></div></div><div class="admin-kpis"><div class="admin-kpi purple"><span>🏪</span><div><small>Salones activos</small><strong>${active}</strong><em>operando ahora</em></div></div><div class="admin-kpi amber"><span>📝</span><div><small>Altas pendientes</small><strong>${pending}</strong><em>requieren revisión</em></div></div><div class="admin-kpi cyan"><span>🎉</span><div><small>Eventos gestionados</small><strong>${totalEvents}</strong><em>en toda la red</em></div></div><div class="admin-kpi green"><span>💰</span><div><small>Volumen cargado</small><strong>${money(totalBilled)}</strong><em>reservas registradas</em></div></div></div><div class="grid admin-grid"><div class="card admin-panel-card"><div class="section-title"><div><small class="eyebrow">ACTIVIDAD</small><h3>Salones recientes</h3></div><button class="ghost small" onclick="view='salons';renderSuper()">Ver todos →</button></div>${recent.map(s=>`<div class="admin-salon-row"><div class="salon-avatar">${s.logo?`<img src="${s.logo}" alt="">`:esc((s.name||'S').slice(0,1))}</div><div class="grow"><strong>${esc(s.name)}</strong><small>${esc(s.owner)} · Plan ${esc(s.plan)}</small></div><span class="pill ${s.status==='Aprobado'?'aprobado':s.status.toLowerCase()}">${s.status}</span></div>`).join('')}</div><div class="card admin-panel-card"><div class="section-title"><div><small class="eyebrow">SALUD</small><h3>Estado de la plataforma</h3></div></div><div class="platform-meter"><div><b>${active}</b><small>Activos</small></div><div><b>${pending}</b><small>Pendientes</small></div><div><b>${suspended}</b><small>Suspendidos</small></div></div><div class="admin-notice ${pending?'attention':'ok'}"><span>${pending?'🔔':'✅'}</span><div><b>${pending?`${pending} solicitud(es) esperando aprobación`:'Todo al día'}</b><small>${pending?'Entrá a Solicitudes para revisarlas.':'No hay altas pendientes.'}</small></div></div><div class="admin-notice ok"><span>🔐</span><div><b>Datos separados por salón</b><small>Cada negocio accede solamente a su propia operación.</small></div></div></div></div>`}
function superSalons(){let rows=data.salons.map(s=>`<tr><td><b>${esc(s.name)}</b><br><small class="muted">${esc(s.owner)}</small></td><td>${esc(s.email)}</td><td>${esc(s.plan)}</td><td><span class="pill ${s.status==='Aprobado'?'aprobado':s.status.toLowerCase()}">${s.status}</span></td><td>${fmtDate(s.created)}</td><td class="actions"><button class="secondary small" onclick="impersonate('${s.id}')">Entrar</button><button class="${s.status==='Suspendido'?'ghost':'danger'} small" onclick="toggleSalon('${s.id}')">${s.status==='Suspendido'?'Reactivar':'Suspender'}</button></td></tr>`).join('');$('#content').innerHTML=`<div class="card table-wrap"><table class="table"><thead><tr><th>Salón</th><th>Email</th><th>Plan</th><th>Estado</th><th>Alta</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6"><div class="empty">Todavía no hay salones registrados.</div></td></tr>'}</tbody></table></div>`}
function superRequests(){
 let salons=data.salons.filter(s=>s.status==='Pendiente');
 let providers=(data.marketSuppliers||[]).filter(p=>p.status==='Pendiente');
 $('#content').innerHTML=`
 <div class="admin-hero"><div><div class="eyebrow light">ALTAS PENDIENTES</div><h2>Nuevos registros para aprobar.</h2><p>Acá aparecen automáticamente todos los salones y proveedores que se registran desde la pantalla pública.</p></div><div class="hero-orb"><span>🔔</span><b>${salons.length+providers.length}</b><small>pendientes</small></div></div>
 <div class="grid two" style="margin-top:18px">
  <div class="card"><div class="section-title"><h3>🏪 Salones</h3><span class="pill pendiente">${salons.length} pendientes</span></div>
   ${salons.map(x=>`<div class="list-item"><div><strong>${esc(x.name)}</strong><small>${esc(x.owner)} · ${esc(x.email)} · ${esc(x.address||'')}</small></div><div class="actions"><button class="primary small" onclick="approveSalon('${x.id}')">Aprobar</button><button class="danger small" onclick="rejectSalon('${x.id}')">Rechazar</button></div></div>`).join('')||'<div class="empty">No hay salones pendientes.</div>'}
  </div>
  <div class="card"><div class="section-title"><h3>🚚 Proveedores</h3><span class="pill pendiente">${providers.length} pendientes</span></div>
   ${providers.map(x=>`<div class="list-item"><div><strong>${esc(x.business)}</strong><small>${esc(x.category)} · ${esc(x.owner)} · ${esc(x.email)}</small></div><div class="actions"><button class="primary small" onclick="approveProviderFromRequests('${x.id}')">Aprobar</button><button class="danger small" onclick="rejectProvider('${x.id}')">Rechazar</button></div></div>`).join('')||'<div class="empty">No hay proveedores pendientes.</div>'}
  </div>
 </div>`;
}
function approveProviderFromRequests(pid){let p=data.marketSuppliers.find(x=>x.id===pid);if(!p)return;p.status='Aprobado';save();toast('Proveedor aprobado');superRequests();}
function rejectProvider(pid){data.marketSuppliers=data.marketSuppliers.filter(x=>x.id!==pid);save();toast('Solicitud de proveedor rechazada');superRequests();}
window.approveProviderFromRequests=approveProviderFromRequests;window.rejectProvider=rejectProvider;
function approveSalon(sid){let s=data.salons.find(x=>x.id===sid);s.status='Aprobado';save();toast('Salón aprobado');renderSuper()}window.approveSalon=approveSalon;
function rejectSalon(sid){data.salons=data.salons.filter(x=>x.id!==sid);save();toast('Solicitud rechazada');renderSuper()}window.rejectSalon=rejectSalon;
function toggleSalon(sid){let s=data.salons.find(x=>x.id===sid);s.status=s.status==='Suspendido'?'Aprobado':'Suspendido';save();renderSuper()}window.toggleSalon=toggleSalon;
function impersonate(sid){let s=data.salons.find(x=>x.id===sid);if(s.status!=='Aprobado')return toast('Primero aprobá el salón');setSession({role:'salon',salonId:s.id,name:s.owner,impersonated:true});view='dashboard';render()}window.impersonate=impersonate;
function openCreateSalon(){showModal(`<div class="modal-title"><div><h2>Crear salón</h2><p>Alta manual desde administración</p></div></div><form id="cs"><div class="form-grid"><div class="field span2"><label>Nombre</label><input name="name" required></div><div class="field"><label>Responsable</label><input name="owner" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Contraseña</label><input name="password" required value="1234"></div><div class="field"><label>Plan</label><select name="plan"><option>Inicial</option><option>Profesional</option><option>Premium</option></select></div><div class="field span2"><label>Dirección</label><input name="address"></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Crear y aprobar</button></div></form>`);$('#cs').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));data.salons.push({id:id(),...f,phone:'',status:'Aprobado',created:new Date().toISOString().slice(0,10),brandColor:'#7257ff',logo:''});save();closeModal();renderSuper()}}window.openCreateSalon=openCreateSalon;

/* ===================== V6: comunidad, marketplace y disponibilidad pública ===================== */

data.marketSuppliers=data.marketSuppliers||[];
data.salons.forEach(s=>{if(typeof s.publicAvailabilityEnabled==='undefined')s.publicAvailabilityEnabled=false});
save();

function unreadCommunityCount(s=salon()){
 if(!s)return 0;
 return (data.communityPosts||[]).filter(p=>(p.target==='Todos'||p.target===s.plan||p.target===s.id)&&!(p.readBy||[]).includes(s.id)).length;
}
function render(){
 if(!session)return renderAuth();
 if(session.role==='superadmin')return renderSuper();
 if(session.role==='provider')return renderProviderShell();
 return renderSalonShell();
}

function renderAuth(mode='login'){
 let panel='';
 if(mode==='login') panel=`<h2>Ingresar</h2><p class="muted">Accedé a tu panel de gestión.</p><div class="tabs"><button class="active" onclick="renderAuth('login')">Salón / Admin</button><button onclick="renderAuth('provider-login')">Proveedor</button></div>${loginForm()}`;
 if(mode==='register') panel=`<h2>Registrar mi salón</h2><p class="muted">Creá la cuenta del salón. Quedará pendiente de aprobación.</p>${registerForm()}`;
 if(mode==='provider-login') panel=`<h2>Ingreso de proveedores</h2><p class="muted">Gestioná tu catálogo y conectate con los salones.</p><div class="tabs"><button onclick="renderAuth('login')">Salón / Admin</button><button class="active">Proveedor</button></div><form id="auth-form"><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Contraseña</label><input name="password" type="password" required></div><button class="primary w100">Ingresar como proveedor</button></form>`;
 if(mode==='provider-register') panel=`<h2>Quiero ser proveedor</h2><p class="muted">Publicá tus productos y recibí pedidos por WhatsApp.</p><form id="auth-form"><div class="form-grid"><div class="field span2"><label>Empresa / marca</label><input name="business" required></div><div class="field"><label>Responsable</label><input name="owner" required></div><div class="field"><label>Rubro</label><input name="category" required placeholder="Cotillón, bebidas, catering..."></div><div class="field"><label>WhatsApp</label><input name="phone" required placeholder="54911..."></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field span2"><label>Descripción</label><textarea name="description" rows="3"></textarea></div><div class="field span2"><label>Contraseña</label><input name="password" type="password" required minlength="4"></div></div><button class="primary w100">Registrar proveedor</button></form>`;
 if(mode==='availability') panel=`<h2>Buscar fecha disponible</h2><p class="muted">Consultá los salones que habilitaron su agenda pública.</p>${publicAvailabilityHome()}`;
 $('#app').innerHTML=`<div class="auth"><section class="auth-hero"><div class="auth-brand"><div class="mark">FC</div><b>FiestaControl</b></div><div class="auth-copy"><h1>Fiestas, salones y proveedores conectados.</h1><p>Gestioná tu salón, encontrá proveedores y consultá fechas disponibles desde un solo lugar.</p><div class="hero-points"><div class="hero-point"><strong>🏪 Salones</strong><small>Agenda, reservas y caja.</small></div><div class="hero-point"><strong>🛍️ Proveedores</strong><small>Productos y pedidos por WhatsApp.</small></div><div class="hero-point"><strong>📅 Familias</strong><small>Fechas disponibles para festejar.</small></div></div></div><small>FiestaControl · Comunidad de eventos</small></section><section class="auth-panel"><div class="auth-card">${panel}<div class="entry-actions"><button class="secondary" onclick="renderAuth('register')">🏪 Registrar salón</button><button class="secondary" onclick="renderAuth('provider-register')">🚚 Registrar proveedor</button><button class="secondary" onclick="renderAuth('availability')">📅 Ver fechas disponibles</button></div><div class="demo-box"><b>Altas controladas</b><br>Salones y proveedores nuevos requieren aprobación del administrador.</div></div></section></div>`;
 bindAuth(mode);
}
window.renderAuth=renderAuth;
function bindAuth(mode){
 let form=$('#auth-form'); if(!form)return;
 form.onsubmit=async e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));
  if(mode==='login'){
   let a=data.admins.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(a){setSession({role:'superadmin',userId:a.id,name:a.name});view='platform';return render()}
   let s=data.salons.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(!s)return toast('Email o contraseña incorrectos');if(s.status==='Pendiente')return toast('Tu salón aún está pendiente de aprobación');if(s.status==='Suspendido')return toast('La cuenta del salón está suspendida');setSession({role:'salon',salonId:s.id,name:s.owner});view='dashboard';return render();
  }
  if(mode==='register'){
   if(data.salons.some(x=>x.email.toLowerCase()===f.email.toLowerCase()))return toast('Ese email ya está registrado');let s={id:id(),...f,status:'Pendiente',plan:'Inicial',created:new Date().toISOString().slice(0,10),brandColor:'#7257ff',logo:'',publicAvailabilityEnabled:false};data.salons.push(s);save();showModal(`<div class="modal-title"><div><h2>Registro recibido ✅</h2><p>${esc(s.name)}</p></div></div><p>La cuenta quedó <b>pendiente de aprobación</b> y ya aparece en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('login')">Volver</button></div>`);return;
  }
  if(mode==='provider-login'){
   let p=data.marketSuppliers.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(!p)return toast('Email o contraseña incorrectos');if(p.status==='Pendiente')return toast('Tu proveedor está pendiente de aprobación');if(p.status==='Suspendido')return toast('La cuenta está suspendida');setSession({role:'provider',providerId:p.id,name:p.owner});view='providerHome';return render();
  }
  if(mode==='provider-register'){
   try{
    if(SERVER_MODE){
      let r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'provider',data:f}),cache:'no-store'}),res=await r.json();
      if(!r.ok||!res.ok) return toast(res.error||'No se pudo registrar el proveedor');
      data=res.state;normalizeLiveData();lastStoreSnapshot=JSON.stringify(data);
      showModal(`<h2>Proveedor registrado ✅</h2><p>El proveedor quedó pendiente de aprobación y fue guardado directamente en el servidor central. Ya aparecerá en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('provider-login')">Ir al ingreso</button></div>`);return;
    }
    if(data.marketSuppliers.some(x=>x.email.toLowerCase()===f.email.toLowerCase()))return toast('Ese email ya está registrado');data.marketSuppliers.push({id:id(),...f,status:'Pendiente',created:new Date().toISOString().slice(0,10),products:[]});save();showModal(`<h2>Proveedor registrado ✅</h2><p>Tu perfil quedó pendiente de aprobación. Ya aparece en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('provider-login')">Ir al ingreso</button></div>`);return;
   }catch(err){console.error(err);toast('No se pudo conectar con el servidor central');return;}
  }
 };
}

function publicAvailabilityHome(){
 let salons=data.salons.filter(s=>s.status==='Aprobado'&&s.publicAvailabilityEnabled);
 return `<div class="public-salon-list">${salons.map(s=>`<button class="public-salon-card" onclick="openPublicAvailability('${s.id}')"><div class="salon-avatar">${s.logo?`<img src="${s.logo}" alt="">`:esc((s.name||'S')[0])}</div><div><b>${esc(s.name)}</b><small>${esc(s.address||'')}</small></div><span>Ver agenda →</span></button>`).join('')||'<div class="empty">Por ahora no hay salones con agenda pública habilitada.</div>'}</div>`;
}
function openPublicAvailability(sid){
 let s=data.salons.find(x=>x.id===sid);if(!s||!s.publicAvailabilityEnabled)return toast('Agenda no disponible');
 let year=2026,month=8,days=new Date(year,month+1,0).getDate(),first=new Date(year,month,1).getDay();let cells=[];
 for(let i=0;i<first;i++)cells.push('<div class="day off"></div>');
 for(let n=1;n<=days;n++){let ds=`${year}-09-${String(n).padStart(2,'0')}`,busy=data.events.some(e=>e.salonId===sid&&e.date===ds&&['Señada','Confirmada'].includes(e.status));cells.push(`<div class="day public-day ${busy?'busy':'available'}"><div class="day-number">${n}</div><b>${busy?'Ocupado':'Disponible'}</b>${!busy?`<button class="secondary small" onclick="askDateWhatsApp('${sid}','${ds}')">Consultar</button>`:''}</div>`)}
 showModal(`<div class="modal-title"><div><h2>${esc(s.name)}</h2><p>Disponibilidad pública · Septiembre 2026</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><div class="availability-legend"><span>🟢 Disponible</span><span>🔴 Ocupado</span></div><div class="calendar public-calendar">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(x=>`<div class="weekday">${x}</div>`).join('')}${cells.join('')}</div>`);
}
window.openPublicAvailability=openPublicAvailability;
function askDateWhatsApp(sid,date){let s=data.salons.find(x=>x.id===sid),t=`Hola ${s.name}, quisiera consultar disponibilidad y precio para una fiesta el ${fmtDate(date)}.`;window.open(`https://wa.me/${(s.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(t)}`,'_blank')}
window.askDateWhatsApp=askDateWhatsApp;

function renderSalonShell(){
 let s=salon(),unread=unreadCommunityCount(s);
 $('#app').innerHTML=`<div class="shell salon-shell" style="--tenant-accent:${esc(s.brandColor||'#7257ff')}"><aside class="sidebar"><div class="brand"><div class="mark">FC</div><div><b>FiestaControl</b><small>Panel del salón</small></div></div><div class="tenant tenant-brand">${s.logo?`<img src="${s.logo}" alt="Logo" class="tenant-logo">`:`<div class="tenant-logo placeholder">${esc((s.name||'S').slice(0,1))}</div>`}<div><small>Salón activo</small><strong>${esc(s.name)}</strong></div></div><nav class="nav">${salonNav.map(([v,i,n])=>`<button data-v="${v}" class="${view===v?'active':''}">${i} ${n}${v==='community'&&unread?`<span class="nav-badge">${unread}</span>`:''}</button>`).join('')}</nav><div class="side-foot"><div class="user-chip"><b>${esc(s.owner)}</b><small>${esc(s.email)}</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div><h1 id="title"></h1><p id="subtitle"></p></div><div class="top-actions">${unread?`<button class="notice-btn" onclick="view='community';renderSalonShell()">🔔 ${unread} mensaje(s)</button>`:''}<button class="ghost" onclick="openPublicPreview()">👁 Vista cliente</button><button class="primary" onclick="openEventForm()">+ Nueva fiesta</button></div></header><section class="content" id="content"></section></main></div><div id="toast" class="toast"></div>`;
 $$('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;renderSalonShell()});renderSalonView();
}
function renderDashboard(){
 setTitle('Dashboard','Resumen operativo y económico de tu salón');let ev=se(), upcoming=ev.filter(e=>e.date>='2026-09-01').sort((a,b)=>a.date.localeCompare(b.date)), billed=ev.reduce((a,e)=>a+e.total,0), paid=ev.reduce((a,e)=>a+e.paid,0), balance=billed-paid, confirmed=ev.filter(e=>['Confirmada','Señada'].includes(e.status)).length,unread=unreadCommunityCount();let months=['Abr','May','Jun','Jul','Ago','Sep'], vals=[260,390,310,520,610,950];
 $('#content').innerHTML=`${unread?`<div class="message-banner" onclick="view='community';renderSalonShell()"><span>🔔</span><div><b>Tenés ${unread} mensaje(s) nuevo(s) en la Comunidad</b><small>Hay novedades publicadas por FiestaControl. Tocá para leerlas.</small></div><strong>Ver mensajes →</strong></div>`:''}<div class="grid stats"><div class="card stat"><div class="stat-icon">🎉</div><small>Fiestas activas</small><strong>${confirmed}</strong><em>${upcoming.length} próximas en agenda</em></div><div class="card stat"><div class="stat-icon">💳</div><small>Facturado</small><strong>${money(billed)}</strong><em>Reservas cargadas</em></div><div class="card stat"><div class="stat-icon">✅</div><small>Cobrado</small><strong>${money(paid)}</strong><em>${billed?Math.round(paid/billed*100):0}% del total</em></div><div class="card stat"><div class="stat-icon">⏳</div><small>Por cobrar</small><strong>${money(balance)}</strong><em class="warn">Seguimiento de saldos</em></div></div><div class="card" style="margin-top:16px"><div class="section-title"><h3>Acciones rápidas</h3><small class="muted">Lo más usado en el día a día</small></div><div class="quick-grid"><button class="quick" onclick="openEventForm()"><span>➕</span><strong>Nueva reserva</strong><small>Cargar una fiesta</small></button><button class="quick" onclick="view='calendar';renderSalonShell()"><span>📅</span><strong>Ver disponibilidad</strong><small>Abrir agenda</small></button><button class="quick" onclick="view='suppliers';renderSalonShell()"><span>🛍️</span><strong>Marketplace</strong><small>Comprar a proveedores</small></button><button class="quick" onclick="view='cards';renderSalonShell()"><span>💌</span><strong>Crear tarjeta</strong><small>Invitación virtual</small></button><button class="quick" onclick="view='finance';renderSalonShell()"><span>💰</span><strong>Revisar caja</strong><small>Cobros y pendientes</small></button></div></div><div class="grid two" style="margin-top:16px"><div class="card"><div class="section-title"><h3>Próximas fiestas</h3></div>${upcoming.slice(0,5).map(e=>`<div class="list-item"><div><strong>${fmtDate(e.date)} · ${esc(e.child)}</strong><small>${e.start} · ${esc(e.status)}</small></div><b>${money(e.total-e.paid)}</b></div>`).join('')||'<div class="empty">Sin próximas fiestas.</div>'}</div><div class="card"><div class="section-title"><h3>Alertas</h3></div>${upcoming.filter(e=>e.total-e.paid>0).slice(0,3).map(e=>`<div class="alert"><span>⚠️</span><div><b>${esc(e.child)} tiene saldo pendiente</b><small>${fmtDate(e.date)} · ${money(e.total-e.paid)}</small></div></div>`).join('')||'<div class="empty">Sin alertas.</div>'}</div></div>`;
}

function renderSuppliers(){
 setTitle('Proveedores','Tus proveedores y marketplace de la comunidad');let ps=sp(),market=data.marketSuppliers.filter(p=>p.status==='Aprobado');
 $('#content').innerHTML=`<div class="toolbar"><button class="primary" onclick="openSupplierForm()">+ Proveedor propio</button><button class="secondary" onclick="openOrderForm()">+ Nuevo pedido</button></div><div class="card marketplace-hero"><div><small class="eyebrow">MARKETPLACE FIESTACONTROL</small><h2>Comprá directo a proveedores de la comunidad</h2><p>Encontrá productos para tus fiestas y enviá el pedido por WhatsApp.</p></div><span>🛍️</span></div><div class="market-grid">${market.flatMap(p=>(p.products||[]).map(pr=>`<article class="card product-card"><div class="product-icon">📦</div><span class="post-type">${esc(p.category)}</span><h3>${esc(pr.name)}</h3><p>${esc(pr.description||'')}</p><div class="product-provider"><b>${esc(p.business)}</b><small>${esc(p.description||'')}</small></div><div class="product-bottom"><strong>${money(pr.price)}</strong><button class="primary small" onclick="orderMarketWhatsApp('${p.id}','${pr.id}')">WhatsApp</button></div></article>`)).join('')||'<div class="card empty">Todavía no hay productos publicados.</div>'}</div><div class="grid two" style="margin-top:18px"><div class="card"><div class="section-title"><h3>Mis proveedores habituales</h3></div>${ps.map(p=>`<div class="list-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div><b>${money(p.balance)}</b></div>`).join('')||'<div class="empty">Sin proveedores propios.</div>'}</div><div class="card"><div class="section-title"><h3>Mis pedidos</h3></div>${so().map(o=>{let p=data.suppliers.find(x=>x.id===o.supplierId);return `<div class="list-item"><div><strong>${esc(p?.name||'Proveedor')}</strong><small>${esc(o.status)}</small></div><button class="secondary small" onclick="sendOrderWhatsApp('${o.id}')">WhatsApp</button></div>`}).join('')||'<div class="empty">Sin pedidos.</div>'}</div></div>`;
}
function orderMarketWhatsApp(pid,prid){let p=data.marketSuppliers.find(x=>x.id===pid),pr=(p.products||[]).find(x=>x.id===prid),s=salon(),t=`Hola ${p.business}, soy ${s.name}. Quisiera consultar/pedir: ${pr.name} (${money(pr.price)}). ¿Me pasás disponibilidad y condiciones?`;window.open(`https://wa.me/${(p.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(t)}`,'_blank')}
window.orderMarketWhatsApp=orderMarketWhatsApp;

function renderProviderShell(){
 let p=data.marketSuppliers.find(x=>x.id===session.providerId);if(!p){logout();return}
 $('#app').innerHTML=`<div class="shell super-shell"><aside class="sidebar super-sidebar"><div class="brand"><div class="mark">FC</div><div><b>FiestaControl</b><small>Portal proveedor</small></div></div><div class="tenant"><div><small>PROVEEDOR</small><strong>${esc(p.business)}</strong></div></div><nav class="nav"><button data-pv="providerHome" class="${view==='providerHome'?'active':''}">🏠 Inicio</button><button data-pv="providerProducts" class="${view==='providerProducts'?'active':''}">📦 Mis productos</button><button data-pv="providerSalons" class="${view==='providerSalons'?'active':''}">🏪 Salones</button></nav><div class="side-foot"><div class="user-chip"><b>${esc(p.owner)}</b><small>${esc(p.email)}</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div><h1>${view==='providerProducts'?'Mis productos':view==='providerSalons'?'Salones de la red':'Panel del proveedor'}</h1><p>Ofrecé productos y conectate por WhatsApp.</p></div><button class="primary" onclick="openProviderProductForm()">+ Producto</button></header><section class="content" id="content"></section></main></div>`;
 $$('[data-pv]').forEach(b=>b.onclick=()=>{view=b.dataset.pv;renderProviderShell()});if(view==='providerProducts')providerProducts();else if(view==='providerSalons')providerSalons();else providerHome();
}
function providerHome(){let p=data.marketSuppliers.find(x=>x.id===session.providerId);$('#content').innerHTML=`<div class="admin-hero"><div><div class="eyebrow light">MARKETPLACE</div><h2>${esc(p.business)}</h2><p>${esc(p.description||'Administrá tu presencia dentro de FiestaControl.')}</p></div><div class="hero-orb"><span>📦</span><b>${(p.products||[]).length}</b><small>productos</small></div></div><div class="grid two" style="margin-top:18px"><div class="card"><h3>Cómo funciona</h3><p class="muted">Tus productos aparecen a los salones aprobados. Cada publicación tiene un botón de WhatsApp para que te consulten o hagan pedidos directamente.</p></div><div class="card"><h3>Tu contacto</h3><p><b>${esc(p.phone)}</b></p><p class="muted">Este WhatsApp se usa en los botones de pedido.</p></div></div>`}
function providerProducts(){let p=data.marketSuppliers.find(x=>x.id===session.providerId);$('#content').innerHTML=`<div class="market-grid">${(p.products||[]).map(pr=>`<article class="card product-card"><div class="product-icon">📦</div><h3>${esc(pr.name)}</h3><p>${esc(pr.description||'')}</p><div class="product-bottom"><strong>${money(pr.price)}</strong><button class="danger small" onclick="deleteProviderProduct('${pr.id}')">Borrar</button></div></article>`).join('')||'<div class="card empty">Todavía no publicaste productos.</div>'}</div>`}
function providerSalons(){let p=data.marketSuppliers.find(x=>x.id===session.providerId),sal=data.salons.filter(s=>s.status==='Aprobado');$('#content').innerHTML=`<div class="card"><div class="section-title"><h3>Salones de la comunidad</h3><small class="muted">Contacto comercial</small></div>${sal.map(s=>`<div class="list-item"><div><strong>${esc(s.name)}</strong><small>${esc(s.address||'')}</small></div><button class="secondary small" onclick="providerContactSalon('${s.id}')">WhatsApp</button></div>`).join('')}</div>`}
function providerContactSalon(sid){let p=data.marketSuppliers.find(x=>x.id===session.providerId),s=data.salons.find(x=>x.id===sid),t=`Hola ${s.name}, soy ${p.business}, proveedor de ${p.category} dentro de FiestaControl. Quería acercarte nuestra propuesta y productos.`;window.open(`https://wa.me/${(s.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(t)}`,'_blank')}
window.providerContactSalon=providerContactSalon;
function openProviderProductForm(){showModal(`<h2>Nuevo producto</h2><form id="ppf"><div class="form-grid"><div class="field span2"><label>Producto</label><input name="name" required></div><div class="field"><label>Precio</label><input name="price" type="number" required></div><div class="field span2"><label>Descripción</label><textarea name="description" rows="3"></textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Publicar</button></div></form>`);$('#ppf').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));f.price=Number(f.price||0);let p=data.marketSuppliers.find(x=>x.id===session.providerId);p.products=p.products||[];p.products.push({id:id(),...f});save();closeModal();view='providerProducts';renderProviderShell();toast('Producto publicado')}}
window.openProviderProductForm=openProviderProductForm;
function deleteProviderProduct(prid){let p=data.marketSuppliers.find(x=>x.id===session.providerId);p.products=(p.products||[]).filter(x=>x.id!==prid);save();providerProducts()}window.deleteProviderProduct=deleteProviderProduct;

function renderSuper(){
 view=view==='dashboard'?'platform':view;let pendingSalons=data.salons.filter(s=>s.status==='Pendiente').length,pendingProviders=data.marketSuppliers.filter(p=>p.status==='Pendiente').length;
 let nav=[['platform','✨','Resumen'],['salons','🏪','Salones'],['requests','📝',`Solicitudes${pendingSalons?` (${pendingSalons})`:''}`],['providersAdmin','🚚',`Proveedores${pendingProviders?` (${pendingProviders})`:''}`],['communityAdmin','📣','Comunidad'],['plans','💳','Planes'],['adminAccount','🔐','Mi cuenta']];
 $('#app').innerHTML=`<div class="shell super-shell"><aside class="sidebar super-sidebar"><div class="brand"><div class="mark admin-mark">FC</div><div><b>FiestaControl</b><small>Super Administrador</small></div></div><div class="super-mini"><span>⚡</span><div><small>PLATAFORMA</small><strong>Centro de operaciones</strong></div></div><nav class="nav">${nav.map(([v,i,n])=>`<button data-v="${v}" class="${view===v?'active':''}">${i} ${n}</button>`).join('')}</nav><div class="side-foot"><div class="user-chip"><b>${esc(session.name)}</b><small>Control total</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar admin-topbar"><div><div class="eyebrow">FIESTACONTROL ADMIN</div><h1 id="title">Panel general</h1><p id="subtitle">Salones, comunidad, proveedores y configuración</p></div><div class="top-actions"><button class="ghost" onclick="view='requests';renderSuper()">🔔 Altas ${pendingSalons+pendingProviders}</button><button class="primary" onclick="openCreateSalon()">+ Crear salón</button></div></header><section class="content" id="content"></section></main></div>`;
 $$('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;renderSuper()});renderSuperView();
}
function renderSuperView(){if(view==='salons')return superSalons();if(view==='requests')return superRequests();if(view==='plans')return superPlans();if(view==='communityAdmin')return superCommunity();if(view==='providersAdmin')return superProviders();if(view==='adminAccount')return superAdminAccount();superPlatform()}
function superSalons(){let rows=data.salons.map(s=>`<tr><td><b>${esc(s.name)}</b><br><small class="muted">${esc(s.owner)}</small></td><td>${esc(s.email)}</td><td>${esc(s.plan)}</td><td><span class="pill ${s.status==='Aprobado'?'aprobado':s.status.toLowerCase()}">${s.status}</span></td><td><label class="switch-row"><input type="checkbox" ${s.publicAvailabilityEnabled?'checked':''} onchange="togglePublicAvailability('${s.id}')"><span>${s.publicAvailabilityEnabled?'Visible':'Oculta'}</span></label></td><td class="actions"><button class="secondary small" onclick="impersonate('${s.id}')">Entrar</button><button class="${s.status==='Suspendido'?'ghost':'danger'} small" onclick="toggleSalon('${s.id}')">${s.status==='Suspendido'?'Reactivar':'Suspender'}</button></td></tr>`).join('');$('#content').innerHTML=`<div class="card"><div class="section-title"><div><h3>Salones registrados</h3><small class="muted">La agenda pública se habilita individualmente desde acá.</small></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Salón</th><th>Email</th><th>Plan</th><th>Estado</th><th>Agenda pública</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`}
function togglePublicAvailability(sid){let s=data.salons.find(x=>x.id===sid);s.publicAvailabilityEnabled=!s.publicAvailabilityEnabled;save();toast(s.publicAvailabilityEnabled?'Agenda pública habilitada':'Agenda pública deshabilitada');superSalons()}window.togglePublicAvailability=togglePublicAvailability;
function superProviders(){let ps=data.marketSuppliers;$('#content').innerHTML=`<div class="admin-hero"><div><div class="eyebrow light">MARKETPLACE</div><h2>Proveedores de la comunidad.</h2><p>Aprobá nuevas empresas y controlá quién puede publicar productos para los salones.</p></div><div class="hero-orb"><span>🚚</span><b>${ps.filter(p=>p.status==='Aprobado').length}</b><small>activos</small></div></div><div class="card" style="margin-top:18px">${ps.map(p=>`<div class="admin-community-row"><div class="post-icon">🚚</div><div class="grow"><strong>${esc(p.business)}</strong><small>${esc(p.category)} · ${esc(p.owner)} · ${(p.products||[]).length} producto(s)</small></div><span class="pill ${p.status==='Aprobado'?'aprobado':p.status.toLowerCase()}">${p.status}</span><div class="actions">${p.status==='Pendiente'?`<button class="primary small" onclick="approveProvider('${p.id}')">Aprobar</button>`:''}<button class="${p.status==='Suspendido'?'secondary':'danger'} small" onclick="toggleProvider('${p.id}')">${p.status==='Suspendido'?'Reactivar':'Suspender'}</button></div></div>`).join('')||'<div class="empty">Sin proveedores.</div>'}</div>`}
function approveProvider(pid){let p=data.marketSuppliers.find(x=>x.id===pid);p.status='Aprobado';save();superProviders();toast('Proveedor aprobado')}window.approveProvider=approveProvider;
function toggleProvider(pid){let p=data.marketSuppliers.find(x=>x.id===pid);p.status=p.status==='Suspendido'?'Aprobado':'Suspendido';save();superProviders()}window.toggleProvider=toggleProvider;
function superAdminAccount(){let a=data.admins.find(x=>x.id===session.userId)||data.admins[0];$('#content').innerHTML=`<div class="grid two"><div class="card"><div class="section-title"><div><small class="eyebrow">SEGURIDAD</small><h3>Cambiar contraseña</h3></div></div><form id="admin-pass-form"><div class="field"><label>Contraseña actual</label><input type="password" name="current" required></div><div class="field"><label>Nueva contraseña</label><input type="password" name="next" minlength="6" required></div><div class="field"><label>Repetir nueva contraseña</label><input type="password" name="repeat" minlength="6" required></div><button class="primary">Actualizar contraseña</button></form></div><div class="card"><h3>Cuenta administradora</h3><p><b>${esc(a.name)}</b></p><p class="muted">${esc(a.email)}</p><div class="admin-notice ok"><span>🔐</span><div><b>Acceso principal</b><small>Esta contraseña controla el Super Administrador de FiestaControl.</small></div></div></div></div>`;$('#admin-pass-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));if(f.current!==a.password)return toast('La contraseña actual no coincide');if(f.next!==f.repeat)return toast('Las nuevas contraseñas no coinciden');a.password=f.next;save();e.target.reset();toast('Contraseña actualizada correctamente')}}

render();

/* ===================== V7: gestión total, pagos mensuales y agenda pública ampliada ===================== */
data.settings=data.settings||{};
data.settings.supportWhatsApp=data.settings.supportWhatsApp||'';
data.settings.paymentLink=data.settings.paymentLink||'';
data.servicePayments=data.servicePayments||[];
const planPrice={Inicial:29900,Profesional:49900,Premium:79900};
function monthKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function monthLabel(key){let [y,m]=key.split('-').map(Number);return new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).replace(/^./,c=>c.toUpperCase())}
function ensureSalonPayment(sid,key=monthKey()){let p=data.servicePayments.find(x=>x.salonId===sid&&x.month===key);if(!p){let s=data.salons.find(x=>x.id===sid);p={id:id(),salonId:sid,month:key,amount:planPrice[s?.plan]||29900,status:'Pendiente',paidAt:null,method:null};data.servicePayments.push(p);save()}return p}
data.salons.forEach(s=>ensureSalonPayment(s.id,'2026-09'));
if(!salonNav.some(x=>x[0]==='servicePayments')) salonNav.splice(salonNav.length-1,0,['servicePayments','💳','Pago del servicio']);

renderSalonView=function(){({dashboard:renderDashboard,calendar:renderCalendar,events:renderEvents,cards:renderCards,community:renderCommunity,staff:renderStaff,suppliers:renderSuppliers,finance:renderFinance,servicePayments:renderServicePayments,profile:renderProfile}[view]||renderDashboard)()};

publicAvailabilityHome=function(){
 let salons=data.salons.filter(s=>s.status==='Aprobado');
 return `<div class="public-directory-note"><b>🏪 Salones registrados en FiestaControl</b><small>Podés ver todos los salones activos. Los que tienen agenda pública habilitada permiten consultar sus días libres.</small></div><div class="public-salon-list">${salons.map(s=>`<div class="public-salon-card ${s.publicAvailabilityEnabled?'':'disabled-public'}"><div class="salon-avatar">${s.logo?`<img src="${s.logo}" alt="">`:esc((s.name||'S')[0])}</div><div class="grow"><b>${esc(s.name)}</b><small>${esc(s.address||'')}</small><span class="pill ${s.publicAvailabilityEnabled?'aprobado':'pendiente'}">${s.publicAvailabilityEnabled?'Agenda pública habilitada':'Agenda no publicada'}</span></div>${s.publicAvailabilityEnabled?`<button class="primary small" onclick="openPublicAvailability('${s.id}')">Ver días →</button>`:`<button class="ghost small" disabled>No disponible</button>`}</div>`).join('')||'<div class="empty">Todavía no hay salones activos registrados.</div>'}</div>`;
};

function contactFiestaControl(){let phone=(data.settings.supportWhatsApp||'').replace(/\D/g,'');if(phone){window.open(`https://wa.me/${phone}?text=${encodeURIComponent('Hola FiestaControl, necesito ayuda con el acceso a mi salón.')}`,'_blank')}else{showModal(`<h2>Contactar a FiestaControl</h2><p>Tu cuenta está temporalmente deshabilitada. Ponete en contacto con FiestaControl para revisar el estado del servicio.</p><p class="muted">El administrador todavía no configuró un WhatsApp de soporte.</p><div class="form-actions"><button class="primary" onclick="closeModal()">Entendido</button></div>`)} }
window.contactFiestaControl=contactFiestaControl;

bindAuth=function(mode){
 let form=$('#auth-form');if(!form)return;
 form.onsubmit=async e=>{e.preventDefault();syncFromStore(false);let f=Object.fromEntries(new FormData(e.target));
  if(mode==='login'){
   let a=data.admins.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(a){setSession({role:'superadmin',userId:a.id,name:a.name});view='platform';return render()}
   let s=data.salons.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(!s)return toast('Email o contraseña incorrectos');
   if(s.status==='Pendiente')return showModal(`<h2>Cuenta pendiente</h2><p>Tu salón todavía está pendiente de aprobación por FiestaControl.</p><div class="form-actions"><button class="primary" onclick="closeModal()">Entendido</button></div>`);
   if(s.status==='Suspendido'||s.status==='Deshabilitado')return showModal(`<div class="suspended-box"><div class="big-emoji">🔒</div><h2>Servicio temporalmente deshabilitado</h2><p>El acceso de <b>${esc(s.name)}</b> se encuentra deshabilitado.</p><p class="muted">Para conocer el motivo o solicitar la reactivación, ponete en contacto con FiestaControl.</p><div class="form-actions"><button class="ghost" onclick="closeModal()">Cerrar</button><button class="primary" onclick="contactFiestaControl()">💬 Contactar a FiestaControl</button></div></div>`);
   ensureSalonPayment(s.id);setSession({role:'salon',salonId:s.id,name:s.owner});view='dashboard';return render();
  }
  if(mode==='register'){
   try{
    if(SERVER_MODE){
      let r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'salon',data:f}),cache:'no-store'}),res=await r.json();
      if(!r.ok||!res.ok) return toast(res.error||'No se pudo registrar el salón');
      data=res.state;normalizeLiveData();lastStoreSnapshot=JSON.stringify(data);
      let sal=res.item;
      showModal(`<div class="modal-title"><div><h2>Registro recibido ✅</h2><p>${esc(sal.name)}</p></div></div><p>La cuenta quedó <b>pendiente de aprobación</b>. El registro ya fue guardado en el servidor central y aparecerá automáticamente en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('login')">Volver</button></div>`);return;
    }
    if(data.salons.some(x=>x.email.toLowerCase()===f.email.toLowerCase()))return toast('Ese email ya está registrado');let sal={id:id(),...f,status:'Pendiente',plan:'Inicial',created:new Date().toISOString().slice(0,10),brandColor:'#7257ff',logo:'',publicAvailabilityEnabled:false};data.salons.push(sal);ensureSalonPayment(sal.id);save();showModal(`<div class="modal-title"><div><h2>Registro recibido ✅</h2><p>${esc(sal.name)}</p></div></div><p>La cuenta quedó <b>pendiente de aprobación</b> y ya aparece en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('login')">Volver</button></div>`);return;
   }catch(err){console.error(err);toast('No se pudo conectar con el servidor central');return;}
  }
  if(mode==='provider-login'){
   let p=data.marketSuppliers.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(!p)return toast('Email o contraseña incorrectos');if(p.status==='Pendiente')return toast('Tu proveedor está pendiente de aprobación');if(p.status==='Suspendido')return toast('La cuenta está suspendida');setSession({role:'provider',providerId:p.id,name:p.owner});view='providerHome';return render();
  }
  if(mode==='provider-register'){
   if(data.marketSuppliers.some(x=>x.email.toLowerCase()===f.email.toLowerCase()))return toast('Ese email ya está registrado');data.marketSuppliers.push({id:id(),...f,status:'Pendiente',created:new Date().toISOString().slice(0,10),products:[]});save();showModal(`<h2>Proveedor registrado ✅</h2><p>Tu perfil quedó pendiente de aprobación. Ya aparece en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('provider-login')">Ir al ingreso</button></div>`);return;
  }
 };
};

function renderServicePayments(){
 setTitle('Pago del servicio','Abono mensual de FiestaControl');let s=salon();let now=new Date();let keys=[];for(let i=-2;i<=3;i++){let d=new Date(now.getFullYear(),now.getMonth()+i,1);keys.push(monthKey(d))}keys.forEach(k=>ensureSalonPayment(s.id,k));let ps=data.servicePayments.filter(p=>p.salonId===s.id&&keys.includes(p.month)).sort((a,b)=>b.month.localeCompare(a.month));let pending=ps.filter(p=>p.status!=='Pagado');
 $('#content').innerHTML=`<div class="payment-hero"><div><small class="eyebrow light">ABONO FIESTACONTROL</small><h2>Plan ${esc(s.plan)}</h2><p>Administrá el pago mensual de tu servicio desde este panel.</p></div><div><small>Valor mensual</small><strong>${money(planPrice[s.plan]||29900)}</strong></div></div>${pending.length?`<div class="message-banner"><span>💳</span><div><b>Tenés ${pending.length} período(s) pendiente(s)</b><small>Podés pagarlos desde el botón correspondiente a cada mes.</small></div></div>`:''}<div class="card"><div class="section-title"><div><h3>Mis pagos</h3><small class="muted">Historial mensual del servicio</small></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Período</th><th>Plan</th><th>Importe</th><th>Estado</th><th>Fecha pago</th><th></th></tr></thead><tbody>${ps.map(p=>`<tr><td><b>${monthLabel(p.month)}</b></td><td>${esc(s.plan)}</td><td>${money(p.amount)}</td><td><span class="pill ${p.status==='Pagado'?'aprobado':'pendiente'}">${p.status}</span></td><td>${p.paidAt?new Date(p.paidAt).toLocaleString('es-AR'):'-'}</td><td>${p.status==='Pagado'?'<span>✅ Pagado</span>':`<button class="primary small" onclick="payServiceMonth('${p.id}')">Pagar ahora</button>`}</td></tr>`).join('')}</tbody></table></div></div><div class="card demo-payment-note"><b>🔐 Pago online</b><p class="muted">Esta versión funciona en modo demostración. El flujo ya está preparado para conectar Mercado Pago u otra pasarela en la versión online.</p></div>`;
}
function payServiceMonth(pid){let p=data.servicePayments.find(x=>x.id===pid);if(!p)return;let s=salon();showModal(`<div class="modal-title"><div><h2>Pagar ${monthLabel(p.month)}</h2><p>${esc(s.name)} · Plan ${esc(s.plan)}</p></div></div><div class="checkout-amount"><small>Total</small><strong>${money(p.amount)}</strong></div><div class="field"><label>Medio de pago</label><select id="pay-method"><option>Mercado Pago</option><option>Tarjeta</option><option>Transferencia</option></select></div><div class="admin-notice"><span>ℹ️</span><div><b>Modo demostración</b><small>Al confirmar se registrará el mes como pagado. En producción este paso se valida con la pasarela de pagos.</small></div></div><div class="form-actions"><button class="ghost" onclick="closeModal()">Cancelar</button><button class="primary" onclick="confirmDemoPayment('${p.id}')">Confirmar pago</button></div>`)}
function confirmDemoPayment(pid){let p=data.servicePayments.find(x=>x.id===pid);if(!p)return;p.status='Pagado';p.paidAt=new Date().toISOString();p.method=$('#pay-method')?.value||'Demo';save();closeModal();renderServicePayments();toast('Pago registrado correctamente')}
window.payServiceMonth=payServiceMonth;window.confirmDemoPayment=confirmDemoPayment;

renderSuperView=function(){if(view==='salons')return superSalons();if(view==='requests')return superRequests();if(view==='plans')return superPlans();if(view==='communityAdmin')return superCommunity();if(view==='providersAdmin')return superProviders();if(view==='adminPayments')return superPayments();if(view==='adminAccount')return superAdminAccount();superPlatform()};

renderSuper=function(){
 view=view==='dashboard'?'platform':view;let pendingSalons=data.salons.filter(s=>s.status==='Pendiente').length,pendingProviders=data.marketSuppliers.filter(p=>p.status==='Pendiente').length;
 let nav=[['platform','✨','Resumen'],['salons','🏪','Salones'],['requests','📝',`Solicitudes${pendingSalons?` (${pendingSalons})`:''}`],['providersAdmin','🚚',`Proveedores${pendingProviders?` (${pendingProviders})`:''}`],['communityAdmin','📣','Comunidad'],['adminPayments','💳','Cobros mensuales'],['plans','📦','Planes'],['adminAccount','🔐','Mi cuenta']];
 $('#app').innerHTML=`<div class="shell super-shell"><aside class="sidebar super-sidebar"><div class="brand"><div class="mark admin-mark">FC</div><div><b>FiestaControl</b><small>Super Administrador</small></div></div><div class="super-mini"><span>⚡</span><div><small>PLATAFORMA</small><strong>Centro de operaciones</strong></div></div><nav class="nav">${nav.map(([v,i,n])=>`<button data-v="${v}" class="${view===v?'active':''}">${i} ${n}</button>`).join('')}</nav><div class="side-foot"><div class="user-chip"><b>${esc(session.name)}</b><small>Control total</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar admin-topbar"><div><div class="eyebrow">FIESTACONTROL ADMIN</div><h1 id="title">Panel general</h1><p id="subtitle">Salones, comunidad, proveedores, cobros y configuración</p></div><div class="top-actions"><button class="ghost" onclick="view='requests';renderSuper()">🔔 Altas ${pendingSalons+pendingProviders}</button><button class="primary" onclick="openCreateSalon()">+ Crear salón</button></div></header><section class="content" id="content"></section></main></div>`;
 $$('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;renderSuper()});renderSuperView();
};

superSalons=function(){
 let rows=data.salons.map(s=>`<tr><td><b>${esc(s.name)}</b><br><small class="muted">${esc(s.owner)}</small></td><td>${esc(s.email)}</td><td>${esc(s.plan)}</td><td><span class="pill ${s.status==='Aprobado'?'aprobado':s.status==='Pendiente'?'pendiente':'suspendido'}">${s.status}</span></td><td><label class="switch-row"><input type="checkbox" ${s.publicAvailabilityEnabled?'checked':''} onchange="togglePublicAvailability('${s.id}')"><span>${s.publicAvailabilityEnabled?'Visible':'Oculta'}</span></label></td><td class="actions admin-actions"><button class="secondary small" onclick="impersonate('${s.id}')">Entrar</button><button class="ghost small" onclick="adminChangeSalonPassword('${s.id}')">🔑 Clave</button><button class="${s.status==='Suspendido'?'secondary':'danger'} small" onclick="toggleSalon('${s.id}')">${s.status==='Suspendido'?'Habilitar':'Deshabilitar'}</button><button class="danger small" onclick="deleteSalon('${s.id}')">🗑 Borrar</button></td></tr>`).join('');
 $('#content').innerHTML=`<div class="card"><div class="section-title"><div><h3>Salones registrados</h3><small class="muted">Control total de usuarios, contraseñas, estado y agenda pública.</small></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Salón</th><th>Email</th><th>Plan</th><th>Estado</th><th>Agenda pública</th><th>Administración</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
};
function adminChangeSalonPassword(sid){let s=data.salons.find(x=>x.id===sid);if(!s)return;showModal(`<h2>Cambiar contraseña</h2><p>${esc(s.name)} · ${esc(s.email)}</p><form id="salon-pass-admin"><div class="field"><label>Nueva contraseña</label><input name="password" type="password" minlength="4" required></div><div class="field"><label>Repetir contraseña</label><input name="repeat" type="password" minlength="4" required></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Guardar nueva clave</button></div></form>`);$('#salon-pass-admin').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));if(f.password!==f.repeat)return toast('Las contraseñas no coinciden');s.password=f.password;save();closeModal();toast('Contraseña del salón actualizada')}}
function deleteSalon(sid){let s=data.salons.find(x=>x.id===sid);if(!s)return;if(!confirm(`¿Borrar definitivamente a ${s.name}? También se eliminarán sus fiestas, personal, pedidos y datos relacionados.`))return;data.salons=data.salons.filter(x=>x.id!==sid);data.events=data.events.filter(x=>x.salonId!==sid);data.staff=data.staff.filter(x=>x.salonId!==sid);data.suppliers=data.suppliers.filter(x=>x.salonId!==sid);data.orders=data.orders.filter(x=>x.salonId!==sid);data.servicePayments=data.servicePayments.filter(x=>x.salonId!==sid);save();superSalons();toast('Salón eliminado')}
window.adminChangeSalonPassword=adminChangeSalonPassword;window.deleteSalon=deleteSalon;

toggleSalon=function(sid){let s=data.salons.find(x=>x.id===sid);if(!s)return;s.status=s.status==='Suspendido'?'Aprobado':'Suspendido';save();superSalons();toast(s.status==='Aprobado'?'Salón habilitado':'Salón deshabilitado')};window.toggleSalon=toggleSalon;

function superPayments(){let current='2026-09';data.salons.forEach(s=>ensureSalonPayment(s.id,current));let rows=data.salons.map(s=>{let p=data.servicePayments.find(x=>x.salonId===s.id&&x.month===current);return `<tr><td><b>${esc(s.name)}</b><br><small>${esc(s.plan)}</small></td><td>${monthLabel(current)}</td><td>${money(p.amount)}</td><td><span class="pill ${p.status==='Pagado'?'aprobado':'pendiente'}">${p.status}</span></td><td>${p.paidAt?new Date(p.paidAt).toLocaleDateString('es-AR'):'-'}</td><td>${p.status==='Pagado'?`<button class="ghost small" onclick="adminSetPayment('${p.id}','Pendiente')">Marcar pendiente</button>`:`<button class="primary small" onclick="adminSetPayment('${p.id}','Pagado')">Marcar pagado</button>`}</td></tr>`}).join('');let paid=data.servicePayments.filter(p=>p.month===current&&p.status==='Pagado').reduce((a,p)=>a+p.amount,0),pending=data.servicePayments.filter(p=>p.month===current&&p.status!=='Pagado').reduce((a,p)=>a+p.amount,0);$('#content').innerHTML=`<div class="grid stats"><div class="card stat"><small>Cobrado ${monthLabel(current)}</small><strong>${money(paid)}</strong></div><div class="card stat"><small>Pendiente</small><strong>${money(pending)}</strong></div><div class="card stat"><small>Salones</small><strong>${data.salons.length}</strong></div></div><div class="card" style="margin-top:16px"><div class="section-title"><div><h3>Cobros mensuales</h3><small class="muted">Seguimiento del abono FiestaControl</small></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Salón</th><th>Mes</th><th>Importe</th><th>Estado</th><th>Pago</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`}
function adminSetPayment(pid,status){let p=data.servicePayments.find(x=>x.id===pid);if(!p)return;p.status=status;p.paidAt=status==='Pagado'?new Date().toISOString():null;p.method=status==='Pagado'?'Administración':null;save();superPayments();toast(`Pago marcado como ${status.toLowerCase()}`)}window.adminSetPayment=adminSetPayment;

superAdminAccount=function(){let a=data.admins.find(x=>x.id===session.userId)||data.admins[0];$('#content').innerHTML=`<div class="grid two"><div class="card"><div class="section-title"><div><small class="eyebrow">SEGURIDAD</small><h3>Cambiar contraseña</h3></div></div><form id="admin-pass-form"><div class="field"><label>Contraseña actual</label><input type="password" name="current" required></div><div class="field"><label>Nueva contraseña</label><input type="password" name="next" minlength="6" required></div><div class="field"><label>Repetir nueva contraseña</label><input type="password" name="repeat" minlength="6" required></div><button class="primary">Actualizar contraseña</button></form></div><div class="card"><div class="section-title"><div><small class="eyebrow">SOPORTE</small><h3>Contacto FiestaControl</h3></div></div><form id="support-form"><div class="field"><label>WhatsApp de soporte</label><input name="supportWhatsApp" value="${esc(data.settings.supportWhatsApp)}" placeholder="54911..."></div><p class="muted">Este número aparece cuando un salón deshabilitado intenta ingresar.</p><button class="primary">Guardar contacto</button></form></div></div>`;$('#admin-pass-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));if(f.current!==a.password)return toast('La contraseña actual no coincide');if(f.next!==f.repeat)return toast('Las nuevas contraseñas no coinciden');a.password=f.next;save();e.target.reset();toast('Contraseña actualizada correctamente')};$('#support-form').onsubmit=e=>{e.preventDefault();data.settings.supportWhatsApp=new FormData(e.target).get('supportWhatsApp')||'';save();toast('Contacto de soporte guardado')}};


function normalizeLiveData(){
 data.salons=data.salons||[];data.admins=data.admins||seed.admins;data.events=data.events||[];data.staff=data.staff||[];data.assignments=data.assignments||[];data.suppliers=data.suppliers||[];data.orders=data.orders||[];data.cards=data.cards||[];data.communityPosts=data.communityPosts||[];data.marketSuppliers=data.marketSuppliers||[];data.servicePayments=data.servicePayments||[];data.settings=data.settings||{supportWhatsApp:'',paymentLink:''};
}
function syncFromStore(refreshUI=true){
 const raw=localStorage.getItem(STORE);if(!raw||raw===lastStoreSnapshot)return false;
 try{data=JSON.parse(raw);normalizeLiveData();lastStoreSnapshot=raw;if(refreshUI&&session?.role==='superadmin'){renderSuper();showLivePulse()}else if(refreshUI&&session?.role==='salon'){renderSalonShell()}return true}catch(e){console.error('FiestaControl sync error',e);return false}
}
function showLivePulse(){
 setTimeout(()=>{let host=document.querySelector('.admin-topbar .top-actions');if(!host||host.querySelector('.live-sync-pill'))return;let b=document.createElement('span');b.className='live-sync-pill';b.textContent='● Actualizado en vivo';host.prepend(b);setTimeout(()=>b.remove(),2200)},0)
}
window.addEventListener('storage',e=>{if(e.key===STORE)syncFromStore(true)});
if(liveChannel)liveChannel.onmessage=()=>syncFromStore(true);
window.addEventListener('focus',()=>syncFromStore(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncFromStore(true)});
setInterval(()=>{if(session?.role==='superadmin'||session?.role==='salon')syncFromStore(true)},1000);


/* ===================== V10: base limpia, gestión completa de proveedores e invitación interactiva ===================== */
function providerById(pid){return data.marketSuppliers.find(x=>x.id===pid)}

superProviders=function(){
 let ps=data.marketSuppliers||[];
 $('#content').innerHTML=`<div class="admin-hero"><div><div class="eyebrow light">MARKETPLACE</div><h2>Proveedores de la comunidad.</h2><p>Administrá cuentas, datos, accesos y publicaciones de cada proveedor.</p></div><div class="hero-orb"><span>🚚</span><b>${ps.filter(p=>p.status==='Aprobado').length}</b><small>activos</small></div></div>
 <div class="card" style="margin-top:18px"><div class="section-title"><div><h3>Proveedores registrados</h3><small class="muted">Mismo control administrativo que los salones.</small></div></div>
 <div class="table-wrap"><table class="table"><thead><tr><th>Proveedor</th><th>Email</th><th>Rubro</th><th>Estado</th><th>Productos</th><th>Administración</th></tr></thead><tbody>${ps.map(p=>`<tr><td><b>${esc(p.business)}</b><br><small class="muted">${esc(p.owner)}</small></td><td>${esc(p.email)}</td><td>${esc(p.category||'-')}</td><td><span class="pill ${p.status==='Aprobado'?'aprobado':p.status==='Pendiente'?'pendiente':'suspendido'}">${esc(p.status)}</span></td><td>${(p.products||[]).length}</td><td class="actions admin-actions"><button class="secondary small" onclick="adminEnterProvider('${p.id}')">Entrar</button><button class="ghost small" onclick="adminEditProvider('${p.id}')">✏️ Editar</button><button class="ghost small" onclick="adminChangeProviderPassword('${p.id}')">🔑 Clave</button><button class="${p.status==='Suspendido'?'secondary':'danger'} small" onclick="toggleProvider('${p.id}')">${p.status==='Suspendido'?'Habilitar':'Suspender'}</button><button class="danger small" onclick="adminDeleteProvider('${p.id}')">🗑 Borrar</button></td></tr>`).join('')}</tbody></table></div>${ps.length?'':'<div class="empty">Todavía no hay proveedores registrados.</div>'}</div>`;
};

function adminEditProvider(pid){
 let p=providerById(pid);if(!p)return;
 showModal(`<div class="modal-title"><div><h2>Editar proveedor</h2><p>${esc(p.business)}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="provider-admin-edit"><div class="form-grid"><div class="field span2"><label>Empresa / marca</label><input name="business" required value="${esc(p.business)}"></div><div class="field"><label>Responsable</label><input name="owner" required value="${esc(p.owner)}"></div><div class="field"><label>Rubro</label><input name="category" required value="${esc(p.category||'')}"></div><div class="field"><label>WhatsApp</label><input name="phone" value="${esc(p.phone||'')}"></div><div class="field"><label>Email</label><input name="email" type="email" required value="${esc(p.email)}"></div><div class="field span2"><label>Descripción</label><textarea name="description" rows="3">${esc(p.description||'')}</textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Guardar cambios</button></div></form>`);
 $('#provider-admin-edit').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));let other=data.marketSuppliers.find(x=>x.id!==pid&&x.email.toLowerCase()===f.email.toLowerCase());if(other)return toast('Ese email ya pertenece a otro proveedor');Object.assign(p,f);save();closeModal();superProviders();toast('Proveedor actualizado')};
}
function adminChangeProviderPassword(pid){
 let p=providerById(pid);if(!p)return;
 showModal(`<h2>Cambiar contraseña</h2><p>${esc(p.business)} · ${esc(p.email)}</p><form id="provider-pass-admin"><div class="field"><label>Nueva contraseña</label><input name="password" type="password" minlength="4" required></div><div class="field"><label>Repetir contraseña</label><input name="repeat" type="password" minlength="4" required></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Guardar nueva clave</button></div></form>`);
 $('#provider-pass-admin').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));if(f.password!==f.repeat)return toast('Las contraseñas no coinciden');p.password=f.password;save();closeModal();toast('Contraseña del proveedor actualizada')};
}
function adminDeleteProvider(pid){let p=providerById(pid);if(!p)return;if(!confirm(`¿Borrar definitivamente a ${p.business}? También se eliminarán sus productos publicados.`))return;data.marketSuppliers=data.marketSuppliers.filter(x=>x.id!==pid);save();superProviders();toast('Proveedor eliminado')}
function adminEnterProvider(pid){let p=providerById(pid);if(!p)return;setSession({role:'provider',providerId:p.id,name:p.owner,impersonatedByAdmin:true});view='providerHome';render()}
function returnToSuperAdmin(){let a=data.admins[0];setSession({role:'superadmin',userId:a.id,name:a.name});view='providersAdmin';render()}
window.adminEditProvider=adminEditProvider;window.adminChangeProviderPassword=adminChangeProviderPassword;window.adminDeleteProvider=adminDeleteProvider;window.adminEnterProvider=adminEnterProvider;window.returnToSuperAdmin=returnToSuperAdmin;

toggleProvider=function(pid){let p=providerById(pid);if(!p)return;p.status=p.status==='Suspendido'?'Aprobado':'Suspendido';save();superProviders();toast(p.status==='Aprobado'?'Proveedor habilitado':'Proveedor suspendido')};window.toggleProvider=toggleProvider;

renderProviderShell=function(){
 let p=providerById(session.providerId);if(!p){logout();return}
 $('#app').innerHTML=`<div class="shell super-shell"><aside class="sidebar super-sidebar"><div class="brand"><div class="mark">FC</div><div><b>FiestaControl</b><small>Portal proveedor</small></div></div><div class="tenant"><div><small>PROVEEDOR</small><strong>${esc(p.business)}</strong></div></div><nav class="nav"><button data-pv="providerHome" class="${view==='providerHome'?'active':''}">🏠 Inicio</button><button data-pv="providerProducts" class="${view==='providerProducts'?'active':''}">📦 Mis productos</button><button data-pv="providerSalons" class="${view==='providerSalons'?'active':''}">🏪 Salones</button></nav><div class="side-foot"><div class="user-chip"><b>${esc(p.owner)}</b><small>${esc(p.email)}</small></div>${session.impersonatedByAdmin?'<button class="primary w100" style="margin-top:9px" onclick="returnToSuperAdmin()">← Volver al Admin</button>':'<button class="logout" onclick="logout()">Cerrar sesión</button>'}</div></aside><main class="main"><header class="topbar"><div><h1>${view==='providerProducts'?'Mis productos':view==='providerSalons'?'Salones de la red':'Panel del proveedor'}</h1><p>Ofrecé productos y conectate por WhatsApp.</p></div><button class="primary" onclick="openProviderProductForm()">+ Producto</button></header><section class="content" id="content"></section></main></div>`;
 $$('[data-pv]').forEach(b=>b.onclick=()=>{view=b.dataset.pv;renderProviderShell()});if(view==='providerProducts')providerProducts();else if(view==='providerSalons')providerSalons();else providerHome();
};

function contactFiestaControlProvider(){let phone=(data.settings.supportWhatsApp||'').replace(/\D/g,'');if(phone){window.open(`https://wa.me/${phone}?text=${encodeURIComponent('Hola FiestaControl, necesito ayuda con el acceso de mi cuenta de proveedor.')}`,'_blank')}else{showModal(`<h2>Contactar a FiestaControl</h2><p>La cuenta del proveedor está temporalmente deshabilitada. Ponete en contacto con FiestaControl para solicitar la reactivación.</p><div class="form-actions"><button class="primary" onclick="closeModal()">Entendido</button></div>`)}}
window.contactFiestaControlProvider=contactFiestaControlProvider;

// Reemplazo final del login para contemplar suspensión de proveedores con contacto de soporte.
bindAuth=function(mode){
 let form=$('#auth-form');if(!form)return;
 form.onsubmit=async e=>{e.preventDefault();syncFromStore(false);let f=Object.fromEntries(new FormData(e.target));
  if(mode==='login'){
   let a=data.admins.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(a){setSession({role:'superadmin',userId:a.id,name:a.name});view='platform';return render()}
   let s=data.salons.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(!s)return toast('Email o contraseña incorrectos');
   if(s.status==='Pendiente')return showModal(`<h2>Cuenta pendiente</h2><p>Tu salón todavía está pendiente de aprobación por FiestaControl.</p><div class="form-actions"><button class="primary" onclick="closeModal()">Entendido</button></div>`);
   if(s.status==='Suspendido')return showModal(`<div class="suspended-box"><div class="big-emoji">🔒</div><h2>Servicio temporalmente deshabilitado</h2><p>Para conocer el motivo o solicitar la reactivación, ponete en contacto con FiestaControl.</p><div class="form-actions" style="justify-content:center"><button class="primary" onclick="contactFiestaControl()">Contactar a FiestaControl</button><button class="ghost" onclick="closeModal()">Cerrar</button></div></div>`);
   setSession({role:'salon',salonId:s.id,name:s.owner});view='dashboard';return render();
  }
  if(mode==='register'){
   if(data.salons.some(x=>x.email.toLowerCase()===f.email.toLowerCase()))return toast('Ese email ya está registrado');let s={id:id(),...f,status:'Pendiente',plan:'Inicial',created:new Date().toISOString().slice(0,10),brandColor:'#7257ff',logo:'',publicAvailabilityEnabled:false};data.salons.push(s);ensureSalonPayment(s.id);save();showModal(`<div class="modal-title"><div><h2>Registro recibido ✅</h2><p>${esc(s.name)}</p></div></div><p>La cuenta quedó <b>pendiente de aprobación</b> y ya aparece en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('login')">Volver</button></div>`);return;
  }
  if(mode==='provider-login'){
   let p=data.marketSuppliers.find(x=>x.email.toLowerCase()===f.email.toLowerCase()&&x.password===f.password);if(!p)return toast('Email o contraseña incorrectos');if(p.status==='Pendiente')return showModal(`<h2>Cuenta pendiente</h2><p>Tu proveedor todavía está pendiente de aprobación por FiestaControl.</p><div class="form-actions"><button class="primary" onclick="closeModal()">Entendido</button></div>`);if(p.status==='Suspendido')return showModal(`<div class="suspended-box"><div class="big-emoji">🔒</div><h2>Cuenta temporalmente deshabilitada</h2><p>Para solicitar la reactivación, ponete en contacto con FiestaControl.</p><div class="form-actions" style="justify-content:center"><button class="primary" onclick="contactFiestaControlProvider()">Contactar a FiestaControl</button><button class="ghost" onclick="closeModal()">Cerrar</button></div></div>`);setSession({role:'provider',providerId:p.id,name:p.owner});view='providerHome';return render();
  }
  if(mode==='provider-register'){
   if(data.marketSuppliers.some(x=>x.email.toLowerCase()===f.email.toLowerCase()))return toast('Ese email ya está registrado');data.marketSuppliers.push({id:id(),...f,status:'Pendiente',created:new Date().toISOString().slice(0,10),products:[]});save();showModal(`<h2>Proveedor registrado ✅</h2><p>Tu perfil quedó pendiente de aprobación. Ya aparece en Super Admin → Solicitudes.</p><div class="form-actions"><button class="primary" onclick="closeModal();renderAuth('provider-login')">Ir al ingreso</button></div>`);return;
  }
 };
};

function salonForEvent(e){return data.salons.find(s=>s.id===e.salonId)}
function mapsLink(address){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address||'')}`}
function publicInvitationLink(eid){let base=PUBLIC_BASE_URL||location.origin;let u=new URL(base+'/');u.searchParams.set('invitacion',eid);return u.toString()}
function openPublicInvitationTab(eid){window.open(publicInvitationLink(eid),'_blank')}
window.openPublicInvitationTab=openPublicInvitationTab;
function invitationPublicHTML(e,c,s){let t=cardThemes[c?.theme||'superheroes']||cardThemes.superheroes,title=c?.title||`¡${e.child} cumple ${e.age}!`,msg=c?.message||'Te esperamos para compartir una tarde llena de diversión.',extra=c?.extra||'¡No faltes!',img=c?.customImage||t.image;return `<div class="invite-public-wrap"><div class="invite-public-card" style="--invite-bg:${t.bg}"><div class="invite-art"><img src="${img}" alt="${esc(t.name)}"><div class="invite-art-shade"></div><div class="invite-art-content">${s.logo?`<img class="invite-public-logo" src="${s.logo}" alt="${esc(s.name)}">`:''}<span class="invite-emoji">${esc(c?.emoji||t.icon)}</span><small>ESTÁS INVITADO/A</small><h1>${esc(title)}</h1><p>${esc(msg)}</p></div></div><div class="invite-details"><div class="invite-place"><b>📍 ${esc(s.name)}</b><span>${esc(s.address||'Dirección no cargada')}</span></div><div class="invite-detail-grid"><div><small>FECHA</small><b>${fmtDate(e.date)}</b></div><div><small>HORARIO</small><b>${esc(e.start)} a ${esc(e.end)}</b></div></div><p class="invite-extra">${esc(extra)}</p><div class="invite-rsvp-actions"><button class="rsvp-yes" onclick="openPublicRSVP('${e.id}')">✅ Confirmar asistencia</button></div><button class="maps-btn" onclick="window.open('${mapsLink(s.address)}','_blank')">📍 Cómo llegar · Google Maps</button><small class="invite-powered">Invitación creada con FiestaControl</small></div></div></div>`}

openInvitation=function(eid){let e=data.events.find(x=>x.id===eid),c=cardFor(eid),s=salonForEvent(e);showModal(`${invitationPublicHTML(e,c,s)}<div class="invite-link-helper"><b>Invitación lista para los invitados</b><small>No hace falta copiar ninguna dirección. Abrila con el botón o enviala por WhatsApp.</small></div><div class="form-actions invite-admin-share"><button class="secondary" onclick="openPublicInvitationTab('${eid}')">🎟️ Abrir invitación / Confirmar asistencia</button><button class="ghost" onclick="downloadCard('${eid}')">⬇ Descargar imagen</button><button class="primary" onclick="shareCardWhatsApp('${eid}')">📲 Enviar invitación</button></div>`)};window.openInvitation=openInvitation;

function openPublicRSVP(eid){let e=data.events.find(x=>x.id===eid);if(!e)return;showModal(`<div class="rsvp-public"><div class="big-emoji">🎟️</div><h2>Confirmación de asistencia</h2><p>Cumple de <b>${esc(e.child)}</b></p><form id="public-rsvp-choice"><div class="field"><label>Nombre del invitado/a</label><input name="name" required autofocus></div><div class="field"><label>¿Vas a asistir?</label><select name="status" required><option value="Sí">✅ Sí, asistiré</option><option value="No">❌ No podré asistir</option></select></div><div class="field"><label>Observación (opcional)</label><input name="note" placeholder="Alergias, alimentación, comentario..."></div><div class="form-actions"><button type="button" class="ghost" onclick="showPublicInvitation('${eid}')">Volver</button><button class="primary">Enviar confirmación</button></div></form></div>`);$('#public-rsvp-choice').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));e.rsvps=e.rsvps||[];let existing=e.rsvps.find(r=>String(r.name||'').trim().toLowerCase()===String(f.name||'').trim().toLowerCase());let payload={...f,at:new Date().toISOString()};if(existing)Object.assign(existing,payload);else e.rsvps.push(payload);save();showModal(`<div class="rsvp-public success"><div class="big-emoji">${f.status==='Sí'?'✅':'💌'}</div><h2>${f.status==='Sí'?'Asistencia confirmada':'Respuesta registrada'}</h2><p>Gracias, <b>${esc(f.name)}</b>. El salón ya recibió tu respuesta.</p><button class="primary" onclick="closeModal()">Cerrar</button></div>`)}}
function quickRSVP(eid,status){let e=data.events.find(x=>x.id===eid);if(!e)return;showModal(`<div class="rsvp-public"><div class="big-emoji">${status==='Sí'?'🎉':'💌'}</div><h2>${status==='Sí'?'¡Genial! Confirmá tu asistencia':'Avisanos quién no podrá asistir'}</h2><p>Cumple de <b>${esc(e.child)}</b></p><form id="quick-rsvp"><div class="field"><label>Nombre del invitado/a</label><input name="name" required autofocus></div><div class="field"><label>Observación (opcional)</label><input name="note" placeholder="Alergias, alimentación, comentario..."></div><div class="form-actions"><button type="button" class="ghost" onclick="showPublicInvitation('${eid}')">Volver</button><button class="primary">Confirmar</button></div></form></div>`);$('#quick-rsvp').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));e.rsvps=e.rsvps||[];e.rsvps.push({...f,status,at:new Date().toISOString()});save();showModal(`<div class="rsvp-public success"><div class="big-emoji">${status==='Sí'?'✅':'💌'}</div><h2>${status==='Sí'?'Asistencia confirmada':'Respuesta registrada'}</h2><p>Gracias, <b>${esc(f.name)}</b>. El salón ya tiene tu respuesta.</p><button class="primary" onclick="closeModal()">Cerrar</button></div>`)}}
function showPublicInvitation(eid){let e=data.events.find(x=>x.id===eid);if(!e)return;let c=data.cards.find(x=>x.eventId===eid),s=salonForEvent(e);showModal(invitationPublicHTML(e,c,s))}
window.openPublicRSVP=openPublicRSVP;window.quickRSVP=quickRSVP;window.showPublicInvitation=showPublicInvitation;

shareCardWhatsApp=function(eid){let e=data.events.find(x=>x.id===eid),c=cardFor(eid),s=salonForEvent(e),title=c?.title||`¡${e.child} cumple ${e.age}!`,link=publicInvitationLink(eid),map=mapsLink(s.address);let t=`💌 ${title}\n\n${c?.message||'Te esperamos para compartir una tarde llena de diversión.'}\n\n📅 ${fmtDate(e.date)}\n🕒 ${e.start} a ${e.end}\n📍 ${s.name}\n${s.address}\n\n🎟️ ABRIR INVITACIÓN Y CONFIRMAR ASISTENCIA\n${link}\n\n📍 Cómo llegar:\n${map}`;window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,'_blank')};window.shareCardWhatsApp=shareCardWhatsApp;

function renderPublicInvitationPage(eid){let e=data.events.find(x=>x.id===eid);if(!e){$('#app').innerHTML='<div class="public-invite-page"><div class="card empty">La invitación no está disponible.</div></div>';return}let c=data.cards.find(x=>x.eventId===eid),s=salonForEvent(e);session=null;sessionStorage.removeItem(SESSION);$('#app').innerHTML=`<main class="public-invite-page">${invitationPublicHTML(e,c,s)}</main><dialog id="modal"><div id="modal-body"></div></dialog><div id="toast" class="toast"></div>`}
// Ruta pública útil para probar un alta en otra pestaña sin cerrar el Admin.
const qs=new URLSearchParams(location.search);const publicMode=qs.get('registro'), publicInvite=qs.get('invitacion');
if(publicInvite){syncFromStore(false);renderPublicInvitationPage(publicInvite)}
else if(publicMode==='salon'){session=null;sessionStorage.removeItem(SESSION);renderAuth('register')}
else if(publicMode==='proveedor'){session=null;sessionStorage.removeItem(SESSION);renderAuth('provider-register')}
else{save();render()}


/* V11: base limpia, confirmación pública única y conteo de confirmados por fiesta */

/* ===================== V12: pedidos sin fiesta + pedidos marketplace en la misma pantalla ===================== */
function openOrderForm(){
  let ev=se(),ps=sp();
  if(!ps.length)return toast('Primero cargá un proveedor propio');
  showModal(`<div class="modal-title"><div><h2>Nuevo pedido</h2><p>Podés hacerlo aunque todavía no tengas fiestas creadas.</p></div></div><form id="of"><div class="form-grid"><div class="field"><label>Fiesta (opcional)</label><select name="eventId"><option value="">Pedido general / sin fiesta</option>${ev.map(e=>`<option value="${e.id}">${fmtDate(e.date)} · ${esc(e.child)}</option>`).join('')}</select></div><div class="field"><label>Proveedor</label><select name="supplierId">${ps.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field span2"><label>Detalle del pedido</label><textarea name="detail" required placeholder="Ej.: 10 gaseosas cola, 5 aguas, 3 bolsas de hielo..."></textarea></div><div class="field"><label>Importe estimado</label><input name="amount" type="number"></div><div class="field"><label>Estado</label><select name="status"><option>Pendiente</option><option>Pedido</option><option>Recibido</option><option>Pagado</option></select></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar pedido</button></div></form>`);
  $('#of').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));f.amount=Number(f.amount||0);data.orders.push({id:id(),salonId:session.salonId,source:'own',...f});save();closeModal();renderSalonShell();toast('Pedido guardado')};
}
window.openOrderForm=openOrderForm;

function openOrderFormForSupplier(pid){
  let ev=se(),p=data.suppliers.find(x=>x.id===pid);if(!p)return;
  showModal(`<div class="modal-title"><div><h2>Pedido a ${esc(p.name)}</h2><p>No necesitás tener una fiesta creada.</p></div></div><form id="ofs"><div class="form-grid"><div class="field span2"><label>Fiesta (opcional)</label><select name="eventId"><option value="">Pedido general / sin fiesta</option>${ev.map(e=>`<option value="${e.id}">${fmtDate(e.date)} · ${esc(e.child)}</option>`).join('')}</select></div><div class="field span2"><label>Detalle</label><textarea name="detail" required placeholder="Escribí el pedido completo..."></textarea></div><div class="field"><label>Importe estimado</label><input name="amount" type="number"></div><div class="field"><label>Estado</label><select name="status"><option>Pendiente</option><option>Pedido</option><option>Recibido</option><option>Pagado</option></select></div></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Guardar pedido</button></div></form>`);
  $('#ofs').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));f.amount=Number(f.amount||0);data.orders.push({id:id(),salonId:session.salonId,source:'own',supplierId:pid,...f});save();closeModal();renderSuppliers();toast('Pedido guardado')};
}
window.openOrderFormForSupplier=openOrderFormForSupplier;

function openMarketOrderForm(pid,prid){
  let p=(data.marketSuppliers||[]).find(x=>x.id===pid),pr=(p?.products||[]).find(x=>x.id===prid),ev=se();if(!p||!pr)return;
  showModal(`<div class="modal-title"><div><h2>Hacer pedido</h2><p>${esc(p.business)} · ${esc(pr.name)}</p></div></div><form id="mof"><div class="form-grid"><div class="field span2"><label>Fiesta (opcional)</label><select name="eventId"><option value="">Pedido general / sin fiesta</option>${ev.map(e=>`<option value="${e.id}">${fmtDate(e.date)} · ${esc(e.child)}</option>`).join('')}</select></div><div class="field"><label>Cantidad</label><input name="qty" type="number" min="1" value="1" required></div><div class="field"><label>Precio unitario</label><input value="${pr.price}" disabled></div><div class="field span2"><label>Observaciones</label><textarea name="notes" rows="3" placeholder="Ej.: entrega por la mañana, sabor, presentación, etc."></textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Guardar pedido</button><button type="button" class="secondary" id="save-send-market">Guardar y WhatsApp</button></div></form>`);
  let saveMarket=(send=false)=>{let form=$('#mof'),f=Object.fromEntries(new FormData(form));let qty=Math.max(1,Number(f.qty||1)),amount=qty*Number(pr.price||0),detail=`${qty} x ${pr.name}${f.notes?` — ${f.notes}`:''}`;let o={id:id(),salonId:session.salonId,source:'market',marketSupplierId:pid,productId:prid,eventId:f.eventId||'',detail,amount,status:'Pendiente'};data.orders.push(o);save();closeModal();renderSuppliers();toast('Pedido guardado');if(send)setTimeout(()=>sendOrderWhatsApp(o.id),120)};
  $('#mof').onsubmit=e=>{e.preventDefault();saveMarket(false)};
  $('#save-send-market').onclick=()=>saveMarket(true);
}
window.openMarketOrderForm=openMarketOrderForm;

function sendOrderWhatsApp(oid){
  let o=data.orders.find(x=>x.id===oid);if(!o)return;
  let e=o.eventId?data.events.find(x=>x.id===o.eventId):null,p,phone,name;
  if(o.source==='market'){p=(data.marketSuppliers||[]).find(x=>x.id===o.marketSupplierId);phone=p?.phone||'';name=p?.business||'Proveedor'}
  else{p=data.suppliers.find(x=>x.id===o.supplierId);phone=p?.phone||'';name=p?.name||'Proveedor'}
  let context=e?` para la fiesta de ${e.child} del ${fmtDate(e.date)}`:' como pedido general';
  let t=`Hola ${name}, te paso un pedido${context}:\n\n${o.detail}${o.amount?`\n\nImporte estimado: ${money(o.amount)}`:''}\n\nGracias.`;
  window.open(`https://wa.me/${(phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(t)}`,'_blank');
}
window.sendOrderWhatsApp=sendOrderWhatsApp;

function renderSuppliers(){
 setTitle('Proveedores','Tus proveedores, pedidos generales y marketplace de la comunidad');let ps=sp(),market=(data.marketSuppliers||[]).filter(p=>p.status==='Aprobado');
 $('#content').innerHTML=`<div class="toolbar"><button class="primary" onclick="openSupplierForm()">+ Proveedor propio</button><button class="secondary" onclick="openOrderForm()">+ Pedido a proveedor propio</button></div><div class="card marketplace-hero"><div><small class="eyebrow">MARKETPLACE FIESTACONTROL</small><h2>Comprá directo a proveedores de la comunidad</h2><p>Armá el pedido desde esta misma pantalla. La fiesta es opcional.</p></div><span>🛍️</span></div><div class="market-grid">${market.flatMap(p=>(p.products||[]).map(pr=>`<article class="card product-card"><div class="product-icon">📦</div><span class="post-type">${esc(p.category)}</span><h3>${esc(pr.name)}</h3><p>${esc(pr.description||'')}</p><div class="product-provider"><b>${esc(p.business)}</b><small>${esc(p.description||'')}</small></div><div class="product-bottom"><strong>${money(pr.price)}</strong><button class="primary small" onclick="openMarketOrderForm('${p.id}','${pr.id}')">🛒 Hacer pedido</button></div></article>`)).join('')||'<div class="card empty">Todavía no hay productos publicados.</div>'}</div><div class="grid two" style="margin-top:18px"><div class="card"><div class="section-title"><h3>Mis proveedores habituales</h3></div>${ps.map(p=>`<div class="list-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div><div class="actions"><b>${money(p.balance)}</b><button class="secondary small" onclick="openOrderFormForSupplier('${p.id}')">Hacer pedido</button></div></div>`).join('')||'<div class="empty">Sin proveedores propios.</div>'}</div><div class="card"><div class="section-title"><h3>Mis pedidos</h3></div>${so().map(o=>{let own=data.suppliers.find(x=>x.id===o.supplierId),mp=(data.marketSuppliers||[]).find(x=>x.id===o.marketSupplierId),e=o.eventId?data.events.find(x=>x.id===o.eventId):null,name=o.source==='market'?(mp?.business||'Proveedor comunidad'):(own?.name||'Proveedor');return `<div class="list-item"><div><strong>${esc(name)}</strong><small>${e?`${esc(e.child)} · `:'Pedido general · '}${esc(o.status)}${o.detail?` · ${esc(o.detail.slice(0,55))}${o.detail.length>55?'…':''}`:''}</small></div><button class="secondary small" onclick="sendOrderWhatsApp('${o.id}')">WhatsApp</button></div>`}).join('')||'<div class="empty">Sin pedidos.</div>'}</div></div>`;
}
window.renderSuppliers=renderSuppliers;
function orderMarketWhatsApp(pid,prid){openMarketOrderForm(pid,prid)}
window.orderMarketWhatsApp=orderMarketWhatsApp;

/* ===================== V13: pedidos bidireccionales salón <-> proveedor ===================== */
function normalizeOrderConversation(o){
  o.messages=o.messages||[];
  if(typeof o.providerUnread==='undefined')o.providerUnread=!!o.marketSupplierId;
  if(typeof o.salonUnread==='undefined')o.salonUnread=false;
  o.createdAt=o.createdAt||new Date().toISOString();
  o.deliveryDate=o.deliveryDate||'';
  return o;
}
data.orders.forEach(normalizeOrderConversation);
save();

function orderProvider(o){
  return o?.source==='market'?(data.marketSuppliers||[]).find(x=>x.id===o.marketSupplierId):data.suppliers.find(x=>x.id===o.supplierId);
}
function orderProviderName(o){let p=orderProvider(o);return o?.source==='market'?(p?.business||'Proveedor comunidad'):(p?.name||'Proveedor')}
function orderSalon(o){return data.salons.find(x=>x.id===o.salonId)}
function orderEventLabel(o){let e=o?.eventId?data.events.find(x=>x.id===o.eventId):null;return e?`${e.child} · ${fmtDate(e.date)}`:'Pedido general / sin fiesta'}
function orderStatusClass(status){return ['Aceptado','Entregado','Listo para entregar'].includes(status)?'aprobado':['Rechazado','Cancelado'].includes(status)?'suspendido':['En preparación','Requiere cambio'].includes(status)?'pendiente':'pendiente'}
function msgDate(v){try{return new Date(v).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
function messageTimeline(o){
  let msgs=(o.messages||[]);
  if(!msgs.length)return '<div class="empty">Todavía no hay mensajes en este pedido.</div>';
  return `<div class="order-thread">${msgs.map(m=>`<div class="thread-msg ${m.by==='provider'?'from-provider':'from-salon'}"><div class="thread-head"><b>${m.by==='provider'?'🚚 Proveedor':'🏪 Salón'}</b><small>${msgDate(m.at)}</small></div><p>${esc(m.text)}</p></div>`).join('')}</div>`;
}

// Al crear pedidos de comunidad, inicializar seguimiento y aviso al proveedor.
openMarketOrderForm=function(pid,prid){
  let p=(data.marketSuppliers||[]).find(x=>x.id===pid),pr=(p?.products||[]).find(x=>x.id===prid),ev=se();if(!p||!pr)return;
  showModal(`<div class="modal-title"><div><h2>Hacer pedido</h2><p>${esc(p.business)} · ${esc(pr.name)}</p></div></div><form id="mof"><div class="form-grid"><div class="field span2"><label>Fiesta (opcional)</label><select name="eventId"><option value="">Pedido general / sin fiesta</option>${ev.map(e=>`<option value="${e.id}">${fmtDate(e.date)} · ${esc(e.child)}</option>`).join('')}</select></div><div class="field"><label>Cantidad</label><input name="qty" type="number" min="1" value="1" required></div><div class="field"><label>Precio unitario</label><input value="${pr.price}" disabled></div><div class="field span2"><label>Observaciones</label><textarea name="notes" rows="3" placeholder="Ej.: entrega por la mañana, sabor, presentación, etc."></textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Enviar pedido por FiestaControl</button><button type="button" class="secondary" id="save-send-market">Enviar + WhatsApp</button></div></form>`);
  let saveMarket=(send=false)=>{let form=$('#mof'),f=Object.fromEntries(new FormData(form));let qty=Math.max(1,Number(f.qty||1)),amount=qty*Number(pr.price||0),detail=`${qty} x ${pr.name}${f.notes?` — ${f.notes}`:''}`;let now=new Date().toISOString();let o=normalizeOrderConversation({id:id(),salonId:session.salonId,source:'market',marketSupplierId:pid,productId:prid,eventId:f.eventId||'',detail,amount,status:'Pendiente',createdAt:now,providerUnread:true,salonUnread:false,messages:[{id:id(),by:'salon',text:`Nuevo pedido: ${detail}`,at:now}]});data.orders.push(o);save();closeModal();renderSuppliers();toast('Pedido enviado al proveedor');if(send)setTimeout(()=>sendOrderWhatsApp(o.id),120)};
  $('#mof').onsubmit=e=>{e.preventDefault();saveMarket(false)};
  $('#save-send-market').onclick=()=>saveMarket(true);
};
window.openMarketOrderForm=openMarketOrderForm;

function openSalonOrderThread(oid){
  let o=data.orders.find(x=>x.id===oid);if(!o)return;normalizeOrderConversation(o);o.salonUnread=false;save();
  let p=orderProvider(o),isMarket=o.source==='market';
  showModal(`<div class="modal-title"><div><h2>Seguimiento del pedido</h2><p>${esc(orderProviderName(o))} · ${esc(orderEventLabel(o))}</p></div><span class="pill ${orderStatusClass(o.status)}">${esc(o.status)}</span></div>
  <div class="order-summary"><div><small>Pedido</small><b>${esc(o.detail)}</b></div><div><small>Importe</small><b>${money(o.amount)}</b></div><div><small>Entrega prevista</small><b>${o.deliveryDate?fmtDate(o.deliveryDate):'A confirmar'}</b></div></div>
  ${isMarket?messageTimeline(o):'<div class="notice-box">Este proveedor fue cargado por el salón y no posee portal propio. El seguimiento con él se realiza por WhatsApp.</div>'}
  ${isMarket?`<form id="salon-thread-form"><div class="field"><label>Mensaje al proveedor / cambio o problema</label><textarea name="message" required rows="3" placeholder="Ej.: Necesito cambiar 10 unidades por 15 / ¿Podemos cambiar la fecha de entrega?"></textarea></div><div class="form-actions"><button class="primary">Enviar mensaje</button><button type="button" class="secondary" onclick="sendOrderWhatsApp('${o.id}')">WhatsApp</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`:`<div class="form-actions"><button class="secondary" onclick="sendOrderWhatsApp('${o.id}')">Continuar por WhatsApp</button><button class="ghost" onclick="closeModal()">Cerrar</button></div>`}`);
  if(isMarket)$('#salon-thread-form').onsubmit=e=>{e.preventDefault();let text=new FormData(e.target).get('message').trim();if(!text)return;o.messages.push({id:id(),by:'salon',text,at:new Date().toISOString()});o.providerUnread=true;o.salonUnread=false;save();closeModal();renderSuppliers();toast('Mensaje enviado al proveedor')};
}
window.openSalonOrderThread=openSalonOrderThread;

function salonCancelOrder(oid){
  let o=data.orders.find(x=>x.id===oid);if(!o)return;if(!confirm('¿Solicitar la cancelación de este pedido?'))return;normalizeOrderConversation(o);o.status='Cancelación solicitada';o.messages.push({id:id(),by:'salon',text:'Solicito cancelar este pedido.',at:new Date().toISOString()});o.providerUnread=true;save();renderSuppliers();toast('Cancelación enviada al proveedor');
}
window.salonCancelOrder=salonCancelOrder;

renderSuppliers=function(){
 setTitle('Proveedores','Pedidos, seguimiento y marketplace de la comunidad');let ps=sp(),market=(data.marketSuppliers||[]).filter(p=>p.status==='Aprobado'),orders=so().map(normalizeOrderConversation);let unread=orders.filter(o=>o.salonUnread).length;
 $('#content').innerHTML=`${unread?`<div class="community-alert" onclick="document.querySelector('#mis-pedidos')?.scrollIntoView({behavior:'smooth'})"><span>🔔</span><div><b>Tenés ${unread} novedad${unread===1?'':'es'} en tus pedidos</b><small>Un proveedor respondió o modificó el estado de un pedido.</small></div></div>`:''}<div class="toolbar"><button class="primary" onclick="openSupplierForm()">+ Proveedor propio</button><button class="secondary" onclick="openOrderForm()">+ Pedido a proveedor propio</button></div><div class="card marketplace-hero"><div><small class="eyebrow">MARKETPLACE FIESTACONTROL</small><h2>Comprá directo a proveedores de la comunidad</h2><p>El pedido queda dentro de FiestaControl y podés seguirlo hasta la entrega.</p></div><span>🛍️</span></div><div class="market-grid">${market.flatMap(p=>(p.products||[]).map(pr=>`<article class="card product-card"><div class="product-icon">📦</div><span class="post-type">${esc(p.category)}</span><h3>${esc(pr.name)}</h3><p>${esc(pr.description||'')}</p><div class="product-provider"><b>${esc(p.business)}</b><small>${esc(p.description||'')}</small></div><div class="product-bottom"><strong>${money(pr.price)}</strong><button class="primary small" onclick="openMarketOrderForm('${p.id}','${pr.id}')">🛒 Hacer pedido</button></div></article>`)).join('')||'<div class="card empty">Todavía no hay productos publicados.</div>'}</div><div class="grid two" style="margin-top:18px"><div class="card"><div class="section-title"><h3>Mis proveedores habituales</h3></div>${ps.map(p=>`<div class="list-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div><div class="actions"><b>${money(p.balance)}</b><button class="secondary small" onclick="openOrderFormForSupplier('${p.id}')">Hacer pedido</button></div></div>`).join('')||'<div class="empty">Sin proveedores propios.</div>'}</div><div class="card" id="mis-pedidos"><div class="section-title"><div><h3>Mis pedidos</h3><small class="muted">Seguimiento con el proveedor</small></div>${unread?`<span class="pill pendiente">${unread} nuevo${unread===1?'':'s'}</span>`:''}</div>${orders.slice().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map(o=>{let e=o.eventId?data.events.find(x=>x.id===o.eventId):null;return `<div class="order-row ${o.salonUnread?'order-unread':''}"><div class="order-main"><div class="order-title"><strong>${esc(orderProviderName(o))}</strong>${o.salonUnread?'<span class="new-dot">NUEVO</span>':''}</div><small>${e?`${esc(e.child)} · ${fmtDate(e.date)}`:'Pedido general'} · ${esc(o.detail)}</small><div class="order-meta"><span class="pill ${orderStatusClass(o.status)}">${esc(o.status)}</span>${o.deliveryDate?`<span>📅 Entrega ${fmtDate(o.deliveryDate)}</span>`:''}<span>${money(o.amount)}</span></div></div><div class="actions"><button class="primary small" onclick="openSalonOrderThread('${o.id}')">💬 Seguimiento</button><button class="secondary small" onclick="sendOrderWhatsApp('${o.id}')">WhatsApp</button>${o.source==='market'&&!['Entregado','Cancelado','Rechazado'].includes(o.status)?`<button class="ghost small" onclick="salonCancelOrder('${o.id}')">Cancelar</button>`:''}</div></div>`}).join('')||'<div class="empty">Sin pedidos.</div>'}</div></div>`;
};
window.renderSuppliers=renderSuppliers;

function providerOrders(){
 let p=data.marketSuppliers.find(x=>x.id===session.providerId);let orders=(data.orders||[]).filter(o=>o.source==='market'&&o.marketSupplierId===p.id).map(normalizeOrderConversation).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
 $('#content').innerHTML=`<div class="grid stats"><div class="card stat"><small>Pedidos recibidos</small><strong>${orders.length}</strong></div><div class="card stat"><small>Nuevos</small><strong>${orders.filter(o=>o.providerUnread).length}</strong></div><div class="card stat"><small>En preparación</small><strong>${orders.filter(o=>o.status==='En preparación').length}</strong></div><div class="card stat"><small>Para entregar</small><strong>${orders.filter(o=>o.status==='Listo para entregar').length}</strong></div></div><div class="card" style="margin-top:18px"><div class="section-title"><div><h3>Pedidos de salones</h3><small class="muted">Aceptá, coordiná la entrega y respondé cambios.</small></div></div>${orders.map(o=>{let s=orderSalon(o);return `<div class="order-row ${o.providerUnread?'order-unread':''}"><div class="order-main"><div class="order-title"><strong>${esc(s?.name||'Salón')}</strong>${o.providerUnread?'<span class="new-dot">NUEVO</span>':''}</div><small>${esc(orderEventLabel(o))} · ${esc(o.detail)}</small><div class="order-meta"><span class="pill ${orderStatusClass(o.status)}">${esc(o.status)}</span>${o.deliveryDate?`<span>📅 ${fmtDate(o.deliveryDate)}</span>`:''}<span>${money(o.amount)}</span></div></div><button class="primary small" onclick="openProviderOrder('${o.id}')">Abrir pedido</button></div>`}).join('')||'<div class="empty">Todavía no recibiste pedidos desde la comunidad.</div>'}</div>`;
}
window.providerOrders=providerOrders;

function openProviderOrder(oid){
 let o=data.orders.find(x=>x.id===oid);if(!o||o.marketSupplierId!==session.providerId)return;normalizeOrderConversation(o);o.providerUnread=false;save();let s=orderSalon(o);
 showModal(`<div class="modal-title"><div><h2>Pedido de ${esc(s?.name||'Salón')}</h2><p>${esc(orderEventLabel(o))}</p></div><span class="pill ${orderStatusClass(o.status)}">${esc(o.status)}</span></div><div class="order-summary"><div><small>Detalle</small><b>${esc(o.detail)}</b></div><div><small>Importe</small><b>${money(o.amount)}</b></div><div><small>Entrega</small><b>${o.deliveryDate?fmtDate(o.deliveryDate):'A confirmar'}</b></div></div>${messageTimeline(o)}<form id="provider-order-form"><div class="form-grid"><div class="field"><label>Estado del pedido</label><select name="status"><option ${o.status==='Pendiente'?'selected':''}>Pendiente</option><option ${o.status==='Aceptado'?'selected':''}>Aceptado</option><option ${o.status==='En preparación'?'selected':''}>En preparación</option><option ${o.status==='Listo para entregar'?'selected':''}>Listo para entregar</option><option ${o.status==='Entregado'?'selected':''}>Entregado</option><option ${o.status==='Requiere cambio'?'selected':''}>Requiere cambio</option><option ${o.status==='Rechazado'?'selected':''}>Rechazado</option><option ${o.status==='Cancelado'?'selected':''}>Cancelado</option></select></div><div class="field"><label>Fecha estimada de entrega</label><input name="deliveryDate" type="date" value="${esc(o.deliveryDate||'')}"></div><div class="field span2"><label>Respuesta al salón</label><textarea name="message" rows="3" placeholder="Ej.: Pedido aceptado. Se entrega el viernes por la mañana."></textarea></div></div><div class="form-actions"><button class="primary">Guardar y responder</button><button type="button" class="secondary" onclick="providerOrderWhatsApp('${o.id}')">WhatsApp al salón</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`);
 $('#provider-order-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target)),old=o.status;o.status=f.status;o.deliveryDate=f.deliveryDate||'';let msg=(f.message||'').trim();if(!msg&&(old!==o.status||o.deliveryDate))msg=`Estado actualizado a “${o.status}”${o.deliveryDate?`. Entrega estimada: ${fmtDate(o.deliveryDate)}`:''}.`;if(msg)o.messages.push({id:id(),by:'provider',text:msg,at:new Date().toISOString()});o.salonUnread=true;o.providerUnread=false;save();closeModal();providerOrders();toast('Respuesta enviada al salón')};
}
window.openProviderOrder=openProviderOrder;

function providerOrderWhatsApp(oid){let o=data.orders.find(x=>x.id===oid),s=orderSalon(o),p=data.marketSuppliers.find(x=>x.id===session.providerId);if(!o||!s)return;let t=`Hola ${s.name}, soy ${p?.business||'el proveedor'}. Te escribo por el pedido: ${o.detail}. Estado actual: ${o.status}${o.deliveryDate?`. Entrega estimada: ${fmtDate(o.deliveryDate)}`:''}.`;window.open(`https://wa.me/${(s.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(t)}`,'_blank')}
window.providerOrderWhatsApp=providerOrderWhatsApp;

renderProviderShell=function(){
 let p=data.marketSuppliers.find(x=>x.id===session.providerId);if(!p){logout();return}let received=(data.orders||[]).filter(o=>o.source==='market'&&o.marketSupplierId===p.id).map(normalizeOrderConversation),newCount=received.filter(o=>o.providerUnread).length;
 $('#app').innerHTML=`<div class="shell super-shell"><aside class="sidebar super-sidebar"><div class="brand"><div class="mark">FC</div><div><b>FiestaControl</b><small>Portal proveedor</small></div></div><div class="tenant"><div><small>PROVEEDOR</small><strong>${esc(p.business)}</strong></div></div><nav class="nav"><button data-pv="providerHome" class="${view==='providerHome'?'active':''}">🏠 Inicio</button><button data-pv="providerOrders" class="${view==='providerOrders'?'active':''}">🧾 Pedidos recibidos ${newCount?`<span class="nav-badge">${newCount}</span>`:''}</button><button data-pv="providerProducts" class="${view==='providerProducts'?'active':''}">📦 Mis productos</button><button data-pv="providerSalons" class="${view==='providerSalons'?'active':''}">🏪 Salones</button></nav><div class="side-foot"><div class="user-chip"><b>${esc(p.owner)}</b><small>${esc(p.email)}</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div><h1>${view==='providerOrders'?'Pedidos recibidos':view==='providerProducts'?'Mis productos':view==='providerSalons'?'Salones de la red':'Panel del proveedor'}</h1><p>${view==='providerOrders'?'Respondé pedidos y coordiná cada entrega.':'Ofrecé productos y conectate con salones.'}</p></div><button class="primary" onclick="openProviderProductForm()">+ Producto</button></header><section class="content" id="content"></section></main></div><div id="toast" class="toast"></div>`;
 $$('[data-pv]').forEach(b=>b.onclick=()=>{view=b.dataset.pv;renderProviderShell()});if(view==='providerOrders')providerOrders();else if(view==='providerProducts')providerProducts();else if(view==='providerSalons')providerSalons();else providerHome();
};
window.renderProviderShell=renderProviderShell;

providerHome=function(){let p=data.marketSuppliers.find(x=>x.id===session.providerId);let orders=(data.orders||[]).filter(o=>o.source==='market'&&o.marketSupplierId===p.id).map(normalizeOrderConversation),newCount=orders.filter(o=>o.providerUnread).length;$('#content').innerHTML=`${newCount?`<div class="community-alert" onclick="view='providerOrders';renderProviderShell()"><span>🧾</span><div><b>Tenés ${newCount} pedido${newCount===1?'':'s'} nuevo${newCount===1?'':'s'}</b><small>Entrá para aceptar y coordinar la entrega.</small></div></div>`:''}<div class="admin-hero"><div><div class="eyebrow light">MARKETPLACE</div><h2>${esc(p.business)}</h2><p>${esc(p.description||'Administrá tu presencia dentro de FiestaControl.')}</p></div><div class="hero-orb"><span>🧾</span><b>${orders.length}</b><small>pedidos</small></div></div><div class="grid three" style="margin-top:18px"><div class="card stat"><small>Nuevos</small><strong>${newCount}</strong></div><div class="card stat"><small>En preparación</small><strong>${orders.filter(o=>o.status==='En preparación').length}</strong></div><div class="card stat"><small>Entregados</small><strong>${orders.filter(o=>o.status==='Entregado').length}</strong></div></div><div class="card" style="margin-top:18px"><div class="section-title"><h3>Últimos pedidos</h3><button class="secondary small" onclick="view='providerOrders';renderProviderShell()">Ver todos</button></div>${orders.slice().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,4).map(o=>`<div class="list-item"><div><strong>${esc(orderSalon(o)?.name||'Salón')}</strong><small>${esc(o.detail)} · ${esc(o.status)}</small></div><button class="primary small" onclick="openProviderOrder('${o.id}')">Abrir</button></div>`).join('')||'<div class="empty">Todavía no recibiste pedidos.</div>'}</div>`};
window.providerHome=providerHome;

// Sincronización en vivo también para el portal del proveedor.
syncFromStore=function(refreshUI=true){
 const raw=localStorage.getItem(STORE);if(!raw||raw===lastStoreSnapshot)return false;
 try{data=JSON.parse(raw);normalizeLiveData();data.orders.forEach(normalizeOrderConversation);lastStoreSnapshot=raw;if(refreshUI&&session?.role==='superadmin'){renderSuper();showLivePulse()}else if(refreshUI&&session?.role==='salon'){renderSalonShell()}else if(refreshUI&&session?.role==='provider'){renderProviderShell()}return true}catch(e){console.error('FiestaControl sync error',e);return false}
};

/* ===================== V14: avisos de mensajes nuevos salón <-> proveedor ===================== */
function salonProviderUnreadCount(){
  if(!session || session.role!=='salon') return 0;
  return (data.orders||[]).filter(o=>o.salonId===session.salonId && o.source==='market' && normalizeOrderConversation(o).salonUnread).length;
}
function providerConversationUnreadCount(){
  if(!session || session.role!=='provider') return 0;
  return (data.orders||[]).filter(o=>o.source==='market' && o.marketSupplierId===session.providerId && normalizeOrderConversation(o).providerUnread).length;
}
window.salonProviderUnreadCount=salonProviderUnreadCount;
window.providerConversationUnreadCount=providerConversationUnreadCount;

// El panel del salón muestra el aviso sin necesidad de entrar a Proveedores.
renderSalonShell=function(){
 let s=salon(),communityUnread=unreadCommunityCount(s),providerUnread=salonProviderUnreadCount(),allUnread=communityUnread+providerUnread;
 $('#app').innerHTML=`<div class="shell salon-shell" style="--tenant-accent:${esc(s.brandColor||'#7257ff')}"><aside class="sidebar"><div class="brand"><div class="mark">FC</div><div><b>FiestaControl</b><small>Panel del salón</small></div></div><div class="tenant tenant-brand">${s.logo?`<img src="${s.logo}" alt="Logo" class="tenant-logo">`:`<div class="tenant-logo placeholder">${esc((s.name||'S').slice(0,1))}</div>`}<div><small>Salón activo</small><strong>${esc(s.name)}</strong></div></div><nav class="nav">${salonNav.map(([v,i,n])=>{let badge=v==='community'?communityUnread:v==='suppliers'?providerUnread:0;return `<button data-v="${v}" class="${view===v?'active':''}">${i} ${n}${badge?`<span class="nav-badge">${badge}</span>`:''}</button>`}).join('')}</nav><div class="side-foot"><div class="user-chip"><b>${esc(s.owner)}</b><small>${esc(s.email)}</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div><h1 id="title"></h1><p id="subtitle"></p></div><div class="top-actions">${providerUnread?`<button class="notice-btn" onclick="view='suppliers';renderSalonShell()">💬 ${providerUnread} mensaje${providerUnread===1?'':'s'} nuevo${providerUnread===1?'':'s'}</button>`:''}${communityUnread?`<button class="notice-btn" onclick="view='community';renderSalonShell()">🔔 ${communityUnread} comunidad</button>`:''}<button class="ghost" onclick="openPublicPreview()">👁 Vista cliente</button><button class="primary" onclick="openEventForm()">+ Nueva fiesta</button></div></header><section class="content" id="content"></section></main></div><div id="toast" class="toast"></div>`;
 $$('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;renderSalonShell()});renderSalonView();
};
window.renderSalonShell=renderSalonShell;

// Aviso destacado también en el inicio del salón.
const _v14RenderDashboard=renderDashboard;
renderDashboard=function(){
  _v14RenderDashboard();
  let c=salonProviderUnreadCount();
  if(c){
    let target=$('#content');
    target.insertAdjacentHTML('afterbegin',`<div class="message-banner" onclick="view='suppliers';renderSalonShell()"><span>💬</span><div><b>Tenés ${c} mensaje${c===1?'':'s'} nuevo${c===1?'':'s'} de proveedor${c===1?'':'es'}</b><small>Hay respuestas o cambios en tus pedidos. Tocá para verlos.</small></div><strong>Ver mensajes →</strong></div>`);
  }
};
window.renderDashboard=renderDashboard;

// Mejorar el texto visual de los avisos en cada pedido del salón.
const _v14RenderSuppliers=renderSuppliers;
renderSuppliers=function(){
  _v14RenderSuppliers();
  $$('.order-row.order-unread .new-dot').forEach(x=>x.textContent='MENSAJE NUEVO');
};
window.renderSuppliers=renderSuppliers;

// El proveedor también ve claramente que tiene mensajes/pedidos nuevos desde cualquier pantalla.
renderProviderShell=function(){
 let p=data.marketSuppliers.find(x=>x.id===session.providerId);if(!p){logout();return}
 let received=(data.orders||[]).filter(o=>o.source==='market'&&o.marketSupplierId===p.id).map(normalizeOrderConversation),newCount=providerConversationUnreadCount();
 $('#app').innerHTML=`<div class="shell super-shell"><aside class="sidebar super-sidebar"><div class="brand"><div class="mark">FC</div><div><b>FiestaControl</b><small>Portal proveedor</small></div></div><div class="tenant"><div><small>PROVEEDOR</small><strong>${esc(p.business)}</strong></div></div><nav class="nav"><button data-pv="providerHome" class="${view==='providerHome'?'active':''}">🏠 Inicio</button><button data-pv="providerOrders" class="${view==='providerOrders'?'active':''}">🧾 Pedidos y mensajes ${newCount?`<span class="nav-badge">${newCount}</span>`:''}</button><button data-pv="providerProducts" class="${view==='providerProducts'?'active':''}">📦 Mis productos</button><button data-pv="providerSalons" class="${view==='providerSalons'?'active':''}">🏪 Salones</button></nav><div class="side-foot"><div class="user-chip"><b>${esc(p.owner)}</b><small>${esc(p.email)}</small></div><button class="logout" onclick="logout()">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div><h1>${view==='providerOrders'?'Pedidos y mensajes':view==='providerProducts'?'Mis productos':view==='providerSalons'?'Salones de la red':'Panel del proveedor'}</h1><p>${view==='providerOrders'?'Respondé mensajes, cambios y coordiná cada entrega.':'Ofrecé productos y conectate con salones.'}</p></div><div class="top-actions">${newCount?`<button class="notice-btn" onclick="view='providerOrders';renderProviderShell()">💬 ${newCount} nuevo${newCount===1?'':'s'}</button>`:''}<button class="primary" onclick="openProviderProductForm()">+ Producto</button></div></header><section class="content" id="content"></section></main></div><div id="toast" class="toast"></div>`;
 $$('[data-pv]').forEach(b=>b.onclick=()=>{view=b.dataset.pv;renderProviderShell()});if(view==='providerOrders')providerOrders();else if(view==='providerProducts')providerProducts();else if(view==='providerSalons')providerSalons();else providerHome();
};
window.renderProviderShell=renderProviderShell;

const _v14ProviderOrders=providerOrders;
providerOrders=function(){
  _v14ProviderOrders();
  $$('.order-row.order-unread .new-dot').forEach(x=>x.textContent='MENSAJE NUEVO');
};
window.providerOrders=providerOrders;

providerHome=function(){
 let p=data.marketSuppliers.find(x=>x.id===session.providerId);let orders=(data.orders||[]).filter(o=>o.source==='market'&&o.marketSupplierId===p.id).map(normalizeOrderConversation),newCount=providerConversationUnreadCount();
 $('#content').innerHTML=`${newCount?`<div class="community-alert" onclick="view='providerOrders';renderProviderShell()"><span>💬</span><div><b>Tenés ${newCount} conversación${newCount===1?'':'es'} con novedades</b><small>Puede ser un pedido nuevo, un cambio o un mensaje de un salón.</small></div></div>`:''}<div class="admin-hero"><div><div class="eyebrow light">MARKETPLACE</div><h2>${esc(p.business)}</h2><p>${esc(p.description||'Administrá tu presencia dentro de FiestaControl.')}</p></div><div class="hero-orb"><span>🧾</span><b>${orders.length}</b><small>pedidos</small></div></div><div class="grid three" style="margin-top:18px"><div class="card stat"><small>Con novedades</small><strong>${newCount}</strong></div><div class="card stat"><small>En preparación</small><strong>${orders.filter(o=>o.status==='En preparación').length}</strong></div><div class="card stat"><small>Entregados</small><strong>${orders.filter(o=>o.status==='Entregado').length}</strong></div></div><div class="card" style="margin-top:18px"><div class="section-title"><h3>Últimos pedidos</h3><button class="secondary small" onclick="view='providerOrders';renderProviderShell()">Ver todos</button></div>${orders.slice().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,4).map(o=>`<div class="list-item ${o.providerUnread?'order-unread':''}"><div><strong>${esc(orderSalon(o)?.name||'Salón')} ${o.providerUnread?'<span class="new-dot">MENSAJE NUEVO</span>':''}</strong><small>${esc(o.detail)} · ${esc(o.status)}</small></div><button class="primary small" onclick="openProviderOrder('${o.id}')">Abrir</button></div>`).join('')||'<div class="empty">Todavía no recibiste pedidos.</div>'}</div>`;
};
window.providerHome=providerHome;


/* ===================== V16: servidor central para uso multi-PC ===================== */
let fcServerSyncInFlight=false;
async function syncFromServer(refreshUI=true){
  if(!SERVER_MODE || fcServerSyncInFlight || fcSavePending>0) return false;
  fcServerSyncInFlight=true;
  try{
    const r=await fetch('/api/data?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const incoming=await r.json();
    const raw=JSON.stringify(incoming);
    if(raw===lastStoreSnapshot) return false;
    data=incoming; normalizeLiveData(); (data.orders||[]).forEach(normalizeOrderConversation); lastStoreSnapshot=JSON.stringify(data);
    if(refreshUI&&session?.role==='superadmin'){renderSuper();showLivePulse()}
    else if(refreshUI&&session?.role==='salon'){renderSalonShell()}
    else if(refreshUI&&session?.role==='provider'){renderProviderShell()}
    else if(refreshUI&&!session){renderAuth()}
    return true;
  }catch(e){console.error('FiestaControl servidor no disponible',e);return false}
  finally{fcServerSyncInFlight=false}
}
if(SERVER_MODE){
  syncFromStore=function(refreshUI=true){syncFromServer(refreshUI);return false};
  setInterval(()=>syncFromServer(true),1000);
}


/* ===================== V20: observaciones RSVP visibles para el salón ===================== */
function rsvpObservationCount(e){
  return (e?.rsvps||[]).filter(r=>String(r.note||'').trim()).length;
}
function rsvpRowsHTML(e){
  const rows=(e?.rsvps||[]);
  if(!rows.length) return '<div class="empty">Todavía no hay respuestas de invitados.</div>';
  return rows.map(r=>{
    const note=String(r.note||'').trim();
    return `<div class="list-item rsvp-admin-row ${note?'rsvp-has-note':''}">
      <div>
        <strong>${esc(r.name||'Invitado/a')} <span class="pill ${r.status==='Sí'?'confirmada':'pendiente'}">${esc(r.status||'')}</span></strong>
        ${note?`<div class="rsvp-note-alert"><b>⚠️ OBSERVACIÓN DEL INVITADO</b><span>${esc(note)}</span></div>`:'<small>Sin observaciones informadas.</small>'}
      </div>
    </div>`;
  }).join('');
}
openEvent=function(eid){
  let e=data.events.find(x=>x.id===eid); if(!e)return;
  let r=e.rsvps||[], notes=rsvpObservationCount(e), yes=r.filter(x=>x.status==='Sí').length, no=r.filter(x=>x.status==='No').length;
  showModal(`<div class="modal-title"><div><h2>${esc(e.child)} · ${fmtDate(e.date)}</h2><p>${esc(e.client)} · ${e.start} a ${e.end}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
  ${notes?`<div class="rsvp-warning-banner"><div class="rsvp-warning-icon">⚠️</div><div><b>${notes} ${notes===1?'invitado tiene':'invitados tienen'} observaciones</b><span>Revisalas antes del evento. Pueden incluir alimentación, alergias u otra información importante.</span></div></div>`:''}
  <div class="grid stats" style="grid-template-columns:repeat(4,1fr)">
    <div class="card"><small class="muted">Total</small><strong>${money(e.total)}</strong></div>
    <div class="card"><small class="muted">Saldo</small><strong class="${e.total-e.paid?'bad':'good'}">${money(e.total-e.paid)}</strong></div>
    <div class="card"><small class="muted">Confirmados</small><strong>${yes}</strong></div>
    <div class="card"><small class="muted">No asisten</small><strong>${no}</strong></div>
  </div>
  <div class="toolbar" style="margin-top:16px"><button class="primary small" onclick="openPayment('${eid}')">Registrar pago</button><button class="secondary small" onclick="openInvitation('${eid}')">Invitación</button><button class="ghost small" onclick="copyInvitation('${eid}')">WhatsApp</button><button class="ghost small" onclick="openEventForm('${eid}')">Editar</button></div>
  <div class="list"><div class="list-item"><div><strong>Paquete ${esc(e.package)}</strong><small>${e.guests} invitados estimados</small></div><span class="pill ${e.status.toLowerCase()}">${e.status}</span></div><div class="list-item"><div><strong>Observaciones internas de la fiesta</strong><small>${esc(e.notes||'Sin observaciones')}</small></div></div></div>
  <div class="section-title rsvp-section-title"><div><h3>Confirmaciones de invitados</h3><p>${r.length} respuestas · ${notes} con observaciones</p></div></div>
  <div class="list">${rsvpRowsHTML(e)}</div>`);
};
window.openEvent=openEvent;

// Campo público más explícito para que el invitado sepa qué informar.
const _v20OpenPublicRSVP=openPublicRSVP;
openPublicRSVP=function(eid){
  let e=data.events.find(x=>x.id===eid);if(!e)return;
  showModal(`<div class="rsvp-public"><div class="big-emoji">🎟️</div><h2>Confirmación de asistencia</h2><p>Cumple de <b>${esc(e.child)}</b></p>
  <form id="public-rsvp-choice"><div class="field"><label>Nombre del invitado/a</label><input name="name" required autofocus></div>
  <div class="field"><label>¿Vas a asistir?</label><select name="status" required><option value="Sí">✅ Sí, asistiré</option><option value="No">❌ No podré asistir</option></select></div>
  <div class="field"><label>🍽️ Observaciones / restricciones alimentarias</label><textarea name="note" rows="3" placeholder="Ej.: no come harina, sin gluten, vegetariano, alergia a frutos secos..."></textarea><small>Esta información será visible para el salón.</small></div>
  <div class="form-actions"><button type="button" class="ghost" onclick="showPublicInvitation('${eid}')">Volver</button><button class="primary">Enviar confirmación</button></div></form></div>`);
  $('#public-rsvp-choice').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));e.rsvps=e.rsvps||[];let existing=e.rsvps.find(r=>String(r.name||'').trim().toLowerCase()===String(f.name||'').trim().toLowerCase());let payload={...f,at:new Date().toISOString()};if(existing)Object.assign(existing,payload);else e.rsvps.push(payload);save();showModal(`<div class="rsvp-public success"><div class="big-emoji">${f.status==='Sí'?'✅':'💌'}</div><h2>${f.status==='Sí'?'Asistencia confirmada':'Respuesta registrada'}</h2><p>Gracias, <b>${esc(f.name)}</b>. El salón ya recibió tu respuesta${String(f.note||'').trim()?' y tu observación':''}.</p><button class="primary" onclick="closeModal()">Cerrar</button></div>`)};
};
window.openPublicRSVP=openPublicRSVP;


/* ===================== V21: Marketplace global + chat interactivo salón/proveedor ===================== */
async function marketApi(action,payload){
  if(!SERVER_MODE) return null;
  const r=await fetch('/api/marketplace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data:payload}),cache:'no-store'});
  const res=await r.json(); if(!r.ok||!res.ok) throw new Error(res.error||'Error de servidor');
  data=res.state; normalizeLiveData(); (data.orders||[]).forEach(normalizeOrderConversation); lastStoreSnapshot=JSON.stringify(data); return res;
}
function paymentLabel(o){return o.paymentStatus||'Pendiente'}
function orderExtraHTML(o){return `<div class="order-coordination"><div><small>📅 Entrega</small><b>${o.deliveryDate?fmtDate(o.deliveryDate):'A coordinar'}</b></div><div><small>💳 Condición de pago</small><b>${esc(o.paymentTerms||'A coordinar')}</b></div><div><small>💰 Estado de pago</small><b>${esc(paymentLabel(o))}</b></div></div>`}

openMarketOrderForm= function(pid,prid){
  let p=(data.marketSuppliers||[]).find(x=>x.id===pid),pr=(p?.products||[]).find(x=>x.id===prid),ev=se();if(!p||!pr)return;
  showModal(`<div class="modal-title"><div><h2>Comprar a ${esc(p.business)}</h2><p>${esc(pr.name)}</p></div></div>
  <form id="mof"><div class="form-grid">
  <div class="field span2"><label>Fiesta (opcional)</label><select name="eventId"><option value="">Pedido general / sin fiesta</option>${ev.map(e=>`<option value="${e.id}">${fmtDate(e.date)} · ${esc(e.child)}</option>`).join('')}</select></div>
  <div class="field"><label>Cantidad</label><input name="qty" type="number" min="1" value="1" required></div>
  <div class="field"><label>Precio unitario</label><input value="${money(pr.price)}" disabled></div>
  <div class="field span2"><label>Mensaje inicial al proveedor</label><textarea name="notes" rows="4" placeholder="Ej.: necesito entrega el viernes por la mañana. ¿Aceptan transferencia?"></textarea></div>
  </div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">🛒 Enviar pedido</button></div></form>`);
  $('#mof').onsubmit=async e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));let qty=Math.max(1,Number(f.qty||1)),amount=qty*Number(pr.price||0),detail=`${qty} x ${pr.name}`;let now=new Date().toISOString();
    try{
      if(SERVER_MODE){await marketApi('create_order',{id:id(),salonId:session.salonId,marketSupplierId:pid,productId:prid,eventId:f.eventId||'',detail,amount,createdAt:now,message:`Nuevo pedido: ${detail}${f.notes?`. ${f.notes}`:''}`})}
      else{let o=normalizeOrderConversation({id:id(),salonId:session.salonId,source:'market',marketSupplierId:pid,productId:prid,eventId:f.eventId||'',detail,amount,status:'Pendiente',createdAt:now,deliveryDate:'',paymentTerms:'A coordinar',paymentStatus:'Pendiente',providerUnread:true,salonUnread:false,messages:[{id:id(),by:'salon',text:`Nuevo pedido: ${detail}${f.notes?`. ${f.notes}`:''}`,at:now}]});data.orders.push(o);save()}
      closeModal();renderSuppliers();toast('Pedido enviado. Ya podés chatear con el proveedor');
    }catch(err){console.error(err);toast('No se pudo enviar el pedido')}
  };
}; window.openMarketOrderForm=openMarketOrderForm;

openSalonOrderThread=async function(oid){
  let o=data.orders.find(x=>x.id===oid);if(!o)return;normalizeOrderConversation(o);
  if(SERVER_MODE){try{await marketApi('mark_read',{orderId:oid,side:'salon'});o=data.orders.find(x=>x.id===oid)}catch(e){}}
  else{o.salonUnread=false;save()}
  showModal(`<div class="modal-title"><div><h2>Chat con ${esc(orderProviderName(o))}</h2><p>${esc(orderEventLabel(o))}</p></div><span class="pill ${orderStatusClass(o.status)}">${esc(o.status)}</span></div>
  <div class="order-summary"><div><small>Pedido</small><b>${esc(o.detail)}</b></div><div><small>Importe</small><b>${money(o.amount)}</b></div></div>${orderExtraHTML(o)}
  <div class="chat-help">Usá este chat para acordar fecha de entrega, forma de pago, horarios, cambios o cualquier detalle del pedido.</div>
  ${messageTimeline(o)}
  <form id="salon-thread-form"><div class="field"><label>Escribir al proveedor</label><textarea name="message" required rows="3" placeholder="Ej.: ¿Podés entregar el sábado a las 10? / Te pago por transferencia."></textarea></div><div class="form-actions"><button class="primary">💬 Enviar mensaje</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`);
  $('#salon-thread-form').onsubmit=async e=>{e.preventDefault();let text=new FormData(e.target).get('message').trim();if(!text)return;try{
    if(SERVER_MODE)await marketApi('send_message',{orderId:oid,by:'salon',text});
    else{o.messages.push({id:id(),by:'salon',text,at:new Date().toISOString()});o.providerUnread=true;o.salonUnread=false;save()}
    closeModal();renderSuppliers();toast('Mensaje enviado al proveedor');
  }catch(err){toast('No se pudo enviar el mensaje')}};
};window.openSalonOrderThread=openSalonOrderThread;

openProviderOrder=async function(oid){
 let o=data.orders.find(x=>x.id===oid);if(!o||o.marketSupplierId!==session.providerId)return;normalizeOrderConversation(o);
 if(SERVER_MODE){try{await marketApi('mark_read',{orderId:oid,side:'provider'});o=data.orders.find(x=>x.id===oid)}catch(e){}}
 else{o.providerUnread=false;save()}
 let s=orderSalon(o);
 showModal(`<div class="modal-title"><div><h2>Pedido de ${esc(s?.name||'Salón')}</h2><p>${esc(orderEventLabel(o))}</p></div><span class="pill ${orderStatusClass(o.status)}">${esc(o.status)}</span></div>
 <div class="order-summary"><div><small>Detalle</small><b>${esc(o.detail)}</b></div><div><small>Importe</small><b>${money(o.amount)}</b></div></div>${orderExtraHTML(o)}
 <div class="chat-help">Coordiná directamente con el salón la entrega y el pago. Todo queda registrado en este pedido.</div>${messageTimeline(o)}
 <form id="provider-order-form"><div class="form-grid">
 <div class="field"><label>Estado del pedido</label><select name="status">${['Pendiente','Aceptado','En preparación','Listo para entregar','Entregado','Requiere cambio','Rechazado','Cancelado'].map(v=>`<option ${o.status===v?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="field"><label>Fecha estimada de entrega</label><input name="deliveryDate" type="date" value="${esc(o.deliveryDate||'')}"></div>
 <div class="field"><label>Condición de pago</label><input name="paymentTerms" value="${esc(o.paymentTerms||'A coordinar')}" placeholder="Transferencia / efectivo / seña 50%..."></div>
 <div class="field"><label>Estado del pago</label><select name="paymentStatus">${['Pendiente','Señado','Pago parcial','Pagado'].map(v=>`<option ${paymentLabel(o)===v?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="field span2"><label>Mensaje al salón</label><textarea name="message" rows="3" placeholder="Ej.: Puedo entregar el viernes. Para confirmar necesito una seña del 50%."></textarea></div></div>
 <div class="form-actions"><button class="primary">Guardar y responder</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`);
 $('#provider-order-form').onsubmit=async e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));try{
   if(SERVER_MODE)await marketApi('provider_update',{orderId:oid,...f});
   else{Object.assign(o,{status:f.status,deliveryDate:f.deliveryDate||'',paymentTerms:f.paymentTerms||'A coordinar',paymentStatus:f.paymentStatus||'Pendiente'});if((f.message||'').trim())o.messages.push({id:id(),by:'provider',text:f.message.trim(),at:new Date().toISOString()});o.salonUnread=true;o.providerUnread=false;save()}
   closeModal();providerOrders();toast('Respuesta enviada al salón');
 }catch(err){toast('No se pudo actualizar el pedido')}};
};window.openProviderOrder=openProviderOrder;

renderSuppliers=function(){
 setTitle('Marketplace','Proveedores de toda la comunidad FiestaControl');
 let ps=sp(), market=(data.marketSuppliers||[]).filter(p=>p.status==='Aprobado'), orders=so().map(normalizeOrderConversation), unread=orders.filter(o=>o.salonUnread).length;
 let products=market.flatMap(p=>(p.products||[]).map(pr=>({p,pr})));
 $('#content').innerHTML=`${unread?`<div class="community-alert" onclick="document.querySelector('#mis-pedidos')?.scrollIntoView({behavior:'smooth'})"><span>🔔</span><div><b>Tenés ${unread} mensaje${unread===1?'':'s'} nuevo${unread===1?'':'s'} de proveedores</b><small>Abrí el pedido para continuar la conversación.</small></div></div>`:''}
 <div class="card marketplace-hero"><div><small class="eyebrow">MARKETPLACE PARA TODOS LOS SALONES</small><h2>Proveedores aprobados de FiestaControl</h2><p>Todo proveedor aprobado y sus productos aparecen automáticamente en todos los salones. Comprá y coordiná entrega y pago sin salir de la aplicación.</p></div><span>🛍️</span></div>
 <div class="market-grid">${products.map(({p,pr})=>`<article class="card product-card"><div class="product-icon">📦</div><span class="post-type">${esc(p.category)}</span><h3>${esc(pr.name)}</h3><p>${esc(pr.description||'')}</p><div class="product-provider"><b>${esc(p.business)}</b><small>${esc(p.description||'Proveedor de la comunidad')}</small></div><div class="product-bottom"><strong>${money(pr.price)}</strong><button class="primary small" onclick="openMarketOrderForm('${p.id}','${pr.id}')">🛒 Hacer pedido</button></div></article>`).join('')||'<div class="card empty">Todavía no hay productos publicados por proveedores aprobados.</div>'}</div>
 <div class="card" id="mis-pedidos" style="margin-top:18px"><div class="section-title"><div><h3>Mis pedidos y chats</h3><small class="muted">Cada pedido tiene su conversación privada con el proveedor.</small></div></div>
 ${orders.slice().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map(o=>`<div class="order-row ${o.salonUnread?'order-unread':''}"><div class="order-main"><div class="order-title"><strong>${esc(orderProviderName(o))}</strong>${o.salonUnread?'<span class="new-dot">MENSAJE NUEVO</span>':''}</div><small>${esc(o.detail)}</small><div class="order-meta"><span class="pill ${orderStatusClass(o.status)}">${esc(o.status)}</span>${o.deliveryDate?`<span>📅 ${fmtDate(o.deliveryDate)}</span>`:''}<span>💳 ${esc(o.paymentStatus||'Pendiente')}</span><span>${money(o.amount)}</span></div></div><button class="primary small" onclick="openSalonOrderThread('${o.id}')">💬 Abrir chat</button></div>`).join('')||'<div class="empty">Todavía no hiciste pedidos.</div>'}</div>
 <div class="grid two" style="margin-top:18px"><div class="card"><div class="section-title"><h3>Mis proveedores particulares</h3></div>${ps.map(p=>`<div class="list-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div></div>`).join('')||'<div class="empty">Sin proveedores particulares.</div>'}</div><div class="card"><h3>Cómo funciona</h3><p class="muted">Los proveedores de Comunidad son globales. Los particulares solo pertenecen a tu salón.</p></div></div>`;
};window.renderSuppliers=renderSuppliers;


/* ===================== V22: Agenda / reservas con navegación por meses ===================== */
let fcCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let fcPublicCalendarCursor = {};

const FC_MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fcMonthKey(year,month){ return `${year}-${String(month+1).padStart(2,'0')}`; }
function fcDateKey(year,month,day){ return `${fcMonthKey(year,month)}-${String(day).padStart(2,'0')}`; }

function fcCalendarControls(cursor, prefix){
  const y=cursor.getFullYear(), m=cursor.getMonth(), currentYear=new Date().getFullYear();
  const years=[];
  for(let yy=currentYear-1; yy<=currentYear+6; yy++) years.push(yy);
  return `<div class="fc-calendar-nav">
    <button class="ghost small" onclick="${prefix}MoveMonth(-1)">← Mes anterior</button>
    <div class="fc-calendar-selectors">
      <select onchange="${prefix}SelectMonth(this.value)">
        ${FC_MONTHS.map((name,i)=>`<option value="${i}" ${i===m?'selected':''}>${name}</option>`).join('')}
      </select>
      <select onchange="${prefix}SelectYear(this.value)">
        ${years.map(yy=>`<option value="${yy}" ${yy===y?'selected':''}>${yy}</option>`).join('')}
      </select>
    </div>
    <button class="ghost small" onclick="${prefix}Today()">Mes actual</button>
    <button class="ghost small" onclick="${prefix}MoveMonth(1)">Mes siguiente →</button>
  </div>`;
}

function renderCalendar(){
  setTitle('Agenda','Consultá reservas y disponibilidad de cualquier mes');
  const year=fcCalendarCursor.getFullYear(), month=fcCalendarCursor.getMonth();
  const first=new Date(year,month,1).getDay(), days=new Date(year,month+1,0).getDate(), cells=[];
  for(let i=0;i<first;i++) cells.push('<div class="day off"></div>');
  for(let n=1;n<=days;n++){
    const ds=fcDateKey(year,month,n), ev=se().filter(e=>e.date===ds);
    cells.push(`<div class="day ${ev.length?'has-events':''}">
      <div class="day-number">${n}</div>
      ${ev.map(e=>`<button class="event-chip" onclick="openEvent('${e.id}')">${esc(e.start||'')} · ${esc(e.child||e.client||'Reserva')}</button>`).join('')}
      ${!ev.length?`<button class="fc-free-day" onclick="openEventFormWithDate('${ds}')" title="Crear reserva">Disponible</button>`:''}
    </div>`);
  }
  $('#content').innerHTML=`<div class="card">
    <div class="calendar-head fc-calendar-head">
      <div><h3>${FC_MONTHS[month]} ${year}</h3><small class="muted">Podés avanzar o retroceder tantos meses como necesites.</small></div>
      <div><span class="pill confirmada">Reservado</span> <span class="pill consulta">Disponible</span></div>
    </div>
    ${fcCalendarControls(fcCalendarCursor,'fcAgenda')}
    <div class="calendar">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(x=>`<div class="weekday">${x}</div>`).join('')}${cells.join('')}</div>
  </div>`;
}
window.renderCalendar=renderCalendar;

function fcAgendaMoveMonth(delta){fcCalendarCursor=new Date(fcCalendarCursor.getFullYear(),fcCalendarCursor.getMonth()+Number(delta),1);renderCalendar()}
function fcAgendaSelectMonth(v){fcCalendarCursor=new Date(fcCalendarCursor.getFullYear(),Number(v),1);renderCalendar()}
function fcAgendaSelectYear(v){fcCalendarCursor=new Date(Number(v),fcCalendarCursor.getMonth(),1);renderCalendar()}
function fcAgendaToday(){let d=new Date();fcCalendarCursor=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar()}
window.fcAgendaMoveMonth=fcAgendaMoveMonth;window.fcAgendaSelectMonth=fcAgendaSelectMonth;window.fcAgendaSelectYear=fcAgendaSelectYear;window.fcAgendaToday=fcAgendaToday;

function openEventFormWithDate(date){
  openEventForm();
  setTimeout(()=>{let f=document.querySelector('#event-form'); if(f?.elements?.date) f.elements.date.value=date;},20);
}
window.openEventFormWithDate=openEventFormWithDate;

function openPublicAvailability(sid, yearArg, monthArg){
  let s=data.salons.find(x=>x.id===sid);if(!s||!s.publicAvailabilityEnabled)return toast('Agenda no disponible');
  if(!fcPublicCalendarCursor[sid]){
    let d=new Date();
    fcPublicCalendarCursor[sid]=new Date(d.getFullYear(),d.getMonth(),1);
  }
  if(Number.isInteger(yearArg)&&Number.isInteger(monthArg)) fcPublicCalendarCursor[sid]=new Date(yearArg,monthArg,1);
  let cur=fcPublicCalendarCursor[sid], year=cur.getFullYear(), month=cur.getMonth();
  let days=new Date(year,month+1,0).getDate(),first=new Date(year,month,1).getDay(),cells=[];
  for(let i=0;i<first;i++)cells.push('<div class="day off"></div>');
  for(let n=1;n<=days;n++){
    let ds=fcDateKey(year,month,n);
    let busy=data.events.some(e=>e.salonId===sid&&e.date===ds&&['Señada','Confirmada'].includes(e.status));
    cells.push(`<div class="day public-day ${busy?'busy':'available'}">
      <div class="day-number">${n}</div><b>${busy?'Ocupado':'Disponible'}</b>
      ${!busy?`<button class="secondary small" onclick="askDateWhatsApp('${sid}','${ds}')">Consultar</button>`:''}
    </div>`);
  }
  showModal(`<div class="modal-title"><div><h2>${esc(s.name)}</h2><p>Disponibilidad · ${FC_MONTHS[month]} ${year}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
    <div class="availability-legend"><span>🟢 Disponible</span><span>🔴 Ocupado</span></div>
    <div class="fc-calendar-nav public">
      <button class="ghost small" onclick="fcPublicMoveMonth('${sid}',-1)">← Anterior</button>
      <div class="fc-calendar-selectors">
        <select onchange="fcPublicSelectMonth('${sid}',this.value)">${FC_MONTHS.map((name,i)=>`<option value="${i}" ${i===month?'selected':''}>${name}</option>`).join('')}</select>
        <select onchange="fcPublicSelectYear('${sid}',this.value)">${Array.from({length:8},(_,i)=>new Date().getFullYear()-1+i).map(yy=>`<option value="${yy}" ${yy===year?'selected':''}>${yy}</option>`).join('')}</select>
      </div>
      <button class="ghost small" onclick="fcPublicMoveMonth('${sid}',1)">Siguiente →</button>
    </div>
    <div class="calendar public-calendar">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(x=>`<div class="weekday">${x}</div>`).join('')}${cells.join('')}</div>`);
}
window.openPublicAvailability=openPublicAvailability;

function fcPublicMoveMonth(sid,delta){let c=fcPublicCalendarCursor[sid]||new Date();fcPublicCalendarCursor[sid]=new Date(c.getFullYear(),c.getMonth()+Number(delta),1);openPublicAvailability(sid)}
function fcPublicSelectMonth(sid,v){let c=fcPublicCalendarCursor[sid]||new Date();fcPublicCalendarCursor[sid]=new Date(c.getFullYear(),Number(v),1);openPublicAvailability(sid)}
function fcPublicSelectYear(sid,v){let c=fcPublicCalendarCursor[sid]||new Date();fcPublicCalendarCursor[sid]=new Date(Number(v),c.getMonth(),1);openPublicAvailability(sid)}
window.fcPublicMoveMonth=fcPublicMoveMonth;window.fcPublicSelectMonth=fcPublicSelectMonth;window.fcPublicSelectYear=fcPublicSelectYear;


/* ===================== V23: Gestión integral - finanzas, caja, personal, comunidad e invitaciones ===================== */
function fcEnsureV23(){
  data.cashMovements=data.cashMovements||[];
  data.communityPosts=data.communityPosts||[];
  data.events=data.events||[];
  data.staff=data.staff||[];
  data.events.forEach(e=>{
    e.extras=e.extras||[];
    e.payments=e.payments||[];
    e.rsvps=e.rsvps||[];
  });
  data.communityPosts.forEach(p=>{
    p.comments=p.comments||[];
    p.reactions=p.reactions||[];
  });
}
fcEnsureV23();

function fcEventBaseTotal(e){ return Number(e.baseTotal ?? e.total ?? 0); }
function fcEventExtrasTotal(e){ return (e.extras||[]).reduce((a,x)=>a+Number(x.amount||0),0); }
function fcEventContracted(e){
  if(typeof e.baseTotal==='undefined') e.baseTotal=Number(e.total||0)-fcEventExtrasTotal(e);
  return Number(e.baseTotal||0)+fcEventExtrasTotal(e);
}
function fcEventCollected(e){
  if((e.payments||[]).length) return (e.payments||[]).reduce((a,p)=>a+Number(p.amount||0),0);
  return Number(e.paid||0);
}
function fcSyncEventTotals(e){
  e.total=fcEventContracted(e);
  e.paid=fcEventCollected(e);
}
function fcPaymentMethods(){return ['Efectivo','Mercado Pago','Transferencia','Débito','Crédito','Otro']}
function fcToday(){return new Date().toISOString().slice(0,10)}
function fcSalonCash(){return (data.cashMovements||[]).filter(x=>x.salonId===session.salonId)}
function fcGeneralIncome(){return fcSalonCash().filter(x=>x.type==='Ingreso').reduce((a,x)=>a+Number(x.amount||0),0)}
function fcExpenses(){return fcSalonCash().filter(x=>x.type==='Egreso').reduce((a,x)=>a+Number(x.amount||0),0)}
function fcEventIncome(){return se().reduce((a,e)=>a+fcEventCollected(e),0)}
function fcPaymentHistory(e){
  let rows=(e.payments||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!rows.length && Number(e.paid||0)>0) return `<div class="list-item"><div><strong>Cobro anterior</strong><small>Importe acumulado antes del historial detallado</small></div><b>${money(e.paid)}</b></div>`;
  return rows.map(p=>`<div class="list-item"><div><strong>${fmtDate(p.date||fcToday())} · ${esc(p.method||'Sin medio')}</strong><small>${esc(p.note||'Sin observación')}</small></div><b>${money(p.amount)}</b></div>`).join('')||'<div class="empty">Todavía no hay cobros registrados.</div>';
}

/* 2, 3 y 4: cobros reales + medios de pago */
openPayment=function(eid){
  fcEnsureV23();let e=data.events.find(x=>x.id===eid);if(!e)return;
  let saldo=Math.max(0,fcEventContracted(e)-fcEventCollected(e));
  showModal(`<div class="modal-title"><div><h2>Registrar cobro</h2><p>Saldo pendiente ${money(saldo)}</p></div><button class="ghost small" onclick="openEvent('${eid}')">✕</button></div>
  <form id="pf"><div class="form-grid">
    <div class="field"><label>Fecha del cobro</label><input name="date" type="date" value="${fcToday()}" required></div>
    <div class="field"><label>Importe</label><input name="amount" type="number" min="1" max="${saldo||999999999}" required></div>
    <div class="field"><label>Medio de pago</label><select name="method">${fcPaymentMethods().map(m=>`<option>${m}</option>`).join('')}</select></div>
    <div class="field"><label>Concepto</label><select name="concept"><option>Seña</option><option>Cuota</option><option>Saldo final</option><option>Otro</option></select></div>
    <div class="field span2"><label>Observación</label><input name="note" placeholder="Ej.: seña recibida por transferencia"></div>
  </div><div class="form-actions"><button class="ghost" type="button" onclick="openEvent('${eid}')">Volver</button><button class="primary">Registrar cobro</button></div></form>`);
  $('#pf').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));e.payments=e.payments||[];
    if(!e.payments.length && Number(e.paid||0)>0)e.payments.push({id:id(),date:e.date||fcToday(),amount:Number(e.paid),method:'Anterior',concept:'Cobro anterior',note:'Importe existente antes del historial detallado'});
    e.payments.push({id:id(),...f,amount:Number(f.amount||0),createdAt:new Date().toISOString()});fcSyncEventTotals(e);save();toast('Cobro registrado');openEvent(eid)};
};window.openPayment=openPayment;

/* 5 y 6: caja e ingresos/egresos */
function openCashMovement(type='Egreso'){
  showModal(`<div class="modal-title"><div><h2>${type==='Ingreso'?'Registrar ingreso':'Registrar egreso'}</h2><p>Movimiento independiente de una reserva.</p></div></div>
  <form id="cash-form"><div class="form-grid">
  <div class="field"><label>Fecha</label><input name="date" type="date" value="${fcToday()}" required></div>
  <div class="field"><label>Importe</label><input name="amount" type="number" min="1" required></div>
  <div class="field"><label>Concepto</label><input name="concept" required placeholder="${type==='Ingreso'?'Ej.: alquiler extra':'Ej.: bebidas, limpieza, reparación'}"></div>
  <div class="field"><label>Categoría</label><select name="category">${(type==='Ingreso'?['Ingreso general','Extra','Servicio adicional','Otro']:['Bebidas','Limpieza','Personal','Proveedor','Mantenimiento','Servicios','Impuestos','Otro']).map(x=>`<option>${x}</option>`).join('')}</select></div>
  <div class="field"><label>Medio de pago</label><select name="method">${fcPaymentMethods().map(m=>`<option>${m}</option>`).join('')}</select></div>
  <div class="field"><label>Observación</label><input name="note" placeholder="Detalle opcional"></div>
  </div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Guardar movimiento</button></div></form>`);
  $('#cash-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));data.cashMovements.push({id:id(),salonId:session.salonId,type,...f,amount:Number(f.amount||0),createdAt:new Date().toISOString()});save();closeModal();renderFinance();toast('Movimiento registrado')};
}
window.openCashMovement=openCashMovement;

function fcFinanceRows(rows){
  return rows.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>`<tr><td>${fmtDate(x.date)}</td><td><span class="pill ${x.type==='Ingreso'?'aprobado':'suspendido'}">${x.type}</span></td><td>${esc(x.concept)}</td><td>${esc(x.category||'')}</td><td>${esc(x.method||'')}</td><td class="${x.type==='Ingreso'?'good':'bad'}"><b>${x.type==='Ingreso'?'+':'-'} ${money(x.amount)}</b></td><td>${esc(x.note||'')}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Sin movimientos en este período.</td></tr>';
}
function renderFinance(){
  fcEnsureV23();setTitle('Ingresos y Finanzas','Cobros reales, saldos pendientes, caja y gastos');
  let ev=se();ev.forEach(fcSyncEventTotals);
  let contracted=ev.reduce((a,e)=>a+fcEventContracted(e),0), eventIncome=fcEventIncome(), otherIncome=fcGeneralIncome(), expenses=fcExpenses(), collected=eventIncome+otherIncome, pending=Math.max(0,contracted-eventIncome), net=collected-expenses;
  let rows=fcSalonCash();
  $('#content').innerHTML=`<div class="grid stats finance-kpis">
    <div class="card stat"><div class="stat-icon">🧾</div><small>Contratado</small><strong>${money(contracted)}</strong><em>Valor de reservas + extras</em></div>
    <div class="card stat"><div class="stat-icon">✅</div><small>Ingresado</small><strong>${money(collected)}</strong><em>Cobros reales + otros ingresos</em></div>
    <div class="card stat"><div class="stat-icon">⏳</div><small>Pendiente de cobro</small><strong>${money(pending)}</strong><em>Saldo de reservas</em></div>
    <div class="card stat"><div class="stat-icon">📤</div><small>Egresos</small><strong>${money(expenses)}</strong><em>Gastos registrados</em></div>
    <div class="card stat"><div class="stat-icon">💰</div><small>Resultado neto</small><strong class="${net<0?'bad':'good'}">${money(net)}</strong><em>Ingresos - egresos</em></div>
  </div>
  <div class="card finance-explainer"><b>Importante</b><p>“Contratado” es el valor de las fiestas reservadas. “Ingresado” muestra únicamente el dinero efectivamente cobrado.</p></div>
  <div class="toolbar finance-toolbar"><button class="primary" onclick="openCashMovement('Ingreso')">+ Otro ingreso</button><button class="secondary" onclick="openCashMovement('Egreso')">− Nuevo egreso</button></div>
  <div class="grid two">
    <div class="card"><div class="section-title"><h3>Cobros de reservas</h3><small class="muted">Historial por fiesta</small></div>
    ${ev.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<div class="list-item"><div><strong>${esc(e.child)} · ${fmtDate(e.date)}</strong><small>Contratado ${money(fcEventContracted(e))} · Cobrado ${money(fcEventCollected(e))}</small></div><div class="actions"><b class="${fcEventContracted(e)-fcEventCollected(e)>0?'bad':'good'}">${money(fcEventContracted(e)-fcEventCollected(e))}</b><button class="secondary small" onclick="openEvent('${e.id}')">Ver</button></div></div>`).join('')||'<div class="empty">No hay reservas.</div>'}</div>
    <div class="card"><div class="section-title"><h3>Resumen por medio de pago</h3></div>
    ${fcPaymentMethods().map(method=>{let sum=ev.flatMap(e=>e.payments||[]).filter(p=>p.method===method).reduce((a,p)=>a+Number(p.amount||0),0)+rows.filter(x=>x.type==='Ingreso'&&x.method===method).reduce((a,x)=>a+Number(x.amount||0),0);return `<div class="list-item"><span>${method}</span><b>${money(sum)}</b></div>`}).join('')}</div>
  </div>
  <div class="card" style="margin-top:18px"><div class="section-title"><div><h3>Caja · ingresos y egresos</h3><small class="muted">Movimientos generales del salón</small></div></div>
  <div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Categoría</th><th>Medio</th><th>Importe</th><th>Observación</th></tr></thead><tbody>${fcFinanceRows(rows)}</tbody></table></div></div>`;
}
window.renderFinance=renderFinance;

/* 7: personal con lenguaje claro y seguimiento de pago */
openStaffForm=function(){
 showModal(`<div class="modal-title"><div><h2>Agregar personal</h2><p>Registrá el costo habitual para poder estimar cada evento.</p></div></div><form id="sf"><div class="form-grid"><div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Rol / tarea</label><input name="role" required placeholder="Ej.: mozo, animación, cocina"></div><div class="field"><label>WhatsApp</label><input name="phone"></div><div class="field"><label>Pago habitual por evento</label><input name="defaultFee" type="number" min="0"></div></div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar</button></div></form>`);
 $('#sf').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));f.defaultFee=Number(f.defaultFee||0);data.staff.push({id:id(),salonId:session.salonId,...f});save();closeModal();renderSalonShell()}
};window.openStaffForm=openStaffForm;

/* Extras de una reserva */
function openExtraForm(eid){
 let e=data.events.find(x=>x.id===eid);if(!e)return;
 showModal(`<div class="modal-title"><div><h2>Agregar extra</h2><p>${esc(e.child)} · aumenta el valor contratado.</p></div></div><form id="extra-form"><div class="form-grid"><div class="field span2"><label>Concepto</label><input name="concept" required placeholder="Ej.: hora adicional, gaseosas, decoración"></div><div class="field"><label>Importe</label><input name="amount" type="number" min="0" required></div><div class="field"><label>Observación</label><input name="note" placeholder="Detalle opcional"></div></div><div class="form-actions"><button type="button" class="ghost" onclick="openEvent('${eid}')">Volver</button><button class="primary">Agregar extra</button></div></form>`);
 $('#extra-form').onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target));e.extras=e.extras||[];if(typeof e.baseTotal==='undefined')e.baseTotal=Number(e.total||0)-fcEventExtrasTotal(e);e.extras.push({id:id(),...f,amount:Number(f.amount||0),createdAt:new Date().toISOString()});fcSyncEventTotals(e);save();toast('Extra agregado');openEvent(eid)}
}
window.openExtraForm=openExtraForm;

/* Ficha de fiesta integral + punto 8 navegación clara */
openEvent=function(eid){
 fcEnsureV23();let e=data.events.find(x=>x.id===eid);if(!e)return;fcSyncEventTotals(e);let r=e.rsvps||[], notes=rsvpObservationCount? rsvpObservationCount(e):(r.filter(x=>String(x.note||'').trim()).length), yes=r.filter(x=>x.status==='Sí').length;
 let extras=(e.extras||[]);
 showModal(`<div class="modal-title"><div><h2>${esc(e.child)} · ${fmtDate(e.date)}</h2><p>${esc(e.client)} · ${e.start} a ${e.end}</p></div><button class="ghost small" onclick="closeModal()">✕ Cerrar</button></div>
 ${notes?`<div class="rsvp-warning-banner"><div class="rsvp-warning-icon">⚠️</div><div><b>${notes} invitado${notes===1?'':'s'} con observaciones</b><span>Revisá alimentación, alergias u otros comentarios.</span></div></div>`:''}
 <div class="grid stats" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small class="muted">Contratado</small><strong>${money(fcEventContracted(e))}</strong></div><div class="card"><small class="muted">Cobrado</small><strong class="good">${money(fcEventCollected(e))}</strong></div><div class="card"><small class="muted">Pendiente</small><strong class="${fcEventContracted(e)-fcEventCollected(e)>0?'bad':'good'}">${money(Math.max(0,fcEventContracted(e)-fcEventCollected(e)))}</strong></div><div class="card"><small class="muted">Confirmados</small><strong>${yes}</strong></div></div>
 <div class="toolbar" style="margin-top:16px"><button class="primary small" onclick="openPayment('${eid}')">+ Registrar cobro</button><button class="secondary small" onclick="openExtraForm('${eid}')">+ Agregar extra</button><button class="secondary small" onclick="openInvitation('${eid}')">Invitación</button><button class="ghost small" onclick="openEventForm('${eid}')">Editar reserva</button></div>
 <div class="grid two" style="margin-top:16px"><div class="card"><h3>Detalle</h3><div class="list"><div class="list-item"><div><strong>Paquete ${esc(e.package)}</strong><small>${e.guests} invitados estimados</small></div><span class="pill ${e.status.toLowerCase()}">${e.status}</span></div><div class="list-item"><div><strong>Observaciones internas</strong><small>${esc(e.notes||'Sin observaciones')}</small></div></div></div></div>
 <div class="card"><h3>Extras</h3>${extras.map(x=>`<div class="list-item"><div><strong>${esc(x.concept)}</strong><small>${esc(x.note||'')}</small></div><b>${money(x.amount)}</b></div>`).join('')||'<div class="empty">Sin extras.</div>'}</div></div>
 <div class="grid two" style="margin-top:16px"><div class="card"><div class="section-title"><h3>Historial de cobros</h3></div>${fcPaymentHistory(e)}</div><div class="card"><div class="section-title"><h3>Confirmaciones</h3><small>${r.length} respuestas</small></div>${typeof rsvpRowsHTML==='function'?rsvpRowsHTML(e):r.map(x=>`<div class="list-item"><div><b>${esc(x.name)}</b><small>${esc(x.note||'')}</small></div><span>${esc(x.status)}</span></div>`).join('')}</div></div>
 <div class="form-actions sticky-modal-actions"><button class="ghost" onclick="closeModal()">← Volver al panel</button></div>`);
};window.openEvent=openEvent;

/* 9: comunidad participativa: publicar, comentar y reaccionar */
function openSalonCommunityPostForm(){
 let s=salon();
 showModal(`<div class="modal-title"><div><h2>Publicar en la comunidad</h2><p>Tu publicación será visible para los salones de FiestaControl.</p></div></div><form id="salon-post-form"><div class="form-grid"><div class="field span2"><label>Título</label><input name="title" required></div><div class="field"><label>Tipo</label><select name="type"><option>Idea</option><option>Consulta</option><option>Recomendación</option><option>Experiencia</option></select></div><div class="field"><label>Valoración opcional</label><select name="rating"><option value="">Sin estrellas</option>${[5,4,3,2,1].map(n=>`<option value="${n}">${'⭐'.repeat(n)}</option>`).join('')}</select></div><div class="field span2"><label>Publicación</label><textarea name="body" rows="5" required></textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Publicar</button></div></form>`);
 $('#salon-post-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));data.communityPosts.push({id:id(),...f,target:'Todos',author:s.name,authorSalonId:s.id,created:new Date().toISOString(),pinned:false,readBy:[s.id],comments:[],reactions:[]});save();closeModal();renderCommunity();toast('Publicado en la comunidad')};
}
window.openSalonCommunityPostForm=openSalonCommunityPostForm;
function toggleCommunityReaction(pid){
 let p=data.communityPosts.find(x=>x.id===pid),s=salon();if(!p)return;p.reactions=p.reactions||[];let i=p.reactions.indexOf(s.id);if(i>=0)p.reactions.splice(i,1);else p.reactions.push(s.id);save();renderCommunity();
}
window.toggleCommunityReaction=toggleCommunityReaction;

renderCommunity=function(){
 fcEnsureV23();setTitle('Comunidad','Publicaciones, consultas y experiencias entre salones');
 let s=salon(),posts=[...(data.communityPosts||[])].filter(p=>p.target==='Todos'||p.target===s.plan||p.target===s.id).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(b.created||'').localeCompare(a.created||''));
 $('#content').innerHTML=`<div class="community-hero"><div><div class="eyebrow light">COMUNIDAD FIESTACONTROL</div><h2>Una red activa de salones.</h2><p>Compartí ideas, consultas, experiencias y recomendaciones con otros salones.</p><button class="hero-btn" onclick="openSalonCommunityPostForm()">+ Crear publicación</button></div><div class="community-badge"><b>${posts.length}</b><small>publicaciones</small><span>${data.salons.filter(x=>x.status==='Aprobado').length} salones</span></div></div>
 <div class="community-layout"><div class="community-feed">${posts.map(p=>{let comments=p.comments||[],react=p.reactions||[],mine=react.includes(s.id);return `<article class="card community-post ${p.pinned?'pinned':''}"><div class="post-head"><div><span class="post-type">${esc(p.type||'Comunidad')}</span>${p.pinned?'<span class="pin">📌 Fijado</span>':''}</div><small>${p.created?new Date(p.created).toLocaleString('es-AR'):''}</small></div><h3>${esc(p.title||'')}</h3>${p.rating?`<div class="community-rating">${'⭐'.repeat(Number(p.rating))}</div>`:''}<p>${esc(p.body||'').replace(/\n/g,'<br>')}</p><div class="post-foot"><span>Por <b>${esc(p.author||'FiestaControl')}</b></span><div class="actions"><button class="${mine?'secondary':'ghost'} small" onclick="toggleCommunityReaction('${p.id}')">👍 ${react.length} Me sirve</button><button class="ghost small" onclick="toggleComments('${p.id}')">💬 ${comments.length}</button></div></div><div class="comments" id="comments-${p.id}" style="display:none">${comments.map(c=>`<div class="comment"><b>${esc(c.salonName)}</b><span>${esc(c.text)}</span><small>${new Date(c.created).toLocaleString('es-AR')}</small></div>`).join('')||'<div class="muted">Sin comentarios todavía.</div>'}<form onsubmit="addCommunityComment(event,'${p.id}')"><input name="text" placeholder="Escribí un comentario..." required><button class="secondary small">Enviar</button></form></div></article>`}).join('')||'<div class="card empty">Todavía no hay publicaciones.</div>'}</div><aside class="community-side"><div class="card"><h3>Participá</h3><p class="muted">Los salones pueden publicar, comentar y reaccionar. El administrador mantiene la moderación general.</p><button class="primary w100" onclick="openSalonCommunityPostForm()">Publicar</button></div></aside></div>`;
 posts.forEach(p=>{p.readBy=p.readBy||[];if(!p.readBy.includes(s.id))p.readBy.push(s.id)});save();
};window.renderCommunity=renderCommunity;

/* 10: estilos profesionales de tarjeta */
const fcInviteStyles={
  moderna:{name:'Moderna',desc:'Impactante y visual'},
  elegante:{name:'Elegante',desc:'Tipografía limpia y sofisticada'},
  minimal:{name:'Minimal',desc:'Simple y clara'}
};
function fcStyledCardHTML(e,c,compact=false){
 let html=cardHTML(e,c,compact),style=c?.layoutStyle||'moderna';
 return html.replace('virtual-card photo-card',`virtual-card photo-card invite-style-${style}`);
}
renderCards=function(){
 setTitle('Tarjetas virtuales','Invitaciones profesionales optimizadas para celular y WhatsApp');let ev=se().sort((a,b)=>a.date.localeCompare(b.date));
 if(!ev.length){$('#content').innerHTML='<div class="card empty">Primero creá una fiesta.<br><br><button class="primary" onclick="openEventForm()">+ Crear fiesta</button></div>';return}
 $('#content').innerHTML=`<div class="cards-intro"><div><h2>💌 Invitaciones digitales</h2><p>Elegí temática, estilo, imagen y mensaje. El invitado podrá confirmar asistencia y ver cómo llegar.</p></div></div><div class="card-gallery">${ev.map(e=>{let c=cardFor(e.id);return `<div class="card card-project"><div class="project-head"><div><small>${fmtDate(e.date)} · ${e.start}</small><h3>${esc(e.child)} · ${e.age} años</h3></div><span class="pill aprobado">✅ ${confirmedCount(e)} confirmados</span></div>${fcStyledCardHTML(e,c,true)}<div class="card-actions"><button class="secondary" onclick="openCardEditor('${e.id}')">🎨 Diseñar</button><button class="ghost" onclick="openInvitation('${e.id}')">👁 Vista previa</button><button class="secondary" onclick="openPublicInvitationTab('${e.id}')">🎟️ Invitación pública</button><button class="primary" onclick="shareCardWhatsApp('${e.id}')">📲 WhatsApp</button></div></div>`}).join('')}</div>`;
};window.renderCards=renderCards;

const _fcOldOpenCardEditor=openCardEditor;
openCardEditor=function(eid){
 let e=data.events.find(x=>x.id===eid),c=cardFor(eid)||{theme:'superheroes',emoji:'🦸',title:`¡${e.child} cumple ${e.age}!`,message:'Te esperamos para compartir una tarde llena de diversión.',extra:'¡No faltes!',customImage:'',layoutStyle:'moderna'};
 showModal(`<div class="modal-title"><div><h2>Diseñar invitación</h2><p>${esc(e.child)} · ${fmtDate(e.date)}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="v23-card-form">
 <div class="field"><label>Estilo visual</label><div class="invite-style-picker">${Object.entries(fcInviteStyles).map(([k,v])=>`<label class="invite-style-option"><input type="radio" name="layoutStyle" value="${k}" ${(c.layoutStyle||'moderna')===k?'checked':''}><b>${v.name}</b><small>${v.desc}</small></label>`).join('')}</div></div>
 <div class="field"><label>Temática</label><div class="theme-grid visual-themes">${Object.entries(cardThemes).map(([k,t])=>`<label class="theme-option visual ${c.theme===k?'selected':''}"><input type="radio" name="theme" value="${k}" ${c.theme===k?'checked':''}><img src="${t.image}" alt="${esc(t.name)}"><span><b>${t.name}</b><small>${t.icon}</small></span></label>`).join('')}</div></div>
 <div class="upload-theme"><div><b>Imagen personalizada</b><small>Podés usar una foto o diseño propio.</small></div><label class="secondary file-button">📷 Subir imagen<input id="v23-card-image" type="file" accept="image/*" hidden></label></div><input type="hidden" name="customImage" value="${esc(c.customImage||'')}">
 <div class="form-grid"><div class="field"><label>Emoji / ícono</label><input name="emoji" value="${esc(c.emoji||'🎉')}"></div><div class="field"><label>Título</label><input name="title" value="${esc(c.title||`¡${e.child} cumple ${e.age}!`)}"></div><div class="field span2"><label>Mensaje</label><textarea name="message" rows="3">${esc(c.message||'Te esperamos para compartir una tarde llena de diversión.')}</textarea></div><div class="field span2"><label>Frase final</label><input name="extra" value="${esc(c.extra||'¡No faltes!')}"></div></div>
 <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">← Volver</button><button class="primary">Guardar invitación</button></div></form>`);
 let file=$('#v23-card-image'),form=$('#v23-card-form');file.onchange=()=>{let f=file.files[0];if(!f)return;let rd=new FileReader();rd.onload=()=>form.elements.customImage.value=rd.result;rd.readAsDataURL(f)};
 form.onsubmit=x=>{x.preventDefault();let f=Object.fromEntries(new FormData(x.target)),old=cardFor(eid);if(old)Object.assign(old,f);else data.cards.push({id:id(),eventId:eid,salonId:session.salonId,...f});save();closeModal();renderCards();toast('Invitación guardada')};
};window.openCardEditor=openCardEditor;

/* Vista previa y página pública: botón de regreso visible */
openInvitation=function(eid){let e=data.events.find(x=>x.id===eid),c=cardFor(eid),s=salonForEvent?salonForEvent(e):salon();showModal(`<div class="invite-preview-top"><button class="ghost small" onclick="closeModal()">← Volver al panel</button></div>${typeof invitationPublicHTML==='function'?invitationPublicHTML(e,c,s):fcStyledCardHTML(e,c)}<div class="form-actions"><button class="secondary" onclick="openPublicInvitationTab('${eid}')">🎟️ Abrir invitación pública</button><button class="primary" onclick="shareCardWhatsApp('${eid}')">📲 Compartir WhatsApp</button></div>`)};window.openInvitation=openInvitation;

const _v23RenderPublicInvitationPage=typeof renderPublicInvitationPage==='function'?renderPublicInvitationPage:null;
renderPublicInvitationPage=function(eid){
 let e=data.events.find(x=>x.id===eid);if(!e){$('#app').innerHTML='<div class="public-invite-page"><div class="card empty">La invitación no está disponible.</div></div>';return}
 let c=data.cards.find(x=>x.eventId===eid),s=salonForEvent(e);session=null;sessionStorage.removeItem(SESSION);
 $('#app').innerHTML=`<main class="public-invite-page"><div class="public-backbar"><button onclick="history.length>1?history.back():location.href='/'">← Volver</button></div>${invitationPublicHTML(e,c,s)}</main><dialog id="modal"><div id="modal-body"></div></dialog><div id="toast" class="toast"></div>`;
};window.renderPublicInvitationPage=renderPublicInvitationPage;

/* Dashboard: terminología clara */
renderDashboard=function(){
 fcEnsureV23();setTitle('Dashboard','Resumen operativo y económico del salón');let ev=se(), upcoming=ev.filter(e=>e.date>=todayKey()).sort((a,b)=>a.date.localeCompare(b.date));ev.forEach(fcSyncEventTotals);
 let contracted=ev.reduce((a,e)=>a+fcEventContracted(e),0),eventIncome=fcEventIncome(),otherIncome=fcGeneralIncome(),expenses=fcExpenses(),collected=eventIncome+otherIncome,pending=Math.max(0,contracted-eventIncome),confirmed=ev.filter(e=>['Confirmada','Señada'].includes(e.status)).length;
 $('#content').innerHTML=`${todayEvents().length?`<div class="today-dashboard-alert"><div class="today-dashboard-icon">🎉</div><div><span class="eyebrow">AGENDA DE HOY</span><h2>Tenés ${todayEvents().length} fiesta${todayEvents().length>1?'s':''} programada${todayEvents().length>1?'s':''}</h2></div><button class="primary" onclick="view='events';renderSalonShell()">Ver</button></div>`:''}
 <div class="grid stats"><div class="card stat"><div class="stat-icon">🎉</div><small>Fiestas activas</small><strong>${confirmed}</strong><em>${upcoming.length} próximas</em></div><div class="card stat"><div class="stat-icon">🧾</div><small>Contratado</small><strong>${money(contracted)}</strong><em>Reservas + extras</em></div><div class="card stat"><div class="stat-icon">✅</div><small>Ingresado</small><strong>${money(collected)}</strong><em>Dinero realmente cobrado</em></div><div class="card stat"><div class="stat-icon">⏳</div><small>Pendiente</small><strong>${money(pending)}</strong><em>Por cobrar de reservas</em></div><div class="card stat"><div class="stat-icon">📤</div><small>Egresos</small><strong>${money(expenses)}</strong><em>Gastos registrados</em></div></div>
 <div class="card" style="margin-top:16px"><div class="section-title"><h3>Acciones rápidas</h3></div><div class="quick-grid"><button class="quick" onclick="openEventForm()"><span>➕</span><strong>Nueva reserva</strong><small>Cargar una fiesta</small></button><button class="quick" onclick="view='calendar';renderSalonShell()"><span>📅</span><strong>Ver agenda</strong><small>Meses y años</small></button><button class="quick" onclick="view='finance';renderSalonShell()"><span>💰</span><strong>Caja</strong><small>Cobros y gastos</small></button><button class="quick" onclick="view='community';renderSalonShell()"><span>🌐</span><strong>Comunidad</strong><small>Publicar y comentar</small></button><button class="quick" onclick="view='cards';renderSalonShell()"><span>💌</span><strong>Invitaciones</strong><small>Diseños profesionales</small></button></div></div>
 <div class="grid two" style="margin-top:16px"><div class="card"><div class="section-title"><h3>Próximas fiestas</h3><button class="ghost small" onclick="view='events';renderSalonShell()">Ver todas</button></div>${upcoming.slice(0,6).map(e=>`<div class="list-item"><div><strong>${esc(e.child)} · ${fmtDate(e.date)}</strong><small>${esc(e.client)} · ${e.start}</small></div><b class="${fcEventContracted(e)-fcEventCollected(e)>0?'bad':'good'}">${money(fcEventContracted(e)-fcEventCollected(e))}</b></div>`).join('')||'<div class="empty">Sin próximas fiestas.</div>'}</div><div class="card"><div class="section-title"><h3>Resultado de caja</h3></div><div class="cash-big"><small>Ingresos</small><b>${money(collected)}</b><small>Egresos</small><b>${money(expenses)}</b><hr><small>Resultado</small><strong class="${collected-expenses<0?'bad':'good'}">${money(collected-expenses)}</strong></div></div></div>`;
};window.renderDashboard=renderDashboard;


/* ===================== V24: privacidad entre salones + zonas ===================== */
function fcZoneOptions(){return ['CABA','Zona Oeste','Zona Norte','Zona Sur','La Plata / Gran La Plata','Interior PBA','Otra']}
function fcZoneLabel(s){return s?.zone||'Sin zona'}
function fcNormalizeZones(){(data.salons||[]).forEach(s=>{if(typeof s.zone==='undefined')s.zone=''});(data.marketSuppliers||[]).forEach(p=>{if(typeof p.zone==='undefined')p.zone=''});}
fcNormalizeZones();

/* Los salones NO pueden navegar información interna de otros salones.
   La comunidad muestra publicaciones, pero no precios, reservas, caja, clientes ni datos operativos. */
function fcPublicSalonName(id){let s=(data.salons||[]).find(x=>x.id===id);return s?`${s.name} · ${fcZoneLabel(s)}`:'Salón'}

/* Perfil: agrega zona general para ordenar la red */
editSalonProfile=function(){
 let s=salon();fcNormalizeZones();
 showModal(`<div class="modal-title"><div><h2>Editar salón</h2><p>Datos visibles de tu propio salón.</p></div></div><form id="ep">
 <div class="logo-upload-box">${s.logo?`<img id="logo-preview" src="${s.logo}" alt="Logo">`:`<div id="logo-preview" class="logo-preview-placeholder">${esc((s.name||'S').slice(0,1))}</div>`}<div><b>Logo del salón</b><small>PNG o JPG.</small><label class="secondary file-button">📷 Elegir logo<input id="salon-logo-file" type="file" accept="image/*" hidden></label><button type="button" class="ghost small" onclick="removeSalonLogo()">Quitar logo</button></div></div>
 <input type="hidden" name="logo" value="${esc(s.logo||'')}"><div class="form-grid">
 <div class="field span2"><label>Nombre</label><input name="name" value="${esc(s.name)}"></div>
 <div class="field"><label>Responsable</label><input name="owner" value="${esc(s.owner)}"></div>
 <div class="field"><label>WhatsApp</label><input name="phone" value="${esc(s.phone||'')}"></div>
 <div class="field span2"><label>Dirección</label><input name="address" value="${esc(s.address||'')}"></div>
 <div class="field"><label>Zona</label><select name="zone"><option value="">Seleccionar zona</option>${fcZoneOptions().map(z=>`<option ${s.zone===z?'selected':''}>${z}</option>`).join('')}</select><small class="muted">Se usa para ordenar proveedores y comunidad, sin exponer información privada.</small></div>
 <div class="field"><label>Color de marca</label><input name="brandColor" type="color" value="${esc(s.brandColor||'#7257ff')}"></div>
 </div><div class="form-actions"><button class="ghost" type="button" onclick="closeModal()">Cancelar</button><button class="primary">Guardar cambios</button></div></form>`);
 let form=$('#ep'),file=$('#salon-logo-file');file.onchange=()=>{let f=file.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{form.elements.logo.value=r.result;let p=$('#logo-preview');if(p.outerHTML.includes('placeholder'))p.outerHTML=`<img id="logo-preview" src="${r.result}" alt="Logo">`;else p.src=r.result};r.readAsDataURL(f)};
 form.onsubmit=e=>{e.preventDefault();Object.assign(s,Object.fromEntries(new FormData(e.target)));save();closeModal();renderSalonShell();toast('Datos del salón actualizados')};
};window.editSalonProfile=editSalonProfile;

/* Registro de salón: zona desde el alta */
const _v24OpenSalonRegister=typeof openSalonRegister==='function'?openSalonRegister:null;
if(_v24OpenSalonRegister){
  openSalonRegister=function(){
    _v24OpenSalonRegister();
    setTimeout(()=>{let form=document.querySelector('form');if(!form||form.querySelector('[name="zone"]'))return;let grid=form.querySelector('.form-grid');if(grid){let div=document.createElement('div');div.className='field';div.innerHTML=`<label>Zona</label><select name="zone"><option value="">Seleccionar zona</option>${fcZoneOptions().map(z=>`<option>${z}</option>`).join('')}</select>`;grid.appendChild(div)}},0)
  };window.openSalonRegister=openSalonRegister;
}

/* Proveedores: zona para filtrar alcance comercial */
const _v24ProviderRegister=typeof openProviderRegister==='function'?openProviderRegister:null;
if(_v24ProviderRegister){
 openProviderRegister=function(){
  _v24ProviderRegister();
  setTimeout(()=>{let form=document.querySelector('form');if(!form||form.querySelector('[name="zone"]'))return;let grid=form.querySelector('.form-grid');if(grid){let div=document.createElement('div');div.className='field';div.innerHTML=`<label>Zona principal de trabajo</label><select name="zone"><option value="">Todas / sin definir</option>${fcZoneOptions().map(z=>`<option>${z}</option>`).join('')}</select>`;grid.appendChild(div)}},0)
 };window.openProviderRegister=openProviderRegister;
}

/* Marketplace por zona: prioriza proveedores de la misma zona, sin impedir proveedores que trabajen en varias áreas */
function fcSupplierZone(p){return p.zone||p.serviceZone||''}
function fcMarketplaceApproved(){let s=salon();return (data.marketSuppliers||[]).filter(p=>p.status==='Aprobado').sort((a,b)=>{let az=fcSupplierZone(a)===s.zone?0:1,bz=fcSupplierZone(b)===s.zone?0:1;return az-bz||(a.business||a.name||'').localeCompare(b.business||b.name||'')})}

/* Comunidad V24: interacción sí; acceso a otro salón no. Filtro de zona. */
renderCommunity=function(){
 fcEnsureV23();fcNormalizeZones();setTitle('Comunidad','Ideas y experiencias, sin exponer información privada de otros salones');
 let s=salon(),filter=sessionStorage.getItem('fc_community_zone')||'Mi zona';
 let posts=[...(data.communityPosts||[])].filter(p=>p.target==='Todos'||p.target===s.plan||p.target===s.id);
 if(filter==='Mi zona')posts=posts.filter(p=>!p.authorSalonId||((data.salons||[]).find(x=>x.id===p.authorSalonId)?.zone||'')===(s.zone||''));
 else if(filter!=='Todas')posts=posts.filter(p=>!p.authorSalonId||((data.salons||[]).find(x=>x.id===p.authorSalonId)?.zone||'')===filter);
 posts.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(b.created||'').localeCompare(a.created||''));
 $('#content').innerHTML=`<div class="community-hero"><div><div class="eyebrow light">COMUNIDAD FIESTACONTROL</div><h2>Compartir sin invadir la gestión de otro salón.</h2><p>Los salones pueden publicar, comentar y recomendar. Nunca ven precios, reservas, clientes, caja ni información interna de otro salón.</p><button class="hero-btn" onclick="openSalonCommunityPostForm()">+ Crear publicación</button></div><div class="community-badge"><b>${posts.length}</b><small>publicaciones</small><span>${esc(fcZoneLabel(s))}</span></div></div>
 <div class="card zone-filter"><div><b>📍 Filtrar comunidad por zona</b><small>Ayuda a encontrar información cercana sin cargar una lista enorme de localidades.</small></div><select id="community-zone-filter"><option>Mi zona</option><option>Todas</option>${fcZoneOptions().map(z=>`<option ${filter===z?'selected':''}>${z}</option>`).join('')}</select></div>
 <div class="privacy-note">🔒 Cada salón mantiene privada su operación. La comunidad comparte únicamente lo que cada usuario decide publicar.</div>
 <div class="community-layout"><div class="community-feed">${posts.map(p=>{let comments=p.comments||[],react=p.reactions||[],mine=react.includes(s.id),author=(data.salons||[]).find(x=>x.id===p.authorSalonId);return `<article class="card community-post ${p.pinned?'pinned':''}"><div class="post-head"><div><span class="post-type">${esc(p.type||'Comunidad')}</span>${p.pinned?'<span class="pin">📌 Fijado</span>':''}</div><small>${p.created?new Date(p.created).toLocaleString('es-AR'):''}</small></div><h3>${esc(p.title||'')}</h3>${p.rating?`<div class="community-rating">${'⭐'.repeat(Number(p.rating))}</div>`:''}<p>${esc(p.body||'').replace(/\n/g,'<br>')}</p><div class="post-foot"><span>Por <b>${esc(p.author||'FiestaControl')}</b>${author?.zone?` · 📍 ${esc(author.zone)}`:''}</span><div class="actions"><button class="${mine?'secondary':'ghost'} small" onclick="toggleCommunityReaction('${p.id}')">👍 ${react.length}</button><button class="ghost small" onclick="toggleComments('${p.id}')">💬 ${comments.length}</button></div></div><div class="comments" id="comments-${p.id}" style="display:none">${comments.map(c=>`<div class="comment"><b>${esc(c.salonName)}</b><span>${esc(c.text)}</span><small>${new Date(c.created).toLocaleString('es-AR')}</small></div>`).join('')||'<div class="muted">Sin comentarios todavía.</div>'}<form onsubmit="addCommunityComment(event,'${p.id}')"><input name="text" placeholder="Escribí un comentario..." required><button class="secondary small">Enviar</button></form></div></article>`}).join('')||'<div class="card empty">No hay publicaciones para este filtro.</div>'}</div><aside class="community-side"><div class="card"><h3>Privacidad entre salones</h3><p class="muted">No existe un botón para entrar al panel de otro salón. Solo se comparte contenido publicado en Comunidad y disponibilidad pública cuando el propio salón la habilita.</p></div></aside></div>`;
 let z=$('#community-zone-filter');if(z){z.value=filter;z.onchange=()=>{sessionStorage.setItem('fc_community_zone',z.value);renderCommunity()}}
 posts.forEach(p=>{p.readBy=p.readBy||[];if(!p.readBy.includes(s.id))p.readBy.push(s.id)});save();
};window.renderCommunity=renderCommunity;

/* Publicación incluye alcance geográfico opcional, sin datos internos */
openSalonCommunityPostForm=function(){
 let s=salon();
 showModal(`<div class="modal-title"><div><h2>Publicar en la comunidad</h2><p>Compartí solo la información que quieras hacer pública para la red.</p></div></div><form id="salon-post-form"><div class="form-grid"><div class="field span2"><label>Título</label><input name="title" required></div><div class="field"><label>Tipo</label><select name="type"><option>Idea</option><option>Consulta</option><option>Recomendación</option><option>Experiencia</option></select></div><div class="field"><label>Valoración opcional</label><select name="rating"><option value="">Sin estrellas</option>${[5,4,3,2,1].map(n=>`<option value="${n}">${'⭐'.repeat(n)}</option>`).join('')}</select></div><div class="field span2"><label>Publicación</label><textarea name="body" rows="5" required></textarea></div></div><div class="privacy-note">🔒 No se comparte automáticamente ningún precio, reserva, cliente ni dato financiero de tu salón.</div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Publicar</button></div></form>`);
 $('#salon-post-form').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));data.communityPosts.push({id:id(),...f,target:'Todos',author:s.name,authorSalonId:s.id,created:new Date().toISOString(),pinned:false,readBy:[s.id],comments:[],reactions:[]});save();closeModal();renderCommunity();toast('Publicado en la comunidad')};
};window.openSalonCommunityPostForm=openSalonCommunityPostForm;

/* Marketplace: agrega selector de zona encima de la vista existente, cuando corresponda */
const _v24RenderSuppliers=typeof renderSuppliers==='function'?renderSuppliers:null;
if(_v24RenderSuppliers){
 renderSuppliers=function(){
   _v24RenderSuppliers();
   setTimeout(()=>{let c=$('#content');if(!c||c.querySelector('.market-zone-info'))return;let s=salon(),box=document.createElement('div');box.className='card market-zone-info';box.innerHTML=`<div><b>📍 Proveedores por zona</b><small>Tu zona: ${esc(fcZoneLabel(s))}. Los proveedores cercanos se priorizan para evitar resultados poco útiles.</small></div></div>`;c.prepend(box)},0)
 };window.renderSuppliers=renderSuppliers;
}
