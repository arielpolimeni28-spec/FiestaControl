// FiestaControl - Agenda + email por salón + borrado protegido
(function () {
  'use strict';

  function safeEsc(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

  function getEvent(eid) {
    return (data?.events || []).find(x => x.id === eid) || null;
  }

  const style = document.createElement('style');
  style.textContent = `
    .day.fc-clickable-day{
      width:100%;min-height:118px;text-align:left;cursor:pointer;
      font:inherit;color:inherit;background:inherit;border:0;padding:10px;display:block
    }
    .day.fc-clickable-day:hover{outline:2px solid rgba(114,87,255,.28);outline-offset:-2px}
    .fc-day-summary{margin-top:6px;font-size:12px}.fc-day-summary strong{display:block}
    .fc-mail-card{margin-top:16px}
    .fc-mail-status{display:flex;align-items:center;gap:10px;margin:10px 0 18px}
    .fc-mail-dot{width:10px;height:10px;border-radius:50%;background:#aaa}
    .fc-mail-dot.ok{background:#28a745}
    .fc-mail-help{font-size:12px;color:#666;margin-top:8px;line-height:1.45}
  `;
  document.head.appendChild(style);

  async function sendConfirmationEmail(eventObj) {
    if (!eventObj || eventObj.status !== 'Confirmada') return;
    if (eventObj.emailConfirmationSentAt) return;

    const email = String(eventObj.email || '').trim();
    if (!email) {
      try { toast('Falta cargar el email del cliente'); } catch (_) {}
      return;
    }

    try {
      const r = await fetch('/api/email-confirmation', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          eventId: eventObj.id,
          salonId: eventObj.salonId
        }),
        cache: 'no-store'
      });

      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) throw new Error(res.error || ('HTTP ' + r.status));

      eventObj.emailConfirmationSentAt = res.sentAt || new Date().toISOString();
      eventObj.emailConfirmationError = '';
      if (typeof save === 'function') save();
      try { toast('Fiesta confirmada y email enviado'); } catch (_) {}
    } catch (err) {
      eventObj.emailConfirmationError = String(err?.message || err);
      if (typeof save === 'function') save();
      try { toast(err?.message || 'No se pudo enviar el email'); } catch (_) {}
      console.error('Email confirmación:', err);
    }
  }

  // Formulario de fiesta: usa Email del cliente.
  const originalOpenEventForm = window.openEventForm;
  if (typeof originalOpenEventForm === 'function') {
    window.openEventForm = function (eid) {
      const existing = eid ? getEvent(eid) : null;
      const previousStatus = existing?.status || '';
      const beforeIds = new Set((data.events || []).map(e => e.id));

      originalOpenEventForm(eid);

      const form = document.querySelector('#event-form');
      if (!form) return;

      const emailInput = form.querySelector('input[name="phone"]');
      if (emailInput) {
        emailInput.name = 'email';
        emailInput.type = 'email';
        emailInput.placeholder = 'cliente@gmail.com';
        emailInput.value = existing?.email || '';
        const field = emailInput.closest('.field');
        const label = field?.querySelector('label');
        if (label) label.textContent = 'Email del cliente';
      }

      const originalSubmit = form.onsubmit;
      form.onsubmit = function (ev) {
        const snapshot = Object.fromEntries(new FormData(form));

        if (snapshot.status === 'Confirmada' && !String(snapshot.email || '').trim()) {
          ev.preventDefault();
          toast('Para confirmar, cargá el email del cliente');
          form.querySelector('input[name="email"]')?.focus();
          return false;
        }

        const shouldNotify =
          snapshot.status === 'Confirmada' &&
          previousStatus !== 'Confirmada';

        const result = originalSubmit ? originalSubmit.call(form, ev) : undefined;

        if (shouldNotify) {
          let target = eid ? getEvent(eid) : null;
          if (!target) target = (data.events || []).find(e => !beforeIds.has(e.id)) || null;
          if (target) setTimeout(() => sendConfirmationEmail(target), 100);
        }
        return result;
      };
    };
  }

  // Agenda: click en fecha -> popup con ocupación.
  function openAgendaDay(dateKey) {
    const events = (typeof se === 'function' ? se() : (data.events || []))
      .filter(e => e.date === dateKey && !['Cancelada','Finalizada'].includes(e.status))
      .sort((a,b) => String(a.start || '').localeCompare(String(b.start || '')));

    const titleDate = typeof fmtDate === 'function' ? fmtDate(dateKey) : dateKey;

    if (!events.length) {
      showModal(`
        <div class="modal-title">
          <div><h2>📅 ${safeEsc(titleDate)}</h2><p>Día disponible</p></div>
          <button class="ghost small" onclick="closeModal()">✕</button>
        </div>
        <div class="empty">No hay reservas cargadas para esta fecha.</div>
        <div class="form-actions">
          <button class="ghost" onclick="closeModal()">Cerrar</button>
          <button class="primary" id="fc-new-on-day">+ Nueva fiesta</button>
        </div>
      `);
      document.querySelector('#fc-new-on-day')?.addEventListener('click', () => {
        closeModal(); window.openEventForm();
        const inp=document.querySelector('#event-form input[name="date"]');
        if(inp) inp.value=dateKey;
      });
      return;
    }

    const rows = events.map(e => `
      <button class="today-event-row" type="button" data-fc-event="${safeEsc(e.id)}">
        <span class="today-time">${safeEsc(e.start||'--:--')}–${safeEsc(e.end||'--:--')}</span>
        <span><b>${safeEsc(e.child||'Fiesta')}</b><small>${safeEsc(e.client||'')} · ${safeEsc(e.status||'')}</small></span>
        <strong>Ver →</strong>
      </button>
    `).join('');

    showModal(`
      <div class="modal-title">
        <div><h2>📅 ${safeEsc(titleDate)}</h2>
        <p>${events.length} reserva${events.length===1?'':'s'} / horario${events.length===1?'':'s'} ocupado${events.length===1?'':'s'}</p></div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>
      <div class="today-modal-list">${rows}</div>
      <div class="form-actions">
        <button class="ghost" onclick="closeModal()">Cerrar</button>
        <button class="primary" id="fc-new-on-day">+ Agregar otra fiesta</button>
      </div>
    `);

    document.querySelectorAll('[data-fc-event]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id=btn.getAttribute('data-fc-event');
        closeModal(); if(typeof openEvent==='function') openEvent(id);
      });
    });
    document.querySelector('#fc-new-on-day')?.addEventListener('click', () => {
      closeModal(); window.openEventForm();
      const inp=document.querySelector('#event-form input[name="date"]');
      if(inp) inp.value=dateKey;
    });
  }
  window.openAgendaDay=openAgendaDay;

  if (typeof renderCalendar === 'function') {
    window.renderCalendar = renderCalendar = function () {
      setTitle('Agenda','Disponibilidad y ocupación del salón');
      const d=new Date(2026,8,1), first=d.getDay(), days=new Date(2026,9,0).getDate(), cells=[];
      for(let i=0;i<first;i++) cells.push('<div class="day off"></div>');
      for(let n=1;n<=days;n++){
        const ds=`2026-09-${String(n).padStart(2,'0')}`;
        const events=se().filter(e=>e.date===ds&&!['Cancelada','Finalizada'].includes(e.status))
          .sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
        cells.push(`
          <button type="button" class="day fc-clickable-day" onclick="openAgendaDay('${ds}')">
            <div class="day-number">${n}</div>
            ${events.length
              ? `<div class="fc-day-summary"><strong>${events.length} reserva${events.length===1?'':'s'}</strong>${events.slice(0,2).map(e=>`<span class="event-chip">${safeEsc(e.start)} · ${safeEsc(e.child)}</span>`).join('')}</div>`
              : '<small class="muted">Disponible</small>'}
          </button>
        `);
      }
      document.querySelector('#content').innerHTML=`
        <div class="card">
          <div class="calendar-head"><h3>Septiembre 2026</h3><div><span class="pill confirmada">Reservado</span> <span class="pill consulta">Consulta</span></div></div>
          <div class="calendar">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(x=>`<div class="weekday">${x}</div>`).join('')}${cells.join('')}</div>
        </div>`;
    };
  }

  // Borrado protegido.
  const originalOpenEvent = window.openEvent;
  if (typeof originalOpenEvent === 'function') {
    window.openEvent = function (eid) {
      originalOpenEvent(eid);
      const toolbar=document.querySelector('#modal-body .toolbar');
      if(!toolbar || toolbar.querySelector('[data-fc-delete-event]')) return;
      const btn=document.createElement('button');
      btn.type='button'; btn.className='danger small'; btn.setAttribute('data-fc-delete-event','1');
      btn.textContent='🗑 Borrar fiesta'; btn.onclick=()=>window.confirmDeleteEvent(eid); toolbar.appendChild(btn);
    };
  }

  window.confirmDeleteEvent = function (eid) {
    const ev=getEvent(eid); if(!ev)return;
    showModal(`
      <div class="modal-title">
        <div><h2>🗑 Borrar fiesta</h2><p>${safeEsc(ev.child||'Fiesta')} · ${safeEsc(typeof fmtDate==='function'?fmtDate(ev.date):ev.date)}</p></div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>
      <p><b>Esta acción no se puede deshacer.</b></p>
      <form id="fc-delete-event-form">
        <div class="field"><label>Contraseña del salón</label><input type="password" name="password" required autocomplete="current-password"></div>
        <div class="form-actions"><button type="button" class="ghost" onclick="openEvent('${safeEsc(eid)}')">Cancelar</button><button type="submit" class="danger">Borrar definitivamente</button></div>
      </form>`);
    const form=document.querySelector('#fc-delete-event-form');
    form.onsubmit=async function(e){
      e.preventDefault();
      const password=String(new FormData(form).get('password')||'');
      const r=await fetch('/api/delete-event',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({eventId:eid,salonId:ev.salonId,password}),cache:'no-store'});
      const res=await r.json().catch(()=>({}));
      if(!r.ok||!res.ok){toast(res.error||'No se pudo borrar la fiesta');return;}
      data=res.state; closeModal(); toast('Fiesta borrada'); renderSalonShell();
    };
  };

  // -------------------------------
  // Email propio de cada salón - Gmail / Outlook / Yahoo / Otro SMTP
  // -------------------------------
  const FC_EMAIL_PRESETS = {
    gmail:   {host:'smtp.gmail.com', port:'587', security:'starttls'},
    outlook: {host:'smtp-mail.outlook.com', port:'587', security:'starttls'},
    yahoo:   {host:'smtp.mail.yahoo.com', port:'465', security:'ssl'},
    other:   {host:'', port:'587', security:'starttls'}
  };

  function applyEmailProviderPreset(form) {
    const provider = form.querySelector('[name="provider"]')?.value || 'gmail';
    const p = FC_EMAIL_PRESETS[provider] || FC_EMAIL_PRESETS.other;
    const host = form.querySelector('[name="smtpHost"]');
    const port = form.querySelector('[name="smtpPort"]');
    const security = form.querySelector('[name="smtpSecurity"]');
    const custom = provider === 'other';

    if (!custom) {
      if (host) host.value = p.host;
      if (port) port.value = p.port;
      if (security) security.value = p.security;
    }

    [host, port, security].forEach(el => {
      if (!el) return;
      el.disabled = !custom;
      el.closest('.field')?.classList.toggle('muted', !custom);
    });

    const passLabel = form.querySelector('[data-fc-mail-pass-label]');
    if (passLabel) {
      passLabel.textContent =
        provider === 'gmail' ? 'Contraseña de aplicación de Google' :
        provider === 'outlook' ? 'Contraseña / clave de aplicación de Outlook' :
        provider === 'yahoo' ? 'Contraseña de aplicación de Yahoo' :
        'Contraseña SMTP / clave de aplicación';
    }
  }

  async function loadSalonEmailStatus() {
    const s = salon();
    if (!s) return;
    try {
      const r = await fetch(`/api/salon-email?salonId=${encodeURIComponent(s.id)}`, {cache:'no-store'});
      const res = await r.json();

      const dot = document.querySelector('#fc-mail-dot');
      const text = document.querySelector('#fc-mail-status-text');
      const current = document.querySelector('#fc-mail-current');

      if (dot) dot.classList.toggle('ok', !!res.configured);
      if (text) text.textContent = res.configured ? 'Configurado' : 'Sin configurar';
      if (current) {
        const providerName = {
          gmail:'Gmail', outlook:'Outlook / Hotmail', yahoo:'Yahoo', other:'Otro SMTP'
        }[res.provider] || '';
        current.textContent = res.email ? `${res.email}${providerName ? ' · ' + providerName : ''}` : '';
      }

      const form = document.querySelector('#fc-mail-form');
      if (form && res.configured) {
        if (res.provider) form.querySelector('[name="provider"]').value = res.provider;
        if (res.email) form.querySelector('[name="email"]').value = res.email;
        applyEmailProviderPreset(form);

        if (res.provider === 'other') {
          if (res.smtpHost) form.querySelector('[name="smtpHost"]').value = res.smtpHost;
          if (res.smtpPort) form.querySelector('[name="smtpPort"]').value = String(res.smtpPort);
          if (res.smtpSecurity) form.querySelector('[name="smtpSecurity"]').value = res.smtpSecurity;
        }
      }
    } catch (_) {}
  }

  function appendEmailSettings() {
    if (session?.role !== 'salon') return;
    const content = document.querySelector('#content');
    if (!content || document.querySelector('#fc-mail-settings')) return;

    const s = salon();
    const card = document.createElement('div');
    card.className = 'card fc-mail-card';
    card.id = 'fc-mail-settings';
    card.innerHTML = `
      <div class="section-title">
        <div>
          <h3>✉️ Correo para confirmaciones</h3>
          <small class="muted">Cada salón puede enviar desde Gmail, Outlook/Hotmail, Yahoo o cualquier cuenta con SMTP.</small>
        </div>
      </div>

      <div class="fc-mail-status">
        <span id="fc-mail-dot" class="fc-mail-dot"></span>
        <div>
          <b id="fc-mail-status-text">Comprobando...</b>
          <small id="fc-mail-current" class="muted" style="display:block"></small>
        </div>
      </div>

      <form id="fc-mail-form">
        <div class="form-grid">
          <div class="field">
            <label>Proveedor</label>
            <select name="provider">
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook / Hotmail</option>
              <option value="yahoo">Yahoo</option>
              <option value="other">Otro correo / SMTP</option>
            </select>
          </div>

          <div class="field">
            <label>Email remitente</label>
            <input name="email" type="email" required placeholder="reservas@tusalon.com">
          </div>

          <div class="field">
            <label>Servidor SMTP</label>
            <input name="smtpHost" required placeholder="smtp.tuproveedor.com">
          </div>

          <div class="field">
            <label>Puerto</label>
            <input name="smtpPort" type="number" min="1" max="65535" required value="587">
          </div>

          <div class="field">
            <label>Seguridad</label>
            <select name="smtpSecurity">
              <option value="starttls">STARTTLS / TLS</option>
              <option value="ssl">SSL</option>
              <option value="none">Sin cifrado</option>
            </select>
          </div>

          <div class="field">
            <label data-fc-mail-pass-label>Contraseña / clave de aplicación</label>
            <input name="appPassword" type="password" required autocomplete="new-password">
          </div>

          <div class="field span2">
            <label>Contraseña de FiestaControl</label>
            <input name="salonPassword" type="password" required autocomplete="current-password">
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="secondary" id="fc-mail-test">Enviar prueba</button>
          <button class="primary">Guardar correo</button>
        </div>

        <p class="fc-mail-help">
          La clave del correo se guarda fuera de los datos visibles del salón. Algunos proveedores exigen
          una contraseña de aplicación y otros pueden bloquear el acceso SMTP con usuario/contraseña.
        </p>
      </form>
    `;

    content.appendChild(card);

    const form = card.querySelector('#fc-mail-form');
    form.querySelector('[name="provider"]').onchange = () => applyEmailProviderPreset(form);
    applyEmailProviderPreset(form);

    form.onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));

      // Los campos deshabilitados no entran en FormData; recuperamos sus valores.
      f.smtpHost = form.querySelector('[name="smtpHost"]').value;
      f.smtpPort = form.querySelector('[name="smtpPort"]').value;
      f.smtpSecurity = form.querySelector('[name="smtpSecurity"]').value;

      const r = await fetch('/api/salon-email', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          salonId:s.id,
          provider:f.provider,
          email:f.email,
          smtpHost:f.smtpHost,
          smtpPort:f.smtpPort,
          smtpSecurity:f.smtpSecurity,
          appPassword:f.appPassword,
          salonPassword:f.salonPassword
        }),
        cache:'no-store'
      });

      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) {
        toast(res.error || 'No se pudo guardar');
        return;
      }

      form.querySelector('[name="appPassword"]').value = '';
      form.querySelector('[name="salonPassword"]').value = '';
      toast('Correo del salón configurado');
      loadSalonEmailStatus();
    };

    card.querySelector('#fc-mail-test').onclick = async () => {
      const salonPassword = form.querySelector('[name="salonPassword"]').value;
      if (!salonPassword) {
        toast('Ingresá la contraseña de FiestaControl');
        return;
      }

      const r = await fetch('/api/salon-email-test', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({salonId:s.id, salonPassword}),
        cache:'no-store'
      });

      const res = await r.json().catch(() => ({}));
      toast(res.ok ? 'Email de prueba enviado' : (res.error || 'No se pudo enviar la prueba'));
    };

    loadSalonEmailStatus();
  }

  if (typeof renderProfile === 'function') {
    const originalRenderProfile = renderProfile;
    renderProfile = function () {
      originalRenderProfile();
      setTimeout(appendEmailSettings, 0);
    };
  }

})();


// ============================================================
// PERSONAL POR EVENTO + GASTOS AUTOMÁTICOS + CIERRE DE FIESTAS
// ============================================================
(function () {
  'use strict';

  function fcStaffForSalon() {
    return (data.staff || []).filter(x => x.salonId === session?.salonId);
  }

  function fcEventAssignments(eventId) {
    return (data.assignments || []).filter(a => a.eventId === eventId);
  }

  function fcStaffExpense(eventId) {
    return fcEventAssignments(eventId).reduce((sum, a) => sum + Number(a.amount || 0), 0);
  }

  function fcSupplierExpense(eventId) {
    return (data.orders || [])
      .filter(o => o.eventId === eventId)
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);
  }

  function fcAssignedStaff(eventId) {
    return fcEventAssignments(eventId).map(a => {
      const person = (data.staff || []).find(s => s.id === a.staffId);
      return {assignment:a, person};
    }).filter(x => x.person);
  }

  function fcEventIsPast(e) {
    if (!e?.date) return false;
    if (!['Confirmada','Señada'].includes(e.status)) return false;
    try {
      const end = e.end || '23:59';
      return new Date(`${e.date}T${end}:00`).getTime() < Date.now();
    } catch (_) {
      return false;
    }
  }

  function fcPendingClosureEvents() {
    return (typeof se === 'function' ? se() : (data.events || []))
      .filter(fcEventIsPast)
      .sort((a,b) => (`${a.date} ${a.end||''}`).localeCompare(`${b.date} ${b.end||''}`));
  }

  function fcSyncAssignments(eventId, selectedStaffIds) {
    data.assignments = data.assignments || [];
    const selected = new Set(selectedStaffIds || []);
    const event = (data.events || []).find(e => e.id === eventId);
    const finalized = event?.status === 'Finalizada';

    // Quita del evento a quienes ya no fueron seleccionados.
    data.assignments = data.assignments.filter(a => {
      if (a.eventId !== eventId) return true;
      return selected.has(a.staffId);
    });

    // Crea/actualiza asignaciones seleccionadas.
    selected.forEach(staffId => {
      const person = (data.staff || []).find(s => s.id === staffId);
      if (!person) return;

      let a = (data.assignments || []).find(x => x.eventId === eventId && x.staffId === staffId);
      if (!a) {
        data.assignments.push({
          id: id(),
          salonId: session.salonId,
          eventId,
          staffId,
          amount: Number(person.defaultFee || 0),
          paid: false
        });
      } else if (!finalized) {
        a.amount = Number(person.defaultFee || 0);
      }
    });
  }

  // ---------------- PERSONAL ----------------
  renderStaff = function () {
    setTitle('Personal','Equipo, cargos y costo por fiesta');
    const st = fcStaffForSalon();

    $('#content').innerHTML = `
      <div class="toolbar">
        <button class="primary" onclick="openStaffForm()">+ Agregar personal</button>
      </div>

      <div class="card table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cargo</th>
              <th>WhatsApp</th>
              <th>Costo por fiesta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${st.map(s => `
              <tr>
                <td><b>${esc(s.name)}</b></td>
                <td>${esc(s.role || '-')}</td>
                <td>${esc(s.phone || '-')}</td>
                <td><b>${money(s.defaultFee || 0)}</b></td>
                <td><button class="secondary small" onclick="openStaffForm('${s.id}')">Editar</button></td>
              </tr>
            `).join('') || `<tr><td colspan="5"><div class="empty">Todavía no cargaste personal.</div></td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <h3>Cómo funciona</h3>
        </div>
        <p class="muted">
          Cuando asignás personal a una fiesta, FiestaControl toma automáticamente el costo por fiesta
          y lo suma como gasto del evento. Si cambiás el costo acá, se actualiza en las fiestas todavía no finalizadas.
        </p>
      </div>
    `;
  };

  window.openStaffForm = function (staffId) {
    const person = staffId ? (data.staff || []).find(s => s.id === staffId) : null;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>${person ? 'Editar personal' : 'Agregar personal'}</h2>
          <p>Datos y costo habitual por fiesta</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="fc-staff-form">
        <div class="form-grid">
          <div class="field">
            <label>Nombre</label>
            <input name="name" required value="${esc(person?.name || '')}">
          </div>
          <div class="field">
            <label>Cargo</label>
            <input name="role" required placeholder="Moza, animador, coordinador..." value="${esc(person?.role || '')}">
          </div>
          <div class="field">
            <label>WhatsApp</label>
            <input name="phone" placeholder="11..." value="${esc(person?.phone || '')}">
          </div>
          <div class="field">
            <label>Costo por fiesta</label>
            <input name="defaultFee" type="number" min="0" step="1" required value="${Number(person?.defaultFee || 0)}">
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">${person ? 'Guardar cambios' : 'Agregar personal'}</button>
        </div>
      </form>
    `);

    $('#fc-staff-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      f.defaultFee = Number(f.defaultFee || 0);

      if (person) {
        Object.assign(person, f);

        // Actualiza el valor en eventos todavía abiertos/no finalizados.
        (data.assignments || []).forEach(a => {
          if (a.staffId !== person.id) return;
          const event = (data.events || []).find(e => e.id === a.eventId);
          if (event && event.status !== 'Finalizada') {
            a.amount = f.defaultFee;
          }
        });
      } else {
        data.staff.push({
          id:id(),
          salonId:session.salonId,
          ...f
        });
      }

      save();
      closeModal();
      toast(person ? 'Personal actualizado' : 'Personal agregado');
      renderSalonShell();
    };
  };

  // -------- PERSONAL DENTRO DE LA RESERVA / FIESTA --------
  const fcPreviousOpenEventForm = window.openEventForm;

  window.openEventForm = function (eid) {
    const beforeIds = new Set((data.events || []).map(e => e.id));
    const existing = eid ? (data.events || []).find(e => e.id === eid) : null;
    const selectedBefore = new Set(
      existing ? fcEventAssignments(existing.id).map(a => a.staffId) : []
    );

    fcPreviousOpenEventForm(eid);

    const form = document.querySelector('#event-form');
    if (!form) return;

    const staff = fcStaffForSalon();
    const actions = form.querySelector('.form-actions');

    const block = document.createElement('div');
    block.className = 'field span2';
    block.style.marginTop = '8px';
    block.innerHTML = `
      <label>Personal a cargo de la fiesta</label>
      ${
        staff.length
          ? `<div class="card" style="padding:12px;margin-top:6px">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
                ${staff.map(p => `
                  <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:10px;cursor:pointer">
                    <input type="checkbox" name="fcStaffId" value="${esc(p.id)}" ${selectedBefore.has(p.id) ? 'checked' : ''}>
                    <span>
                      <b>${esc(p.name)}</b>
                      <small style="display:block">${esc(p.role || '')} · ${money(p.defaultFee || 0)}</small>
                    </span>
                  </label>
                `).join('')}
              </div>
              <small class="muted" style="display:block;margin-top:10px">
                Podés seleccionar una persona o todas las que necesites. El gasto se calcula automáticamente.
              </small>
            </div>`
          : `<div class="empty" style="margin-top:6px">
              Primero cargá el personal desde la solapa Personal.
            </div>`
      }
    `;

    if (actions) actions.before(block);

    const originalSubmit = form.onsubmit;
    form.onsubmit = function (ev) {
      const selectedStaffIds = [...form.querySelectorAll('input[name="fcStaffId"]:checked')]
        .map(i => i.value);

      const result = originalSubmit ? originalSubmit.call(form, ev) : undefined;

      // El formulario original ya creó/actualizó el evento.
      setTimeout(() => {
        let target = eid ? (data.events || []).find(e => e.id === eid) : null;
        if (!target) target = (data.events || []).find(e => !beforeIds.has(e.id)) || null;
        if (!target) return;

        fcSyncAssignments(target.id, selectedStaffIds);
        save();
      }, 0);

      return result;
    };
  };

  // ---------------- DETALLE DE FIESTA ----------------
  const fcPreviousOpenEvent = window.openEvent;

  window.openEvent = function (eid) {
    fcPreviousOpenEvent(eid);

    const e = (data.events || []).find(x => x.id === eid);
    if (!e) return;

    const assigned = fcAssignedStaff(eid);
    const staffCost = fcStaffExpense(eid);
    const supplierCost = fcSupplierExpense(eid);
    const totalExpenses = staffCost + supplierCost;
    const estimatedNet = Number(e.total || 0) - totalExpenses;

    const modalBody = document.querySelector('#modal-body');
    if (!modalBody || modalBody.querySelector('[data-fc-event-costs]')) return;

    const section = document.createElement('div');
    section.setAttribute('data-fc-event-costs','1');
    section.innerHTML = `
      <div class="card" style="margin-top:16px">
        <div class="section-title"><h3>👥 Personal asignado</h3></div>
        ${
          assigned.length
            ? `<div class="list">
                ${assigned.map(({assignment,person}) => `
                  <div class="list-item">
                    <div>
                      <strong>${esc(person.name)}</strong>
                      <small>${esc(person.role || '')}${person.phone ? ' · ' + esc(person.phone) : ''}</small>
                    </div>
                    <b>${money(assignment.amount || 0)}</b>
                  </div>
                `).join('')}
              </div>`
            : `<div class="empty">No hay personal asignado a esta fiesta.</div>`
        }
      </div>

      <div class="grid stats" style="grid-template-columns:repeat(3,1fr);margin-top:16px">
        <div class="card">
          <small class="muted">Gasto personal</small>
          <strong>${money(staffCost)}</strong>
        </div>
        <div class="card">
          <small class="muted">Proveedores</small>
          <strong>${money(supplierCost)}</strong>
        </div>
        <div class="card">
          <small class="muted">Resultado estimado</small>
          <strong class="${estimatedNet < 0 ? 'bad' : 'good'}">${money(estimatedNet)}</strong>
        </div>
      </div>

      ${
        fcEventIsPast(e)
          ? `<div class="card" style="margin-top:16px;border:2px solid rgba(230,150,30,.35)">
              <div class="section-title">
                <div>
                  <h3>⏳ Pendiente de finalizar</h3>
                  <small class="muted">El horario de esta fiesta ya terminó. Falta cerrar los números.</small>
                </div>
                <button class="primary" onclick="openFinalizeEvent('${esc(eid)}')">Finalizar fiesta</button>
              </div>
            </div>`
          : ''
      }
    `;

    modalBody.appendChild(section);
  };

  // ---------------- CIERRE DE NÚMEROS ----------------
  window.openFinalizeEvent = function (eid) {
    const e = (data.events || []).find(x => x.id === eid);
    if (!e) return;

    const staffCost = fcStaffExpense(eid);
    const supplierCost = fcSupplierExpense(eid);
    const expenses = staffCost + supplierCost;
    const total = Number(e.total || 0);
    const paid = Number(e.paid || 0);
    const balance = total - paid;
    const net = total - expenses;
    const assigned = fcAssignedStaff(eid);

    showModal(`
      <div class="modal-title">
        <div>
          <h2>✅ Finalizar fiesta</h2>
          <p>${esc(e.child)} · ${fmtDate(e.date)} · ${esc(e.start || '')} a ${esc(e.end || '')}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <div class="grid stats" style="grid-template-columns:repeat(2,1fr)">
        <div class="card"><small class="muted">Total de la fiesta</small><strong>${money(total)}</strong></div>
        <div class="card"><small class="muted">Cobrado</small><strong class="good">${money(paid)}</strong></div>
        <div class="card"><small class="muted">Saldo del cliente</small><strong class="${balance ? 'bad' : 'good'}">${money(balance)}</strong></div>
        <div class="card"><small class="muted">Costo de personal</small><strong>${money(staffCost)}</strong></div>
        <div class="card"><small class="muted">Costo proveedores</small><strong>${money(supplierCost)}</strong></div>
        <div class="card"><small class="muted">Resultado estimado</small><strong class="${net < 0 ? 'bad' : 'good'}">${money(net)}</strong></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title"><h3>Personal del evento</h3></div>
        ${
          assigned.length
            ? assigned.map(({assignment,person}) => `
                <div class="list-item">
                  <div><strong>${esc(person.name)}</strong><small>${esc(person.role || '')}</small></div>
                  <b>${money(assignment.amount || 0)}</b>
                </div>
              `).join('')
            : `<div class="empty">Sin personal asignado.</div>`
        }
      </div>

      <div class="admin-notice attention" style="margin-top:16px">
        <span>ℹ️</span>
        <div>
          <b>Al finalizar se cerrarán los números de esta fiesta.</b>
          <small>El evento pasará a estado Finalizada y se guardará una foto de estos importes.</small>
        </div>
      </div>

      <div class="form-actions">
        <button class="ghost" onclick="openEvent('${esc(eid)}')">Volver</button>
        <button class="primary" id="fc-confirm-finalize">Finalizar y cerrar números</button>
      </div>
    `);

    document.querySelector('#fc-confirm-finalize').onclick = () => {
      e.status = 'Finalizada';
      e.closedAt = new Date().toISOString();
      e.finalNumbers = {
        total,
        paid,
        balance,
        staffCost,
        supplierCost,
        expenses,
        net,
        closedAt:e.closedAt
      };

      save();
      closeModal();
      toast('Fiesta finalizada y números cerrados');
      renderSalonShell();
    };
  };

  // ---------------- AVISO EN INICIO ----------------
  const fcOriginalRenderDashboard = renderDashboard;

  renderDashboard = function () {
    fcOriginalRenderDashboard();

    const pending = fcPendingClosureEvents();
    if (!pending.length) return;

    const content = document.querySelector('#content');
    if (!content || document.querySelector('#fc-pending-closure')) return;

    const box = document.createElement('div');
    box.id = 'fc-pending-closure';
    box.className = 'card';
    box.style.marginBottom = '16px';
    box.style.border = '2px solid rgba(230,150,30,.35)';
    box.innerHTML = `
      <div class="section-title">
        <div>
          <h3>⏳ ${pending.length} fiesta${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'} de finalizar</h3>
          <small class="muted">El día y horario ya pasaron. Revisá y cerrá los números.</small>
        </div>
      </div>
      <div class="list">
        ${pending.map(e => `
          <div class="list-item">
            <div>
              <strong>${esc(e.child)}</strong>
              <small>${fmtDate(e.date)} · ${esc(e.start || '')} a ${esc(e.end || '')} · ${esc(e.client || '')}</small>
            </div>
            <button class="primary small" onclick="openFinalizeEvent('${esc(e.id)}')">Finalizar</button>
          </div>
        `).join('')}
      </div>
    `;

    content.prepend(box);
  };

})();


// ============================================================
// ADICIONALES DEL SALÓN + SUMA AUTOMÁTICA EN LA RESERVA
// ============================================================
(function () {
  'use strict';

  data.salonExtras = data.salonExtras || [];

  function fcExtrasForSalon() {
    return (data.salonExtras || []).filter(x => x.salonId === session?.salonId);
  }

  function fcSelectedExtrasTotal(items) {
    return (items || []).reduce((sum, x) => sum + Number(x.amount || 0), 0);
  }

  function fcOpenExtraForm(extraId) {
    const extra = extraId ? (data.salonExtras || []).find(x => x.id === extraId) : null;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>${extra ? 'Editar adicional' : 'Nuevo adicional'}</h2>
          <p>Servicios extra que el salón puede sumar a una reserva.</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="fc-extra-form">
        <div class="form-grid">
          <div class="field">
            <label>Nombre del adicional</label>
            <input name="name" required placeholder="Ej: Mago, catering, inflable" value="${esc(extra?.name || '')}">
          </div>
          <div class="field">
            <label>Precio</label>
            <input name="amount" type="number" min="0" step="1" required value="${Number(extra?.amount || 0)}">
          </div>
          <div class="field span2">
            <label>Descripción opcional</label>
            <input name="description" placeholder="Detalle del servicio" value="${esc(extra?.description || '')}">
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">${extra ? 'Guardar cambios' : 'Agregar adicional'}</button>
        </div>
      </form>
    `);

    document.querySelector('#fc-extra-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      f.amount = Number(f.amount || 0);

      if (extra) {
        Object.assign(extra, f);
      } else {
        data.salonExtras.push({
          id:id(),
          salonId:session.salonId,
          ...f
        });
      }

      save();
      closeModal();
      toast(extra ? 'Adicional actualizado' : 'Adicional agregado');
      renderSalonShell();
    };
  }

  window.openExtraForm = fcOpenExtraForm;

  window.deleteSalonExtra = function (extraId) {
    const extra = (data.salonExtras || []).find(x => x.id === extraId);
    if (!extra) return;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>Eliminar adicional</h2>
          <p>${esc(extra.name)}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <p>Esto lo quitará del catálogo para nuevas reservas. Las fiestas ya guardadas conservarán el adicional y su importe.</p>

      <div class="form-actions">
        <button class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="danger" id="fc-delete-extra-confirm">Eliminar</button>
      </div>
    `);

    document.querySelector('#fc-delete-extra-confirm').onclick = () => {
      data.salonExtras = (data.salonExtras || []).filter(x => x.id !== extraId);
      save();
      closeModal();
      toast('Adicional eliminado');
      renderSalonShell();
    };
  };

  function fcAppendExtrasSettings() {
    if (session?.role !== 'salon') return;
    const content = document.querySelector('#content');
    if (!content || document.querySelector('#fc-extras-settings')) return;

    const extras = fcExtrasForSalon();
    const card = document.createElement('div');
    card.id = 'fc-extras-settings';
    card.className = 'card';
    card.style.marginTop = '16px';

    card.innerHTML = `
      <div class="section-title">
        <div>
          <h3>➕ Adicionales de las fiestas</h3>
          <small class="muted">Creá servicios extras para poder sumarlos después a cada reserva.</small>
        </div>
        <button class="primary small" onclick="openExtraForm()">+ Nuevo adicional</button>
      </div>

      ${
        extras.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Adicional</th>
                    <th>Descripción</th>
                    <th>Precio</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${extras.map(x => `
                    <tr>
                      <td><b>${esc(x.name)}</b></td>
                      <td>${esc(x.description || '-')}</td>
                      <td><b>${money(x.amount || 0)}</b></td>
                      <td style="white-space:nowrap">
                        <button class="secondary small" onclick="openExtraForm('${esc(x.id)}')">Editar</button>
                        <button class="danger small" onclick="deleteSalonExtra('${esc(x.id)}')">Borrar</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="empty">
              Todavía no cargaste adicionales. Ejemplos: Mago, Catering, Inflable.
            </div>`
      }
    `;

    content.appendChild(card);
  }

  // Agrega el catálogo a Mi salón.
  if (typeof renderProfile === 'function') {
    const fcPreviousRenderProfileExtras = renderProfile;
    renderProfile = function () {
      fcPreviousRenderProfileExtras();
      setTimeout(fcAppendExtrasSettings, 0);
    };
  }

  // Agrega selección de adicionales a Nueva/Editar fiesta.
  const fcPreviousOpenEventFormExtras = window.openEventForm;

  window.openEventForm = function (eid) {
    const existing = eid ? (data.events || []).find(e => e.id === eid) : null;
    const previousExtras = existing?.extras || [];
    const previousExtraIds = new Set(previousExtras.map(x => x.id));
    const previousExtrasTotal = fcSelectedExtrasTotal(previousExtras);

    fcPreviousOpenEventFormExtras(eid);

    const form = document.querySelector('#event-form');
    if (!form) return;

    const totalInput = form.querySelector('input[name="total"]');
    if (!totalInput) return;

    // "total" pasa a representar el precio base en pantalla.
    const totalField = totalInput.closest('.field');
    const totalLabel = totalField?.querySelector('label');
    if (totalLabel) totalLabel.textContent = 'Precio base de la fiesta';

    const inferredBase = existing
      ? Number(existing.baseTotal ?? (Number(existing.total || 0) - previousExtrasTotal))
      : Number(totalInput.value || 0);

    totalInput.value = Number.isFinite(inferredBase) ? Math.max(0, inferredBase) : 0;

    const extras = fcExtrasForSalon();
    const actions = form.querySelector('.form-actions');

    const block = document.createElement('div');
    block.className = 'field span2';
    block.style.marginTop = '8px';
    block.innerHTML = `
      <label>Adicionales</label>

      ${
        extras.length
          ? `<div class="card" style="padding:12px;margin-top:6px">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
                ${extras.map(x => `
                  <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:10px;cursor:pointer">
                    <input
                      type="checkbox"
                      name="fcExtraId"
                      value="${esc(x.id)}"
                      data-amount="${Number(x.amount || 0)}"
                      ${previousExtraIds.has(x.id) ? 'checked' : ''}
                    >
                    <span>
                      <b>${esc(x.name)}</b>
                      <small style="display:block">${esc(x.description || '')}${x.description ? ' · ' : ''}${money(x.amount || 0)}</small>
                    </span>
                  </label>
                `).join('')}
              </div>
            </div>`
          : `<div class="empty" style="margin-top:6px">
              No hay adicionales cargados. Podés crearlos desde Mi salón.
            </div>`
      }

      <div class="grid stats" style="grid-template-columns:repeat(3,1fr);margin-top:12px">
        <div class="card">
          <small class="muted">Precio base</small>
          <strong id="fc-extra-base">${money(inferredBase)}</strong>
        </div>
        <div class="card">
          <small class="muted">Adicionales</small>
          <strong id="fc-extra-total">${money(previousExtrasTotal)}</strong>
        </div>
        <div class="card">
          <small class="muted">Total reserva</small>
          <strong id="fc-grand-total">${money(inferredBase + previousExtrasTotal)}</strong>
        </div>
      </div>
    `;

    if (actions) actions.before(block);

    function recalcExtras() {
      const base = Number(totalInput.value || 0);
      const selected = [...form.querySelectorAll('input[name="fcExtraId"]:checked')];
      const extrasTotal = selected.reduce((sum, el) => sum + Number(el.dataset.amount || 0), 0);

      const baseEl = document.querySelector('#fc-extra-base');
      const extrasEl = document.querySelector('#fc-extra-total');
      const grandEl = document.querySelector('#fc-grand-total');

      if (baseEl) baseEl.textContent = money(base);
      if (extrasEl) extrasEl.textContent = money(extrasTotal);
      if (grandEl) grandEl.textContent = money(base + extrasTotal);
    }

    totalInput.addEventListener('input', recalcExtras);
    form.querySelectorAll('input[name="fcExtraId"]').forEach(el => {
      el.addEventListener('change', recalcExtras);
    });

    const originalSubmit = form.onsubmit;

    form.onsubmit = function (ev) {
      const selectedIds = [...form.querySelectorAll('input[name="fcExtraId"]:checked')]
        .map(el => el.value);

      const baseTotal = Number(totalInput.value || 0);
      const selectedExtras = selectedIds.map(extraId => {
        const x = (data.salonExtras || []).find(e => e.id === extraId);
        return x ? {
          id:x.id,
          name:x.name,
          description:x.description || '',
          amount:Number(x.amount || 0)
        } : null;
      }).filter(Boolean);

      const extrasTotal = fcSelectedExtrasTotal(selectedExtras);

      // Antes de guardar, el campo total lleva el total final.
      totalInput.value = baseTotal + extrasTotal;

      const result = originalSubmit ? originalSubmit.call(form, ev) : undefined;

      // Ubica el evento y guarda el desglose.
      setTimeout(() => {
        let target = eid ? (data.events || []).find(e => e.id === eid) : null;

        if (!target) {
          const candidates = (data.events || []).filter(e => e.salonId === session.salonId);
          target = candidates[candidates.length - 1] || null;
        }

        if (!target) return;

        target.baseTotal = baseTotal;
        target.extras = selectedExtras;
        target.extrasTotal = extrasTotal;
        target.total = baseTotal + extrasTotal;

        save();
      }, 0);

      return result;
    };
  };

  // Muestra adicionales en el detalle de fiesta.
  const fcPreviousOpenEventExtras = window.openEvent;

  window.openEvent = function (eid) {
    fcPreviousOpenEventExtras(eid);

    const event = (data.events || []).find(e => e.id === eid);
    if (!event) return;

    const extras = event.extras || [];
    const extrasTotal = Number(event.extrasTotal ?? fcSelectedExtrasTotal(extras));
    const baseTotal = Number(event.baseTotal ?? (Number(event.total || 0) - extrasTotal));

    const modalBody = document.querySelector('#modal-body');
    if (!modalBody || modalBody.querySelector('[data-fc-extras-detail]')) return;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '16px';
    card.setAttribute('data-fc-extras-detail','1');

    card.innerHTML = `
      <div class="section-title">
        <h3>➕ Adicionales de la reserva</h3>
      </div>

      ${
        extras.length
          ? `<div class="list">
              ${extras.map(x => `
                <div class="list-item">
                  <div>
                    <strong>${esc(x.name)}</strong>
                    <small>${esc(x.description || '')}</small>
                  </div>
                  <b>${money(x.amount || 0)}</b>
                </div>
              `).join('')}
            </div>`
          : `<div class="empty">Esta fiesta no tiene adicionales.</div>`
      }

      <div class="grid stats" style="grid-template-columns:repeat(3,1fr);margin-top:12px">
        <div class="card"><small class="muted">Base</small><strong>${money(baseTotal)}</strong></div>
        <div class="card"><small class="muted">Adicionales</small><strong>${money(extrasTotal)}</strong></div>
        <div class="card"><small class="muted">Total</small><strong>${money(Number(event.total || 0))}</strong></div>
      </div>
    `;

    modalBody.appendChild(card);
  };

})();


// ============================================================
// V8 - MOVIMIENTOS FINANCIEROS REALES POR FIESTA
//      Cobros + personal + adicionales
// ============================================================
(function () {
  'use strict';

  data.movements = data.movements || [];

  function fcMovementsForSalon() {
    return (data.movements || []).filter(m => m.salonId === session?.salonId);
  }

  function fcEventName(eventId) {
    const e = (data.events || []).find(x => x.id === eventId);
    return e ? `${e.child || 'Fiesta'} · ${fmtDate(e.date)}` : 'Sin fiesta';
  }

  function fcUpsertMovement(sourceKey, values) {
    data.movements = data.movements || [];
    let m = data.movements.find(x =>
      x.salonId === session?.salonId && x.sourceKey === sourceKey
    );

    if (!m) {
      m = {
        id:id(),
        salonId:session.salonId,
        sourceKey,
        createdAt:new Date().toISOString(),
        ...values
      };
      data.movements.push(m);
    } else {
      Object.assign(m, values, {updatedAt:new Date().toISOString()});
    }

    return m;
  }

  function fcRemoveMovementBySource(sourceKey) {
    data.movements = (data.movements || []).filter(m =>
      !(m.salonId === session?.salonId && m.sourceKey === sourceKey)
    );
  }

  function fcSyncEventMovements(eventId) {
    const e = (data.events || []).find(x => x.id === eventId);
    if (!e || e.salonId !== session?.salonId) return;

    // 1) Personal = GASTO
    const assignments = (data.assignments || []).filter(a => a.eventId === eventId);
    const validStaffKeys = new Set();

    assignments.forEach(a => {
      const person = (data.staff || []).find(s => s.id === a.staffId);
      if (!person) return;

      const key = `staff:${eventId}:${a.staffId}`;
      validStaffKeys.add(key);

      fcUpsertMovement(key, {
        eventId,
        type:'Gasto',
        category:'Personal',
        concept:`${person.role || 'Personal'} · ${person.name}`,
        amount:Number(a.amount || 0),
        movementDate:e.date || new Date().toISOString().slice(0,10),
        status:a.paid ? 'Pagado' : 'Pendiente',
        staffId:a.staffId
      });
    });

    (data.movements || [])
      .filter(m => m.eventId === eventId && m.category === 'Personal' && m.sourceKey?.startsWith(`staff:${eventId}:`))
      .forEach(m => {
        if (!validStaffKeys.has(m.sourceKey)) fcRemoveMovementBySource(m.sourceKey);
      });

    // 2) Adicionales = CARGO AL CLIENTE (no es cobro hasta que paga)
    const extras = e.extras || [];
    const validExtraKeys = new Set();

    extras.forEach(x => {
      const key = `extra:${eventId}:${x.id}`;
      validExtraKeys.add(key);

      fcUpsertMovement(key, {
        eventId,
        type:'Cargo',
        category:'Adicional',
        concept:x.name || 'Adicional',
        amount:Number(x.amount || 0),
        movementDate:e.date || new Date().toISOString().slice(0,10),
        status:'Incluido en reserva',
        extraId:x.id
      });
    });

    (data.movements || [])
      .filter(m => m.eventId === eventId && m.category === 'Adicional' && m.sourceKey?.startsWith(`extra:${eventId}:`))
      .forEach(m => {
        if (!validExtraKeys.has(m.sourceKey)) fcRemoveMovementBySource(m.sourceKey);
      });
  }

  function fcSyncAllOpenEvents() {
    (data.events || [])
      .filter(e => e.salonId === session?.salonId)
      .forEach(e => fcSyncEventMovements(e.id));
  }

  // ------------------------------------------------------------
  // REGISTRAR COBRO: ahora guarda historial de cada pago
  // ------------------------------------------------------------
  window.openPayment = function (eid) {
    const e = (data.events || []).find(x => x.id === eid);
    if (!e) return;

    const saldo = Math.max(0, Number(e.total || 0) - Number(e.paid || 0));

    showModal(`
      <div class="modal-title">
        <div>
          <h2>Registrar cobro</h2>
          <p>${esc(e.child)} · Saldo ${money(saldo)}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="fc-payment-form">
        <div class="form-grid">
          <div class="field">
            <label>Importe cobrado</label>
            <input name="amount" type="number" min="1" max="${saldo || 999999999}" required>
          </div>

          <div class="field">
            <label>Medio de pago</label>
            <select name="method">
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>Mercado Pago</option>
              <option>Tarjeta</option>
              <option>Otro</option>
            </select>
          </div>

          <div class="field">
            <label>Fecha</label>
            <input name="date" type="date" required value="${new Date().toISOString().slice(0,10)}">
          </div>

          <div class="field">
            <label>Comprobante / referencia</label>
            <input name="reference" placeholder="Opcional">
          </div>

          <div class="field span2">
            <label>Observación</label>
            <input name="note" placeholder="Ej: seña, segundo pago, saldo final...">
          </div>
        </div>

        <div class="form-actions">
          <button class="ghost" type="button" onclick="openEvent('${esc(eid)}')">Cancelar</button>
          <button class="primary">Registrar cobro</button>
        </div>
      </form>
    `);

    document.querySelector('#fc-payment-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const amount = Number(f.amount || 0);

      if (amount <= 0) return toast('Ingresá un importe válido');

      const currentPaid = Number(e.paid || 0);
      const currentTotal = Number(e.total || 0);

      if (currentPaid + amount > currentTotal) {
        return toast('El cobro supera el saldo de la fiesta');
      }

      e.paid = currentPaid + amount;

      data.movements.push({
        id:id(),
        salonId:session.salonId,
        eventId:eid,
        sourceKey:`payment:${eid}:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
        type:'Cobro',
        category:'Cliente',
        concept:f.note?.trim() || 'Cobro de reserva',
        amount,
        movementDate:f.date,
        method:f.method,
        reference:f.reference || '',
        note:f.note || '',
        status:'Cobrado',
        createdAt:new Date().toISOString()
      });

      save();
      toast('Cobro registrado y guardado');
      openEvent(eid);
    };
  };

  // ------------------------------------------------------------
  // HISTORIAL DE MOVIMIENTOS DENTRO DE LA FIESTA
  // ------------------------------------------------------------
  const fcPrevOpenEventLedger = window.openEvent;

  window.openEvent = function (eid) {
    fcSyncEventMovements(eid);
    fcPrevOpenEventLedger(eid);

    const modal = document.querySelector('#modal-body');
    if (!modal || modal.querySelector('[data-fc-movements]')) return;

    const movements = fcMovementsForSalon()
      .filter(m => m.eventId === eid)
      .sort((a,b) => String(b.createdAt || b.movementDate || '').localeCompare(String(a.createdAt || a.movementDate || '')));

    const box = document.createElement('div');
    box.className = 'card';
    box.style.marginTop = '16px';
    box.setAttribute('data-fc-movements','1');

    box.innerHTML = `
      <div class="section-title">
        <div>
          <h3>💰 Movimientos de la fiesta</h3>
          <small class="muted">Queda guardado cada cobro, gasto de personal y adicional.</small>
        </div>
      </div>

      ${
        movements.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>Medio</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${movements.map(m => `
                    <tr>
                      <td>${esc(m.movementDate || '-')}</td>
                      <td><span class="pill ${m.type === 'Gasto' ? 'suspendido' : m.type === 'Cobro' ? 'aprobado' : 'pendiente'}">${esc(m.type)}</span></td>
                      <td>
                        <b>${esc(m.concept || '-')}</b>
                        <small style="display:block">${esc(m.category || '')}</small>
                      </td>
                      <td>${esc(m.method || '-')}</td>
                      <td><b>${money(m.amount || 0)}</b></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="empty">Todavía no hay movimientos registrados.</div>`
      }
    `;

    modal.appendChild(box);
  };

  // ------------------------------------------------------------
  // DESPUÉS DE CREAR/EDITAR RESERVA: sincroniza personal/extras
  // ------------------------------------------------------------
  const fcPrevOpenEventFormLedger = window.openEventForm;

  window.openEventForm = function (eid) {
    const beforeIds = new Set((data.events || []).map(e => e.id));

    fcPrevOpenEventFormLedger(eid);

    const form = document.querySelector('#event-form');
    if (!form) return;

    const oldSubmit = form.onsubmit;

    form.onsubmit = function (ev) {
      const result = oldSubmit ? oldSubmit.call(form, ev) : undefined;

      setTimeout(() => {
        let target = eid ? (data.events || []).find(e => e.id === eid) : null;

        if (!target) {
          target = (data.events || []).find(e =>
            e.salonId === session.salonId && !beforeIds.has(e.id)
          );
        }

        if (!target) return;

        fcSyncEventMovements(target.id);
        save();
      }, 50);

      return result;
    };
  };

  // ------------------------------------------------------------
  // FINANZAS: resumen + libro de movimientos
  // ------------------------------------------------------------
  renderFinance = function () {
    setTitle('Finanzas','Cobros, gastos y movimientos reales del salón');

    fcSyncAllOpenEvents();

    const events = (data.events || []).filter(e => e.salonId === session.salonId);
    const moves = fcMovementsForSalon()
      .sort((a,b) => String(b.createdAt || b.movementDate || '').localeCompare(String(a.createdAt || a.movementDate || '')));

    const billed = events.reduce((sum,e) => sum + Number(e.total || 0), 0);
    const collected = moves.filter(m => m.type === 'Cobro').reduce((sum,m) => sum + Number(m.amount || 0), 0);
    const expenses = moves.filter(m => m.type === 'Gasto').reduce((sum,m) => sum + Number(m.amount || 0), 0);
    const extras = moves.filter(m => m.type === 'Cargo' && m.category === 'Adicional').reduce((sum,m) => sum + Number(m.amount || 0), 0);

    $('#content').innerHTML = `
      <div class="grid stats">
        <div class="card stat">
          <small>Facturación reservas</small>
          <strong>${money(billed)}</strong>
        </div>
        <div class="card stat">
          <small>Cobros registrados</small>
          <strong class="good">${money(collected)}</strong>
        </div>
        <div class="card stat">
          <small>Gastos registrados</small>
          <strong class="bad">${money(expenses)}</strong>
        </div>
        <div class="card stat">
          <small>Adicionales vendidos</small>
          <strong>${money(extras)}</strong>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>Libro de movimientos</h3>
            <small class="muted">Todos los registros quedan asociados a su fiesta.</small>
          </div>
        </div>

        ${
          moves.length
            ? `<div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Fiesta</th>
                      <th>Tipo</th>
                      <th>Concepto</th>
                      <th>Medio</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${moves.map(m => `
                      <tr>
                        <td>${esc(m.movementDate || '-')}</td>
                        <td>${esc(fcEventName(m.eventId))}</td>
                        <td><span class="pill ${m.type === 'Gasto' ? 'suspendido' : m.type === 'Cobro' ? 'aprobado' : 'pendiente'}">${esc(m.type)}</span></td>
                        <td>
                          <b>${esc(m.concept || '-')}</b>
                          <small style="display:block">${esc(m.category || '')}</small>
                        </td>
                        <td>${esc(m.method || '-')}</td>
                        <td><b>${money(m.amount || 0)}</b></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>`
            : `<div class="empty">Todavía no hay movimientos.</div>`
        }
      </div>
    `;
  };

  // Asegura que los movimientos se creen al entrar al salón.
  setTimeout(() => {
    try {
      if (session?.role === 'salon') {
        fcSyncAllOpenEvents();
        save();
      }
    } catch (_) {}
  }, 400);

})();


// ============================================================
// V9 - FIX DEFINITIVO DE MOVIMIENTOS DERIVADOS
// Personal y adicionales se muestran aunque el registro persistido
// todavía no se haya creado, y además se sincronizan al servidor.
// ============================================================
(function () {
  'use strict';

  data.movements = data.movements || [];

  function fcV9SalonEvents() {
    return (data.events || []).filter(e => e.salonId === session?.salonId);
  }

  function fcV9StaffRows(eventId) {
    return (data.assignments || [])
      .filter(a => a.eventId === eventId)
      .map(a => {
        const p = (data.staff || []).find(s => s.id === a.staffId);
        if (!p) return null;
        const e = (data.events || []).find(x => x.id === eventId);
        return {
          id:`derived-staff-${eventId}-${a.staffId}`,
          salonId:session?.salonId,
          eventId,
          sourceKey:`staff:${eventId}:${a.staffId}`,
          type:'Gasto',
          category:'Personal',
          concept:`${p.role || 'Personal'} · ${p.name}`,
          amount:Number(a.amount ?? p.defaultFee ?? 0),
          movementDate:e?.date || '',
          status:a.paid ? 'Pagado' : 'Pendiente',
          method:'',
          derived:true
        };
      })
      .filter(Boolean);
  }

  function fcV9ExtraRows(eventId) {
    const e = (data.events || []).find(x => x.id === eventId);
    if (!e) return [];
    return (e.extras || []).map(x => ({
      id:`derived-extra-${eventId}-${x.id}`,
      salonId:session?.salonId,
      eventId,
      sourceKey:`extra:${eventId}:${x.id}`,
      type:'Cargo',
      category:'Adicional',
      concept:x.name || 'Adicional',
      amount:Number(x.amount || 0),
      movementDate:e.date || '',
      status:'Incluido en reserva',
      method:'',
      derived:true
    }));
  }

  function fcV9StoredRows(eventId=null) {
    return (data.movements || []).filter(m =>
      m.salonId === session?.salonId &&
      (eventId ? m.eventId === eventId : true)
    );
  }

  function fcV9AllRows(eventId=null) {
    const stored = fcV9StoredRows(eventId);
    const events = eventId
      ? (data.events || []).filter(e => e.id === eventId && e.salonId === session?.salonId)
      : fcV9SalonEvents();

    const derived = [];
    events.forEach(e => {
      derived.push(...fcV9StaffRows(e.id));
      derived.push(...fcV9ExtraRows(e.id));
    });

    // Si ya existe persistido con el mismo sourceKey, no duplica.
    const storedKeys = new Set(stored.map(m => m.sourceKey).filter(Boolean));
    return [
      ...stored,
      ...derived.filter(m => !storedKeys.has(m.sourceKey))
    ];
  }

  function fcV9PersistDerivedForEvent(eventId) {
    data.movements = data.movements || [];
    const derived = [...fcV9StaffRows(eventId), ...fcV9ExtraRows(eventId)];
    const wantedKeys = new Set(derived.map(x => x.sourceKey));

    // Limpia movimientos automáticos que ya no correspondan.
    data.movements = data.movements.filter(m => {
      if (m.eventId !== eventId) return true;
      if (!m.sourceKey) return true;
      if (!m.sourceKey.startsWith(`staff:${eventId}:`) &&
          !m.sourceKey.startsWith(`extra:${eventId}:`)) return true;
      return wantedKeys.has(m.sourceKey);
    });

    derived.forEach(d => {
      const old = data.movements.find(m =>
        m.salonId === session?.salonId && m.sourceKey === d.sourceKey
      );

      if (old) {
        Object.assign(old, {
          type:d.type,
          category:d.category,
          concept:d.concept,
          amount:d.amount,
          movementDate:d.movementDate,
          status:d.status,
          method:d.method || '',
          updatedAt:new Date().toISOString()
        });
      } else {
        data.movements.push({
          ...d,
          id:id(),
          derived:false,
          createdAt:new Date().toISOString()
        });
      }
    });
  }

  function fcV9PersistAll() {
    fcV9SalonEvents().forEach(e => fcV9PersistDerivedForEvent(e.id));
    save();
  }

  // Re-sincroniza automáticamente al cargar.
  setTimeout(() => {
    try {
      if (session?.role === 'salon') fcV9PersistAll();
    } catch (err) {
      console.error('V9 sync movements', err);
    }
  }, 800);

  // Re-sincroniza después de guardar una reserva.
  const prevEventFormV9 = window.openEventForm;
  window.openEventForm = function (eid) {
    const before = new Set((data.events || []).map(e => e.id));
    prevEventFormV9(eid);

    const form = document.querySelector('#event-form');
    if (!form) return;

    const oldSubmit = form.onsubmit;
    form.onsubmit = function (ev) {
      const r = oldSubmit ? oldSubmit.call(form, ev) : undefined;

      // Los wrappers anteriores actualizan personal/extras con setTimeout.
      // Esperamos y sincronizamos dos veces para evitar carreras.
      [150, 500].forEach(delay => {
        setTimeout(() => {
          let target = eid ? (data.events || []).find(e => e.id === eid) : null;
          if (!target) {
            target = (data.events || []).find(e =>
              e.salonId === session?.salonId && !before.has(e.id)
            );
          }
          if (!target) return;
          fcV9PersistDerivedForEvent(target.id);
          save();
        }, delay);
      });

      return r;
    };
  };

  // Detalle de fiesta: tabla V9 independiente y garantizada.
  const prevOpenEventV9 = window.openEvent;
  window.openEvent = function (eid) {
    fcV9PersistDerivedForEvent(eid);
    prevOpenEventV9(eid);

    const modal = document.querySelector('#modal-body');
    if (!modal) return;

    // Quita tabla de movimientos anterior si existe para evitar confusión/duplicado.
    modal.querySelectorAll('[data-fc-movements]').forEach(x => x.remove());
    modal.querySelectorAll('[data-fc-v9-movements]').forEach(x => x.remove());

    const rows = fcV9AllRows(eid).sort((a,b) =>
      String(b.createdAt || b.movementDate || '').localeCompare(
        String(a.createdAt || a.movementDate || '')
      )
    );

    const box = document.createElement('div');
    box.className = 'card';
    box.style.marginTop = '16px';
    box.setAttribute('data-fc-v9-movements','1');
    box.innerHTML = `
      <div class="section-title">
        <div>
          <h3>💰 Movimientos de la fiesta</h3>
          <small class="muted">Cobros, gastos de personal y adicionales de esta reserva.</small>
        </div>
      </div>
      ${
        rows.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>Estado</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(m => `
                    <tr>
                      <td>
                        <span class="pill ${m.type === 'Gasto' ? 'suspendido' : m.type === 'Cobro' ? 'aprobado' : 'pendiente'}">
                          ${esc(m.type)}
                        </span>
                      </td>
                      <td>
                        <b>${esc(m.concept || '-')}</b>
                        <small style="display:block">${esc(m.category || '')}</small>
                      </td>
                      <td>${esc(m.status || '-')}</td>
                      <td><b>${money(m.amount || 0)}</b></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="empty">Todavía no hay movimientos para esta fiesta.</div>`
      }
    `;
    modal.appendChild(box);
  };

  // Finanzas V9: usa movimientos almacenados + derivados en vivo.
  renderFinance = function () {
    setTitle('Finanzas','Cobros, gastos y movimientos del salón');

    // Persistimos antes de dibujar.
    fcV9SalonEvents().forEach(e => fcV9PersistDerivedForEvent(e.id));

    const events = fcV9SalonEvents();
    const rows = fcV9AllRows().sort((a,b) =>
      String(b.createdAt || b.movementDate || '').localeCompare(
        String(a.createdAt || a.movementDate || '')
      )
    );

    const billed = events.reduce((s,e) => s + Number(e.total || 0), 0);
    const collected = rows.filter(m => m.type === 'Cobro')
      .reduce((s,m) => s + Number(m.amount || 0), 0);
    const staffCosts = rows.filter(m => m.type === 'Gasto' && m.category === 'Personal')
      .reduce((s,m) => s + Number(m.amount || 0), 0);
    const extras = rows.filter(m => m.type === 'Cargo' && m.category === 'Adicional')
      .reduce((s,m) => s + Number(m.amount || 0), 0);

    $('#content').innerHTML = `
      <div class="grid stats">
        <div class="card stat">
          <small>Facturación reservas</small>
          <strong>${money(billed)}</strong>
        </div>
        <div class="card stat">
          <small>Cobros registrados</small>
          <strong class="good">${money(collected)}</strong>
        </div>
        <div class="card stat">
          <small>Gastos de personal</small>
          <strong class="bad">${money(staffCosts)}</strong>
        </div>
        <div class="card stat">
          <small>Adicionales vendidos</small>
          <strong>${money(extras)}</strong>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>Libro de movimientos</h3>
            <small class="muted">Cada movimiento queda asociado a una fiesta.</small>
          </div>
        </div>

        ${
          rows.length
            ? `<div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Fiesta</th>
                      <th>Tipo</th>
                      <th>Concepto</th>
                      <th>Estado</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(m => {
                      const e = (data.events || []).find(x => x.id === m.eventId);
                      return `
                        <tr>
                          <td>${esc(m.movementDate || '-')}</td>
                          <td>${e ? `${esc(e.child || '')}<br><small>${esc(e.date || '')}</small>` : '-'}</td>
                          <td>
                            <span class="pill ${m.type === 'Gasto' ? 'suspendido' : m.type === 'Cobro' ? 'aprobado' : 'pendiente'}">
                              ${esc(m.type)}
                            </span>
                          </td>
                          <td>
                            <b>${esc(m.concept || '-')}</b>
                            <small style="display:block">${esc(m.category || '')}</small>
                          </td>
                          <td>${esc(m.status || '-')}</td>
                          <td><b>${money(m.amount || 0)}</b></td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>`
            : `<div class="empty">Todavía no hay movimientos.</div>`
        }
      </div>
    `;

    save();
  };

})();


// ============================================================
// V10 - GUARDADO ATÓMICO DE RESERVA
// Fiesta + personal + adicionales + movimientos se guardan juntos.
// Evita la carrera entre wrappers/setTimeout de versiones anteriores.
// ============================================================
(function () {
  'use strict';

  data.movements = data.movements || [];
  data.salonExtras = data.salonExtras || [];
  data.assignments = data.assignments || [];

  function v10SalonStaff() {
    return (data.staff || []).filter(x => x.salonId === session?.salonId);
  }

  function v10SalonExtras() {
    return (data.salonExtras || []).filter(x => x.salonId === session?.salonId);
  }

  function v10Assignments(eventId) {
    return (data.assignments || []).filter(x => x.eventId === eventId);
  }

  function v10EventExtras(event) {
    return Array.isArray(event?.extras) ? event.extras : [];
  }

  function v10RemoveAutoMovements(eventId) {
    data.movements = (data.movements || []).filter(m => {
      if (m.eventId !== eventId) return true;
      const k = String(m.sourceKey || '');
      return !(k.startsWith(`staff:${eventId}:`) || k.startsWith(`extra:${eventId}:`));
    });
  }

  function v10BuildAutoMovements(event) {
    v10RemoveAutoMovements(event.id);

    v10Assignments(event.id).forEach(a => {
      const p = (data.staff || []).find(s => s.id === a.staffId);
      if (!p) return;
      data.movements.push({
        id:id(),
        salonId:event.salonId,
        eventId:event.id,
        sourceKey:`staff:${event.id}:${a.staffId}`,
        type:'Gasto',
        category:'Personal',
        concept:`${p.role || 'Personal'} · ${p.name}`,
        amount:Number(a.amount || 0),
        movementDate:event.date || '',
        status:a.paid ? 'Pagado' : 'Pendiente',
        method:'',
        createdAt:new Date().toISOString()
      });
    });

    v10EventExtras(event).forEach(x => {
      data.movements.push({
        id:id(),
        salonId:event.salonId,
        eventId:event.id,
        sourceKey:`extra:${event.id}:${x.id}`,
        type:'Cargo',
        category:'Adicional',
        concept:x.name || 'Adicional',
        amount:Number(x.amount || 0),
        movementDate:event.date || '',
        status:'Incluido en reserva',
        method:'',
        createdAt:new Date().toISOString()
      });
    });
  }

  function v10PersistReservation(event, selectedStaffIds, selectedExtraIds, baseTotal) {
    // Personal: se reemplaza la asignación del evento por la selección actual.
    data.assignments = (data.assignments || []).filter(a => a.eventId !== event.id);

    selectedStaffIds.forEach(staffId => {
      const p = (data.staff || []).find(s => s.id === staffId && s.salonId === session.salonId);
      if (!p) return;
      data.assignments.push({
        id:id(),
        salonId:session.salonId,
        eventId:event.id,
        staffId:p.id,
        amount:Number(p.defaultFee || 0),
        paid:false
      });
    });

    // Adicionales: snapshot de nombre/precio al momento de la reserva.
    const selectedExtras = selectedExtraIds.map(extraId => {
      const x = (data.salonExtras || []).find(e => e.id === extraId && e.salonId === session.salonId);
      return x ? {
        id:x.id,
        name:x.name,
        description:x.description || '',
        amount:Number(x.amount || 0)
      } : null;
    }).filter(Boolean);

    const extrasTotal = selectedExtras.reduce((s,x) => s + Number(x.amount || 0), 0);

    event.baseTotal = Number(baseTotal || 0);
    event.extras = selectedExtras;
    event.extrasTotal = extrasTotal;
    event.total = event.baseTotal + extrasTotal;

    // Movimientos automáticos se generan en la MISMA operación.
    v10BuildAutoMovements(event);

    save();
  }

  // Reemplazo definitivo del formulario de reserva.
  window.openEventForm = function (eid) {
    const event = eid ? (data.events || []).find(x => x.id === eid) : null;
    const staff = v10SalonStaff();
    const extras = v10SalonExtras();

    const assignedIds = new Set(event ? v10Assignments(event.id).map(a => a.staffId) : []);
    const extraIds = new Set(event ? v10EventExtras(event).map(x => x.id) : []);

    const oldExtrasTotal = event
      ? Number(event.extrasTotal ?? v10EventExtras(event).reduce((s,x) => s + Number(x.amount || 0), 0))
      : 0;

    const baseTotal = event
      ? Number(event.baseTotal ?? (Number(event.total || 0) - oldExtrasTotal))
      : 0;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>${event ? 'Editar fiesta' : 'Nueva fiesta'}</h2>
          <p>Reserva, personal y adicionales</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="event-form-v10">
        <div class="form-grid">
          <div class="field">
            <label>Cumpleañero/a</label>
            <input name="child" required value="${esc(event?.child || '')}">
          </div>

          <div class="field">
            <label>Edad</label>
            <input name="age" type="number" value="${Number(event?.age || 0) || ''}">
          </div>

          <div class="field">
            <label>Cliente / responsable</label>
            <input name="client" required value="${esc(event?.client || '')}">
          </div>

          <div class="field">
            <label>Email del cliente</label>
            <input name="phone" type="email" value="${esc(event?.phone || '')}">
          </div>

          <div class="field">
            <label>Fecha</label>
            <input name="date" type="date" required value="${esc(event?.date || '')}">
          </div>

          <div class="field">
            <label>Estado</label>
            <select name="status">
              ${['Consulta','Señada','Confirmada','Finalizada','Cancelada']
                .map(x => `<option ${event?.status === x ? 'selected' : ''}>${x}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label>Desde</label>
            <input name="start" type="time" required value="${esc(event?.start || '17:00')}">
          </div>

          <div class="field">
            <label>Hasta</label>
            <input name="end" type="time" required value="${esc(event?.end || '20:00')}">
          </div>

          <div class="field">
            <label>Paquete</label>
            <input name="package" value="${esc(event?.package || 'Clásico')}">
          </div>

          <div class="field">
            <label>Invitados estimados</label>
            <input name="guests" type="number" min="0" value="${Number(event?.guests || 0)}">
          </div>

          <div class="field">
            <label>Precio base de la fiesta</label>
            <input name="baseTotal" type="number" min="0" value="${baseTotal}">
          </div>

          <div class="field">
            <label>Ya cobrado</label>
            <input name="paid" type="number" min="0" value="${Number(event?.paid || 0)}">
          </div>

          <div class="field span2">
            <label>Personal a cargo</label>
            ${
              staff.length
                ? `<div class="card" style="padding:12px;margin-top:6px">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
                      ${staff.map(p => `
                        <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:10px;cursor:pointer">
                          <input type="checkbox" name="staffId" value="${esc(p.id)}" ${assignedIds.has(p.id) ? 'checked' : ''}>
                          <span>
                            <b>${esc(p.name)}</b>
                            <small style="display:block">${esc(p.role || '')} · ${money(p.defaultFee || 0)}</small>
                          </span>
                        </label>
                      `).join('')}
                    </div>
                  </div>`
                : `<div class="empty">No hay personal cargado.</div>`
            }
          </div>

          <div class="field span2">
            <label>Adicionales</label>
            ${
              extras.length
                ? `<div class="card" style="padding:12px;margin-top:6px">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
                      ${extras.map(x => `
                        <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:10px;cursor:pointer">
                          <input type="checkbox" name="extraId" value="${esc(x.id)}" data-amount="${Number(x.amount || 0)}" ${extraIds.has(x.id) ? 'checked' : ''}>
                          <span>
                            <b>${esc(x.name)}</b>
                            <small style="display:block">${money(x.amount || 0)}</small>
                          </span>
                        </label>
                      `).join('')}
                    </div>
                  </div>`
                : `<div class="empty">No hay adicionales cargados.</div>`
            }
          </div>

          <div class="field span2">
            <div class="grid stats" style="grid-template-columns:repeat(3,1fr)">
              <div class="card">
                <small class="muted">Precio base</small>
                <strong id="v10-base">${money(baseTotal)}</strong>
              </div>
              <div class="card">
                <small class="muted">Adicionales</small>
                <strong id="v10-extras">${money(oldExtrasTotal)}</strong>
              </div>
              <div class="card">
                <small class="muted">Total reserva</small>
                <strong id="v10-total">${money(baseTotal + oldExtrasTotal)}</strong>
              </div>
            </div>
          </div>

          <div class="field span2">
            <label>Observaciones</label>
            <textarea name="notes">${esc(event?.notes || '')}</textarea>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">Guardar fiesta</button>
        </div>
      </form>
    `);

    const form = document.querySelector('#event-form-v10');
    const baseInput = form.querySelector('[name="baseTotal"]');

    function recalc() {
      const base = Number(baseInput.value || 0);
      const ext = [...form.querySelectorAll('[name="extraId"]:checked')]
        .reduce((s,el) => s + Number(el.dataset.amount || 0), 0);

      document.querySelector('#v10-base').textContent = money(base);
      document.querySelector('#v10-extras').textContent = money(ext);
      document.querySelector('#v10-total').textContent = money(base + ext);
    }

    baseInput.addEventListener('input', recalc);
    form.querySelectorAll('[name="extraId"]').forEach(el => el.addEventListener('change', recalc));

    form.onsubmit = ev => {
      ev.preventDefault();

      const fd = new FormData(form);
      const previousStatus = event?.status || '';

      const fields = {
        child:String(fd.get('child') || ''),
        age:Number(fd.get('age') || 0),
        client:String(fd.get('client') || ''),
        phone:String(fd.get('phone') || ''),
        date:String(fd.get('date') || ''),
        status:String(fd.get('status') || 'Consulta'),
        start:String(fd.get('start') || ''),
        end:String(fd.get('end') || ''),
        package:String(fd.get('package') || ''),
        guests:Number(fd.get('guests') || 0),
        paid:Number(fd.get('paid') || 0),
        notes:String(fd.get('notes') || '')
      };

      const selectedStaffIds = fd.getAll('staffId').map(String);
      const selectedExtraIds = fd.getAll('extraId').map(String);
      const base = Number(fd.get('baseTotal') || 0);

      let target = event;

      if (target) {
        Object.assign(target, fields);
      } else {
        target = {
          id:id(),
          salonId:session.salonId,
          ...fields,
          rsvps:[]
        };
        data.events.push(target);
      }

      // TODO se guarda junto antes de cerrar el modal.
      v10PersistReservation(target, selectedStaffIds, selectedExtraIds, base);

      closeModal();
      toast('Fiesta, personal y adicionales guardados');
      renderSalonShell();

      // Mantiene la confirmación por email de versiones anteriores.
      if (previousStatus !== 'Confirmada' && target.status === 'Confirmada') {
        try {
          if (typeof sendConfirmationEmail === 'function') {
            sendConfirmationEmail(target);
          }
        } catch (_) {}
      }
    };
  };

  // Recupera fiestas existentes: si ya tienen extras/asignaciones,
  // reconstruye sus movimientos al entrar.
  setTimeout(() => {
    try {
      if (session?.role !== 'salon') return;
      (data.events || [])
        .filter(e => e.salonId === session.salonId)
        .forEach(e => v10BuildAutoMovements(e));
      save();
    } catch (err) {
      console.error('V10 rebuild movements', err);
    }
  }, 1000);

})();


// ============================================================
// V11 - DASHBOARD FINANCIERO POR MEDIO DE PAGO + PROVEEDORES
// ============================================================
(function () {
  'use strict';

  data.movements = data.movements || [];
  data.orders = data.orders || [];

  function v11SalonMovements() {
    return (data.movements || []).filter(m => m.salonId === session?.salonId);
  }

  function v11MoneyByMethod(rows) {
    const out = {
      Efectivo:0,
      Transferencia:0,
      'Mercado Pago':0,
      Tarjeta:0,
      Otro:0
    };

    rows.forEach(m => {
      const method = String(m.method || 'Otro').trim();
      if (Object.prototype.hasOwnProperty.call(out, method)) out[method] += Number(m.amount || 0);
      else out.Otro += Number(m.amount || 0);
    });

    return out;
  }

  function v11IncomeRows() {
    return v11SalonMovements().filter(m => m.type === 'Cobro');
  }

  function v11SupplierExpenseRows() {
    return v11SalonMovements().filter(m =>
      m.type === 'Gasto' && m.category === 'Proveedor'
    );
  }

  function v11MethodCards(methods, titlePrefix='') {
    return `
      <div class="grid stats" style="grid-template-columns:repeat(5,1fr);margin-top:16px">
        <div class="card stat">
          <small>${titlePrefix}Efectivo</small>
          <strong>${money(methods['Efectivo'] || 0)}</strong>
        </div>
        <div class="card stat">
          <small>${titlePrefix}Transferencia</small>
          <strong>${money(methods['Transferencia'] || 0)}</strong>
        </div>
        <div class="card stat">
          <small>${titlePrefix}Mercado Pago</small>
          <strong>${money(methods['Mercado Pago'] || 0)}</strong>
        </div>
        <div class="card stat">
          <small>${titlePrefix}Tarjeta</small>
          <strong>${money(methods['Tarjeta'] || 0)}</strong>
        </div>
        <div class="card stat">
          <small>${titlePrefix}Otro</small>
          <strong>${money(methods['Otro'] || 0)}</strong>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------
  // FINANZAS - DASHBOARD INGRESOS POR MEDIO DE PAGO
  // ----------------------------------------------------------
  const prevRenderFinanceV11 = renderFinance;

  renderFinance = function () {
    prevRenderFinanceV11();

    const content = document.querySelector('#content');
    if (!content || document.querySelector('#v11-finance-dashboard')) return;

    const income = v11IncomeRows();
    const methods = v11MoneyByMethod(income);
    const totalIncome = income.reduce((s,m) => s + Number(m.amount || 0), 0);

    const dashboard = document.createElement('div');
    dashboard.id = 'v11-finance-dashboard';
    dashboard.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="section-title">
          <div>
            <h3>📊 Dashboard de ingresos</h3>
            <small class="muted">Cómo ingresó el dinero al salón.</small>
          </div>
          <div style="text-align:right">
            <small class="muted">TOTAL INGRESADO</small>
            <strong style="display:block;font-size:24px">${money(totalIncome)}</strong>
          </div>
        </div>

        ${v11MethodCards(methods)}

        <div class="card" style="margin-top:16px;padding:14px">
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;text-align:center">
            ${Object.entries(methods).map(([method, amount]) => {
              const pct = totalIncome ? Math.round((amount / totalIncome) * 100) : 0;
              return `
                <div>
                  <b>${esc(method)}</b>
                  <small style="display:block">${pct}% del total</small>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    content.prepend(dashboard);
  };

  // ----------------------------------------------------------
  // PROVEEDORES - PAGO A PROVEEDOR CON MEDIO DE PAGO
  // ----------------------------------------------------------
  window.v11PaySupplierOrder = function (orderId) {
    const order = (data.orders || []).find(o => o.id === orderId);
    if (!order) return;

    const provider = (data.suppliers || []).find(p => p.id === order.supplierId);
    const event = (data.events || []).find(e => e.id === order.eventId);
    const amount = Number(order.amount || 0);

    showModal(`
      <div class="modal-title">
        <div>
          <h2>Registrar pago a proveedor</h2>
          <p>${esc(provider?.name || 'Proveedor')} · ${event ? esc(event.child || '') : ''}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v11-provider-payment-form">
        <div class="form-grid">
          <div class="field">
            <label>Importe</label>
            <input name="amount" type="number" min="1" value="${amount}" required>
          </div>

          <div class="field">
            <label>Medio de pago</label>
            <select name="method">
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

          <div class="field">
            <label>Referencia</label>
            <input name="reference" placeholder="Opcional">
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">Registrar pago</button>
        </div>
      </form>
    `);

    document.querySelector('#v11-provider-payment-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const paidAmount = Number(f.amount || 0);

      if (paidAmount <= 0) return toast('Ingresá un importe válido');

      order.status = 'Pagado';
      order.paidAt = new Date().toISOString();
      order.paymentMethod = f.method;
      order.paymentReference = f.reference || '';
      order.paidAmount = paidAmount;

      if (provider) {
        provider.balance = Math.max(0, Number(provider.balance || 0) - paidAmount);
      }

      // Reemplaza movimiento anterior de pago de esta orden para no duplicar.
      data.movements = (data.movements || []).filter(m =>
        m.sourceKey !== `supplier-payment:${order.id}`
      );

      data.movements.push({
        id:id(),
        salonId:session.salonId,
        eventId:order.eventId || '',
        supplierId:order.supplierId || '',
        orderId:order.id,
        sourceKey:`supplier-payment:${order.id}`,
        type:'Gasto',
        category:'Proveedor',
        concept:`Pago a ${provider?.name || 'Proveedor'}${order.detail ? ' · ' + order.detail : ''}`,
        amount:paidAmount,
        movementDate:f.date,
        method:f.method,
        reference:f.reference || '',
        status:'Pagado',
        createdAt:new Date().toISOString()
      });

      save();
      closeModal();
      toast('Pago al proveedor registrado');
      renderSalonShell();
    };
  };

  // ----------------------------------------------------------
  // PROVEEDORES - DASHBOARD + LISTADO
  // ----------------------------------------------------------
  renderSuppliers = function () {
    setTitle('Proveedores','Pedidos, pagos, costos y medios de pago');

    const providers = typeof sp === 'function' ? sp() : [];
    const orders = typeof so === 'function' ? so() : [];

    const supplierPayments = v11SupplierExpenseRows();
    const methods = v11MoneyByMethod(supplierPayments);
    const totalPaid = supplierPayments.reduce((s,m) => s + Number(m.amount || 0), 0);
    const totalOrdered = orders.reduce((s,o) => s + Number(o.amount || 0), 0);
    const totalPending = Math.max(0, totalOrdered - totalPaid);

    $('#content').innerHTML = `
      <div class="card">
        <div class="section-title">
          <div>
            <h3>📊 Dashboard de proveedores</h3>
            <small class="muted">Pagos realizados y compromisos del salón.</small>
          </div>
        </div>

        <div class="grid stats">
          <div class="card stat">
            <small>Total pedidos</small>
            <strong>${money(totalOrdered)}</strong>
          </div>
          <div class="card stat">
            <small>Total pagado</small>
            <strong class="good">${money(totalPaid)}</strong>
          </div>
          <div class="card stat">
            <small>Pendiente</small>
            <strong class="${totalPending ? 'bad' : 'good'}">${money(totalPending)}</strong>
          </div>
        </div>

        ${v11MethodCards(methods, 'Pagado por ')}
      </div>

      <div class="toolbar" style="margin-top:16px">
        <button class="primary" onclick="openSupplierForm()">+ Nuevo proveedor</button>
        <button class="secondary" onclick="openOrderForm()">+ Nuevo pedido</button>
      </div>

      <div class="grid two">
        <div class="card">
          <div class="section-title"><h3>Proveedores</h3></div>
          <div class="list">
            ${providers.map(p => `
              <div class="list-item">
                <div>
                  <strong>${esc(p.name)}</strong>
                  <small>${esc(p.category || '')}</small>
                </div>
                <div style="text-align:right">
                  <b class="${Number(p.balance || 0) ? 'bad' : 'good'}">${money(p.balance || 0)}</b>
                  <small>${Number(p.balance || 0) ? 'Adeudado' : 'Al día'}</small>
                </div>
              </div>
            `).join('') || '<div class="empty">Sin proveedores cargados.</div>'}
          </div>
        </div>

        <div class="card">
          <div class="section-title"><h3>Pedidos</h3></div>
          <div class="list">
            ${orders.map(o => {
              const p = (data.suppliers || []).find(x => x.id === o.supplierId);
              const e = (data.events || []).find(x => x.id === o.eventId);
              return `
                <div class="list-item">
                  <div>
                    <strong>${esc(p?.name || 'Proveedor')}</strong>
                    <small>${esc(e?.child || '')} · ${esc(o.status || 'Pendiente')} · ${money(o.amount || 0)}</small>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                    ${o.status === 'Pagado'
                      ? `<span class="pill aprobado">${esc(o.paymentMethod || 'Pagado')}</span>`
                      : `<button class="primary small" onclick="v11PaySupplierOrder('${esc(o.id)}')">Registrar pago</button>`
                    }
                    <button class="secondary small" onclick="sendOrderWhatsApp('${esc(o.id)}')">WhatsApp</button>
                  </div>
                </div>
              `;
            }).join('') || '<div class="empty">Sin pedidos.</div>'}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>Historial de pagos a proveedores</h3>
            <small class="muted">Detalle de cómo se pagó cada proveedor.</small>
          </div>
        </div>

        ${
          supplierPayments.length
            ? `<div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Proveedor</th>
                      <th>Fiesta</th>
                      <th>Medio</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${supplierPayments
                      .sort((a,b) => String(b.movementDate || '').localeCompare(String(a.movementDate || '')))
                      .map(m => {
                        const p = (data.suppliers || []).find(x => x.id === m.supplierId);
                        const e = (data.events || []).find(x => x.id === m.eventId);
                        return `
                          <tr>
                            <td>${esc(m.movementDate || '-')}</td>
                            <td>${esc(p?.name || '-')}</td>
                            <td>${esc(e?.child || '-')}</td>
                            <td>${esc(m.method || '-')}</td>
                            <td><b>${money(m.amount || 0)}</b></td>
                          </tr>
                        `;
                      }).join('')}
                  </tbody>
                </table>
              </div>`
            : '<div class="empty">Todavía no hay pagos a proveedores registrados.</div>'
        }
      </div>
    `;
  };

})();


// ============================================================
// V12 - STOCK POR SALÓN + COMPRAS + PRODUCTOS EN RESERVA
// ============================================================
(function () {
  'use strict';

  data.stockProducts = data.stockProducts || [];
  data.stockPurchases = data.stockPurchases || [];
  data.movements = data.movements || [];

  function v12Products() {
    return (data.stockProducts || []).filter(p => p.salonId === session?.salonId);
  }

  function v12Product(pid) {
    return (data.stockProducts || []).find(p => p.id === pid && p.salonId === session?.salonId);
  }

  function v12EventItems(e) {
    return Array.isArray(e?.stockItems) ? e.stockItems : [];
  }

  function v12StockValue() {
    return v12Products().reduce((s,p) => s + Number(p.stock || 0) * Number(p.costPrice || 0), 0);
  }

  function v12Units() {
    return v12Products().reduce((s,p) => s + Number(p.stock || 0), 0);
  }

  function v12LowStock() {
    return v12Products().filter(p => Number(p.stock || 0) <= Number(p.minStock || 0));
  }

  if (!salonNav.some(x => x[0] === 'stock')) {
    const idx = salonNav.findIndex(x => x[0] === 'suppliers');
    salonNav.splice(idx >= 0 ? idx : salonNav.length - 1, 0, ['stock','📦','Stock']);
  }

  const prevRenderSalonViewV12 = renderSalonView;
  renderSalonView = function () {
    if (view === 'stock') return renderStockV12();
    return prevRenderSalonViewV12();
  };

  function renderStockV12() {
    setTitle('Stock','Productos, compras y existencias del salón');

    const products = v12Products();
    const low = v12LowStock();

    $('#content').innerHTML = `
      <div class="grid stats">
        <div class="card stat">
          <small>Productos</small>
          <strong>${products.length}</strong>
        </div>
        <div class="card stat">
          <small>Unidades en stock</small>
          <strong>${v12Units()}</strong>
        </div>
        <div class="card stat">
          <small>Valor de stock a costo</small>
          <strong>${money(v12StockValue())}</strong>
        </div>
        <div class="card stat">
          <small>Stock bajo</small>
          <strong class="${low.length ? 'bad' : 'good'}">${low.length}</strong>
        </div>
      </div>

      <div class="toolbar" style="margin-top:16px">
        <button class="primary" onclick="openStockProductV12()">+ Agregar producto</button>
        <button class="secondary" onclick="openStockPurchaseV12()">🛒 Compra</button>
      </div>

      <div class="card">
        <div class="section-title">
          <div>
            <h3>Productos</h3>
            <small class="muted">Bebidas, aguas, gaseosas y otros productos del salón.</small>
          </div>
        </div>

        ${
          products.length ? `
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Mínimo</th>
                    <th>Costo</th>
                    <th>Venta</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${products.map(p => `
                    <tr>
                      <td>
                        <b>${esc(p.name)}</b>
                        <small style="display:block">${esc(p.category || '')}</small>
                      </td>
                      <td><b class="${Number(p.stock||0) <= Number(p.minStock||0) ? 'bad' : 'good'}">${Number(p.stock || 0)}</b></td>
                      <td>${Number(p.minStock || 0)}</td>
                      <td>${money(p.costPrice || 0)}</td>
                      <td>${money(p.salePrice || 0)}</td>
                      <td>
                        <button class="secondary small" onclick="openStockProductV12('${esc(p.id)}')">Editar</button>
                        <button class="ghost small" onclick="openStockPurchaseV12('${esc(p.id)}')">Comprar</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `<div class="empty">Todavía no hay productos. Ejemplos: Coca-Cola, agua, jugos, cerveza sin alcohol.</div>`
        }
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>Últimas compras</h3>
            <small class="muted">Cada compra aumenta automáticamente el stock.</small>
          </div>
        </div>
        ${
          (data.stockPurchases || []).filter(x => x.salonId === session.salonId).length
            ? `<div class="table-wrap">
                <table class="table">
                  <thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th><th>Medio</th></tr></thead>
                  <tbody>
                    ${(data.stockPurchases || [])
                      .filter(x => x.salonId === session.salonId)
                      .sort((a,b) => String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))
                      .slice(0,30)
                      .map(c => {
                        const p = v12Product(c.productId);
                        return `<tr>
                          <td>${esc(c.date || '-')}</td>
                          <td>${esc(p?.name || c.productName || '-')}</td>
                          <td>${Number(c.quantity || 0)}</td>
                          <td>${money(c.unitCost || 0)}</td>
                          <td><b>${money(c.total || 0)}</b></td>
                          <td>${esc(c.method || '-')}</td>
                        </tr>`;
                      }).join('')}
                  </tbody>
                </table>
              </div>`
            : `<div class="empty">Todavía no hay compras registradas.</div>`
        }
      </div>
    `;
  }

  window.renderStockV12 = renderStockV12;

  window.openStockProductV12 = function (pid) {
    const p = pid ? v12Product(pid) : null;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>${p ? 'Editar producto' : 'Agregar producto'}</h2>
          <p>Catálogo de stock del salón</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v12-product-form">
        <div class="form-grid">
          <div class="field">
            <label>Producto</label>
            <input name="name" required placeholder="Ej: Coca-Cola 2,25 L" value="${esc(p?.name || '')}">
          </div>
          <div class="field">
            <label>Categoría</label>
            <input name="category" placeholder="Bebidas" value="${esc(p?.category || '')}">
          </div>
          <div class="field">
            <label>Costo unitario</label>
            <input name="costPrice" type="number" min="0" step="1" value="${Number(p?.costPrice || 0)}">
          </div>
          <div class="field">
            <label>Precio de venta</label>
            <input name="salePrice" type="number" min="0" step="1" value="${Number(p?.salePrice || 0)}">
          </div>
          <div class="field">
            <label>Stock inicial / actual</label>
            <input name="stock" type="number" min="0" step="1" value="${Number(p?.stock || 0)}">
          </div>
          <div class="field">
            <label>Stock mínimo</label>
            <input name="minStock" type="number" min="0" step="1" value="${Number(p?.minStock || 0)}">
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">${p ? 'Guardar cambios' : 'Agregar producto'}</button>
        </div>
      </form>
    `);

    $('#v12-product-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      ['costPrice','salePrice','stock','minStock'].forEach(k => f[k] = Number(f[k] || 0));

      if (p) Object.assign(p, f);
      else data.stockProducts.push({id:id(), salonId:session.salonId, ...f});

      save();
      closeModal();
      toast(p ? 'Producto actualizado' : 'Producto agregado');
      renderStockV12();
    };
  };

  window.openStockPurchaseV12 = function (preferredPid='') {
    const products = v12Products();
    if (!products.length) return toast('Primero agregá un producto al stock');

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🛒 Registrar compra</h2>
          <p>La cantidad comprada se suma automáticamente al stock.</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v12-purchase-form">
        <div class="form-grid">
          <div class="field">
            <label>Producto</label>
            <select name="productId">
              ${products.map(p => `<option value="${esc(p.id)}" ${p.id===preferredPid?'selected':''}>${esc(p.name)}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label>Cantidad comprada</label>
            <input name="quantity" type="number" min="1" step="1" required>
          </div>

          <div class="field">
            <label>Costo unitario</label>
            <input name="unitCost" type="number" min="0" step="1" required>
          </div>

          <div class="field">
            <label>Medio de pago</label>
            <select name="method">
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>Mercado Pago</option>
              <option>Tarjeta</option>
              <option>Otro</option>
            </select>
          </div>

          <div class="field">
            <label>Fecha</label>
            <input name="date" type="date" required value="${new Date().toISOString().slice(0,10)}">
          </div>

          <div class="field">
            <label>Comprobante / referencia</label>
            <input name="reference" placeholder="Opcional">
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">Registrar compra</button>
        </div>
      </form>
    `);

    const form = $('#v12-purchase-form');
    const productSelect = form.querySelector('[name="productId"]');
    const costInput = form.querySelector('[name="unitCost"]');

    function fillCost() {
      const p = v12Product(productSelect.value);
      if (p) costInput.value = Number(p.costPrice || 0);
    }
    productSelect.onchange = fillCost;
    fillCost();

    form.onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const p = v12Product(f.productId);
      if (!p) return toast('Producto no encontrado');

      const qty = Number(f.quantity || 0);
      const unitCost = Number(f.unitCost || 0);
      if (qty <= 0) return toast('Ingresá una cantidad válida');

      p.stock = Number(p.stock || 0) + qty;
      p.costPrice = unitCost;

      const purchase = {
        id:id(),
        salonId:session.salonId,
        productId:p.id,
        productName:p.name,
        quantity:qty,
        unitCost,
        total:qty * unitCost,
        method:f.method,
        date:f.date,
        reference:f.reference || '',
        createdAt:new Date().toISOString()
      };
      data.stockPurchases.push(purchase);

      data.movements.push({
        id:id(),
        salonId:session.salonId,
        eventId:'',
        sourceKey:`stock-purchase:${purchase.id}`,
        type:'Gasto',
        category:'Compra de stock',
        concept:`Compra ${p.name} x ${qty}`,
        amount:purchase.total,
        movementDate:f.date,
        method:f.method,
        reference:f.reference || '',
        status:'Pagado',
        createdAt:new Date().toISOString()
      });

      save();
      closeModal();
      toast('Compra registrada y stock actualizado');
      renderStockV12();
    };
  };

  // ------------------------------------------------------------------
  // RESERVA V12: usa el formulario V10 como base y agrega productos stock
  // ------------------------------------------------------------------
  const prevOpenEventFormV12 = window.openEventForm;

  window.openEventForm = function (eid) {
    const existing = eid ? (data.events || []).find(e => e.id === eid) : null;
    const oldItems = v12EventItems(existing);
    const oldQtyMap = new Map(oldItems.map(x => [x.id, Number(x.quantity || 0)]));

    prevOpenEventFormV12(eid);

    const form = document.querySelector('#event-form-v10') || document.querySelector('#event-form');
    if (!form) return;

    const products = v12Products();
    const actions = form.querySelector('.form-actions');

    const block = document.createElement('div');
    block.className = 'field span2';
    block.innerHTML = `
      <label>Productos de stock para esta fiesta</label>

      ${
        products.length ? `
          <div class="card" style="padding:12px;margin-top:6px">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
              ${products.map(p => {
                const old = oldItems.find(x => x.id === p.id);
                const available = Number(p.stock || 0) + Number(old?.quantity || 0);
                return `
                  <div style="border:1px solid #ddd;border-radius:10px;padding:10px">
                    <b>${esc(p.name)}</b>
                    <small style="display:block">Disponible: ${available} · Venta ${money(p.salePrice || 0)}</small>
                    <div class="field" style="margin-top:8px">
                      <label>Cantidad para la fiesta</label>
                      <input
                        type="number"
                        name="stockQty_${esc(p.id)}"
                        min="0"
                        max="${available}"
                        step="1"
                        value="${Number(old?.quantity || 0)}"
                        data-product-id="${esc(p.id)}"
                        data-sale-price="${Number(p.salePrice || 0)}"
                      >
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : `<div class="empty">No hay productos cargados en Stock.</div>`
      }

      <div class="grid stats" style="grid-template-columns:repeat(2,1fr);margin-top:12px">
        <div class="card">
          <small class="muted">Productos de stock</small>
          <strong id="v12-stock-products-total">${money(oldItems.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.salePrice||0),0))}</strong>
        </div>
        <div class="card">
          <small class="muted">Se suma a la reserva</small>
          <strong id="v12-stock-grand-extra">${money(oldItems.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.salePrice||0),0))}</strong>
        </div>
      </div>
    `;

    if (actions) actions.before(block);

    function stockTotal() {
      return [...form.querySelectorAll('[data-product-id]')].reduce((s,el) => {
        return s + Number(el.value || 0) * Number(el.dataset.salePrice || 0);
      }, 0);
    }

    function repaint() {
      const t = stockTotal();
      const a = document.querySelector('#v12-stock-products-total');
      const b = document.querySelector('#v12-stock-grand-extra');
      if (a) a.textContent = money(t);
      if (b) b.textContent = money(t);

      // Si existen las tarjetas V10, muestra total final incluyendo stock.
      const baseInput = form.querySelector('[name="baseTotal"]');
      const base = Number(baseInput?.value || 0);
      const extras = [...form.querySelectorAll('[name="extraId"]:checked')]
        .reduce((s,el) => s + Number(el.dataset.amount || 0), 0);
      const totalEl = document.querySelector('#v10-total');
      if (totalEl) totalEl.textContent = money(base + extras + t);
    }

    form.querySelectorAll('[data-product-id]').forEach(el => el.addEventListener('input', repaint));
    form.querySelectorAll('[name="extraId"]').forEach(el => el.addEventListener('change', repaint));
    form.querySelector('[name="baseTotal"]')?.addEventListener('input', repaint);
    repaint();

    const originalSubmit = form.onsubmit;

    form.onsubmit = function (ev) {
      // Validamos y capturamos productos ANTES del guardado V10.
      const selectedItems = [];
      let invalid = false;

      form.querySelectorAll('[data-product-id]').forEach(el => {
        const p = v12Product(el.dataset.productId);
        if (!p) return;
        const qty = Number(el.value || 0);
        const oldQty = Number(oldQtyMap.get(p.id) || 0);
        const available = Number(p.stock || 0) + oldQty;

        if (qty > available) invalid = true;
        if (qty > 0) {
          selectedItems.push({
            id:p.id,
            name:p.name,
            quantity:qty,
            salePrice:Number(p.salePrice || 0),
            unitCost:Number(p.costPrice || 0),
            total:qty * Number(p.salePrice || 0)
          });
        }
      });

      if (invalid) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        toast('No hay stock suficiente para uno de los productos');
        return false;
      }

      const result = originalSubmit ? originalSubmit.call(form, ev) : undefined;

      // El V10 crea/actualiza la fiesta de forma sincrónica.
      let target = eid ? (data.events || []).find(e => e.id === eid) : null;
      if (!target) {
        const events = (data.events || []).filter(e => e.salonId === session.salonId);
        target = events[events.length - 1] || null;
      }

      if (!target) return result;

      // Devuelve al stock lo reservado anteriormente, y descuenta la nueva selección.
      oldQtyMap.forEach((qty, pid) => {
        const p = v12Product(pid);
        if (p) p.stock = Number(p.stock || 0) + Number(qty || 0);
      });

      selectedItems.forEach(item => {
        const p = v12Product(item.id);
        if (p) p.stock = Math.max(0, Number(p.stock || 0) - Number(item.quantity || 0));
      });

      // El total V10 ya tiene base + adicionales. Sumamos productos una sola vez.
      const stockItemsTotal = selectedItems.reduce((s,x) => s + Number(x.total || 0), 0);
      target.stockItems = selectedItems;
      target.stockItemsTotal = stockItemsTotal;
      target.total = Number(target.baseTotal || 0) + Number(target.extrasTotal || 0) + stockItemsTotal;

      // Movimientos de productos vendidos: cargo al cliente.
      data.movements = (data.movements || []).filter(m =>
        !(m.eventId === target.id && String(m.sourceKey || '').startsWith(`stock-sale:${target.id}:`))
      );

      selectedItems.forEach(item => {
        data.movements.push({
          id:id(),
          salonId:session.salonId,
          eventId:target.id,
          productId:item.id,
          sourceKey:`stock-sale:${target.id}:${item.id}`,
          type:'Cargo',
          category:'Producto de stock',
          concept:`${item.name} x ${item.quantity}`,
          amount:Number(item.total || 0),
          movementDate:target.date || '',
          method:'',
          status:'Incluido en reserva',
          createdAt:new Date().toISOString()
        });
      });

      save();
      return result;
    };
  };

  // ------------------------------------------------------------------
  // DETALLE DE FIESTA: productos de stock usados
  // ------------------------------------------------------------------
  const prevOpenEventV12 = window.openEvent;

  window.openEvent = function (eid) {
    prevOpenEventV12(eid);

    const e = (data.events || []).find(x => x.id === eid);
    const modal = document.querySelector('#modal-body');
    if (!e || !modal || modal.querySelector('[data-v12-stock-event]')) return;

    const items = v12EventItems(e);
    const total = Number(e.stockItemsTotal ?? items.reduce((s,x)=>s+Number(x.total||0),0));

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '16px';
    card.setAttribute('data-v12-stock-event','1');
    card.innerHTML = `
      <div class="section-title">
        <div>
          <h3>📦 Productos de stock</h3>
          <small class="muted">Productos cargados a esta reserva.</small>
        </div>
      </div>

      ${
        items.length ? `
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead>
              <tbody>
                ${items.map(x => `
                  <tr>
                    <td><b>${esc(x.name)}</b></td>
                    <td>${Number(x.quantity || 0)}</td>
                    <td>${money(x.salePrice || 0)}</td>
                    <td><b>${money(x.total || 0)}</b></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="text-align:right;margin-top:12px">
            <small class="muted">TOTAL PRODUCTOS</small>
            <strong style="display:block;font-size:22px">${money(total)}</strong>
          </div>
        ` : `<div class="empty">Esta fiesta no tiene productos de stock.</div>`
      }
    `;

    modal.appendChild(card);
  };

})();


// ============================================================
// V13 - IMPRESIÓN COMPLETA DE RESERVA / CIERRE DE FIESTA
// ============================================================
(function () {
  'use strict';

  function v13Assignments(eventId) {
    return (data.assignments || []).filter(a => a.eventId === eventId);
  }

  function v13StaffRows(eventId) {
    return v13Assignments(eventId).map(a => {
      const p = (data.staff || []).find(s => s.id === a.staffId);
      return p ? { ...p, amount:Number(a.amount || p.defaultFee || 0) } : null;
    }).filter(Boolean);
  }

  function v13Movements(eventId) {
    return (data.movements || [])
      .filter(m => m.eventId === eventId && m.salonId === session?.salonId)
      .sort((a,b) => String(a.movementDate || a.createdAt || '').localeCompare(String(b.movementDate || b.createdAt || '')));
  }

  function v13PrintEvent(eid) {
    const e = (data.events || []).find(x => x.id === eid);
    const s = salon();
    if (!e || !s) return toast('No se pudo abrir la reserva');

    const staff = v13StaffRows(eid);
    const extras = Array.isArray(e.extras) ? e.extras : [];
    const stockItems = Array.isArray(e.stockItems) ? e.stockItems : [];
    const moves = v13Movements(eid);
    const payments = moves.filter(m => m.type === 'Cobro');
    const expenses = moves.filter(m => m.type === 'Gasto');

    const totalPaid = payments.reduce((sum,m) => sum + Number(m.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum,m) => sum + Number(m.amount || 0), 0);
    const total = Number(e.total || 0);
    const balance = Math.max(0, total - Number(e.paid || totalPaid || 0));

    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) return toast('El navegador bloqueó la ventana de impresión');

    const logo = s.logo
      ? `<img src="${s.logo}" style="max-height:80px;max-width:180px;object-fit:contain">`
      : '';

    win.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Reserva ${esc(e.child || '')}</title>
<style>
  body{font-family:Arial,sans-serif;color:#222;margin:28px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:14px;margin-bottom:20px}
  .brand h1{margin:0 0 4px;font-size:26px}
  .muted{color:#666}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px 22px}
  .box{border:1px solid #ccc;border-radius:10px;padding:14px;margin-top:16px}
  .box h2{font-size:18px;margin:0 0 10px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
  th{background:#f5f5f5}
  .totals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}
  .total-card{border:1px solid #ccc;padding:12px;border-radius:8px}
  .total-card small{display:block;color:#666}
  .total-card strong{font-size:18px}
  .foot{margin-top:30px;padding-top:12px;border-top:1px solid #ccc;font-size:12px;color:#666}
  @media print{
    body{margin:12mm}
    button{display:none!important}
  }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      ${logo}
      <h1>${esc(s.name || 'Salón')}</h1>
      <div>${esc(s.address || '')}</div>
      <div>${esc(s.phone || '')}</div>
      <div>${esc(s.email || '')}</div>
    </div>
    <div style="text-align:right">
      <div><b>Resumen de reserva</b></div>
      <div class="muted">${fmtDate(e.date)}</div>
      <div class="muted">${esc(e.start || '')} a ${esc(e.end || '')}</div>
    </div>
  </div>

  <div class="box">
    <h2>Datos de la fiesta</h2>
    <div class="grid">
      <div><b>Cumpleañero/a:</b> ${esc(e.child || '')}</div>
      <div><b>Edad:</b> ${Number(e.age || 0) || '-'}</div>
      <div><b>Cliente:</b> ${esc(e.client || '')}</div>
      <div><b>Contacto:</b> ${esc(e.phone || '')}</div>
      <div><b>Fecha:</b> ${fmtDate(e.date)}</div>
      <div><b>Horario:</b> ${esc(e.start || '')} a ${esc(e.end || '')}</div>
      <div><b>Paquete:</b> ${esc(e.package || '')}</div>
      <div><b>Invitados estimados:</b> ${Number(e.guests || 0)}</div>
      <div><b>Estado:</b> ${esc(e.status || '')}</div>
      <div><b>Observaciones:</b> ${esc(e.notes || 'Sin observaciones')}</div>
    </div>
  </div>

  <div class="box">
    <h2>Personal asignado</h2>
    ${
      staff.length
        ? `<table>
            <thead><tr><th>Nombre</th><th>Cargo</th><th>WhatsApp</th><th>Costo</th></tr></thead>
            <tbody>
              ${staff.map(p => `
                <tr>
                  <td>${esc(p.name)}</td>
                  <td>${esc(p.role || '')}</td>
                  <td>${esc(p.phone || '')}</td>
                  <td>${money(p.amount || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top:8px"><b>Cantidad de personal:</b> ${staff.length}</div>`
        : `<div class="muted">Sin personal asignado.</div>`
    }
  </div>

  <div class="box">
    <h2>Adicionales</h2>
    ${
      extras.length
        ? `<table>
            <thead><tr><th>Adicional</th><th>Detalle</th><th>Importe</th></tr></thead>
            <tbody>
              ${extras.map(x => `
                <tr>
                  <td>${esc(x.name || '')}</td>
                  <td>${esc(x.description || '')}</td>
                  <td>${money(x.amount || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
        : `<div class="muted">Sin adicionales.</div>`
    }
  </div>

  <div class="box">
    <h2>Productos de stock</h2>
    ${
      stockItems.length
        ? `<table>
            <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead>
            <tbody>
              ${stockItems.map(x => `
                <tr>
                  <td>${esc(x.name || '')}</td>
                  <td>${Number(x.quantity || 0)}</td>
                  <td>${money(x.salePrice || 0)}</td>
                  <td>${money(x.total || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
        : `<div class="muted">Sin productos de stock.</div>`
    }
  </div>

  <div class="box">
    <h2>Movimientos de cobros</h2>
    ${
      payments.length
        ? `<table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Referencia</th><th>Importe</th></tr></thead>
            <tbody>
              ${payments.map(m => `
                <tr>
                  <td>${esc(m.movementDate || '')}</td>
                  <td>${esc(m.concept || 'Cobro')}</td>
                  <td>${esc(m.method || '')}</td>
                  <td>${esc(m.reference || '')}</td>
                  <td>${money(m.amount || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
        : `<div class="muted">Sin cobros registrados.</div>`
    }
  </div>

  <div class="totals">
    <div class="total-card">
      <small>Total reserva</small>
      <strong>${money(total)}</strong>
    </div>
    <div class="total-card">
      <small>Total cobrado</small>
      <strong>${money(Number(e.paid || totalPaid || 0))}</strong>
    </div>
    <div class="total-card">
      <small>Saldo</small>
      <strong>${money(balance)}</strong>
    </div>
    <div class="total-card">
      <small>Gastos registrados</small>
      <strong>${money(totalExpenses)}</strong>
    </div>
  </div>

  <div class="foot">
    Generado desde FiestaControl · ${new Date().toLocaleString('es-AR')}
  </div>

  <div style="margin-top:20px">
    <button onclick="window.print()" style="padding:10px 18px;font-size:15px">Imprimir</button>
  </div>
</body>
</html>
    `);

    win.document.close();
    setTimeout(() => {
      try { win.focus(); } catch (_) {}
    }, 200);
  }

  window.printEventV13 = v13PrintEvent;

  // Botón dentro del detalle de fiesta
  const prevOpenEventV13 = window.openEvent;
  window.openEvent = function (eid) {
    prevOpenEventV13(eid);

    const modal = document.querySelector('#modal-body');
    if (!modal || modal.querySelector('[data-v13-print]')) return;

    const toolbar = modal.querySelector('.toolbar');
    const btn = document.createElement('button');
    btn.className = 'secondary small';
    btn.setAttribute('data-v13-print','1');
    btn.innerHTML = '🖨 Imprimir resumen';
    btn.onclick = () => v13PrintEvent(eid);

    if (toolbar) toolbar.appendChild(btn);
    else modal.prepend(btn);
  };

  // Botón también en cierre de fiesta
  const prevFinalizeV13 = window.openFinalizeEvent;
  window.openFinalizeEvent = function (eid) {
    prevFinalizeV13(eid);

    const modal = document.querySelector('#modal-body');
    if (!modal || modal.querySelector('[data-v13-print-close]')) return;

    const actions = modal.querySelector('.form-actions');
    if (!actions) return;

    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.type = 'button';
    btn.setAttribute('data-v13-print-close','1');
    btn.innerHTML = '🖨 Imprimir resumen';
    btn.onclick = () => v13PrintEvent(eid);

    actions.prepend(btn);
  };

})();
