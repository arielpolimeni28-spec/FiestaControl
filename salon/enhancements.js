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


// ============================================================
// V14 - BORRADO CON MOTIVO + LIMPIEZA DE MOVIMIENTOS + RESET FINANZAS/STOCK
// ============================================================
(function () {
  'use strict';

  data.auditLog = data.auditLog || [];

  function v14SalonPasswordOk(pass) {
    const s = salon();
    return !!s && String(s.password || '') === String(pass || '');
  }

  function v14Audit(action, reason, extra={}) {
    data.auditLog.push({
      id:id(),
      salonId:session?.salonId || '',
      action,
      reason:String(reason || ''),
      createdAt:new Date().toISOString(),
      ...extra
    });
  }

  function v14DeleteEventCascade(eid, reason) {
    const e = (data.events || []).find(x => x.id === eid);
    if (!e) return false;

    const sid = e.salonId;

    // Devuelve al stock lo consumido por esa fiesta antes de borrar.
    (e.stockItems || []).forEach(item => {
      const p = (data.stockProducts || []).find(x => x.id === item.id && x.salonId === sid);
      if (p) p.stock = Number(p.stock || 0) + Number(item.quantity || 0);
    });

    data.events = (data.events || []).filter(x => x.id !== eid);
    data.assignments = (data.assignments || []).filter(x => x.eventId !== eid);
    data.orders = (data.orders || []).filter(x => x.eventId !== eid);
    data.cards = (data.cards || []).filter(x => x.eventId !== eid);
    data.movements = (data.movements || []).filter(x => x.eventId !== eid);

    v14Audit('Borrar fiesta', reason, {
      eventId:eid,
      eventName:e.child || '',
      eventDate:e.date || ''
    });

    return true;
  }

  // ----------------------------------------------------------
  // BORRAR FIESTA: contraseña + motivo + cascade real
  // ----------------------------------------------------------
  window.v14DeleteEventPrompt = function (eid) {
    const e = (data.events || []).find(x => x.id === eid);
    if (!e) return;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🗑 Borrar fiesta</h2>
          <p>${esc(e.child || '')} · ${esc(e.date || '')}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v14-delete-event-form">
        <div class="field">
          <label>Contraseña del salón</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo del borrado</label>
          <textarea name="reason" required placeholder="Ej: reserva duplicada, cancelación cargada por error..."></textarea>
        </div>

        <div class="admin-notice attention">
          <span>⚠️</span>
          <div>
            <b>Se eliminará la fiesta y sus movimientos relacionados.</b>
            <small>También se quitan asignaciones, pedidos y cargos de esa fiesta. Los productos de stock reservados vuelven al stock.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Borrar definitivamente</button>
        </div>
      </form>
    `);

    $('#v14-delete-event-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));

      if (!v14SalonPasswordOk(f.password)) {
        return toast('Contraseña incorrecta');
      }

      if (!String(f.reason || '').trim()) {
        return toast('Ingresá el motivo');
      }

      if (!v14DeleteEventCascade(eid, f.reason)) {
        return toast('No se pudo borrar la fiesta');
      }

      save();
      closeModal();
      toast('Fiesta y movimientos eliminados');
      renderSalonShell();
    };
  };

  // Reemplaza cualquier botón anterior de borrar fiesta.
  const prevOpenEventV14 = window.openEvent;
  window.openEvent = function (eid) {
    prevOpenEventV14(eid);

    const modal = document.querySelector('#modal-body');
    if (!modal) return;

    // Quita botones viejos de borrado, si existen.
    [...modal.querySelectorAll('button')].forEach(btn => {
      const txt = (btn.textContent || '').toLowerCase();
      if (txt.includes('borrar fiesta') || txt.includes('eliminar fiesta')) btn.remove();
    });

    const toolbar = modal.querySelector('.toolbar');
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.className = 'danger small';
    btn.textContent = '🗑 Borrar fiesta';
    btn.onclick = () => window.v14DeleteEventPrompt(eid);
    toolbar.appendChild(btn);
  };

  // ----------------------------------------------------------
  // RESET FINANZAS + STOCK A CERO
  // Mantiene salones y proveedores.
  // ----------------------------------------------------------
  window.v14ResetFinanceStock = function () {
    showModal(`
      <div class="modal-title">
        <div>
          <h2>🔄 Volver movimientos y stock a cero</h2>
          <p>El salón conservará sus datos, proveedores, personal y reservas.</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v14-reset-form">
        <div class="field">
          <label>Contraseña del salón</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required placeholder="Ej: inicio de operación real, limpieza de datos de prueba..."></textarea>
        </div>

        <div class="admin-notice attention">
          <span>⚠️</span>
          <div>
            <b>Esto pondrá en cero los movimientos de plata y el stock del salón.</b>
            <small>No borra salones, proveedores, personal ni reservas.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Confirmar puesta a cero</button>
        </div>
      </form>
    `);

    $('#v14-reset-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));

      if (!v14SalonPasswordOk(f.password)) {
        return toast('Contraseña incorrecta');
      }

      if (!String(f.reason || '').trim()) {
        return toast('Ingresá el motivo');
      }

      const sid = session.salonId;

      // Movimientos financieros del salón a cero.
      data.movements = (data.movements || []).filter(m => m.salonId !== sid);

      // Compras de stock del salón a cero.
      data.stockPurchases = (data.stockPurchases || []).filter(c => c.salonId !== sid);

      // Stock físico a cero, sin borrar catálogo de productos.
      (data.stockProducts || []).forEach(p => {
        if (p.salonId === sid) p.stock = 0;
      });

      // Reinicia importes cobrados de reservas del salón para empezar limpio.
      (data.events || []).forEach(e => {
        if (e.salonId === sid) {
          e.paid = 0;
          if (e.finalNumbers) {
            e.finalNumbers.paid = 0;
            e.finalNumbers.balance = Number(e.total || 0);
          }
        }
      });

      // Proveedores quedan, pero sus saldos se ponen en cero.
      (data.suppliers || []).forEach(p => {
        if (p.salonId === sid) p.balance = 0;
      });

      // Pedidos quedan como historial, pero si estaban pagados se dejan sin pago asociado.
      (data.orders || []).forEach(o => {
        if (o.salonId === sid) {
          o.paidAt = null;
          o.paymentMethod = '';
          o.paymentReference = '';
          o.paidAmount = 0;
          if (o.status === 'Pagado') o.status = 'Pendiente';
        }
      });

      v14Audit('Reset finanzas y stock', f.reason, {salonId:sid});

      save();
      closeModal();
      toast('Movimientos y stock puestos a cero');
      renderSalonShell();
    };
  };

  // ----------------------------------------------------------
  // BOTÓN EN FINANZAS
  // ----------------------------------------------------------
  const prevRenderFinanceV14 = renderFinance;
  renderFinance = function () {
    prevRenderFinanceV14();

    const content = document.querySelector('#content');
    if (!content || document.querySelector('#v14-reset-finance-btn')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.style.marginBottom = '16px';
    toolbar.id = 'v14-reset-finance-btn';
    toolbar.innerHTML = `
      <button class="danger" onclick="v14ResetFinanceStock()">
        🔄 Volver movimientos y stock a cero
      </button>
    `;

    content.prepend(toolbar);
  };

})();


// ============================================================
// V15 - USUARIOS INTERNOS POR SALÓN + ROLES GENERALES
// ============================================================
(function () {
  'use strict';

  data.salonUsers = data.salonUsers || [];

  const V15_ROLE_LABELS = {
    general: 'Operador general',
    reservas: 'Reservas',
    caja: 'Caja / Finanzas',
    stock: 'Stock / Proveedores'
  };

  const V15_ROLE_VIEWS = {
    general: ['dashboard','calendar','events','cards','community','staff','suppliers','stock','finance'],
    reservas: ['dashboard','calendar','events','cards','community'],
    caja: ['dashboard','events','suppliers','stock','finance'],
    stock: ['dashboard','suppliers','stock']
  };

  function v15IsOwner() {
    return session?.role === 'salon' && session?.isSalonOwner !== false && !session?.salonUserId;
  }

  function v15CurrentUser() {
    return session?.salonUserId
      ? (data.salonUsers || []).find(u => u.id === session.salonUserId)
      : null;
  }

  function v15AllowedView(v) {
    if (v15IsOwner()) return true;
    const u = v15CurrentUser();
    if (!u) return true;
    return (V15_ROLE_VIEWS[u.accessRole] || V15_ROLE_VIEWS.general).includes(v);
  }

  function v15UsersForSalon() {
    return (data.salonUsers || []).filter(u => u.salonId === session?.salonId);
  }

  // ----------------------------------------------------------
  // LOGIN: dueño del salón o usuario interno
  // ----------------------------------------------------------
  const prevBindAuthV15 = bindAuth;

  bindAuth = function(mode) {
    if (mode !== 'login') return prevBindAuthV15(mode);

    const form = $('#auth-form');
    if (!form) return;

    form.onsubmit = e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const email = String(f.email || '').toLowerCase().trim();
      const password = String(f.password || '');

      const admin = (data.admins || []).find(x =>
        String(x.email || '').toLowerCase() === email &&
        String(x.password || '') === password
      );
      if (admin) {
        setSession({role:'superadmin',userId:admin.id,name:admin.name});
        return render();
      }

      const s = (data.salons || []).find(x =>
        String(x.email || '').toLowerCase() === email &&
        String(x.password || '') === password
      );
      if (s) {
        if (s.status === 'Pendiente') return toast('Tu salón aún está pendiente de aprobación');
        if (s.status === 'Suspendido') return toast('La cuenta del salón está suspendida');

        setSession({
          role:'salon',
          salonId:s.id,
          name:s.owner,
          isSalonOwner:true,
          accessRole:'owner'
        });
        return render();
      }

      const u = (data.salonUsers || []).find(x =>
        String(x.email || '').toLowerCase() === email &&
        String(x.password || '') === password
      );

      if (!u) return toast('Email o contraseña incorrectos');
      if (u.status === 'Inactivo') return toast('Este usuario está inactivo');

      const su = (data.salons || []).find(x => x.id === u.salonId);
      if (!su) return toast('El salón de este usuario no existe');
      if (su.status === 'Pendiente') return toast('El salón aún está pendiente de aprobación');
      if (su.status === 'Suspendido') return toast('La cuenta del salón está suspendida');

      setSession({
        role:'salon',
        salonId:su.id,
        salonUserId:u.id,
        name:u.name,
        isSalonOwner:false,
        accessRole:u.accessRole || 'general'
      });

      render();
    };
  };

  // ----------------------------------------------------------
  // BLOQUEO DE MÓDULOS SEGÚN ROL
  // ----------------------------------------------------------
  const prevRenderSalonViewV15 = renderSalonView;

  renderSalonView = function() {
    if (!v15AllowedView(view)) {
      setTitle('Acceso restringido','Este módulo no está habilitado para tu usuario');
      $('#content').innerHTML = `
        <div class="card">
          <div class="empty">
            Tu usuario tiene rol <b>${esc(V15_ROLE_LABELS[v15CurrentUser()?.accessRole] || 'Operador')}</b>
            y no tiene acceso a esta sección.
          </div>
        </div>
      `;
      return;
    }
    return prevRenderSalonViewV15();
  };

  const prevRenderSalonShellV15 = renderSalonShell;

  renderSalonShell = function() {
    prevRenderSalonShellV15();

    setTimeout(() => {
      if (v15IsOwner()) return;

      const u = v15CurrentUser();
      if (!u) return;

      $$('[data-v]').forEach(btn => {
        const v = btn.dataset.v;
        if (!v15AllowedView(v)) btn.style.display = 'none';
      });

      // Mi salón nunca visible para usuario interno.
      const profileBtn = document.querySelector('[data-v="profile"]');
      if (profileBtn) profileBtn.style.display = 'none';

      const userChip = document.querySelector('.user-chip');
      if (userChip) {
        userChip.innerHTML = `
          <b>${esc(u.name)}</b>
          <small>${esc(V15_ROLE_LABELS[u.accessRole] || 'Operador')}</small>
        `;
      }
    }, 0);
  };

  // ----------------------------------------------------------
  // ADMINISTRACIÓN DE USUARIOS - SOLO DUEÑO DEL SALÓN
  // ----------------------------------------------------------
  function v15AppendUsersPanel() {
    if (!v15IsOwner()) return;
    const content = document.querySelector('#content');
    if (!content || document.querySelector('#v15-users-panel')) return;

    const users = v15UsersForSalon();

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'v15-users-panel';
    card.style.marginTop = '16px';

    card.innerHTML = `
      <div class="section-title">
        <div>
          <h3>👤 Usuarios del salón</h3>
          <small class="muted">
            Creá usuarios para empleados sin compartir la contraseña administrativa del salón.
          </small>
        </div>
        <button class="primary small" onclick="openSalonUserV15()">+ Crear usuario</button>
      </div>

      ${
        users.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${users.map(u => `
                    <tr>
                      <td><b>${esc(u.name)}</b></td>
                      <td>${esc(u.email)}</td>
                      <td>${esc(V15_ROLE_LABELS[u.accessRole] || 'Operador general')}</td>
                      <td>
                        <span class="pill ${u.status === 'Inactivo' ? 'suspendido' : 'aprobado'}">
                          ${esc(u.status || 'Activo')}
                        </span>
                      </td>
                      <td style="white-space:nowrap">
                        <button class="secondary small" onclick="openSalonUserV15('${esc(u.id)}')">Editar</button>
                        <button class="ghost small" onclick="toggleSalonUserV15('${esc(u.id)}')">
                          ${u.status === 'Inactivo' ? 'Activar' : 'Desactivar'}
                        </button>
                        <button class="danger small" onclick="deleteSalonUserV15('${esc(u.id)}')">Borrar</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="empty">Todavía no creaste usuarios internos.</div>`
      }

      <div class="admin-notice" style="margin-top:14px">
        <span>🔐</span>
        <div>
          <b>Los usuarios internos pueden cargar información, pero no tienen la contraseña administrativa.</b>
          <small>Los borrados y el reset financiero siguen requiriendo la contraseña del dueño del salón.</small>
        </div>
      </div>
    `;

    content.appendChild(card);
  }

  const prevRenderProfileV15 = renderProfile;
  renderProfile = function() {
    if (!v15IsOwner()) {
      setTitle('Mi usuario','Datos de acceso');
      const u = v15CurrentUser();
      $('#content').innerHTML = `
        <div class="card">
          <div class="section-title"><h3>${esc(u?.name || 'Usuario')}</h3></div>
          <p><b>Rol:</b> ${esc(V15_ROLE_LABELS[u?.accessRole] || 'Operador')}</p>
          <p><b>Email:</b> ${esc(u?.email || '')}</p>
        </div>
      `;
      return;
    }

    prevRenderProfileV15();
    setTimeout(v15AppendUsersPanel, 0);
  };

  window.openSalonUserV15 = function(uid='') {
    if (!v15IsOwner()) return toast('Solo el dueño del salón puede administrar usuarios');

    const u = uid ? (data.salonUsers || []).find(x => x.id === uid) : null;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>${u ? 'Editar usuario' : 'Crear usuario'}</h2>
          <p>Acceso interno del salón</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v15-user-form">
        <div class="form-grid">
          <div class="field">
            <label>Nombre</label>
            <input name="name" required value="${esc(u?.name || '')}">
          </div>

          <div class="field">
            <label>Email</label>
            <input name="email" type="email" required value="${esc(u?.email || '')}">
          </div>

          <div class="field">
            <label>Rol</label>
            <select name="accessRole">
              <option value="general" ${u?.accessRole==='general'?'selected':''}>Operador general</option>
              <option value="reservas" ${u?.accessRole==='reservas'?'selected':''}>Reservas</option>
              <option value="caja" ${u?.accessRole==='caja'?'selected':''}>Caja / Finanzas</option>
              <option value="stock" ${u?.accessRole==='stock'?'selected':''}>Stock / Proveedores</option>
            </select>
          </div>

          <div class="field">
            <label>${u ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
            <input name="password" type="password" ${u ? '' : 'required'} minlength="4">
          </div>
        </div>

        <div class="card" style="margin-top:12px;padding:12px">
          <small class="muted">
            Operador general: carga general. Reservas: agenda y fiestas.
            Caja: finanzas, cobros y proveedores. Stock: stock y proveedores.
          </small>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">${u ? 'Guardar cambios' : 'Crear usuario'}</button>
        </div>
      </form>
    `);

    $('#v15-user-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const email = String(f.email || '').toLowerCase().trim();

      const duplicateSalon = (data.salons || []).some(s =>
        String(s.email || '').toLowerCase() === email
      );

      const duplicateUser = (data.salonUsers || []).some(x =>
        x.id !== u?.id && String(x.email || '').toLowerCase() === email
      );

      if (duplicateSalon || duplicateUser) {
        return toast('Ese email ya está registrado');
      }

      if (u) {
        u.name = f.name;
        u.email = email;
        u.accessRole = f.accessRole;
        if (f.password) u.password = f.password;
      } else {
        data.salonUsers.push({
          id:id(),
          salonId:session.salonId,
          name:f.name,
          email,
          password:f.password,
          accessRole:f.accessRole || 'general',
          status:'Activo',
          createdAt:new Date().toISOString()
        });
      }

      save();
      closeModal();
      toast(u ? 'Usuario actualizado' : 'Usuario creado');
      renderProfile();
    };
  };

  window.toggleSalonUserV15 = function(uid) {
    if (!v15IsOwner()) return toast('Solo el dueño del salón puede administrar usuarios');

    const u = (data.salonUsers || []).find(x => x.id === uid);
    if (!u) return;

    u.status = u.status === 'Inactivo' ? 'Activo' : 'Inactivo';
    save();
    renderProfile();
    toast(`Usuario ${u.status === 'Activo' ? 'activado' : 'desactivado'}`);
  };

  window.deleteSalonUserV15 = function(uid) {
    if (!v15IsOwner()) return toast('Solo el dueño del salón puede administrar usuarios');

    const u = (data.salonUsers || []).find(x => x.id === uid);
    if (!u) return;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>Borrar usuario</h2>
          <p>${esc(u.name)}</p>
        </div>
      </div>

      <form id="v15-delete-user-form">
        <div class="field">
          <label>Contraseña administrativa del salón</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required></textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Borrar usuario</button>
        </div>
      </form>
    `);

    $('#v15-delete-user-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const s = salon();

      if (String(f.password || '') !== String(s?.password || '')) {
        return toast('Contraseña incorrecta');
      }

      data.salonUsers = (data.salonUsers || []).filter(x => x.id !== uid);

      data.auditLog = data.auditLog || [];
      data.auditLog.push({
        id:id(),
        salonId:session.salonId,
        action:'Borrar usuario interno',
        reason:f.reason,
        userName:u.name,
        userEmail:u.email,
        createdAt:new Date().toISOString()
      });

      save();
      closeModal();
      toast('Usuario eliminado');
      renderProfile();
    };
  };

})();


// ============================================================
// V16 - FIX REAL: USUARIOS VISIBLES + RESET FINANCIERO TOTAL
// ============================================================
(function () {
  'use strict';

  data.salonUsers = data.salonUsers || [];
  data.auditLog = data.auditLog || [];

  function v16IsOwner() {
    return session?.role === 'salon' && !session?.salonUserId;
  }

  function v16SalonUsers() {
    return (data.salonUsers || []).filter(u => u.salonId === session?.salonId);
  }

  function v16OwnerPasswordOk(pass) {
    const s = typeof salon === 'function' ? salon() : null;
    return !!s && String(s.password || '') === String(pass || '');
  }

  // ----------------------------------------------------------
  // NUEVA VISTA VISIBLE EN MENU: USUARIOS Y ROLES
  // ----------------------------------------------------------
  try {
    if (Array.isArray(salonNav) && !salonNav.some(x => x[0] === 'users')) {
      const profileIndex = salonNav.findIndex(x => x[0] === 'profile');
      const pos = profileIndex >= 0 ? profileIndex : salonNav.length;
      salonNav.splice(pos, 0, ['users','👤','Usuarios y roles']);
    }
  } catch (_) {}

  window.renderUsersV16 = function () {
    if (!v16IsOwner()) {
      setTitle('Usuarios y roles','Acceso restringido');
      $('#content').innerHTML = `
        <div class="card"><div class="empty">
          Solo el administrador del salón puede administrar usuarios.
        </div></div>`;
      return;
    }

    const users = v16SalonUsers();

    setTitle('Usuarios y roles','Usuarios internos del salón');
    $('#content').innerHTML = `
      <div class="toolbar">
        <button class="primary" onclick="openUserV16()">+ Crear usuario</button>
      </div>

      <div class="card">
        <div class="section-title">
          <div>
            <h3>Usuarios del salón</h3>
            <small class="muted">Cada empleado entra con su propio email y contraseña.</small>
          </div>
        </div>

        ${
          users.length ? `
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  ${users.map(u => `
                    <tr>
                      <td><b>${esc(u.name || '')}</b></td>
                      <td>${esc(u.email || '')}</td>
                      <td>${esc(
                        u.accessRole === 'reservas' ? 'Reservas' :
                        u.accessRole === 'caja' ? 'Caja / Finanzas' :
                        u.accessRole === 'stock' ? 'Stock / Proveedores' :
                        'Operador general'
                      )}</td>
                      <td>${esc(u.status || 'Activo')}</td>
                      <td>
                        <button class="secondary small" onclick="openUserV16('${esc(u.id)}')">Editar</button>
                        <button class="ghost small" onclick="toggleUserV16('${esc(u.id)}')">
                          ${u.status === 'Inactivo' ? 'Activar' : 'Desactivar'}
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `<div class="empty">Todavía no hay usuarios internos.</div>`
        }
      </div>
    `;
  };

  const prevRenderSalonViewV16 = renderSalonView;
  renderSalonView = function () {
    if (view === 'users') return window.renderUsersV16();
    return prevRenderSalonViewV16();
  };

  window.openUserV16 = function(uid='') {
    if (!v16IsOwner()) return toast('Solo el administrador del salón puede crear usuarios');

    const u = uid ? (data.salonUsers || []).find(x => x.id === uid) : null;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>${u ? 'Editar usuario' : 'Crear usuario'}</h2>
          <p>Usuario interno del salón</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v16-user-form">
        <div class="form-grid">
          <div class="field">
            <label>Nombre</label>
            <input name="name" required value="${esc(u?.name || '')}">
          </div>
          <div class="field">
            <label>Email</label>
            <input name="email" type="email" required value="${esc(u?.email || '')}">
          </div>
          <div class="field">
            <label>Rol</label>
            <select name="accessRole">
              <option value="general" ${u?.accessRole==='general'?'selected':''}>Operador general</option>
              <option value="reservas" ${u?.accessRole==='reservas'?'selected':''}>Reservas</option>
              <option value="caja" ${u?.accessRole==='caja'?'selected':''}>Caja / Finanzas</option>
              <option value="stock" ${u?.accessRole==='stock'?'selected':''}>Stock / Proveedores</option>
            </select>
          </div>
          <div class="field">
            <label>${u ? 'Nueva contraseña (dejar vacío para mantener)' : 'Contraseña'}</label>
            <input name="password" type="password" ${u ? '' : 'required'}>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">${u ? 'Guardar' : 'Crear usuario'}</button>
        </div>
      </form>
    `);

    $('#v16-user-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const email = String(f.email || '').trim().toLowerCase();

      const duplicateSalon = (data.salons || []).some(s => String(s.email || '').trim().toLowerCase() === email);
      const duplicateUser = (data.salonUsers || []).some(x => x.id !== u?.id && String(x.email || '').trim().toLowerCase() === email);

      if (duplicateSalon || duplicateUser) return toast('Ese email ya está registrado');

      if (u) {
        u.name = f.name;
        u.email = email;
        u.accessRole = f.accessRole || 'general';
        if (f.password) u.password = f.password;
      } else {
        data.salonUsers.push({
          id:id(),
          salonId:session.salonId,
          name:f.name,
          email,
          password:f.password,
          accessRole:f.accessRole || 'general',
          status:'Activo',
          createdAt:new Date().toISOString()
        });
      }

      save();
      closeModal();
      toast(u ? 'Usuario actualizado' : 'Usuario creado');
      renderUsersV16();
    };
  };

  window.toggleUserV16 = function(uid) {
    if (!v16IsOwner()) return;
    const u = (data.salonUsers || []).find(x => x.id === uid);
    if (!u) return;
    u.status = u.status === 'Inactivo' ? 'Activo' : 'Inactivo';
    save();
    renderUsersV16();
  };

  // ----------------------------------------------------------
  // RESET TOTAL REAL DE FINANZAS Y STOCK
  // ----------------------------------------------------------
  window.resetEverythingV16 = function () {
    if (!v16IsOwner()) return toast('Solo el administrador del salón puede hacer este reset');

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🔄 Volver finanzas y stock a cero</h2>
          <p>Este reset deja realmente todos los importes financieros en $0.</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v16-reset-form">
        <div class="field">
          <label>Contraseña administrativa del salón</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required placeholder="Ej: borrar movimientos de prueba e iniciar operación real"></textarea>
        </div>

        <div class="admin-notice attention">
          <span>⚠️</span>
          <div>
            <b>Se pondrá todo lo financiero de este salón en cero.</b>
            <small>No se borran el salón, los proveedores, el personal, los productos ni las fiestas.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Confirmar reset total</button>
        </div>
      </form>
    `);

    $('#v16-reset-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));

      if (!v16OwnerPasswordOk(f.password)) return toast('Contraseña incorrecta');
      if (!String(f.reason || '').trim()) return toast('Ingresá el motivo');

      const sid = session.salonId;
      const salonEventIds = new Set(
        (data.events || []).filter(e => e.salonId === sid).map(e => e.id)
      );

      // 1) Borra movimientos reales y automáticos del salón.
      data.movements = (data.movements || []).filter(m => m.salonId !== sid);

      // 2) Borra historial de compras, pero conserva catálogo de productos.
      data.stockPurchases = (data.stockPurchases || []).filter(c => c.salonId !== sid);

      // 3) Stock físico a cero.
      (data.stockProducts || []).forEach(p => {
        if (p.salonId === sid) p.stock = 0;
      });

      // 4) Elimina asignaciones financieras de fiestas existentes para que
      //    los sincronizadores viejos no vuelvan a generar gastos.
      data.assignments = (data.assignments || []).filter(a => !salonEventIds.has(a.eventId));

      // 5) Deja cada reserva existente financieramente en cero,
      //    conservando fecha, cliente, horarios y datos generales.
      (data.events || []).forEach(e => {
        if (e.salonId !== sid) return;

        e.paid = 0;
        e.baseTotal = 0;
        e.total = 0;
        e.extras = [];
        e.extrasTotal = 0;
        e.stockItems = [];
        e.stockItemsTotal = 0;

        if (e.finalNumbers) {
          e.finalNumbers.total = 0;
          e.finalNumbers.paid = 0;
          e.finalNumbers.balance = 0;
          e.finalNumbers.staffCost = 0;
          e.finalNumbers.supplierCost = 0;
          e.finalNumbers.net = 0;
        }
      });

      // 6) Proveedores se conservan, saldo a cero.
      (data.suppliers || []).forEach(p => {
        if (p.salonId === sid) p.balance = 0;
      });

      // 7) Pedidos se conservan como datos, pero sin pago financiero.
      (data.orders || []).forEach(o => {
        if (o.salonId === sid || salonEventIds.has(o.eventId)) {
          o.paidAt = null;
          o.paymentMethod = '';
          o.paymentReference = '';
          o.paidAmount = 0;
          if (o.status === 'Pagado') o.status = 'Pendiente';
        }
      });

      data.auditLog.push({
        id:id(),
        salonId:sid,
        action:'RESET TOTAL FINANZAS Y STOCK',
        reason:String(f.reason || '').trim(),
        createdAt:new Date().toISOString()
      });

      save();
      closeModal();
      toast('Finanzas y stock quedaron en cero');
      renderSalonShell();

      setTimeout(() => {
        try {
          view = 'finance';
          renderSalonView();
        } catch (_) {}
      }, 100);
    };
  };

  // Último override para que el botón siempre ejecute el reset correcto V16.
  const prevFinanceV16 = renderFinance;
  renderFinance = function () {
    prevFinanceV16();

    const content = document.querySelector('#content');
    if (!content) return;

    // Quita botones anteriores de reset para evitar ejecutar lógica vieja.
    [...content.querySelectorAll('button')].forEach(btn => {
      const txt = String(btn.textContent || '').toLowerCase();
      if (txt.includes('volver movimientos') || txt.includes('stock a cero') || txt.includes('puesta a cero')) {
        btn.remove();
      }
    });

    const bar = document.createElement('div');
    bar.className = 'toolbar';
    bar.style.marginBottom = '16px';
    bar.innerHTML = `
      <button class="danger" onclick="resetEverythingV16()">
        🔄 Volver TODO finanzas y stock a cero
      </button>
    `;
    content.prepend(bar);
  };

})();


// ============================================================
// V17 - RESET PERSISTENTE: EVITA QUE WRAPPERS VIEJOS RECREEN DATOS
// ============================================================
(function () {
  'use strict';

  data.financeResets = data.financeResets || [];

  function v17ResetForSalon(sid) {
    return (data.financeResets || []).find(r => r.salonId === sid && r.active);
  }

  function v17ForceZero(sid) {
    const salonEventIds = new Set(
      (data.events || []).filter(e => e.salonId === sid).map(e => e.id)
    );

    data.movements = (data.movements || []).filter(m => m.salonId !== sid);
    data.stockPurchases = (data.stockPurchases || []).filter(c => c.salonId !== sid);
    data.assignments = (data.assignments || []).filter(a => !salonEventIds.has(a.eventId));

    (data.stockProducts || []).forEach(p => {
      if (p.salonId === sid) p.stock = 0;
    });

    (data.events || []).forEach(e => {
      if (e.salonId !== sid) return;
      e.paid = 0;
      e.baseTotal = 0;
      e.total = 0;
      e.extras = [];
      e.extrasTotal = 0;
      e.stockItems = [];
      e.stockItemsTotal = 0;
      e.financeResetLocked = true;

      if (e.finalNumbers) {
        e.finalNumbers.total = 0;
        e.finalNumbers.paid = 0;
        e.finalNumbers.balance = 0;
        e.finalNumbers.staffCost = 0;
        e.finalNumbers.supplierCost = 0;
        e.finalNumbers.net = 0;
      }
    });

    (data.suppliers || []).forEach(p => {
      if (p.salonId === sid) p.balance = 0;
    });

    (data.orders || []).forEach(o => {
      if (o.salonId === sid || salonEventIds.has(o.eventId)) {
        o.paidAt = null;
        o.paymentMethod = '';
        o.paymentReference = '';
        o.paidAmount = 0;
        if (o.status === 'Pagado') o.status = 'Pendiente';
      }
    });
  }

  // Reemplazo final del reset V16.
  window.resetEverythingV16 = function () {
    if (session?.role !== 'salon' || session?.salonUserId) {
      return toast('Solo el administrador del salón puede hacer este reset');
    }

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🔄 Volver TODO a cero</h2>
          <p>Limpieza definitiva de movimientos financieros y stock.</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v17-reset-form">
        <div class="field">
          <label>Contraseña administrativa</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required placeholder="Ej: eliminar datos de prueba e iniciar desde cero"></textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Confirmar y dejar todo en cero</button>
        </div>
      </form>
    `);

    document.querySelector('#v17-reset-form').onsubmit = async ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const s = salon();

      if (String(f.password || '') !== String(s?.password || '')) {
        return toast('Contraseña incorrecta');
      }

      const sid = session.salonId;

      data.financeResets = (data.financeResets || []).filter(r => r.salonId !== sid);
      data.financeResets.push({
        id:id(),
        salonId:sid,
        active:true,
        reason:String(f.reason || '').trim(),
        createdAt:new Date().toISOString()
      });

      v17ForceZero(sid);

      data.auditLog = data.auditLog || [];
      data.auditLog.push({
        id:id(),
        salonId:sid,
        action:'RESET TOTAL PERSISTENTE',
        reason:String(f.reason || '').trim(),
        createdAt:new Date().toISOString()
      });

      // Primer guardado.
      await Promise.resolve(save());

      // Los wrappers viejos pueden volver a crear movimientos unas décimas
      // después. Los neutralizamos y guardamos nuevamente.
      [250, 800, 1600].forEach(ms => {
        setTimeout(() => {
          const reset = v17ResetForSalon(sid);
          if (!reset) return;
          v17ForceZero(sid);
          save();
          if (ms === 1600) {
            closeModal();
            toast('Finanzas y stock quedaron definitivamente en cero');
            try {
              view = 'finance';
              renderSalonShell();
            } catch (_) {}
          }
        }, ms);
      });
    };
  };

  // Mientras el reset está activo, si un wrapper viejo intenta reconstruir
  // datos al entrar en Finanzas, se vuelve a limpiar antes de mostrar.
  const prevFinanceV17 = renderFinance;
  renderFinance = function () {
    const sid = session?.salonId;
    if (sid && v17ResetForSalon(sid)) {
      v17ForceZero(sid);
    }
    prevFinanceV17();

    if (sid && v17ResetForSalon(sid)) {
      // Los renderizadores anteriores pueden haber agregado movimientos.
      v17ForceZero(sid);

      const cards = document.querySelectorAll('#content .card.stat strong');
      cards.forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.includes('$')) el.textContent = money(0);
      });
    }
  };

  // Al recargar la página, respeta el reset guardado.
  setTimeout(() => {
    try {
      const sid = session?.salonId;
      if (sid && v17ResetForSalon(sid)) {
        v17ForceZero(sid);
        save();
      }
    } catch (_) {}
  }, 1800);

  // Cuando se guarda una NUEVA fiesta después del reset, se desactiva el
  // bloqueo persistente para que desde ese momento la operatoria vuelva
  // a registrar importes normalmente.
  const prevEventFormV17 = window.openEventForm;
  window.openEventForm = function(eid) {
    const before = new Set((data.events || []).map(e => e.id));
    prevEventFormV17(eid);

    const form = document.querySelector('#event-form-v10') || document.querySelector('#event-form');
    if (!form) return;

    const oldSubmit = form.onsubmit;
    form.onsubmit = function(ev) {
      const result = oldSubmit ? oldSubmit.call(form, ev) : undefined;

      setTimeout(() => {
        const sid = session?.salonId;
        const reset = sid ? v17ResetForSalon(sid) : null;
        if (!reset) return;

        // Solo una fiesta nueva inicia la nueva etapa financiera.
        const created = (data.events || []).find(e => e.salonId === sid && !before.has(e.id));
        if (created) {
          reset.active = false;
          created.financeResetLocked = false;
          save();
        }
      }, 100);

      return result;
    };
  };

})();


// ============================================================
// V18 - BOTONES PERSISTENTES: VOLVER + CERRAR SESIÓN
// ============================================================
(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .fc-persistent-actions{
      display:flex;
      gap:8px;
      align-items:center;
      flex-wrap:wrap;
    }
    .fc-persistent-actions .fc-back-btn,
    .fc-persistent-actions .fc-logout-btn{
      white-space:nowrap;
    }
    @media (max-width:760px){
      .fc-persistent-actions{
        width:100%;
        justify-content:flex-end;
        margin-top:8px;
      }
    }
  `;
  document.head.appendChild(style);

  function ensurePersistentActions() {
    if (session?.role !== 'salon') return;

    const topbar = document.querySelector('.salon-shell .topbar');
    if (!topbar) return;

    let actions = topbar.querySelector('.top-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'top-actions';
      topbar.appendChild(actions);
    }

    let holder = actions.querySelector('.fc-persistent-actions');
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'fc-persistent-actions';
      actions.prepend(holder);
    }

    if (!holder.querySelector('.fc-back-btn')) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'ghost fc-back-btn';
      back.textContent = '← Volver';
      back.onclick = () => {
        try {
          const modal = document.querySelector('#modal');
          if (modal && modal.open) {
            closeModal();
            return;
          }
        } catch (_) {}

        if (typeof view !== 'undefined' && view !== 'dashboard') {
          view = 'dashboard';
          renderSalonShell();
        } else {
          renderSalonShell();
        }
      };
      holder.appendChild(back);
    }

    if (!holder.querySelector('.fc-logout-btn')) {
      const out = document.createElement('button');
      out.type = 'button';
      out.className = 'secondary fc-logout-btn';
      out.textContent = 'Cerrar sesión';
      out.onclick = () => {
        if (typeof logout === 'function') logout();
        else {
          try {
            setSession(null);
            render();
          } catch (_) {
            sessionStorage.clear();
            location.reload();
          }
        }
      };
      holder.appendChild(out);
    }

    // También garantiza el botón del pie lateral si algún render lo eliminó.
    const sideFoot = document.querySelector('.salon-shell .side-foot');
    if (sideFoot && !sideFoot.querySelector('.logout')) {
      const btn = document.createElement('button');
      btn.className = 'logout';
      btn.textContent = 'Cerrar sesión';
      btn.onclick = () => typeof logout === 'function' ? logout() : location.reload();
      sideFoot.appendChild(btn);
    }
  }

  // Lo agrega al entrar y después de cada reconstrucción de pantalla.
  const prevShellV18 = renderSalonShell;
  renderSalonShell = function () {
    const r = prevShellV18();
    setTimeout(ensurePersistentActions, 0);
    setTimeout(ensurePersistentActions, 100);
    return r;
  };

  // Si cualquier pantalla o wrapper reemplaza el DOM, vuelve a colocarlos.
  const observer = new MutationObserver(() => {
    try { ensurePersistentActions(); } catch (_) {}
  });

  observer.observe(document.documentElement, {
    childList:true,
    subtree:true
  });

  setTimeout(ensurePersistentActions, 300);

})();


// ============================================================
// V19 - STOCK EDITAR/BORRAR + DASHBOARD RESPETA RESET FINANCIERO
// ============================================================
(function () {
  'use strict';

  data.stockProducts = data.stockProducts || [];
  data.stockPurchases = data.stockPurchases || [];
  data.financeResets = data.financeResets || [];
  data.auditLog = data.auditLog || [];

  function v19SalonProducts() {
    return (data.stockProducts || []).filter(p => p.salonId === session?.salonId);
  }

  function v19Product(pid) {
    return (data.stockProducts || []).find(p => p.id === pid && p.salonId === session?.salonId);
  }

  function v19ResetActive() {
    return (data.financeResets || []).some(r => r.salonId === session?.salonId && r.active);
  }

  function v19ForceFinancialZero() {
    const sid = session?.salonId;
    if (!sid) return;

    const eventIds = new Set(
      (data.events || []).filter(e => e.salonId === sid).map(e => e.id)
    );

    // movimientos reales / automáticos
    data.movements = (data.movements || []).filter(m => m.salonId !== sid);

    // asignaciones que generan gastos automáticos
    data.assignments = (data.assignments || []).filter(a => !eventIds.has(a.eventId));

    // reservas: conservar datos operativos, limpiar números financieros
    (data.events || []).forEach(e => {
      if (e.salonId !== sid) return;
      e.paid = 0;
      e.baseTotal = 0;
      e.total = 0;
      e.extras = [];
      e.extrasTotal = 0;
      e.stockItems = [];
      e.stockItemsTotal = 0;
      e.financeResetLocked = true;

      if (e.finalNumbers) {
        e.finalNumbers.total = 0;
        e.finalNumbers.paid = 0;
        e.finalNumbers.balance = 0;
        e.finalNumbers.staffCost = 0;
        e.finalNumbers.supplierCost = 0;
        e.finalNumbers.net = 0;
      }
    });

    // saldos proveedor
    (data.suppliers || []).forEach(p => {
      if (p.salonId === sid) p.balance = 0;
    });
  }

  // ----------------------------------------------------------
  // STOCK - EDICIÓN COMPLETA
  // ----------------------------------------------------------
  window.editStockProductV19 = function(pid) {
    const p = v19Product(pid);
    if (!p) return toast('Producto no encontrado');

    showModal(`
      <div class="modal-title">
        <div>
          <h2>✏️ Editar producto</h2>
          <p>${esc(p.name || '')}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v19-stock-edit-form">
        <div class="form-grid">
          <div class="field span2">
            <label>Producto</label>
            <input name="name" required value="${esc(p.name || '')}">
          </div>

          <div class="field span2">
            <label>Descripción</label>
            <input name="description" value="${esc(p.description || '')}" placeholder="Ej: botella 2,25 L">
          </div>

          <div class="field">
            <label>Categoría</label>
            <input name="category" value="${esc(p.category || '')}" placeholder="Bebidas">
          </div>

          <div class="field">
            <label>Stock actual</label>
            <input name="stock" type="number" min="0" step="1" value="${Number(p.stock || 0)}" required>
          </div>

          <div class="field">
            <label>Stock mínimo</label>
            <input name="minStock" type="number" min="0" step="1" value="${Number(p.minStock || 0)}">
          </div>

          <div class="field">
            <label>Costo unitario</label>
            <input name="costPrice" type="number" min="0" step="1" value="${Number(p.costPrice || 0)}">
          </div>

          <div class="field">
            <label>Precio de venta</label>
            <input name="salePrice" type="number" min="0" step="1" value="${Number(p.salePrice || 0)}">
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">Guardar cambios</button>
        </div>
      </form>
    `);

    document.querySelector('#v19-stock-edit-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));

      p.name = String(f.name || '').trim();
      p.description = String(f.description || '').trim();
      p.category = String(f.category || '').trim();
      p.stock = Number(f.stock || 0);
      p.minStock = Number(f.minStock || 0);
      p.costPrice = Number(f.costPrice || 0);
      p.salePrice = Number(f.salePrice || 0);
      p.updatedAt = new Date().toISOString();

      save();
      closeModal();
      toast('Producto actualizado');
      if (typeof renderStockV12 === 'function') renderStockV12();
      else renderSalonShell();
    };
  };

  // ----------------------------------------------------------
  // STOCK - BORRADO PROTEGIDO
  // ----------------------------------------------------------
  window.deleteStockProductV19 = function(pid) {
    const p = v19Product(pid);
    if (!p) return toast('Producto no encontrado');

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🗑 Borrar producto</h2>
          <p>${esc(p.name || '')}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v19-stock-delete-form">
        <div class="field">
          <label>Contraseña administrativa del salón</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required placeholder="Ej: producto cargado por error"></textarea>
        </div>

        <div class="admin-notice attention">
          <span>⚠️</span>
          <div>
            <b>Se eliminará el producto del catálogo de stock.</b>
            <small>Las fiestas ya cerradas conservan su detalle histórico.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Borrar producto</button>
        </div>
      </form>
    `);

    document.querySelector('#v19-stock-delete-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const s = salon();

      if (String(f.password || '') !== String(s?.password || '')) {
        return toast('Contraseña incorrecta');
      }

      data.stockProducts = (data.stockProducts || []).filter(x => x.id !== pid);

      data.auditLog.push({
        id:id(),
        salonId:session.salonId,
        action:'Borrar producto de stock',
        productId:pid,
        productName:p.name || '',
        reason:String(f.reason || '').trim(),
        createdAt:new Date().toISOString()
      });

      save();
      closeModal();
      toast('Producto eliminado');
      if (typeof renderStockV12 === 'function') renderStockV12();
      else renderSalonShell();
    };
  };

  // ----------------------------------------------------------
  // STOCK - agrega botones visibles Editar y Borrar en cada fila
  // ----------------------------------------------------------
  const prevStockV19 = window.renderStockV12;

  if (typeof prevStockV19 === 'function') {
    window.renderStockV12 = function() {
      prevStockV19();

      const rows = [...document.querySelectorAll('#content table tbody tr')];
      const products = v19SalonProducts();

      rows.forEach((tr, idx) => {
        const p = products[idx];
        if (!p) return;

        let actionCell = tr.querySelector('td:last-child');
        if (!actionCell) return;

        if (!actionCell.querySelector('[data-v19-edit-stock]')) {
          const edit = document.createElement('button');
          edit.className = 'secondary small';
          edit.setAttribute('data-v19-edit-stock','1');
          edit.textContent = '✏️ Editar';
          edit.onclick = () => editStockProductV19(p.id);
          actionCell.prepend(edit);
        }

        if (!actionCell.querySelector('[data-v19-delete-stock]')) {
          const del = document.createElement('button');
          del.className = 'danger small';
          del.style.marginLeft = '6px';
          del.setAttribute('data-v19-delete-stock','1');
          del.textContent = '🗑 Borrar';
          del.onclick = () => deleteStockProductV19(p.id);
          actionCell.appendChild(del);
        }
      });
    };

    // Si ya estamos en Stock al cargar V19, refresca la vista.
    setTimeout(() => {
      try {
        if (view === 'stock' && session?.role === 'salon') renderStockV12();
      } catch (_) {}
    }, 300);
  }

  // ----------------------------------------------------------
  // INICIO/DASHBOARD - SI HAY RESET ACTIVO, TODO FINANCIERO EN $0
  // ----------------------------------------------------------
  const prevDashboardV19 = renderDashboard;

  renderDashboard = function() {
    if (v19ResetActive()) {
      v19ForceFinancialZero();
    }

    prevDashboardV19();

    if (!v19ResetActive()) return;

    // Asegura visualmente que Inicio no muestre cifras financieras viejas.
    const cards = [...document.querySelectorAll('#content .card.stat')];

    cards.forEach(card => {
      const label = String(card.querySelector('small')?.textContent || '').toLowerCase();
      const value = card.querySelector('strong');
      const em = card.querySelector('em');

      if (!value) return;

      if (label.includes('facturado') || label.includes('cobrado') || label.includes('por cobrar')) {
        value.textContent = money(0);
        if (em) em.textContent =
          label.includes('cobrado') ? '0% del total' :
          label.includes('por cobrar') ? 'Sin saldos pendientes' :
          'Sin movimientos desde el reinicio';
      }
    });

    // Guarda otra vez el estado limpio por si wrappers viejos intentaron reconstruirlo.
    setTimeout(() => {
      if (!v19ResetActive()) return;
      v19ForceFinancialZero();
      save();
    }, 100);
  };

  // También limpia antes de cualquier render de salón.
  const prevSalonViewV19 = renderSalonView;
  renderSalonView = function() {
    if (v19ResetActive()) {
      v19ForceFinancialZero();
    }
    return prevSalonViewV19();
  };

  // Limpieza persistente al recargar.
  setTimeout(() => {
    try {
      if (session?.role === 'salon' && v19ResetActive()) {
        v19ForceFinancialZero();
        save();
        if (view === 'dashboard') renderDashboard();
      }
    } catch (_) {}
  }, 1400);

})();

// ============================================================
// V20 - RESTAURA "MI SALÓN" + EMAIL + SALDOS POST-RESET CORRECTOS
// ============================================================
(function () {
  'use strict';

  data.financeResets = data.financeResets || [];

  function v20IsOwner() {
    return session?.role === 'salon' && !session?.salonUserId;
  }

  function v20ResetRecord() {
    return (data.financeResets || [])
      .filter(r => r.salonId === session?.salonId)
      .sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  }

  function v20HasFinancialReset() {
    const r = v20ResetRecord();
    if (r) return true;
    return (data.events || []).some(e => e.salonId === session?.salonId && e.financeResetLocked);
  }

  function v20EnsureProfileNav() {
    if (!Array.isArray(salonNav)) return;
    if (!salonNav.some(x => x[0] === 'profile')) {
      salonNav.push(['profile','⚙️','Mi salón']);
    }
    const btn = document.querySelector('[data-v="profile"]');
    if (btn && v20IsOwner()) {
      btn.style.display = '';
      btn.hidden = false;
    }
  }

  const prevShellV20 = renderSalonShell;
  renderSalonShell = function() {
    const r = prevShellV20();
    setTimeout(v20EnsureProfileNav, 0);
    setTimeout(v20EnsureProfileNav, 100);
    return r;
  };

  async function v20LoadEmailStatus() {
    const s = salon();
    if (!s) return null;
    try {
      const r = await fetch(`/api/salon-email?salonId=${encodeURIComponent(s.id)}`, {cache:'no-store'});
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  function v20EmailPanel() {
    if (!v20IsOwner()) return;
    const content = document.querySelector('#content');
    if (!content || document.querySelector('#v20-email-settings')) return;

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'v20-email-settings';
    card.style.marginTop = '16px';
    card.innerHTML = `
      <div class="section-title">
        <div>
          <h3>✉️ Email de confirmación de reservas</h3>
          <small class="muted">Configurá el correo desde el que salen las confirmaciones del salón.</small>
        </div>
      </div>
      <div id="v20-email-status" class="admin-notice">
        <span>📧</span>
        <div><b>Estado del email</b><small>Cargando configuración...</small></div>
      </div>
      <div class="toolbar" style="margin-top:12px">
        <button class="primary" onclick="openEmailSettingsV20()">Configurar email</button>
      </div>
    `;
    content.appendChild(card);

    v20LoadEmailStatus().then(res => {
      const box = document.querySelector('#v20-email-status');
      if (!box) return;
      if (res?.configured) {
        box.innerHTML = `<span>✅</span><div><b>Email configurado</b><small>${esc(res.email || '')}${res.provider ? ' · ' + esc(res.provider) : ''}</small></div>`;
      } else {
        box.innerHTML = `<span>⚠️</span><div><b>Email sin configurar</b><small>Configurá Gmail, Outlook, Yahoo u otro SMTP.</small></div>`;
      }
    });
  }

  window.openEmailSettingsV20 = async function() {
    if (!v20IsOwner()) return toast('Solo el administrador del salón puede configurar el email');
    const current = await v20LoadEmailStatus() || {};

    showModal(`
      <div class="modal-title">
        <div><h2>✉️ Configurar email</h2><p>Confirmaciones de reserva del salón</p></div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>
      <form id="v20-email-form">
        <div class="form-grid">
          <div class="field">
            <label>Proveedor</label>
            <select name="provider">
              <option value="gmail" ${current.provider==='gmail'?'selected':''}>Gmail</option>
              <option value="outlook" ${current.provider==='outlook'?'selected':''}>Outlook / Hotmail</option>
              <option value="yahoo" ${current.provider==='yahoo'?'selected':''}>Yahoo</option>
              <option value="other" ${current.provider==='other'?'selected':''}>Otro SMTP</option>
            </select>
          </div>
          <div class="field">
            <label>Email remitente</label>
            <input name="email" type="email" required value="${esc(current.email || '')}">
          </div>
          <div class="field span2">
            <label>Contraseña / clave de aplicación</label>
            <input name="password" type="password" ${current.configured ? '' : 'required'} placeholder="${current.configured ? 'Dejar vacío para mantener la actual' : ''}">
          </div>
          <div class="field v20-custom-smtp">
            <label>Servidor SMTP</label>
            <input name="smtpHost" value="${esc(current.smtpHost || '')}" placeholder="smtp.ejemplo.com">
          </div>
          <div class="field v20-custom-smtp">
            <label>Puerto</label>
            <input name="smtpPort" type="number" value="${Number(current.smtpPort || 587)}">
          </div>
          <div class="field v20-custom-smtp">
            <label>Seguridad</label>
            <select name="smtpSecurity">
              <option value="starttls" ${current.smtpSecurity==='starttls'?'selected':''}>STARTTLS</option>
              <option value="ssl" ${current.smtpSecurity==='ssl'?'selected':''}>SSL</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">Guardar email</button>
        </div>
      </form>
    `);

    const form = document.querySelector('#v20-email-form');
    function toggleCustom() {
      const custom = form.querySelector('[name="provider"]').value === 'other';
      form.querySelectorAll('.v20-custom-smtp').forEach(el => el.style.display = custom ? '' : 'none');
    }
    form.querySelector('[name="provider"]').onchange = toggleCustom;
    toggleCustom();

    form.onsubmit = async ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const s = salon();
      try {
        const r = await fetch('/api/salon-email', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            salonId:s.id,
            provider:f.provider,
            email:f.email,
            password:f.password || '',
            smtpHost:f.smtpHost || '',
            smtpPort:Number(f.smtpPort || 587),
            smtpSecurity:f.smtpSecurity || 'starttls'
          }),
          cache:'no-store'
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok || !res.ok) throw new Error(res.error || 'No se pudo guardar');
        closeModal();
        toast('Email configurado');
        renderProfile();
      } catch (err) {
        toast(err.message || 'No se pudo guardar el email');
      }
    };
  };

  const prevProfileV20 = renderProfile;
  renderProfile = function() {
    prevProfileV20();
    setTimeout(v20EmailPanel, 0);
  };

  const prevDashboardV20 = renderDashboard;
  renderDashboard = function() {
    prevDashboardV20();
    if (!v20HasFinancialReset()) return;

    const content = document.querySelector('#content');
    if (!content) return;

    const reset = v20ResetRecord();
    const resetAt = reset?.createdAt || '';

    const events = (data.events || []).filter(e => {
      if (e.salonId !== session?.salonId) return false;
      if (e.financeResetLocked) return false;
      if (e.beforeFinanceReset) return false;
      if (resetAt && e.createdAt && String(e.createdAt) <= resetAt) return false;
      return true;
    });

    const billed = events.reduce((s,e) => s + Number(e.total || 0), 0);
    const paid = events.reduce((s,e) => s + Number(e.paid || 0), 0);
    const balance = Math.max(0, billed - paid);

    [...content.querySelectorAll('.card.stat')].forEach(card => {
      const label = String(card.querySelector('small')?.textContent || '').toLowerCase();
      const value = card.querySelector('strong');
      const em = card.querySelector('em');
      if (!value) return;

      if (label.includes('facturado')) {
        value.textContent = money(billed);
        if (em) em.textContent = billed ? 'Reservas posteriores al reinicio' : 'Sin movimientos desde el reinicio';
      }
      if (label.includes('cobrado')) {
        value.textContent = money(paid);
        if (em) em.textContent = billed ? `${Math.round(paid/billed*100)}% del total` : '0% del total';
      }
      if (label.includes('por cobrar')) {
        value.textContent = money(balance);
        if (em) em.textContent = balance ? 'Seguimiento de saldos' : 'Sin saldos pendientes';
      }
    });
  };

  setTimeout(() => {
    try {
      const sid = session?.salonId;
      if (!sid || !v20HasFinancialReset()) return;
      const reset = v20ResetRecord();
      const resetAt = reset?.createdAt || '';

      (data.events || []).forEach(e => {
        if (e.salonId !== sid) return;
        if (e.financeResetLocked) e.beforeFinanceReset = true;
        else if (resetAt && e.createdAt && String(e.createdAt) <= resetAt) e.beforeFinanceReset = true;
      });
      save();
    } catch (_) {}
  }, 700);

  const observerV20 = new MutationObserver(() => {
    try { v20EnsureProfileNav(); } catch (_) {}
  });
  observerV20.observe(document.documentElement, {childList:true,subtree:true});
})();


// ============================================================
// V21 - RESET CONTABLE TOTAL Y COHERENTE EN TODAS LAS PANTALLAS
// ============================================================
(function () {
  'use strict';

  data.financeResets = data.financeResets || [];
  data.movements = data.movements || [];
  data.stockPurchases = data.stockPurchases || [];
  data.accountingEpochs = data.accountingEpochs || [];
  data.auditLog = data.auditLog || [];

  function v21Sid() {
    return session?.salonId;
  }

  function v21LatestEpoch() {
    const sid = v21Sid();
    return (data.accountingEpochs || [])
      .filter(x => x.salonId === sid)
      .sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  }

  function v21HasReset() {
    return !!v21LatestEpoch();
  }

  function v21MarkExistingAsOld() {
    const sid = v21Sid();
    if (!sid) return;

    (data.events || []).forEach(e => {
      if (e.salonId === sid) e.beforeAccountingReset = true;
    });

    (data.orders || []).forEach(o => {
      if (o.salonId === sid) o.beforeAccountingReset = true;
    });

    (data.movements || []).forEach(m => {
      if (m.salonId === sid) m.beforeAccountingReset = true;
    });

    (data.stockPurchases || []).forEach(p => {
      if (p.salonId === sid) p.beforeAccountingReset = true;
    });
  }

  function v21HardZeroStoredAccounting() {
    const sid = v21Sid();
    if (!sid) return;

    const eventIds = new Set(
      (data.events || []).filter(e => e.salonId === sid).map(e => e.id)
    );

    // Contabilidad / caja
    data.movements = (data.movements || []).filter(m => m.salonId !== sid);
    data.stockPurchases = (data.stockPurchases || []).filter(p => p.salonId !== sid);

    // Personal asociado a fiestas anteriores: evita que vuelva a generar egresos automáticos.
    data.assignments = (data.assignments || []).filter(a => !eventIds.has(a.eventId));

    // Reservas: conservar la ficha, pero dejar toda su parte contable en cero.
    (data.events || []).forEach(e => {
      if (e.salonId !== sid) return;

      e.beforeAccountingReset = true;
      e.financeResetLocked = true;

      e.paid = 0;
      e.baseTotal = 0;
      e.total = 0;
      e.extrasTotal = 0;
      e.extras = [];
      e.stockItemsTotal = 0;
      e.stockItems = [];

      if (e.finalNumbers) {
        e.finalNumbers.total = 0;
        e.finalNumbers.paid = 0;
        e.finalNumbers.balance = 0;
        e.finalNumbers.staffCost = 0;
        e.finalNumbers.supplierCost = 0;
        e.finalNumbers.net = 0;
      }
    });

    // Proveedores: mantenerlos, pero sin saldo contable.
    (data.suppliers || []).forEach(s => {
      if (s.salonId === sid) {
        s.balance = 0;
        s.paid = 0;
        s.totalPaid = 0;
        s.totalPending = 0;
      }
    });

    // Pedidos: mantenerlos como historial, sin efecto contable.
    (data.orders || []).forEach(o => {
      if (o.salonId === sid || eventIds.has(o.eventId)) {
        o.beforeAccountingReset = true;
        o.paidAt = null;
        o.paymentMethod = '';
        o.paymentReference = '';
        o.paidAmount = 0;
        o.total = 0;
        o.amount = 0;
        o.balance = 0;
        if (o.status === 'Pagado') o.status = 'Pendiente';
      }
    });

    // Stock físico a cero, conservando productos.
    (data.stockProducts || []).forEach(p => {
      if (p.salonId === sid) p.stock = 0;
    });

    // Pagos de servicio del salón (si existen) fuera de la contabilidad del negocio.
    // No se borran, solo se evita que entren en indicadores del salón.
  }

  function v21ZeroDashboardVisuals() {
    const content = document.querySelector('#content');
    if (!content || !v21HasReset()) return;

    // Cero absoluto en todos los indicadores contables del Inicio.
    const accountingLabels = [
      'contratado','facturado','ingresado','cobrado','pendiente','por cobrar',
      'egresos','gastos','resultado','resultado de caja','saldo','ganancia',
      'ingresos'
    ];

    [...content.querySelectorAll('.card, .stat, .summary-card')].forEach(card => {
      const txt = String(card.textContent || '').toLowerCase();
      if (!accountingLabels.some(k => txt.includes(k))) return;

      // Solo toca números monetarios, no conteos de fiestas.
      card.querySelectorAll('strong, b, .amount, .value').forEach(el => {
        const t = String(el.textContent || '').trim();
        if (t.includes('$') || /\$\s*[\d.,]+/.test(t)) {
          el.textContent = money(0);
        }
      });
    });

    // Resultado de caja puede no usar las mismas clases.
    [...content.querySelectorAll('*')].forEach(el => {
      const label = String(el.textContent || '').trim().toLowerCase();
      if (label === 'ingresos' || label === 'egresos' || label === 'resultado') {
        const parent = el.parentElement;
        if (!parent) return;
        const candidates = [...parent.querySelectorAll('strong,b,span,div')]
          .filter(x => String(x.textContent || '').includes('$'));
        candidates.forEach(x => x.textContent = money(0));
      }
    });
  }

  // ----------------------------------------------------------
  // REEMPLAZA EL RESET: TODO CONTABLE EN CERO EN TODO EL SISTEMA
  // ----------------------------------------------------------
  window.resetEverythingV16 = function () {
    if (session?.role !== 'salon' || session?.salonUserId) {
      return toast('Solo el administrador del salón puede hacer este reset');
    }

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🔄 Poner TODA la contabilidad en cero</h2>
          <p>Reinicia caja, saldos, ingresos, egresos y stock del salón.</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v21-reset-form">
        <div class="field">
          <label>Contraseña administrativa</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required placeholder="Ej: finalizar pruebas y comenzar contabilidad real"></textarea>
        </div>

        <div class="admin-notice attention">
          <span>⚠️</span>
          <div>
            <b>Quedará en $0 en TODAS las pantallas.</b>
            <small>Contratado, ingresado, pendiente, egresos, resultado, finanzas, proveedores y stock.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Confirmar puesta a cero total</button>
        </div>
      </form>
    `);

    document.querySelector('#v21-reset-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const s = salon();

      if (String(f.password || '') !== String(s?.password || '')) {
        return toast('Contraseña incorrecta');
      }

      const sid = v21Sid();
      const now = new Date().toISOString();

      v21MarkExistingAsOld();

      data.accountingEpochs = (data.accountingEpochs || []).filter(x => x.salonId !== sid);
      data.accountingEpochs.push({
        id:id(),
        salonId:sid,
        createdAt:now,
        reason:String(f.reason || '').trim()
      });

      // Compatibilidad con versiones anteriores.
      data.financeResets = (data.financeResets || []).filter(r => r.salonId !== sid);
      data.financeResets.push({
        id:id(),
        salonId:sid,
        active:true,
        createdAt:now,
        reason:String(f.reason || '').trim()
      });

      v21HardZeroStoredAccounting();

      data.auditLog.push({
        id:id(),
        salonId:sid,
        action:'RESET CONTABLE TOTAL V21',
        reason:String(f.reason || '').trim(),
        createdAt:now
      });

      save();

      // Viejos sincronizadores intentan reconstruir datos. Los anulamos varias veces.
      [200, 700, 1500, 2500].forEach(ms => {
        setTimeout(() => {
          if (!v21HasReset()) return;
          v21HardZeroStoredAccounting();
          save();

          if (ms === 2500) {
            closeModal();
            toast('Toda la contabilidad quedó en cero');
            view = 'dashboard';
            renderSalonShell();
          }
        }, ms);
      });
    };
  };

  // ----------------------------------------------------------
  // INICIO: DESPUÉS DEL RESET, TODO CONTABLE EN CERO
  // ----------------------------------------------------------
  const prevDashboardV21 = renderDashboard;
  renderDashboard = function() {
    if (v21HasReset()) v21HardZeroStoredAccounting();
    prevDashboardV21();
    if (v21HasReset()) {
      v21HardZeroStoredAccounting();
      v21ZeroDashboardVisuals();
    }
  };

  // ----------------------------------------------------------
  // FINANZAS: TAMBIÉN GARANTIZA CERO
  // ----------------------------------------------------------
  const prevFinanceV21 = renderFinance;
  renderFinance = function() {
    if (v21HasReset()) v21HardZeroStoredAccounting();
    prevFinanceV21();

    if (!v21HasReset()) return;

    v21HardZeroStoredAccounting();

    const content = document.querySelector('#content');
    if (!content) return;

    [...content.querySelectorAll('.card.stat strong, .card.stat b, .amount, .value')].forEach(el => {
      const t = String(el.textContent || '');
      if (t.includes('$')) el.textContent = money(0);
    });

    // Libro de movimientos debe quedar vacío.
    [...content.querySelectorAll('tbody')].forEach(tb => {
      const tableText = String(tb.closest('table')?.textContent || '').toLowerCase();
      if (tableText.includes('movimiento') || tableText.includes('importe')) {
        tb.innerHTML = '';
      }
    });
  };

  // ----------------------------------------------------------
  // PROVEEDORES / STOCK: SALDOS Y VALORES CONTABLES EN CERO
  // ----------------------------------------------------------
  const prevSalonViewV21 = renderSalonView;
  renderSalonView = function() {
    if (v21HasReset()) v21HardZeroStoredAccounting();

    const r = prevSalonViewV21();

    if (v21HasReset()) {
      setTimeout(() => {
        const content = document.querySelector('#content');
        if (!content) return;

        // Solo pone en cero importes monetarios, no cantidades físicas excepto stock
        // que ya fue puesto a cero por el reset.
        [...content.querySelectorAll('strong,b,.amount,.value')].forEach(el => {
          const t = String(el.textContent || '').trim();
          if (t.includes('$')) el.textContent = money(0);
        });

        v21ZeroDashboardVisuals();
      }, 0);
    }

    return r;
  };

  // Persistencia al recargar.
  setTimeout(() => {
    try {
      if (session?.role === 'salon' && v21HasReset()) {
        v21HardZeroStoredAccounting();
        save();
        if (view === 'dashboard') {
          renderDashboard();
          v21ZeroDashboardVisuals();
        }
      }
    } catch (_) {}
  }, 1200);

})();


// ============================================================
// V22 - STOCK: BORRAR PRODUCTO + BORRAR COMPRA
// ============================================================
(function () {
  'use strict';

  data.stockProducts = data.stockProducts || [];
  data.stockPurchases = data.stockPurchases || [];
  data.auditLog = data.auditLog || [];

  function v22Product(pid) {
    return (data.stockProducts || []).find(p =>
      p.id === pid && p.salonId === session?.salonId
    );
  }

  function v22Purchase(cid) {
    return (data.stockPurchases || []).find(c =>
      c.id === cid && c.salonId === session?.salonId
    );
  }

  function v22OwnerPasswordOk(pass) {
    const s = salon();
    return !!s && String(s.password || '') === String(pass || '');
  }

  // ----------------------------------------------------------
  // BORRAR PRODUCTO
  // ----------------------------------------------------------
  window.deleteStockProductV22 = function(pid) {
    const p = v22Product(pid);
    if (!p) return toast('Producto no encontrado');

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🗑 Borrar producto</h2>
          <p>${esc(p.name || '')}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v22-delete-product-form">
        <div class="field">
          <label>Contraseña administrativa</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required placeholder="Ej: producto cargado por error"></textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Borrar producto</button>
        </div>
      </form>
    `);

    document.querySelector('#v22-delete-product-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));

      if (!v22OwnerPasswordOk(f.password)) {
        return toast('Contraseña incorrecta');
      }

      data.stockProducts = (data.stockProducts || []).filter(x => x.id !== pid);

      data.auditLog.push({
        id:id(),
        salonId:session.salonId,
        action:'BORRAR PRODUCTO STOCK',
        productId:pid,
        productName:p.name || '',
        reason:String(f.reason || '').trim(),
        createdAt:new Date().toISOString()
      });

      save();
      closeModal();
      toast('Producto eliminado');
      renderSalonShell();
    };
  };

  // ----------------------------------------------------------
  // BORRAR COMPRA
  // ----------------------------------------------------------
  window.deleteStockPurchaseV22 = function(cid) {
    const c = v22Purchase(cid);
    if (!c) return toast('Compra no encontrada');

    const p = (data.stockProducts || []).find(x => x.id === c.productId);

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🗑 Borrar compra</h2>
          <p>${esc(p?.name || c.productName || 'Compra de stock')}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <form id="v22-delete-purchase-form">
        <div class="field">
          <label>Contraseña administrativa</label>
          <input name="password" type="password" required>
        </div>

        <div class="field">
          <label>Motivo</label>
          <textarea name="reason" required placeholder="Ej: compra cargada duplicada"></textarea>
        </div>

        <div class="admin-notice attention">
          <span>⚠️</span>
          <div>
            <b>Se eliminará la compra.</b>
            <small>Si esa compra había sumado stock, también se descuenta esa cantidad del stock actual.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="danger">Borrar compra</button>
        </div>
      </form>
    `);

    document.querySelector('#v22-delete-purchase-form').onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));

      if (!v22OwnerPasswordOk(f.password)) {
        return toast('Contraseña incorrecta');
      }

      const qty = Number(c.quantity || c.qty || 0);

      if (p && qty > 0) {
        p.stock = Math.max(0, Number(p.stock || 0) - qty);
      }

      data.stockPurchases = (data.stockPurchases || []).filter(x => x.id !== cid);

      // Borra también el movimiento contable relacionado a esa compra si existe.
      data.movements = (data.movements || []).filter(m => {
        if (m.salonId !== session.salonId) return true;
        if (m.stockPurchaseId === cid) return false;
        if (m.sourceKey === `stock-purchase:${cid}`) return false;
        return true;
      });

      data.auditLog.push({
        id:id(),
        salonId:session.salonId,
        action:'BORRAR COMPRA STOCK',
        stockPurchaseId:cid,
        productName:p?.name || c.productName || '',
        quantity:qty,
        reason:String(f.reason || '').trim(),
        createdAt:new Date().toISOString()
      });

      save();
      closeModal();
      toast('Compra eliminada');
      renderSalonShell();
    };
  };

  // ----------------------------------------------------------
  // AGREGA BOTONES EN LA VISTA DE STOCK
  // ----------------------------------------------------------
  const prevStockV22 = window.renderStockV12;

  if (typeof prevStockV22 === 'function') {
    window.renderStockV12 = function() {
      prevStockV22();

      const products = (data.stockProducts || [])
        .filter(p => p.salonId === session?.salonId);

      const productRows = [...document.querySelectorAll('#content table tbody tr')];

      productRows.forEach((tr, idx) => {
        const p = products[idx];
        if (!p) return;

        const td = tr.querySelector('td:last-child');
        if (!td) return;

        if (!td.querySelector('[data-v22-delete-product]')) {
          const btn = document.createElement('button');
          btn.className = 'danger small';
          btn.setAttribute('data-v22-delete-product','1');
          btn.textContent = '🗑 Borrar producto';
          btn.style.marginLeft = '6px';
          btn.onclick = () => deleteStockProductV22(p.id);
          td.appendChild(btn);
        }
      });

      // Busca la sección de compras y agrega botón borrar compra por fila.
      const tables = [...document.querySelectorAll('#content table')];

      tables.forEach(table => {
        const head = String(table.querySelector('thead')?.textContent || '').toLowerCase();
        if (!head.includes('compra') && !head.includes('cantidad')) return;

        const purchases = (data.stockPurchases || [])
          .filter(c => c.salonId === session?.salonId)
          .sort((a,b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));

        const rows = [...table.querySelectorAll('tbody tr')];

        rows.forEach((tr, idx) => {
          const c = purchases[idx];
          if (!c) return;

          let td = tr.querySelector('td:last-child');
          if (!td) {
            td = document.createElement('td');
            tr.appendChild(td);
          }

          if (!td.querySelector('[data-v22-delete-purchase]')) {
            const btn = document.createElement('button');
            btn.className = 'danger small';
            btn.setAttribute('data-v22-delete-purchase','1');
            btn.textContent = '🗑 Borrar compra';
            btn.onclick = () => deleteStockPurchaseV22(c.id);
            td.appendChild(btn);
          }
        });
      });
    };
  }

  setTimeout(() => {
    try {
      if (view === 'stock' && session?.role === 'salon' && typeof renderStockV12 === 'function') {
        renderStockV12();
      }
    } catch (_) {}
  }, 300);

})();


// ============================================================
// V23 - STOCK REHECHO: EDITAR / BORRAR PRODUCTO / BORRAR COMPRA
// ============================================================
(function () {
  'use strict';

  data.stockProducts = data.stockProducts || [];
  data.stockPurchases = data.stockPurchases || [];
  data.movements = data.movements || [];
  data.auditLog = data.auditLog || [];

  function sid(){ return session?.salonId; }
  function products(){ return (data.stockProducts || []).filter(p => p.salonId === sid()); }
  function purchases(){ return (data.stockPurchases || []).filter(c => c.salonId === sid()); }
  function prod(idp){ return (data.stockProducts || []).find(p => p.id === idp && p.salonId === sid()); }

  window.renderStockV23 = function(){
    setTitle('Stock','Productos, cantidades, compras y costos');

    const ps = products();
    const buys = purchases().slice().sort((a,b)=>
      String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))
    );

    const totalUnits = ps.reduce((s,p)=>s+Number(p.stock||0),0);
    const stockValue = ps.reduce((s,p)=>s+(Number(p.stock||0)*Number(p.costPrice||0)),0);
    const low = ps.filter(p=>Number(p.stock||0)<=Number(p.minStock||0)).length;

    $('#content').innerHTML = `
      <div class="grid stats">
        <div class="card stat"><small>Productos</small><strong>${ps.length}</strong></div>
        <div class="card stat"><small>Unidades en stock</small><strong>${totalUnits}</strong></div>
        <div class="card stat"><small>Valor de stock a costo</small><strong>${money(stockValue)}</strong></div>
        <div class="card stat"><small>Stock bajo</small><strong class="${low?'bad':''}">${low}</strong></div>
      </div>

      <div class="toolbar" style="margin-top:16px">
        <button class="primary" onclick="openStockProductV23()">+ Agregar producto</button>
        <button class="secondary" onclick="openStockPurchaseV23()">🛒 Compra</button>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>Productos</h3>
            <small class="muted">Bebidas, aguas, gaseosas y otros productos del salón.</small>
          </div>
        </div>

        ${ps.length ? `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock</th>
                  <th>Mínimo</th>
                  <th>Costo</th>
                  <th>Venta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${ps.map(p=>`
                  <tr>
                    <td><b>${esc(p.name||'')}</b><small style="display:block">${esc(p.description||p.category||'')}</small></td>
                    <td class="${Number(p.stock||0)<=Number(p.minStock||0)?'bad':''}">${Number(p.stock||0)}</td>
                    <td>${Number(p.minStock||0)}</td>
                    <td>${money(p.costPrice||0)}</td>
                    <td>${money(p.salePrice||0)}</td>
                    <td>
                      <button class="secondary small" onclick="openStockProductV23('${esc(p.id)}')">✏️ Editar</button>
                      <button class="secondary small" onclick="openStockPurchaseV23('${esc(p.id)}')">Comprar</button>
                      <button class="danger small" onclick="deleteStockProductV23('${esc(p.id)}')">🗑 Borrar producto</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty">Todavía no hay productos cargados.</div>`}
      </div>

      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>Últimas compras</h3>
            <small class="muted">Cada compra aumenta automáticamente el stock.</small>
          </div>
        </div>

        ${buys.length ? `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Costo unitario</th>
                  <th>Total</th>
                  <th>Medio</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${buys.map(c=>{
                  const p=prod(c.productId);
                  const qty=Number(c.quantity ?? c.qty ?? 0);
                  const unit=Number(c.unitCost ?? c.costPrice ?? c.cost ?? 0);
                  const total=Number(c.total ?? (qty*unit));
                  return `
                    <tr>
                      <td>${esc(c.date || c.createdAt?.slice(0,10) || '-')}</td>
                      <td><b>${esc(p?.name || c.productName || 'Producto')}</b></td>
                      <td>${qty}</td>
                      <td>${money(unit)}</td>
                      <td>${money(total)}</td>
                      <td>${esc(c.method || c.paymentMethod || '-')}</td>
                      <td><button class="danger small" onclick="deleteStockPurchaseV23('${esc(c.id)}')">🗑 Borrar compra</button></td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty">Todavía no hay compras registradas.</div>`}
      </div>
    `;
  };

  window.openStockProductV23 = function(pid=''){
    const p = pid ? prod(pid) : null;
    showModal(`
      <div class="modal-title">
        <div><h2>${p?'Editar producto':'Agregar producto'}</h2><p>Stock del salón</p></div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>
      <form id="v23-product-form">
        <div class="form-grid">
          <div class="field span2"><label>Producto</label><input name="name" required value="${esc(p?.name||'')}"></div>
          <div class="field span2"><label>Descripción</label><input name="description" value="${esc(p?.description||'')}"></div>
          <div class="field"><label>Categoría</label><input name="category" value="${esc(p?.category||'')}"></div>
          <div class="field"><label>Stock actual</label><input name="stock" type="number" min="0" value="${Number(p?.stock||0)}"></div>
          <div class="field"><label>Stock mínimo</label><input name="minStock" type="number" min="0" value="${Number(p?.minStock||0)}"></div>
          <div class="field"><label>Costo</label><input name="costPrice" type="number" min="0" value="${Number(p?.costPrice||0)}"></div>
          <div class="field"><label>Venta</label><input name="salePrice" type="number" min="0" value="${Number(p?.salePrice||0)}"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">${p?'Guardar cambios':'Crear producto'}</button>
        </div>
      </form>
    `);
    $('#v23-product-form').onsubmit = ev=>{
      ev.preventDefault();
      const f=Object.fromEntries(new FormData(ev.target));
      if(p){
        Object.assign(p,{
          name:f.name, description:f.description||'', category:f.category||'',
          stock:Number(f.stock||0), minStock:Number(f.minStock||0),
          costPrice:Number(f.costPrice||0), salePrice:Number(f.salePrice||0),
          updatedAt:new Date().toISOString()
        });
      }else{
        data.stockProducts.push({
          id:id(), salonId:sid(), name:f.name, description:f.description||'',
          category:f.category||'', stock:Number(f.stock||0),
          minStock:Number(f.minStock||0), costPrice:Number(f.costPrice||0),
          salePrice:Number(f.salePrice||0), createdAt:new Date().toISOString()
        });
      }
      save(); closeModal(); toast(p?'Producto actualizado':'Producto creado'); renderStockV23();
    };
  };

  window.openStockPurchaseV23 = function(pid=''){
    const ps=products();
    if(!ps.length) return toast('Primero cargá un producto');

    showModal(`
      <div class="modal-title">
        <div><h2>Registrar compra</h2><p>La cantidad comprada se suma al stock.</p></div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>
      <form id="v23-purchase-form">
        <div class="form-grid">
          <div class="field span2">
            <label>Producto</label>
            <select name="productId" required>${ps.map(p=>`<option value="${esc(p.id)}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Cantidad</label><input name="quantity" type="number" min="1" required></div>
          <div class="field"><label>Costo unitario</label><input name="unitCost" type="number" min="0" required></div>
          <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
          <div class="field">
            <label>Medio de pago</label>
            <select name="method"><option>Efectivo</option><option>Transferencia</option><option>Mercado Pago</option><option>Tarjeta</option><option>Otro</option></select>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
          <button class="primary">Registrar compra</button>
        </div>
      </form>
    `);

    $('#v23-purchase-form').onsubmit=ev=>{
      ev.preventDefault();
      const f=Object.fromEntries(new FormData(ev.target));
      const p=prod(f.productId);
      if(!p) return toast('Producto no encontrado');
      const qty=Number(f.quantity||0), unit=Number(f.unitCost||0), total=qty*unit;
      const cid=id();
      p.stock=Number(p.stock||0)+qty;
      p.costPrice=unit || Number(p.costPrice||0);

      data.stockPurchases.push({
        id:cid, salonId:sid(), productId:p.id, productName:p.name,
        quantity:qty, unitCost:unit, total, date:f.date, method:f.method,
        createdAt:new Date().toISOString()
      });

      data.movements.push({
        id:id(), salonId:sid(), stockPurchaseId:cid,
        sourceKey:`stock-purchase:${cid}`, type:'Gasto', category:'Compra de stock',
        concept:`Compra ${p.name}`, amount:total, movementDate:f.date,
        method:f.method, createdAt:new Date().toISOString()
      });

      save(); closeModal(); toast('Compra registrada'); renderStockV23();
    };
  };

  window.deleteStockProductV23 = function(pid){
    const p=prod(pid); if(!p) return toast('Producto no encontrado');
    showModal(`
      <div class="modal-title"><div><h2>Borrar producto</h2><p>${esc(p.name)}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
      <form id="v23-del-prod">
        <div class="field"><label>Contraseña administrativa</label><input name="password" type="password" required></div>
        <div class="field"><label>Motivo</label><textarea name="reason" required></textarea></div>
        <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="danger">Borrar producto</button></div>
      </form>`);
    $('#v23-del-prod').onsubmit=ev=>{
      ev.preventDefault(); const f=Object.fromEntries(new FormData(ev.target));
      if(String(f.password||'')!==String(salon()?.password||'')) return toast('Contraseña incorrecta');
      data.stockProducts=(data.stockProducts||[]).filter(x=>x.id!==pid);
      data.auditLog.push({id:id(),salonId:sid(),action:'BORRAR PRODUCTO STOCK',productName:p.name,reason:f.reason,createdAt:new Date().toISOString()});
      save(); closeModal(); toast('Producto eliminado'); renderStockV23();
    };
  };

  window.deleteStockPurchaseV23 = function(cid){
    const c=(data.stockPurchases||[]).find(x=>x.id===cid && x.salonId===sid());
    if(!c) return toast('Compra no encontrada');
    const p=prod(c.productId);
    showModal(`
      <div class="modal-title"><div><h2>Borrar compra</h2><p>${esc(p?.name||c.productName||'Compra')}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
      <form id="v23-del-buy">
        <div class="field"><label>Contraseña administrativa</label><input name="password" type="password" required></div>
        <div class="field"><label>Motivo</label><textarea name="reason" required></textarea></div>
        <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="danger">Borrar compra</button></div>
      </form>`);
    $('#v23-del-buy').onsubmit=ev=>{
      ev.preventDefault(); const f=Object.fromEntries(new FormData(ev.target));
      if(String(f.password||'')!==String(salon()?.password||'')) return toast('Contraseña incorrecta');
      const qty=Number(c.quantity ?? c.qty ?? 0);
      if(p) p.stock=Math.max(0,Number(p.stock||0)-qty);
      data.stockPurchases=(data.stockPurchases||[]).filter(x=>x.id!==cid);
      data.movements=(data.movements||[]).filter(m=>m.stockPurchaseId!==cid && m.sourceKey!==`stock-purchase:${cid}`);
      data.auditLog.push({id:id(),salonId:sid(),action:'BORRAR COMPRA STOCK',productName:p?.name||c.productName||'',quantity:qty,reason:f.reason,createdAt:new Date().toISOString()});
      save(); closeModal(); toast('Compra eliminada'); renderStockV23();
    };
  };

  // Override final: Stock usa SIEMPRE esta vista, sin depender de wrappers anteriores.
  const prevSalonViewV23 = renderSalonView;
  renderSalonView = function(){
    if(view==='stock') return renderStockV23();
    return prevSalonViewV23();
  };

})();


// ==================== FIESTACONTROL V24 CONSOLIDADA ====================
(function(){
'use strict';
data.providerPayments=data.providerPayments||[];
data.communityMessages=data.communityMessages||[];
data.communityIdeas=data.communityIdeas||[];
data.movements=data.movements||[];
const SID=()=>session?.salonId, EV=()=>data.events.filter(x=>x.salonId===SID());
const OS=()=>data.orders.filter(x=>x.salonId===SID()&&x.v24);
const PP=()=>data.providerPayments.filter(x=>x.salonId===SID());
const PM=['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'];
const total=o=>(o.items||[]).reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitCost||0),0);
const own=()=>data.suppliers.filter(x=>x.salonId===SID());
const allSup=()=>{let a=[...own(),...(data.marketSuppliers||[]).filter(x=>x.status!=='Suspendido')],m=new Map();a.forEach(x=>m.set(x.id,x));return [...m.values()]};
const pname=o=>allSup().find(x=>x.id===o.supplierId)?.name||o.supplierName||'Proveedor';
const now=()=>new Date().toISOString();
function movement(x){data.movements.push({id:id(),salonId:SID(),createdAt:now(),...x})}

// PROVEEDORES + PEDIDOS + PAGOS
window.renderSuppliersV24=()=>{
 setTitle('Proveedores','Pedidos, pagos y entregas');
 let os=OS(),pp=PP(),pend=os.filter(o=>o.status==='Pendiente').reduce((s,o)=>s+total(o),0);
 $('#content').innerHTML=`<div class="grid stats">
 <div class="card stat"><small>Pedidos</small><strong>${os.length}</strong></div>
 <div class="card stat"><small>Pendiente de pago</small><strong>${money(pend)}</strong></div>
 <div class="card stat"><small>Pagado</small><strong>${money(pp.reduce((s,p)=>s+Number(p.amount||0),0))}</strong></div>
 <div class="card stat"><small>Pendiente entrega</small><strong>${os.filter(o=>o.status==='Pagado - pendiente de entrega').length}</strong></div></div>
 <div class="toolbar" style="margin-top:16px"><button class="primary" onclick="orderV24()">+ Nuevo pedido</button><button class="secondary" onclick="payProviderV24()">💳 Pagar pedido</button><button class="secondary" onclick="supplierV24()">+ Proveedor propio</button></div>
 <div class="card" style="margin-top:16px"><h3>Pedidos</h3>${os.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Proveedor</th><th>Destino</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${os.map(o=>`<tr><td>${esc(pname(o))}</td><td>${esc(o.destinationLabel)}</td><td>${money(total(o))}</td><td>${esc(o.status)}</td><td>${o.status==='Pendiente'?`<button class="primary small" onclick="payProviderV24('${o.id}')">Pagar</button>`:''}${o.status==='Pagado - pendiente de entrega'?`<button class="secondary small" onclick="deliverV24('${o.id}')">Entregado</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sin pedidos.</div>'}</div>
 <div class="card" style="margin-top:16px"><h3>Historial de pagos a proveedores</h3>${pp.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Pedido</th><th>Importe</th><th>Medio</th></tr></thead><tbody>${pp.slice().reverse().map(p=>`<tr><td>${p.createdAt.slice(0,10)}</td><td>${esc(p.providerName)}</td><td>${esc(p.orderCode)}</td><td>${money(p.amount)}</td><td>${esc(p.method)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sin pagos.</div>'}</div>
 <div class="card" style="margin-top:16px"><h3>Proveedores propios</h3>${own().map(p=>`<div class="today-event-row"><span>🚚</span><span><b>${esc(p.name)}</b><small>${esc(p.email||'Sin email')} · ${esc(p.phone||'')}</small></span></div>`).join('')||'<div class="empty">Sin proveedores propios.</div>'}</div>`;
};
window.supplierV24=()=>{showModal(`<div class="modal-title"><div><h2>Proveedor propio</h2></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="sf24"><div class="form-grid"><div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>WhatsApp</label><input name="phone"></div><div class="field"><label>Rubro</label><input name="category"></div></div><div class="form-actions"><button class="primary">Guardar</button></div></form>`);$('#sf24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));data.suppliers.push({id:id(),salonId:SID(),...f});save();closeModal();renderSuppliersV24()}};
window.orderV24=()=>{
 let ps=allSup(),es=EV().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));if(!ps.length)return toast('No hay proveedores cargados');
 showModal(`<div class="modal-title"><div><h2>Nuevo pedido</h2><p>Proveedor propio o de Comunidad</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="or24"><div class="form-grid">
 <div class="field span2"><label>Proveedor</label><select name="supplierId">${ps.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
 <div class="field"><label>Destino</label><select name="dest" id="dest24"><option>Stock</option><option>Fiesta</option></select></div>
 <div class="field" id="event24" style="display:none"><label>Fiesta</label><select name="eventId">${es.map(e=>`<option value="${e.id}">${e.date} · ${esc(e.child||e.client)}</option>`).join('')}</select></div></div>
 <div class="section-title"><h3>Ítems</h3><button type="button" class="secondary small" id="add24">+ Línea</button></div><div id="lines24"></div><div class="card"><b>Total: <span id="tot24">$ 0</span></b></div>
 <div class="form-actions"><button class="primary">Crear pedido pendiente</button></div></form>`);
 let box=$('#lines24');function calc(){let t=0;$$('.ln24',box).forEach(l=>{let q=Number(l.querySelector('[name=q]').value||0),u=Number(l.querySelector('[name=u]').value||0);t+=q*u;l.querySelector('[name=lt]').value=money(q*u)});$('#tot24').textContent=money(t)}
 function add(){let d=document.createElement('div');d.className='form-grid ln24';d.innerHTML=`<div class="field span2"><label>Descripción</label><input name="d" required></div><div class="field"><label>Cantidad</label><input name="q" type="number" min="1" value="1"></div><div class="field"><label>Costo unitario</label><input name="u" type="number" min="0" value="0"></div><div class="field"><label>Total</label><input name="lt" readonly></div><div class="field"><label>&nbsp;</label><button type="button" class="danger small">Quitar</button></div>`;box.appendChild(d);d.querySelector('button').onclick=()=>{d.remove();calc()};d.querySelectorAll('input').forEach(x=>x.oninput=calc);calc()}add();$('#add24').onclick=add;$('#dest24').onchange=e=>$('#event24').style.display=e.target.value==='Fiesta'?'':'none';
 $('#or24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target)),p=ps.find(x=>x.id===f.supplierId),event=es.find(x=>x.id===f.eventId),items=$$('.ln24',box).map(l=>({description:l.querySelector('[name=d]').value,qty:Number(l.querySelector('[name=q]').value),unitCost:Number(l.querySelector('[name=u]').value)}));data.orders.push({id:id(),code:'PED-'+Date.now().toString().slice(-6),salonId:SID(),v24:true,supplierId:f.supplierId,supplierName:p?.name||'',destinationType:f.dest,destinationLabel:f.dest==='Stock'?'Stock':`${event?.date||''} · ${event?.child||event?.client||''}`,eventId:f.dest==='Fiesta'?f.eventId:'',items,status:'Pendiente',createdAt:now()});save();closeModal();renderSuppliersV24()};
};
window.payProviderV24=(oid='')=>{let a=OS().filter(o=>o.status==='Pendiente');if(!a.length)return toast('No hay pedidos pendientes');showModal(`<div class="modal-title"><div><h2>Pagar pedido</h2></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="pay24"><div class="field"><label>Pedido</label><select name="oid" id="po24">${a.map(o=>`<option value="${o.id}" ${o.id===oid?'selected':''}>${esc(o.code)} · ${esc(pname(o))} · ${money(total(o))}</option>`).join('')}</select></div><div class="field"><label>Importe</label><input id="pa24" readonly></div><div class="field"><label>Medio</label><select name="method">${PM.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Estado</label><select name="status"><option>Pagado - pendiente de entrega</option><option>Entregado</option></select></div><div class="form-actions"><button class="primary">Registrar pago</button></div></form>`);let sel=$('#po24'),amt=$('#pa24');let sync=()=>amt.value=money(total(a.find(x=>x.id===sel.value)||{}));sel.onchange=sync;sync();$('#pay24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target)),o=a.find(x=>x.id===f.oid),v=total(o),p={id:id(),salonId:SID(),orderId:o.id,orderCode:o.code,providerName:pname(o),amount:v,method:f.method,createdAt:now()};data.providerPayments.push(p);o.status=f.status;o.paidAt=now();movement({type:'Gasto',category:'Proveedor',concept:`Pago ${o.code} ${pname(o)}`,amount:v,method:f.method,orderId:o.id});save();closeModal();renderSuppliersV24()}};
window.deliverV24=oid=>{let o=OS().find(x=>x.id===oid);if(o){o.status='Entregado';save();renderSuppliersV24()}};

// RESERVA V24 + NO SUPERPOSICIÓN
window.openEventFormV24=(eid='')=>{let x=eid?data.events.find(e=>e.id===eid):null;showModal(`<div class="modal-title"><div><h2>${x?'Editar':'Nueva'} fiesta</h2></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="ev24"><div class="form-grid">
<div class="field"><label>Nombre del cumpleañero</label><input name="child" required value="${esc(x?.child||'')}"></div><div class="field"><label>Edad que cumple</label><input name="age" type="number" value="${x?.age||''}"></div>
<div class="field"><label>Responsable del evento</label><input name="client" required value="${esc(x?.client||'')}"></div><div class="field"><label>Email del cliente</label><input name="email" type="email" required value="${esc(x?.email||'')}"></div>
<div class="field"><label>Fecha</label><input name="date" type="date" required value="${x?.date||todayKey()}"></div><div class="field"><label>Estado</label><select name="status">${['Consulta','Pendiente','Señada','Confirmada','Finalizada','Cancelada'].map(s=>`<option ${x?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
<div class="field"><label>Desde</label><input name="start" type="time" required value="${x?.start||''}"></div><div class="field"><label>Hasta</label><input name="end" type="time" required value="${x?.end||''}"></div>
<div class="field"><label>Invitados</label><input name="guests" type="number" value="${x?.guests||0}"></div><div class="field"><label>Precio de la fiesta</label><input name="total" type="number" value="${x?.total||0}"></div>
<div class="field"><label>Valor de la seña</label><input name="deposit" type="number" value="${x?.deposit||x?.paid||0}"></div><div class="field span2"><label>Notas</label><textarea name="notes">${esc(x?.notes||'')}</textarea></div></div><div class="card" id="same24"></div><div class="form-actions"><button class="primary">Guardar reserva</button></div></form>`);
 let f=$('#ev24'),same=$('#same24');function day(){let a=EV().filter(e=>e.id!==eid&&e.date===f.date.value&&e.status!=='Cancelada');same.innerHTML=`<b>Fiestas ya creadas ese día</b>${a.length?a.map(e=>`<div>${e.start}–${e.end} · ${esc(e.child||e.client)}</div>`).join(''):'<small>Día libre</small>'}`}f.date.onchange=day;day();
 f.onsubmit=e=>{e.preventDefault();let v=Object.fromEntries(new FormData(f));if(v.end<=v.start)return toast('Revisá el horario');let c=EV().find(e=>e.id!==eid&&e.date===v.date&&e.status!=='Cancelada'&&v.start<e.end&&v.end>e.start);if(c)return toast(`Se superpone con ${c.start} a ${c.end}`);let o=x||{id:id(),salonId:SID(),rsvps:[],createdAt:now()};Object.assign(o,v,{age:Number(v.age||0),guests:Number(v.guests||0),total:Number(v.total||0),deposit:Number(v.deposit||0),paid:Number(v.deposit||0)});if(o.status==='Señada')o.status='Confirmada';if(!x)data.events.push(o);if(Number(o.deposit)>0)movement({type:'Ingreso',category:'Seña',concept:`Seña ${o.child}`,amount:Number(o.deposit),eventId:o.id});save();closeModal();renderSalonShell()}};

// AGENDA TODOS LOS MESES/AÑOS
let cv24=new Date();
window.renderCalendarV24=()=>{let y=cv24.getFullYear(),m=cv24.getMonth(),names=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),c=[];for(let i=0;i<first;i++)c.push('<div class="day off"></div>');for(let n=1;n<=days;n++){let ds=`${y}-${String(m+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`,a=EV().filter(e=>e.date===ds&&e.status!=='Cancelada');c.push(`<button class="day fc-clickable-day" onclick="openAgendaDay('${ds}')"><div class="day-number">${n}</div>${a.map(e=>`<span class="event-chip">${e.start} ${esc(e.child)}</span>`).join('')||'<small>Disponible</small>'}</button>`)}setTitle('Agenda','Calendario completo');$('#content').innerHTML=`<div class="card"><div class="calendar-head"><button class="secondary" id="pr24">←</button><h3>${names[m]} ${y}</h3><button class="secondary" id="nx24">→</button></div><div class="calendar">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(x=>`<div class="weekday">${x}</div>`).join('')}${c.join('')}</div></div>`;$('#pr24').onclick=()=>{cv24=new Date(y,m-1,1);renderCalendarV24()};$('#nx24').onclick=()=>{cv24=new Date(y,m+1,1);renderCalendarV24()}};

// PERSONAL
window.renderStaffV24=()=>{let a=data.staff.filter(x=>x.salonId===SID());setTitle('Personal','Equipo del salón');$('#content').innerHTML=`<button class="primary" onclick="staffV24()">+ Empleado</button><div class="card" style="margin-top:16px"><div class="table-wrap"><table class="table"><thead><tr><th>Foto</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${a.map(s=>`<tr><td>${s.photo?`<img src="${s.photo}" style="width:42px;height:42px;border-radius:50%;object-fit:cover">`:'👤'}</td><td>${esc(s.name)}</td><td>${esc(s.role||'')}</td><td>${esc(s.staffStatus||'Activo')}</td><td><button class="secondary small" onclick="staffV24('${s.id}')">Editar</button> <button class="secondary small" onclick="suspendV24('${s.id}')">${s.staffStatus==='Suspendido'?'Activar':'Suspender'}</button> <button class="danger small" onclick="removeStaffV24('${s.id}')">Eliminar</button></td></tr>`).join('')}</tbody></table></div></div>`};
window.staffV24=(sid='')=>{let s=data.staff.find(x=>x.id===sid);showModal(`<div class="modal-title"><div><h2>Empleado</h2></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="st24"><div class="field"><label>Nombre</label><input name="name" value="${esc(s?.name||'')}" required></div><div class="field"><label>Rol</label><input name="role" value="${esc(s?.role||'')}"></div><div class="field"><label>Foto</label><input name="photo" type="file" accept="image/*"></div><div class="form-actions"><button class="primary">Guardar</button></div></form>`);$('#st24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target)),file=e.target.photo.files[0],done=img=>{let o=s||{id:id(),salonId:SID(),staffStatus:'Activo'};o.name=f.name;o.role=f.role;if(img)o.photo=img;if(!s)data.staff.push(o);save();closeModal();renderStaffV24()};if(file){let r=new FileReader();r.onload=()=>done(r.result);r.readAsDataURL(file)}else done('')}};
window.suspendV24=sid=>{let s=data.staff.find(x=>x.id===sid);s.staffStatus=s.staffStatus==='Suspendido'?'Activo':'Suspendido';save();renderStaffV24()};
window.removeStaffV24=sid=>{if(confirm('¿Eliminar empleado?')){data.staff=data.staff.filter(x=>x.id!==sid);save();renderStaffV24()}};

// COMUNIDAD
window.renderCommunityV24=()=>{let msgs=data.communityMessages.filter(x=>x.fromSalonId===SID()||x.toSalonId===SID()),ideas=data.communityIdeas||[];setTitle('Comunidad','Mensajes, fechas, ideas y normativas');$('#content').innerHTML=`<div class="toolbar"><button class="primary" onclick="msgV24()">💬 Mensaje</button><button class="secondary" onclick="msgV24(true)">📅 Consultar fecha / derivar cliente</button><button class="secondary" onclick="ideaV24()">💡 Idea / normativa</button></div><div class="card" style="margin-top:16px"><h3>Mensajes</h3>${msgs.slice().reverse().map(m=>`<div class="today-event-row"><span>💬</span><span><b>${esc(m.subject)}</b><small>${esc(m.text)} ${m.clientPhone?'· Cliente '+esc(m.clientPhone):''}</small></span></div>`).join('')||'<div class="empty">Sin mensajes.</div>'}</div><div class="card" style="margin-top:16px"><h3>Ideas, normativas y habilitaciones</h3>${ideas.slice().reverse().map(i=>`<div class="today-event-row"><span>💡</span><span><b>${esc(i.title)}</b><small>${esc(i.text)}</small></span></div>`).join('')||'<div class="empty">Sin publicaciones.</div>'}</div>`};
window.msgV24=(ref=false)=>{let ss=data.salons.filter(x=>x.id!==SID()&&x.status!=='Suspendido');if(!ss.length)return toast('No hay otros salones');showModal(`<div class="modal-title"><div><h2>${ref?'Consultar fecha':'Mensaje'}</h2></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="ms24"><div class="field"><label>Salón</label><select name="toSalonId">${ss.map(s=>`<option value="${s.id}">${esc(s.name)} · ${esc(s.locality||s.address||'')}</option>`).join('')}</select></div><div class="field"><label>Asunto</label><input name="subject" value="${ref?'Consulta de disponibilidad':''}" required></div><div class="field"><label>Mensaje</label><textarea name="text" required></textarea></div>${ref?'<div class="field"><label>Teléfono del cliente</label><input name="clientPhone" required></div>':''}<div class="form-actions"><button class="primary">Enviar</button></div></form>`);$('#ms24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));data.communityMessages.push({id:id(),fromSalonId:SID(),createdAt:now(),...f});save();closeModal();renderCommunityV24()}};
window.ideaV24=()=>{showModal(`<div class="modal-title"><div><h2>Compartir información</h2></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="id24"><div class="field"><label>Título</label><input name="title" required></div><div class="field"><label>Detalle</label><textarea name="text" required></textarea></div><div class="form-actions"><button class="primary">Publicar</button></div></form>`);$('#id24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));data.communityIdeas.push({id:id(),salonId:SID(),createdAt:now(),...f});save();closeModal();renderCommunityV24()}};

// MI SALÓN: LOGO + UBICACIÓN DETALLADA
const CABA=['Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita','Colegiales','Flores','Floresta','La Boca','La Paternal','Liniers','Mataderos','Monte Castro','Nueva Pompeya','Núñez','Palermo','Parque Patricios','Recoleta','Retiro','Saavedra','San Telmo','Villa Crespo','Villa Devoto','Villa Luro','Villa Urquiza','Vélez Sarsfield'];
const GBA=['Ramos Mejía','Lomas del Mirador','San Justo','Villa Luzuriaga','Haedo','Morón','Castelar','Ituzaingó','Ciudadela','Caseros','El Palomar','Hurlingham','Villa Sarmiento','La Tablada','Tapiales','Aldo Bonzi','Isidro Casanova','Gregorio de Laferrere','González Catán','Merlo','Padua','Lomas de Zamora','Banfield','Temperley','Lanús','Avellaneda','Quilmes','San Martín','Vicente López','San Isidro','Tigre'];
const oldProfile=renderProfile;
window.renderProfileV24=()=>{oldProfile();let s=salon(),c=$('#content');let box=document.createElement('div');box.className='card';box.style.marginTop='16px';box.innerHTML=`<h3>Logo y ubicación detallada</h3><form id="pf24"><div class="form-grid"><div class="field"><label>Zona</label><select name="region" id="rg24"><option>CABA</option><option>Provincia de Buenos Aires</option></select></div><div class="field"><label>Localidad / barrio</label><select name="locality" id="lc24"></select></div><div class="field span2"><label>Logo del salón</label><input name="logo" type="file" accept="image/*">${s.logo?`<img src="${s.logo}" style="display:block;max-width:130px;max-height:80px;margin-top:8px">`:''}</div></div><div class="form-actions"><button class="primary">Guardar</button></div></form>`;c.prepend(box);let rg=$('#rg24'),lc=$('#lc24');rg.value=s.region||'CABA';function fill(){let a=rg.value==='CABA'?CABA:GBA;lc.innerHTML=a.map(x=>`<option ${s.locality===x?'selected':''}>${x}</option>`).join('')}rg.onchange=fill;fill();$('#pf24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target)),file=e.target.logo.files[0],done=img=>{s.region=f.region;s.locality=f.locality;if(img)s.logo=img;save();toast('Datos guardados');renderSalonShell()};if(file){let r=new FileReader();r.onload=()=>done(r.result);r.readAsDataURL(file)}else done('')}};

// TARJETAS SIN FIESTA
window.freeCardV24=()=>{showModal(`<div class="modal-title"><div><h2>Nueva tarjeta virtual</h2><p>No requiere una fiesta cargada.</p></div><button class="ghost small" onclick="closeModal()">✕</button></div><form id="ca24"><div class="field"><label>Nombre / título</label><input name="title" required></div><div class="field"><label>Fecha</label><input name="date" type="date"></div><div class="field"><label>Horario</label><input name="time" type="time"></div><div class="field"><label>Dirección</label><input name="address"></div><div class="field"><label>Texto</label><textarea name="text"></textarea></div><div class="form-actions"><button class="primary">Crear tarjeta</button></div></form>`);$('#ca24').onsubmit=e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));data.cards.push({id:id(),salonId:SID(),standalone:true,createdAt:now(),...f});save();closeModal();toast('Tarjeta creada');view='cards';renderSalonShell()}};

// DASHBOARD ÚNICO
window.renderDashboardV24=()=>{let ev=EV(),inc=data.movements.filter(m=>m.salonId===SID()&&['Ingreso','Cobro'].includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0),out=data.movements.filter(m=>m.salonId===SID()&&m.type==='Gasto').reduce((s,m)=>s+Number(m.amount||0),0),contract=ev.reduce((s,e)=>s+Number(e.total||0),0);setTitle('Inicio','Resumen operativo y contable');$('#content').innerHTML=`<div class="grid stats"><div class="card stat"><small>Fiestas activas</small><strong>${ev.filter(e=>!['Cancelada','Finalizada'].includes(e.status)).length}</strong></div><div class="card stat"><small>Contratado</small><strong>${money(contract)}</strong></div><div class="card stat"><small>Ingresado</small><strong>${money(inc)}</strong></div><div class="card stat"><small>Pendiente</small><strong>${money(Math.max(0,contract-inc))}</strong></div><div class="card stat"><small>Egresos</small><strong>${money(out)}</strong></div><div class="card stat"><small>Resultado de caja</small><strong>${money(inc-out)}</strong></div></div><div class="card" style="margin-top:16px"><h3>Acciones rápidas</h3><div class="quick-grid"><button class="quick" onclick="openEventFormV24()">➕ <strong>Nueva reserva</strong></button><button class="quick" onclick="view='calendar';renderSalonShell()">📅 <strong>Agenda</strong></button><button class="quick" onclick="view='suppliers';renderSalonShell()">🚚 <strong>Pedidos</strong></button><button class="quick" onclick="view='community';renderSalonShell()">🌐 <strong>Comunidad</strong></button><button class="quick" onclick="freeCardV24()">💌 <strong>Tarjeta</strong></button></div></div>`};

// ROUTER FINAL
const rv24=renderSalonView;
renderSalonView=function(){if(view==='dashboard')return renderDashboardV24();if(view==='calendar')return renderCalendarV24();if(view==='suppliers')return renderSuppliersV24();if(view==='community')return renderCommunityV24();if(view==='staff')return renderStaffV24();if(view==='profile')return renderProfileV24();let r=rv24();if(view==='cards'&&$('#content')&&!$('#free24')){let b=document.createElement('button');b.id='free24';b.className='primary';b.textContent='+ Crear tarjeta sin fiesta';b.onclick=freeCardV24;$('#content').prepend(b)}return r};
const sh24=renderSalonShell;renderSalonShell=function(){let r=sh24();setTimeout(()=>$$('button').forEach(b=>{if((b.textContent||'').includes('Nueva fiesta'))b.onclick=()=>openEventFormV24()}),0);return r};
})();


// ============================================================
// V25 - STOCK: COSTO AUTOMÁTICO + COMPRA PENDIENTE + PAGAR/ENTREGA
// ============================================================
(function(){
'use strict';

data.stockPurchases=data.stockPurchases||[];
data.movements=data.movements||[];
data.auditLog=data.auditLog||[];

const V25SID=()=>session?.salonId;
const v25Products=()=> (data.stockProducts||[]).filter(p=>p.salonId===V25SID());
const v25Buys=()=> (data.stockPurchases||[]).filter(c=>c.salonId===V25SID());
const v25Prod=idp=> (data.stockProducts||[]).find(p=>p.id===idp && p.salonId===V25SID());
const v25Methods=['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'];

function v25PurchaseTotal(c){
  const q=Number(c.quantity??c.qty??0);
  const u=Number(c.unitCost??c.costPrice??0);
  return Number(c.total??(q*u));
}

function v25EnsurePendingMigration(){
  // Compras creadas con versiones anteriores sin estado de pago:
  // ahora pasan a Pendiente y el gasto se registra solo al pagar.
  v25Buys().forEach(c=>{
    if(!c.paymentStatus){
      c.paymentStatus='Pendiente';
      c.deliveryStatus='Pendiente de entrega';
      data.movements=(data.movements||[]).filter(m=>
        !(m.salonId===V25SID() &&
          (m.stockPurchaseId===c.id || m.sourceKey===`stock-purchase:${c.id}`))
      );
    }
  });
}

// REGISTRAR COMPRA: costo automático del producto; NO genera gasto hasta pagar.
window.openStockPurchaseV25=function(pid=''){
  const ps=v25Products();
  if(!ps.length)return toast('Primero cargá un producto');

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Registrar compra</h2>
        <p>La cantidad comprada se suma al stock. El pago se registra después.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="v25-buy-form">
      <div class="form-grid">
        <div class="field span2">
          <label>Producto</label>
          <select name="productId" id="v25-product" required>
            ${ps.map(p=>`<option value="${esc(p.id)}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Cantidad</label>
          <input name="quantity" type="number" min="1" value="1" required>
        </div>

        <div class="field">
          <label>Costo unitario</label>
          <input name="unitCost" id="v25-unit-cost" type="number" min="0" required>
          <small class="muted">Se trae automáticamente del producto.</small>
        </div>

        <div class="field">
          <label>Fecha de compra</label>
          <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required>
        </div>

        <div class="field">
          <label>Total de compra</label>
          <input id="v25-buy-total" readonly>
        </div>
      </div>

      <div class="admin-notice">
        <span>🧾</span>
        <div>
          <b>Estado inicial: Pendiente de pago</b>
          <small>Después usá el botón “Pagar” para elegir medio de pago y estado de entrega.</small>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Registrar compra</button>
      </div>
    </form>
  `);

  const form=$('#v25-buy-form');
  const sel=$('#v25-product');
  const cost=$('#v25-unit-cost');
  const totalEl=$('#v25-buy-total');

  function loadProductCost(){
    const p=v25Prod(sel.value);
    cost.value=Number(p?.costPrice||0);
    calc();
  }
  function calc(){
    const q=Number(form.quantity.value||0);
    const u=Number(cost.value||0);
    totalEl.value=money(q*u);
  }

  sel.onchange=loadProductCost;
  form.quantity.oninput=calc;
  cost.oninput=calc;
  loadProductCost();

  form.onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(form));
    const p=v25Prod(f.productId);
    if(!p)return toast('Producto no encontrado');

    const qty=Number(f.quantity||0);
    const unit=Number(f.unitCost||0);
    if(qty<=0)return toast('Ingresá una cantidad válida');

    const cid=id();
    p.stock=Number(p.stock||0)+qty;

    data.stockPurchases.push({
      id:cid,
      salonId:V25SID(),
      productId:p.id,
      productName:p.name,
      quantity:qty,
      unitCost:unit,
      total:qty*unit,
      date:f.date,
      paymentStatus:'Pendiente',
      deliveryStatus:'Pendiente de entrega',
      paymentMethod:'',
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Compra registrada. Pendiente de pago.');
    renderStockV25();
  };
};

// EDITAR COMPRA: corrige diferencia de stock.
window.editStockPurchaseV25=function(cid){
  const c=v25Buys().find(x=>x.id===cid);
  if(!c)return toast('Compra no encontrada');
  const p=v25Prod(c.productId);
  const oldQty=Number(c.quantity??c.qty??0);

  showModal(`
    <div class="modal-title">
      <div><h2>Editar compra</h2><p>${esc(p?.name||c.productName||'')}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="v25-edit-buy">
      <div class="form-grid">
        <div class="field">
          <label>Cantidad</label>
          <input name="quantity" type="number" min="1" value="${oldQty}" required>
        </div>
        <div class="field">
          <label>Costo unitario</label>
          <input name="unitCost" type="number" min="0" value="${Number(c.unitCost??c.costPrice??0)}" required>
        </div>
        <div class="field">
          <label>Fecha</label>
          <input name="date" type="date" value="${esc(c.date||new Date().toISOString().slice(0,10))}" required>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar cambios</button>
      </div>
    </form>
  `);

  $('#v25-edit-buy').onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(ev.target));
    const newQty=Number(f.quantity||0);
    const unit=Number(f.unitCost||0);

    if(p)p.stock=Math.max(0,Number(p.stock||0)+(newQty-oldQty));

    c.quantity=newQty;
    c.unitCost=unit;
    c.total=newQty*unit;
    c.date=f.date;
    c.updatedAt=new Date().toISOString();

    // Si ya estaba pagada, actualiza el importe del movimiento relacionado.
    const mov=(data.movements||[]).find(m=>m.stockPurchaseId===c.id && m.salonId===V25SID());
    if(mov && c.paymentStatus==='Pagado'){
      mov.amount=c.total;
      mov.updatedAt=new Date().toISOString();
    }

    save();
    closeModal();
    toast('Compra actualizada');
    renderStockV25();
  };
};

// PAGAR COMPRA: medio + entrega pendiente/entregado.
// Recién acá impacta como egreso en Dashboard/Finanzas.
window.payStockPurchaseV25=function(cid){
  const c=v25Buys().find(x=>x.id===cid);
  if(!c)return toast('Compra no encontrada');

  const p=v25Prod(c.productId);
  const amount=v25PurchaseTotal(c);

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Pagar compra</h2>
        <p>${esc(p?.name||c.productName||'Compra')} · ${money(amount)}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="v25-pay-buy">
      <div class="form-grid">
        <div class="field">
          <label>Importe a pagar</label>
          <input value="${money(amount)}" readonly>
        </div>

        <div class="field">
          <label>Medio de pago</label>
          <select name="method">
            ${v25Methods.map(x=>`<option>${x}</option>`).join('')}
          </select>
        </div>

        <div class="field span2">
          <label>Estado de entrega</label>
          <select name="deliveryStatus">
            <option>Pendiente de entrega</option>
            <option>Entregado</option>
          </select>
        </div>

        <div class="field span2">
          <label>Referencia / comprobante</label>
          <input name="reference" placeholder="Opcional">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Confirmar pago</button>
      </div>
    </form>
  `);

  $('#v25-pay-buy').onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(ev.target));

    c.paymentStatus='Pagado';
    c.paymentMethod=f.method;
    c.deliveryStatus=f.deliveryStatus;
    c.reference=f.reference||'';
    c.paidAt=new Date().toISOString();

    // evita duplicados
    data.movements=(data.movements||[]).filter(m=>
      !(m.salonId===V25SID() &&
        (m.stockPurchaseId===c.id || m.sourceKey===`stock-purchase:${c.id}`))
    );

    data.movements.push({
      id:id(),
      salonId:V25SID(),
      stockPurchaseId:c.id,
      sourceKey:`stock-purchase:${c.id}`,
      type:'Gasto',
      category:'Compra de stock',
      concept:`Pago compra ${p?.name||c.productName||''}`,
      amount,
      movementDate:new Date().toISOString().slice(0,10),
      method:f.method,
      reference:f.reference||'',
      status:f.deliveryStatus,
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast(`Compra pagada · ${f.deliveryStatus}`);
    renderStockV25();
  };
};

window.markStockDeliveredV25=function(cid){
  const c=v25Buys().find(x=>x.id===cid);
  if(!c)return;
  c.deliveryStatus='Entregado';
  c.deliveredAt=new Date().toISOString();
  const m=(data.movements||[]).find(x=>x.stockPurchaseId===cid && x.salonId===V25SID());
  if(m)m.status='Entregado';
  save();
  renderStockV25();
};

// VISTA STOCK DEFINITIVA V25
window.renderStockV25=function(){
  v25EnsurePendingMigration();

  const ps=v25Products();
  const buys=v25Buys().slice().sort((a,b)=>
    String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||''))
  );

  const units=ps.reduce((s,p)=>s+Number(p.stock||0),0);
  const value=ps.reduce((s,p)=>s+Number(p.stock||0)*Number(p.costPrice||0),0);
  const low=ps.filter(p=>Number(p.stock||0)<=Number(p.minStock||0)).length;

  setTitle('Stock','Productos, compras, pagos y entregas');

  $('#content').innerHTML=`
    <div class="grid stats">
      <div class="card stat"><small>Productos</small><strong>${ps.length}</strong></div>
      <div class="card stat"><small>Unidades en stock</small><strong>${units}</strong></div>
      <div class="card stat"><small>Valor de stock a costo</small><strong>${money(value)}</strong></div>
      <div class="card stat"><small>Stock bajo</small><strong class="${low?'bad':''}">${low}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:16px">
      <button class="primary" onclick="openStockProductV23()">+ Agregar producto</button>
      <button class="secondary" onclick="openStockPurchaseV25()">🛒 Compra</button>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">
        <div><h3>Productos</h3><small class="muted">El costo cargado se usa automáticamente al registrar una compra.</small></div>
      </div>
      ${ps.length?`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Costo</th><th>Venta</th><th>Acciones</th></tr></thead>
        <tbody>${ps.map(p=>`
          <tr>
            <td><b>${esc(p.name||'')}</b><small style="display:block">${esc(p.description||p.category||'')}</small></td>
            <td>${Number(p.stock||0)}</td>
            <td>${Number(p.minStock||0)}</td>
            <td>${money(p.costPrice||0)}</td>
            <td>${money(p.salePrice||0)}</td>
            <td>
              <button class="secondary small" onclick="openStockProductV23('${p.id}')">✏️ Editar</button>
              <button class="secondary small" onclick="openStockPurchaseV25('${p.id}')">Comprar</button>
              <button class="danger small" onclick="deleteStockProductV23('${p.id}')">🗑 Borrar producto</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>`:'<div class="empty">Todavía no hay productos.</div>'}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">
        <div><h3>Compras</h3><small class="muted">Registrar compra no significa pagarla. El egreso se genera al usar “Pagar”.</small></div>
      </div>
      ${buys.length?`
      <div class="table-wrap"><table class="table">
        <thead>
          <tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Acciones</th></tr>
        </thead>
        <tbody>${buys.map(c=>{
          const p=v25Prod(c.productId);
          return `<tr>
            <td>${esc(c.date||'')}</td>
            <td><b>${esc(p?.name||c.productName||'')}</b></td>
            <td>${Number(c.quantity??c.qty??0)}</td>
            <td>${money(c.unitCost??c.costPrice??0)}</td>
            <td>${money(v25PurchaseTotal(c))}</td>
            <td><span class="pill">${esc(c.paymentStatus||'Pendiente')}</span>${c.paymentMethod?`<small style="display:block">${esc(c.paymentMethod)}</small>`:''}</td>
            <td><span class="pill">${esc(c.deliveryStatus||'Pendiente de entrega')}</span></td>
            <td>
              <button class="secondary small" onclick="editStockPurchaseV25('${c.id}')">✏️ Editar</button>
              <button class="danger small" onclick="deleteStockPurchaseV23('${c.id}')">🗑 Borrar</button>
              ${c.paymentStatus!=='Pagado'
                ? `<button class="primary small" onclick="payStockPurchaseV25('${c.id}')">💳 Pagar</button>`
                : c.deliveryStatus!=='Entregado'
                  ? `<button class="secondary small" onclick="markStockDeliveredV25('${c.id}')">📦 Marcar entregado</button>`
                  : ''}
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>`:'<div class="empty">Todavía no hay compras registradas.</div>'}
    </div>
  `;

  // Persistimos la migración de compras viejas como pendientes.
  save();
};

// Override final de Stock.
const v25PrevView=renderSalonView;
renderSalonView=function(){
  if(view==='stock')return renderStockV25();
  return v25PrevView();
};

})();


// ============================================================
// V26 - STOCK FLUJO DEFINITIVO
// costo automático + pendientes + pagadas + entrega
// ============================================================
(function(){
'use strict';

data.stockPurchases=data.stockPurchases||[];
data.movements=data.movements||[];

const S26=()=>session?.salonId;
const P26=()=> (data.stockProducts||[]).filter(p=>p.salonId===S26());
const B26=()=> (data.stockPurchases||[]).filter(c=>c.salonId===S26());
const PROD26=idp=> (data.stockProducts||[]).find(p=>p.id===idp && p.salonId===S26());
const METHODS26=['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'];

function total26(c){
  const q=Number(c.quantity??c.qty??0), u=Number(c.unitCost??c.costPrice??0);
  return Number(c.total??(q*u));
}

function normalize26(){
  B26().forEach(c=>{
    if(!c.paymentStatus)c.paymentStatus='Pendiente';
    if(!c.deliveryStatus)c.deliveryStatus='Pendiente de entrega';
    if(c.paymentStatus!=='Pagado'){
      data.movements=(data.movements||[]).filter(m=>
        !(m.salonId===S26() && (m.stockPurchaseId===c.id || m.sourceKey===`stock-purchase:${c.id}`))
      );
    }
  });
}

window.openStockPurchaseV26=function(pid=''){
  const ps=P26();
  if(!ps.length)return toast('Primero cargá un producto');

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Registrar compra</h2>
        <p>Elegí el producto y el costo unitario se completa automáticamente.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="buy26">
      <div class="form-grid">
        <div class="field span2">
          <label>Producto</label>
          <select name="productId" id="product26" required>
            ${ps.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Cantidad</label>
          <input name="quantity" id="qty26" type="number" min="1" value="1" required>
        </div>

        <div class="field">
          <label>Costo unitario</label>
          <input name="unitCost" id="cost26" type="number" min="0" readonly required>
          <small class="muted">Costo tomado de la ficha del producto.</small>
        </div>

        <div class="field">
          <label>Fecha</label>
          <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required>
        </div>

        <div class="field">
          <label>Total de la compra</label>
          <input id="total26" readonly>
        </div>
      </div>

      <div class="admin-notice">
        <span>🧾</span>
        <div>
          <b>La compra se registra como Pendiente</b>
          <small>El pago y el estado de entrega se cargan después desde la línea de la compra.</small>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Registrar compra</button>
      </div>
    </form>
  `);

  const f=$('#buy26'), product=$('#product26'), qty=$('#qty26'), cost=$('#cost26'), tot=$('#total26');

  function refreshCost(){
    const p=PROD26(product.value);
    cost.value=Number(p?.costPrice||0);
    refreshTotal();
  }
  function refreshTotal(){
    tot.value=money(Number(qty.value||0)*Number(cost.value||0));
  }

  product.onchange=refreshCost;
  qty.oninput=refreshTotal;
  refreshCost();

  f.onsubmit=e=>{
    e.preventDefault();
    const v=Object.fromEntries(new FormData(f));
    const p=PROD26(v.productId);
    if(!p)return toast('Producto no encontrado');

    const q=Number(v.quantity||0);
    const u=Number(p.costPrice||0);
    if(q<=0)return toast('Ingresá una cantidad válida');

    p.stock=Number(p.stock||0)+q;

    data.stockPurchases.push({
      id:id(),
      salonId:S26(),
      productId:p.id,
      productName:p.name,
      quantity:q,
      unitCost:u,
      total:q*u,
      date:v.date,
      paymentStatus:'Pendiente',
      deliveryStatus:'Pendiente de entrega',
      paymentMethod:'',
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Compra registrada como pendiente');
    renderStockV26();
  };
};

window.editStockPurchaseV26=function(cid){
  const c=B26().find(x=>x.id===cid);
  if(!c)return;
  const p=PROD26(c.productId);
  const oldQ=Number(c.quantity??c.qty??0);

  showModal(`
    <div class="modal-title">
      <div><h2>Editar compra</h2><p>${esc(p?.name||c.productName||'')}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="edit26">
      <div class="form-grid">
        <div class="field"><label>Cantidad</label><input name="quantity" type="number" min="1" value="${oldQ}" required></div>
        <div class="field"><label>Costo unitario</label><input value="${money(c.unitCost??c.costPrice??0)}" readonly></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${esc(c.date||'')}" required></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar</button>
      </div>
    </form>
  `);

  $('#edit26').onsubmit=e=>{
    e.preventDefault();
    const v=Object.fromEntries(new FormData(e.target));
    const nq=Number(v.quantity||0);
    if(p)p.stock=Math.max(0,Number(p.stock||0)+(nq-oldQ));
    c.quantity=nq;
    c.unitCost=Number(p?.costPrice??c.unitCost??0);
    c.total=nq*c.unitCost;
    c.date=v.date;
    c.updatedAt=new Date().toISOString();

    const m=(data.movements||[]).find(x=>x.salonId===S26()&&x.stockPurchaseId===c.id);
    if(m&&c.paymentStatus==='Pagado')m.amount=c.total;

    save();
    closeModal();
    toast('Compra actualizada');
    renderStockV26();
  };
};

window.payStockPurchaseV26=function(cid){
  const c=B26().find(x=>x.id===cid);
  if(!c)return;
  const p=PROD26(c.productId);
  const amount=total26(c);

  showModal(`
    <div class="modal-title">
      <div><h2>Pagar compra</h2><p>${esc(p?.name||c.productName||'')} · ${money(amount)}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="pay26">
      <div class="form-grid">
        <div class="field"><label>Importe</label><input value="${money(amount)}" readonly></div>
        <div class="field"><label>Medio de pago</label><select name="method">${METHODS26.map(x=>`<option>${x}</option>`).join('')}</select></div>

        <div class="field span2">
          <label>Estado de entrega</label>
          <select name="deliveryStatus">
            <option value="Pendiente de entrega">Pagada - pendiente de entrega</option>
            <option value="Entregado">Pagada - entregada</option>
          </select>
        </div>

        <div class="field span2">
          <label>Referencia / comprobante</label>
          <input name="reference" placeholder="Opcional">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Confirmar pago</button>
      </div>
    </form>
  `);

  $('#pay26').onsubmit=e=>{
    e.preventDefault();
    const v=Object.fromEntries(new FormData(e.target));

    c.paymentStatus='Pagado';
    c.paymentMethod=v.method;
    c.deliveryStatus=v.deliveryStatus;
    c.reference=v.reference||'';
    c.paidAt=new Date().toISOString();

    data.movements=(data.movements||[]).filter(m=>
      !(m.salonId===S26() && (m.stockPurchaseId===c.id || m.sourceKey===`stock-purchase:${c.id}`))
    );

    data.movements.push({
      id:id(),
      salonId:S26(),
      stockPurchaseId:c.id,
      sourceKey:`stock-purchase:${c.id}`,
      type:'Gasto',
      category:'Compra de stock',
      concept:`Compra ${p?.name||c.productName||''}`,
      amount,
      movementDate:new Date().toISOString().slice(0,10),
      method:v.method,
      status:v.deliveryStatus,
      reference:v.reference||'',
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast(v.deliveryStatus==='Entregado'?'Compra pagada y entregada':'Compra pagada, pendiente de entrega');
    renderStockV26();
  };
};

window.deleteStockPurchaseV26=function(cid){
  const c=B26().find(x=>x.id===cid);
  if(!c)return;
  const p=PROD26(c.productId);
  if(!confirm('¿Borrar esta compra?'))return;

  const q=Number(c.quantity??c.qty??0);
  if(p)p.stock=Math.max(0,Number(p.stock||0)-q);

  data.stockPurchases=(data.stockPurchases||[]).filter(x=>x.id!==cid);
  data.movements=(data.movements||[]).filter(m=>
    !(m.stockPurchaseId===cid || m.sourceKey===`stock-purchase:${cid}`)
  );

  save();
  toast('Compra eliminada');
  renderStockV26();
};

window.markDeliveredStockV26=function(cid){
  const c=B26().find(x=>x.id===cid);
  if(!c)return;
  c.deliveryStatus='Entregado';
  c.deliveredAt=new Date().toISOString();
  const m=(data.movements||[]).find(x=>x.stockPurchaseId===cid&&x.salonId===S26());
  if(m)m.status='Entregado';
  save();
  renderStockV26();
};

window.renderStockV26=function(){
  normalize26();

  const ps=P26();
  const pending=B26().filter(c=>c.paymentStatus!=='Pagado').sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
  const paid=B26().filter(c=>c.paymentStatus==='Pagado').sort((a,b)=>String(b.paidAt||b.createdAt||'').localeCompare(String(a.paidAt||a.createdAt||'')));

  const units=ps.reduce((s,p)=>s+Number(p.stock||0),0);
  const val=ps.reduce((s,p)=>s+Number(p.stock||0)*Number(p.costPrice||0),0);
  const low=ps.filter(p=>Number(p.stock||0)<=Number(p.minStock||0)).length;

  setTitle('Stock','Productos, compras pendientes y compras pagadas');

  $('#content').innerHTML=`
    <div class="grid stats">
      <div class="card stat"><small>Productos</small><strong>${ps.length}</strong></div>
      <div class="card stat"><small>Unidades en stock</small><strong>${units}</strong></div>
      <div class="card stat"><small>Valor de stock a costo</small><strong>${money(val)}</strong></div>
      <div class="card stat"><small>Stock bajo</small><strong>${low}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:16px">
      <button class="primary" onclick="openStockProductV23()">+ Agregar producto</button>
      <button class="secondary" onclick="openStockPurchaseV26()">🛒 Registrar compra</button>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title"><div><h3>Productos</h3><small class="muted">El costo unitario cargado acá se usa automáticamente en las compras.</small></div></div>
      ${ps.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Costo</th><th>Venta</th><th>Acciones</th></tr></thead><tbody>
      ${ps.map(p=>`<tr><td><b>${esc(p.name||'')}</b><small style="display:block">${esc(p.description||'')}</small></td><td>${Number(p.stock||0)}</td><td>${Number(p.minStock||0)}</td><td>${money(p.costPrice||0)}</td><td>${money(p.salePrice||0)}</td><td><button class="secondary small" onclick="openStockProductV23('${p.id}')">Editar</button> <button class="secondary small" onclick="openStockPurchaseV26('${p.id}')">Comprar</button> <button class="danger small" onclick="deleteStockProductV23('${p.id}')">Borrar producto</button></td></tr>`).join('')}
      </tbody></table></div>`:'<div class="empty">Sin productos.</div>'}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title"><div><h3>Últimas compras pendientes</h3><small class="muted">Estas compras todavía no fueron pagadas.</small></div></div>
      ${pending.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th><th>Acciones</th></tr></thead><tbody>
      ${pending.map(c=>{let p=PROD26(c.productId);return`<tr><td>${esc(c.date||'')}</td><td>${esc(p?.name||c.productName||'')}</td><td>${Number(c.quantity??c.qty??0)}</td><td>${money(c.unitCost??c.costPrice??0)}</td><td>${money(total26(c))}</td><td><button class="secondary small" onclick="editStockPurchaseV26('${c.id}')">Editar compra</button> <button class="danger small" onclick="deleteStockPurchaseV26('${c.id}')">Borrar compra</button> <button class="primary small" onclick="payStockPurchaseV26('${c.id}')">Pagar compra</button></td></tr>`}).join('')}
      </tbody></table></div>`:'<div class="empty">No hay compras pendientes.</div>'}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title"><div><h3>Compras pagadas</h3><small class="muted">Separadas según fueron entregadas o siguen pendientes de entrega.</small></div></div>
      ${paid.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha pago</th><th>Producto</th><th>Total</th><th>Medio</th><th>Entrega</th><th>Acciones</th></tr></thead><tbody>
      ${paid.map(c=>{let p=PROD26(c.productId);return`<tr><td>${esc((c.paidAt||'').slice(0,10))}</td><td>${esc(p?.name||c.productName||'')}</td><td>${money(total26(c))}</td><td>${esc(c.paymentMethod||'')}</td><td><span class="pill">${c.deliveryStatus==='Entregado'?'Entregada':'Pendiente de entrega'}</span></td><td>${c.deliveryStatus!=='Entregado'?`<button class="secondary small" onclick="markDeliveredStockV26('${c.id}')">Marcar entregada</button>`:''} <button class="danger small" onclick="deleteStockPurchaseV26('${c.id}')">Borrar compra</button></td></tr>`}).join('')}
      </tbody></table></div>`:'<div class="empty">No hay compras pagadas.</div>'}
    </div>
  `;

  save();
};

// Alias para anular cualquier función vieja que siga llamando versiones anteriores.
window.openStockPurchaseV23=window.openStockPurchaseV26;
window.openStockPurchaseV25=window.openStockPurchaseV26;
window.openStockPurchaseV12=window.openStockPurchaseV26;
window.payStockPurchaseV25=window.payStockPurchaseV26;
window.editStockPurchaseV25=window.editStockPurchaseV26;

const prev26=renderSalonView;
renderSalonView=function(){
  if(view==='stock')return renderStockV26();
  return prev26();
};

})();


// ============================================================
// V27 - STOCK: PAGOS PERSISTENTES + MOVIMIENTOS + SECCIONES CORRECTAS
// ============================================================
(function(){
'use strict';

data.stockPurchases=data.stockPurchases||[];
data.movements=data.movements||[];
data.accountingEpochs=data.accountingEpochs||[];
data.financeResets=data.financeResets||[];

const SID27=()=>session?.salonId;
const PROD27=idp=>(data.stockProducts||[]).find(p=>p.id===idp&&p.salonId===SID27());
const BUYS27=()=> (data.stockPurchases||[]).filter(c=>c.salonId===SID27());
const METHODS27=['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'];

function total27(c){
  return Number(c.total ?? (Number(c.quantity??c.qty??0)*Number(c.unitCost??c.costPrice??0)));
}

// Cuando empieza una operación REAL después de una puesta a cero,
// desactiva los bloqueos antiguos que borraban los movimientos nuevos.
function unlockAccounting27(){
  const sid=SID27();
  data.accountingEpochs=(data.accountingEpochs||[]).filter(x=>x.salonId!==sid);
  (data.financeResets||[]).forEach(r=>{
    if(r.salonId===sid) r.active=false;
  });
}

window.openStockPurchaseV27=function(pid=''){
  const ps=(data.stockProducts||[]).filter(p=>p.salonId===SID27());
  if(!ps.length)return toast('Primero cargá un producto');

  showModal(`
    <div class="modal-title">
      <div><h2>Registrar compra</h2><p>El costo unitario se toma del producto.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="buy27">
      <div class="form-grid">
        <div class="field span2">
          <label>Producto</label>
          <select name="productId" id="prod27">${ps.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Cantidad</label><input name="quantity" id="qty27" type="number" min="1" value="1" required></div>
        <div class="field"><label>Costo unitario</label><input id="cost27" readonly></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
        <div class="field"><label>Total compra</label><input id="tot27" readonly></div>
      </div>
      <div class="admin-notice"><span>🧾</span><div><b>Se registra pendiente de pago</b><small>Después se paga desde “Últimas compras pendientes”.</small></div></div>
      <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Registrar compra</button></div>
    </form>
  `);

  const form=$('#buy27'),sel=$('#prod27'),qty=$('#qty27'),cost=$('#cost27'),tot=$('#tot27');
  function refresh(){
    const p=PROD27(sel.value),u=Number(p?.costPrice||0),q=Number(qty.value||0);
    cost.value=money(u);
    tot.value=money(q*u);
  }
  sel.onchange=refresh;qty.oninput=refresh;refresh();

  form.onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(form));
    const p=PROD27(f.productId); if(!p)return;
    unlockAccounting27();

    const q=Number(f.quantity||0),u=Number(p.costPrice||0);
    p.stock=Number(p.stock||0)+q;

    data.stockPurchases.push({
      id:id(),salonId:SID27(),productId:p.id,productName:p.name,
      quantity:q,unitCost:u,total:q*u,date:f.date,
      paymentStatus:'Pendiente',deliveryStatus:'Pendiente de entrega',
      createdAt:new Date().toISOString()
    });

    save();closeModal();toast('Compra pendiente registrada');renderStockV27();
  };
};

window.payStockPurchaseV27=function(cid){
  const c=BUYS27().find(x=>x.id===cid); if(!c)return toast('Compra no encontrada');
  const p=PROD27(c.productId),amount=total27(c);

  showModal(`
    <div class="modal-title">
      <div><h2>Pagar compra</h2><p>${esc(p?.name||c.productName||'')} · ${money(amount)}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="pay27">
      <div class="form-grid">
        <div class="field"><label>Importe</label><input value="${money(amount)}" readonly></div>
        <div class="field"><label>Medio de pago</label><select name="method">${METHODS27.map(x=>`<option>${x}</option>`).join('')}</select></div>
        <div class="field span2">
          <label>Estado al pagar</label>
          <select name="deliveryStatus">
            <option value="Pendiente de entrega">Pagada - pendiente de entrega</option>
            <option value="Entregado">Pagada - entregada</option>
          </select>
        </div>
        <div class="field span2"><label>Referencia / comprobante</label><input name="reference"></div>
      </div>
      <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Confirmar pago</button></div>
    </form>
  `);

  $('#pay27').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    unlockAccounting27();

    c.paymentStatus='Pagado';
    c.paymentMethod=f.method;
    c.deliveryStatus=f.deliveryStatus;
    c.reference=f.reference||'';
    c.paidAt=new Date().toISOString();

    data.movements=(data.movements||[]).filter(m=>m.stockPurchaseId!==c.id);
    data.movements.push({
      id:id(),salonId:SID27(),type:'Gasto',category:'Compra de stock',
      concept:`Pago compra ${p?.name||c.productName||''}`,
      amount,method:f.method,status:f.deliveryStatus,
      stockPurchaseId:c.id,movementDate:new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });

    save();

    // Segundo guardado para evitar que un wrapper viejo pise el movimiento.
    setTimeout(()=>{
      unlockAccounting27();
      const still=BUYS27().find(x=>x.id===cid);
      if(still){
        still.paymentStatus='Pagado';
        still.paymentMethod=f.method;
        still.deliveryStatus=f.deliveryStatus;
        still.reference=f.reference||'';
        still.paidAt=still.paidAt||new Date().toISOString();
      }
      if(!(data.movements||[]).some(m=>m.stockPurchaseId===cid)){
        data.movements.push({
          id:id(),salonId:SID27(),type:'Gasto',category:'Compra de stock',
          concept:`Pago compra ${p?.name||c.productName||''}`,
          amount,method:f.method,status:f.deliveryStatus,
          stockPurchaseId:cid,movementDate:new Date().toISOString().slice(0,10),
          createdAt:new Date().toISOString()
        });
      }
      save();
      closeModal();
      toast(f.deliveryStatus==='Entregado'?'Compra pagada y entregada':'Compra pagada, pendiente de entrega');
      renderStockV27();
    },250);
  };
};

window.renderStockV27=function(){
  const ps=(data.stockProducts||[]).filter(p=>p.salonId===SID27());
  const buys=BUYS27();
  const pending=buys.filter(c=>c.paymentStatus!=='Pagado').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const paid=buys.filter(c=>c.paymentStatus==='Pagado').sort((a,b)=>String(b.paidAt||'').localeCompare(String(a.paidAt||'')));
  const payMov=(data.movements||[]).filter(m=>m.salonId===SID27()&&m.category==='Compra de stock'&&m.stockPurchaseId);

  setTitle('Stock','Productos, compras, pagos y entregas');
  const units=ps.reduce((s,p)=>s+Number(p.stock||0),0);
  const value=ps.reduce((s,p)=>s+Number(p.stock||0)*Number(p.costPrice||0),0);
  const low=ps.filter(p=>Number(p.stock||0)<=Number(p.minStock||0)).length;

  $('#content').innerHTML=`
    <div class="grid stats">
      <div class="card stat"><small>Productos</small><strong>${ps.length}</strong></div>
      <div class="card stat"><small>Unidades en stock</small><strong>${units}</strong></div>
      <div class="card stat"><small>Valor de stock a costo</small><strong>${money(value)}</strong></div>
      <div class="card stat"><small>Stock bajo</small><strong>${low}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:16px">
      <button class="primary" onclick="openStockProductV23()">+ Agregar producto</button>
      <button class="secondary" onclick="openStockPurchaseV27()">🛒 Registrar compra</button>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Últimas compras pendientes</h3>
      ${pending.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Costo unit.</th><th>Total</th><th>Acciones</th></tr></thead><tbody>
      ${pending.map(c=>{let p=PROD27(c.productId);return`<tr><td>${esc(c.date||'')}</td><td>${esc(p?.name||c.productName||'')}</td><td>${c.quantity}</td><td>${money(c.unitCost)}</td><td>${money(total27(c))}</td><td><button class="secondary small" onclick="editStockPurchaseV26('${c.id}')">Editar compra</button> <button class="danger small" onclick="deleteStockPurchaseV26('${c.id}')">Borrar compra</button> <button class="primary small" onclick="payStockPurchaseV27('${c.id}')">Pagar compra</button></td></tr>`}).join('')}
      </tbody></table></div>`:'<div class="empty">No hay compras pendientes.</div>'}
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Compras pagadas</h3>
      ${paid.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha pago</th><th>Producto</th><th>Total</th><th>Medio</th><th>Entrega</th></tr></thead><tbody>
      ${paid.map(c=>{let p=PROD27(c.productId);return`<tr><td>${esc((c.paidAt||'').slice(0,10))}</td><td>${esc(p?.name||c.productName||'')}</td><td>${money(total27(c))}</td><td>${esc(c.paymentMethod||'')}</td><td><span class="pill">${c.deliveryStatus==='Entregado'?'Entregada':'Pendiente de entrega'}</span></td></tr>`}).join('')}
      </tbody></table></div>`:'<div class="empty">No hay compras pagadas.</div>'}
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Movimientos de pago de compras</h3>
      ${payMov.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Medio</th><th>Estado</th></tr></thead><tbody>
      ${payMov.slice().reverse().map(m=>`<tr><td>${esc(m.movementDate||'')}</td><td>${esc(m.concept||'')}</td><td>${money(m.amount)}</td><td>${esc(m.method||'')}</td><td>${esc(m.status||'')}</td></tr>`).join('')}
      </tbody></table></div>`:'<div class="empty">Todavía no hay movimientos de pago.</div>'}
    </div>
  `;
};

// aliases para bloquear formularios/pagos antiguos
window.openStockPurchaseV26=window.openStockPurchaseV27;
window.openStockPurchaseV25=window.openStockPurchaseV27;
window.openStockPurchaseV23=window.openStockPurchaseV27;
window.payStockPurchaseV26=window.payStockPurchaseV27;
window.payStockPurchaseV25=window.payStockPurchaseV27;

const previous27=renderSalonView;
renderSalonView=function(){
  if(view==='stock')return renderStockV27();
  return previous27();
};

})();


// ============================================================
// V28 - RESERVAS: TOTAL REAL + SEÑA + PERSONAL + ADICIONALES + STOCK
// ============================================================
(function(){
'use strict';

data.assignments=data.assignments||[];
data.movements=data.movements||[];
data.stockProducts=data.stockProducts||[];
data.salonExtras=data.salonExtras||[];

const SID28=()=>session?.salonId;
const EV28=()=> (data.events||[]).filter(e=>e.salonId===SID28());
const STAFF28=()=> (data.staff||[]).filter(s=>s.salonId===SID28() && s.staffStatus!=='Suspendido');
const PROD28=()=> (data.stockProducts||[]).filter(p=>p.salonId===SID28());
const EXTRA28=()=> (data.salonExtras||[]).filter(x=>x.salonId===SID28());

function event28(eid){return (data.events||[]).find(e=>e.id===eid&&e.salonId===SID28())}
function assignments28(eid){return (data.assignments||[]).filter(a=>a.eventId===eid)}
function selectedExtras28(e){return Array.isArray(e?.extras)?e.extras:[]}
function selectedStock28(e){return Array.isArray(e?.stockItems)?e.stockItems:[]}

function restoreOldStock28(e){
  if(!e)return;
  selectedStock28(e).forEach(i=>{
    const p=(data.stockProducts||[]).find(x=>x.id===i.productId&&x.salonId===SID28());
    if(p)p.stock=Number(p.stock||0)+Number(i.qty||0);
  });
}

function applyNewStock28(items){
  items.forEach(i=>{
    const p=(data.stockProducts||[]).find(x=>x.id===i.productId&&x.salonId===SID28());
    if(p)p.stock=Math.max(0,Number(p.stock||0)-Number(i.qty||0));
  });
}

function ensureDepositMovement28(e){
  const key=`event-deposit:${e.id}`;
  data.movements=(data.movements||[]).filter(m=>m.sourceKey!==key);
  if(Number(e.deposit||0)>0){
    data.movements.push({
      id:id(),salonId:SID28(),sourceKey:key,type:'Ingreso',category:'Seña',
      concept:`Seña reserva ${e.child||e.client||''}`,
      amount:Number(e.deposit||0),eventId:e.id,
      movementDate:e.date||new Date().toISOString().slice(0,10),
      method:e.depositMethod||'No especificado',
      createdAt:new Date().toISOString()
    });
  }
}

window.openEventFormV28=function(eid=''){
  const e=eid?event28(eid):null;
  const staff=STAFF28(), extras=EXTRA28(), products=PROD28();
  const oldAss=new Set(assignments28(eid).map(a=>a.staffId));
  const oldExtras=selectedExtras28(e);
  const oldStock=selectedStock28(e);

  showModal(`
    <div class="modal-title">
      <div><h2>${e?'Editar reserva':'Nueva reserva'}</h2><p>La reserva se calcula completa antes de guardar.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="ev28">
      <div class="form-grid">
        <div class="field"><label>Nombre del cumpleañero/a</label><input name="child" required value="${esc(e?.child||'')}"></div>
        <div class="field"><label>Edad que cumple</label><input name="age" type="number" min="0" value="${Number(e?.age||0)}"></div>
        <div class="field"><label>Responsable del evento</label><input name="client" required value="${esc(e?.client||'')}"></div>
        <div class="field"><label>Email del cliente</label><input name="email" type="email" required value="${esc(e?.email||'')}"></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" required value="${esc(e?.date||todayKey())}"></div>
        <div class="field"><label>Estado</label><select name="status">${['Consulta','Pendiente','Señada','Confirmada','Finalizada','Cancelada'].map(x=>`<option ${e?.status===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Horario desde</label><input name="start" type="time" required value="${esc(e?.start||'')}"></div>
        <div class="field"><label>Horario hasta</label><input name="end" type="time" required value="${esc(e?.end||'')}"></div>
        <div class="field"><label>Cantidad de invitados</label><input name="guests" type="number" min="0" value="${Number(e?.guests||0)}"></div>
        <div class="field"><label>Precio de la fiesta</label><input name="basePrice" id="base28" type="number" min="0" value="${Number(e?.basePrice??e?.total??0)}" required></div>
        <div class="field"><label>Valor de la seña</label><input name="deposit" id="dep28" type="number" min="0" value="${Number(e?.deposit??e?.paid??0)}"></div>
        <div class="field"><label>Medio de la seña</label><select name="depositMethod">${['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'].map(x=>`<option ${e?.depositMethod===x?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>

      <div id="same28" class="card" style="margin-top:12px"></div>

      <div class="card" style="margin-top:12px">
        <div class="section-title"><div><h3>Personal asignado</h3><small class="muted">No suma al precio del cliente; queda asociado a la fiesta.</small></div></div>
        ${staff.length?`<div class="form-grid">${staff.map(s=>`<label class="check-card"><input type="checkbox" name="staffIds" value="${s.id}" ${oldAss.has(s.id)?'checked':''}><span><b>${esc(s.name)}</b><small>${esc(s.role||'')}</small></span></label>`).join('')}</div>`:'<div class="empty">No hay personal activo cargado.</div>'}
      </div>

      <div class="card" style="margin-top:12px">
        <div class="section-title"><div><h3>Adicionales</h3><small class="muted">Se suman al total de la reserva.</small></div></div>
        ${extras.length?`<div class="form-grid">${extras.map(x=>{let chk=oldExtras.some(z=>z.extraId===x.id||z.id===x.id);return`<label class="check-card"><input type="checkbox" class="extra28" value="${x.id}" data-price="${Number(x.price||x.amount||0)}" ${chk?'checked':''}><span><b>${esc(x.name||x.description||'Adicional')}</b><small>${money(x.price||x.amount||0)}</small></span></label>`}).join('')}</div>`:'<div class="empty">No hay adicionales configurados.</div>'}
      </div>

      <div class="card" style="margin-top:12px">
        <div class="section-title"><div><h3>Productos de stock para esta fiesta</h3><small class="muted">Se descuenta del stock y se suma al total.</small></div></div>
        ${products.length?products.map(p=>{let old=oldStock.find(x=>x.productId===p.id);let available=Number(p.stock||0)+Number(old?.qty||0);return`
          <div class="form-grid stockrow28" data-id="${p.id}" data-price="${Number(p.salePrice||0)}" data-available="${available}" style="align-items:end;margin-bottom:8px">
            <div class="field span2"><label>${esc(p.name)}</label><small>Disponible: ${available} · Venta ${money(p.salePrice||0)}</small></div>
            <div class="field"><label>Cantidad para la fiesta</label><input class="stockqty28" type="number" min="0" max="${available}" value="${Number(old?.qty||0)}"></div>
          </div>`}).join(''):'<div class="empty">No hay productos con stock configurados.</div>'}
      </div>

      <div class="grid stats" style="margin-top:14px">
        <div class="card stat"><small>Precio base</small><strong id="sumBase28">$ 0</strong></div>
        <div class="card stat"><small>Adicionales</small><strong id="sumExtra28">$ 0</strong></div>
        <div class="card stat"><small>Productos stock</small><strong id="sumStock28">$ 0</strong></div>
        <div class="card stat"><small>Total reserva</small><strong id="sumTotal28">$ 0</strong></div>
        <div class="card stat"><small>Seña</small><strong id="sumDep28">$ 0</strong></div>
        <div class="card stat"><small>Saldo pendiente</small><strong id="sumBal28">$ 0</strong></div>
      </div>

      <div class="field" style="margin-top:12px"><label>Observaciones</label><textarea name="notes">${esc(e?.notes||'')}</textarea></div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar fiesta</button>
      </div>
    </form>
  `);

  const form=$('#ev28'), same=$('#same28');

  function sameDay(){
    const arr=EV28().filter(x=>x.id!==eid&&x.date===form.date.value&&x.status!=='Cancelada').sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    same.innerHTML=`<b>Fiestas ya creadas ese día</b>${arr.length?arr.map(x=>`<div>${esc(x.start)}–${esc(x.end)} · ${esc(x.child||x.client)}</div>`).join(''):'<small>Día libre.</small>'}`;
  }

  function calc(){
    const base=Number($('#base28').value||0);
    let extra=0;$$('.extra28').forEach(x=>{if(x.checked)extra+=Number(x.dataset.price||0)});
    let stock=0;$$('.stockrow28').forEach(r=>{stock+=Number(r.querySelector('.stockqty28').value||0)*Number(r.dataset.price||0)});
    const total=base+extra+stock;
    const dep=Math.min(Number($('#dep28').value||0),total);
    const bal=Math.max(0,total-dep);
    $('#sumBase28').textContent=money(base);
    $('#sumExtra28').textContent=money(extra);
    $('#sumStock28').textContent=money(stock);
    $('#sumTotal28').textContent=money(total);
    $('#sumDep28').textContent=money(dep);
    $('#sumBal28').textContent=money(bal);
  }

  form.date.onchange=sameDay;
  $('#base28').oninput=calc;$('#dep28').oninput=calc;
  $$('.extra28').forEach(x=>x.onchange=calc);
  $$('.stockqty28').forEach(x=>x.oninput=calc);
  sameDay();calc();

  form.onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(form));
    if(f.end<=f.start)return toast('El horario de finalización debe ser posterior');

    const conflict=EV28().find(x=>x.id!==eid&&x.date===f.date&&x.status!=='Cancelada'&&f.start<x.end&&f.end>x.start);
    if(conflict)return toast(`Se superpone con ${conflict.start} a ${conflict.end}`);

    const extrasSel=$$('.extra28').filter(x=>x.checked).map(x=>{
      const ex=extras.find(z=>z.id===x.value);
      return {extraId:x.value,name:ex?.name||ex?.description||'Adicional',price:Number(x.dataset.price||0)};
    });

    const stockSel=$$('.stockrow28').map(r=>{
      const q=Number(r.querySelector('.stockqty28').value||0);
      return q>0?{productId:r.dataset.id,name:PROD28().find(p=>p.id===r.dataset.id)?.name||'',qty:q,unitPrice:Number(r.dataset.price||0)}:null;
    }).filter(Boolean);

    for(const i of stockSel){
      const row=$(`.stockrow28[data-id="${i.productId}"]`);
      if(i.qty>Number(row.dataset.available||0))return toast(`Stock insuficiente de ${i.name}`);
    }

    const base=Number(f.basePrice||0);
    const extrasTotal=extrasSel.reduce((s,x)=>s+x.price,0);
    const stockTotal=stockSel.reduce((s,x)=>s+x.qty*x.unitPrice,0);
    const total=base+extrasTotal+stockTotal;
    const deposit=Math.min(Number(f.deposit||0),total);

    if(e)restoreOldStock28(e);
    applyNewStock28(stockSel);

    const obj=e||{id:id(),salonId:SID28(),createdAt:new Date().toISOString(),rsvps:[]};
    Object.assign(obj,{
      child:f.child,age:Number(f.age||0),client:f.client,email:f.email,date:f.date,
      status:f.status==='Señada'?'Confirmada':f.status,start:f.start,end:f.end,
      guests:Number(f.guests||0),basePrice:base,total,deposit,paid:deposit,
      depositMethod:f.depositMethod,extras:extrasSel,extrasTotal,
      stockItems:stockSel,stockItemsTotal:stockTotal,notes:f.notes||'',
      updatedAt:new Date().toISOString()
    });

    if(!e)data.events.push(obj);

    data.assignments=(data.assignments||[]).filter(a=>a.eventId!==obj.id);
    const staffIds=new FormData(form).getAll('staffIds');
    staffIds.forEach(staffId=>{
      const s=STAFF28().find(x=>x.id===staffId);
      data.assignments.push({id:id(),salonId:SID28(),eventId:obj.id,staffId,staffName:s?.name||'',createdAt:new Date().toISOString()});
    });

    ensureDepositMovement28(obj);

    save();
    closeModal();
    toast('Reserva guardada con todos sus importes');
    view='events';
    renderSalonShell();
  };
};

window.renderEventsV28=function(){
  setTitle('Fiestas','Reservas, importes y saldos');
  const arr=EV28().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  $('#content').innerHTML=arr.length?`
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Fecha</th><th>Cumpleañero</th><th>Responsable</th><th>Estado</th><th>Total</th><th>Seña/Cobrado</th><th>Saldo</th><th>Personal</th><th></th></tr></thead>
      <tbody>${arr.map(e=>`<tr>
        <td>${esc(e.date||'')}</td><td><b>${esc(e.child||'')}</b></td><td>${esc(e.client||'')}</td>
        <td><span class="pill">${esc(e.status||'')}</span></td>
        <td>${money(e.total||0)}</td><td>${money(e.paid||e.deposit||0)}</td><td>${money(Math.max(0,Number(e.total||0)-Number(e.paid||e.deposit||0)))}</td>
        <td>${assignments28(e.id).length}</td>
        <td><button class="secondary small" onclick="openEventV28('${e.id}')">Abrir</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`:'<div class="empty">No hay fiestas cargadas.</div>';
};

window.openEventV28=function(eid){
  const e=event28(eid);if(!e)return;
  const ass=assignments28(eid), ex=selectedExtras28(e), st=selectedStock28(e);
  const paid=Number(e.paid||e.deposit||0), bal=Math.max(0,Number(e.total||0)-paid);

  showModal(`
    <div class="modal-title">
      <div><h2>${esc(e.child||'Fiesta')} · ${esc(e.date||'')}</h2><p>${esc(e.client||'')} · ${esc(e.start||'')} a ${esc(e.end||'')}</p></div>
      <button class="ghost small" onclick="closeModal()">✕ Cerrar</button>
    </div>

    <div class="grid stats">
      <div class="card stat"><small>Contratado</small><strong>${money(e.total||0)}</strong></div>
      <div class="card stat"><small>Cobrado / seña</small><strong>${money(paid)}</strong></div>
      <div class="card stat"><small>Pendiente</small><strong>${money(bal)}</strong></div>
      <div class="card stat"><small>Confirmados</small><strong>${confirmedCount(e)}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:12px">
      <button class="primary" onclick="openPayment('${e.id}')">+ Registrar cobro</button>
      <button class="secondary" onclick="openEventFormV28('${e.id}')">Editar reserva</button>
      <button class="secondary" onclick="openPrintReservationV13?.('${e.id}')">🖨 Imprimir resumen</button>
      <button class="danger" onclick="confirmDeleteEvent('${e.id}')">🗑 Borrar fiesta</button>
    </div>

    <div class="grid two" style="margin-top:14px">
      <div class="card"><h3>Detalle económico</h3>
        <div>Precio base <b>${money(e.basePrice||0)}</b></div>
        <div>Adicionales <b>${money(e.extrasTotal||0)}</b></div>
        <div>Productos de stock <b>${money(e.stockItemsTotal||0)}</b></div>
        <hr><div>Total reserva <b>${money(e.total||0)}</b></div>
        <div>Seña / cobrado <b>${money(paid)}</b></div>
        <div>Saldo <b>${money(bal)}</b></div>
      </div>
      <div class="card"><h3>Personal asignado</h3>${ass.length?ass.map(a=>`<div>👤 ${esc(a.staffName||STAFF28().find(s=>s.id===a.staffId)?.name||'Personal')}</div>`).join(''):'<div class="empty">Sin personal asignado.</div>'}</div>
      <div class="card"><h3>Adicionales</h3>${ex.length?ex.map(x=>`<div>${esc(x.name||'Adicional')} <b>${money(x.price||0)}</b></div>`).join(''):'<div class="empty">Sin adicionales.</div>'}</div>
      <div class="card"><h3>Productos de stock</h3>${st.length?st.map(x=>`<div>${esc(x.name||'Producto')} · ${Number(x.qty||0)} × ${money(x.unitPrice||0)} = <b>${money(Number(x.qty||0)*Number(x.unitPrice||0))}</b></div>`).join(''):'<div class="empty">Sin productos de stock.</div>'}</div>
    </div>

    <div class="card" style="margin-top:14px"><h3>Observaciones</h3><p>${esc(e.notes||'Sin observaciones')}</p></div>
  `);
};

// Override definitivo de cobro para actualizar paid y saldo correctamente.
window.openPayment=function(eid){
  const e=event28(eid);if(!e)return;
  const balance=Math.max(0,Number(e.total||0)-Number(e.paid||0));
  showModal(`
    <div class="modal-title"><div><h2>Registrar cobro</h2><p>Saldo actual ${money(balance)}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
    <form id="payev28">
      <div class="field"><label>Importe</label><input name="amount" type="number" min="1" max="${balance}" value="${balance}" required></div>
      <div class="field"><label>Medio de pago</label><select name="method">${['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'].map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Registrar cobro</button></div>
    </form>
  `);
  $('#payev28').onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(ev.target));
    const amount=Math.min(Number(f.amount||0),Math.max(0,Number(e.total||0)-Number(e.paid||0)));
    e.paid=Number(e.paid||0)+amount;
    data.movements.push({
      id:id(),salonId:SID28(),type:'Ingreso',category:'Cobro de reserva',
      concept:`Cobro ${e.child||e.client||''}`,amount,method:f.method,eventId:e.id,
      movementDate:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString()
    });
    save();closeModal();toast('Cobro registrado');openEventV28(e.id);
  };
};

// Aliases y router final: evita que vuelvan formularios viejos.
window.openEventForm=window.openEventFormV28;
window.openEvent=window.openEventV28;

const prevView28=renderSalonView;
renderSalonView=function(){
  if(view==='events')return renderEventsV28();
  return prevView28();
};

const prevShell28=renderSalonShell;
renderSalonShell=function(){
  const r=prevShell28();
  setTimeout(()=>{
    $$('button').forEach(b=>{
      const t=(b.textContent||'').toLowerCase();
      if(t.includes('nueva fiesta')||t.includes('nueva reserva'))b.onclick=()=>openEventFormV28();
    });
  },0);
  return r;
};

})();


// ============================================================
// V29 - RESERVAS PERSISTENTES: NO VUELVEN A CERO + MOVIMIENTOS
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.assignments=data.assignments||[];
data.financeResets=data.financeResets||[];
data.accountingEpochs=data.accountingEpochs||[];

const S29=()=>session?.salonId;
const E29=()=> (data.events||[]).filter(e=>e.salonId===S29());
const F29=eid=> (data.events||[]).find(e=>e.id===eid&&e.salonId===S29());
const A29=eid=> (data.assignments||[]).filter(a=>a.eventId===eid);

function unlockReservationAccounting29(e){
  const sid=S29();
  // Desactiva cualquier reset viejo que estaba borrando números nuevos.
  (data.financeResets||[]).forEach(r=>{if(r.salonId===sid)r.active=false});
  data.accountingEpochs=(data.accountingEpochs||[]).filter(x=>x.salonId!==sid);

  if(e){
    e.financeResetLocked=false;
    e.beforeFinanceReset=false;
    e.beforeAccountingReset=false;
  }
}

function rebuildEventMovements29(e){
  if(!e)return;
  const depKey=`event-deposit:${e.id}`;
  const extrasKey=`event-extras:${e.id}`;
  const stockKey=`event-stock:${e.id}`;

  data.movements=(data.movements||[]).filter(m=>
    ![depKey,extrasKey,stockKey].includes(m.sourceKey)
  );

  const d=Number(e.deposit||0);
  if(d>0){
    data.movements.push({
      id:id(),salonId:S29(),sourceKey:depKey,eventId:e.id,
      type:'Ingreso',category:'Seña',
      concept:`Seña reserva ${e.child||e.client||''}`,
      amount:d,method:e.depositMethod||'No especificado',
      movementDate:e.date||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });
  }

  const ex=Number(e.extrasTotal||0);
  if(ex>0){
    data.movements.push({
      id:id(),salonId:S29(),sourceKey:extrasKey,eventId:e.id,
      type:'Cargo',category:'Adicionales de reserva',
      concept:`Adicionales ${e.child||e.client||''}`,
      amount:ex,movementDate:e.date||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });
  }

  const st=Number(e.stockItemsTotal||0);
  if(st>0){
    data.movements.push({
      id:id(),salonId:S29(),sourceKey:stockKey,eventId:e.id,
      type:'Cargo',category:'Productos de stock',
      concept:`Productos de stock ${e.child||e.client||''}`,
      amount:st,movementDate:e.date||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });
  }
}

function normalizeEvent29(e){
  if(!e)return;
  // Recupera datos coherentes si una versión vieja dejó campos parciales.
  const base=Number(e.basePrice ?? e.baseTotal ?? 0);
  const ex=Number(e.extrasTotal||0);
  const st=Number(e.stockItemsTotal||0);
  let total=Number(e.total||0);

  if(total<=0 && (base>0||ex>0||st>0)) total=base+ex+st;

  e.basePrice=base;
  e.extrasTotal=ex;
  e.stockItemsTotal=st;
  e.total=total;

  const dep=Number(e.deposit ?? e.paid ?? 0);
  e.deposit=dep;
  if(Number(e.paid||0)<dep)e.paid=dep;

  unlockReservationAccounting29(e);
}

function fixAllEvents29(){
  E29().forEach(e=>{
    normalizeEvent29(e);
    rebuildEventMovements29(e);
  });
}

// Wrapper final sobre el guardado V28: después de guardar vuelve a afirmar
// importes y movimientos, evitando que capas anteriores los pongan en cero.
const originalOpenEventForm29=window.openEventFormV28 || window.openEventForm;
window.openEventFormV29=function(eid=''){
  const beforeIds=new Set((data.events||[]).map(e=>e.id));
  originalOpenEventForm29(eid);

  const form=document.querySelector('#ev28');
  if(!form)return;

  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const result=oldSubmit ? oldSubmit.call(form,ev) : undefined;

    setTimeout(()=>{
      let e=eid?F29(eid):(data.events||[]).find(x=>x.salonId===S29()&&!beforeIds.has(x.id));
      if(!e)return;

      unlockReservationAccounting29(e);
      normalizeEvent29(e);
      rebuildEventMovements29(e);
      save();

      // Segundo guardado: protege contra wrappers viejos que reescriben el estado.
      setTimeout(()=>{
        const again=F29(e.id);
        if(!again)return;
        unlockReservationAccounting29(again);
        normalizeEvent29(again);
        rebuildEventMovements29(again);
        save();
      },450);
    },80);

    return result;
  };
};

// Lista definitiva de fiestas.
window.renderEventsV29=function(){
  fixAllEvents29();
  setTitle('Fiestas','Reservas con importes y movimientos reales');

  const arr=E29().slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));

  $('#content').innerHTML=arr.length?`
    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th>Fecha</th><th>Cumpleañero</th><th>Responsable</th><th>Estado</th>
          <th>Total</th><th>Seña / Cobrado</th><th>Saldo</th><th>Personal</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${arr.map(e=>{
          normalizeEvent29(e);
          const paid=Number(e.paid||e.deposit||0);
          const balance=Math.max(0,Number(e.total||0)-paid);
          return `<tr>
            <td>${esc(e.date||'')}</td>
            <td><b>${esc(e.child||'')}</b>${e.age?`<small style="display:block">${Number(e.age)} años</small>`:''}</td>
            <td>${esc(e.client||'')}</td>
            <td><span class="pill">${esc(e.status||'')}</span></td>
            <td><b>${money(e.total||0)}</b></td>
            <td>${money(paid)}</td>
            <td>${money(balance)}</td>
            <td>${A29(e.id).length}</td>
            <td><button class="secondary small" onclick="openEventV29('${e.id}')">Abrir</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`:'<div class="empty">No hay fiestas cargadas.</div>';

  save();
};

window.openEventV29=function(eid){
  const e=F29(eid); if(!e)return;
  normalizeEvent29(e);
  rebuildEventMovements29(e);
  save();

  const paid=Number(e.paid||e.deposit||0);
  const balance=Math.max(0,Number(e.total||0)-paid);
  const ass=A29(eid);
  const extras=Array.isArray(e.extras)?e.extras:[];
  const stock=Array.isArray(e.stockItems)?e.stockItems:[];

  showModal(`
    <div class="modal-title">
      <div><h2>${esc(e.child||'Fiesta')} · ${esc(e.date||'')}</h2>
      <p>${esc(e.client||'')} · ${esc(e.start||'')} a ${esc(e.end||'')}</p></div>
      <button class="ghost small" onclick="closeModal()">✕ Cerrar</button>
    </div>

    <div class="grid stats">
      <div class="card stat"><small>Contratado</small><strong>${money(e.total||0)}</strong></div>
      <div class="card stat"><small>Cobrado / seña</small><strong>${money(paid)}</strong></div>
      <div class="card stat"><small>Pendiente</small><strong>${money(balance)}</strong></div>
      <div class="card stat"><small>Personal asignado</small><strong>${ass.length}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:12px">
      ${balance>0?`<button class="primary" onclick="openPaymentV29('${e.id}')">+ Registrar cobro</button>`:''}
      <button class="secondary" onclick="openEventFormV29('${e.id}')">Editar reserva</button>
      <button class="danger" onclick="confirmDeleteEvent('${e.id}')">🗑 Borrar fiesta</button>
    </div>

    <div class="grid two" style="margin-top:14px">
      <div class="card">
        <h3>Detalle económico</h3>
        <div>Precio base <b>${money(e.basePrice||0)}</b></div>
        <div>Adicionales <b>${money(e.extrasTotal||0)}</b></div>
        <div>Productos de stock <b>${money(e.stockItemsTotal||0)}</b></div>
        <hr>
        <div>Total reserva <b>${money(e.total||0)}</b></div>
        <div>Seña / cobrado <b>${money(paid)}</b></div>
        <div>Saldo pendiente <b>${money(balance)}</b></div>
      </div>

      <div class="card">
        <h3>Personal asignado</h3>
        ${ass.length?ass.map(a=>`<div>👤 ${esc(a.staffName||'Personal')}</div>`).join(''):'<div class="empty">Sin personal asignado.</div>'}
      </div>

      <div class="card">
        <h3>Adicionales</h3>
        ${extras.length?extras.map(x=>`<div>${esc(x.name||'Adicional')} <b>${money(x.price||0)}</b></div>`).join(''):'<div class="empty">Sin adicionales.</div>'}
      </div>

      <div class="card">
        <h3>Productos de stock</h3>
        ${stock.length?stock.map(x=>`<div>${esc(x.name||'Producto')} · ${Number(x.qty||0)} × ${money(x.unitPrice||0)} = <b>${money(Number(x.qty||0)*Number(x.unitPrice||0))}</b></div>`).join(''):'<div class="empty">Sin productos de stock.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Movimientos de esta reserva</h3>
      ${((data.movements||[]).filter(m=>m.eventId===e.id)).length
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr></thead><tbody>
          ${(data.movements||[]).filter(m=>m.eventId===e.id).map(m=>`<tr><td>${esc(m.type||'')}</td><td>${esc(m.concept||'')}</td><td>${money(m.amount||0)}</td><td>${esc(m.method||'')}</td></tr>`).join('')}
          </tbody></table></div>`
        : '<div class="empty">Sin movimientos registrados.</div>'}
    </div>
  `);
};

window.openPaymentV29=function(eid){
  const e=F29(eid); if(!e)return;
  normalizeEvent29(e);

  const current=Number(e.paid||0);
  const balance=Math.max(0,Number(e.total||0)-current);
  if(balance<=0)return toast('La reserva ya está totalmente cobrada');

  showModal(`
    <div class="modal-title"><div><h2>Registrar cobro</h2><p>Saldo actual ${money(balance)}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
    <form id="pay29">
      <div class="field"><label>Importe</label><input name="amount" type="number" min="1" max="${balance}" value="${balance}" required></div>
      <div class="field"><label>Medio de pago</label><select name="method">${['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'].map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Registrar cobro</button></div>
    </form>
  `);

  $('#pay29').onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(ev.target));
    const amount=Math.min(Number(f.amount||0),Math.max(0,Number(e.total||0)-Number(e.paid||0)));

    unlockReservationAccounting29(e);
    e.paid=Number(e.paid||0)+amount;

    data.movements.push({
      id:id(),salonId:S29(),eventId:e.id,
      type:'Ingreso',category:'Cobro de reserva',
      concept:`Cobro ${e.child||e.client||''}`,
      amount,method:f.method,
      movementDate:new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });

    save();
    setTimeout(()=>{
      unlockReservationAccounting29(e);
      save();
      closeModal();
      toast('Cobro registrado');
      openEventV29(e.id);
    },150);
  };
};

// Al entrar al sistema, corrige reservas existentes y preserva sus números.
setTimeout(()=>{
  try{
    if(session?.role==='salon'){
      fixAllEvents29();
      save();
    }
  }catch(_){}
},900);

// Aliases definitivos: ninguna capa vieja vuelve a tomar control.
window.openEventForm=window.openEventFormV29;
window.openEventFormV28=window.openEventFormV29;
window.openEvent=window.openEventV29;
window.openEventV28=window.openEventV29;
window.openPayment=window.openPaymentV29;

const route29=renderSalonView;
renderSalonView=function(){
  if(view==='events')return renderEventsV29();
  return route29();
};

const shell29=renderSalonShell;
renderSalonShell=function(){
  const r=shell29();
  setTimeout(()=>{
    $$('button').forEach(b=>{
      const t=(b.textContent||'').toLowerCase();
      if(t.includes('nueva fiesta')||t.includes('nueva reserva')){
        b.onclick=()=>openEventFormV29();
      }
    });
  },0);
  return r;
};

})();


// ============================================================
// V30 - CONTABILIDAD CORRECTA DE LA RESERVA
// Base + extras + stock + personal adicional = Total cliente
// Seña/cobros descuentan saldo
// Personal siempre = gasto del salón
// Dashboard toma una única contabilidad
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.assignments=data.assignments||[];
data.stockProducts=data.stockProducts||[];
data.salonExtras=data.salonExtras||[];
data.financeResets=data.financeResets||[];
data.accountingEpochs=data.accountingEpochs||[];

const SID30=()=>session?.salonId;
const EVENTS30=()=> (data.events||[]).filter(e=>e.salonId===SID30());
const EVENT30=eid=> (data.events||[]).find(e=>e.id===eid&&e.salonId===SID30());
const STAFF30=()=> (data.staff||[]).filter(s=>s.salonId===SID30()&&s.staffStatus!=='Suspendido');
const PROD30=()=> (data.stockProducts||[]).filter(p=>p.salonId===SID30());
const EXTRA30=()=> (data.salonExtras||[]).filter(x=>x.salonId===SID30());
const ASS30=eid=> (data.assignments||[]).filter(a=>a.eventId===eid);

function unlock30(e){
  (data.financeResets||[]).forEach(r=>{if(r.salonId===SID30())r.active=false});
  data.accountingEpochs=(data.accountingEpochs||[]).filter(x=>x.salonId!==SID30());
  if(e){
    e.financeResetLocked=false;
    e.beforeFinanceReset=false;
    e.beforeAccountingReset=false;
  }
}

function removeEventAutoMovements30(eid){
  data.movements=(data.movements||[]).filter(m=>{
    if(m.eventId!==eid)return true;
    return !String(m.sourceKey||'').startsWith('v30:');
  });
}

function rebuildEventMovements30(e){
  if(!e)return;
  removeEventAutoMovements30(e.id);

  const deposit=Number(e.deposit||0);
  if(deposit>0){
    data.movements.push({
      id:id(),salonId:SID30(),eventId:e.id,
      sourceKey:`v30:deposit:${e.id}`,
      type:'Ingreso',category:'Seña',
      concept:`Seña ${e.child||e.client||''}`,
      amount:deposit,method:e.depositMethod||'No especificado',
      movementDate:e.date||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });
  }

  ASS30(e.id).forEach(a=>{
    const amount=Number(a.amount||0);
    if(amount<=0)return;
    data.movements.push({
      id:id(),salonId:SID30(),eventId:e.id,
      sourceKey:`v30:staff:${e.id}:${a.staffId}`,
      type:'Gasto',category:'Personal',
      concept:`Personal ${a.staffName||''} · ${e.child||e.client||''}`,
      amount,method:'',
      movementDate:e.date||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });
  });
}

function normalize30(e){
  if(!e)return;
  const base=Number(e.basePrice??e.baseTotal??0);
  const extra=Number(e.extrasTotal||0);
  const stock=Number(e.stockItemsTotal||0);
  const staffCharge=Number(e.staffClientChargeTotal||0);
  e.basePrice=base;
  e.total=base+extra+stock+staffCharge;
  e.deposit=Number(e.deposit??0);
  if(Number(e.paid||0)<e.deposit)e.paid=e.deposit;
  e.balance=Math.max(0,Number(e.total||0)-Number(e.paid||0));
  unlock30(e);
}

function restoreStock30(e){
  (e?.stockItems||[]).forEach(i=>{
    const p=(data.stockProducts||[]).find(x=>x.id===i.productId&&x.salonId===SID30());
    if(p)p.stock=Number(p.stock||0)+Number(i.qty||0);
  });
}
function applyStock30(items){
  items.forEach(i=>{
    const p=(data.stockProducts||[]).find(x=>x.id===i.productId&&x.salonId===SID30());
    if(p)p.stock=Math.max(0,Number(p.stock||0)-Number(i.qty||0));
  });
}

window.openEventFormV30=function(eid=''){
  const e=eid?EVENT30(eid):null;
  const staff=STAFF30(), extras=EXTRA30(), products=PROD30();
  const oldAssignments=ASS30(eid);
  const oldExtras=Array.isArray(e?.extras)?e.extras:[];
  const oldStock=Array.isArray(e?.stockItems)?e.stockItems:[];

  showModal(`
    <div class="modal-title">
      <div><h2>${e?'Editar reserva':'Nueva reserva'}</h2><p>El total se calcula automáticamente.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="ev30">
      <div class="form-grid">
        <div class="field"><label>Nombre del cumpleañero/a</label><input name="child" required value="${esc(e?.child||'')}"></div>
        <div class="field"><label>Edad que cumple</label><input name="age" type="number" min="0" value="${Number(e?.age||0)}"></div>
        <div class="field"><label>Responsable del evento</label><input name="client" required value="${esc(e?.client||'')}"></div>
        <div class="field"><label>Email del cliente</label><input name="email" type="email" required value="${esc(e?.email||'')}"></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" required value="${esc(e?.date||todayKey())}"></div>
        <div class="field"><label>Estado</label><select name="status">${['Consulta','Pendiente','Señada','Confirmada','Finalizada','Cancelada'].map(x=>`<option ${e?.status===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Horario desde</label><input name="start" type="time" required value="${esc(e?.start||'')}"></div>
        <div class="field"><label>Horario hasta</label><input name="end" type="time" required value="${esc(e?.end||'')}"></div>
        <div class="field"><label>Cantidad de invitados</label><input name="guests" type="number" min="0" value="${Number(e?.guests||0)}"></div>

        <div class="field">
          <label>Costo de la fiesta / precio base</label>
          <input name="basePrice" id="base30" type="number" min="0" value="${Number(e?.basePrice??e?.baseTotal??0)}" required>
          <small class="muted">Este es el valor base de la reserva.</small>
        </div>

        <div class="field">
          <label>Valor de la seña</label>
          <input name="deposit" id="dep30" type="number" min="0" value="${Number(e?.deposit??0)}">
        </div>

        <div class="field">
          <label>Medio de pago de la seña</label>
          <select name="depositMethod">
            ${['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'].map(x=>`<option ${e?.depositMethod===x?'selected':''}>${x}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="same30" class="card" style="margin-top:12px"></div>

      <div class="card" style="margin-top:12px">
        <div class="section-title">
          <div><h3>Personal asignado</h3><small class="muted">Siempre es gasto del salón. Solo suma al cliente si marcás “Cobrar como adicional”.</small></div>
        </div>
        ${staff.length?staff.map(s=>{
          const a=oldAssignments.find(x=>x.staffId===s.id);
          return `
          <div class="form-grid staffrow30" data-id="${s.id}" data-fee="${Number(s.defaultFee||0)}" style="align-items:end;margin-bottom:8px">
            <label class="check-card span2">
              <input type="checkbox" class="staffsel30" ${a?'checked':''}>
              <span><b>${esc(s.name)}</b><small>${esc(s.role||'')} · Costo salón ${money(s.defaultFee||0)}</small></span>
            </label>
            <label class="check-card">
              <input type="checkbox" class="staffcharge30" ${a?.chargeToClient?'checked':''}>
              <span><b>Cobrar como adicional</b><small>Se suma al total del cliente</small></span>
            </label>
            <div class="field">
              <label>Valor a cobrar al cliente</label>
              <input class="staffclient30" type="number" min="0" value="${Number(a?.clientCharge??s.defaultFee??0)}">
            </div>
          </div>`;
        }).join(''):'<div class="empty">No hay personal activo cargado.</div>'}
      </div>

      <div class="card" style="margin-top:12px">
        <div class="section-title"><div><h3>Adicionales</h3><small class="muted">Todo adicional seleccionado se suma al total.</small></div></div>
        ${extras.length?`<div class="form-grid">${extras.map(x=>{
          const checked=oldExtras.some(z=>z.extraId===x.id||z.id===x.id);
          const price=Number(x.price||x.amount||0);
          return `<label class="check-card"><input type="checkbox" class="extra30" value="${x.id}" data-price="${price}" ${checked?'checked':''}><span><b>${esc(x.name||x.description||'Adicional')}</b><small>${money(price)}</small></span></label>`;
        }).join('')}</div>`:'<div class="empty">No hay adicionales configurados.</div>'}
      </div>

      <div class="card" style="margin-top:12px">
        <div class="section-title"><div><h3>Productos de stock</h3><small class="muted">Cada producto seleccionado se suma al total de la fiesta.</small></div></div>
        ${products.length?products.map(p=>{
          const old=oldStock.find(x=>x.productId===p.id);
          const available=Number(p.stock||0)+Number(old?.qty||0);
          return `
          <div class="form-grid stockrow30" data-id="${p.id}" data-price="${Number(p.salePrice||0)}" data-available="${available}" style="align-items:end;margin-bottom:8px">
            <div class="field span2"><label>${esc(p.name)}</label><small>Disponible ${available} · Venta ${money(p.salePrice||0)}</small></div>
            <div class="field"><label>Cantidad</label><input class="stockqty30" type="number" min="0" max="${available}" value="${Number(old?.qty||0)}"></div>
          </div>`;
        }).join(''):'<div class="empty">No hay productos cargados.</div>'}
      </div>

      <div class="grid stats" style="margin-top:14px">
        <div class="card stat"><small>Precio base</small><strong id="baseSum30">$ 0</strong></div>
        <div class="card stat"><small>Adicionales</small><strong id="extraSum30">$ 0</strong></div>
        <div class="card stat"><small>Productos</small><strong id="stockSum30">$ 0</strong></div>
        <div class="card stat"><small>Personal adicional cobrado</small><strong id="staffChargeSum30">$ 0</strong></div>
        <div class="card stat"><small>Total de la reserva</small><strong id="totalSum30">$ 0</strong></div>
        <div class="card stat"><small>Seña</small><strong id="depSum30">$ 0</strong></div>
        <div class="card stat"><small>Saldo cliente</small><strong id="balSum30">$ 0</strong></div>
        <div class="card stat"><small>Gasto personal salón</small><strong id="staffExpenseSum30">$ 0</strong></div>
      </div>

      <div class="field" style="margin-top:12px"><label>Observaciones</label><textarea name="notes">${esc(e?.notes||'')}</textarea></div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar fiesta</button>
      </div>
    </form>
  `);

  const form=$('#ev30'),same=$('#same30');

  function day(){
    const a=EVENTS30().filter(x=>x.id!==eid&&x.date===form.date.value&&x.status!=='Cancelada');
    same.innerHTML=`<b>Fiestas ya creadas ese día</b>${a.length?a.map(x=>`<div>${esc(x.start)}–${esc(x.end)} · ${esc(x.child||x.client)}</div>`).join(''):'<small>Día libre.</small>'}`;
  }

  function calc(){
    const base=Number($('#base30').value||0);

    let extra=0;
    $$('.extra30').forEach(x=>{if(x.checked)extra+=Number(x.dataset.price||0)});

    let stock=0;
    $$('.stockrow30').forEach(r=>{
      stock+=Number(r.querySelector('.stockqty30').value||0)*Number(r.dataset.price||0);
    });

    let staffClient=0, staffExpense=0;
    $$('.staffrow30').forEach(r=>{
      const selected=r.querySelector('.staffsel30').checked;
      const charge=r.querySelector('.staffcharge30').checked;
      if(selected){
        staffExpense+=Number(r.dataset.fee||0);
        if(charge)staffClient+=Number(r.querySelector('.staffclient30').value||0);
      }
    });

    const total=base+extra+stock+staffClient;
    const deposit=Math.min(Number($('#dep30').value||0),total);
    const balance=Math.max(0,total-deposit);

    $('#baseSum30').textContent=money(base);
    $('#extraSum30').textContent=money(extra);
    $('#stockSum30').textContent=money(stock);
    $('#staffChargeSum30').textContent=money(staffClient);
    $('#totalSum30').textContent=money(total);
    $('#depSum30').textContent=money(deposit);
    $('#balSum30').textContent=money(balance);
    $('#staffExpenseSum30').textContent=money(staffExpense);
  }

  form.date.onchange=day;
  $('#base30').oninput=calc;$('#dep30').oninput=calc;
  $$('.extra30').forEach(x=>x.onchange=calc);
  $$('.stockqty30').forEach(x=>x.oninput=calc);
  $$('.staffrow30 input').forEach(x=>x.oninput=calc);
  $$('.staffrow30 input[type=checkbox]').forEach(x=>x.onchange=calc);

  day();calc();

  form.onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(form));

    if(f.end<=f.start)return toast('El horario de finalización debe ser posterior');
    const conflict=EVENTS30().find(x=>x.id!==eid&&x.date===f.date&&x.status!=='Cancelada'&&f.start<x.end&&f.end>x.start);
    if(conflict)return toast(`Se superpone con ${conflict.start} a ${conflict.end}`);

    const extrasSel=$$('.extra30').filter(x=>x.checked).map(x=>{
      const ex=extras.find(z=>z.id===x.value);
      return {extraId:x.value,name:ex?.name||ex?.description||'Adicional',price:Number(x.dataset.price||0)};
    });

    const stockSel=$$('.stockrow30').map(r=>{
      const q=Number(r.querySelector('.stockqty30').value||0);
      return q>0?{
        productId:r.dataset.id,
        name:PROD30().find(p=>p.id===r.dataset.id)?.name||'',
        qty:q,unitPrice:Number(r.dataset.price||0)
      }:null;
    }).filter(Boolean);

    for(const i of stockSel){
      const row=$(`.stockrow30[data-id="${i.productId}"]`);
      if(i.qty>Number(row.dataset.available||0))return toast(`Stock insuficiente de ${i.name}`);
    }

    const base=Number(f.basePrice||0);
    const extrasTotal=extrasSel.reduce((s,x)=>s+x.price,0);
    const stockTotal=stockSel.reduce((s,x)=>s+x.qty*x.unitPrice,0);

    const staffAssignments=$$('.staffrow30').map(r=>{
      if(!r.querySelector('.staffsel30').checked)return null;
      const staffId=r.dataset.id;
      const p=STAFF30().find(x=>x.id===staffId);
      const chargeToClient=r.querySelector('.staffcharge30').checked;
      const clientCharge=chargeToClient?Number(r.querySelector('.staffclient30').value||0):0;
      return {
        staffId,
        staffName:p?.name||'',
        amount:Number(p?.defaultFee||0),
        chargeToClient,
        clientCharge
      };
    }).filter(Boolean);

    const staffClientTotal=staffAssignments.reduce((s,a)=>s+Number(a.clientCharge||0),0);
    const staffExpenseTotal=staffAssignments.reduce((s,a)=>s+Number(a.amount||0),0);
    const total=base+extrasTotal+stockTotal+staffClientTotal;
    const deposit=Math.min(Number(f.deposit||0),total);

    if(e)restoreStock30(e);
    applyStock30(stockSel);

    const obj=e||{id:id(),salonId:SID30(),createdAt:new Date().toISOString(),rsvps:[]};
    Object.assign(obj,{
      child:f.child,age:Number(f.age||0),client:f.client,email:f.email,date:f.date,
      status:f.status==='Señada'?'Confirmada':f.status,
      start:f.start,end:f.end,guests:Number(f.guests||0),
      basePrice:base,extras:extrasSel,extrasTotal,
      stockItems:stockSel,stockItemsTotal:stockTotal,
      staffClientChargeTotal:staffClientTotal,
      staffExpenseTotal,
      total,deposit,paid:deposit,
      depositMethod:f.depositMethod,
      balance:Math.max(0,total-deposit),
      notes:f.notes||'',
      updatedAt:new Date().toISOString()
    });

    if(!e)data.events.push(obj);

    data.assignments=(data.assignments||[]).filter(a=>a.eventId!==obj.id);
    staffAssignments.forEach(a=>{
      data.assignments.push({
        id:id(),salonId:SID30(),eventId:obj.id,
        ...a,paid:false,createdAt:new Date().toISOString()
      });
    });

    unlock30(obj);
    rebuildEventMovements30(obj);

    save();

    setTimeout(()=>{
      const again=EVENT30(obj.id);
      if(!again)return;
      normalize30(again);
      rebuildEventMovements30(again);
      save();
    },350);

    closeModal();
    toast('Reserva guardada con cuentas correctas');
    view='events';
    renderSalonShell();
  };
};

window.renderEventsV30=function(){
  setTitle('Fiestas','Total, cobrado, saldo y gastos de cada reserva');
  const a=EVENTS30().slice().sort((x,y)=>String(x.date||'').localeCompare(String(y.date||'')));

  $('#content').innerHTML=a.length?`
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Fecha</th><th>Cumpleañero</th><th>Cliente</th><th>Estado</th><th>Total reserva</th><th>Cobrado</th><th>Saldo</th><th>Gasto personal</th><th></th></tr></thead>
    <tbody>${a.map(e=>{
      normalize30(e);
      return `<tr>
        <td>${esc(e.date||'')}</td>
        <td><b>${esc(e.child||'')}</b></td>
        <td>${esc(e.client||'')}</td>
        <td><span class="pill">${esc(e.status||'')}</span></td>
        <td><b>${money(e.total||0)}</b></td>
        <td>${money(e.paid||0)}</td>
        <td>${money(Math.max(0,Number(e.total||0)-Number(e.paid||0)))}</td>
        <td>${money(e.staffExpenseTotal||ASS30(e.id).reduce((s,x)=>s+Number(x.amount||0),0))}</td>
        <td><button class="secondary small" onclick="openEventV30('${e.id}')">Abrir</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`:'<div class="empty">No hay fiestas.</div>';
};

window.openEventV30=function(eid){
  const e=EVENT30(eid);if(!e)return;
  normalize30(e);
  rebuildEventMovements30(e);
  save();

  const paid=Number(e.paid||0),balance=Math.max(0,Number(e.total||0)-paid);
  const ass=ASS30(eid),extra=e.extras||[],stock=e.stockItems||[];

  showModal(`
    <div class="modal-title">
      <div><h2>${esc(e.child||'Fiesta')} · ${esc(e.date||'')}</h2><p>${esc(e.client||'')} · ${esc(e.start||'')} a ${esc(e.end||'')}</p></div>
      <button class="ghost small" onclick="closeModal()">✕ Cerrar</button>
    </div>

    <div class="grid stats">
      <div class="card stat"><small>Total reserva</small><strong>${money(e.total||0)}</strong></div>
      <div class="card stat"><small>Cobrado</small><strong>${money(paid)}</strong></div>
      <div class="card stat"><small>Saldo cliente</small><strong>${money(balance)}</strong></div>
      <div class="card stat"><small>Gasto personal salón</small><strong>${money(e.staffExpenseTotal||0)}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:12px">
      ${balance>0?`<button class="primary" onclick="openPaymentV30('${e.id}')">+ Registrar cobro</button>`:''}
      <button class="secondary" onclick="openEventFormV30('${e.id}')">Editar reserva</button>
      <button class="danger" onclick="confirmDeleteEvent('${e.id}')">🗑 Borrar fiesta</button>
    </div>

    <div class="grid two" style="margin-top:14px">
      <div class="card">
        <h3>Cuenta del cliente</h3>
        <div>Precio base <b>${money(e.basePrice||0)}</b></div>
        <div>Adicionales <b>${money(e.extrasTotal||0)}</b></div>
        <div>Productos stock <b>${money(e.stockItemsTotal||0)}</b></div>
        <div>Personal adicional cobrado <b>${money(e.staffClientChargeTotal||0)}</b></div>
        <hr>
        <div>Total reserva <b>${money(e.total||0)}</b></div>
        <div>Seña / cobrado <b>${money(paid)}</b></div>
        <div>Saldo <b>${money(balance)}</b></div>
      </div>

      <div class="card">
        <h3>Personal / costo salón</h3>
        ${ass.length?ass.map(a=>`<div>👤 ${esc(a.staffName||'Personal')} · costo salón <b>${money(a.amount||0)}</b>${a.chargeToClient?` · cobrado al cliente <b>${money(a.clientCharge||0)}</b>`:''}</div>`).join(''):'<div class="empty">Sin personal asignado.</div>'}
      </div>

      <div class="card">
        <h3>Adicionales</h3>
        ${extra.length?extra.map(x=>`<div>${esc(x.name)} <b>${money(x.price||0)}</b></div>`).join(''):'<div class="empty">Sin adicionales.</div>'}
      </div>

      <div class="card">
        <h3>Productos stock</h3>
        ${stock.length?stock.map(x=>`<div>${esc(x.name)} · ${x.qty} × ${money(x.unitPrice)} = <b>${money(Number(x.qty)*Number(x.unitPrice))}</b></div>`).join(''):'<div class="empty">Sin productos.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Movimientos de esta fiesta</h3>
      ${data.movements.filter(m=>m.eventId===e.id).length?`
      <div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr></thead><tbody>
      ${data.movements.filter(m=>m.eventId===e.id).map(m=>`<tr><td>${esc(m.type)}</td><td>${esc(m.concept)}</td><td>${money(m.amount)}</td><td>${esc(m.method||'')}</td></tr>`).join('')}
      </tbody></table></div>`:'<div class="empty">Sin movimientos.</div>'}
    </div>
  `);
};

window.openPaymentV30=function(eid){
  const e=EVENT30(eid);if(!e)return;
  normalize30(e);
  const balance=Math.max(0,Number(e.total||0)-Number(e.paid||0));
  if(balance<=0)return toast('La fiesta ya está totalmente cobrada');

  showModal(`
    <div class="modal-title"><div><h2>Registrar cobro</h2><p>Saldo actual ${money(balance)}</p></div><button class="ghost small" onclick="closeModal()">✕</button></div>
    <form id="pay30">
      <div class="field"><label>Importe</label><input name="amount" type="number" min="1" max="${balance}" value="${balance}" required></div>
      <div class="field"><label>Medio de pago</label><select name="method">${['Efectivo','Transferencia','Mercado Pago','Tarjeta','Otro'].map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="primary">Registrar cobro</button></div>
    </form>
  `);

  $('#pay30').onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(ev.target));
    const amount=Math.min(Number(f.amount||0),Math.max(0,Number(e.total||0)-Number(e.paid||0)));

    unlock30(e);
    e.paid=Number(e.paid||0)+amount;
    e.balance=Math.max(0,Number(e.total||0)-Number(e.paid||0));

    data.movements.push({
      id:id(),salonId:SID30(),eventId:e.id,
      type:'Ingreso',category:'Cobro de reserva',
      concept:`Cobro ${e.child||e.client||''}`,
      amount,method:f.method,
      movementDate:new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Cobro registrado');
    openEventV30(e.id);
  };
};

window.renderDashboardV30=function(){
  const ev=EVENTS30();
  ev.forEach(normalize30);

  const contracted=ev.filter(e=>e.status!=='Cancelada').reduce((s,e)=>s+Number(e.total||0),0);
  const income=(data.movements||[]).filter(m=>m.salonId===SID30()&&m.type==='Ingreso').reduce((s,m)=>s+Number(m.amount||0),0);
  const expenses=(data.movements||[]).filter(m=>m.salonId===SID30()&&m.type==='Gasto').reduce((s,m)=>s+Number(m.amount||0),0);
  const pending=Math.max(0,contracted-income);

  setTitle('Inicio','Resumen contable real del salón');
  $('#content').innerHTML=`
    <div class="grid stats">
      <div class="card stat"><small>Fiestas activas</small><strong>${ev.filter(e=>!['Cancelada','Finalizada'].includes(e.status)).length}</strong></div>
      <div class="card stat"><small>Contratado</small><strong>${money(contracted)}</strong></div>
      <div class="card stat"><small>Ingresado</small><strong>${money(income)}</strong></div>
      <div class="card stat"><small>Pendiente de cobrar</small><strong>${money(pending)}</strong></div>
      <div class="card stat"><small>Egresos</small><strong>${money(expenses)}</strong></div>
      <div class="card stat"><small>Resultado de caja</small><strong>${money(income-expenses)}</strong></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Últimos movimientos</h3>
      ${data.movements.filter(m=>m.salonId===SID30()).length?`
      <div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr></thead><tbody>
      ${data.movements.filter(m=>m.salonId===SID30()).slice(-12).reverse().map(m=>`<tr><td>${esc(m.type||'')}</td><td>${esc(m.concept||'')}</td><td>${money(m.amount||0)}</td><td>${esc(m.method||'')}</td></tr>`).join('')}
      </tbody></table></div>`:'<div class="empty">Sin movimientos.</div>'}
    </div>
  `;
};

// aliases finales
window.openEventForm=window.openEventFormV30;
window.openEventFormV29=window.openEventFormV30;
window.openEventFormV28=window.openEventFormV30;
window.openEvent=window.openEventV30;
window.openEventV29=window.openEventV30;
window.openPayment=window.openPaymentV30;
window.openPaymentV29=window.openPaymentV30;

const route30=renderSalonView;
renderSalonView=function(){
  if(view==='events')return renderEventsV30();
  if(view==='dashboard')return renderDashboardV30();
  return route30();
};

const shell30=renderSalonShell;
renderSalonShell=function(){
  const r=shell30();
  setTimeout(()=>{
    $$('button').forEach(b=>{
      const t=(b.textContent||'').toLowerCase();
      if(t.includes('nueva fiesta')||t.includes('nueva reserva'))b.onclick=()=>openEventFormV30();
    });
  },0);
  return r;
};

})();


// ============================================================
// V31 - PERSONAL COMPLETO + COSTO POR FIESTA COMO GASTO DEL SALÓN
// ============================================================
(function(){
'use strict';

data.staff=data.staff||[];
data.assignments=data.assignments||[];
data.movements=data.movements||[];

const SID31=()=>session?.salonId;
const STAFF31=()=> (data.staff||[]).filter(s=>s.salonId===SID31());
const EVENT31=eid=> (data.events||[]).find(e=>e.id===eid&&e.salonId===SID31());

function staffPhoto31(input, cb){
  const f=input?.files?.[0];
  if(!f)return cb('');
  if(f.size>2*1024*1024){toast('La foto no puede superar 2 MB');return cb(null)}
  const r=new FileReader();
  r.onload=()=>cb(String(r.result||''));
  r.readAsDataURL(f);
}

window.renderStaffV31=function(){
  const rows=STAFF31();
  setTitle('Personal','Empleados, roles y costo por fiesta');

  $('#content').innerHTML=`
    <div class="toolbar">
      <button class="primary" onclick="openStaffV31()">+ Agregar empleado</button>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">
        <div>
          <h3>Listado de personal</h3>
          <small class="muted">El costo por fiesta se toma automáticamente como gasto del salón cuando se asigna a una reserva.</small>
        </div>
      </div>

      ${rows.length?`
      <div class="table-wrap"><table class="table">
        <thead>
          <tr>
            <th>Foto</th>
            <th>Nombre completo</th>
            <th>Teléfono</th>
            <th>Rol</th>
            <th>Costo x fiesta</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(s=>`
            <tr>
              <td>${s.photo?`<img src="${s.photo}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`:'👤'}</td>
              <td><b>${esc(s.name||'')}</b></td>
              <td>${esc(s.phone||'')}</td>
              <td>${esc(s.role||'')}</td>
              <td><b>${money(s.defaultFee||0)}</b></td>
              <td><span class="pill">${esc(s.staffStatus||'Activo')}</span></td>
              <td>
                <button class="secondary small" onclick="openStaffV31('${s.id}')">Editar</button>
                <button class="secondary small" onclick="toggleStaffV31('${s.id}')">${s.staffStatus==='Suspendido'?'Activar':'Suspender'}</button>
                <button class="danger small" onclick="deleteStaffV31('${s.id}')">Eliminar</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`:'<div class="empty">No hay empleados cargados.</div>'}
    </div>
  `;
};

window.openStaffV31=function(staffId=''){
  const s=(data.staff||[]).find(x=>x.id===staffId&&x.salonId===SID31());

  showModal(`
    <div class="modal-title">
      <div><h2>${s?'Editar empleado':'Agregar empleado'}</h2><p>Datos y costo por fiesta.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="staff31">
      <div class="form-grid">
        <div class="field span2">
          <label>Nombre completo</label>
          <input name="name" required value="${esc(s?.name||'')}">
        </div>

        <div class="field">
          <label>Teléfono</label>
          <input name="phone" value="${esc(s?.phone||'')}">
        </div>

        <div class="field">
          <label>Rol</label>
          <input name="role" required value="${esc(s?.role||'')}" placeholder="Ej: Moza, Animador, Cocinero">
        </div>

        <div class="field">
          <label>Costo por fiesta</label>
          <input name="defaultFee" type="number" min="0" value="${Number(s?.defaultFee||0)}" required>
          <small class="muted">Este valor NO se cobra al cliente. Se registra como gasto del salón.</small>
        </div>

        <div class="field">
          <label>Foto del empleado</label>
          <input name="photo" type="file" accept="image/*">
          ${s?.photo?`<img src="${s.photo}" style="display:block;width:80px;height:80px;border-radius:50%;object-fit:cover;margin-top:8px">`:''}
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar empleado</button>
      </div>
    </form>
  `);

  $('#staff31').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));

    staffPhoto31(e.target.photo, img=>{
      if(img===null)return;

      const obj=s||{
        id:id(),
        salonId:SID31(),
        staffStatus:'Activo',
        createdAt:new Date().toISOString()
      };

      obj.name=String(f.name||'').trim();
      obj.phone=String(f.phone||'').trim();
      obj.role=String(f.role||'').trim();
      obj.defaultFee=Number(f.defaultFee||0);
      if(img)obj.photo=img;
      obj.updatedAt=new Date().toISOString();

      if(!s)data.staff.push(obj);

      save();
      closeModal();
      toast(s?'Empleado actualizado':'Empleado creado');
      renderStaffV31();
    });
  };
};

window.toggleStaffV31=function(staffId){
  const s=(data.staff||[]).find(x=>x.id===staffId&&x.salonId===SID31());
  if(!s)return;
  s.staffStatus=s.staffStatus==='Suspendido'?'Activo':'Suspendido';
  save();
  renderStaffV31();
};

window.deleteStaffV31=function(staffId){
  const s=(data.staff||[]).find(x=>x.id===staffId&&x.salonId===SID31());
  if(!s)return;
  if(!confirm(`¿Eliminar a ${s.name}?`))return;

  data.staff=(data.staff||[]).filter(x=>x.id!==staffId);
  data.assignments=(data.assignments||[]).filter(a=>a.staffId!==staffId);

  // Elimina gastos automáticos de personal vinculados a este empleado.
  data.movements=(data.movements||[]).filter(m=>m.staffId!==staffId);

  save();
  toast('Empleado eliminado');
  renderStaffV31();
};

// Recalcula el gasto de personal de una fiesta a partir de los empleados asignados.
// NO suma al total del cliente.
window.rebuildStaffExpenseV31=function(eventId){
  const e=EVENT31(eventId);
  if(!e)return;

  const ass=(data.assignments||[]).filter(a=>a.eventId===eventId);
  let totalExpense=0;

  // Quita movimientos automáticos anteriores de personal para esta fiesta.
  data.movements=(data.movements||[]).filter(m=>
    !(m.eventId===eventId && m.category==='Personal' && m.autoStaffExpense===true)
  );

  ass.forEach(a=>{
    const s=(data.staff||[]).find(x=>x.id===a.staffId&&x.salonId===SID31());
    const fee=Number(s?.defaultFee??a.amount??0);

    a.amount=fee;
    a.staffName=s?.name||a.staffName||'Personal';

    totalExpense+=fee;

    if(fee>0){
      data.movements.push({
        id:id(),
        salonId:SID31(),
        eventId,
        staffId:a.staffId,
        type:'Gasto',
        category:'Personal',
        concept:`${s?.role||'Personal'} - ${s?.name||a.staffName||''} · ${e.child||e.client||''}`,
        amount:fee,
        autoStaffExpense:true,
        movementDate:e.date||new Date().toISOString().slice(0,10),
        createdAt:new Date().toISOString()
      });
    }
  });

  e.staffExpenseTotal=totalExpense;
  save();
};

// Al abrir ficha de evento, garantiza que el costo de personal esté actualizado.
const oldOpenEvent31=window.openEventV30||window.openEvent;
window.openEventV31=function(eid){
  rebuildStaffExpenseV31(eid);
  return oldOpenEvent31(eid);
};

// Al guardar/editar una reserva, vuelve a calcular gasto de personal.
const oldEventForm31=window.openEventFormV30||window.openEventForm;
window.openEventFormV31=function(eid=''){
  const before=new Set((data.events||[]).map(e=>e.id));
  oldEventForm31(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const result=oldSubmit?oldSubmit.call(form,ev):undefined;

    setTimeout(()=>{
      let eventId=eid;
      if(!eventId){
        const created=(data.events||[]).find(e=>e.salonId===SID31()&&!before.has(e.id));
        eventId=created?.id||'';
      }
      if(eventId)rebuildStaffExpenseV31(eventId);
    },250);

    return result;
  };
};

// Aliases finales
window.openStaffForm=window.openStaffV31;
window.openStaffV24=window.openStaffV31;
window.openEvent=window.openEventV31;
window.openEventV30=window.openEventV31;
window.openEventForm=window.openEventFormV31;
window.openEventFormV30=window.openEventFormV31;

const route31=renderSalonView;
renderSalonView=function(){
  if(view==='staff')return renderStaffV31();
  return route31();
};

})();


// ============================================================
// V32 - INICIO POR FIESTA + CONTABILIDAD GENERAL APARTE
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.assignments=data.assignments||[];

const SID32=()=>session?.salonId;
const EV32=()=> (data.events||[]).filter(e=>e.salonId===SID32() && e.status!=='Cancelada');
const ASS32=eid=> (data.assignments||[]).filter(a=>a.eventId===eid);
const MOV32=()=> (data.movements||[]).filter(m=>m.salonId===SID32());

function n32(v){return Number(v||0)}
function eventFigures32(e){
  const base=n32(e.basePrice ?? e.baseTotal ?? 0);
  const extras=n32(e.extrasTotal);
  const stock=n32(e.stockItemsTotal);
  const extraStaff=n32(e.staffClientChargeTotal);
  const contracted=base+extras+stock+extraStaff;

  // Todo lo efectivamente pagado por el cliente.
  // e.paid incluye seña + cobros posteriores.
  const paid=n32(e.paid ?? e.deposit ?? 0);
  const pending=Math.max(0,contracted-paid);

  const staffExpense=n32(
    e.staffExpenseTotal ??
    ASS32(e.id).reduce((s,a)=>s+n32(a.amount),0)
  );

  return {base,extras,stock,extraStaff,contracted,paid,pending,staffExpense};
}

// Inicio deja de ser una contabilidad general.
// Muestra cada fiesta con su propia cuenta.
window.renderDashboardV32=function(){
  const events=EV32().slice().sort((a,b)=>{
    const da=String(a.date||'')+String(a.start||'');
    const db=String(b.date||'')+String(b.start||'');
    return da.localeCompare(db);
  });

  setTitle('Inicio','Estado económico por fiesta');

  $('#content').innerHTML=events.length ? `
    <div class="card">
      <div class="section-title">
        <div>
          <h3>Cuenta de cada fiesta</h3>
          <small class="muted">Los importes se muestran por reserva. La contabilidad general está en la pestaña Contabilidad.</small>
        </div>
      </div>
    </div>

    ${events.map(e=>{
      const f=eventFigures32(e);
      return `
      <div class="card" style="margin-top:16px">
        <div class="section-title">
          <div>
            <h3>${esc(e.child||'Fiesta')} · ${esc(e.date||'')}</h3>
            <small class="muted">${esc(e.client||'')} · ${esc(e.start||'')} a ${esc(e.end||'')} · ${esc(e.status||'')}</small>
          </div>
          <button class="secondary small" onclick="openEvent('${e.id}')">Abrir fiesta</button>
        </div>

        <div class="grid stats">
          <div class="card stat">
            <small>Valor de la fiesta</small>
            <strong>${money(f.base)}</strong>
          </div>

          <div class="card stat">
            <small>Adicionales</small>
            <strong>${money(f.extras)}</strong>
          </div>

          <div class="card stat">
            <small>Productos de stock</small>
            <strong>${money(f.stock)}</strong>
          </div>

          <div class="card stat">
            <small>Moza / personal adicional cobrado</small>
            <strong>${money(f.extraStaff)}</strong>
          </div>

          <div class="card stat">
            <small>Total contratado</small>
            <strong>${money(f.contracted)}</strong>
          </div>

          <div class="card stat">
            <small>Ingresado</small>
            <strong>${money(f.paid)}</strong>
            <em>Seña + cobros del cliente</em>
          </div>

          <div class="card stat">
            <small>Pendiente de cobrar</small>
            <strong>${money(f.pending)}</strong>
          </div>

          <div class="card stat">
            <small>Gasto de personal del salón</small>
            <strong>${money(f.staffExpense)}</strong>
            <em>No se cobra al cliente</em>
          </div>
        </div>
      </div>`;
    }).join('')}
  ` : `<div class="empty">No hay fiestas activas cargadas.</div>`;
};

// Contabilidad general separada.
// Acá sí se muestran todas las entradas y salidas.
window.renderAccountingV32=function(){
  const mov=MOV32().slice().sort((a,b)=>{
    const da=String(a.createdAt||a.movementDate||'');
    const db=String(b.createdAt||b.movementDate||'');
    return db.localeCompare(da);
  });

  const ingresos=mov.filter(m=>m.type==='Ingreso'||m.type==='Cobro')
    .reduce((s,m)=>s+n32(m.amount),0);

  const egresos=mov.filter(m=>m.type==='Gasto')
    .reduce((s,m)=>s+n32(m.amount),0);

  const cargos=mov.filter(m=>m.type==='Cargo')
    .reduce((s,m)=>s+n32(m.amount),0);

  setTitle('Contabilidad','Entradas, salidas y pagos del salón');

  $('#content').innerHTML=`
    <div class="grid stats">
      <div class="card stat"><small>Ingresos cobrados</small><strong>${money(ingresos)}</strong></div>
      <div class="card stat"><small>Egresos pagados</small><strong>${money(egresos)}</strong></div>
      <div class="card stat"><small>Cargos / conceptos</small><strong>${money(cargos)}</strong></div>
      <div class="card stat"><small>Resultado de caja</small><strong>${money(ingresos-egresos)}</strong></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">
        <div>
          <h3>Movimientos contables</h3>
          <small class="muted">Entradas, salidas, señas, cobros, personal, proveedores y stock.</small>
        </div>
      </div>

      ${mov.length ? `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Concepto</th>
              <th>Fiesta</th>
              <th>Importe</th>
              <th>Medio</th>
            </tr>
          </thead>
          <tbody>
            ${mov.map(m=>{
              const e=(data.events||[]).find(x=>x.id===m.eventId);
              return `
              <tr>
                <td>${esc(m.movementDate || String(m.createdAt||'').slice(0,10))}</td>
                <td>${esc(m.type||'')}</td>
                <td>${esc(m.category||'')}</td>
                <td>${esc(m.concept||'')}</td>
                <td>${e ? `${esc(e.child||e.client||'Fiesta')} · ${esc(e.date||'')}` : '-'}</td>
                <td><b>${money(m.amount||0)}</b></td>
                <td>${esc(m.method||'')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : `<div class="empty">No hay movimientos contables registrados.</div>`}
    </div>
  `;
};

// Renombra visualmente Finanzas a Contabilidad cuando existe el item.
function renameFinanceNav32(){
  try{
    document.querySelectorAll('button, a').forEach(el=>{
      const t=(el.textContent||'').trim();
      if(t==='Finanzas'){
        el.textContent='Contabilidad';
      }
    });
  }catch(_){}
}

const prevView32=renderSalonView;
renderSalonView=function(){
  if(view==='dashboard')return renderDashboardV32();
  if(view==='finance')return renderAccountingV32();
  return prevView32();
};

const prevShell32=renderSalonShell;
renderSalonShell=function(){
  const r=prevShell32();
  setTimeout(renameFinanceNav32,0);
  setTimeout(renameFinanceNav32,100);
  return r;
};

const obs32=new MutationObserver(()=>renameFinanceNav32());
obs32.observe(document.documentElement,{childList:true,subtree:true});

})();


// ============================================================
// V33 - INICIO SIMPLE + DETALLE POR FIESTA + FINANZAS TOTALES
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.assignments=data.assignments||[];

const SID33=()=>session?.salonId;
const EV33=()=> (data.events||[]).filter(e=>e.salonId===SID33() && e.status!=='Cancelada');
const MOV33=()=> (data.movements||[]).filter(m=>m.salonId===SID33());
const ASS33=eid=> (data.assignments||[]).filter(a=>a.eventId===eid);

function n33(v){ return Number(v||0); }

function figures33(e){
  const base=n33(e.basePrice ?? e.baseTotal ?? 0);
  const extras=n33(e.extrasTotal);
  const stock=n33(e.stockItemsTotal);
  const extraStaff=n33(e.staffClientChargeTotal);

  // Regla: moza/personal normal NO suma al cliente.
  // Solo personal adicional cobrado suma al total.
  const total=base+extras+stock+extraStaff;

  const paid=n33(e.paid ?? e.deposit ?? 0);
  const deposit=n33(e.deposit||0);
  const balance=Math.max(0,total-paid);

  const staffExpense=n33(
    e.staffExpenseTotal ??
    ASS33(e.id).reduce((s,a)=>s+n33(a.amount),0)
  );

  return {base,extras,stock,extraStaff,total,paid,deposit,balance,staffExpense};
}

// INICIO: SOLO LISTA DE FIESTAS
window.renderDashboardV33=function(){
  const events=EV33().slice().sort((a,b)=>{
    const da=String(a.date||'')+String(a.start||'');
    const db=String(b.date||'')+String(b.start||'');
    return da.localeCompare(db);
  });

  setTitle('Inicio','Fiestas creadas');

  $('#content').innerHTML=events.length ? `
    <div class="card">
      <div class="section-title">
        <div>
          <h3>Fiestas</h3>
          <small class="muted">Seleccioná una fiesta para ver pagos, movimientos y todo su detalle.</small>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Cumpleañero/a</th>
              <th>Responsable</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${events.map(e=>`
              <tr>
                <td>${esc(e.date||'')}</td>
                <td>${esc(e.start||'')} - ${esc(e.end||'')}</td>
                <td><b>${esc(e.child||'')}</b></td>
                <td>${esc(e.client||'')}</td>
                <td><span class="pill">${esc(e.status||'')}</span></td>
                <td><button class="primary small" onclick="openEventV33('${e.id}')">Ver fiesta</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : `<div class="empty">No hay fiestas creadas.</div>`;
};

// DETALLE DE UNA FIESTA
window.openEventV33=function(eid){
  const e=(data.events||[]).find(x=>x.id===eid&&x.salonId===SID33());
  if(!e)return;

  const f=figures33(e);
  const ass=ASS33(eid);
  const extras=Array.isArray(e.extras)?e.extras:[];
  const stock=Array.isArray(e.stockItems)?e.stockItems:[];
  const mov=MOV33().filter(m=>m.eventId===eid);

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${esc(e.child||'Fiesta')} · ${esc(e.date||'')}</h2>
        <p>${esc(e.client||'')} · ${esc(e.start||'')} a ${esc(e.end||'')}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕ Cerrar</button>
    </div>

    <div class="grid stats">
      <div class="card stat">
        <small>Total de la fiesta</small>
        <strong>${money(f.total)}</strong>
      </div>

      <div class="card stat">
        <small>Seña</small>
        <strong>${money(f.deposit)}</strong>
      </div>

      <div class="card stat">
        <small>Total pagado</small>
        <strong>${money(f.paid)}</strong>
      </div>

      <div class="card stat">
        <small>Saldo pendiente</small>
        <strong>${money(f.balance)}</strong>
      </div>
    </div>

    <div class="toolbar" style="margin-top:12px">
      ${f.balance>0?`<button class="primary" onclick="openPaymentV30('${e.id}')">+ Registrar pago</button>`:''}
      <button class="secondary" onclick="openEventFormV30('${e.id}')">Editar reserva</button>
      <button class="danger" onclick="confirmDeleteEvent('${e.id}')">🗑 Borrar fiesta</button>
    </div>

    <div class="grid two" style="margin-top:14px">
      <div class="card">
        <h3>Composición del total</h3>
        <div>Valor base de la fiesta <b>${money(f.base)}</b></div>
        <div>Adicionales <b>${money(f.extras)}</b></div>
        <div>Productos de stock <b>${money(f.stock)}</b></div>
        <div>Moza/personal adicional cobrado <b>${money(f.extraStaff)}</b></div>
        <hr>
        <div>Total fiesta <b>${money(f.total)}</b></div>
        <div>Seña <b>${money(f.deposit)}</b></div>
        <div>Total pagado <b>${money(f.paid)}</b></div>
        <div>Saldo restante <b>${money(f.balance)}</b></div>
      </div>

      <div class="card">
        <h3>Personal asignado</h3>
        <small class="muted">El personal normal no suma al total del cliente. Es gasto del salón.</small>
        ${ass.length?ass.map(a=>`
          <div style="margin-top:8px">
            👤 ${esc(a.staffName||'Personal')}
            · costo salón <b>${money(a.amount||0)}</b>
            ${a.chargeToClient?` · adicional cobrado al cliente <b>${money(a.clientCharge||0)}</b>`:''}
          </div>
        `).join(''):'<div class="empty">Sin personal asignado.</div>'}
      </div>

      <div class="card">
        <h3>Adicionales</h3>
        ${extras.length?extras.map(x=>`
          <div>${esc(x.name||'Adicional')} <b>${money(x.price||0)}</b></div>
        `).join(''):'<div class="empty">Sin adicionales.</div>'}
      </div>

      <div class="card">
        <h3>Productos de stock</h3>
        ${stock.length?stock.map(x=>`
          <div>${esc(x.name||'Producto')} · ${n33(x.qty)} × ${money(x.unitPrice||0)}
          = <b>${money(n33(x.qty)*n33(x.unitPrice))}</b></div>
        `).join(''):'<div class="empty">Sin productos.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Movimientos de esta fiesta</h3>
      ${mov.length?`
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr></thead>
          <tbody>
            ${mov.slice().reverse().map(m=>`
              <tr>
                <td>${esc(m.movementDate||String(m.createdAt||'').slice(0,10))}</td>
                <td>${esc(m.type||'')}</td>
                <td>${esc(m.concept||'')}</td>
                <td>${money(m.amount||0)}</td>
                <td>${esc(m.method||'')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`:'<div class="empty">Sin movimientos.</div>'}
    </div>
  `);
};

// FINANZAS: TOTALES DE TODAS LAS FIESTAS
window.renderFinanceV33=function(){
  const events=EV33();
  const figures=events.map(e=>({e,f:figures33(e)}));

  const totalBase=figures.reduce((s,x)=>s+x.f.base,0);
  const totalExtras=figures.reduce((s,x)=>s+x.f.extras,0);
  const totalStock=figures.reduce((s,x)=>s+x.f.stock,0);
  const totalExtraStaff=figures.reduce((s,x)=>s+x.f.extraStaff,0);
  const totalContracted=figures.reduce((s,x)=>s+x.f.total,0);
  const totalPaid=figures.reduce((s,x)=>s+x.f.paid,0);
  const totalPending=figures.reduce((s,x)=>s+x.f.balance,0);

  const mov=MOV33();
  const totalExpenses=mov
    .filter(m=>m.type==='Gasto')
    .reduce((s,m)=>s+n33(m.amount),0);

  const totalIncome=mov
    .filter(m=>m.type==='Ingreso'||m.type==='Cobro')
    .reduce((s,m)=>s+n33(m.amount),0);

  setTitle('Finanzas','Totales de todas las fiestas');

  $('#content').innerHTML=`
    <div class="grid stats">
      <div class="card stat"><small>Valor base de fiestas</small><strong>${money(totalBase)}</strong></div>
      <div class="card stat"><small>Adicionales</small><strong>${money(totalExtras)}</strong></div>
      <div class="card stat"><small>Productos de stock</small><strong>${money(totalStock)}</strong></div>
      <div class="card stat"><small>Moza/personal adicional cobrado</small><strong>${money(totalExtraStaff)}</strong></div>
      <div class="card stat"><small>Total contratado</small><strong>${money(totalContracted)}</strong></div>
      <div class="card stat"><small>Total ingresado</small><strong>${money(totalPaid)}</strong></div>
      <div class="card stat"><small>Total pendiente de cobrar</small><strong>${money(totalPending)}</strong></div>
      <div class="card stat"><small>Total egresos</small><strong>${money(totalExpenses)}</strong></div>
      <div class="card stat"><small>Resultado de caja</small><strong>${money(totalIncome-totalExpenses)}</strong></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">
        <div>
          <h3>Resumen por fiesta</h3>
          <small class="muted">Totales de todas las reservas.</small>
        </div>
      </div>

      ${figures.length?`
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Fiesta</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Pagado</th>
              <th>Pendiente</th>
              <th>Gasto personal</th>
            </tr>
          </thead>
          <tbody>
            ${figures.map(x=>`
              <tr>
                <td><b>${esc(x.e.child||x.e.client||'Fiesta')}</b></td>
                <td>${esc(x.e.date||'')}</td>
                <td>${money(x.f.total)}</td>
                <td>${money(x.f.paid)}</td>
                <td>${money(x.f.balance)}</td>
                <td>${money(x.f.staffExpense)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`:'<div class="empty">No hay fiestas.</div>'}
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Movimientos generales</h3>
      ${mov.length?`
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr></thead>
          <tbody>
            ${mov.slice().reverse().map(m=>`
              <tr>
                <td>${esc(m.movementDate||String(m.createdAt||'').slice(0,10))}</td>
                <td>${esc(m.type||'')}</td>
                <td>${esc(m.concept||'')}</td>
                <td>${money(m.amount||0)}</td>
                <td>${esc(m.method||'')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`:'<div class="empty">Sin movimientos contables.</div>'}
    </div>
  `;
};

// Rutas finales
window.openEvent=window.openEventV33;

const route33=renderSalonView;
renderSalonView=function(){
  if(view==='dashboard')return renderDashboardV33();
  if(view==='finance')return renderFinanceV33();
  return route33();
};

})();


// ============================================================
// V34 - INICIO SOLO FIESTAS + BOTÓN MOVIMIENTOS POR FIESTA
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.assignments=data.assignments||[];

const SID34=()=>session?.salonId;
const EV34=()=> (data.events||[]).filter(e=>e.salonId===SID34() && e.status!=='Cancelada');
const MOV34=eid=> (data.movements||[]).filter(m=>m.salonId===SID34() && m.eventId===eid);
const ASS34=eid=> (data.assignments||[]).filter(a=>a.eventId===eid);

function n34(v){ return Number(v||0); }

function figures34(e){
  const base=n34(e.basePrice ?? e.baseTotal ?? 0);
  const extras=n34(e.extrasTotal);
  const stock=n34(e.stockItemsTotal);
  const staffClient=n34(e.staffClientChargeTotal);
  const total=base+extras+stock+staffClient;
  const paid=n34(e.paid ?? e.deposit ?? 0);
  const deposit=n34(e.deposit||0);
  const balance=Math.max(0,total-paid);
  const staffExpense=n34(
    e.staffExpenseTotal ??
    ASS34(e.id).reduce((s,a)=>s+n34(a.amount),0)
  );
  return {base,extras,stock,staffClient,total,paid,deposit,balance,staffExpense};
}

// INICIO: SOLO FIESTAS. SIN IMPORTES.
window.renderDashboardV34=function(){
  const events=EV34().slice().sort((a,b)=>{
    const da=String(a.date||'')+String(a.start||'');
    const db=String(b.date||'')+String(b.start||'');
    return da.localeCompare(db);
  });

  setTitle('Inicio','Fiestas creadas');

  $('#content').innerHTML=events.length ? `
    <div class="card">
      <div class="section-title">
        <div>
          <h3>Fiestas</h3>
          <small class="muted">Desde acá accedés a todos los movimientos de cada fiesta.</small>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Cumpleañero/a</th>
              <th>Responsable</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${events.map(e=>`
              <tr>
                <td>${esc(e.date||'')}</td>
                <td>${esc(e.start||'')} - ${esc(e.end||'')}</td>
                <td><b>${esc(e.child||'')}</b></td>
                <td>${esc(e.client||'')}</td>
                <td><span class="pill">${esc(e.status||'')}</span></td>
                <td>
                  <button class="primary small" onclick="openMovementsV34('${e.id}')">💰 Movimientos</button>
                  <button class="secondary small" onclick="openEventFormV30('${e.id}')">Editar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : `<div class="empty">No hay fiestas creadas.</div>`;
};

window.openMovementsV34=function(eid){
  const e=(data.events||[]).find(x=>x.id===eid&&x.salonId===SID34());
  if(!e)return;

  const f=figures34(e);
  const ass=ASS34(eid);
  const extras=Array.isArray(e.extras)?e.extras:[];
  const stock=Array.isArray(e.stockItems)?e.stockItems:[];
  const mov=MOV34(eid);

  const ingresos=mov.filter(m=>m.type==='Ingreso'||m.type==='Cobro').reduce((s,m)=>s+n34(m.amount),0);
  const egresos=mov.filter(m=>m.type==='Gasto').reduce((s,m)=>s+n34(m.amount),0);

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Movimientos · ${esc(e.child||'Fiesta')}</h2>
        <p>${esc(e.date||'')} · ${esc(e.start||'')} a ${esc(e.end||'')} · ${esc(e.client||'')}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕ Cerrar</button>
    </div>

    <div class="grid stats">
      <div class="card stat"><small>Total de la fiesta</small><strong>${money(f.total)}</strong></div>
      <div class="card stat"><small>Total pagado</small><strong>${money(f.paid)}</strong></div>
      <div class="card stat"><small>Saldo pendiente</small><strong>${money(f.balance)}</strong></div>
      <div class="card stat"><small>Gastos del salón</small><strong>${money(egresos)}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:12px">
      ${f.balance>0?`<button class="primary" onclick="openPaymentV30('${e.id}')">+ Registrar pago</button>`:''}
      <button class="secondary" onclick="openEventFormV30('${e.id}')">Editar reserva</button>
    </div>

    <div class="grid two" style="margin-top:14px">
      <div class="card">
        <h3>Cuenta de la fiesta</h3>
        <div>Valor base <b>${money(f.base)}</b></div>
        <div>Adicionales <b>${money(f.extras)}</b></div>
        <div>Productos de stock <b>${money(f.stock)}</b></div>
        <div>Moza/personal adicional cobrado <b>${money(f.staffClient)}</b></div>
        <hr>
        <div>Total fiesta <b>${money(f.total)}</b></div>
        <div>Seña <b>${money(f.deposit)}</b></div>
        <div>Total pagado <b>${money(f.paid)}</b></div>
        <div>Saldo restante <b>${money(f.balance)}</b></div>
      </div>

      <div class="card">
        <h3>Gastos de personal del salón</h3>
        ${ass.length?ass.map(a=>`
          <div>
            👤 ${esc(a.staffName||'Personal')}
            · costo salón <b>${money(a.amount||0)}</b>
            ${a.chargeToClient?` · adicional cobrado <b>${money(a.clientCharge||0)}</b>`:''}
          </div>
        `).join(''):'<div class="empty">Sin personal asignado.</div>'}
      </div>

      <div class="card">
        <h3>Adicionales</h3>
        ${extras.length?extras.map(x=>`
          <div>${esc(x.name||'Adicional')} <b>${money(x.price||0)}</b></div>
        `).join(''):'<div class="empty">Sin adicionales.</div>'}
      </div>

      <div class="card">
        <h3>Productos de stock</h3>
        ${stock.length?stock.map(x=>`
          <div>${esc(x.name||'Producto')} · ${n34(x.qty)} × ${money(x.unitPrice||0)}
          = <b>${money(n34(x.qty)*n34(x.unitPrice))}</b></div>
        `).join(''):'<div class="empty">Sin productos.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-title">
        <div>
          <h3>Pagos, ingresos y gastos de esta fiesta</h3>
          <small class="muted">Solo movimientos asociados a esta reserva.</small>
        </div>
      </div>

      ${mov.length?`
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Concepto</th>
              <th>Importe</th>
              <th>Medio</th>
            </tr>
          </thead>
          <tbody>
            ${mov.slice().reverse().map(m=>`
              <tr>
                <td>${esc(m.movementDate||String(m.createdAt||'').slice(0,10))}</td>
                <td>${esc(m.type||'')}</td>
                <td>${esc(m.category||'')}</td>
                <td>${esc(m.concept||'')}</td>
                <td><b>${money(m.amount||0)}</b></td>
                <td>${esc(m.method||'')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`:'<div class="empty">Todavía no hay movimientos de esta fiesta.</div>'}
    </div>

    <div class="grid stats" style="margin-top:14px">
      <div class="card stat"><small>Ingresos de esta fiesta</small><strong>${money(ingresos)}</strong></div>
      <div class="card stat"><small>Egresos de esta fiesta</small><strong>${money(egresos)}</strong></div>
      <div class="card stat"><small>Resultado de caja de esta fiesta</small><strong>${money(ingresos-egresos)}</strong></div>
    </div>
  `);
};

// RUTA FINAL
const route34=renderSalonView;
renderSalonView=function(){
  if(view==='dashboard')return renderDashboardV34();
  return route34();
};

})();


// ============================================================
// V35 - FINANZAS: INGRESO MANUAL / MONTO INICIAL / OTROS INGRESOS
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];

const SID35=()=>session?.salonId;
const MOV35=()=> (data.movements||[]).filter(m=>m.salonId===SID35());

window.openManualIncomeV35=function(){
  showModal(`
    <div class="modal-title">
      <div>
        <h2>Ingresar dinero</h2>
        <p>Registrar monto inicial u otro ingreso del salón.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="manual-income35">
      <div class="form-grid">
        <div class="field">
          <label>Motivo</label>
          <select name="reasonType" id="reasonType35">
            <option value="Monto inicial">Monto inicial</option>
            <option value="Aporte del salón">Aporte del salón</option>
            <option value="Otro ingreso">Otro ingreso</option>
          </select>
        </div>

        <div class="field">
          <label>Importe</label>
          <input name="amount" type="number" min="1" required>
        </div>

        <div class="field">
          <label>Medio</label>
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

        <div class="field span2">
          <label>Detalle / observación</label>
          <input name="detail" placeholder="Ej: caja inicial del mes, aporte del dueño, devolución, etc.">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Registrar ingreso</button>
      </div>
    </form>
  `);

  $('#manual-income35').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const amount=Number(f.amount||0);
    if(amount<=0)return toast('Ingresá un importe válido');

    data.movements.push({
      id:id(),
      salonId:SID35(),
      type:'Ingreso',
      category:f.reasonType||'Otro ingreso',
      concept:f.detail
        ? `${f.reasonType} · ${f.detail}`
        : (f.reasonType||'Otro ingreso'),
      amount,
      method:f.method||'',
      movementDate:f.date,
      manualIncome:true,
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Ingreso registrado');
    renderFinanceV35();
  };
};

// Reusa el render financiero V33/V34 y agrega el botón sin cambiar el resto.
window.renderFinanceV35=function(){
  if(typeof renderFinanceV33==='function'){
    renderFinanceV33();
  }else if(typeof renderAccountingV32==='function'){
    renderAccountingV32();
  }else{
    renderFinance();
  }

  const content=$('#content');
  if(!content)return;

  let toolbar=content.querySelector('.toolbar');
  if(!toolbar){
    toolbar=document.createElement('div');
    toolbar.className='toolbar';
    toolbar.style.marginBottom='16px';
    content.prepend(toolbar);
  }

  if(!toolbar.querySelector('#manual-income-btn35')){
    const b=document.createElement('button');
    b.id='manual-income-btn35';
    b.className='primary';
    b.textContent='+ Ingresar dinero';
    b.onclick=openManualIncomeV35;
    toolbar.prepend(b);
  }
};

const route35=renderSalonView;
renderSalonView=function(){
  if(view==='finance')return renderFinanceV35();
  return route35();
};

})();


// ============================================================
// V36 - BORRAR FIESTA EN CASCADA + INGRESO/EGRESO MANUAL
//       + NO DUPLICAR MOZA/ADICIONAL EN RESERVAS
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.assignments=data.assignments||[];
data.orders=data.orders||[];
data.cards=data.cards||[];
data.auditLog=data.auditLog||[];

const SID36=()=>session?.salonId;

function event36(eid){
  return (data.events||[]).find(e=>e.id===eid && e.salonId===SID36());
}

function restoreEventStock36(e){
  (e?.stockItems||[]).forEach(i=>{
    const p=(data.stockProducts||[]).find(x=>x.id===i.productId && x.salonId===SID36());
    if(p)p.stock=Number(p.stock||0)+Number(i.qty||0);
  });
}

// ----------------------------------------------------------
// BORRAR FIESTA: borra TODOS los movimientos asociados
// ----------------------------------------------------------
window.confirmDeleteEvent=function(eid){
  const e=event36(eid);
  if(!e)return toast('Fiesta no encontrada');

  showModal(`
    <div class="modal-title">
      <div>
        <h2>🗑 Borrar fiesta</h2>
        <p>${esc(e.child||e.client||'Fiesta')} · ${esc(e.date||'')}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="delete-event36">
      <div class="field">
        <label>Contraseña administrativa</label>
        <input name="password" type="password" required>
      </div>

      <div class="field">
        <label>Motivo</label>
        <textarea name="reason" required placeholder="Ej: reserva cancelada / carga de prueba"></textarea>
      </div>

      <div class="admin-notice attention">
        <span>⚠️</span>
        <div>
          <b>Se eliminará toda la información contable de esta fiesta.</b>
          <small>Se borran pagos, señas, ingresos, gastos, personal asignado y movimientos vinculados.</small>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="danger">Borrar fiesta y movimientos</button>
      </div>
    </form>
  `);

  $('#delete-event36').onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(ev.target));
    const s=salon();

    if(String(f.password||'')!==String(s?.password||'')){
      return toast('Contraseña incorrecta');
    }

    const sid=SID36();

    // Restaura stock usado por la fiesta.
    restoreEventStock36(e);

    // Borra TODO movimiento contable ligado al evento.
    data.movements=(data.movements||[]).filter(m=>m.eventId!==eid);

    // Borra personal asignado a la fiesta.
    data.assignments=(data.assignments||[]).filter(a=>a.eventId!==eid);

    // Borra pedidos vinculados específicamente a esa fiesta.
    const orderIds=(data.orders||[])
      .filter(o=>o.eventId===eid)
      .map(o=>o.id);

    data.orders=(data.orders||[]).filter(o=>o.eventId!==eid);

    // Borra pagos de proveedor relacionados a pedidos de esa fiesta.
    if(Array.isArray(data.providerPayments)){
      data.providerPayments=data.providerPayments.filter(p=>!orderIds.includes(p.orderId));
    }

    // Borra tarjetas que dependan de esa fiesta.
    data.cards=(data.cards||[]).filter(c=>c.eventId!==eid);

    // Finalmente borra la fiesta.
    data.events=(data.events||[]).filter(x=>x.id!==eid);

    data.auditLog.push({
      id:id(),
      salonId:sid,
      action:'BORRAR FIESTA EN CASCADA',
      eventId:eid,
      eventName:e.child||e.client||'',
      reason:String(f.reason||'').trim(),
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Fiesta y todos sus movimientos fueron eliminados');

    view='dashboard';
    renderSalonShell();
  };
};

// ----------------------------------------------------------
// FINANZAS: INGRESO O EGRESO MANUAL
// ----------------------------------------------------------
window.openManualMoneyV36=function(type='Ingreso'){
  const isExpense=type==='Gasto';

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${isExpense?'Registrar egreso':'Ingresar dinero'}</h2>
        <p>${isExpense?'Salida manual de dinero del salón':'Entrada manual de dinero al salón'}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="money36">
      <div class="form-grid">
        <div class="field">
          <label>Tipo</label>
          <select name="type">
            <option value="Ingreso" ${!isExpense?'selected':''}>Ingreso</option>
            <option value="Gasto" ${isExpense?'selected':''}>Egreso</option>
          </select>
        </div>

        <div class="field">
          <label>Motivo</label>
          <select name="category">
            <option>Monto inicial</option>
            <option>Aporte del salón</option>
            <option>Compra general</option>
            <option>Servicio</option>
            <option>Otro ingreso</option>
            <option>Otro egreso</option>
          </select>
        </div>

        <div class="field">
          <label>Importe</label>
          <input name="amount" type="number" min="1" required>
        </div>

        <div class="field">
          <label>Medio</label>
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

        <div class="field span2">
          <label>Detalle / observación</label>
          <input name="detail" placeholder="Detalle del movimiento">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="${isExpense?'danger':'primary'}">Registrar movimiento</button>
      </div>
    </form>
  `);

  $('#money36').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const amount=Number(f.amount||0);
    if(amount<=0)return toast('Ingresá un importe válido');

    data.movements.push({
      id:id(),
      salonId:SID36(),
      type:f.type,
      category:f.category||'Movimiento manual',
      concept:f.detail ? `${f.category} · ${f.detail}` : f.category,
      amount,
      method:f.method||'',
      movementDate:f.date,
      manualMovement:true,
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast(f.type==='Gasto'?'Egreso registrado':'Ingreso registrado');
    renderFinanceV36();
  };
};

window.renderFinanceV36=function(){
  // Usa el render de finanzas de V33 si existe.
  if(typeof renderFinanceV33==='function'){
    renderFinanceV33();
  }else if(typeof renderFinanceV35==='function'){
    renderFinanceV35();
  }else{
    renderFinance();
  }

  const content=$('#content');
  if(!content)return;

  let toolbar=content.querySelector('.toolbar');
  if(!toolbar){
    toolbar=document.createElement('div');
    toolbar.className='toolbar';
    toolbar.style.marginBottom='16px';
    content.prepend(toolbar);
  }

  // Elimina botón viejo de ingreso manual para no duplicar.
  const old=toolbar.querySelector('#manual-income-btn35');
  if(old)old.remove();

  if(!toolbar.querySelector('#income36')){
    const income=document.createElement('button');
    income.id='income36';
    income.className='primary';
    income.textContent='+ Ingresar dinero';
    income.onclick=()=>openManualMoneyV36('Ingreso');
    toolbar.prepend(income);
  }

  if(!toolbar.querySelector('#expense36')){
    const expense=document.createElement('button');
    expense.id='expense36';
    expense.className='danger';
    expense.textContent='- Registrar egreso';
    expense.onclick=()=>openManualMoneyV36('Gasto');
    toolbar.appendChild(expense);
  }
};

// ----------------------------------------------------------
// RESERVAS: EVITA DUPLICAR MOZA COMO EXTRA + PERSONAL ADICIONAL
// ----------------------------------------------------------
function normalizeExtraName36(v){
  return String(v||'')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// Toma V30 como base y, al guardar, elimina duplicados de "moza"
// cuando ya fue cargada como personal adicional cobrado.
const previousEventForm36=window.openEventFormV30 || window.openEventForm;

window.openEventFormV36=function(eid=''){
  previousEventForm36(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const oldSubmit=form.onsubmit;

  form.onsubmit=function(ev){
    // Antes del guardado, si existe una moza marcada como personal adicional,
    // desmarca extras cuyo nombre sea "moza" o equivalente para no cobrar dos veces.
    const staffAdditional=[...document.querySelectorAll('.staffrow30')]
      .some(r=>{
        const selected=r.querySelector('.staffsel30')?.checked;
        const charged=r.querySelector('.staffcharge30')?.checked;
        const staffId=r.dataset.id;
        const s=(data.staff||[]).find(x=>x.id===staffId);
        return selected && charged && normalizeExtraName36(s?.role).includes('moza');
      });

    if(staffAdditional){
      document.querySelectorAll('.extra30').forEach(chk=>{
        const ex=(data.salonExtras||[]).find(x=>x.id===chk.value);
        const name=normalizeExtraName36(ex?.name||ex?.description);
        if(name.includes('moza')){
          chk.checked=false;
        }
      });
    }

    return oldSubmit ? oldSubmit.call(form,ev) : undefined;
  };
};

// aliases finales
window.openEventForm=window.openEventFormV36;
window.openEventFormV30=window.openEventFormV36;

const route36=renderSalonView;
renderSalonView=function(){
  if(view==='finance')return renderFinanceV36();
  return route36();
};

})();


// ============================================================
// V37 - REINICIO GENERAL SELECTIVO DEL SISTEMA
// Opciones: dinero / reservas / pedidos / personal
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.providerPayments=data.providerPayments||[];
data.orders=data.orders||[];
data.assignments=data.assignments||[];
data.staff=data.staff||[];
data.cards=data.cards||[];
data.stockPurchases=data.stockPurchases||[];
data.auditLog=data.auditLog||[];

const SID37=()=>session?.salonId;

function restoreEventStock37(e){
  (e?.stockItems||[]).forEach(i=>{
    const p=(data.stockProducts||[]).find(x=>x.id===i.productId && x.salonId===SID37());
    if(p)p.stock=Number(p.stock||0)+Number(i.qty||0);
  });
}

function resetMoney37(){
  const sid=SID37();

  // Elimina todos los movimientos monetarios del salón.
  data.movements=(data.movements||[]).filter(m=>m.salonId!==sid);

  // Pagos a proveedores.
  data.providerPayments=(data.providerPayments||[]).filter(p=>p.salonId!==sid);

  // Reservas conservadas, pero sin señas/cobros previos.
  (data.events||[]).forEach(e=>{
    if(e.salonId!==sid)return;
    e.deposit=0;
    e.paid=0;
    e.depositMethod='';
    e.balance=Math.max(0,Number(e.total||0));
  });

  // Compras de stock conservadas, pero vuelven a pendiente de pago.
  (data.stockPurchases||[]).forEach(c=>{
    if(c.salonId!==sid)return;
    c.paymentStatus='Pendiente';
    c.paymentMethod='';
    c.reference='';
    c.paidAt=null;
    if(!c.deliveryStatus)c.deliveryStatus='Pendiente de entrega';
  });

  // Pedidos de proveedores conservados, pero sin pago.
  (data.orders||[]).forEach(o=>{
    if(o.salonId!==sid)return;
    o.paymentId=null;
    o.paidAt=null;
    o.paymentMethod='';
    o.paymentReference='';
    o.paidAmount=0;
    if(o.status==='Pagado - pendiente de entrega' || o.status==='Entregado' || o.status==='Pagado'){
      o.status='Pendiente';
    }
  });

  // Saldos de proveedores a cero si existen.
  (data.suppliers||[]).forEach(p=>{
    if(p.salonId!==sid)return;
    p.balance=0;
    p.paid=0;
    p.totalPaid=0;
    p.totalPending=0;
  });

  // Cualquier pago de servicio asociado al salón queda fuera del movimiento general.
  if(Array.isArray(data.servicePayments)){
    data.servicePayments=data.servicePayments.filter(p=>p.salonId!==sid);
  }
}

function resetReservations37(){
  const sid=SID37();
  const ids=(data.events||[]).filter(e=>e.salonId===sid).map(e=>e.id);
  const idSet=new Set(ids);

  // Restaura stock consumido por las reservas antes de borrarlas.
  (data.events||[]).filter(e=>e.salonId===sid).forEach(restoreEventStock37);

  // Borra movimientos contables ligados a esas reservas.
  data.movements=(data.movements||[]).filter(m=>!idSet.has(m.eventId));

  // Personal asignado.
  data.assignments=(data.assignments||[]).filter(a=>!idSet.has(a.eventId));

  // Pedidos ligados específicamente a reservas borradas.
  const orderIds=(data.orders||[]).filter(o=>idSet.has(o.eventId)).map(o=>o.id);
  data.orders=(data.orders||[]).filter(o=>!idSet.has(o.eventId));

  // Pagos de esos pedidos.
  data.providerPayments=(data.providerPayments||[]).filter(p=>!orderIds.includes(p.orderId));

  // Tarjetas ligadas a esas reservas.
  data.cards=(data.cards||[]).filter(c=>!idSet.has(c.eventId));

  // Finalmente reservas.
  data.events=(data.events||[]).filter(e=>e.salonId!==sid);
}

function resetOrders37(){
  const sid=SID37();
  const orderIds=(data.orders||[]).filter(o=>o.salonId===sid).map(o=>o.id);
  const orderSet=new Set(orderIds);

  // Borra movimientos de pedidos/proveedores.
  data.movements=(data.movements||[]).filter(m=>
    !(m.salonId===sid && (orderSet.has(m.orderId) || m.category==='Proveedor'))
  );

  data.providerPayments=(data.providerPayments||[]).filter(p=>!orderSet.has(p.orderId));
  data.orders=(data.orders||[]).filter(o=>o.salonId!==sid);
}

function resetStaff37(){
  const sid=SID37();
  const staffIds=(data.staff||[]).filter(s=>s.salonId===sid).map(s=>s.id);
  const staffSet=new Set(staffIds);

  // Borra gastos de personal de todas las fiestas.
  data.movements=(data.movements||[]).filter(m=>
    !(m.salonId===sid && (staffSet.has(m.staffId) || m.category==='Personal'))
  );

  data.assignments=(data.assignments||[]).filter(a=>!staffSet.has(a.staffId));

  // Limpia costo de personal guardado en reservas, sin borrar las reservas.
  (data.events||[]).forEach(e=>{
    if(e.salonId!==sid)return;
    e.staffExpenseTotal=0;
    e.staffClientChargeTotal=0;
  });

  data.staff=(data.staff||[]).filter(s=>s.salonId!==sid);
}

window.openGeneralResetV37=function(){
  showModal(`
    <div class="modal-title">
      <div>
        <h2>🔄 Reinicio general del sistema</h2>
        <p>Elegí exactamente qué información querés borrar.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="reset37">
      <div class="card">
        <label class="check-card">
          <input type="checkbox" name="money" value="1">
          <span>
            <b>💰 Movimientos de dinero</b>
            <small>Pone en cero ingresos, egresos, señas, cobros, pagos a proveedores y movimientos bancarios.</small>
          </span>
        </label>

        <label class="check-card" style="margin-top:8px">
          <input type="checkbox" name="reservations" value="1">
          <span>
            <b>🎉 Reservas</b>
            <small>Borra todas las fiestas y todo lo relacionado con ellas, incluidos sus movimientos.</small>
          </span>
        </label>

        <label class="check-card" style="margin-top:8px">
          <input type="checkbox" name="orders" value="1">
          <span>
            <b>🚚 Pedidos</b>
            <small>Borra pedidos a proveedores, pagos y movimientos asociados.</small>
          </span>
        </label>

        <label class="check-card" style="margin-top:8px">
          <input type="checkbox" name="staff" value="1">
          <span>
            <b>👤 Personal</b>
            <small>Borra empleados, asignaciones y gastos de personal.</small>
          </span>
        </label>
      </div>

      <div class="field" style="margin-top:14px">
        <label>Contraseña administrativa</label>
        <input name="password" type="password" required>
      </div>

      <div class="field">
        <label>Motivo del reinicio</label>
        <textarea name="reason" required placeholder="Ej: finalizar pruebas e iniciar operación real"></textarea>
      </div>

      <div class="admin-notice attention">
        <span>⚠️</span>
        <div>
          <b>Esta acción es irreversible.</b>
          <small>Solo se borrarán las opciones que marques.</small>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="danger">Ejecutar reinicio seleccionado</button>
      </div>
    </form>
  `);

  $('#reset37').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const s=salon();

    if(String(fd.get('password')||'')!==String(s?.password||'')){
      return toast('Contraseña incorrecta');
    }

    const money=fd.get('money')==='1';
    const reservations=fd.get('reservations')==='1';
    const orders=fd.get('orders')==='1';
    const staff=fd.get('staff')==='1';

    if(!money && !reservations && !orders && !staff){
      return toast('Seleccioná al menos una opción');
    }

    // Orden pensado para evitar datos huérfanos.
    if(reservations)resetReservations37();
    if(orders)resetOrders37();
    if(staff)resetStaff37();
    if(money)resetMoney37();

    data.auditLog.push({
      id:id(),
      salonId:SID37(),
      action:'REINICIO GENERAL SELECTIVO',
      options:{money,reservations,orders,staff},
      reason:String(fd.get('reason')||'').trim(),
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Reinicio realizado');

    view='dashboard';
    renderSalonShell();
  };
};

// ----------------------------------------------------------
// BOTÓN REINICIO GENERAL EN MI SALÓN
// ----------------------------------------------------------
const oldProfile37=window.renderProfileV24 || window.renderProfile;

window.renderProfileV37=function(){
  oldProfile37();

  const content=$('#content');
  if(!content || $('#general-reset37'))return;

  const card=document.createElement('div');
  card.id='general-reset37';
  card.className='card';
  card.style.marginTop='16px';
  card.innerHTML=`
    <div class="section-title">
      <div>
        <h3>⚙️ Reinicio general</h3>
        <small class="muted">Permite limpiar partes específicas del sistema sin borrar el salón.</small>
      </div>
    </div>
    <button class="danger" onclick="openGeneralResetV37()">🔄 Reinicio general del sistema</button>
  `;
  content.appendChild(card);
};

// Alias de borrado individual de reserva: conserva la lógica de V36,
// que elimina TODOS los movimientos contables asociados a esa fiesta.
window.confirmDeleteEvent=window.confirmDeleteEvent;

// Router final
const route37=renderSalonView;
renderSalonView=function(){
  if(view==='profile')return renderProfileV37();
  return route37();
};

})();


// ============================================================
// V38 - REINICIO VISIBLE EN FINANZAS + LIMPIEZA REAL A CERO
// ============================================================
(function(){
'use strict';

data.movements=data.movements||[];
data.providerPayments=data.providerPayments||[];
data.stockPurchases=data.stockPurchases||[];
data.orders=data.orders||[];
data.assignments=data.assignments||[];
data.auditLog=data.auditLog||[];

const SID38=()=>session?.salonId;

function zeroMoney38(){
  const sid=SID38();

  // Elimina ABSOLUTAMENTE todos los movimientos contables del salón.
  data.movements=(data.movements||[]).filter(m=>m.salonId!==sid);

  // Elimina pagos a proveedores del salón.
  data.providerPayments=(data.providerPayments||[]).filter(p=>p.salonId!==sid);

  // Reservas existentes, si hubiera: sin seña ni cobros.
  (data.events||[]).forEach(e=>{
    if(e.salonId!==sid)return;
    e.deposit=0;
    e.paid=0;
    e.depositMethod='';
    e.balance=Math.max(0,Number(e.total||0));
  });

  // Compras quedan sin pago.
  (data.stockPurchases||[]).forEach(c=>{
    if(c.salonId!==sid)return;
    c.paymentStatus='Pendiente';
    c.paymentMethod='';
    c.reference='';
    c.paidAt=null;
  });

  // Pedidos quedan sin pago.
  (data.orders||[]).forEach(o=>{
    if(o.salonId!==sid)return;
    o.paymentId=null;
    o.paidAt=null;
    o.paymentMethod='';
    o.paymentReference='';
    o.paidAmount=0;
    if(['Pagado','Pagado - pendiente de entrega','Entregado'].includes(o.status)){
      o.status='Pendiente';
    }
  });

  // Proveedores sin saldos.
  (data.suppliers||[]).forEach(p=>{
    if(p.salonId!==sid)return;
    p.balance=0;
    p.paid=0;
    p.totalPaid=0;
    p.totalPending=0;
  });

  // Pagos del servicio fuera del movimiento general.
  if(Array.isArray(data.servicePayments)){
    data.servicePayments=data.servicePayments.filter(p=>p.salonId!==sid);
  }

  // Desactiva resets/baselines viejos para que no reconstruyan montos.
  if(Array.isArray(data.financeResets)){
    data.financeResets=data.financeResets.filter(r=>r.salonId!==sid);
  }
  if(Array.isArray(data.accountingEpochs)){
    data.accountingEpochs=data.accountingEpochs.filter(r=>r.salonId!==sid);
  }
}

function deleteReservations38(){
  const sid=SID38();
  const events=(data.events||[]).filter(e=>e.salonId===sid);
  const ids=new Set(events.map(e=>e.id));

  // Restaura stock usado por reservas.
  events.forEach(e=>{
    (e.stockItems||[]).forEach(i=>{
      const p=(data.stockProducts||[]).find(x=>x.id===i.productId&&x.salonId===sid);
      if(p)p.stock=Number(p.stock||0)+Number(i.qty||0);
    });
  });

  // Todo lo asociado desaparece.
  data.movements=(data.movements||[]).filter(m=>!ids.has(m.eventId));
  data.assignments=(data.assignments||[]).filter(a=>!ids.has(a.eventId));

  const orderIds=(data.orders||[]).filter(o=>ids.has(o.eventId)).map(o=>o.id);
  data.orders=(data.orders||[]).filter(o=>!ids.has(o.eventId));
  data.providerPayments=(data.providerPayments||[]).filter(p=>!orderIds.includes(p.orderId));
  data.cards=(data.cards||[]).filter(c=>!ids.has(c.eventId));
  data.events=(data.events||[]).filter(e=>e.salonId!==sid);
}

function deleteOrders38(){
  const sid=SID38();
  const ids=new Set((data.orders||[]).filter(o=>o.salonId===sid).map(o=>o.id));
  data.movements=(data.movements||[]).filter(m=>
    !(m.salonId===sid && (ids.has(m.orderId) || m.category==='Proveedor'))
  );
  data.providerPayments=(data.providerPayments||[]).filter(p=>!ids.has(p.orderId));
  data.orders=(data.orders||[]).filter(o=>o.salonId!==sid);
}

function deleteStaff38(){
  const sid=SID38();
  const ids=new Set((data.staff||[]).filter(s=>s.salonId===sid).map(s=>s.id));

  data.movements=(data.movements||[]).filter(m=>
    !(m.salonId===sid && (ids.has(m.staffId) || m.category==='Personal'))
  );
  data.assignments=(data.assignments||[]).filter(a=>!ids.has(a.staffId));
  (data.events||[]).forEach(e=>{
    if(e.salonId===sid){
      e.staffExpenseTotal=0;
      e.staffClientChargeTotal=0;
    }
  });
  data.staff=(data.staff||[]).filter(s=>s.salonId!==sid);
}

window.openResetSectionsV38=function(){
  showModal(`
    <div class="modal-title">
      <div>
        <h2>🔄 Reinicio por secciones</h2>
        <p>Marcá solamente lo que querés borrar.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="reset38">
      <div class="card">
        <label class="check-card">
          <input type="checkbox" name="money" value="1">
          <span><b>💰 Movimientos de dinero</b>
          <small>Deja en $0 ingresos, egresos, señas, cobros, pagos y saldos.</small></span>
        </label>

        <label class="check-card" style="margin-top:8px">
          <input type="checkbox" name="reservations" value="1">
          <span><b>🎉 Reservas</b>
          <small>Borra reservas y todos sus movimientos relacionados.</small></span>
        </label>

        <label class="check-card" style="margin-top:8px">
          <input type="checkbox" name="orders" value="1">
          <span><b>🚚 Pedidos</b>
          <small>Borra pedidos, pagos a proveedores y sus movimientos.</small></span>
        </label>

        <label class="check-card" style="margin-top:8px">
          <input type="checkbox" name="staff" value="1">
          <span><b>👤 Personal</b>
          <small>Borra empleados, asignaciones y gastos de personal.</small></span>
        </label>
      </div>

      <div class="field" style="margin-top:14px">
        <label>Contraseña administrativa</label>
        <input type="password" name="password" required>
      </div>

      <div class="field">
        <label>Motivo</label>
        <textarea name="reason" required placeholder="Ej: limpiar datos de prueba"></textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="danger">Ejecutar borrado seleccionado</button>
      </div>
    </form>
  `);

  $('#reset38').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const s=salon();

    if(String(fd.get('password')||'')!==String(s?.password||'')){
      return toast('Contraseña incorrecta');
    }

    const money=fd.get('money')==='1';
    const reservations=fd.get('reservations')==='1';
    const orders=fd.get('orders')==='1';
    const staff=fd.get('staff')==='1';

    if(!money&&!reservations&&!orders&&!staff){
      return toast('Seleccioná al menos una opción');
    }

    if(reservations)deleteReservations38();
    if(orders)deleteOrders38();
    if(staff)deleteStaff38();
    if(money)zeroMoney38();

    data.auditLog.push({
      id:id(),
      salonId:SID38(),
      action:'REINICIO POR SECCIONES V38',
      options:{money,reservations,orders,staff},
      reason:String(fd.get('reason')||''),
      createdAt:new Date().toISOString()
    });

    save();

    // Segundo guardado para evitar que capas viejas reconstruyan movimientos.
    setTimeout(()=>{
      if(money)zeroMoney38();
      save();
      closeModal();
      toast('Reinicio realizado correctamente');
      view='finance';
      renderSalonShell();
    },400);
  };
};

// Reinicio rápido SOLO dinero, visible en Finanzas.
window.quickZeroMoneyV38=function(){
  showModal(`
    <div class="modal-title">
      <div><h2>💰 Poner movimientos en $0</h2><p>Borra todos los ingresos, egresos y pagos del salón.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="quickzero38">
      <div class="field"><label>Contraseña administrativa</label><input name="password" type="password" required></div>
      <div class="field"><label>Motivo</label><textarea name="reason" required></textarea></div>
      <div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button class="danger">Poner todo el dinero en $0</button></div>
    </form>
  `);

  $('#quickzero38').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    if(String(f.password||'')!==String(salon()?.password||''))return toast('Contraseña incorrecta');

    zeroMoney38();
    save();

    setTimeout(()=>{
      zeroMoney38();
      save();
      closeModal();
      toast('Todos los movimientos quedaron en $0');
      view='finance';
      renderSalonShell();
    },350);
  };
};

// Agrega los botones SIEMPRE arriba de Finanzas.
window.renderFinanceV38=function(){
  if(typeof renderFinanceV36==='function')renderFinanceV36();
  else if(typeof renderFinanceV33==='function')renderFinanceV33();
  else renderFinance();

  const content=$('#content');
  if(!content)return;

  let bar=content.querySelector('.toolbar');
  if(!bar){
    bar=document.createElement('div');
    bar.className='toolbar';
    bar.style.marginBottom='16px';
    content.prepend(bar);
  }

  if(!bar.querySelector('#zero-money38')){
    const b=document.createElement('button');
    b.id='zero-money38';
    b.className='danger';
    b.textContent='💰 Poner movimientos en $0';
    b.onclick=quickZeroMoneyV38;
    bar.appendChild(b);
  }

  if(!bar.querySelector('#reset-sections38')){
    const b=document.createElement('button');
    b.id='reset-sections38';
    b.className='secondary';
    b.textContent='🔄 Reinicio por secciones';
    b.onclick=openResetSectionsV38;
    bar.appendChild(b);
  }
};

// Si no hay reservas y quedaron gastos viejos huérfanos,
// NO los inventa ni los arrastra: se mantienen solo hasta usar el botón de cero.
// La limpieza real la hace zeroMoney38.

const route38=renderSalonView;
renderSalonView=function(){
  if(view==='finance')return renderFinanceV38();
  return route38();
};

})();


// ============================================================
// V39 - PERSONAL INCLUIDO: 1 MOZO + 1 COCINA SIN CARGO AL CLIENTE
//       PERSONAL ADICIONAL SÍ SUMA + GASTO SIN DUPLICAR
// ============================================================
(function(){
'use strict';

data.assignments=data.assignments||[];
data.movements=data.movements||[];

const SID39=()=>session?.salonId;
const STAFF39=()=> (data.staff||[]).filter(s=>s.salonId===SID39() && s.staffStatus!=='Suspendido');
const EVENT39=eid=> (data.events||[]).find(e=>e.id===eid && e.salonId===SID39());

function norm39(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function isMozo39(s){
  const r=norm39(s?.role);
  return r.includes('mozo') || r.includes('moza');
}
function isCocina39(s){
  const r=norm39(s?.role);
  return r.includes('cocina') || r.includes('cocinero') || r.includes('cocinera');
}

// Un único gasto de personal por empleado asignado a una fiesta.
window.rebuildStaffExpenseV39=function(eventId){
  const e=EVENT39(eventId);
  if(!e)return;

  const ass=(data.assignments||[]).filter(a=>a.eventId===eventId);
  let totalExpense=0;

  // Borra TODOS los movimientos automáticos viejos de personal para esta fiesta.
  data.movements=(data.movements||[]).filter(m=>{
    if(m.eventId!==eventId)return true;
    if(m.category!=='Personal')return true;
    return false;
  });

  ass.forEach(a=>{
    const s=(data.staff||[]).find(x=>x.id===a.staffId&&x.salonId===SID39());
    const fee=Number(s?.defaultFee ?? a.amount ?? 0);

    a.amount=fee;
    a.staffName=s?.name||a.staffName||'Personal';

    totalExpense+=fee;

    if(fee>0){
      data.movements.push({
        id:id(),
        salonId:SID39(),
        eventId,
        staffId:a.staffId,
        sourceKey:`v39:staff:${eventId}:${a.staffId}`,
        type:'Gasto',
        category:'Personal',
        concept:`${s?.role||'Personal'} - ${s?.name||a.staffName||''} · ${e.child||e.client||''}`,
        amount:fee,
        autoStaffExpense:true,
        movementDate:e.date||new Date().toISOString().slice(0,10),
        createdAt:new Date().toISOString()
      });
    }
  });

  e.staffExpenseTotal=totalExpense;
  save();
};

// Toma formulario V30/V36 y ajusta selección inicial + textos.
const baseForm39=window.openEventFormV36 || window.openEventFormV30 || window.openEventForm;

window.openEventFormV39=function(eid=''){
  const isNew=!eid;
  baseForm39(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const rows=[...document.querySelectorAll('.staffrow30')];
  const staff=STAFF39();

  // En una fiesta nueva: incluye automáticamente 1 mozo y 1 persona de cocina,
  // si existen empleados activos con esos roles.
  if(isNew){
    let mozoChosen=false, cocinaChosen=false;

    rows.forEach(r=>{
      const sid=r.dataset.id;
      const s=staff.find(x=>x.id===sid);
      const selected=r.querySelector('.staffsel30');
      const charge=r.querySelector('.staffcharge30');

      if(selected && isMozo39(s) && !mozoChosen){
        selected.checked=true;
        if(charge)charge.checked=false;
        mozoChosen=true;
      } else if(selected && isCocina39(s) && !cocinaChosen){
        selected.checked=true;
        if(charge)charge.checked=false;
        cocinaChosen=true;
      }
    });
  }

  // Mejora de textos para que sea claro qué suma y qué no suma.
  rows.forEach(r=>{
    const sid=r.dataset.id;
    const s=staff.find(x=>x.id===sid);
    const selected=r.querySelector('.staffsel30');
    const charge=r.querySelector('.staffcharge30');

    const selectedLabel=selected?.closest('label');
    const chargeLabel=charge?.closest('label');

    if(selectedLabel){
      const small=selectedLabel.querySelector('small');
      if(small){
        small.textContent=`${s?.role||''} · costo salón ${money(s?.defaultFee||0)} · NO suma al cliente`;
      }
    }

    if(chargeLabel){
      const b=chargeLabel.querySelector('b');
      const small=chargeLabel.querySelector('small');
      if(b)b.textContent='Personal adicional';
      if(small)small.textContent='Si lo marcás, este valor SÍ se suma al total de la fiesta';
    }
  });

  // Aviso superior en personal.
  const staffCard=rows[0]?.closest('.card');
  if(staffCard && !staffCard.querySelector('#included-staff39')){
    const notice=document.createElement('div');
    notice.id='included-staff39';
    notice.className='admin-notice';
    notice.style.marginBottom='12px';
    notice.innerHTML=`
      <span>👥</span>
      <div>
        <b>Incluido en la fiesta: 1 mozo + 1 persona de cocina</b>
        <small>No se suma al precio del cliente. Su costo se registra como gasto del salón. Si marcás “Personal adicional”, sí se suma al total.</small>
      </div>`;
    staffCard.insertBefore(notice, staffCard.children[1] || null);
  }

  // Recalcula visualmente si existe la función vía eventos disparados.
  rows.forEach(r=>{
    r.querySelectorAll('input').forEach(inp=>{
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      inp.dispatchEvent(new Event('input',{bubbles:true}));
    });
  });

  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const result=oldSubmit ? oldSubmit.call(form,ev) : undefined;

    setTimeout(()=>{
      let eventId=eid;
      if(!eventId){
        const latest=(data.events||[])
          .filter(e=>e.salonId===SID39())
          .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
        eventId=latest?.id||'';
      }
      if(eventId)rebuildStaffExpenseV39(eventId);
    },300);

    return result;
  };
};

// Cuando se abre una fiesta también limpia cualquier duplicado viejo.
const baseOpen39=window.openEventV33 || window.openEventV31 || window.openEvent;
window.openEventV39=function(eid){
  rebuildStaffExpenseV39(eid);
  return baseOpen39(eid);
};

// Aliases finales
window.openEventForm=window.openEventFormV39;
window.openEventFormV36=window.openEventFormV39;
window.openEventFormV30=window.openEventFormV39;
window.openEvent=window.openEventV39;

})();


// ============================================================
// V40 - PERSONAL INCLUIDO EN COSTO BASE:
// 1 MOZO + 1 COCINA/AYUDANTE + 2 ANIMADORES
// Adicionales solo cuando se marcan como extra
// ============================================================
(function(){
'use strict';

const SID40=()=>session?.salonId;
const STAFF40=()=> (data.staff||[]).filter(s=>s.salonId===SID40() && s.staffStatus!=='Suspendido');

function norm40(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function isMozo40(s){
  const r=norm40(s?.role);
  return r.includes('mozo') || r.includes('moza');
}
function isCocina40(s){
  const r=norm40(s?.role);
  return r.includes('cocina') || r.includes('cocinero') || r.includes('cocinera') || r.includes('ayudante de cocina');
}
function isAnimador40(s){
  const r=norm40(s?.role);
  return r.includes('animador') || r.includes('animadora');
}

// Mejora formulario de empleado: roles sugeridos frecuentes.
const oldStaff40=window.openStaffV31 || window.openStaffForm;
window.openStaffV40=function(staffId=''){
  oldStaff40(staffId);

  const form=document.querySelector('#staff31');
  if(!form)return;

  const roleInput=form.querySelector('[name="role"]');
  if(roleInput && !document.querySelector('#roles40')){
    const dl=document.createElement('datalist');
    dl.id='roles40';
    dl.innerHTML=`
      <option value="Mozo">
      <option value="Moza">
      <option value="Animador">
      <option value="Animadora">
      <option value="Ayudante de cocina">
      <option value="Cocinero">
      <option value="Cocinera">
      <option value="Encargado">
    `;
    document.body.appendChild(dl);
    roleInput.setAttribute('list','roles40');
    roleInput.placeholder='Ej: Mozo, Animador, Ayudante de cocina';
  }
};

// Toma V39 y amplía incluidos de costo base.
const baseForm40=window.openEventFormV39 || window.openEventForm;

window.openEventFormV40=function(eid=''){
  const isNew=!eid;
  baseForm40(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const rows=[...document.querySelectorAll('.staffrow30')];
  const staff=STAFF40();

  if(isNew){
    let mozoCount=0, cocinaCount=0, animCount=0;

    rows.forEach(r=>{
      const staffId=r.dataset.id;
      const s=staff.find(x=>x.id===staffId);
      const selected=r.querySelector('.staffsel30');
      const charge=r.querySelector('.staffcharge30');
      if(!selected)return;

      if(isMozo40(s) && mozoCount<1){
        selected.checked=true;
        if(charge)charge.checked=false;
        mozoCount++;
        return;
      }

      if(isCocina40(s) && cocinaCount<1){
        selected.checked=true;
        if(charge)charge.checked=false;
        cocinaCount++;
        return;
      }

      if(isAnimador40(s) && animCount<2){
        selected.checked=true;
        if(charge)charge.checked=false;
        animCount++;
      }
    });
  }

  // Texto explicativo de incluidos base.
  const staffCard=rows[0]?.closest('.card');
  if(staffCard){
    const old=staffCard.querySelector('#included-staff39');
    if(old){
      old.innerHTML=`
        <span>👥</span>
        <div>
          <b>Incluido en el costo base: 1 mozo + 1 cocina/ayudante + 2 animadores</b>
          <small>No se suman al precio del cliente. Su costo queda como gasto del salón. Si necesitás otro mozo, animador o ayudante, marcá “Personal adicional” y recién ahí se suma al total de la fiesta.</small>
        </div>`;
    }
  }

  // Ajusta textos por rol para que quede claro.
  rows.forEach(r=>{
    const staffId=r.dataset.id;
    const s=staff.find(x=>x.id===staffId);
    const charge=r.querySelector('.staffcharge30');
    const label=charge?.closest('label');
    if(label){
      const b=label.querySelector('b');
      const small=label.querySelector('small');
      if(b)b.textContent='Personal adicional';
      if(small){
        small.textContent=`Si este ${s?.role||'empleado'} es adicional, marcar acá para sumarlo al total del cliente`;
      }
    }
  });

  rows.forEach(r=>{
    r.querySelectorAll('input').forEach(inp=>{
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      inp.dispatchEvent(new Event('input',{bubbles:true}));
    });
  });
};

// aliases finales
window.openStaffForm=window.openStaffV40;
window.openStaffV31=window.openStaffV40;
window.openEventForm=window.openEventFormV40;
window.openEventFormV39=window.openEventFormV40;

})();


// ============================================================
// V41 - FIESTA BÁSICA CONFIGURABLE POR SALÓN
// Incluye: 1 mozo + 1 cocinero + 2 animadores
// Sugerencias automáticas según adultos y chicos
// ============================================================
(function(){
'use strict';

const SID41=()=>session?.salonId;
const SALON41=()=>salon();

function ensureBasicConfig41(){
  const s=SALON41();
  if(!s)return;
  s.basicPartyConfig=s.basicPartyConfig||{
    enabled:true,
    includedWaiters:1,
    includedKitchen:1,
    includedAnimators:2,
    baseAdults:30,
    baseChildren:30,
    adultsPerExtraWaiter:20,
    childrenPerExtraAnimator:15
  };
}

ensureBasicConfig41();

// ----------------------------------------------------------
// MI SALÓN - CONFIGURACIÓN DE FIESTA BÁSICA
// ----------------------------------------------------------
const oldProfile41=window.renderProfileV24 || window.renderProfile;

window.renderProfileV41=function(){
  oldProfile41();
  ensureBasicConfig41();

  const s=SALON41();
  const cfg=s.basicPartyConfig;
  const content=document.querySelector('#content');
  if(!content || document.querySelector('#basic-party-config41'))return;

  const card=document.createElement('div');
  card.id='basic-party-config41';
  card.className='card';
  card.style.marginTop='16px';
  card.innerHTML=`
    <div class="section-title">
      <div>
        <h3>🎉 Fiesta básica</h3>
        <small class="muted">Configurá qué incluye la fiesta base y cuándo sugerir personal adicional.</small>
      </div>
    </div>

    <form id="basic41">
      <div class="admin-notice">
        <span>✅</span>
        <div>
          <b>Incluido en la fiesta básica</b>
          <small>1 mozo · 1 cocinero/ayudante · 2 animadores</small>
        </div>
      </div>

      <div class="form-grid" style="margin-top:12px">
        <div class="field">
          <label>Adultos incluidos en la base</label>
          <input name="baseAdults" type="number" min="0" value="${Number(cfg.baseAdults||0)}">
        </div>

        <div class="field">
          <label>Chicos incluidos en la base</label>
          <input name="baseChildren" type="number" min="0" value="${Number(cfg.baseChildren||0)}">
        </div>

        <div class="field">
          <label>Agregar sugerencia de 1 mozo cada</label>
          <input name="adultsPerExtraWaiter" type="number" min="1" value="${Number(cfg.adultsPerExtraWaiter||20)}">
          <small class="muted">Adultos extra por encima de la base.</small>
        </div>

        <div class="field">
          <label>Agregar sugerencia de 1 animador cada</label>
          <input name="childrenPerExtraAnimator" type="number" min="1" value="${Number(cfg.childrenPerExtraAnimator||15)}">
          <small class="muted">Chicos extra por encima de la base.</small>
        </div>
      </div>

      <div class="form-actions">
        <button class="primary">Guardar configuración de fiesta básica</button>
      </div>
    </form>
  `;

  content.appendChild(card);

  document.querySelector('#basic41').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    cfg.enabled=true;
    cfg.includedWaiters=1;
    cfg.includedKitchen=1;
    cfg.includedAnimators=2;
    cfg.baseAdults=Number(f.baseAdults||0);
    cfg.baseChildren=Number(f.baseChildren||0);
    cfg.adultsPerExtraWaiter=Math.max(1,Number(f.adultsPerExtraWaiter||1));
    cfg.childrenPerExtraAnimator=Math.max(1,Number(f.childrenPerExtraAnimator||1));
    save();
    toast('Configuración de fiesta básica guardada');
  };
};

// ----------------------------------------------------------
// RESERVA - ADULTOS / CHICOS + SUGERENCIAS
// ----------------------------------------------------------
const baseForm41=window.openEventFormV40 || window.openEventForm;

window.openEventFormV41=function(eid=''){
  ensureBasicConfig41();
  baseForm41(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const e=eid ? (data.events||[]).find(x=>x.id===eid&&x.salonId===SID41()) : null;
  const cfg=SALON41().basicPartyConfig;

  // Reemplaza/acompaña cantidad total de invitados por adultos y chicos.
  const guestsField=form.querySelector('[name="guests"]')?.closest('.field');

  if(guestsField && !document.querySelector('#guest-split41')){
    const wrapper=document.createElement('div');
    wrapper.id='guest-split41';
    wrapper.className='field span2';
    wrapper.innerHTML=`
      <label>Invitados</label>
      <div class="form-grid">
        <div class="field">
          <label>Adultos</label>
          <input id="adults41" name="adults" type="number" min="0" value="${Number(e?.adults||0)}">
        </div>
        <div class="field">
          <label>Chicos</label>
          <input id="children41" name="children" type="number" min="0" value="${Number(e?.children||0)}">
        </div>
      </div>
      <div id="party-suggestion41" class="admin-notice" style="margin-top:10px"></div>
    `;
    guestsField.replaceWith(wrapper);
  }

  const adults=document.querySelector('#adults41');
  const children=document.querySelector('#children41');
  const suggestion=document.querySelector('#party-suggestion41');

  function suggestions41(){
    if(!suggestion)return;

    const a=Number(adults?.value||0);
    const c=Number(children?.value||0);

    const extraAdults=Math.max(0,a-Number(cfg.baseAdults||0));
    const extraChildren=Math.max(0,c-Number(cfg.baseChildren||0));

    const waiterSuggest=extraAdults>0
      ? Math.ceil(extraAdults/Math.max(1,Number(cfg.adultsPerExtraWaiter||1)))
      : 0;

    const animatorSuggest=extraChildren>0
      ? Math.ceil(extraChildren/Math.max(1,Number(cfg.childrenPerExtraAnimator||1)))
      : 0;

    let lines=[];
    lines.push(`<b>Fiesta básica incluida:</b> 1 mozo · 1 cocinero · 2 animadores`);

    if(waiterSuggest>0){
      lines.push(`👤 Por ${a} adultos se sugiere agregar <b>${waiterSuggest} mozo${waiterSuggest>1?'s':''} adicional${waiterSuggest>1?'es':''}</b>.`);
    }
    if(animatorSuggest>0){
      lines.push(`🎈 Por ${c} chicos se sugiere agregar <b>${animatorSuggest} animador${animatorSuggest>1?'es':''} adicional${animatorSuggest>1?'es':''}</b>.`);
    }

    if(waiterSuggest===0 && animatorSuggest===0){
      lines.push(`✅ La cantidad de invitados está dentro de la configuración base del salón.`);
    }

    suggestion.innerHTML=`<span>💡</span><div>${lines.map(x=>`<div>${x}</div>`).join('')}</div>`;
  }

  adults?.addEventListener('input',suggestions41);
  children?.addEventListener('input',suggestions41);
  suggestions41();

  // Guarda adultos/chicos y total de invitados.
  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const a=Number(adults?.value||0);
    const c=Number(children?.value||0);

    // Como V30 espera guests, recreamos input oculto.
    let hidden=form.querySelector('[name="guests"]');
    if(!hidden){
      hidden=document.createElement('input');
      hidden.type='hidden';
      hidden.name='guests';
      form.appendChild(hidden);
    }
    hidden.value=String(a+c);

    const result=oldSubmit ? oldSubmit.call(form,ev) : undefined;

    setTimeout(()=>{
      let target=eid ? (data.events||[]).find(x=>x.id===eid) : (data.events||[])
        .filter(x=>x.salonId===SID41())
        .sort((x,y)=>String(y.createdAt||'').localeCompare(String(x.createdAt||'')))[0];

      if(target){
        target.adults=a;
        target.children=c;
        target.guests=a+c;
        target.basicPartySnapshot={
          includedWaiters:1,
          includedKitchen:1,
          includedAnimators:2,
          baseAdults:Number(cfg.baseAdults||0),
          baseChildren:Number(cfg.baseChildren||0),
          adultsPerExtraWaiter:Number(cfg.adultsPerExtraWaiter||1),
          childrenPerExtraAnimator:Number(cfg.childrenPerExtraAnimator||1)
        };
        save();
      }
    },250);

    return result;
  };
};

// ----------------------------------------------------------
// DETALLE DE FIESTA - MUESTRA BASE + SUGERENCIAS
// ----------------------------------------------------------
const baseOpen41=window.openEventV39 || window.openEvent;

window.openEventV41=function(eid){
  baseOpen41(eid);

  setTimeout(()=>{
    const e=(data.events||[]).find(x=>x.id===eid&&x.salonId===SID41());
    const modal=document.querySelector('#modal-body');
    if(!e || !modal || modal.querySelector('#party-base-detail41'))return;

    ensureBasicConfig41();
    const cfg=e.basicPartySnapshot||SALON41().basicPartyConfig;
    const a=Number(e.adults||0), c=Number(e.children||0);

    const extraAdults=Math.max(0,a-Number(cfg.baseAdults||0));
    const extraChildren=Math.max(0,c-Number(cfg.baseChildren||0));
    const waiters=extraAdults>0?Math.ceil(extraAdults/Math.max(1,Number(cfg.adultsPerExtraWaiter||1))):0;
    const animators=extraChildren>0?Math.ceil(extraChildren/Math.max(1,Number(cfg.childrenPerExtraAnimator||1))):0;

    const card=document.createElement('div');
    card.id='party-base-detail41';
    card.className='card';
    card.style.marginTop='14px';
    card.innerHTML=`
      <h3>Fiesta básica</h3>
      <div>Incluye <b>1 mozo · 1 cocinero · 2 animadores</b></div>
      <div style="margin-top:6px">Adultos: <b>${a}</b> · Chicos: <b>${c}</b></div>
      ${waiters>0?`<div style="margin-top:6px">💡 Sugerencia: <b>${waiters} mozo${waiters>1?'s':''} adicional${waiters>1?'es':''}</b></div>`:''}
      ${animators>0?`<div style="margin-top:6px">💡 Sugerencia: <b>${animators} animador${animators>1?'es':''} adicional${animators>1?'es':''}</b></div>`:''}
    `;
    modal.appendChild(card);
  },0);
};

// Aliases finales
window.renderProfile=window.renderProfileV41;
window.openEventForm=window.openEventFormV41;
window.openEventFormV40=window.openEventFormV41;
window.openEvent=window.openEventV41;

const route41=renderSalonView;
renderSalonView=function(){
  if(view==='profile')return renderProfileV41();
  return route41();
};

})();


// ============================================================
// V42 - FIESTA BÁSICA: COSTO ADULTO EXTRA + COSTO NENE EXTRA
// ============================================================
(function(){
'use strict';

const SID42=()=>session?.salonId;
const SALON42=()=>salon();

function ensureCfg42(){
  const s=SALON42();
  if(!s)return;
  s.basicPartyConfig=s.basicPartyConfig||{};
  if(s.basicPartyConfig.extraAdultPrice==null) s.basicPartyConfig.extraAdultPrice=0;
  if(s.basicPartyConfig.extraChildPrice==null) s.basicPartyConfig.extraChildPrice=0;
}

ensureCfg42();

// ----------------------------------------------------------
// MI SALÓN - agrega precios por adulto extra y nene extra
// ----------------------------------------------------------
const oldProfile42=window.renderProfileV41 || window.renderProfile;

window.renderProfileV42=function(){
  oldProfile42();
  ensureCfg42();

  const cfg=SALON42().basicPartyConfig;
  const form=document.querySelector('#basic41');
  if(!form || document.querySelector('#extra-prices42'))return;

  const box=document.createElement('div');
  box.id='extra-prices42';
  box.className='form-grid';
  box.style.marginTop='12px';
  box.innerHTML=`
    <div class="field">
      <label>Costo por adulto extra</label>
      <input name="extraAdultPrice" type="number" min="0" value="${Number(cfg.extraAdultPrice||0)}">
      <small class="muted">Se suma al total por cada adulto que supere la base configurada.</small>
    </div>

    <div class="field">
      <label>Costo por nene extra</label>
      <input name="extraChildPrice" type="number" min="0" value="${Number(cfg.extraChildPrice||0)}">
      <small class="muted">Se suma al total por cada chico que supere la base configurada.</small>
    </div>
  `;

  const actions=form.querySelector('.form-actions');
  form.insertBefore(box, actions);

  const oldSubmit=form.onsubmit;
  form.onsubmit=function(e){
    const fd=new FormData(form);
    cfg.extraAdultPrice=Number(fd.get('extraAdultPrice')||0);
    cfg.extraChildPrice=Number(fd.get('extraChildPrice')||0);
    return oldSubmit ? oldSubmit.call(form,e) : undefined;
  };
};

// ----------------------------------------------------------
// RESERVA - calcula adultos/chicos extra y suma automáticamente
// ----------------------------------------------------------
const oldEventForm42=window.openEventFormV41 || window.openEventForm;

window.openEventFormV42=function(eid=''){
  ensureCfg42();
  oldEventForm42(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const cfg=SALON42().basicPartyConfig;
  const adults=document.querySelector('#adults41');
  const children=document.querySelector('#children41');

  const summary=document.querySelector('#party-suggestion41');
  if(summary && !document.querySelector('#extra-costs42')){
    const d=document.createElement('div');
    d.id='extra-costs42';
    d.style.marginTop='8px';
    summary.appendChild(d);
  }

  // Agrega tarjetas de discriminación si existen resúmenes V30.
  const totalGrid=document.querySelector('#totalSum30')?.closest('.grid');
  if(totalGrid && !document.querySelector('#adultExtraSum42')){
    const a=document.createElement('div');
    a.className='card stat';
    a.innerHTML=`<small>Adultos extra</small><strong id="adultExtraSum42">$ 0</strong>`;
    totalGrid.insertBefore(a, document.querySelector('#totalSum30')?.closest('.card'));

    const c=document.createElement('div');
    c.className='card stat';
    c.innerHTML=`<small>Nenes extra</small><strong id="childExtraSum42">$ 0</strong>`;
    totalGrid.insertBefore(c, document.querySelector('#totalSum30')?.closest('.card'));
  }

  function calcExtras42(){
    const a=Number(adults?.value||0);
    const c=Number(children?.value||0);

    const adultExtraQty=Math.max(0,a-Number(cfg.baseAdults||0));
    const childExtraQty=Math.max(0,c-Number(cfg.baseChildren||0));

    const adultExtraTotal=adultExtraQty*Number(cfg.extraAdultPrice||0);
    const childExtraTotal=childExtraQty*Number(cfg.extraChildPrice||0);

    const d=document.querySelector('#extra-costs42');
    if(d){
      d.innerHTML=`
        <div>Adultos extra: <b>${adultExtraQty}</b> × ${money(cfg.extraAdultPrice||0)} = <b>${money(adultExtraTotal)}</b></div>
        <div>Nenes extra: <b>${childExtraQty}</b> × ${money(cfg.extraChildPrice||0)} = <b>${money(childExtraTotal)}</b></div>
      `;
    }

    const ae=document.querySelector('#adultExtraSum42');
    const ce=document.querySelector('#childExtraSum42');
    if(ae)ae.textContent=money(adultExtraTotal);
    if(ce)ce.textContent=money(childExtraTotal);

    return {adultExtraQty,childExtraQty,adultExtraTotal,childExtraTotal};
  }

  adults?.addEventListener('input',calcExtras42);
  children?.addEventListener('input',calcExtras42);
  calcExtras42();

  // Intercepta guardado para incorporar extras por invitados.
  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const vals=calcExtras42();

    // Antes de que guarde V30, incrementa visualmente el precio base
    // con un hidden temporal separado para no alterar el precio base configurado.
    const result=oldSubmit ? oldSubmit.call(form,ev) : undefined;

    setTimeout(()=>{
      let e=eid ? (data.events||[]).find(x=>x.id===eid) : (data.events||[])
        .filter(x=>x.salonId===SID42())
        .sort((x,y)=>String(y.createdAt||'').localeCompare(String(x.createdAt||'')))[0];

      if(!e)return;

      e.extraAdultQty=vals.adultExtraQty;
      e.extraChildQty=vals.childExtraQty;
      e.extraAdultPrice=Number(cfg.extraAdultPrice||0);
      e.extraChildPrice=Number(cfg.extraChildPrice||0);
      e.extraAdultsTotal=vals.adultExtraTotal;
      e.extraChildrenTotal=vals.childExtraTotal;

      // Recalcula total real de la reserva.
      const base=Number(e.basePrice||0);
      const extras=Number(e.extrasTotal||0);
      const stock=Number(e.stockItemsTotal||0);
      const staffExtra=Number(e.staffClientChargeTotal||0);

      e.total=base+extras+stock+staffExtra+vals.adultExtraTotal+vals.childExtraTotal;
      e.balance=Math.max(0,Number(e.total||0)-Number(e.paid||0));

      save();
    },300);

    return result;
  };
};

// ----------------------------------------------------------
// DETALLE DE FIESTA: discriminación de adultos/chicos extra
// ----------------------------------------------------------
const oldOpen42=window.openEventV41 || window.openEvent;

window.openEventV42=function(eid){
  oldOpen42(eid);

  setTimeout(()=>{
    const e=(data.events||[]).find(x=>x.id===eid&&x.salonId===SID42());
    const modal=document.querySelector('#modal-body');
    if(!e || !modal || modal.querySelector('#guest-extra-detail42'))return;

    const card=document.createElement('div');
    card.id='guest-extra-detail42';
    card.className='card';
    card.style.marginTop='14px';
    card.innerHTML=`
      <h3>Invitados extra</h3>
      <div>Adultos extra: <b>${Number(e.extraAdultQty||0)}</b> × ${money(e.extraAdultPrice||0)} = <b>${money(e.extraAdultsTotal||0)}</b></div>
      <div style="margin-top:6px">Nenes extra: <b>${Number(e.extraChildQty||0)}</b> × ${money(e.extraChildPrice||0)} = <b>${money(e.extraChildrenTotal||0)}</b></div>
    `;
    modal.appendChild(card);
  },0);
};

// aliases finales
window.renderProfile=window.renderProfileV42;
window.openEventForm=window.openEventFormV42;
window.openEventFormV41=window.openEventFormV42;
window.openEvent=window.openEventV42;

const route42=renderSalonView;
renderSalonView=function(){
  if(view==='profile')return renderProfileV42();
  return route42();
};

})();


// ============================================================
// V43 - PERSONAL EXTRA AUTOMÁTICO POR CANTIDAD DE INVITADOS
// Sin necesidad de elegir un empleado con nombre.
// ============================================================
(function(){
'use strict';

const SID43=()=>session?.salonId;
const SALON43=()=>salon();

function ensureCfg43(){
  const s=SALON43();
  if(!s)return;
  s.basicPartyConfig=s.basicPartyConfig||{};
  const c=s.basicPartyConfig;
  if(c.extraWaiterPrice==null)c.extraWaiterPrice=0;
  if(c.extraAnimatorPrice==null)c.extraAnimatorPrice=0;
  if(c.adultsPerExtraWaiter==null)c.adultsPerExtraWaiter=20;
  if(c.childrenPerExtraAnimator==null)c.childrenPerExtraAnimator=15;
  if(c.baseAdults==null)c.baseAdults=30;
  if(c.baseChildren==null)c.baseChildren=30;
}
ensureCfg43();

function calcAutoStaff43(adults, children, cfg){
  const extraAdults=Math.max(0,Number(adults||0)-Number(cfg.baseAdults||0));
  const extraChildren=Math.max(0,Number(children||0)-Number(cfg.baseChildren||0));

  const extraWaiters=extraAdults>0
    ? Math.ceil(extraAdults/Math.max(1,Number(cfg.adultsPerExtraWaiter||1)))
    : 0;

  const extraAnimators=extraChildren>0
    ? Math.ceil(extraChildren/Math.max(1,Number(cfg.childrenPerExtraAnimator||1)))
    : 0;

  const waiterCharge=extraWaiters*Number(cfg.extraWaiterPrice||0);
  const animatorCharge=extraAnimators*Number(cfg.extraAnimatorPrice||0);

  return {
    extraAdults, extraChildren,
    extraWaiters, extraAnimators,
    waiterCharge, animatorCharge,
    totalAutoStaff:waiterCharge+animatorCharge
  };
}

// ----------------------------------------------------------
// MI SALÓN: precio genérico del mozo y animador adicional
// ----------------------------------------------------------
const oldProfile43=window.renderProfileV42 || window.renderProfile;

window.renderProfileV43=function(){
  oldProfile43();
  ensureCfg43();

  const cfg=SALON43().basicPartyConfig;
  const form=document.querySelector('#basic41');
  if(!form || document.querySelector('#auto-staff-prices43'))return;

  const box=document.createElement('div');
  box.id='auto-staff-prices43';
  box.className='form-grid';
  box.style.marginTop='12px';
  box.innerHTML=`
    <div class="field">
      <label>Costo de mozo adicional automático</label>
      <input name="extraWaiterPrice" type="number" min="0" value="${Number(cfg.extraWaiterPrice||0)}">
      <small class="muted">Se suma automáticamente cuando los adultos superan el límite configurado.</small>
    </div>

    <div class="field">
      <label>Costo de animador adicional automático</label>
      <input name="extraAnimatorPrice" type="number" min="0" value="${Number(cfg.extraAnimatorPrice||0)}">
      <small class="muted">Se suma automáticamente cuando los chicos superan el límite configurado.</small>
    </div>
  `;

  const actions=form.querySelector('.form-actions');
  form.insertBefore(box,actions);

  const oldSubmit=form.onsubmit;
  form.onsubmit=function(e){
    const fd=new FormData(form);
    cfg.extraWaiterPrice=Number(fd.get('extraWaiterPrice')||0);
    cfg.extraAnimatorPrice=Number(fd.get('extraAnimatorPrice')||0);
    return oldSubmit ? oldSubmit.call(form,e) : undefined;
  };
};

// ----------------------------------------------------------
// RESERVA: suma automática de mozo/animador adicional
// ----------------------------------------------------------
const oldForm43=window.openEventFormV42 || window.openEventForm;

window.openEventFormV43=function(eid=''){
  ensureCfg43();
  oldForm43(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const cfg=SALON43().basicPartyConfig;
  const adults=document.querySelector('#adults41');
  const children=document.querySelector('#children41');

  const totalGrid=document.querySelector('#totalSum30')?.closest('.grid');

  if(totalGrid && !document.querySelector('#waiterAutoSum43')){
    const waiter=document.createElement('div');
    waiter.className='card stat';
    waiter.innerHTML=`<small>Mozo adicional automático</small><strong id="waiterAutoSum43">$ 0</strong>`;

    const animator=document.createElement('div');
    animator.className='card stat';
    animator.innerHTML=`<small>Animador adicional automático</small><strong id="animatorAutoSum43">$ 0</strong>`;

    totalGrid.insertBefore(waiter,document.querySelector('#totalSum30')?.closest('.card'));
    totalGrid.insertBefore(animator,document.querySelector('#totalSum30')?.closest('.card'));
  }

  const suggestion=document.querySelector('#party-suggestion41');

  function refreshAuto43(){
    const a=Number(adults?.value||0);
    const c=Number(children?.value||0);
    const r=calcAutoStaff43(a,c,cfg);

    const ws=document.querySelector('#waiterAutoSum43');
    const as=document.querySelector('#animatorAutoSum43');

    if(ws)ws.textContent=money(r.waiterCharge);
    if(as)as.textContent=money(r.animatorCharge);

    if(suggestion){
      let old=suggestion.querySelector('#auto-staff-detail43');
      if(!old){
        old=document.createElement('div');
        old.id='auto-staff-detail43';
        old.style.marginTop='8px';
        suggestion.appendChild(old);
      }

      old.innerHTML=`
        ${r.extraWaiters>0
          ? `<div>👤 Se agregan automáticamente <b>${r.extraWaiters} mozo${r.extraWaiters>1?'s':''} adicional${r.extraWaiters>1?'es':''}</b> × ${money(cfg.extraWaiterPrice||0)} = <b>${money(r.waiterCharge)}</b></div>`
          : ''}
        ${r.extraAnimators>0
          ? `<div>🎈 Se agregan automáticamente <b>${r.extraAnimators} animador${r.extraAnimators>1?'es':''} adicional${r.extraAnimators>1?'es':''}</b> × ${money(cfg.extraAnimatorPrice||0)} = <b>${money(r.animatorCharge)}</b></div>`
          : ''}
      `;
    }

    return r;
  }

  adults?.addEventListener('input',refreshAuto43);
  children?.addEventListener('input',refreshAuto43);
  refreshAuto43();

  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const auto=refreshAuto43();
    const result=oldSubmit ? oldSubmit.call(form,ev) : undefined;

    setTimeout(()=>{
      let e=eid ? (data.events||[]).find(x=>x.id===eid) : (data.events||[])
        .filter(x=>x.salonId===SID43())
        .sort((x,y)=>String(y.createdAt||'').localeCompare(String(x.createdAt||'')))[0];

      if(!e)return;

      e.autoExtraWaiters=auto.extraWaiters;
      e.autoExtraAnimators=auto.extraAnimators;
      e.autoExtraWaiterPrice=Number(cfg.extraWaiterPrice||0);
      e.autoExtraAnimatorPrice=Number(cfg.extraAnimatorPrice||0);
      e.autoExtraWaiterTotal=auto.waiterCharge;
      e.autoExtraAnimatorTotal=auto.animatorCharge;
      e.autoExtraStaffTotal=auto.totalAutoStaff;

      // Recalcula total final de forma única.
      const base=Number(e.basePrice||0);
      const extras=Number(e.extrasTotal||0);
      const stock=Number(e.stockItemsTotal||0);
      const manualStaff=Number(e.staffClientChargeTotal||0);
      const adultGuest=Number(e.extraAdultsTotal||0);
      const childGuest=Number(e.extraChildrenTotal||0);

      e.total=
        base +
        extras +
        stock +
        manualStaff +
        adultGuest +
        childGuest +
        auto.totalAutoStaff;

      e.balance=Math.max(0,Number(e.total||0)-Number(e.paid||0));

      save();
    },350);

    return result;
  };
};

// ----------------------------------------------------------
// DETALLE DE FIESTA
// ----------------------------------------------------------
const oldOpen43=window.openEventV42 || window.openEvent;

window.openEventV43=function(eid){
  oldOpen43(eid);

  setTimeout(()=>{
    const e=(data.events||[]).find(x=>x.id===eid&&x.salonId===SID43());
    const modal=document.querySelector('#modal-body');
    if(!e || !modal || modal.querySelector('#auto-staff-card43'))return;

    const card=document.createElement('div');
    card.id='auto-staff-card43';
    card.className='card';
    card.style.marginTop='14px';

    card.innerHTML=`
      <h3>Personal adicional automático por cantidad de invitados</h3>
      <div>Mozo adicional: <b>${Number(e.autoExtraWaiters||0)}</b> × ${money(e.autoExtraWaiterPrice||0)} = <b>${money(e.autoExtraWaiterTotal||0)}</b></div>
      <div style="margin-top:6px">Animador adicional: <b>${Number(e.autoExtraAnimators||0)}</b> × ${money(e.autoExtraAnimatorPrice||0)} = <b>${money(e.autoExtraAnimatorTotal||0)}</b></div>
      <div style="margin-top:8px"><b>Total personal adicional automático: ${money(e.autoExtraStaffTotal||0)}</b></div>
      <small class="muted">No requiere seleccionar un empleado por nombre. Es un cargo automático de la reserva.</small>
    `;

    modal.appendChild(card);
  },0);
};

// aliases
window.renderProfile=window.renderProfileV43;
window.openEventForm=window.openEventFormV43;
window.openEventFormV42=window.openEventFormV43;
window.openEvent=window.openEventV43;

const route43=renderSalonView;
renderSalonView=function(){
  if(view==='profile')return renderProfileV43();
  return route43();
};

})();


// ============================================================
// V44 - RESERVA SIN NOMBRES DE PERSONAL
// Solo adicionales genéricos: Mozo / Animador + cantidad.
// Costos tomados desde Mi salón > Fiesta básica.
// ============================================================
(function(){
'use strict';

const SID44=()=>session?.salonId;
const SALON44=()=>salon();

function cfg44(){
  const s=SALON44();
  if(!s)return {};
  s.basicPartyConfig=s.basicPartyConfig||{};
  return s.basicPartyConfig;
}

function n44(v){ return Number(v||0); }

const oldForm44=window.openEventFormV43 || window.openEventForm;

window.openEventFormV44=function(eid=''){
  oldForm44(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const e=eid ? (data.events||[]).find(x=>x.id===eid&&x.salonId===SID44()) : null;
  const cfg=cfg44();

  // --------------------------------------------------------
  // Oculta completamente el listado de empleados con nombres.
  // --------------------------------------------------------
  const staffRows=[...document.querySelectorAll('.staffrow30')];
  const staffCard=staffRows[0]?.closest('.card');
  if(staffCard)staffCard.style.display='none';

  // Desmarca personal nombrado para que la reserva no lo use.
  staffRows.forEach(r=>{
    const sel=r.querySelector('.staffsel30');
    const charge=r.querySelector('.staffcharge30');
    if(sel)sel.checked=false;
    if(charge)charge.checked=false;
  });

  // Oculta tarjetas automáticas anteriores V43.
  const waiterStat=document.querySelector('#waiterAutoSum43')?.closest('.card');
  const animatorStat=document.querySelector('#animatorAutoSum43')?.closest('.card');
  if(waiterStat)waiterStat.style.display='none';
  if(animatorStat)animatorStat.style.display='none';

  const oldAutoDetail=document.querySelector('#auto-staff-detail43');
  if(oldAutoDetail)oldAutoDetail.style.display='none';

  // --------------------------------------------------------
  // Nueva tarjeta simple de personal adicional.
  // --------------------------------------------------------
  const stockCard=[...form.querySelectorAll('.card')].find(c=>c.textContent.includes('Productos de stock'));
  if(stockCard && !document.querySelector('#generic-staff44')){
    const card=document.createElement('div');
    card.id='generic-staff44';
    card.className='card';
    card.style.marginTop='12px';

    const oldWaiters=n44(e?.genericExtraWaiters ?? e?.autoExtraWaiters);
    const oldAnimators=n44(e?.genericExtraAnimators ?? e?.autoExtraAnimators);

    card.innerHTML=`
      <div class="section-title">
        <div>
          <h3>Personal adicional</h3>
          <small class="muted">No se muestran nombres. Solo indicá si necesitás personal extra y la cantidad.</small>
        </div>
      </div>

      <div class="admin-notice" style="margin-bottom:12px">
        <span>✅</span>
        <div>
          <b>La fiesta base ya incluye 1 mozo + 1 cocinero/ayudante + 2 animadores</b>
          <small>Los adicionales se cobran según los valores configurados en Mi salón.</small>
        </div>
      </div>

      <div class="form-grid">
        <label class="check-card">
          <input type="checkbox" id="extraWaiterCheck44" ${oldWaiters>0?'checked':''}>
          <span>
            <b>Mozo adicional</b>
            <small>${money(cfg.extraWaiterPrice||0)} cada uno</small>
          </span>
        </label>

        <div class="field" id="extraWaiterQtyWrap44" style="${oldWaiters>0?'':'display:none'}">
          <label>Cantidad de mozos adicionales</label>
          <input id="extraWaiterQty44" type="number" min="1" value="${Math.max(1,oldWaiters||1)}">
        </div>

        <label class="check-card">
          <input type="checkbox" id="extraAnimatorCheck44" ${oldAnimators>0?'checked':''}>
          <span>
            <b>Animador adicional</b>
            <small>${money(cfg.extraAnimatorPrice||0)} cada uno</small>
          </span>
        </label>

        <div class="field" id="extraAnimatorQtyWrap44" style="${oldAnimators>0?'':'display:none'}">
          <label>Cantidad de animadores adicionales</label>
          <input id="extraAnimatorQty44" type="number" min="1" value="${Math.max(1,oldAnimators||1)}">
        </div>
      </div>

      <div id="genericStaffTotal44" class="admin-notice" style="margin-top:10px"></div>
    `;
    stockCard.parentNode.insertBefore(card,stockCard);
  }

  const waiterCheck=document.querySelector('#extraWaiterCheck44');
  const waiterQty=document.querySelector('#extraWaiterQty44');
  const waiterWrap=document.querySelector('#extraWaiterQtyWrap44');
  const animatorCheck=document.querySelector('#extraAnimatorCheck44');
  const animatorQty=document.querySelector('#extraAnimatorQty44');
  const animatorWrap=document.querySelector('#extraAnimatorQtyWrap44');

  function values44(){
    const w=waiterCheck?.checked ? Math.max(1,n44(waiterQty?.value)) : 0;
    const a=animatorCheck?.checked ? Math.max(1,n44(animatorQty?.value)) : 0;
    const wt=w*n44(cfg.extraWaiterPrice);
    const at=a*n44(cfg.extraAnimatorPrice);
    return {w,a,wt,at,total:wt+at};
  }

  function recalc44(){
    waiterWrap.style.display=waiterCheck.checked?'':'none';
    animatorWrap.style.display=animatorCheck.checked?'':'none';

    const v=values44();

    const info=document.querySelector('#genericStaffTotal44');
    if(info){
      info.innerHTML=`
        <span>💰</span>
        <div>
          <div>Mozo adicional: <b>${v.w}</b> × ${money(cfg.extraWaiterPrice||0)} = <b>${money(v.wt)}</b></div>
          <div>Animador adicional: <b>${v.a}</b> × ${money(cfg.extraAnimatorPrice||0)} = <b>${money(v.at)}</b></div>
          <div style="margin-top:4px"><b>Total personal adicional: ${money(v.total)}</b></div>
        </div>`;
    }

    // Recalcula el total visible sin depender de nombres de empleados.
    const base=n44(document.querySelector('#base30')?.value);

    let extras=0;
    document.querySelectorAll('.extra30').forEach(x=>{
      if(x.checked)extras+=n44(x.dataset.price);
    });

    let stock=0;
    document.querySelectorAll('.stockrow30').forEach(r=>{
      stock+=n44(r.querySelector('.stockqty30')?.value)*n44(r.dataset.price);
    });

    const adults=n44(document.querySelector('#adults41')?.value);
    const children=n44(document.querySelector('#children41')?.value);

    const adultExtraQty=Math.max(0,adults-n44(cfg.baseAdults));
    const childExtraQty=Math.max(0,children-n44(cfg.baseChildren));
    const adultExtraTotal=adultExtraQty*n44(cfg.extraAdultPrice);
    const childExtraTotal=childExtraQty*n44(cfg.extraChildPrice);

    const total=base+extras+stock+adultExtraTotal+childExtraTotal+v.total;
    const dep=Math.min(n44(document.querySelector('#dep30')?.value),total);

    const staffCharge=document.querySelector('#staffChargeSum30');
    const totalEl=document.querySelector('#totalSum30');
    const bal=document.querySelector('#balSum30');
    const staffExpense=document.querySelector('#staffExpenseSum30');

    if(staffCharge)staffCharge.textContent=money(v.total);
    if(totalEl)totalEl.textContent=money(total);
    if(bal)bal.textContent=money(Math.max(0,total-dep));
    if(staffExpense)staffExpense.textContent=money(0);

    return {
      ...v,
      adultExtraQty,childExtraQty,adultExtraTotal,childExtraTotal,total,deposit:dep
    };
  }

  waiterCheck?.addEventListener('change',recalc44);
  animatorCheck?.addEventListener('change',recalc44);
  waiterQty?.addEventListener('input',recalc44);
  animatorQty?.addEventListener('input',recalc44);
  document.querySelector('#adults41')?.addEventListener('input',recalc44);
  document.querySelector('#children41')?.addEventListener('input',recalc44);
  document.querySelector('#base30')?.addEventListener('input',recalc44);
  document.querySelector('#dep30')?.addEventListener('input',recalc44);
  document.querySelectorAll('.extra30').forEach(x=>x.addEventListener('change',recalc44));
  document.querySelectorAll('.stockqty30').forEach(x=>x.addEventListener('input',recalc44));

  recalc44();

  // --------------------------------------------------------
  // Guarda los adicionales genéricos y anula la lógica de
  // personal automático por invitados de V43.
  // --------------------------------------------------------
  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const v=recalc44();
    const result=oldSubmit ? oldSubmit.call(form,ev) : undefined;

    setTimeout(()=>{
      let target=eid ? (data.events||[]).find(x=>x.id===eid) :
        (data.events||[])
          .filter(x=>x.salonId===SID44())
          .sort((x,y)=>String(y.createdAt||'').localeCompare(String(x.createdAt||'')))[0];

      if(!target)return;

      // No se usa personal con nombre en el armado de reserva.
      data.assignments=(data.assignments||[]).filter(a=>a.eventId!==target.id);

      target.genericExtraWaiters=v.w;
      target.genericExtraAnimators=v.a;
      target.genericExtraWaiterPrice=n44(cfg.extraWaiterPrice);
      target.genericExtraAnimatorPrice=n44(cfg.extraAnimatorPrice);
      target.genericExtraWaiterTotal=v.wt;
      target.genericExtraAnimatorTotal=v.at;
      target.genericExtraStaffTotal=v.total;

      // Compatibilidad con pantallas anteriores.
      target.autoExtraWaiters=v.w;
      target.autoExtraAnimators=v.a;
      target.autoExtraWaiterPrice=n44(cfg.extraWaiterPrice);
      target.autoExtraAnimatorPrice=n44(cfg.extraAnimatorPrice);
      target.autoExtraWaiterTotal=v.wt;
      target.autoExtraAnimatorTotal=v.at;
      target.autoExtraStaffTotal=v.total;

      target.staffClientChargeTotal=v.total;
      target.staffExpenseTotal=0;

      target.extraAdultQty=v.adultExtraQty;
      target.extraChildQty=v.childExtraQty;
      target.extraAdultsTotal=v.adultExtraTotal;
      target.extraChildrenTotal=v.childExtraTotal;

      target.total=v.total;
      target.deposit=v.deposit;
      target.paid=v.deposit;
      target.balance=Math.max(0,v.total-v.deposit);

      save();
    },450);

    return result;
  };
};

// ----------------------------------------------------------
// Detalle de fiesta: mostrar genérico, sin nombres.
// ----------------------------------------------------------
const oldOpen44=window.openEventV43 || window.openEvent;

window.openEventV44=function(eid){
  oldOpen44(eid);

  setTimeout(()=>{
    const e=(data.events||[]).find(x=>x.id===eid&&x.salonId===SID44());
    const modal=document.querySelector('#modal-body');
    if(!e || !modal)return;

    // Oculta cualquier bloque que haya quedado mostrando personal por nombre.
    [...modal.querySelectorAll('.card')].forEach(c=>{
      const txt=String(c.textContent||'').toLowerCase();
      if(txt.includes('personal asignado') || txt.includes('personal an')) {
        c.style.display='none';
      }
    });

    const old=document.querySelector('#auto-staff-card43');
    if(old)old.style.display='none';

    if(!modal.querySelector('#generic-staff-detail44')){
      const card=document.createElement('div');
      card.id='generic-staff-detail44';
      card.className='card';
      card.style.marginTop='14px';
      card.innerHTML=`
        <h3>Personal adicional</h3>
        <div>Mozo adicional: <b>${n44(e.genericExtraWaiters||0)}</b> × ${money(e.genericExtraWaiterPrice||0)} = <b>${money(e.genericExtraWaiterTotal||0)}</b></div>
        <div style="margin-top:6px">Animador adicional: <b>${n44(e.genericExtraAnimators||0)}</b> × ${money(e.genericExtraAnimatorPrice||0)} = <b>${money(e.genericExtraAnimatorTotal||0)}</b></div>
        <div style="margin-top:8px"><b>Total adicionales de personal: ${money(e.genericExtraStaffTotal||0)}</b></div>
      `;
      modal.appendChild(card);
    }
  },0);
};

window.openEventForm=window.openEventFormV44;
window.openEventFormV43=window.openEventFormV44;
window.openEvent=window.openEventV44;

})();


// ============================================================
// V45 - RESERVAS POR TIPO DE EVENTO + CONFIGURACIÓN POR SALÓN
// ============================================================
(function(){
'use strict';

const SID45=()=>session?.salonId;
const SALON45=()=>salon();
const EV45=id=>(data.events||[]).find(e=>e.id===id&&e.salonId===SID45());
const N45=v=>Number(v||0);

function defaultTypes45(){
  return [
    {
      id:'infantil', name:'Cumple infantil', kind:'children', active:true,
      durationHours:4, extraHourPrice:0,
      includedWaiters:1, includedKitchen:1, includedAnimators:2,
      maxAdults:30, maxChildren:30,
      extraAdultPrice:0, extraChildPrice:0,
      extraWaiterPrice:0, extraKitchenPrice:0, extraAnimatorPrice:0,
      includesTableware:true, includesLinen:true, includesCoffee:true
    },
    {
      id:'adulto', name:'Cumple adulto', kind:'adult', active:true,
      durationHours:4, extraHourPrice:0,
      includedWaiters:2, includedKitchen:1, includedAnimators:0,
      maxAdults:50, maxChildren:0,
      extraAdultPrice:0, extraChildPrice:0,
      extraWaiterPrice:0, extraKitchenPrice:0, extraAnimatorPrice:0,
      includesTableware:true, includesLinen:true, includesCoffee:true
    },
    {
      id:'social', name:'Eventos Sociales', kind:'general', active:true,
      durationHours:5, extraHourPrice:0,
      includedWaiters:2, includedKitchen:1, includedAnimators:0,
      maxAdults:80, maxChildren:0,
      extraAdultPrice:0, extraChildPrice:0,
      extraWaiterPrice:0, extraKitchenPrice:0, extraAnimatorPrice:0,
      includesTableware:true, includesLinen:true, includesCoffee:true
    },
    {
      id:'casamiento', name:'Casamientos', kind:'general', active:true,
      durationHours:6, extraHourPrice:0,
      includedWaiters:3, includedKitchen:1, includedAnimators:0,
      maxAdults:100, maxChildren:0,
      extraAdultPrice:0, extraChildPrice:0,
      extraWaiterPrice:0, extraKitchenPrice:0, extraAnimatorPrice:0,
      includesTableware:true, includesLinen:true, includesCoffee:true
    },
    {
      id:'quince', name:'Cumple de 15', kind:'general', active:true,
      durationHours:6, extraHourPrice:0,
      includedWaiters:3, includedKitchen:1, includedAnimators:0,
      maxAdults:100, maxChildren:0,
      extraAdultPrice:0, extraChildPrice:0,
      extraWaiterPrice:0, extraKitchenPrice:0, extraAnimatorPrice:0,
      includesTableware:true, includesLinen:true, includesCoffee:true
    }
  ];
}

function ensureTypes45(){
  const s=SALON45();
  if(!s)return [];
  if(!Array.isArray(s.eventTypes)||!s.eventTypes.length){
    s.eventTypes=defaultTypes45();
  } else {
    // Completa nuevos campos sin borrar configuraciones existentes.
    s.eventTypes=s.eventTypes.map((x,i)=>({
      durationHours:4, extraHourPrice:0,
      includedWaiters:0, includedKitchen:0, includedAnimators:0,
      maxAdults:0, maxChildren:0,
      extraAdultPrice:0, extraChildPrice:0,
      extraWaiterPrice:0, extraKitchenPrice:0, extraAnimatorPrice:0,
      includesTableware:true, includesLinen:true, includesCoffee:true,
      active:true,
      ...x,
      id:x.id||('tipo_'+i+'_'+Date.now())
    }));
  }
  return s.eventTypes;
}
ensureTypes45();

function type45(id){
  return ensureTypes45().find(x=>x.id===id) || ensureTypes45()[0];
}
function uid45(){
  return 'evt_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
function checked45(v){return v?'checked':'';}

function addHours45(start,duration,extra){
  if(!start)return '';
  const [h,m]=String(start).split(':').map(Number);
  if(!Number.isFinite(h)||!Number.isFinite(m))return '';
  let mins=h*60+m+Math.round((N45(duration)+N45(extra))*60);
  mins=((mins%1440)+1440)%1440;
  return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
}

// ------------------------------------------------------------
// NAVEGACIÓN ORDENADA Y MI SALÓN SIEMPRE A LA VISTA
// ------------------------------------------------------------
function nav45(v,label,icon){
  const active=view===v?'primary':'secondary';
  return `<button class="${active} small" onclick="view='${v}';renderSalonShell()">${icon} ${label}</button>`;
}
function addTopNav45(){
  const c=document.querySelector('#content');
  if(!c || document.querySelector('#salon-top-nav45'))return;
  const bar=document.createElement('div');
  bar.id='salon-top-nav45';
  bar.className='card';
  bar.style.marginBottom='14px';
  bar.innerHTML=`
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${nav45('dashboard','Inicio','🏠')}
      ${nav45('calendar','Agenda','📅')}
      ${nav45('staff','Personal','👥')}
      ${nav45('finance','Finanzas','💰')}
      ${nav45('stock','Stock','📦')}
      ${nav45('suppliers','Proveedores','🚚')}
      ${nav45('profile','Mi salón','⚙️')}
    </div>`;
  c.insertBefore(bar,c.firstChild);
}

// ------------------------------------------------------------
// MI SALÓN - CONFIGURACIÓN DE TIPOS DE EVENTO
// ------------------------------------------------------------
function summaryType45(t){
  const inc=[
    `${N45(t.includedWaiters)} mozo${N45(t.includedWaiters)===1?'':'s'}`,
    `${N45(t.includedKitchen)} cocina`,
    `${N45(t.includedAnimators)} animador${N45(t.includedAnimators)===1?'':'es'}`
  ].join(' · ');
  return `${inc} · ${N45(t.durationHours)} h`;
}

window.openEventType45=function(id=''){
  const existing=id?type45(id):null;
  const t=existing||{
    id:'',name:'',kind:'general',active:true,durationHours:4,extraHourPrice:0,
    includedWaiters:0,includedKitchen:0,includedAnimators:0,
    maxAdults:0,maxChildren:0,extraAdultPrice:0,extraChildPrice:0,
    extraWaiterPrice:0,extraKitchenPrice:0,extraAnimatorPrice:0,
    includesTableware:true,includesLinen:true,includesCoffee:true
  };

  showModal(`
    <div class="modal-title">
      <div><h2>${existing?'Editar':'Agregar'} tipo de evento</h2><p>Esta configuración se usa automáticamente en las reservas.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="type45form">
      <div class="form-grid">
        <div class="field span2"><label>Nombre del tipo de evento</label><input name="name" required value="${esc(t.name||'')}"></div>
        <div class="field">
          <label>Modalidad</label>
          <select name="kind">
            <option value="children" ${t.kind==='children'?'selected':''}>Infantil</option>
            <option value="adult" ${t.kind==='adult'?'selected':''}>Adultos</option>
            <option value="general" ${t.kind==='general'?'selected':''}>General / Social</option>
          </select>
        </div>
        <div class="field"><label>Duración base (horas)</label><input name="durationHours" type="number" min="1" step="0.5" value="${N45(t.durationHours)||4}"></div>
        <div class="field"><label>Costo por hora extra</label><input name="extraHourPrice" type="number" min="0" value="${N45(t.extraHourPrice)}"></div>
      </div>

      <div class="card" style="margin-top:12px">
        <h3>Personal incluido</h3>
        <div class="form-grid">
          <div class="field"><label>Cantidad de mozos</label><input name="includedWaiters" type="number" min="0" value="${N45(t.includedWaiters)}"></div>
          <div class="field"><label>Cantidad de cocineros / cocina</label><input name="includedKitchen" type="number" min="0" value="${N45(t.includedKitchen)}"></div>
          <div class="field"><label>Cantidad de animadores</label><input name="includedAnimators" type="number" min="0" value="${N45(t.includedAnimators)}"></div>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h3>Costo de personal adicional</h3>
        <div class="form-grid">
          <div class="field"><label>Mozo adicional</label><input name="extraWaiterPrice" type="number" min="0" value="${N45(t.extraWaiterPrice)}"></div>
          <div class="field"><label>Cocinero adicional</label><input name="extraKitchenPrice" type="number" min="0" value="${N45(t.extraKitchenPrice)}"></div>
          <div class="field"><label>Animador adicional</label><input name="extraAnimatorPrice" type="number" min="0" value="${N45(t.extraAnimatorPrice)}"></div>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h3>Cantidad máxima incluida</h3>
        <div class="form-grid">
          <div class="field">
            <label>Adultos máximos</label>
            <input name="maxAdults" type="number" min="0" value="${N45(t.maxAdults)}">
          </div>
          <div class="field">
            <label>Costo por adulto que excede el máximo</label>
            <input name="extraAdultPrice" type="number" min="0" value="${N45(t.extraAdultPrice)}">
          </div>
          <div class="field">
            <label>Niños máximos</label>
            <input name="maxChildren" type="number" min="0" value="${N45(t.maxChildren)}">
          </div>
          <div class="field">
            <label>Costo por niño que excede el máximo</label>
            <input name="extraChildPrice" type="number" min="0" value="${N45(t.extraChildPrice)}">
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h3>Servicios incluidos</h3>
        <div class="form-grid">
          <label class="check-card"><input name="includesTableware" type="checkbox" ${checked45(t.includesTableware)}><span><b>Vajilla</b></span></label>
          <label class="check-card"><input name="includesLinen" type="checkbox" ${checked45(t.includesLinen)}><span><b>Mantelería</b></span></label>
          <label class="check-card"><input name="includesCoffee" type="checkbox" ${checked45(t.includesCoffee)}><span><b>Cafetería</b></span></label>
          <label class="check-card"><input name="active" type="checkbox" ${checked45(t.active!==false)}><span><b>Tipo de evento activo</b></span></label>
        </div>
      </div>

      <div class="form-actions">
        <button class="primary">Guardar tipo de evento</button>
      </div>
    </form>
  `);

  document.querySelector('#type45form').onsubmit=e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const obj={
      id:existing?.id||uid45(),
      name:String(f.get('name')||'').trim(),
      kind:String(f.get('kind')||'general'),
      durationHours:N45(f.get('durationHours')),
      extraHourPrice:N45(f.get('extraHourPrice')),
      includedWaiters:N45(f.get('includedWaiters')),
      includedKitchen:N45(f.get('includedKitchen')),
      includedAnimators:N45(f.get('includedAnimators')),
      extraWaiterPrice:N45(f.get('extraWaiterPrice')),
      extraKitchenPrice:N45(f.get('extraKitchenPrice')),
      extraAnimatorPrice:N45(f.get('extraAnimatorPrice')),
      maxAdults:N45(f.get('maxAdults')),
      maxChildren:N45(f.get('maxChildren')),
      extraAdultPrice:N45(f.get('extraAdultPrice')),
      extraChildPrice:N45(f.get('extraChildPrice')),
      includesTableware:f.has('includesTableware'),
      includesLinen:f.has('includesLinen'),
      includesCoffee:f.has('includesCoffee'),
      active:f.has('active')
    };
    const arr=ensureTypes45();
    if(existing){
      const ix=arr.findIndex(x=>x.id===existing.id);
      if(ix>=0)arr[ix]=obj;
    }else arr.push(obj);
    save(); closeModal(); renderSalonShell(); toast('Tipo de evento guardado');
  };
};

window.deleteEventType45=function(id){
  const arr=ensureTypes45();
  const t=arr.find(x=>x.id===id);
  if(!t)return;
  if(['infantil','adulto','social','casamiento','quince'].includes(id)){
    t.active=false;
    save(); renderSalonShell(); toast('Tipo desactivado');
    return;
  }
  if(!confirm(`¿Eliminar "${t.name}"?`))return;
  SALON45().eventTypes=arr.filter(x=>x.id!==id);
  save(); renderSalonShell();
};

function appendTypesConfig45(){
  const content=document.querySelector('#content');
  if(!content || document.querySelector('#event-types45'))return;
  const types=ensureTypes45();

  const card=document.createElement('div');
  card.id='event-types45';
  card.className='card';
  card.style.marginTop='16px';
  card.innerHTML=`
    <div class="section-title">
      <div>
        <h3>🎉 Tipos de evento y reservas</h3>
        <small class="muted">Cada salón define qué incluye cada evento, duración, máximos y adicionales.</small>
      </div>
      <button class="primary" onclick="openEventType45()">+ Agregar tipo de evento</button>
    </div>

    <div style="display:grid;gap:10px">
      ${types.map(t=>`
        <div class="card" style="margin:0;padding:12px;${t.active===false?'opacity:.55':''}">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
            <div>
              <b>${esc(t.name)}</b>
              <small style="display:block;margin-top:3px">${summaryType45(t)}</small>
              <small style="display:block">
                Máx. adultos ${N45(t.maxAdults)} · Máx. niños ${N45(t.maxChildren)}
                · Vajilla ${t.includesTableware?'✓':'—'} · Mantelería ${t.includesLinen?'✓':'—'} · Cafetería ${t.includesCoffee?'✓':'—'}
              </small>
            </div>
            <div style="display:flex;gap:6px">
              <button class="secondary small" onclick="openEventType45('${t.id}')">Editar</button>
              <button class="ghost small" onclick="deleteEventType45('${t.id}')">${['infantil','adulto','social','casamiento','quince'].includes(t.id)?(t.active===false?'Desactivado':'Desactivar'):'Borrar'}</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  content.appendChild(card);
}

// ------------------------------------------------------------
// RESERVA - NUEVO BLOQUE POR TIPO
// ------------------------------------------------------------
const oldOpen45=window.openEventFormV44 || window.openEventForm;

window.openEventFormV45=function(eid=''){
  oldOpen45(eid);

  const form=document.querySelector('#ev30');
  if(!form)return;

  const e=eid?EV45(eid):null;
  const types=ensureTypes45().filter(x=>x.active!==false);
  if(!types.length)return;

  // Oculta campos viejos que ahora controla V45.
  const oldChild=form.querySelector('[name="child"]')?.closest('.field');
  const oldAge=form.querySelector('[name="age"]')?.closest('.field');
  const oldStart=form.querySelector('[name="start"]')?.closest('.field');
  const oldEnd=form.querySelector('[name="end"]')?.closest('.field');
  const oldGuests=form.querySelector('[name="guests"]')?.closest('.field');
  const oldSplit=document.querySelector('#guest-split41');
  const oldGeneric=document.querySelector('#generic-staff44');
  [oldChild,oldAge,oldStart,oldEnd,oldGuests,oldSplit,oldGeneric].forEach(x=>{if(x)x.style.display='none';});

  // Campos hidden requeridos por formularios anteriores.
  const childInput=form.querySelector('[name="child"]');
  const startInput=form.querySelector('[name="start"]');
  const endInput=form.querySelector('[name="end"]');
  if(childInput)childInput.required=false;
  if(startInput)startInput.required=false;
  if(endInput)endInput.required=false;

  const firstGrid=form.querySelector('.form-grid');
  if(!firstGrid || document.querySelector('#reservation45'))return;

  const wrap=document.createElement('div');
  wrap.id='reservation45';
  wrap.className='card span2';
  wrap.style.margin='0 0 12px 0';
  wrap.innerHTML=`
    <div class="section-title">
      <div><h3>Datos del evento</h3><small class="muted">La duración y los valores se toman de la configuración de Mi salón.</small></div>
    </div>

    <div class="form-grid">
      <div class="field">
        <label>Tipo de evento</label>
        <select id="eventType45">
          ${types.map(t=>`<option value="${t.id}" ${(e?.eventTypeId||'infantil')===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>Nombre / homenajeado</label>
        <input id="eventName45" value="${esc(e?.eventName||e?.child||'')}" required>
      </div>

      <div class="field" id="birthdayWrap45">
        <label>Fecha de cumpleaños</label>
        <input id="birthday45" type="date" value="${esc(e?.birthdayDate||'')}">
      </div>

      <div class="field">
        <label>Hora de inicio</label>
        <input id="start45" type="time" required value="${esc(e?.start||'')}">
      </div>

      <div class="field">
        <label>Duración programada</label>
        <input id="duration45" readonly>
      </div>

      <div class="field">
        <label>Horas extra</label>
        <input id="extraHours45" type="number" min="0" step="0.5" value="${N45(e?.extraHours)}">
      </div>

      <div class="field">
        <label>Hora estimada de finalización</label>
        <input id="end45" readonly>
      </div>

      <div class="field">
        <label>Adultos</label>
        <input id="adults45" type="number" min="0" value="${N45(e?.adults)}">
      </div>

      <div class="field" id="childrenWrap45">
        <label>Niños</label>
        <input id="children45" type="number" min="0" value="${N45(e?.children)}">
      </div>
    </div>

    <div id="included45" class="admin-notice" style="margin-top:10px"></div>

    <div class="card" style="margin-top:12px">
      <h3>Personal adicional</h3>
      <small class="muted">No se muestran nombres. Elegí solamente cantidad adicional.</small>
      <div class="form-grid" style="margin-top:10px">
        <div class="field">
          <label>Mozo adicional</label>
          <input id="extraWaiters45" type="number" min="0" value="${N45(e?.extraWaiters)}">
        </div>
        <div class="field">
          <label>Cocinero adicional</label>
          <input id="extraKitchen45" type="number" min="0" value="${N45(e?.extraKitchen)}">
        </div>
        <div class="field">
          <label>Animador adicional</label>
          <input id="extraAnimators45" type="number" min="0" value="${N45(e?.extraAnimators)}">
        </div>
      </div>
    </div>

    <div id="calc45" class="admin-notice" style="margin-top:10px"></div>
  `;
  firstGrid.parentNode.insertBefore(wrap,firstGrid);

  const $45=id=>document.querySelector(id);

  function selected45(){return type45($45('#eventType45').value);}
  function calculate45(){
    const t=selected45();
    const adults=N45($45('#adults45').value);
    const kids=N45($45('#children45').value);
    const ew=N45($45('#extraWaiters45').value);
    const ek=N45($45('#extraKitchen45').value);
    const ea=N45($45('#extraAnimators45').value);
    const eh=N45($45('#extraHours45').value);

    const extraAdultQty=Math.max(0,adults-N45(t.maxAdults));
    const extraChildQty=Math.max(0,kids-N45(t.maxChildren));
    const extraAdultTotal=extraAdultQty*N45(t.extraAdultPrice);
    const extraChildTotal=extraChildQty*N45(t.extraChildPrice);
    const waiterTotal=ew*N45(t.extraWaiterPrice);
    const kitchenTotal=ek*N45(t.extraKitchenPrice);
    const animatorTotal=ea*N45(t.extraAnimatorPrice);
    const extraHourTotal=eh*N45(t.extraHourPrice);
    const typeExtrasTotal=extraAdultTotal+extraChildTotal+waiterTotal+kitchenTotal+animatorTotal+extraHourTotal;

    $45('#duration45').value=`${N45(t.durationHours)} horas`;
    $45('#end45').value=addHours45($45('#start45').value,t.durationHours,eh);

    const isChild=t.kind==='children';
    $45('#childrenWrap45').style.display=isChild?'':'none';
    $45('#birthdayWrap45').style.display=(isChild||t.id==='adulto'||t.id==='quince')?'':'none';
    if(!isChild && t.kind==='adult') $45('#children45').value=0;

    const includes=[];
    if(t.includesTableware)includes.push('Vajilla');
    if(t.includesLinen)includes.push('Mantelería');
    if(t.includesCoffee)includes.push('Cafetería');

    $45('#included45').innerHTML=`
      <span>✅</span>
      <div>
        <b>${esc(t.name)} incluye:</b>
        <div>${N45(t.includedWaiters)} mozo${N45(t.includedWaiters)===1?'':'s'} · ${N45(t.includedKitchen)} cocina · ${N45(t.includedAnimators)} animador${N45(t.includedAnimators)===1?'':'es'} · ${N45(t.durationHours)} horas</div>
        <small>${includes.length?includes.join(' · '):'Sin servicios adicionales marcados'}</small>
      </div>`;

    $45('#calc45').innerHTML=`
      <span>💰</span>
      <div>
        <b>Adicionales calculados</b>
        <div>Adultos excedidos: ${extraAdultQty} × ${money(t.extraAdultPrice)} = <b>${money(extraAdultTotal)}</b></div>
        ${isChild?`<div>Niños excedidos: ${extraChildQty} × ${money(t.extraChildPrice)} = <b>${money(extraChildTotal)}</b></div>`:''}
        <div>Mozo adicional: ${ew} × ${money(t.extraWaiterPrice)} = <b>${money(waiterTotal)}</b></div>
        <div>Cocinero adicional: ${ek} × ${money(t.extraKitchenPrice)} = <b>${money(kitchenTotal)}</b></div>
        <div>Animador adicional: ${ea} × ${money(t.extraAnimatorPrice)} = <b>${money(animatorTotal)}</b></div>
        <div>Horas extra: ${eh} × ${money(t.extraHourPrice)} = <b>${money(extraHourTotal)}</b></div>
        <div style="margin-top:5px"><b>Total adicionales del tipo de evento: ${money(typeExtrasTotal)}</b></div>
      </div>`;

    return {t,adults,kids,ew,ek,ea,eh,extraAdultQty,extraChildQty,extraAdultTotal,extraChildTotal,waiterTotal,kitchenTotal,animatorTotal,extraHourTotal,typeExtrasTotal};
  }

  ['#eventType45','#start45','#extraHours45','#adults45','#children45','#extraWaiters45','#extraKitchen45','#extraAnimators45']
    .forEach(id=>$45(id)?.addEventListener('input',calculate45));
  $45('#eventType45')?.addEventListener('change',calculate45);
  calculate45();

  const oldSubmit=form.onsubmit;
  form.onsubmit=function(ev){
    const c=calculate45();

    // Completa campos requeridos del flujo anterior.
    if(childInput)childInput.value=$45('#eventName45').value||'Evento';
    if(startInput)startInput.value=$45('#start45').value;
    if(endInput)endInput.value=$45('#end45').value;

    let guest=form.querySelector('[name="guests"]');
    if(!guest){
      guest=document.createElement('input'); guest.type='hidden'; guest.name='guests'; form.appendChild(guest);
    }
    guest.value=String(c.adults+c.kids);

    const result=oldSubmit?oldSubmit.call(form,ev):undefined;

    setTimeout(()=>{
      let target=eid?EV45(eid):(data.events||[])
        .filter(x=>x.salonId===SID45())
        .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
      if(!target)return;

      // Evita personal nombrado en reserva.
      data.assignments=(data.assignments||[]).filter(a=>a.eventId!==target.id);

      target.eventTypeId=c.t.id;
      target.eventTypeName=c.t.name;
      target.eventKind=c.t.kind;
      target.eventName=$45('#eventName45').value;
      target.child=target.eventName;
      target.birthdayDate=$45('#birthday45').value;
      target.start=$45('#start45').value;
      target.end=$45('#end45').value;
      target.durationHours=N45(c.t.durationHours);
      target.extraHours=c.eh;
      target.adults=c.adults;
      target.children=c.kids;
      target.guests=c.adults+c.kids;

      target.includedWaiters=N45(c.t.includedWaiters);
      target.includedKitchen=N45(c.t.includedKitchen);
      target.includedAnimators=N45(c.t.includedAnimators);
      target.includesTableware=!!c.t.includesTableware;
      target.includesLinen=!!c.t.includesLinen;
      target.includesCoffee=!!c.t.includesCoffee;

      target.extraWaiters=c.ew;
      target.extraKitchen=c.ek;
      target.extraAnimators=c.ea;
      target.extraAdultQty=c.extraAdultQty;
      target.extraChildQty=c.extraChildQty;
      target.extraAdultTotal=c.extraAdultTotal;
      target.extraChildTotal=c.extraChildTotal;
      target.extraWaiterTotal=c.waiterTotal;
      target.extraKitchenTotal=c.kitchenTotal;
      target.extraAnimatorTotal=c.animatorTotal;
      target.extraHourTotal=c.extraHourTotal;
      target.typeExtrasTotal=c.typeExtrasTotal;

      // Totales: base + adicionales generales + stock + adicionales del tipo.
      const base=N45(target.basePrice??target.baseTotal);
      const genericExtras=N45(target.extrasTotal);
      const stock=N45(target.stockItemsTotal);
      target.staffClientChargeTotal=c.waiterTotal+c.kitchenTotal+c.animatorTotal;
      target.total=base+genericExtras+stock+c.typeExtrasTotal;
      target.paid=N45(target.deposit);
      target.balance=Math.max(0,target.total-N45(target.paid));

      // Compatibilidad: apaga cargos automáticos viejos V43/V44.
      target.genericExtraStaffTotal=0;
      target.autoExtraStaffTotal=0;
      target.autoExtraWaiterTotal=0;
      target.autoExtraAnimatorTotal=0;

      save();
    },500);

    return result;
  };
};

// ------------------------------------------------------------
// DETALLE DE RESERVA
// ------------------------------------------------------------
const oldView45=window.openEventV44 || window.openEvent;
window.openEventV45=function(eid){
  oldView45(eid);
  setTimeout(()=>{
    const e=EV45(eid);
    const modal=document.querySelector('#modal-body');
    if(!e||!modal||modal.querySelector('#event-type-detail45'))return;

    // Oculta tarjetas heredadas de personal automático para evitar duplicados.
    ['#generic-staff-detail44','#auto-staff-card43','#party-base-detail41','#guest-extra-detail42']
      .forEach(sel=>{const x=modal.querySelector(sel);if(x)x.style.display='none';});

    const card=document.createElement('div');
    card.id='event-type-detail45';
    card.className='card';
    card.style.marginTop='14px';
    card.innerHTML=`
      <h3>${esc(e.eventTypeName||'Evento')}</h3>
      <div><b>${esc(e.eventName||e.child||'')}</b>${e.birthdayDate?` · Cumpleaños ${esc(e.birthdayDate)}`:''}</div>
      <div style="margin-top:5px">Horario: <b>${esc(e.start||'')} a ${esc(e.end||'')}</b> · Duración base ${N45(e.durationHours)} h${N45(e.extraHours)>0?` + ${N45(e.extraHours)} h extra`:''}</div>
      <div style="margin-top:5px">Invitados: <b>${N45(e.adults)} adultos</b>${e.eventKind==='children'?` · <b>${N45(e.children)} niños</b>`:''}</div>
      <div style="margin-top:8px"><b>Incluye:</b> ${N45(e.includedWaiters)} mozos · ${N45(e.includedKitchen)} cocina · ${N45(e.includedAnimators)} animadores
        ${e.includesTableware?' · Vajilla':''}${e.includesLinen?' · Mantelería':''}${e.includesCoffee?' · Cafetería':''}
      </div>
      <hr style="margin:10px 0;border:none;border-top:1px solid #ddd">
      <div>Adultos adicionales: <b>${N45(e.extraAdultQty)}</b> = ${money(e.extraAdultTotal||0)}</div>
      ${e.eventKind==='children'?`<div>Niños adicionales: <b>${N45(e.extraChildQty)}</b> = ${money(e.extraChildTotal||0)}</div>`:''}
      <div>Mozo adicional: <b>${N45(e.extraWaiters)}</b> = ${money(e.extraWaiterTotal||0)}</div>
      <div>Cocina adicional: <b>${N45(e.extraKitchen)}</b> = ${money(e.extraKitchenTotal||0)}</div>
      <div>Animador adicional: <b>${N45(e.extraAnimators)}</b> = ${money(e.extraAnimatorTotal||0)}</div>
      <div>Horas extra: <b>${N45(e.extraHours)}</b> = ${money(e.extraHourTotal||0)}</div>
    `;
    modal.appendChild(card);
  },0);
};

// ------------------------------------------------------------
// WRAPPERS FINALES
// ------------------------------------------------------------
const previousProfile45=window.renderProfileV43 || window.renderProfileV42 || window.renderProfile;
window.renderProfileV45=function(){
  previousProfile45();
  setTimeout(()=>{
    addTopNav45();
    appendTypesConfig45();
  },0);
};

window.openEventForm=window.openEventFormV45;
window.openEventFormV44=window.openEventFormV45;
window.openEvent=window.openEventV45;
window.renderProfile=window.renderProfileV45;

// Asegura barra superior en todas las pantallas del salón.
const previousShell45=window.renderSalonShell;
if(typeof previousShell45==='function'){
  window.renderSalonShell=function(){
    const r=previousShell45.apply(this,arguments);
    setTimeout(addTopNav45,0);
    return r;
  };
}

// Intercepta profile en la cadena de render actual.
const previousRenderView45=renderSalonView;
renderSalonView=function(){
  if(view==='profile')return renderProfileV45();
  const r=previousRenderView45();
  setTimeout(addTopNav45,0);
  return r;
};

})();


// ============================================================
// V46 - IMPRIMIR ESTADO DE RESERVA + RECIBO DE PAGO / PDF
// ============================================================
(function(){
'use strict';

const SID46=()=>session?.salonId;
const SALON46=()=>salon();
const EVT46=eid=>(data.events||[]).find(e=>e.id===eid&&e.salonId===SID46());
const MOV46=eid=>(data.movements||[]).filter(m=>m.salonId===SID46()&&m.eventId===eid);
const N46=v=>Number(v||0);

function esc46(v){
  return String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function money46(v){
  try{return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(N46(v));}
  catch(e){return '$ '+N46(v).toLocaleString('es-AR');}
}
function paymentMovements46(eid){
  return MOV46(eid).filter(m=>{
    const t=String(m.type||'').toLowerCase();
    const c=String(m.category||'').toLowerCase();
    return t==='ingreso' || t==='cobro' || c.includes('cobro') || c.includes('seña') || c.includes('cliente');
  }).sort((a,b)=>String(a.createdAt||a.movementDate||'').localeCompare(String(b.createdAt||b.movementDate||'')));
}
function salonInfo46(){
  const s=SALON46()||{};
  return {
    name:s.name||'FiestaControl',
    phone:s.phone||'',
    email:s.email||'',
    address:s.address||''
  };
}
function openPrintable46(title,body,autoPrint=false){
  const w=window.open('','_blank','width=980,height=760');
  if(!w)return toast('El navegador bloqueó la ventana de impresión');
  w.document.open();
  w.document.write(`<!doctype html>
  <html lang="es"><head><meta charset="utf-8"><title>${esc46(title)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;background:#fff}
    .page{max-width:900px;margin:0 auto;padding:28px}
    .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}
    .head h1{font-size:24px;margin:0}.muted{color:#666;font-size:13px}.right{text-align:right}
    h2{font-size:18px;margin:22px 0 10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px}
    .row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #ddd}
    .total{font-size:18px;font-weight:bold;border-top:2px solid #111;margin-top:10px;padding-top:10px}
    table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
    .sign{margin-top:55px;display:grid;grid-template-columns:1fr 1fr;gap:60px}.line{border-top:1px solid #111;padding-top:6px;text-align:center;font-size:12px}
    .no-print{margin:0 auto 20px;max-width:900px;padding:12px;display:flex;gap:8px}
    button{padding:10px 14px;border:1px solid #bbb;background:#fff;border-radius:8px;cursor:pointer}
    @media print{.no-print{display:none}.page{padding:0}.head{margin-top:0}@page{size:A4;margin:14mm}}
  </style></head><body>
  <div class="no-print"><button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button><button onclick="window.close()">Cerrar</button></div>
  <div class="page">${body}</div>
  </body></html>`);
  w.document.close();
  if(autoPrint)setTimeout(()=>{try{w.focus();w.print();}catch(e){}},350);
  return w;
}

window.printReservationStatus46=function(eid,autoPrint=false){
  const e=EVT46(eid); if(!e)return;
  const s=salonInfo46();
  const pays=paymentMovements46(eid);
  const paid=N46(e.paid??e.deposit);
  const total=N46(e.total);
  const balance=Math.max(0,total-paid);

  const included=[
    e.includesTableware?'Vajilla':'',
    e.includesLinen?'Mantelería':'',
    e.includesCoffee?'Cafetería':''
  ].filter(Boolean);

  const body=`
    <div class="head">
      <div>
        <h1>${esc46(s.name)}</h1>
        <div class="muted">${esc46(s.address)}</div>
        <div class="muted">${esc46(s.phone)} ${s.email?'· '+esc46(s.email):''}</div>
      </div>
      <div class="right"><b>ESTADO DE RESERVA</b><div class="muted">Emitido ${new Date().toLocaleString('es-AR')}</div></div>
    </div>

    <h2>Datos del evento</h2>
    <div class="grid">
      <div><b>Tipo:</b> ${esc46(e.eventTypeName||'Evento')}</div>
      <div><b>Fecha:</b> ${esc46(e.date||'')}</div>
      <div><b>Nombre:</b> ${esc46(e.eventName||e.child||'')}</div>
      <div><b>Fecha de cumpleaños:</b> ${esc46(e.birthdayDate||'—')}</div>
      <div><b>Horario:</b> ${esc46(e.start||'')} a ${esc46(e.end||'')}</div>
      <div><b>Duración:</b> ${N46(e.durationHours)} h${N46(e.extraHours)>0?' + '+N46(e.extraHours)+' h extra':''}</div>
      <div><b>Adultos:</b> ${N46(e.adults)}</div>
      <div><b>Niños:</b> ${N46(e.children)}</div>
      <div><b>Responsable:</b> ${esc46(e.client||'')}</div>
      <div><b>Estado:</b> ${esc46(e.status||'')}</div>
    </div>

    <h2>Incluido</h2>
    <div class="row"><span>Personal base</span><b>${N46(e.includedWaiters)} mozo(s) · ${N46(e.includedKitchen)} cocina · ${N46(e.includedAnimators)} animador(es)</b></div>
    <div class="row"><span>Servicios</span><b>${included.length?included.join(' · '):'—'}</b></div>

    <h2>Adicionales</h2>
    <div class="row"><span>Adultos adicionales (${N46(e.extraAdultQty)})</span><b>${money46(e.extraAdultTotal)}</b></div>
    <div class="row"><span>Niños adicionales (${N46(e.extraChildQty)})</span><b>${money46(e.extraChildTotal)}</b></div>
    <div class="row"><span>Mozo adicional (${N46(e.extraWaiters)})</span><b>${money46(e.extraWaiterTotal)}</b></div>
    <div class="row"><span>Cocina adicional (${N46(e.extraKitchen)})</span><b>${money46(e.extraKitchenTotal)}</b></div>
    <div class="row"><span>Animador adicional (${N46(e.extraAnimators)})</span><b>${money46(e.extraAnimatorTotal)}</b></div>
    <div class="row"><span>Horas extra (${N46(e.extraHours)})</span><b>${money46(e.extraHourTotal)}</b></div>

    <h2>Estado económico</h2>
    <div class="row"><span>Total de la fiesta</span><b>${money46(total)}</b></div>
    <div class="row"><span>Total pagado</span><b>${money46(paid)}</b></div>
    <div class="row total"><span>Saldo pendiente</span><b>${money46(balance)}</b></div>

    <h2>Pagos registrados</h2>
    ${pays.length?`<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Importe</th></tr></thead><tbody>
      ${pays.map(m=>`<tr><td>${esc46(m.movementDate||'')}</td><td>${esc46(m.concept||'Pago')}</td><td>${esc46(m.method||'')}</td><td>${money46(m.amount)}</td></tr>`).join('')}
    </tbody></table>`:'<div class="muted">No hay pagos registrados.</div>'}

    <div class="sign"><div class="line">Firma del salón</div><div class="line">Firma del cliente</div></div>
  `;
  openPrintable46(`Estado reserva - ${e.eventName||e.child||'Evento'}`,body,autoPrint);
};

window.printReceipt46=function(eid,movementId,autoPrint=false){
  const e=EVT46(eid); if(!e)return;
  const m=(data.movements||[]).find(x=>x.id===movementId&&x.eventId===eid);
  if(!m)return toast('No se encontró el pago');
  const s=salonInfo46();
  const pays=paymentMovements46(eid);
  const paid=pays.reduce((a,x)=>a+N46(x.amount),0);
  const total=N46(e.total);
  const balance=Math.max(0,total-paid);

  const body=`
    <div class="head">
      <div>
        <h1>${esc46(s.name)}</h1>
        <div class="muted">${esc46(s.address)}</div>
        <div class="muted">${esc46(s.phone)} ${s.email?'· '+esc46(s.email):''}</div>
      </div>
      <div class="right"><b>RECIBO DE PAGO</b><div class="muted">N° ${esc46(String(m.id||'').slice(-10).toUpperCase())}</div></div>
    </div>

    <h2>Recibimos</h2>
    <div class="row"><span>Cliente</span><b>${esc46(e.client||'')}</b></div>
    <div class="row"><span>Evento</span><b>${esc46(e.eventTypeName||'Evento')} · ${esc46(e.eventName||e.child||'')}</b></div>
    <div class="row"><span>Fecha del evento</span><b>${esc46(e.date||'')}</b></div>
    <div class="row"><span>Fecha del pago</span><b>${esc46(m.movementDate||new Date().toISOString().slice(0,10))}</b></div>
    <div class="row"><span>Medio de pago</span><b>${esc46(m.method||'')}</b></div>
    ${m.reference?`<div class="row"><span>Referencia</span><b>${esc46(m.reference)}</b></div>`:''}
    <div class="row total"><span>Importe recibido</span><b>${money46(m.amount)}</b></div>

    <h2>Estado posterior al pago</h2>
    <div class="row"><span>Total de la fiesta</span><b>${money46(total)}</b></div>
    <div class="row"><span>Total abonado</span><b>${money46(paid)}</b></div>
    <div class="row total"><span>Saldo pendiente</span><b>${money46(balance)}</b></div>

    <div class="muted" style="margin-top:18px">Este recibo corresponde al pago registrado en FiestaControl.</div>
    <div class="sign"><div class="line">Firma / sello del salón</div><div class="line">Aclaración del cliente</div></div>
  `;
  openPrintable46(`Recibo - ${e.eventName||e.child||'Evento'} - ${m.movementDate||''}`,body,autoPrint);
};

// ------------------------------------------------------------
// BOTÓN "IMPRIMIR ESTADO" EN CADA RESERVA
// ------------------------------------------------------------
const oldOpenEvent46=window.openEventV45 || window.openEvent;
window.openEventV46=function(eid){
  oldOpenEvent46(eid);
  setTimeout(()=>{
    const modal=document.querySelector('#modal-body');
    if(!modal || modal.querySelector('#print-status46'))return;
    const toolbar=modal.querySelector('.toolbar');
    const btn=document.createElement('button');
    btn.id='print-status46';
    btn.className='secondary';
    btn.innerHTML='🖨 Imprimir estado';
    btn.onclick=()=>printReservationStatus46(eid,true);
    if(toolbar)toolbar.appendChild(btn);
    else{
      const top=modal.querySelector('.modal-title');
      if(top)top.insertAdjacentElement('afterend',btn);
    }
  },50);
};
window.openEvent=window.openEventV46;

// ------------------------------------------------------------
// COBRO: después de guardar muestra opciones de recibo.
// ------------------------------------------------------------
window.openPaymentV30=function(eid){
  const e=EVT46(eid); if(!e)return;
  const balance=Math.max(0,N46(e.total)-N46(e.paid));
  if(balance<=0)return toast('La fiesta ya está totalmente cobrada');

  showModal(`
    <div class="modal-title">
      <div><h2>Registrar cobro</h2><p>${esc46(e.eventName||e.child||'Evento')} · Saldo ${money46(balance)}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="pay46">
      <div class="form-grid">
        <div class="field"><label>Importe</label><input name="amount" type="number" min="1" max="${balance}" value="${balance}" required></div>
        <div class="field"><label>Medio de pago</label>
          <select name="method"><option>Efectivo</option><option>Transferencia</option><option>Mercado Pago</option><option>Tarjeta</option><option>Otro</option></select>
        </div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
        <div class="field"><label>Referencia / comprobante</label><input name="reference" placeholder="Opcional"></div>
        <div class="field span2"><label>Concepto</label><input name="concept" value="Pago de reserva"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Registrar cobro</button>
      </div>
    </form>
  `);

  document.querySelector('#pay46').onsubmit=ev=>{
    ev.preventDefault();
    const f=Object.fromEntries(new FormData(ev.target));
    const amount=Math.min(N46(f.amount),Math.max(0,N46(e.total)-N46(e.paid)));
    if(amount<=0)return toast('Ingresá un importe válido');

    e.paid=N46(e.paid)+amount;
    e.balance=Math.max(0,N46(e.total)-N46(e.paid));

    const movement={
      id:id(),salonId:SID46(),eventId:e.id,
      type:'Ingreso',category:'Cobro de reserva',
      concept:String(f.concept||'Pago de reserva'),
      amount,method:f.method,
      reference:f.reference||'',
      movementDate:f.date,
      createdAt:new Date().toISOString()
    };
    data.movements=data.movements||[];
    data.movements.push(movement);
    save();

    showModal(`
      <div class="modal-title">
        <div><h2>✅ Pago registrado</h2><p>${esc46(e.eventName||e.child||'Evento')}</p></div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>
      <div class="grid stats">
        <div class="card stat"><small>Pago recibido</small><strong>${money46(amount)}</strong></div>
        <div class="card stat"><small>Saldo pendiente</small><strong>${money46(e.balance)}</strong></div>
      </div>
      <div class="card" style="margin-top:14px">
        <div><b>Medio:</b> ${esc46(f.method)}</div>
        <div><b>Fecha:</b> ${esc46(f.date)}</div>
        ${f.reference?`<div><b>Referencia:</b> ${esc46(f.reference)}</div>`:''}
      </div>
      <div class="form-actions" style="margin-top:16px">
        <button class="secondary" onclick="printReceipt46('${e.id}','${movement.id}',true)">🖨 Imprimir recibo</button>
        <button class="primary" onclick="printReceipt46('${e.id}','${movement.id}',true)">📄 Generar PDF</button>
        <button class="ghost" onclick="openEvent('${e.id}')">Ver fiesta</button>
      </div>
      <small class="muted">“Generar PDF” abre el recibo listo para elegir “Guardar como PDF” en la ventana de impresión del navegador.</small>
    `);
  };
};

window.openPayment=window.openPaymentV30;

})();


// ============================================================
// V47 - CORRECCIÓN CONTABLE: PAGOS SIN DUPLICADOS
// ============================================================
(function(){
'use strict';

const SID47=()=>session?.salonId;
const EVT47=eid=>(data.events||[]).find(e=>e.id===eid&&e.salonId===SID47());
const N47=v=>Number(v||0);

function norm47(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function isDepositLike47(m){
  const cat=norm47(m.category);
  const con=norm47(m.concept);
  const sk=String(m.sourceKey||'');
  return cat.includes('sena') || con.includes('sena') ||
         sk.includes(':deposit:') || sk.startsWith('v30:deposit:');
}
function isPayment47(m){
  if(!m || m.salonId!==SID47())return false;
  const t=norm47(m.type);
  const c=norm47(m.category);
  return t==='ingreso' && (
    c.includes('cobro') ||
    c.includes('sena') ||
    c.includes('reserva') ||
    String(m.sourceKey||'').startsWith('v47:payment:')
  );
}

// Deja una sola seña por reserva y recalcula e.paid desde movimientos reales.
function normalizeEventPayments47(e){
  if(!e)return;

  data.movements=data.movements||[];

  const deposit=N47(e.deposit);
  const eventMovs=data.movements.filter(m=>m.eventId===e.id && m.salonId===SID47());

  // 1) Borra todas las representaciones viejas/duplicadas de seña.
  data.movements=data.movements.filter(m=>{
    if(m.eventId!==e.id || m.salonId!==SID47())return true;
    return !isDepositLike47(m);
  });

  // 2) Crea UNA única seña canónica si corresponde.
  if(deposit>0){
    data.movements.push({
      id:id(),
      salonId:SID47(),
      eventId:e.id,
      sourceKey:`v47:deposit:${e.id}`,
      type:'Ingreso',
      category:'Seña',
      concept:`Seña de reserva ${e.eventName||e.child||e.client||''}`,
      amount:deposit,
      method:e.depositMethod||'No especificado',
      movementDate:e.depositDate||e.createdAt?.slice?.(0,10)||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString()
    });
  }

  // 3) Quita duplicados exactos de cobros manuales.
  const seen=new Set();
  data.movements=data.movements.filter(m=>{
    if(m.eventId!==e.id || m.salonId!==SID47() || !isPayment47(m) || isDepositLike47(m))return true;

    // Los nuevos pagos V47 son únicos por sourceKey.
    if(String(m.sourceKey||'').startsWith('v47:payment:')){
      const key=String(m.sourceKey);
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }

    // Para movimientos heredados, evita la misma operación repetida.
    const key=[
      N47(m.amount),
      norm47(m.method),
      String(m.movementDate||''),
      norm47(m.reference||''),
      norm47(m.concept||'')
    ].join('|');

    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });

  // 4) paid = seña + cobros posteriores. Nunca se suma dos veces.
  const manualPaid=data.movements
    .filter(m=>m.eventId===e.id && m.salonId===SID47() && isPayment47(m) && !isDepositLike47(m))
    .reduce((s,m)=>s+N47(m.amount),0);

  e.paid=deposit+manualPaid;
  e.balance=Math.max(0,N47(e.total)-e.paid);
}

window.normalizeAllPayments47=function(){
  (data.events||[]).filter(e=>e.salonId===SID47()).forEach(normalizeEventPayments47);
};

// Normaliza al cargar la versión.
try{
  normalizeAllPayments47();
  save();
}catch(err){
  console.warn('V47 normalize',err);
}

// ------------------------------------------------------------
// NUEVO COBRO: una sola escritura, botón bloqueado al enviar.
// ------------------------------------------------------------
window.openPaymentV47=function(eid){
  const e=EVT47(eid); if(!e)return;

  normalizeEventPayments47(e);

  const balance=Math.max(0,N47(e.total)-N47(e.paid));
  if(balance<=0)return toast('La fiesta ya está totalmente cobrada');

  showModal(`
    <div class="modal-title">
      <div><h2>Registrar cobro</h2><p>${esc46(e.eventName||e.child||'Evento')} · Saldo ${money46(balance)}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="pay47">
      <div class="form-grid">
        <div class="field"><label>Importe</label><input name="amount" type="number" min="1" max="${balance}" value="${balance}" required></div>
        <div class="field"><label>Medio de pago</label>
          <select name="method"><option>Efectivo</option><option>Transferencia</option><option>Mercado Pago</option><option>Tarjeta</option><option>Otro</option></select>
        </div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
        <div class="field"><label>Referencia / comprobante</label><input name="reference" placeholder="Opcional"></div>
        <div class="field span2"><label>Concepto</label><input name="concept" value="Pago de reserva"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button id="savePay47" class="primary">Registrar cobro</button>
      </div>
    </form>
  `);

  let submitting=false;

  document.querySelector('#pay47').onsubmit=ev=>{
    ev.preventDefault();
    if(submitting)return;
    submitting=true;

    const btn=document.querySelector('#savePay47');
    if(btn){btn.disabled=true;btn.textContent='Registrando...';}

    const f=Object.fromEntries(new FormData(ev.target));
    const currentBalance=Math.max(0,N47(e.total)-N47(e.paid));
    const amount=Math.min(N47(f.amount),currentBalance);

    if(amount<=0){
      submitting=false;
      if(btn){btn.disabled=false;btn.textContent='Registrar cobro';}
      return toast('Ingresá un importe válido');
    }

    const movementId=id();
    const movement={
      id:movementId,
      salonId:SID47(),
      eventId:e.id,
      sourceKey:`v47:payment:${movementId}`,
      type:'Ingreso',
      category:'Cobro de reserva',
      concept:String(f.concept||'Pago de reserva'),
      amount,
      method:f.method,
      reference:f.reference||'',
      movementDate:f.date,
      createdAt:new Date().toISOString()
    };

    data.movements=data.movements||[];
    data.movements.push(movement);

    // Recalcula a partir de la contabilidad real: NO incrementa e.paid a mano.
    normalizeEventPayments47(e);
    save();

    showModal(`
      <div class="modal-title">
        <div><h2>✅ Pago registrado</h2><p>${esc46(e.eventName||e.child||'Evento')}</p></div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>
      <div class="grid stats">
        <div class="card stat"><small>Pago recibido</small><strong>${money46(amount)}</strong></div>
        <div class="card stat"><small>Total abonado</small><strong>${money46(e.paid)}</strong></div>
        <div class="card stat"><small>Saldo pendiente</small><strong>${money46(e.balance)}</strong></div>
      </div>
      <div class="form-actions" style="margin-top:16px">
        <button class="secondary" onclick="printReceipt46('${e.id}','${movementId}',true)">🖨 Imprimir recibo</button>
        <button class="primary" onclick="printReceipt46('${e.id}','${movementId}',true)">📄 Generar PDF</button>
        <button class="ghost" onclick="openEvent('${e.id}')">Ver fiesta</button>
      </div>
    `);
  };
};
window.openPayment=window.openPaymentV47;

// ------------------------------------------------------------
// IMPRESIÓN: usa contabilidad ya normalizada.
// ------------------------------------------------------------
const oldPrintStatus47=window.printReservationStatus46;
window.printReservationStatus46=function(eid,autoPrint=false){
  const e=EVT47(eid);
  if(e){
    normalizeEventPayments47(e);
    save();
  }
  return oldPrintStatus47(eid,autoPrint);
};

const oldReceipt47=window.printReceipt46;
window.printReceipt46=function(eid,movementId,autoPrint=false){
  const e=EVT47(eid);
  if(e){
    normalizeEventPayments47(e);
    save();
  }
  return oldReceipt47(eid,movementId,autoPrint);
};

// ------------------------------------------------------------
// FINANZAS / DETALLE: normaliza antes de renderizar.
// ------------------------------------------------------------
const oldFinance47=window.renderFinanceV38 || window.renderFinanceV36 || window.renderFinanceV35 || window.renderFinance;
window.renderFinanceV47=function(){
  normalizeAllPayments47();
  save();
  return oldFinance47();
};

const oldOpen47=window.openEventV46 || window.openEvent;
window.openEventV47=function(eid){
  const e=EVT47(eid);
  if(e){
    normalizeEventPayments47(e);
    save();
  }
  return oldOpen47(eid);
};
window.openEvent=window.openEventV47;

const oldView47=renderSalonView;
renderSalonView=function(){
  if(view==='finance')return renderFinanceV47();
  return oldView47();
};

})();


// ============================================================
// V48 - MOVIMIENTOS CONSISTENTES + IMPRIMIR ESTADO EN 3 LUGARES
// Inicio / Reservas / Fiesta
// ============================================================
(function(){
'use strict';

const SID48=()=>session?.salonId;
const EV48=()=> (data.events||[]).filter(e=>e.salonId===SID48() && e.status!=='Cancelada');
const E48=id=>(data.events||[]).find(e=>e.id===id&&e.salonId===SID48());
const N48=v=>Number(v||0);
const norm48=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function isPayment48(m){
  if(!m)return false;
  const t=norm48(m.type), c=norm48(m.category), q=norm48(m.concept);
  return t==='ingreso' || t==='cobro' ||
         c.includes('cobro') || c.includes('sena') || c.includes('reserva') ||
         q.includes('pago') || q.includes('sena');
}
function isDeposit48(m){
  if(!m)return false;
  const c=norm48(m.category), q=norm48(m.concept), sk=String(m.sourceKey||'');
  return c.includes('sena') || q.includes('sena') ||
         sk.includes(':deposit:') || sk.startsWith('v47:deposit:');
}

// Devuelve únicamente pagos aplicados a la reserva, respetando e.paid.
// Evita que movimientos heredados duplicados inflen la vista.
function visiblePayments48(e){
  if(!e)return [];
  const all=(data.movements||[])
    .filter(m=>m.salonId===SID48() && m.eventId===e.id && isPayment48(m));

  const target=N48(e.paid);
  if(target<=0)return [];

  const out=[];
  let sum=0;
  const deposit=N48(e.deposit);

  // Una sola seña visible.
  if(deposit>0){
    const dep=all.find(isDeposit48);
    out.push(dep || {
      id:'display-deposit-'+e.id,
      salonId:SID48(),eventId:e.id,
      type:'Ingreso',category:'Seña',
      concept:`Seña de reserva ${e.eventName||e.child||''}`,
      amount:deposit,
      method:e.depositMethod||'',
      movementDate:e.depositDate||''
    });
    sum+=deposit;
  }

  // Prioriza pagos nuevos V47 y luego cobros que NO sean otra seña.
  const manual=all
    .filter(m=>!isDeposit48(m))
    .sort((a,b)=>{
      const av=String(a.sourceKey||'').startsWith('v47:payment:')?0:1;
      const bv=String(b.sourceKey||'').startsWith('v47:payment:')?0:1;
      if(av!==bv)return av-bv;
      return String(a.createdAt||a.movementDate||'').localeCompare(String(b.createdAt||b.movementDate||''));
    });

  const seen=new Set();
  for(const m of manual){
    if(sum>=target)break;
    const key=[
      N48(m.amount),
      norm48(m.method),
      String(m.movementDate||''),
      norm48(m.reference||''),
      norm48(m.concept||'')
    ].join('|');
    if(seen.has(key))continue;
    seen.add(key);

    const remaining=target-sum;
    const amount=Math.min(N48(m.amount),remaining);
    if(amount<=0)continue;
    out.push({...m,amount});
    sum+=amount;
  }

  return out;
}
window.visiblePayments48=visiblePayments48;

// ------------------------------------------------------------
// INICIO: agrega Imprimir estado en cada fiesta.
// ------------------------------------------------------------
window.renderDashboardV48=function(){
  const events=EV48().slice().sort((a,b)=>{
    const da=String(a.date||'')+String(a.start||'');
    const db=String(b.date||'')+String(b.start||'');
    return da.localeCompare(db);
  });

  setTitle('Inicio','Fiestas creadas');

  $('#content').innerHTML=events.length ? `
    <div class="card">
      <div class="section-title">
        <div>
          <h3>Fiestas</h3>
          <small class="muted">Acceso directo a movimientos, impresión y edición.</small>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Horario</th><th>Nombre</th><th>Responsable</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${events.map(e=>`
              <tr>
                <td>${esc(e.date||'')}</td>
                <td>${esc(e.start||'')} - ${esc(e.end||'')}</td>
                <td><b>${esc(e.eventName||e.child||'')}</b></td>
                <td>${esc(e.client||'')}</td>
                <td><span class="pill">${esc(e.status||'')}</span></td>
                <td style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="primary small" onclick="openMovementsV48('${e.id}')">💰 Movimientos</button>
                  <button class="secondary small" onclick="printReservationStatus46('${e.id}',true)">🖨 Imprimir estado</button>
                  <button class="secondary small" onclick="openEventFormV45('${e.id}')">Editar</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : `<div class="empty">No hay fiestas creadas.</div>`;
};

// ------------------------------------------------------------
// RESERVAS / FIESTAS: agrega Imprimir estado.
// ------------------------------------------------------------
window.renderEventsV48=function(){
  const a=EV48().slice().sort((x,y)=>String(x.date||'').localeCompare(String(y.date||'')));
  setTitle('Fiestas','Reservas, pagos y saldos');

  $('#content').innerHTML=a.length?`
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Fecha</th><th>Evento</th><th>Cliente</th><th>Estado</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Acciones</th></tr></thead>
      <tbody>${a.map(e=>`
        <tr>
          <td>${esc(e.date||'')}</td>
          <td><b>${esc(e.eventName||e.child||'')}</b><small style="display:block">${esc(e.eventTypeName||'')}</small></td>
          <td>${esc(e.client||'')}</td>
          <td><span class="pill">${esc(e.status||'')}</span></td>
          <td><b>${money(e.total||0)}</b></td>
          <td>${money(e.paid||0)}</td>
          <td>${money(Math.max(0,N48(e.total)-N48(e.paid)))}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="primary small" onclick="openEvent('${e.id}')">Abrir fiesta</button>
            <button class="secondary small" onclick="printReservationStatus46('${e.id}',true)">🖨 Imprimir estado</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`:'<div class="empty">No hay fiestas.</div>';
};

// ------------------------------------------------------------
// MOVIMIENTOS: pagos visibles = exactamente lo aplicado en e.paid.
// Los gastos siguen mostrando todos los egresos reales.
// ------------------------------------------------------------
window.openMovementsV48=function(eid){
  const e=E48(eid); if(!e)return;

  const all=(data.movements||[]).filter(m=>m.salonId===SID48()&&m.eventId===eid);
  const payments=visiblePayments48(e);
  const expenses=all.filter(m=>norm48(m.type)==='gasto');
  const other=all.filter(m=>!isPayment48(m)&&norm48(m.type)!=='gasto');

  const shown=[...payments,...expenses,...other].sort((a,b)=>
    String(a.movementDate||a.createdAt||'').localeCompare(String(b.movementDate||b.createdAt||''))
  );

  const paid=N48(e.paid);
  const total=N48(e.total);
  const balance=Math.max(0,total-paid);
  const egresos=expenses.reduce((s,m)=>s+N48(m.amount),0);

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Movimientos · ${esc(e.eventName||e.child||'Fiesta')}</h2>
        <p>${esc(e.date||'')} · ${esc(e.start||'')} a ${esc(e.end||'')} · ${esc(e.client||'')}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕ Cerrar</button>
    </div>

    <div class="grid stats">
      <div class="card stat"><small>Total de la fiesta</small><strong>${money(total)}</strong></div>
      <div class="card stat"><small>Total pagado</small><strong>${money(paid)}</strong></div>
      <div class="card stat"><small>Saldo pendiente</small><strong>${money(balance)}</strong></div>
      <div class="card stat"><small>Gastos del salón</small><strong>${money(egresos)}</strong></div>
    </div>

    <div class="toolbar" style="margin-top:12px">
      ${balance>0?`<button class="primary" onclick="openPayment('${e.id}')">+ Registrar pago</button>`:''}
      <button class="secondary" onclick="printReservationStatus46('${e.id}',true)">🖨 Imprimir estado</button>
      <button class="secondary" onclick="openEventFormV45('${e.id}')">Editar reserva</button>
      <button class="ghost" onclick="openEvent('${e.id}')">Ver fiesta</button>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-title">
        <div>
          <h3>Movimientos de esta reserva</h3>
          <small class="muted">Los pagos mostrados coinciden con el total pagado aplicado a la fiesta.</small>
        </div>
      </div>

      ${shown.length?`
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr></thead>
          <tbody>${shown.map(m=>`
            <tr>
              <td>${esc(m.movementDate||'')}</td>
              <td>${esc(m.type||'')}</td>
              <td>${esc(m.category||'')}</td>
              <td>${esc(m.concept||'')}</td>
              <td>${money(m.amount||0)}</td>
              <td>${esc(m.method||'')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        <div style="margin-top:10px;text-align:right"><b>Pagos aplicados a la reserva: ${money(paid)}</b></div>
      `:'<div class="empty">Sin movimientos.</div>'}
    </div>
  `);
};
window.openMovementsV34=window.openMovementsV48;

// ------------------------------------------------------------
// FIESTA: garantiza botón Imprimir estado en el detalle.
// ------------------------------------------------------------
const oldOpenEvent48=window.openEventV47 || window.openEvent;
window.openEventV48=function(eid){
  oldOpenEvent48(eid);
  setTimeout(()=>{
    const modal=document.querySelector('#modal-body');
    if(!modal)return;

    let toolbar=modal.querySelector('.toolbar');
    if(!toolbar){
      toolbar=document.createElement('div');
      toolbar.className='toolbar';
      toolbar.style.marginTop='12px';
      const title=modal.querySelector('.modal-title');
      if(title)title.insertAdjacentElement('afterend',toolbar);
    }

    if(!modal.querySelector('#print-status48')){
      const b=document.createElement('button');
      b.id='print-status48';
      b.className='secondary';
      b.innerHTML='🖨 Imprimir estado';
      b.onclick=()=>printReservationStatus46(eid,true);
      toolbar.appendChild(b);
    }
  },100);
};
window.openEvent=window.openEventV48;

// ------------------------------------------------------------
// Impresión: lista de pagos consistente con e.paid.
// ------------------------------------------------------------
window.paymentMovements46=function(eid){
  const e=E48(eid);
  return e?visiblePayments48(e):[];
};

// Reemplaza impresión de estado para usar ledger visual correcto.
window.printReservationStatus48=function(eid,autoPrint=false){
  const e=E48(eid); if(!e)return;
  const s=salonInfo46();
  const pays=visiblePayments48(e);
  const paid=N48(e.paid);
  const total=N48(e.total);
  const balance=Math.max(0,total-paid);

  const included=[
    e.includesTableware?'Vajilla':'',
    e.includesLinen?'Mantelería':'',
    e.includesCoffee?'Cafetería':''
  ].filter(Boolean);

  const body=`
    <div class="head">
      <div>
        <h1>${esc46(s.name)}</h1>
        <div class="muted">${esc46(s.address)}</div>
        <div class="muted">${esc46(s.phone)} ${s.email?'· '+esc46(s.email):''}</div>
      </div>
      <div class="right"><b>ESTADO DE RESERVA</b><div class="muted">Emitido ${new Date().toLocaleString('es-AR')}</div></div>
    </div>

    <h2>Datos del evento</h2>
    <div class="grid">
      <div><b>Tipo:</b> ${esc46(e.eventTypeName||'Evento')}</div>
      <div><b>Fecha:</b> ${esc46(e.date||'')}</div>
      <div><b>Nombre:</b> ${esc46(e.eventName||e.child||'')}</div>
      <div><b>Fecha de cumpleaños:</b> ${esc46(e.birthdayDate||'—')}</div>
      <div><b>Horario:</b> ${esc46(e.start||'')} a ${esc46(e.end||'')}</div>
      <div><b>Duración:</b> ${N48(e.durationHours)} h${N48(e.extraHours)>0?' + '+N48(e.extraHours)+' h extra':''}</div>
      <div><b>Adultos:</b> ${N48(e.adults)}</div>
      <div><b>Niños:</b> ${N48(e.children)}</div>
      <div><b>Responsable:</b> ${esc46(e.client||'')}</div>
      <div><b>Estado:</b> ${esc46(e.status||'')}</div>
    </div>

    <h2>Incluido</h2>
    <div class="row"><span>Personal base</span><b>${N48(e.includedWaiters)} mozo(s) · ${N48(e.includedKitchen)} cocina · ${N48(e.includedAnimators)} animador(es)</b></div>
    <div class="row"><span>Servicios</span><b>${included.length?included.join(' · '):'—'}</b></div>

    <h2>Estado económico</h2>
    <div class="row"><span>Total de la fiesta</span><b>${money46(total)}</b></div>
    <div class="row"><span>Total pagado</span><b>${money46(paid)}</b></div>
    <div class="row total"><span>Saldo pendiente</span><b>${money46(balance)}</b></div>

    <h2>Pagos registrados</h2>
    ${pays.length?`<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Importe</th></tr></thead><tbody>
      ${pays.map(m=>`<tr><td>${esc46(m.movementDate||'')}</td><td>${esc46(m.concept||'Pago')}</td><td>${esc46(m.method||'')}</td><td>${money46(m.amount)}</td></tr>`).join('')}
    </tbody></table>`:'<div class="muted">No hay pagos registrados.</div>'}

    <div style="margin-top:10px;text-align:right"><b>Total pagos mostrados: ${money46(paid)}</b></div>
    <div class="sign"><div class="line">Firma del salón</div><div class="line">Firma del cliente</div></div>
  `;
  openPrintable46(`Estado reserva - ${e.eventName||e.child||'Evento'}`,body,autoPrint);
};
window.printReservationStatus46=window.printReservationStatus48;

// ------------------------------------------------------------
// Rutas finales
// ------------------------------------------------------------
const route48=renderSalonView;
renderSalonView=function(){
  if(view==='dashboard')return renderDashboardV48();
  if(view==='events')return renderEventsV48();
  return route48();
};

})();


// ============================================================
// V49 - FIX DEFINITIVO BOTONES "IMPRIMIR ESTADO"
// Función completamente autónoma y global.
// ============================================================
(function(){
'use strict';

function n49(v){ return Number(v||0); }
function esc49(v){
  return String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function money49(v){
  try{
    return new Intl.NumberFormat('es-AR',{
      style:'currency',currency:'ARS',maximumFractionDigits:0
    }).format(n49(v));
  }catch(e){
    return '$ '+n49(v).toLocaleString('es-AR');
  }
}
function norm49(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function currentSalon49(){
  try{
    if(typeof salon==='function') return salon()||{};
  }catch(e){}
  const sid=window.session?.salonId;
  return (window.data?.salons||[]).find(s=>s.id===sid)||{};
}
function event49(eid){
  const sid=window.session?.salonId;
  return (window.data?.events||[]).find(e=>e.id===eid && (!sid || e.salonId===sid));
}
function isPayment49(m){
  const t=norm49(m?.type), c=norm49(m?.category), q=norm49(m?.concept);
  return t==='ingreso' || t==='cobro' ||
         c.includes('cobro') || c.includes('sena') || c.includes('reserva') ||
         q.includes('pago') || q.includes('sena');
}
function isDeposit49(m){
  const c=norm49(m?.category), q=norm49(m?.concept), sk=String(m?.sourceKey||'');
  return c.includes('sena') || q.includes('sena') ||
         sk.includes(':deposit:') || sk.startsWith('v47:deposit:');
}
function payments49(e){
  const sid=window.session?.salonId;
  const all=(window.data?.movements||[]).filter(m =>
    m.eventId===e.id && (!sid || m.salonId===sid) && isPayment49(m)
  );

  const target=n49(e.paid);
  if(target<=0)return [];

  const out=[];
  let sum=0;
  const dep=n49(e.deposit);

  if(dep>0){
    const d=all.find(isDeposit49);
    out.push(d ? {...d,amount:dep} : {
      id:'dep-'+e.id,
      concept:'Seña de reserva',
      method:e.depositMethod||'',
      movementDate:e.depositDate||'',
      amount:dep
    });
    sum+=dep;
  }

  const seen=new Set();
  for(const m of all.filter(x=>!isDeposit49(x))){
    if(sum>=target) break;
    const key=[
      n49(m.amount),
      norm49(m.method),
      String(m.movementDate||''),
      norm49(m.reference||''),
      norm49(m.concept||'')
    ].join('|');

    if(seen.has(key)) continue;
    seen.add(key);

    const amount=Math.min(n49(m.amount),target-sum);
    if(amount<=0)continue;
    out.push({...m,amount});
    sum+=amount;
  }
  return out;
}

function openPrint49(title,html,autoPrint){
  const w=window.open('','_blank','width=1000,height=800');
  if(!w){
    if(typeof toast==='function') toast('El navegador bloqueó la ventana. Habilitá ventanas emergentes para imprimir.');
    else alert('El navegador bloqueó la ventana de impresión.');
    return;
  }

  w.document.open();
  w.document.write(`<!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8">
    <title>${esc49(title)}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;background:#fff}
      .actions{max-width:900px;margin:0 auto;padding:12px 0;display:flex;gap:8px}
      .actions button{padding:10px 14px;border:1px solid #bbb;background:#fff;border-radius:8px;cursor:pointer}
      .page{max-width:900px;margin:0 auto;padding:28px}
      .head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}
      .head h1{margin:0;font-size:24px}.right{text-align:right}.muted{font-size:12px;color:#666}
      h2{font-size:17px;margin:20px 0 8px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px}
      .row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #ddd}
      .total{font-weight:bold;font-size:18px;border-top:2px solid #111;margin-top:8px}
      table{width:100%;border-collapse:collapse}
      th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
      .sign{margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:60px}
      .line{border-top:1px solid #111;text-align:center;padding-top:6px;font-size:12px}
      @media print{
        .actions{display:none}.page{padding:0}
        @page{size:A4;margin:14mm}
      }
    </style>
  </head>
  <body>
    <div class="actions">
      <button onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
      <button onclick="window.close()">Cerrar</button>
    </div>
    <div class="page">${html}</div>
  </body></html>`);
  w.document.close();

  if(autoPrint){
    setTimeout(()=>{
      try{ w.focus(); w.print(); }catch(e){}
    },500);
  }
}

// FUNCIÓN GLOBAL USADA POR TODOS LOS BOTONES
window.printReservationStatus49=function(eid,autoPrint=true){
  try{
    const e=event49(eid);
    if(!e){
      if(typeof toast==='function') toast('No se encontró la reserva');
      return;
    }

    const s=currentSalon49();
    const pays=payments49(e);
    const total=n49(e.total);
    const paid=n49(e.paid);
    const balance=Math.max(0,total-paid);

    const services=[];
    if(e.includesTableware) services.push('Vajilla');
    if(e.includesLinen) services.push('Mantelería');
    if(e.includesCoffee) services.push('Cafetería');

    const html=`
      <div class="head">
        <div>
          <h1>${esc49(s.name||'FiestaControl')}</h1>
          <div class="muted">${esc49(s.address||'')}</div>
          <div class="muted">${esc49(s.phone||'')}${s.email?' · '+esc49(s.email):''}</div>
        </div>
        <div class="right">
          <b>ESTADO DE RESERVA</b>
          <div class="muted">Emitido ${new Date().toLocaleString('es-AR')}</div>
        </div>
      </div>

      <h2>Datos del evento</h2>
      <div class="grid">
        <div><b>Tipo:</b> ${esc49(e.eventTypeName||'Evento')}</div>
        <div><b>Fecha:</b> ${esc49(e.date||'')}</div>
        <div><b>Nombre:</b> ${esc49(e.eventName||e.child||'')}</div>
        <div><b>Fecha de cumpleaños:</b> ${esc49(e.birthdayDate||'—')}</div>
        <div><b>Horario:</b> ${esc49(e.start||'')} a ${esc49(e.end||'')}</div>
        <div><b>Duración:</b> ${n49(e.durationHours)} h${n49(e.extraHours)>0?' + '+n49(e.extraHours)+' h extra':''}</div>
        <div><b>Adultos:</b> ${n49(e.adults)}</div>
        <div><b>Niños:</b> ${n49(e.children)}</div>
        <div><b>Responsable:</b> ${esc49(e.client||'')}</div>
        <div><b>Estado:</b> ${esc49(e.status||'')}</div>
      </div>

      <h2>Incluido</h2>
      <div class="row">
        <span>Personal base</span>
        <b>${n49(e.includedWaiters)} mozo(s) · ${n49(e.includedKitchen)} cocina · ${n49(e.includedAnimators)} animador(es)</b>
      </div>
      <div class="row">
        <span>Servicios</span>
        <b>${services.length?services.join(' · '):'—'}</b>
      </div>

      <h2>Adicionales</h2>
      <div class="row"><span>Adultos adicionales (${n49(e.extraAdultQty)})</span><b>${money49(e.extraAdultTotal)}</b></div>
      <div class="row"><span>Niños adicionales (${n49(e.extraChildQty)})</span><b>${money49(e.extraChildTotal)}</b></div>
      <div class="row"><span>Mozo adicional (${n49(e.extraWaiters)})</span><b>${money49(e.extraWaiterTotal)}</b></div>
      <div class="row"><span>Cocina adicional (${n49(e.extraKitchen)})</span><b>${money49(e.extraKitchenTotal)}</b></div>
      <div class="row"><span>Animador adicional (${n49(e.extraAnimators)})</span><b>${money49(e.extraAnimatorTotal)}</b></div>
      <div class="row"><span>Horas extra (${n49(e.extraHours)})</span><b>${money49(e.extraHourTotal)}</b></div>

      <h2>Estado económico</h2>
      <div class="row"><span>Total de la fiesta</span><b>${money49(total)}</b></div>
      <div class="row"><span>Total pagado</span><b>${money49(paid)}</b></div>
      <div class="row total"><span>Saldo pendiente</span><b>${money49(balance)}</b></div>

      <h2>Pagos registrados</h2>
      ${pays.length ? `
        <table>
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Importe</th></tr></thead>
          <tbody>
            ${pays.map(m=>`
              <tr>
                <td>${esc49(m.movementDate||'')}</td>
                <td>${esc49(m.concept||'Pago')}</td>
                <td>${esc49(m.method||'')}</td>
                <td>${money49(m.amount)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      ` : '<div class="muted">No hay pagos registrados.</div>'}

      <div style="text-align:right;margin-top:10px"><b>Total pagos: ${money49(paid)}</b></div>
      <div class="sign">
        <div class="line">Firma del salón</div>
        <div class="line">Firma del cliente</div>
      </div>
    `;

    openPrint49(`Estado reserva - ${e.eventName||e.child||'Evento'}`,html,autoPrint);
  }catch(err){
    console.error('printReservationStatus49',err);
    alert('No se pudo generar el estado de reserva. Error: '+err.message);
  }
};

// Compatibilidad total con TODAS las versiones anteriores y onclick existentes.
window.printReservationStatus48=window.printReservationStatus49;
window.printReservationStatus46=window.printReservationStatus49;
window.printReservationStatus=window.printReservationStatus49;

// Repara botones ya renderizados por versiones anteriores.
function repairPrintButtons49(){
  document.querySelectorAll('button').forEach(btn=>{
    const txt=String(btn.textContent||'').toLowerCase();
    if(!txt.includes('imprimir estado')) return;

    const onclick=btn.getAttribute('onclick')||'';
    const m=onclick.match(/['"]([^'"]+)['"]/);
    if(m && m[1]){
      const eid=m[1];
      btn.onclick=function(ev){
        ev?.preventDefault?.();
        window.printReservationStatus49(eid,true);
      };
      btn.setAttribute('onclick',`printReservationStatus49('${eid}',true)`);
    }
  });
}

// Repara al cargar y después de cada render.
setTimeout(repairPrintButtons49,300);
setInterval(repairPrintButtons49,1500);

})();


// ============================================================
// V50 - CUENTAS CLARAS + IMPRESIÓN SIN "NO SE ENCONTRÓ RESERVA"
// ============================================================
(function(){
'use strict';

function n50(v){ return Number(v||0); }
function esc50(v){
  return String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function money50(v){
  try{
    return new Intl.NumberFormat('es-AR',{
      style:'currency',currency:'ARS',maximumFractionDigits:0
    }).format(n50(v));
  }catch(e){
    return '$ '+n50(v).toLocaleString('es-AR');
  }
}
function norm50(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// IMPORTANTE: la app usa variables globales léxicas (data/session),
// no necesariamente window.data / window.session.
function data50(){
  try{
    if(typeof data!=='undefined' && data) return data;
  }catch(e){}
  return window.data||{};
}
function session50(){
  try{
    if(typeof session!=='undefined' && session) return session;
  }catch(e){}
  return window.session||{};
}
function event50(eid){
  const d=data50();
  const list=Array.isArray(d.events)?d.events:[];
  // Primero busca solo por ID. El botón ya proviene de una fiesta visible.
  return list.find(e=>String(e.id)===String(eid)) || null;
}
function salon50(e){
  const d=data50();
  const salons=Array.isArray(d.salons)?d.salons:[];
  const sid=e?.salonId || session50()?.salonId;
  try{
    if(typeof salon==='function'){
      const s=salon();
      if(s)return s;
    }
  }catch(err){}
  return salons.find(s=>String(s.id)===String(sid)) || {};
}
function isPayment50(m){
  const t=norm50(m?.type), c=norm50(m?.category), q=norm50(m?.concept);
  return t==='ingreso' || t==='cobro' ||
         c.includes('cobro') || c.includes('sena') || c.includes('reserva') ||
         q.includes('pago') || q.includes('sena');
}
function isDeposit50(m){
  const c=norm50(m?.category), q=norm50(m?.concept), sk=String(m?.sourceKey||'');
  return c.includes('sena') || q.includes('sena') ||
         sk.includes(':deposit:') || sk.startsWith('v47:deposit:');
}

// Devuelve pagos cuya suma coincide EXACTAMENTE con e.paid.
function payments50(e){
  const d=data50();
  const all=(Array.isArray(d.movements)?d.movements:[])
    .filter(m=>String(m.eventId)===String(e.id) && isPayment50(m));

  const target=n50(e.paid);
  if(target<=0)return [];

  const out=[];
  let sum=0;
  const dep=Math.min(n50(e.deposit),target);

  if(dep>0){
    const realDep=all.find(isDeposit50);
    out.push(realDep ? {...realDep,amount:dep} : {
      id:'display-deposit-'+e.id,
      eventId:e.id,
      type:'Ingreso',
      category:'Seña',
      concept:'Seña de reserva',
      method:e.depositMethod||'',
      movementDate:e.depositDate||'',
      amount:dep
    });
    sum+=dep;
  }

  // No vuelve a tomar otra seña.
  const rest=all
    .filter(m=>!isDeposit50(m))
    .sort((a,b)=>String(a.createdAt||a.movementDate||'').localeCompare(String(b.createdAt||b.movementDate||'')));

  const seenIds=new Set();
  for(const m of rest){
    if(sum>=target)break;
    const unique=String(m.sourceKey||m.id||[
      n50(m.amount),norm50(m.method),m.movementDate||'',norm50(m.reference),norm50(m.concept)
    ].join('|'));
    if(seenIds.has(unique))continue;
    seenIds.add(unique);

    const amount=Math.min(n50(m.amount),target-sum);
    if(amount<=0)continue;
    out.push({...m,amount});
    sum+=amount;
  }

  return out;
}
window.payments50=payments50;

// ============================================================
// IMPRESIÓN CORREGIDA
// ============================================================
function openPrint50(title,html,autoPrint=true){
  const w=window.open('','_blank','width=1000,height=800');
  if(!w){
    if(typeof toast==='function') toast('El navegador bloqueó la ventana. Habilitá ventanas emergentes.');
    else alert('El navegador bloqueó la ventana de impresión.');
    return;
  }

  w.document.open();
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>${esc50(title)}</title>
  <style>
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;background:#fff}
    .actions{max-width:900px;margin:0 auto;padding:12px 0;display:flex;gap:8px}
    .actions button{padding:10px 14px;border:1px solid #bbb;background:#fff;border-radius:8px;cursor:pointer}
    .page{max-width:900px;margin:0 auto;padding:28px}
    .head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}
    .head h1{margin:0;font-size:24px}.right{text-align:right}.muted{font-size:12px;color:#666}
    h2{font-size:17px;margin:20px 0 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px}
    .row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #ddd}
    .total{font-weight:bold;font-size:18px;border-top:2px solid #111;margin-top:8px}
    table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
    .sign{margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:60px}.line{border-top:1px solid #111;text-align:center;padding-top:6px;font-size:12px}
    @media print{.actions{display:none}.page{padding:0}@page{size:A4;margin:14mm}}
  </style></head><body>
  <div class="actions"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button><button onclick="window.close()">Cerrar</button></div>
  <div class="page">${html}</div></body></html>`);
  w.document.close();

  if(autoPrint)setTimeout(()=>{try{w.focus();w.print();}catch(e){}},450);
}

window.printReservationStatus50=function(eid,autoPrint=true){
  try{
    const e=event50(eid);
    if(!e){
      console.error('V50 reserva no encontrada',eid,data50()?.events);
      if(typeof toast==='function')toast('No se encontró la reserva seleccionada');
      else alert('No se encontró la reserva seleccionada');
      return;
    }

    const s=salon50(e);
    const pays=payments50(e);
    const total=n50(e.total);
    const paid=n50(e.paid);
    const deposit=Math.min(n50(e.deposit),paid);
    const otherPaid=Math.max(0,paid-deposit);
    const balance=Math.max(0,total-paid);

    const services=[];
    if(e.includesTableware)services.push('Vajilla');
    if(e.includesLinen)services.push('Mantelería');
    if(e.includesCoffee)services.push('Cafetería');

    const html=`
      <div class="head">
        <div>
          <h1>${esc50(s.name||'FiestaControl')}</h1>
          <div class="muted">${esc50(s.address||'')}</div>
          <div class="muted">${esc50(s.phone||'')}${s.email?' · '+esc50(s.email):''}</div>
        </div>
        <div class="right">
          <b>ESTADO DE RESERVA</b>
          <div class="muted">Emitido ${new Date().toLocaleString('es-AR')}</div>
        </div>
      </div>

      <h2>Datos del evento</h2>
      <div class="grid">
        <div><b>Tipo:</b> ${esc50(e.eventTypeName||'Evento')}</div>
        <div><b>Fecha:</b> ${esc50(e.date||'')}</div>
        <div><b>Nombre:</b> ${esc50(e.eventName||e.child||'')}</div>
        <div><b>Fecha de cumpleaños:</b> ${esc50(e.birthdayDate||'—')}</div>
        <div><b>Horario:</b> ${esc50(e.start||'')} a ${esc50(e.end||'')}</div>
        <div><b>Duración:</b> ${n50(e.durationHours)} h${n50(e.extraHours)>0?' + '+n50(e.extraHours)+' h extra':''}</div>
        <div><b>Adultos:</b> ${n50(e.adults)}</div>
        <div><b>Niños:</b> ${n50(e.children)}</div>
        <div><b>Responsable:</b> ${esc50(e.client||'')}</div>
        <div><b>Estado:</b> ${esc50(e.status||'')}</div>
      </div>

      <h2>Incluido</h2>
      <div class="row"><span>Personal base</span><b>${n50(e.includedWaiters)} mozo(s) · ${n50(e.includedKitchen)} cocina · ${n50(e.includedAnimators)} animador(es)</b></div>
      <div class="row"><span>Servicios</span><b>${services.length?services.join(' · '):'—'}</b></div>

      <h2>Estado económico</h2>
      <div class="row"><span>Total de la fiesta</span><b>${money50(total)}</b></div>
      <div class="row"><span>Seña (incluida en el total pagado)</span><b>${money50(deposit)}</b></div>
      <div class="row"><span>Otros pagos posteriores</span><b>${money50(otherPaid)}</b></div>
      <div class="row total"><span>Total pagado</span><b>${money50(paid)}</b></div>
      <div class="row total"><span>Saldo pendiente</span><b>${money50(balance)}</b></div>

      <h2>Pagos registrados</h2>
      ${pays.length?`
        <table><thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Importe</th></tr></thead><tbody>
        ${pays.map(m=>`<tr><td>${esc50(m.movementDate||'')}</td><td>${esc50(m.concept||'Pago')}</td><td>${esc50(m.method||'')}</td><td>${money50(m.amount)}</td></tr>`).join('')}
        </tbody></table>
        <div style="text-align:right;margin-top:10px"><b>Suma de pagos registrados: ${money50(pays.reduce((a,m)=>a+n50(m.amount),0))}</b></div>
      `:'<div class="muted">No hay pagos registrados.</div>'}

      <div class="sign"><div class="line">Firma del salón</div><div class="line">Firma del cliente</div></div>
    `;

    openPrint50(`Estado reserva - ${e.eventName||e.child||'Evento'}`,html,autoPrint);
  }catch(err){
    console.error('V50 imprimir estado',err);
    alert('No se pudo imprimir la reserva: '+err.message);
  }
};

// Todos los nombres antiguos apuntan a V50.
window.printReservationStatus=window.printReservationStatus50;
window.printReservationStatus46=window.printReservationStatus50;
window.printReservationStatus48=window.printReservationStatus50;
window.printReservationStatus49=window.printReservationStatus50;

// ============================================================
// ACLARA LAS CUENTAS EN EL DETALLE DE FIESTA
// ============================================================
function repairEconomicCard50(eid){
  const e=event50(eid);
  const modal=document.querySelector('#modal-body');
  if(!e||!modal)return;

  const paid=n50(e.paid);
  const dep=Math.min(n50(e.deposit),paid);
  const other=Math.max(0,paid-dep);
  const balance=Math.max(0,n50(e.total)-paid);

  // Busca la tarjeta "Composición del total" y reemplaza solo su bloque económico.
  const cards=[...modal.querySelectorAll('.card')];
  const card=cards.find(c=>String(c.textContent||'').includes('Composición del total'));
  if(card){
    const divs=[...card.querySelectorAll(':scope > div')];
    divs.forEach(d=>{
      const t=String(d.textContent||'').trim();
      if(t.startsWith('Seña ') || t.startsWith('Total pagado ') || t.startsWith('Saldo restante ') ||
         t.startsWith('Seña (incluida') || t.startsWith('Otros pagos posteriores')){
        d.remove();
      }
    });

    const block=document.createElement('div');
    block.id='economic-v50';
    block.style.marginTop='8px';
    block.innerHTML=`
      <div>Seña <small class="muted">(incluida en total pagado)</small> <b>${money50(dep)}</b></div>
      <div>Otros pagos posteriores <b>${money50(other)}</b></div>
      <div>Total pagado <b>${money50(paid)}</b></div>
      <div>Saldo restante <b>${money50(balance)}</b></div>
    `;
    card.appendChild(block);
  }

  // Reemplaza tabla antigua de movimientos por pagos consistentes + gastos.
  const movementCard=cards.find(c=>String(c.textContent||'').includes('Movimientos de esta fiesta'));
  if(movementCard){
    const d=data50();
    const pays=payments50(e);
    const expenses=(d.movements||[]).filter(m=>
      String(m.eventId)===String(e.id) && norm50(m.type)==='gasto'
    );
    const rows=[...pays,...expenses];

    movementCard.innerHTML=`
      <h3>Movimientos de esta fiesta</h3>
      ${rows.length?`
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr></thead>
          <tbody>${rows.map(m=>`
            <tr>
              <td>${esc50(m.movementDate||'')}</td>
              <td>${esc50(m.type||'')}</td>
              <td>${esc50(m.concept||'')}</td>
              <td>${money50(m.amount)}</td>
              <td>${esc50(m.method||'')}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        <div style="margin-top:10px;text-align:right">
          <b>Pagos aplicados: ${money50(paid)}</b>
        </div>
      `:'<div class="empty">Sin movimientos.</div>'}
    `;
  }
}

// Wrapper final de Fiesta.
const oldOpen50=window.openEventV48 || window.openEvent;
window.openEventV50=function(eid){
  oldOpen50(eid);
  setTimeout(()=>{
    repairEconomicCard50(eid);

    const modal=document.querySelector('#modal-body');
    if(!modal)return;

    // Repara TODOS los botones de imprimir dentro de la fiesta.
    modal.querySelectorAll('button').forEach(btn=>{
      if(norm50(btn.textContent).includes('imprimir estado')){
        btn.onclick=(ev)=>{
          ev?.preventDefault?.();
          window.printReservationStatus50(eid,true);
        };
        btn.setAttribute('onclick',`printReservationStatus50('${String(eid).replace(/'/g,"\\'")}',true)`);
      }
    });
  },150);
};
window.openEvent=window.openEventV50;

// ============================================================
// REPARA BOTONES EN INICIO / RESERVAS / MOVIMIENTOS
// ============================================================
function repairButtons50(){
  document.querySelectorAll('button').forEach(btn=>{
    if(!norm50(btn.textContent).includes('imprimir estado'))return;

    const raw=btn.getAttribute('onclick')||'';
    const matches=[...raw.matchAll(/['"]([^'"]+)['"]/g)];
    const eid=matches.length?matches[0][1]:null;
    if(!eid)return;

    btn.onclick=(ev)=>{
      ev?.preventDefault?.();
      window.printReservationStatus50(eid,true);
    };
    btn.setAttribute('onclick',`printReservationStatus50('${eid.replace(/'/g,"\\'")}',true)`);
  });
}
setTimeout(repairButtons50,200);
setInterval(repairButtons50,1200);

})();


// ============================================================
// V51 - STOCK SIMPLE + COMPRAS DESDE PROVEEDORES
// ============================================================
(function(){
'use strict';

const N51=v=>Number(v||0);
const SID51=()=>{
  try{return session?.salonId}catch(e){return window.session?.salonId}
};
const salon51=()=>{
  try{return salon()}catch(e){
    const sid=SID51();
    return (data?.salons||[]).find(s=>s.id===sid)||{};
  }
};
const products51=()=> (data.stockProducts||[]).filter(p=>p.salonId===SID51());
const suppliers51=()=> (data.suppliers||[]).filter(s=>s.salonId===SID51());
const communitySuppliers51=()=> (data.marketSuppliers||[]).filter(s=>s.active!==false);

function stockStatus51(p){
  const stock=N51(p.stock);
  const min=N51(p.minStock);
  if(stock<=0)return {label:'SIN STOCK',cls:'danger'};
  if(min>0 && stock<=min)return {label:'STOCK BAJO',cls:'warning'};
  return {label:'OK',cls:'success'};
}
function money51(v){
  try{return money(v)}catch(e){
    return '$ '+N51(v).toLocaleString('es-AR');
  }
}
function esc51(v){
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
}

// ------------------------------------------------------------
// STOCK: SOLO PRODUCTOS + EXISTENCIA + ALERTA
// ------------------------------------------------------------
window.renderStockV51=function(){
  const list=products51().slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));

  setTitle('Stock','Productos y existencias');

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>📦 Stock</h3>
          <small class="muted">Acá solamente se crean productos y se controla la existencia.</small>
        </div>
        <button class="primary" onclick="openStockProduct51()">+ Crear producto</button>
      </div>

      ${list.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(p=>{
                const st=stockStatus51(p);
                return `
                <tr>
                  <td><b>${esc51(p.name)}</b></td>
                  <td>${esc51(p.category||'')}</td>
                  <td><b>${N51(p.stock)}</b></td>
                  <td>${N51(p.minStock)}</td>
                  <td><span class="pill ${st.cls}">${st.label}</span></td>
                  <td style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="secondary small" onclick="openStockProduct51('${p.id}')">Editar</button>
                    <button class="ghost small" onclick="deleteStockProduct51('${p.id}')">Borrar</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `:`<div class="empty">Todavía no hay productos cargados.</div>`}
    </div>

    ${list.some(p=>N51(p.stock)<=0 || (N51(p.minStock)>0 && N51(p.stock)<=N51(p.minStock)))?`
      <div class="card" style="margin-top:14px">
        <h3>⚠️ Alertas de stock</h3>
        ${list.filter(p=>N51(p.stock)<=0 || (N51(p.minStock)>0 && N51(p.stock)<=N51(p.minStock)))
          .map(p=>`
            <div class="admin-notice" style="margin-top:8px">
              <span>${N51(p.stock)<=0?'🚫':'⚠️'}</span>
              <div>
                <b>${esc51(p.name)}</b>
                <small>${N51(p.stock)<=0?'No hay unidades disponibles.':'Stock bajo: quedan '+N51(p.stock)+' unidades. Mínimo configurado: '+N51(p.minStock)+'.'}</small>
              </div>
            </div>`).join('')}
      </div>`:''}
  `;
};

window.openStockProduct51=function(pid=''){
  const p=pid?(data.stockProducts||[]).find(x=>x.id===pid&&x.salonId===SID51()):null;

  showModal(`
    <div class="modal-title">
      <div><h2>${p?'Editar':'Crear'} producto</h2><p>Producto del inventario del salón.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="stockProduct51">
      <div class="form-grid">
        <div class="field span2"><label>Producto</label><input name="name" required value="${esc51(p?.name||'')}"></div>
        <div class="field"><label>Categoría</label><input name="category" value="${esc51(p?.category||'')}"></div>
        <div class="field"><label>Stock actual</label><input name="stock" type="number" min="0" step="1" value="${N51(p?.stock)}"></div>
        <div class="field"><label>Stock mínimo de alerta</label><input name="minStock" type="number" min="0" step="1" value="${N51(p?.minStock)}"></div>
        <div class="field"><label>Costo de referencia</label><input name="costPrice" type="number" min="0" value="${N51(p?.costPrice)}"></div>
        <div class="field"><label>Precio de venta</label><input name="salePrice" type="number" min="0" value="${N51(p?.salePrice)}"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar producto</button>
      </div>
    </form>
  `);

  document.querySelector('#stockProduct51').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    data.stockProducts=data.stockProducts||[];

    const obj={
      ...(p||{}),
      id:p?.id||id(),
      salonId:SID51(),
      name:String(f.name||'').trim(),
      category:String(f.category||'').trim(),
      stock:N51(f.stock),
      minStock:N51(f.minStock),
      costPrice:N51(f.costPrice),
      salePrice:N51(f.salePrice)
    };

    if(p){
      const ix=data.stockProducts.findIndex(x=>x.id===p.id);
      if(ix>=0)data.stockProducts[ix]=obj;
    }else{
      data.stockProducts.push(obj);
    }
    save(); closeModal(); renderStockV51(); toast('Producto guardado');
  };
};

window.deleteStockProduct51=function(pid){
  const p=(data.stockProducts||[]).find(x=>x.id===pid&&x.salonId===SID51());
  if(!p)return;
  if(!confirm(`¿Borrar el producto "${p.name}"?`))return;
  data.stockProducts=(data.stockProducts||[]).filter(x=>x.id!==pid);
  save(); renderStockV51(); toast('Producto eliminado');
};

// ------------------------------------------------------------
// PROVEEDORES: PROVEEDOR MANUAL / COMUNIDAD + COMPRA DE STOCK
// ------------------------------------------------------------
function supplierOptions51(){
  const own=suppliers51();
  const community=communitySuppliers51();

  let html='<option value="">Seleccionar proveedor</option>';

  if(own.length){
    html+='<optgroup label="Mis proveedores">';
    html+=own.map(s=>`<option value="own:${s.id}">${esc51(s.name||s.businessName||'Proveedor')}</option>`).join('');
    html+='</optgroup>';
  }

  if(community.length){
    html+='<optgroup label="Proveedores de la comunidad">';
    html+=community.map(s=>`<option value="community:${s.id}">${esc51(s.name||s.businessName||'Proveedor comunidad')}</option>`).join('');
    html+='</optgroup>';
  }

  return html;
}

function productOptions51(){
  return products51().map(p=>`
    <option value="${p.id}">${esc51(p.name)} · stock ${N51(p.stock)}</option>
  `).join('');
}

window.renderSuppliersV51=function(){
  const own=suppliers51();
  const community=communitySuppliers51();
  const purchases=(data.stockPurchases||[])
    .filter(x=>x.salonId===SID51())
    .sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));

  setTitle('Proveedores','Compras para reponer stock');

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>🚚 Proveedores</h3>
          <small class="muted">Las compras se hacen utilizando los productos ya creados en Stock.</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openManualSupplier51()">+ Agregar proveedor manual</button>
          <button class="primary" onclick="openStockPurchase51()">+ Nueva compra</button>
        </div>
      </div>

      ${!products51().length?`
        <div class="admin-notice">
          <span>ℹ️</span>
          <div><b>Primero cargá productos en Stock.</b><small>Después vas a poder seleccionarlos desde una compra a proveedor.</small></div>
        </div>
      `:''}
    </div>

    <div class="grid" style="margin-top:14px">
      <div class="card">
        <h3>Mis proveedores</h3>
        ${own.length?own.map(s=>`
          <div class="row" style="padding:10px 0;border-bottom:1px solid #eee">
            <div>
              <b>${esc51(s.name||s.businessName||'Proveedor')}</b>
              <small style="display:block">${esc51(s.phone||s.whatsapp||'')} ${s.email?'· '+esc51(s.email):''}</small>
            </div>
          </div>`).join(''):'<div class="empty">Sin proveedores manuales.</div>'}
      </div>

      <div class="card">
        <h3>Proveedores de la comunidad</h3>
        ${community.length?community.map(s=>`
          <div class="row" style="padding:10px 0;border-bottom:1px solid #eee">
            <div>
              <b>${esc51(s.name||s.businessName||'Proveedor')}</b>
              <small style="display:block">${esc51(s.category||s.service||'')}</small>
            </div>
          </div>`).join(''):'<div class="empty">No hay proveedores visibles en la comunidad.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Compras de stock</h3>
      ${purchases.length?`
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Producto</th><th>Cantidad</th><th>Total</th><th>Estado</th><th>Entrega</th></tr></thead>
            <tbody>
              ${purchases.map(p=>`
                <tr>
                  <td>${esc51(p.date||p.createdAt?.slice?.(0,10)||'')}</td>
                  <td>${esc51(p.supplierName||'')}</td>
                  <td>${esc51(p.productName||'')}</td>
                  <td>${N51(p.qty)}</td>
                  <td>${money51(p.total||0)}</td>
                  <td>${esc51(p.paymentStatus||'Pendiente')}</td>
                  <td>${esc51(p.deliveryStatus||'Pendiente de entrega')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`:'<div class="empty">Todavía no hay compras registradas.</div>'}
    </div>
  `;
};

window.openManualSupplier51=function(){
  showModal(`
    <div class="modal-title">
      <div><h2>Agregar proveedor manual</h2><p>Proveedor propio del salón.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="supplier51">
      <div class="form-grid">
        <div class="field span2"><label>Nombre / empresa</label><input name="name" required></div>
        <div class="field"><label>Teléfono / WhatsApp</label><input name="phone"></div>
        <div class="field"><label>Email</label><input name="email" type="email"></div>
        <div class="field span2"><label>Observaciones</label><textarea name="notes"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar proveedor</button>
      </div>
    </form>
  `);

  document.querySelector('#supplier51').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    data.suppliers=data.suppliers||[];
    data.suppliers.push({
      id:id(),salonId:SID51(),
      name:String(f.name||'').trim(),
      phone:String(f.phone||'').trim(),
      email:String(f.email||'').trim(),
      notes:String(f.notes||'').trim(),
      source:'manual'
    });
    save(); closeModal(); renderSuppliersV51(); toast('Proveedor agregado');
  };
};

window.openStockPurchase51=function(){
  const products=products51();
  if(!products.length){
    toast('Primero tenés que crear al menos un producto en Stock');
    view='stock'; renderSalonShell(); return;
  }

  showModal(`
    <div class="modal-title">
      <div><h2>Nueva compra de stock</h2><p>Elegí un producto creado en Stock y un proveedor.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="purchase51">
      <div class="form-grid">
        <div class="field span2">
          <label>Proveedor</label>
          <select name="supplier" required>${supplierOptions51()}</select>
        </div>

        <div class="field span2">
          <label>Producto de Stock</label>
          <select name="productId" id="purchaseProduct51" required>
            <option value="">Seleccionar producto</option>
            ${productOptions51()}
          </select>
        </div>

        <div class="field"><label>Cantidad</label><input name="qty" id="purchaseQty51" type="number" min="1" value="1" required></div>
        <div class="field"><label>Costo unitario</label><input name="unitCost" id="purchaseCost51" type="number" min="0" value="0" required></div>
        <div class="field"><label>Total</label><input id="purchaseTotal51" readonly></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>

        <div class="field">
          <label>Estado de pago</label>
          <select name="paymentStatus"><option>Pendiente</option><option>Pagado</option></select>
        </div>

        <div class="field">
          <label>Entrega</label>
          <select name="deliveryStatus"><option>Pendiente de entrega</option><option>Entregado</option></select>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Registrar compra</button>
      </div>
    </form>
  `);

  const prodSel=document.querySelector('#purchaseProduct51');
  const qty=document.querySelector('#purchaseQty51');
  const cost=document.querySelector('#purchaseCost51');
  const total=document.querySelector('#purchaseTotal51');

  function recalc(){
    const p=(data.stockProducts||[]).find(x=>x.id===prodSel.value);
    if(p && document.activeElement!==cost) cost.value=N51(p.costPrice);
    total.value=money51(N51(qty.value)*N51(cost.value));
  }

  prodSel.addEventListener('change',recalc);
  qty.addEventListener('input',recalc);
  cost.addEventListener('input',recalc);
  recalc();

  document.querySelector('#purchase51').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const p=(data.stockProducts||[]).find(x=>x.id===f.productId&&x.salonId===SID51());
    if(!p)return toast('Producto no encontrado');

    const [source,supplierId]=String(f.supplier||'').split(':');
    let sup=null;
    if(source==='own')sup=(data.suppliers||[]).find(x=>x.id===supplierId);
    if(source==='community')sup=(data.marketSuppliers||[]).find(x=>x.id===supplierId);
    if(!sup)return toast('Proveedor no encontrado');

    const qtyN=N51(f.qty), unit=N51(f.unitCost), totalN=qtyN*unit;
    data.stockPurchases=data.stockPurchases||[];

    const purchase={
      id:id(),salonId:SID51(),
      productId:p.id,productName:p.name,
      supplierId:supplierId,
      supplierSource:source,
      supplierName:sup.name||sup.businessName||'Proveedor',
      qty:qtyN,unitCost:unit,total:totalN,
      date:f.date,
      paymentStatus:f.paymentStatus,
      deliveryStatus:f.deliveryStatus,
      createdAt:new Date().toISOString()
    };
    data.stockPurchases.push(purchase);

    // Solo aumenta stock cuando figura entregado.
    if(f.deliveryStatus==='Entregado'){
      p.stock=N51(p.stock)+qtyN;
    }

    // Si está pagado, genera el gasto correspondiente.
    if(f.paymentStatus==='Pagado'){
      data.movements=data.movements||[];
      data.movements.push({
        id:id(),salonId:SID51(),
        type:'Gasto',category:'Compra de stock',
        concept:`Compra ${p.name} · ${purchase.supplierName}`,
        amount:totalN,
        movementDate:f.date,
        createdAt:new Date().toISOString(),
        sourceKey:`v51:stockpurchase:${purchase.id}`
      });
    }

    save(); closeModal(); renderSuppliersV51(); toast('Compra registrada');
  };
};

// ------------------------------------------------------------
// RUTAS FINALES
// ------------------------------------------------------------
const route51=renderSalonView;
renderSalonView=function(){
  if(view==='stock')return renderStockV51();
  if(view==='suppliers')return renderSuppliersV51();
  return route51();
};

})();


// ============================================================
// V52 - REINICIOS CORREGIDOS Y FUNCIONALES
// ============================================================
(function(){
'use strict';

const SID52=()=>{
  try{return session?.salonId}catch(e){return window.session?.salonId}
};
const salon52=()=>{
  try{return salon()}catch(e){
    const sid=SID52();
    return (data.salons||[]).find(s=>s.id===sid)||{};
  }
};
const N52=v=>Number(v||0);

function requirePassword52(onOk){
  const s=salon52();
  showModal(`
    <div class="modal-title">
      <div>
        <h2>Confirmar operación</h2>
        <p>Esta acción modifica datos del sistema.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="confirmReset52">
      <div class="field">
        <label>Contraseña del salón</label>
        <input name="password" type="password" required autocomplete="current-password">
      </div>
      <div class="field">
        <label>Motivo</label>
        <input name="reason" placeholder="Ej.: reinicio de prueba" required>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Confirmar</button>
      </div>
    </form>
  `);

  document.querySelector('#confirmReset52').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const expected=String(s.password||s.pass||'');
    if(expected && String(f.password)!==expected){
      return toast('Contraseña incorrecta');
    }
    closeModal();
    onOk(String(f.reason||''));
  };
}

// ------------------------------------------------------------
// 1) PONER MOVIMIENTOS EN $0
// Solo limpia la parte contable.
// ------------------------------------------------------------
window.zeroMoney52=function(){
  requirePassword52(reason=>{
    const sid=SID52();

    data.movements=(data.movements||[]).filter(m=>m.salonId!==sid);
    data.providerPayments=(data.providerPayments||[]).filter(x=>x.salonId!==sid);
    data.servicePayments=(data.servicePayments||[]).filter(x=>x.salonId!==sid);

    (data.events||[]).forEach(e=>{
      if(e.salonId!==sid)return;
      e.deposit=0;
      e.depositMethod='';
      e.depositDate='';
      e.paid=0;
      e.balance=N52(e.total);
    });

    (data.stockPurchases||[]).forEach(p=>{
      if(p.salonId!==sid)return;
      p.paymentStatus='Pendiente';
    });

    (data.orders||[]).forEach(o=>{
      if(o.salonId!==sid)return;
      o.paid=0;
      if('paymentStatus' in o)o.paymentStatus='Pendiente';
    });

    (data.suppliers||[]).forEach(s=>{
      if(s.salonId!==sid)return;
      if('balance' in s)s.balance=0;
      if('paid' in s)s.paid=0;
    });

    data.auditLog=data.auditLog||[];
    data.auditLog.push({
      id:id(),salonId:sid,type:'RESET_MONEY',reason,
      createdAt:new Date().toISOString()
    });

    save();
    toast('Movimientos y saldos puestos en $0');
    setTimeout(()=>{view='finance';renderSalonShell();},100);
  });
};

// ------------------------------------------------------------
// 2) REINICIO TOTAL DEL SISTEMA DEL SALÓN
// Borra datos operativos, pero conserva:
// - cuenta del salón
// - configuración de Mi salón
// - tipos de evento configurados
// ------------------------------------------------------------
window.fullReset52=function(){
  showModal(`
    <div class="modal-title">
      <div>
        <h2>⚠️ Reinicio total del sistema</h2>
        <p>Deja el salón limpio para comenzar de cero.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <div class="admin-notice">
      <span>⚠️</span>
      <div>
        <b>Se eliminarán todos los datos operativos del salón.</b>
        <small>
          Reservas, movimientos, personal, productos de stock, compras,
          proveedores propios, pedidos, tarjetas y registros relacionados.
          Se conserva la cuenta del salón y la configuración de Mi salón.
        </small>
      </div>
    </div>

    <form id="fullReset52Confirm" style="margin-top:14px">
      <div class="field">
        <label>Escribí REINICIAR para confirmar</label>
        <input name="word" required autocomplete="off">
      </div>
      <div class="field">
        <label>Contraseña del salón</label>
        <input name="password" type="password" required>
      </div>
      <div class="field">
        <label>Motivo</label>
        <input name="reason" required placeholder="Ej.: borrar datos de prueba">
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="danger">Reiniciar todo</button>
      </div>
    </form>
  `);

  document.querySelector('#fullReset52Confirm').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const s=salon52();
    const expected=String(s.password||s.pass||'');

    if(String(f.word||'').trim().toUpperCase()!=='REINICIAR')
      return toast('Tenés que escribir REINICIAR');

    if(expected && String(f.password)!==expected)
      return toast('Contraseña incorrecta');

    const sid=SID52();

    // Datos propios del salón
    data.events=(data.events||[]).filter(x=>x.salonId!==sid);
    data.staff=(data.staff||[]).filter(x=>x.salonId!==sid);
    data.assignments=(data.assignments||[]).filter(x=>x.salonId!==sid);
    data.suppliers=(data.suppliers||[]).filter(x=>x.salonId!==sid);
    data.orders=(data.orders||[]).filter(x=>x.salonId!==sid);
    data.cards=(data.cards||[]).filter(x=>x.salonId!==sid);
    data.movements=(data.movements||[]).filter(x=>x.salonId!==sid);
    data.stockProducts=(data.stockProducts||[]).filter(x=>x.salonId!==sid);
    data.stockPurchases=(data.stockPurchases||[]).filter(x=>x.salonId!==sid);
    data.providerPayments=(data.providerPayments||[]).filter(x=>x.salonId!==sid);
    data.servicePayments=(data.servicePayments||[]).filter(x=>x.salonId!==sid);
    data.salonExtras=(data.salonExtras||[]).filter(x=>x.salonId!==sid);
    data.salonUsers=(data.salonUsers||[]).filter(x=>x.salonId!==sid);

    // Conserva comunidad y proveedores comunitarios globales.
    // Conserva el salón y toda su configuración.

    data.auditLog=data.auditLog||[];
    data.auditLog.push({
      id:id(),salonId:sid,type:'FULL_RESET',
      reason:String(f.reason||''),
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Sistema reiniciado. El salón quedó listo para comenzar de cero.');

    setTimeout(()=>{
      view='dashboard';
      renderSalonShell();
    },150);
  };
};

// ------------------------------------------------------------
// 3) REINICIO POR SECCIONES, FUNCIONAL
// ------------------------------------------------------------
window.sectionReset52=function(){
  showModal(`
    <div class="modal-title">
      <div>
        <h2>Reinicio por secciones</h2>
        <p>Elegí qué datos querés borrar.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="sectionReset52Form">
      <div class="form-grid">
        <label class="check-card"><input type="checkbox" name="money"><span><b>Movimientos de dinero</b></span></label>
        <label class="check-card"><input type="checkbox" name="events"><span><b>Reservas / fiestas</b></span></label>
        <label class="check-card"><input type="checkbox" name="orders"><span><b>Pedidos / compras</b></span></label>
        <label class="check-card"><input type="checkbox" name="staff"><span><b>Personal</b></span></label>
        <label class="check-card"><input type="checkbox" name="stock"><span><b>Stock</b></span></label>
        <label class="check-card"><input type="checkbox" name="suppliers"><span><b>Proveedores propios</b></span></label>
      </div>

      <div class="field" style="margin-top:12px">
        <label>Contraseña del salón</label>
        <input name="password" type="password" required>
      </div>
      <div class="field">
        <label>Motivo</label>
        <input name="reason" required>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="danger">Aplicar reinicio</button>
      </div>
    </form>
  `);

  document.querySelector('#sectionReset52Form').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const s=salon52();
    const expected=String(s.password||s.pass||'');
    if(expected && String(fd.get('password'))!==expected)
      return toast('Contraseña incorrecta');

    const sid=SID52();

    if(fd.has('money')){
      data.movements=(data.movements||[]).filter(x=>x.salonId!==sid);
      data.providerPayments=(data.providerPayments||[]).filter(x=>x.salonId!==sid);
      data.servicePayments=(data.servicePayments||[]).filter(x=>x.salonId!==sid);
      (data.events||[]).forEach(ev=>{
        if(ev.salonId===sid){
          ev.deposit=0; ev.paid=0; ev.balance=N52(ev.total);
        }
      });
    }

    if(fd.has('events')){
      data.events=(data.events||[]).filter(x=>x.salonId!==sid);
      data.assignments=(data.assignments||[]).filter(x=>x.salonId!==sid);
      data.cards=(data.cards||[]).filter(x=>x.salonId!==sid);
      data.movements=(data.movements||[]).filter(x=>x.salonId!==sid);
    }

    if(fd.has('orders')){
      data.orders=(data.orders||[]).filter(x=>x.salonId!==sid);
      data.stockPurchases=(data.stockPurchases||[]).filter(x=>x.salonId!==sid);
      data.providerPayments=(data.providerPayments||[]).filter(x=>x.salonId!==sid);
    }

    if(fd.has('staff')){
      data.staff=(data.staff||[]).filter(x=>x.salonId!==sid);
      data.assignments=(data.assignments||[]).filter(x=>x.salonId!==sid);
    }

    if(fd.has('stock')){
      data.stockProducts=(data.stockProducts||[]).filter(x=>x.salonId!==sid);
      data.stockPurchases=(data.stockPurchases||[]).filter(x=>x.salonId!==sid);
    }

    if(fd.has('suppliers')){
      data.suppliers=(data.suppliers||[]).filter(x=>x.salonId!==sid);
    }

    data.auditLog=data.auditLog||[];
    data.auditLog.push({
      id:id(),salonId:sid,type:'SECTION_RESET',
      reason:String(fd.get('reason')||''),
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Reinicio aplicado');
    setTimeout(()=>renderSalonShell(),100);
  };
};

// ------------------------------------------------------------
// REPARA LOS BOTONES DE FINANZAS, AUNQUE VENGAN DE VERSIONES VIEJAS
// ------------------------------------------------------------
function repairResetButtons52(){
  document.querySelectorAll('button').forEach(btn=>{
    const txt=String(btn.textContent||'').toLowerCase();

    if(txt.includes('poner movimientos en $0')){
      btn.onclick=e=>{
        e?.preventDefault?.();
        zeroMoney52();
      };
      btn.setAttribute('onclick','zeroMoney52()');
    }

    if(txt.includes('reinicio por secciones')){
      btn.onclick=e=>{
        e?.preventDefault?.();
        sectionReset52();
      };
      btn.setAttribute('onclick','sectionReset52()');

      // Botón extra de reinicio total, una sola vez.
      const parent=btn.parentElement;
      if(parent && !document.querySelector('#fullResetBtn52')){
        const full=document.createElement('button');
        full.id='fullResetBtn52';
        full.className='danger';
        full.innerHTML='⚠️ Reiniciar sistema completo';
        full.onclick=()=>fullReset52();
        parent.appendChild(full);
      }
    }
  });
}

setTimeout(repairResetButtons52,250);
setInterval(repairResetButtons52,1200);

})();


// ============================================================
// V53 - COMUNIDAD DE PROVEEDORES + CATÁLOGO Y COMPRAS
// ============================================================
(function(){
'use strict';

data.providerProducts=data.providerProducts||[];
data.providerOffers=data.providerOffers||[];
data.communityMessages=data.communityMessages||[];

const N53=v=>Number(v||0);
const norm53=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esc53=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money53=v=>{
  try{return money(v)}catch(e){
    return '$ '+N53(v).toLocaleString('es-AR');
  }
};
const SID53=()=>{
  try{return session?.salonId}catch(e){return window.session?.salonId}
};

function provider53(){
  const list=data.marketSuppliers||[];
  let p=null;
  const ss=(typeof session!=='undefined'?session:window.session)||{};

  const ids=[
    ss.providerId,ss.supplierId,ss.marketSupplierId,ss.userId,ss.id
  ].filter(Boolean).map(String);

  p=list.find(x=>ids.includes(String(x.id)));
  if(p)return p;

  const email=norm53(ss.email||ss.userEmail);
  if(email)p=list.find(x=>norm53(x.email)===email);
  if(p)return p;

  const name=norm53(ss.name||ss.businessName||ss.providerName);
  if(name)p=list.find(x=>norm53(x.name||x.businessName)===name);
  return p||null;
}
function providerId53(){
  const p=provider53();
  const ss=(typeof session!=='undefined'?session:window.session)||{};
  return p?.id || ss.providerId || ss.supplierId || ss.marketSupplierId || ss.userId || '';
}
function providerProducts53(pid=providerId53()){
  return (data.providerProducts||[]).filter(x=>String(x.providerId)===String(pid)&&x.active!==false);
}
function communityProviders53(){
  return (data.marketSuppliers||[]).filter(x=>x.status!=='Suspendido'&&x.active!==false);
}
function ownProviders53(){
  return (data.suppliers||[]).filter(x=>x.salonId===SID53());
}
function stockProducts53(){
  return (data.stockProducts||[]).filter(x=>x.salonId===SID53());
}

// ------------------------------------------------------------
// PROVEEDOR - BOTÓN COMUNIDAD
// ------------------------------------------------------------
function injectProviderCommunityButton53(){
  const ss=(typeof session!=='undefined'?session:window.session)||{};
  if(ss.role!=='provider' && ss.role!=='supplier')return;

  if(document.querySelector('#provider-community-btn53'))return;

  const candidates=[
    document.querySelector('.topbar .toolbar'),
    document.querySelector('.nav'),
    document.querySelector('.toolbar'),
    document.querySelector('header'),
    document.querySelector('#app')
  ].filter(Boolean);

  const host=candidates[0];
  if(!host)return;

  const btn=document.createElement('button');
  btn.id='provider-community-btn53';
  btn.className='secondary';
  btn.innerHTML='💬 Comunidad';
  btn.onclick=()=>renderProviderCommunity53();
  host.appendChild(btn);
}

window.renderProviderCommunity53=function(){
  const p=provider53();
  const pid=providerId53();

  if(!pid){
    return toast('No se pudo identificar el proveedor de la sesión');
  }

  const products=providerProducts53(pid);
  const offers=(data.providerOffers||[])
    .filter(x=>String(x.providerId)===String(pid))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h2>💬 Comunidad de salones</h2>
          <small class="muted">Publicá ofertas para que las vean los salones de la comunidad.</small>
        </div>
        <button class="primary" onclick="openProviderOffer53()">+ Publicar oferta</button>
      </div>
    </div>

    <div class="grid" style="margin-top:14px">
      <div class="card">
        <div class="section-title">
          <div><h3>Mis productos</h3><small class="muted">Estos productos y precios aparecen cuando un salón te elige para comprar.</small></div>
          <button class="secondary small" onclick="openProviderProduct53()">+ Producto</button>
        </div>

        ${products.length?`
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Producto</th><th>Precio</th><th>Unidad</th><th></th></tr></thead>
              <tbody>${products.map(x=>`
                <tr>
                  <td><b>${esc53(x.name)}</b><small style="display:block">${esc53(x.description||'')}</small></td>
                  <td>${money53(x.price)}</td>
                  <td>${esc53(x.unit||'unidad')}</td>
                  <td><button class="secondary small" onclick="openProviderProduct53('${x.id}')">Editar</button></td>
                </tr>`).join('')}</tbody>
            </table>
          </div>`:'<div class="empty">Todavía no cargaste productos.</div>'}
      </div>

      <div class="card">
        <h3>Ofertas publicadas</h3>
        ${offers.length?offers.map(o=>`
          <div class="card" style="margin:8px 0;padding:12px">
            <b>${esc53(o.title)}</b>
            <div>${esc53(o.message)}</div>
            <small>${new Date(o.createdAt).toLocaleString('es-AR')}</small>
          </div>`).join(''):'<div class="empty">Sin ofertas publicadas.</div>'}
      </div>
    </div>
  `;
};

window.openProviderProduct53=function(idp=''){
  const pid=providerId53();
  const old=idp?(data.providerProducts||[]).find(x=>x.id===idp&&String(x.providerId)===String(pid)):null;

  showModal(`
    <div class="modal-title">
      <div><h2>${old?'Editar':'Agregar'} producto</h2><p>Producto visible para los salones.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="providerProduct53">
      <div class="form-grid">
        <div class="field span2"><label>Producto</label><input name="name" required value="${esc53(old?.name||'')}"></div>
        <div class="field"><label>Precio</label><input name="price" type="number" min="0" required value="${N53(old?.price)}"></div>
        <div class="field"><label>Unidad</label><input name="unit" value="${esc53(old?.unit||'unidad')}" placeholder="unidad, caja, kg..."></div>
        <div class="field span2"><label>Descripción</label><textarea name="description">${esc53(old?.description||'')}</textarea></div>
      </div>
      <div class="form-actions"><button class="primary">Guardar</button></div>
    </form>
  `);

  document.querySelector('#providerProduct53').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const obj={
      ...(old||{}),
      id:old?.id||id(),
      providerId:pid,
      providerName:provider53()?.name||provider53()?.businessName||'Proveedor',
      name:String(f.name||'').trim(),
      price:N53(f.price),
      unit:String(f.unit||'unidad').trim(),
      description:String(f.description||'').trim(),
      active:true
    };
    if(old){
      const ix=data.providerProducts.findIndex(x=>x.id===old.id);
      data.providerProducts[ix]=obj;
    }else data.providerProducts.push(obj);
    save(); closeModal(); renderProviderCommunity53(); toast('Producto guardado');
  };
};

window.openProviderOffer53=function(){
  const pid=providerId53();
  const p=provider53();

  showModal(`
    <div class="modal-title">
      <div><h2>Publicar oferta</h2><p>La verán los salones en su comunidad.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>
    <form id="offer53">
      <div class="field"><label>Título</label><input name="title" required></div>
      <div class="field"><label>Mensaje / oferta</label><textarea name="message" required></textarea></div>
      <div class="form-actions"><button class="primary">Publicar</button></div>
    </form>
  `);

  document.querySelector('#offer53').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    data.providerOffers.push({
      id:id(),
      providerId:pid,
      providerName:p?.name||p?.businessName||'Proveedor',
      title:String(f.title||'').trim(),
      message:String(f.message||'').trim(),
      createdAt:new Date().toISOString(),
      active:true
    });
    save(); closeModal(); renderProviderCommunity53(); toast('Oferta publicada');
  };
};

// ------------------------------------------------------------
// SALÓN - OFERTAS DE PROVEEDORES COMO COMUNIDAD
// ------------------------------------------------------------
function providerOffersCard53(){
  const offers=(data.providerOffers||[])
    .filter(x=>x.active!==false)
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
    .slice(0,20);

  return `
    <div class="card" style="margin-top:14px">
      <div class="section-title">
        <div>
          <h3>💬 Ofertas de proveedores · Comunidad</h3>
          <small class="muted">Mensajes y promociones publicados por proveedores de la comunidad.</small>
        </div>
      </div>
      ${offers.length?offers.map(o=>`
        <div class="card" style="margin:8px 0;padding:12px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <b>${esc53(o.providerName||'Proveedor')}</b>
              <div style="margin-top:4px"><b>${esc53(o.title)}</b></div>
              <div>${esc53(o.message)}</div>
            </div>
            <button class="secondary small" onclick="openPurchaseFromCommunity53('${o.providerId}')">Ver productos / comprar</button>
          </div>
        </div>`).join(''):'<div class="empty">Todavía no hay ofertas publicadas.</div>'}
    </div>
  `;
}

// ------------------------------------------------------------
// SALÓN - PROVEEDORES Y NUEVA COMPRA
// ------------------------------------------------------------
window.renderSuppliersV53=function(){
  const own=ownProviders53();
  const community=communityProviders53();
  const purchases=(data.stockPurchases||[])
    .filter(x=>x.salonId===SID53())
    .sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));

  setTitle('Proveedores','Compras y comunidad');

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>🚚 Proveedores</h3>
          <small class="muted">Comprá a proveedores propios o a proveedores de la comunidad.</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openManualSupplier51()">+ Agregar proveedor manual</button>
          <button class="primary" onclick="openStockPurchase53()">+ Nueva compra</button>
        </div>
      </div>
    </div>

    ${providerOffersCard53()}

    <div class="grid" style="margin-top:14px">
      <div class="card">
        <h3>Mis proveedores</h3>
        ${own.length?own.map(s=>`
          <div style="padding:10px 0;border-bottom:1px solid #eee">
            <b>${esc53(s.name||s.businessName||'Proveedor')}</b>
            <small style="display:block">${esc53(s.phone||s.whatsapp||'')} ${s.email?'· '+esc53(s.email):''}</small>
          </div>`).join(''):'<div class="empty">Sin proveedores manuales.</div>'}
      </div>

      <div class="card">
        <h3>Proveedores de la comunidad</h3>
        ${community.length?community.map(s=>{
          const cnt=providerProducts53(s.id).length;
          return `
          <div style="padding:10px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;gap:8px">
            <div>
              <b>${esc53(s.name||s.businessName||'Proveedor')}</b>
              <small style="display:block">${cnt} producto(s) publicados</small>
            </div>
            <button class="secondary small" onclick="openPurchaseFromCommunity53('${s.id}')">Ver productos</button>
          </div>`;
        }).join(''):'<div class="empty">No hay proveedores comunitarios.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Compras registradas</h3>
      ${purchases.length?`
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Producto</th><th>Cantidad</th><th>Unitario</th><th>Total</th><th>Pago</th><th>Entrega</th></tr></thead>
            <tbody>${purchases.map(p=>`
              <tr>
                <td>${esc53(p.date||p.createdAt?.slice?.(0,10)||'')}</td>
                <td>${esc53(p.supplierName||'')}</td>
                <td>${esc53(p.productName||'')}</td>
                <td>${N53(p.qty)}</td>
                <td>${money53(p.unitCost||0)}</td>
                <td>${money53(p.total||0)}</td>
                <td>${esc53(p.paymentStatus||'Pendiente')}</td>
                <td>${esc53(p.deliveryStatus||'Pendiente de entrega')}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`:'<div class="empty">Todavía no hay compras.</div>'}
    </div>
  `;
};

window.openPurchaseFromCommunity53=function(providerId){
  openStockPurchase53(`community:${providerId}`);
};

window.openStockPurchase53=function(preselect=''){
  const own=ownProviders53();
  const community=communityProviders53();

  const options=[
    '<option value="">Seleccionar proveedor</option>',
    own.length?'<optgroup label="Mis proveedores">'+own.map(s=>`<option value="own:${s.id}" ${preselect===`own:${s.id}`?'selected':''}>${esc53(s.name||s.businessName||'Proveedor')}</option>`).join('')+'</optgroup>':'',
    community.length?'<optgroup label="Proveedores de la comunidad">'+community.map(s=>`<option value="community:${s.id}" ${preselect===`community:${s.id}`?'selected':''}>${esc53(s.name||s.businessName||'Proveedor')}</option>`).join('')+'</optgroup>':''
  ].join('');

  showModal(`
    <div class="modal-title">
      <div><h2>Nueva compra</h2><p>Proveedor propio o proveedor de la comunidad.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="purchase53">
      <div class="form-grid">
        <div class="field span2">
          <label>Proveedor</label>
          <select id="supplier53" name="supplier" required>${options}</select>
        </div>

        <div class="field span2">
          <label>Producto</label>
          <select id="product53" name="product" required>
            <option value="">Primero seleccioná un proveedor</option>
          </select>
          <small id="productHelp53" class="muted"></small>
        </div>

        <div class="field"><label>Cantidad</label><input id="qty53" name="qty" type="number" min="1" value="1" required></div>
        <div class="field"><label>Costo unitario</label><input id="cost53" name="unitCost" type="number" min="0" required></div>
        <div class="field"><label>Total</label><input id="total53" readonly></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>

        <div class="field">
          <label>Estado de pago</label>
          <select name="paymentStatus"><option>Pendiente</option><option>Pagado</option></select>
        </div>
        <div class="field">
          <label>Entrega</label>
          <select name="deliveryStatus"><option>Pendiente de entrega</option><option>Entregado</option></select>
        </div>
      </div>

      <div class="form-actions"><button class="primary">Registrar compra</button></div>
    </form>
  `);

  const sEl=$('#supplier53'), pEl=$('#product53'), qEl=$('#qty53'), cEl=$('#cost53'), tEl=$('#total53'), help=$('#productHelp53');

  function syncProducts(){
    const [source,pid]=String(sEl.value||'').split(':');
    if(!pid){
      pEl.innerHTML='<option value="">Primero seleccioná un proveedor</option>';
      cEl.value='';
      return;
    }

    if(source==='community'){
      const ps=providerProducts53(pid);
      pEl.innerHTML='<option value="">Seleccionar producto del proveedor</option>'+
        ps.map(p=>`<option value="communityProduct:${p.id}">${esc53(p.name)} · ${money53(p.price)} / ${esc53(p.unit||'unidad')}</option>`).join('');
      help.textContent='Productos y precios publicados por este proveedor en la comunidad.';
      cEl.readOnly=true;
    }else{
      const ps=stockProducts53();
      pEl.innerHTML='<option value="">Seleccionar producto de Stock</option>'+
        ps.map(p=>`<option value="stockProduct:${p.id}">${esc53(p.name)}</option>`).join('');
      help.textContent='Para proveedores manuales se utilizan los productos creados en Stock.';
      cEl.readOnly=false;
    }
    cEl.value='';
    tEl.value=money53(0);
  }

  function syncPrice(){
    const [source,pid]=String(sEl.value||'').split(':');
    const [ptype,prodId]=String(pEl.value||'').split(':');
    if(source==='community'){
      const p=(data.providerProducts||[]).find(x=>x.id===prodId&&String(x.providerId)===String(pid));
      cEl.value=N53(p?.price);
    }else{
      const p=(data.stockProducts||[]).find(x=>x.id===prodId&&x.salonId===SID53());
      if(p && !cEl.value)cEl.value=N53(p.costPrice);
    }
    tEl.value=money53(N53(qEl.value)*N53(cEl.value));
  }

  sEl.onchange=syncProducts;
  pEl.onchange=syncPrice;
  qEl.oninput=syncPrice;
  cEl.oninput=syncPrice;

  syncProducts();
  if(preselect){
    sEl.value=preselect;
    syncProducts();
  }

  $('#purchase53').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const [source,supplierId]=String(f.supplier).split(':');
    const [,productId]=String(f.product).split(':');

    let sup=null, prod=null;
    if(source==='community'){
      sup=communityProviders53().find(x=>String(x.id)===String(supplierId));
      prod=(data.providerProducts||[]).find(x=>x.id===productId&&String(x.providerId)===String(supplierId));
    }else{
      sup=ownProviders53().find(x=>String(x.id)===String(supplierId));
      prod=stockProducts53().find(x=>x.id===productId);
    }
    if(!sup||!prod)return toast('Proveedor o producto no encontrado');

    const qty=N53(f.qty);
    const unitCost=source==='community'?N53(prod.price):N53(f.unitCost);
    const total=qty*unitCost;

    data.stockPurchases=data.stockPurchases||[];
    const purchase={
      id:id(),salonId:SID53(),
      supplierId,supplierSource:source,
      supplierName:sup.name||sup.businessName||'Proveedor',
      productId:prod.id,
      productName:prod.name,
      qty,unitCost,total,
      date:f.date,
      paymentStatus:f.paymentStatus,
      deliveryStatus:f.deliveryStatus,
      createdAt:new Date().toISOString()
    };
    data.stockPurchases.push(purchase);

    // Si viene de comunidad y se entrega, intenta sumar al producto de stock del mismo nombre.
    if(f.deliveryStatus==='Entregado'){
      let stock=stockProducts53().find(x=>norm53(x.name)===norm53(prod.name));
      if(!stock){
        stock={
          id:id(),salonId:SID53(),name:prod.name,
          category:'Compra a comunidad',
          stock:0,minStock:0,costPrice:unitCost,salePrice:0
        };
        data.stockProducts.push(stock);
      }
      stock.stock=N53(stock.stock)+qty;
      stock.costPrice=unitCost;
    }

    if(f.paymentStatus==='Pagado'){
      data.movements=data.movements||[];
      data.movements.push({
        id:id(),salonId:SID53(),
        type:'Gasto',category:'Compra de stock',
        concept:`Compra ${prod.name} · ${purchase.supplierName}`,
        amount:total,movementDate:f.date,
        createdAt:new Date().toISOString(),
        sourceKey:`v53:purchase:${purchase.id}`
      });
    }

    save(); closeModal(); renderSuppliersV53(); toast('Compra registrada');
  };
};

// ------------------------------------------------------------
// RUTAS / INYECCIÓN
// ------------------------------------------------------------
const route53=renderSalonView;
renderSalonView=function(){
  if(view==='suppliers')return renderSuppliersV53();
  return route53();
};

// Si ya existe una pantalla "community" para salón, agrega ofertas.
const oldCommunity53=window.renderCommunity;
if(typeof oldCommunity53==='function'){
  window.renderCommunity=function(){
    const r=oldCommunity53.apply(this,arguments);
    setTimeout(()=>{
      if(session?.role==='salon' && !document.querySelector('#provider-offers-community53')){
        const c=document.createElement('div');
        c.id='provider-offers-community53';
        c.innerHTML=providerOffersCard53();
        document.querySelector('#content')?.appendChild(c);
      }
    },50);
    return r;
  };
}

setTimeout(injectProviderCommunityButton53,300);
setInterval(injectProviderCommunityButton53,1400);

})();


// ============================================================
// V54 - PROVEEDOR DE COMUNIDAD = USUARIO PROVEEDOR + SU CATÁLOGO
// ============================================================
(function(){
'use strict';

data.providerProducts=data.providerProducts||[];

const N54=v=>Number(v||0);
const norm54=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc54=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money54=v=>{
  try{return money(v)}catch(e){return '$ '+N54(v).toLocaleString('es-AR')}
};
const SID54=()=>{
  try{return session?.salonId}catch(e){return window.session?.salonId}
};
const sess54=()=>{
  try{return session||{}}catch(e){return window.session||{}}
};

function providerDisplay54(p){
  if(!p)return 'Proveedor';
  return String(
    p.username ||
    p.userName ||
    p.providerName ||
    p.name ||
    p.businessName ||
    p.companyName ||
    p.email ||
    'Proveedor'
  ).trim();
}

function providerKeys54(p){
  if(!p)return [];
  return [
    p.id,p.userId,p.providerId,p.supplierId,
    p.username,p.userName,p.email,
    p.name,p.businessName,p.providerName,p.companyName
  ].filter(Boolean).map(x=>norm54(x));
}

function sessionKeys54(){
  const s=sess54();
  return [
    s.id,s.userId,s.providerId,s.supplierId,s.marketSupplierId,
    s.username,s.userName,s.email,s.userEmail,
    s.name,s.businessName,s.providerName,s.companyName
  ].filter(Boolean).map(x=>norm54(x));
}

// Busca el registro de comunidad que corresponde REALMENTE al usuario proveedor.
function providerAccount54(){
  const providers=(data.marketSuppliers||[]).filter(p=>p.status!=='Suspendido'&&p.active!==false);
  const sk=sessionKeys54();

  // Coincidencia por cualquier identificador / usuario / email / nombre.
  let found=providers.find(p=>providerKeys54(p).some(k=>sk.includes(k)));
  if(found)return found;

  // Compatibilidad por email sin mayúsculas.
  const s=sess54();
  if(s.email||s.userEmail){
    const mail=norm54(s.email||s.userEmail);
    found=providers.find(p=>norm54(p.email)===mail);
    if(found)return found;
  }

  return null;
}

function canonicalProviderId54(p){
  return p?.id || '';
}

// Producto pertenece a proveedor por ID canónico o identificadores heredados.
function productBelongs54(prod,p){
  if(!prod||!p)return false;
  const pk=providerKeys54(p);
  const vals=[
    prod.providerId,prod.providerUserId,prod.userId,
    prod.providerEmail,prod.providerName
  ].filter(Boolean).map(x=>norm54(x));
  return vals.some(v=>pk.includes(v));
}

function productsForProvider54(p){
  return (data.providerProducts||[])
    .filter(x=>x.active!==false && productBelongs54(x,p))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}

function communityProviders54(){
  return (data.marketSuppliers||[])
    .filter(p=>p.status!=='Suspendido'&&p.active!==false)
    .map(p=>({
      raw:p,
      id:p.id,
      display:providerDisplay54(p),
      products:productsForProvider54(p)
    }))
    .filter(x=>x.id);
}

function ownProviders54(){
  return (data.suppliers||[]).filter(x=>x.salonId===SID54());
}
function stockProducts54(){
  return (data.stockProducts||[]).filter(x=>x.salonId===SID54());
}

// Migra productos cargados por un proveedor con IDs viejos hacia el ID real del usuario proveedor.
function normalizeCurrentProvider54(){
  const p=providerAccount54();
  if(!p)return;
  const s=sess54();
  const legacy=[
    s.id,s.userId,s.providerId,s.supplierId,s.marketSupplierId,
    s.username,s.userName,s.email,s.userEmail,
    s.name,s.businessName,s.providerName
  ].filter(Boolean).map(norm54);

  let changed=false;
  (data.providerProducts||[]).forEach(prod=>{
    const val=norm54(prod.providerId);
    if(val && legacy.includes(val) && String(prod.providerId)!==String(p.id)){
      prod.providerId=p.id;
      prod.providerName=providerDisplay54(p);
      changed=true;
    }
  });
  if(changed)save();
}

normalizeCurrentProvider54();

// ------------------------------------------------------------
// PROVEEDOR: catálogo siempre asociado a SU usuario.
// ------------------------------------------------------------
window.renderProviderCommunity54=function(){
  const p=providerAccount54();
  if(!p){
    return toast('No se pudo vincular este usuario con un proveedor de la comunidad');
  }

  normalizeCurrentProvider54();
  const products=productsForProvider54(p);
  const offers=(data.providerOffers||[])
    .filter(x=>String(x.providerId)===String(p.id))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h2>💬 Comunidad · ${esc54(providerDisplay54(p))}</h2>
          <small class="muted">Todo producto que cargues acá queda asociado a tu usuario proveedor.</small>
        </div>
        <button class="primary" onclick="openProviderOffer53()">+ Publicar oferta</button>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-title">
        <div>
          <h3>Mis productos y precios</h3>
          <small class="muted">Los salones verán exactamente este catálogo cuando seleccionen ${esc54(providerDisplay54(p))}.</small>
        </div>
        <button class="secondary" onclick="openProviderProduct54()">+ Agregar producto</button>
      </div>

      ${products.length?`
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Producto</th><th>Precio</th><th>Unidad</th><th>Acción</th></tr></thead>
          <tbody>${products.map(x=>`
            <tr>
              <td><b>${esc54(x.name)}</b><small style="display:block">${esc54(x.description||'')}</small></td>
              <td><b>${money54(x.price)}</b></td>
              <td>${esc54(x.unit||'unidad')}</td>
              <td><button class="secondary small" onclick="openProviderProduct54('${x.id}')">Editar</button></td>
            </tr>`).join('')}</tbody>
        </table></div>
      `:'<div class="empty">Todavía no cargaste productos.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Ofertas publicadas</h3>
      ${offers.length?offers.map(o=>`
        <div style="padding:10px 0;border-bottom:1px solid #eee">
          <b>${esc54(o.title)}</b>
          <div>${esc54(o.message)}</div>
        </div>`).join(''):'<div class="empty">Sin ofertas publicadas.</div>'}
    </div>
  `;
};

window.openProviderProduct54=function(productId=''){
  const p=providerAccount54();
  if(!p)return toast('Proveedor no identificado');

  const old=productId?(data.providerProducts||[]).find(x=>x.id===productId&&productBelongs54(x,p)):null;

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${old?'Editar':'Agregar'} producto</h2>
        <p>Proveedor: <b>${esc54(providerDisplay54(p))}</b></p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="providerProduct54">
      <div class="form-grid">
        <div class="field span2"><label>Producto</label><input name="name" required value="${esc54(old?.name||'')}"></div>
        <div class="field"><label>Precio publicado</label><input name="price" type="number" min="0" required value="${N54(old?.price)}"></div>
        <div class="field"><label>Unidad</label><input name="unit" value="${esc54(old?.unit||'unidad')}" placeholder="unidad, caja, kg..."></div>
        <div class="field span2"><label>Descripción</label><textarea name="description">${esc54(old?.description||'')}</textarea></div>
      </div>
      <div class="form-actions">
        <button class="primary">Guardar producto</button>
      </div>
    </form>
  `);

  $('#providerProduct54').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));

    const obj={
      ...(old||{}),
      id:old?.id||id(),
      providerId:p.id,
      providerUserId:p.userId||p.id,
      providerEmail:p.email||'',
      providerName:providerDisplay54(p),
      name:String(f.name||'').trim(),
      price:N54(f.price),
      unit:String(f.unit||'unidad').trim(),
      description:String(f.description||'').trim(),
      active:true
    };

    if(old){
      const ix=data.providerProducts.findIndex(x=>x.id===old.id);
      if(ix>=0)data.providerProducts[ix]=obj;
    }else data.providerProducts.push(obj);

    save(); closeModal(); renderProviderCommunity54(); toast('Producto guardado');
  };
};

// Compatibilidad del botón anterior.
window.renderProviderCommunity53=window.renderProviderCommunity54;
window.openProviderProduct53=window.openProviderProduct54;

// ------------------------------------------------------------
// SALÓN: NUEVA COMPRA POR NOMBRE REAL DEL USUARIO PROVEEDOR.
// ------------------------------------------------------------
window.openStockPurchase54=function(preselect=''){
  const own=ownProviders54();
  const community=communityProviders54();

  const providerOptions=`
    <option value="">Seleccionar proveedor</option>
    ${own.length?`
      <optgroup label="Mis proveedores">
        ${own.map(s=>`<option value="own:${s.id}" ${preselect===`own:${s.id}`?'selected':''}>${esc54(s.name||s.businessName||'Proveedor')}</option>`).join('')}
      </optgroup>`:''}
    ${community.length?`
      <optgroup label="Proveedores de la comunidad">
        ${community.map(c=>`<option value="community:${c.id}" ${preselect===`community:${c.id}`?'selected':''}>${esc54(c.display)}</option>`).join('')}
      </optgroup>`:''}
  `;

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Nueva compra</h2>
        <p>Elegí un proveedor y luego uno de sus productos.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="purchase54">
      <div class="form-grid">
        <div class="field span2">
          <label>Proveedor</label>
          <select id="supplier54" name="supplier" required>${providerOptions}</select>
        </div>

        <div class="field span2">
          <label>Producto</label>
          <select id="product54" name="product" required>
            <option value="">Primero seleccioná un proveedor</option>
          </select>
          <small id="productHelp54" class="muted"></small>
        </div>

        <div class="field"><label>Cantidad</label><input id="qty54" name="qty" type="number" min="1" value="1" required></div>
        <div class="field"><label>Precio unitario</label><input id="cost54" name="unitCost" type="number" min="0" required></div>
        <div class="field"><label>Total</label><input id="total54" readonly></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>

        <div class="field">
          <label>Estado de pago</label>
          <select name="paymentStatus"><option>Pendiente</option><option>Pagado</option></select>
        </div>
        <div class="field">
          <label>Entrega</label>
          <select name="deliveryStatus"><option>Pendiente de entrega</option><option>Entregado</option></select>
        </div>
      </div>

      <div class="form-actions">
        <button class="primary">Registrar compra</button>
      </div>
    </form>
  `);

  const sEl=$('#supplier54');
  const pEl=$('#product54');
  const qEl=$('#qty54');
  const cEl=$('#cost54');
  const tEl=$('#total54');
  const help=$('#productHelp54');

  function selectedCommunity54(id){
    return community.find(x=>String(x.id)===String(id));
  }

  function loadProducts54(){
    const [source,pid]=String(sEl.value||'').split(':');

    if(!pid){
      pEl.innerHTML='<option value="">Primero seleccioná un proveedor</option>';
      cEl.value='';
      cEl.readOnly=false;
      help.textContent='';
      tEl.value=money54(0);
      return;
    }

    if(source==='community'){
      const c=selectedCommunity54(pid);
      const products=c?.products||[];

      pEl.innerHTML='<option value="">Seleccionar producto de '+esc54(c?.display||'proveedor')+'</option>'+
        products.map(p=>`
          <option value="community:${p.id}">
            ${esc54(p.name)} · ${money54(p.price)} / ${esc54(p.unit||'unidad')}
          </option>`).join('');

      help.textContent=products.length
        ? `Catálogo publicado por ${c.display}. El precio lo define el proveedor.`
        : `${c?.display||'Este proveedor'} todavía no cargó productos.`;

      cEl.readOnly=true;
      cEl.value='';
    }else{
      const products=stockProducts54();
      pEl.innerHTML='<option value="">Seleccionar producto de Stock</option>'+
        products.map(p=>`<option value="stock:${p.id}">${esc54(p.name)}</option>`).join('');
      help.textContent='Proveedor manual: productos tomados del Stock del salón.';
      cEl.readOnly=false;
      cEl.value='';
    }

    tEl.value=money54(0);
  }

  function loadPrice54(){
    const [source,pid]=String(sEl.value||'').split(':');
    const [,productId]=String(pEl.value||'').split(':');

    if(source==='community'){
      const c=selectedCommunity54(pid);
      const p=(c?.products||[]).find(x=>String(x.id)===String(productId));
      cEl.value=p?N54(p.price):'';
    }else{
      const p=stockProducts54().find(x=>String(x.id)===String(productId));
      if(p)cEl.value=N54(p.costPrice);
    }
    tEl.value=money54(N54(qEl.value)*N54(cEl.value));
  }

  sEl.onchange=loadProducts54;
  pEl.onchange=loadPrice54;
  qEl.oninput=loadPrice54;
  cEl.oninput=loadPrice54;

  if(preselect){
    sEl.value=preselect;
    loadProducts54();
  }

  $('#purchase54').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const [source,supplierId]=String(f.supplier||'').split(':');
    const [,productId]=String(f.product||'').split(':');

    let sup=null, prod=null, supplierName='Proveedor';

    if(source==='community'){
      const c=selectedCommunity54(supplierId);
      if(c){
        sup=c.raw;
        supplierName=c.display;
        prod=c.products.find(x=>String(x.id)===String(productId));
      }
    }else{
      sup=own.find(x=>String(x.id)===String(supplierId));
      supplierName=sup?.name||sup?.businessName||'Proveedor';
      prod=stockProducts54().find(x=>String(x.id)===String(productId));
    }

    if(!sup)return toast('Proveedor no encontrado');
    if(!prod)return toast('Producto no encontrado');

    const qty=N54(f.qty);
    const unitCost=source==='community'?N54(prod.price):N54(f.unitCost);
    const total=qty*unitCost;

    data.stockPurchases=data.stockPurchases||[];
    const purchase={
      id:id(),salonId:SID54(),
      supplierId,
      supplierSource:source,
      supplierName,
      productId:prod.id,
      productName:prod.name,
      qty,unitCost,total,
      date:f.date,
      paymentStatus:f.paymentStatus,
      deliveryStatus:f.deliveryStatus,
      createdAt:new Date().toISOString()
    };
    data.stockPurchases.push(purchase);

    if(f.deliveryStatus==='Entregado'){
      let stock=stockProducts54().find(x=>norm54(x.name)===norm54(prod.name));
      if(!stock){
        stock={
          id:id(),salonId:SID54(),
          name:prod.name,
          category:source==='community'?'Compra a comunidad':'',
          stock:0,minStock:0,
          costPrice:unitCost,salePrice:0
        };
        data.stockProducts.push(stock);
      }
      stock.stock=N54(stock.stock)+qty;
      stock.costPrice=unitCost;
    }

    if(f.paymentStatus==='Pagado'){
      data.movements=data.movements||[];
      data.movements.push({
        id:id(),salonId:SID54(),
        type:'Gasto',category:'Compra de stock',
        concept:`Compra ${prod.name} · ${supplierName}`,
        amount:total,movementDate:f.date,
        createdAt:new Date().toISOString(),
        sourceKey:`v54:purchase:${purchase.id}`
      });
    }

    save();closeModal();
    if(typeof renderSuppliersV53==='function')renderSuppliersV53();
    toast('Compra registrada');
  };
};

window.openStockPurchase53=window.openStockPurchase54;
window.openPurchaseFromCommunity53=function(providerId){
  openStockPurchase54(`community:${providerId}`);
};

// ------------------------------------------------------------
// SALÓN: lista comunitaria muestra nombre de usuario + catálogo.
// ------------------------------------------------------------
const oldSuppliers54=window.renderSuppliersV53;
window.renderSuppliersV54=function(){
  oldSuppliers54();

  setTimeout(()=>{
    const content=document.querySelector('#content');
    if(!content)return;

    // Sustituye la tarjeta de comunidad por una lista inequívoca.
    const cards=[...content.querySelectorAll('.card')];
    const old=cards.find(c=>norm54(c.textContent).includes('proveedores de la comunidad'));
    if(!old)return;

    const community=communityProviders54();

    old.innerHTML=`
      <h3>Proveedores de la comunidad</h3>
      <small class="muted">El nombre es el mismo que figura en el usuario proveedor.</small>
      ${community.length?community.map(c=>`
        <div style="padding:12px 0;border-bottom:1px solid #eee">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
            <div>
              <b>${esc54(c.display)}</b>
              <small style="display:block">${c.products.length} producto(s) cargados</small>
              ${c.products.length?`
                <div style="margin-top:6px">
                  ${c.products.slice(0,4).map(p=>`<span class="pill">${esc54(p.name)} · ${money54(p.price)}</span>`).join(' ')}
                </div>`:''}
            </div>
            <button class="secondary small" onclick="openStockPurchase54('community:${c.id}')">Comprar</button>
          </div>
        </div>`).join(''):'<div class="empty">No hay proveedores de la comunidad.</div>'}
    `;
  },50);
};
window.renderSuppliersV53=window.renderSuppliersV54;

// Ruta final para asegurar que se use V54.
const route54=renderSalonView;
renderSalonView=function(){
  if(view==='suppliers')return renderSuppliersV54();
  return route54();
};

})();


// ============================================================
// V55 - PERFIL PROVEEDOR + CATÁLOGO COMPLETO + PEDIDOS POR DESTINO
// ============================================================
(function(){
'use strict';

data.providerProducts=data.providerProducts||[];
data.marketSuppliers=data.marketSuppliers||[];
data.stockPurchases=data.stockPurchases||[];

const N55=v=>Number(v||0);
const norm55=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc55=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money55=v=>{
  try{return money(v)}catch(e){return '$ '+N55(v).toLocaleString('es-AR')}
};
const SID55=()=>{
  try{return session?.salonId}catch(e){return window.session?.salonId}
};
const sess55=()=>{
  try{return session||{}}catch(e){return window.session||{}}
};

function providerDisplay55(p){
  return String(
    p?.fantasyName ||
    p?.businessName ||
    p?.providerName ||
    p?.name ||
    p?.username ||
    p?.userName ||
    p?.email ||
    'Proveedor'
  ).trim();
}
function providerKeys55(p){
  if(!p)return [];
  return [
    p.id,p.userId,p.providerId,p.supplierId,
    p.username,p.userName,p.email,
    p.name,p.businessName,p.fantasyName,p.providerName
  ].filter(Boolean).map(norm55);
}
function sessionKeys55(){
  const s=sess55();
  return [
    s.id,s.userId,s.providerId,s.supplierId,s.marketSupplierId,
    s.username,s.userName,s.email,s.userEmail,
    s.name,s.businessName,s.providerName
  ].filter(Boolean).map(norm55);
}
function providerAccount55(){
  const list=(data.marketSuppliers||[]).filter(p=>p.status!=='Suspendido'&&p.active!==false);
  const sk=sessionKeys55();
  return list.find(p=>providerKeys55(p).some(k=>sk.includes(k))) || null;
}
function productBelongs55(prod,p){
  if(!prod||!p)return false;
  const pk=providerKeys55(p);
  return [
    prod.providerId,prod.providerUserId,prod.userId,prod.providerEmail,prod.providerName
  ].filter(Boolean).map(norm55).some(v=>pk.includes(v));
}
function productsForProvider55(p){
  return (data.providerProducts||[])
    .filter(x=>x.active!==false&&productBelongs55(x,p))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}
function communityProviders55(){
  return (data.marketSuppliers||[])
    .filter(p=>p.status!=='Suspendido'&&p.active!==false)
    .map(p=>({raw:p,id:p.id,display:providerDisplay55(p),products:productsForProvider55(p)}));
}
function ownProviders55(){
  return (data.suppliers||[]).filter(x=>x.salonId===SID55());
}
function stockProducts55(){
  return (data.stockProducts||[]).filter(x=>x.salonId===SID55());
}
function events55(){
  return (data.events||[]).filter(x=>x.salonId===SID55()&&x.status!=='Cancelada')
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
}
function fileToDataUrl55(file,cb){
  if(!file){cb('');return;}
  const r=new FileReader();
  r.onload=()=>cb(String(r.result||''));
  r.onerror=()=>cb('');
  r.readAsDataURL(file);
}

// ------------------------------------------------------------
// PROVEEDOR: EDITAR PERFIL
// ------------------------------------------------------------
window.openProviderProfile55=function(){
  const p=providerAccount55();
  if(!p)return toast('No se pudo identificar el proveedor');

  showModal(`
    <div class="modal-title">
      <div><h2>Editar perfil del proveedor</h2><p>Datos visibles para los salones.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="providerProfile55">
      <div class="form-grid">
        <div class="field span2">
          <label>Nombre de fantasía</label>
          <input name="fantasyName" required value="${esc55(p.fantasyName||p.businessName||p.name||'')}">
        </div>
        <div class="field span2">
          <label>Dirección</label>
          <input name="address" value="${esc55(p.address||'')}">
        </div>
        <div class="field">
          <label>Teléfono / WhatsApp</label>
          <input name="phone" value="${esc55(p.phone||p.whatsapp||'')}">
        </div>
        <div class="field">
          <label>Email</label>
          <input name="email" type="email" value="${esc55(p.email||'')}">
        </div>
        <div class="field span2">
          <label>Logo del proveedor</label>
          <input name="logoFile" type="file" accept="image/*">
          ${p.logo?`<img src="${p.logo}" alt="Logo" style="margin-top:8px;max-width:150px;max-height:90px;object-fit:contain;border-radius:10px">`:''}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar perfil</button>
      </div>
    </form>
  `);

  $('#providerProfile55').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const file=e.target.querySelector('[name="logoFile"]')?.files?.[0];

    const finish=logo=>{
      p.fantasyName=String(fd.get('fantasyName')||'').trim();
      p.businessName=p.fantasyName;
      p.address=String(fd.get('address')||'').trim();
      p.phone=String(fd.get('phone')||'').trim();
      p.whatsapp=p.phone;
      p.email=String(fd.get('email')||'').trim();
      if(logo)p.logo=logo;

      // Actualiza nombre visible en catálogo ya cargado.
      (data.providerProducts||[]).forEach(prod=>{
        if(productBelongs55(prod,p))prod.providerName=providerDisplay55(p);
      });

      save();closeModal();renderProviderCommunity55();toast('Perfil actualizado');
    };

    if(file)fileToDataUrl55(file,finish); else finish('');
  };
};

// ------------------------------------------------------------
// PROVEEDOR: PRODUCTOS COMPLETOS
// ------------------------------------------------------------
window.openProviderProduct55=function(productId=''){
  const p=providerAccount55();
  if(!p)return toast('Proveedor no identificado');

  const old=productId?(data.providerProducts||[]).find(x=>x.id===productId&&productBelongs55(x,p)):null;

  showModal(`
    <div class="modal-title">
      <div><h2>${old?'Editar':'Agregar'} producto</h2><p>Este producto será visible para los salones.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="providerProduct55">
      <div class="form-grid">
        <div class="field span2"><label>Producto</label><input name="name" required value="${esc55(old?.name||'')}"></div>
        <div class="field"><label>Categoría</label><input name="category" required value="${esc55(old?.category||'')}"></div>
        <div class="field"><label>Costo / precio publicado</label><input name="price" type="number" min="0" required value="${N55(old?.price)}"></div>
        <div class="field"><label>Unidad</label><input name="unit" value="${esc55(old?.unit||'unidad')}" placeholder="unidad, caja, kg..."></div>
        <div class="field span2"><label>Descripción</label><textarea name="description" required>${esc55(old?.description||'')}</textarea></div>
        <div class="field span2">
          <label>Foto del producto</label>
          <input name="photoFile" type="file" accept="image/*">
          ${old?.photo?`<img src="${old.photo}" alt="Producto" style="margin-top:8px;max-width:180px;max-height:130px;object-fit:cover;border-radius:12px">`:''}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar producto</button>
      </div>
    </form>
  `);

  $('#providerProduct55').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const file=e.target.querySelector('[name="photoFile"]')?.files?.[0];

    const finish=photo=>{
      const obj={
        ...(old||{}),
        id:old?.id||id(),
        providerId:p.id,
        providerUserId:p.userId||p.id,
        providerEmail:p.email||'',
        providerName:providerDisplay55(p),
        name:String(fd.get('name')||'').trim(),
        category:String(fd.get('category')||'').trim(),
        description:String(fd.get('description')||'').trim(),
        price:N55(fd.get('price')),
        unit:String(fd.get('unit')||'unidad').trim(),
        active:true
      };
      if(photo)obj.photo=photo;

      if(old){
        const ix=data.providerProducts.findIndex(x=>x.id===old.id);
        if(ix>=0)data.providerProducts[ix]=obj;
      }else data.providerProducts.push(obj);

      save();closeModal();renderProviderCommunity55();toast('Producto guardado');
    };

    if(file)fileToDataUrl55(file,finish); else finish('');
  };
};

window.renderProviderCommunity55=function(){
  const p=providerAccount55();
  if(!p)return toast('No se pudo identificar el proveedor');

  const products=productsForProvider55(p);
  const offers=(data.providerOffers||[])
    .filter(x=>String(x.providerId)===String(p.id))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div style="display:flex;align-items:center;gap:12px">
          ${p.logo?`<img src="${p.logo}" style="width:58px;height:58px;object-fit:contain;border-radius:12px">`:''}
          <div>
            <h2>${esc55(providerDisplay55(p))}</h2>
            <small class="muted">${esc55(p.address||'')} ${p.phone?'· '+esc55(p.phone):''}</small>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openProviderProfile55()">✏️ Editar perfil</button>
          <button class="primary" onclick="openProviderOffer53()">+ Publicar oferta</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-title">
        <div><h3>Mis productos</h3><small class="muted">Catálogo visible para los salones.</small></div>
        <button class="secondary" onclick="openProviderProduct55()">+ Agregar producto</button>
      </div>

      ${products.length?`
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          ${products.map(x=>`
            <div class="card" style="margin:0">
              ${x.photo?`<img src="${x.photo}" alt="${esc55(x.name)}" style="width:100%;height:150px;object-fit:cover;border-radius:12px">`:''}
              <h3 style="margin-top:10px">${esc55(x.name)}</h3>
              <small class="pill">${esc55(x.category||'Sin categoría')}</small>
              <div style="margin-top:8px">${esc55(x.description||'')}</div>
              <div style="margin-top:8px"><b>${money55(x.price)}</b> / ${esc55(x.unit||'unidad')}</div>
              <div style="margin-top:10px"><button class="secondary small" onclick="openProviderProduct55('${x.id}')">Editar</button></div>
            </div>`).join('')}
        </div>
      `:'<div class="empty">Todavía no cargaste productos.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Ofertas publicadas</h3>
      ${offers.length?offers.map(o=>`
        <div style="padding:10px 0;border-bottom:1px solid #eee">
          <b>${esc55(o.title)}</b>
          <div>${esc55(o.message)}</div>
        </div>`).join(''):'<div class="empty">Sin ofertas publicadas.</div>'}
    </div>
  `;
};

// Compatibilidad con versiones anteriores
window.renderProviderCommunity54=window.renderProviderCommunity55;
window.renderProviderCommunity53=window.renderProviderCommunity55;
window.openProviderProduct54=window.openProviderProduct55;
window.openProviderProduct53=window.openProviderProduct55;

// ------------------------------------------------------------
// SALÓN: VER PROVEEDORES DE COMUNIDAD CON FANTASÍA + CATÁLOGO
// ------------------------------------------------------------
function providerCard55(c){
  return `
    <div class="card" style="margin:0">
      <div style="display:flex;align-items:center;gap:10px">
        ${c.raw.logo?`<img src="${c.raw.logo}" style="width:54px;height:54px;object-fit:contain;border-radius:10px">`:''}
        <div>
          <h3 style="margin:0">${esc55(c.display)}</h3>
          <small>${esc55(c.raw.address||'')}</small>
        </div>
      </div>

      <div style="margin-top:10px;display:grid;gap:8px">
        ${c.products.length?c.products.map(p=>`
          <div style="display:grid;grid-template-columns:58px 1fr auto;gap:10px;align-items:center;padding:8px;border:1px solid #eee;border-radius:10px">
            ${p.photo?`<img src="${p.photo}" style="width:58px;height:58px;object-fit:cover;border-radius:8px">`:'<div style="width:58px;height:58px;background:#f3f3f6;border-radius:8px"></div>'}
            <div>
              <b>${esc55(p.name)}</b>
              <small style="display:block">${esc55(p.category||'')}</small>
              <small style="display:block">${esc55(p.description||'')}</small>
            </div>
            <div><b>${money55(p.price)}</b><small style="display:block">/${esc55(p.unit||'unidad')}</small></div>
          </div>`).join(''):'<div class="empty">Sin productos cargados.</div>'}
      </div>

      <button class="primary small" style="margin-top:10px" onclick="openStockPurchase55('community:${c.id}')">Comprar a este proveedor</button>
    </div>
  `;
}

window.renderSuppliersV55=function(){
  const own=ownProviders55();
  const community=communityProviders55();
  const purchases=(data.stockPurchases||[])
    .filter(x=>x.salonId===SID55())
    .sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));

  setTitle('Proveedores','Proveedores propios, comunidad y pedidos');

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>🚚 Proveedores</h3>
          <small class="muted">Podés comprar para Stock o asociar el pedido a una fiesta.</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openManualSupplier51()">+ Agregar proveedor manual</button>
          <button class="primary" onclick="openStockPurchase55()">+ Nueva compra / pedido</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Proveedores de la comunidad</h3>
      <small class="muted">Se muestra el nombre de fantasía, logo, dirección, productos y precios cargados por cada proveedor.</small>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px">
        ${community.length?community.map(providerCard55).join(''):'<div class="empty">No hay proveedores de la comunidad.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Mis proveedores manuales</h3>
      ${own.length?own.map(s=>`
        <div style="padding:10px 0;border-bottom:1px solid #eee">
          <b>${esc55(s.name||s.businessName||'Proveedor')}</b>
          <small style="display:block">${esc55(s.phone||'')} ${s.email?'· '+esc55(s.email):''}</small>
        </div>`).join(''):'<div class="empty">Sin proveedores manuales.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Pedidos / compras registrados</h3>
      ${purchases.length?`
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Fecha</th><th>Destino</th><th>Proveedor</th><th>Producto</th><th>Cantidad</th><th>Total</th><th>Pago</th><th>Entrega</th></tr></thead>
          <tbody>${purchases.map(p=>`
            <tr>
              <td>${esc55(p.date||'')}</td>
              <td>${p.targetType==='event'?`Fiesta: ${esc55(p.eventName||'')}`:'Stock'}</td>
              <td>${esc55(p.supplierName||'')}</td>
              <td>${esc55(p.productName||'')}</td>
              <td>${N55(p.qty)}</td>
              <td>${money55(p.total||0)}</td>
              <td>${esc55(p.paymentStatus||'Pendiente')}</td>
              <td>${esc55(p.deliveryStatus||'Pendiente de entrega')}</td>
            </tr>`).join('')}</tbody>
        </table></div>`:'<div class="empty">Todavía no hay pedidos.</div>'}
    </div>
  `;
};

// ------------------------------------------------------------
// SALÓN: NUEVA COMPRA / PEDIDO PARA STOCK O FIESTA
// ------------------------------------------------------------
window.openStockPurchase55=function(preselect=''){
  const own=ownProviders55();
  const community=communityProviders55();
  const events=events55();

  const providerOptions=`
    <option value="">Seleccionar proveedor</option>
    ${own.length?`
      <optgroup label="Mis proveedores manuales">
        ${own.map(s=>`<option value="own:${s.id}" ${preselect===`own:${s.id}`?'selected':''}>${esc55(s.name||s.businessName||'Proveedor')}</option>`).join('')}
      </optgroup>`:''}
    ${community.length?`
      <optgroup label="Proveedores de la comunidad">
        ${community.map(c=>`<option value="community:${c.id}" ${preselect===`community:${c.id}`?'selected':''}>${esc55(c.display)}</option>`).join('')}
      </optgroup>`:''}
  `;

  showModal(`
    <div class="modal-title">
      <div><h2>Nueva compra / pedido</h2><p>Elegí si el pedido es para Stock o para una fiesta.</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="purchase55">
      <div class="form-grid">
        <div class="field">
          <label>Destino del pedido</label>
          <select id="targetType55" name="targetType">
            <option value="stock">Para Stock</option>
            <option value="event">Para una fiesta</option>
          </select>
        </div>

        <div class="field" id="eventWrap55" style="display:none">
          <label>Fiesta</label>
          <select id="event55" name="eventId">
            <option value="">Seleccionar fiesta</option>
            ${events.map(e=>`<option value="${e.id}">${esc55(e.date||'')} · ${esc55(e.eventName||e.child||'Evento')}</option>`).join('')}
          </select>
        </div>

        <div class="field span2">
          <label>Proveedor</label>
          <select id="supplier55" name="supplier" required>${providerOptions}</select>
        </div>

        <div class="field span2">
          <label>Producto</label>
          <select id="product55" name="product" required>
            <option value="">Primero seleccioná un proveedor</option>
          </select>
          <small id="productHelp55" class="muted"></small>
        </div>

        <div class="field"><label>Cantidad</label><input id="qty55" name="qty" type="number" min="1" value="1" required></div>
        <div class="field"><label>Precio unitario</label><input id="cost55" name="unitCost" type="number" min="0" required></div>
        <div class="field"><label>Total</label><input id="total55" readonly></div>
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>

        <div class="field">
          <label>Estado de pago</label>
          <select name="paymentStatus"><option>Pendiente</option><option>Pagado</option></select>
        </div>
        <div class="field">
          <label>Entrega</label>
          <select name="deliveryStatus"><option>Pendiente de entrega</option><option>Entregado</option></select>
        </div>
      </div>

      <div class="form-actions"><button class="primary">Registrar pedido</button></div>
    </form>
  `);

  const targetEl=$('#targetType55'), eventWrap=$('#eventWrap55'), eventEl=$('#event55');
  const supplierEl=$('#supplier55'), productEl=$('#product55'), qtyEl=$('#qty55');
  const costEl=$('#cost55'), totalEl=$('#total55'), helpEl=$('#productHelp55');

  function selectedCommunity55(id){
    return community.find(x=>String(x.id)===String(id));
  }
  function updateTarget55(){
    eventWrap.style.display=targetEl.value==='event'?'':'none';
    eventEl.required=targetEl.value==='event';
  }
  function loadProducts55(){
    const [source,pid]=String(supplierEl.value||'').split(':');

    if(!pid){
      productEl.innerHTML='<option value="">Primero seleccioná un proveedor</option>';
      costEl.value=''; costEl.readOnly=false; helpEl.textContent=''; totalEl.value=money55(0);
      return;
    }

    if(source==='community'){
      const c=selectedCommunity55(pid);
      const products=c?.products||[];
      productEl.innerHTML='<option value="">Seleccionar producto de '+esc55(c?.display||'proveedor')+'</option>'+
        products.map(p=>`
          <option value="community:${p.id}">
            ${esc55(p.name)} · ${money55(p.price)} / ${esc55(p.unit||'unidad')}
          </option>`).join('');
      helpEl.textContent=products.length
        ? `Catálogo de ${c.display}. El precio lo definió el proveedor.`
        : `${c?.display||'Este proveedor'} todavía no cargó productos.`;
      costEl.readOnly=true; costEl.value='';
    }else{
      const products=stockProducts55();
      productEl.innerHTML='<option value="">Seleccionar producto de Stock</option>'+
        products.map(p=>`<option value="stock:${p.id}">${esc55(p.name)}</option>`).join('');
      helpEl.textContent='Proveedor manual: elegí un producto del Stock del salón.';
      costEl.readOnly=false; costEl.value='';
    }
    totalEl.value=money55(0);
  }
  function loadPrice55(){
    const [source,pid]=String(supplierEl.value||'').split(':');
    const [,productId]=String(productEl.value||'').split(':');
    if(source==='community'){
      const c=selectedCommunity55(pid);
      const p=(c?.products||[]).find(x=>String(x.id)===String(productId));
      costEl.value=p?N55(p.price):'';
    }else{
      const p=stockProducts55().find(x=>String(x.id)===String(productId));
      if(p)costEl.value=N55(p.costPrice);
    }
    totalEl.value=money55(N55(qtyEl.value)*N55(costEl.value));
  }

  targetEl.onchange=updateTarget55;
  supplierEl.onchange=loadProducts55;
  productEl.onchange=loadPrice55;
  qtyEl.oninput=loadPrice55;
  costEl.oninput=loadPrice55;
  updateTarget55();

  if(preselect){
    supplierEl.value=preselect;
    loadProducts55();
  }

  $('#purchase55').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const [source,supplierId]=String(f.supplier||'').split(':');
    const [,productId]=String(f.product||'').split(':');

    let sup=null,prod=null,supplierName='Proveedor';
    if(source==='community'){
      const c=selectedCommunity55(supplierId);
      if(c){
        sup=c.raw;supplierName=c.display;
        prod=c.products.find(x=>String(x.id)===String(productId));
      }
    }else{
      sup=own.find(x=>String(x.id)===String(supplierId));
      supplierName=sup?.name||sup?.businessName||'Proveedor';
      prod=stockProducts55().find(x=>String(x.id)===String(productId));
    }

    if(!sup)return toast('Proveedor no encontrado');
    if(!prod)return toast('Producto no encontrado');
    if(f.targetType==='event'&&!f.eventId)return toast('Seleccioná la fiesta');

    const event=f.targetType==='event'?events.find(x=>String(x.id)===String(f.eventId)):null;
    const qty=N55(f.qty);
    const unitCost=source==='community'?N55(prod.price):N55(f.unitCost);
    const total=qty*unitCost;

    const purchase={
      id:id(),salonId:SID55(),
      targetType:f.targetType,
      eventId:event?.id||'',
      eventName:event?.eventName||event?.child||'',
      supplierId,supplierSource:source,supplierName,
      productId:prod.id,productName:prod.name,
      productCategory:prod.category||'',
      productDescription:prod.description||'',
      productPhoto:prod.photo||'',
      qty,unitCost,total,
      date:f.date,
      paymentStatus:f.paymentStatus,
      deliveryStatus:f.deliveryStatus,
      createdAt:new Date().toISOString()
    };
    data.stockPurchases.push(purchase);

    // Solo suma a stock si el destino es Stock y está entregado.
    if(f.targetType==='stock'&&f.deliveryStatus==='Entregado'){
      let stock=stockProducts55().find(x=>norm55(x.name)===norm55(prod.name));
      if(!stock){
        stock={
          id:id(),salonId:SID55(),
          name:prod.name,
          category:prod.category||'Compra a proveedor',
          stock:0,minStock:0,costPrice:unitCost,salePrice:0
        };
        data.stockProducts.push(stock);
      }
      stock.stock=N55(stock.stock)+qty;
      stock.costPrice=unitCost;
    }

    if(f.paymentStatus==='Pagado'){
      data.movements=data.movements||[];
      data.movements.push({
        id:id(),salonId:SID55(),
        eventId:event?.id||'',
        type:'Gasto',
        category:f.targetType==='event'?'Compra para fiesta':'Compra de stock',
        concept:`Compra ${prod.name} · ${supplierName}${event?' · '+(event.eventName||event.child||'Fiesta'):''}`,
        amount:total,
        movementDate:f.date,
        createdAt:new Date().toISOString(),
        sourceKey:`v55:purchase:${purchase.id}`
      });
    }

    save();closeModal();renderSuppliersV55();toast('Pedido registrado');
  };
};

window.openStockPurchase54=window.openStockPurchase55;
window.openStockPurchase53=window.openStockPurchase55;
window.openPurchaseFromCommunity53=function(providerId){
  openStockPurchase55(`community:${providerId}`);
};

// ------------------------------------------------------------
// RUTAS FINALES
// ------------------------------------------------------------
window.renderSuppliersV54=window.renderSuppliersV55;
window.renderSuppliersV53=window.renderSuppliersV55;

const route55=renderSalonView;
renderSalonView=function(){
  if(view==='suppliers')return renderSuppliersV55();
  return route55();
};

})();


// ============================================================
// V56 - EDITAR USUARIO PROVEEDOR + VISIBILIDAD DE PRODUCTOS
// ============================================================
(function(){
'use strict';

const N56=v=>Number(v||0);
const esc56=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};

function provider56(){
  try{
    if(typeof providerAccount55==='function') return providerAccount55();
  }catch(e){}
  const s=(typeof session!=='undefined'?session:window.session)||{};
  const list=data.marketSuppliers||[];
  return list.find(p=>
    String(p.id)===String(s.providerId||s.supplierId||s.marketSupplierId||s.userId||s.id) ||
    (s.email && String(p.email||'').toLowerCase()===String(s.email).toLowerCase())
  )||null;
}
function providerName56(p){
  return String(p?.fantasyName||p?.businessName||p?.name||'Proveedor');
}
function belongs56(prod,p){
  if(!prod||!p)return false;
  return String(prod.providerId)===String(p.id) ||
         String(prod.providerUserId)===String(p.userId||p.id) ||
         (!!prod.providerEmail && !!p.email &&
          String(prod.providerEmail).toLowerCase()===String(p.email).toLowerCase());
}
function products56(p){
  return (data.providerProducts||[]).filter(x=>belongs56(x,p));
}

// ------------------------------------------------------------
// EDITAR USUARIO / DATOS DEL PROVEEDOR
// ------------------------------------------------------------
window.openEditProviderUser56=function(){
  const p=provider56();
  if(!p)return toast('No se pudo identificar el proveedor');

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Editar usuario proveedor</h2>
        <p>Datos comerciales y de contacto visibles para los salones.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="editProviderUser56">
      <div class="form-grid">
        <div class="field span2">
          <label>Nombre de fantasía</label>
          <input name="fantasyName" required value="${esc56(p.fantasyName||p.businessName||p.name||'')}">
        </div>

        <div class="field span2">
          <label>Dirección</label>
          <input name="address" value="${esc56(p.address||'')}">
        </div>

        <div class="field">
          <label>Teléfono</label>
          <input name="phone" value="${esc56(p.phone||p.whatsapp||'')}">
        </div>

        <div class="field">
          <label>Mail</label>
          <input name="email" type="email" value="${esc56(p.email||'')}">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar cambios</button>
      </div>
    </form>
  `);

  document.querySelector('#editProviderUser56').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));

    p.fantasyName=String(f.fantasyName||'').trim();
    p.businessName=p.fantasyName;
    p.name=p.fantasyName;
    p.address=String(f.address||'').trim();
    p.phone=String(f.phone||'').trim();
    p.whatsapp=p.phone;
    p.email=String(f.email||'').trim();

    // Mantiene actualizado el nombre del proveedor en todos sus productos.
    (data.providerProducts||[]).forEach(prod=>{
      if(belongs56(prod,p)){
        prod.providerName=p.fantasyName;
        prod.providerEmail=p.email;
      }
    });

    save();
    closeModal();
    renderProviderCommunity56();
    toast('Usuario proveedor actualizado');
  };
};

// ------------------------------------------------------------
// PRODUCTO: TILDE "VISIBLE PARA SALONES"
// ------------------------------------------------------------
window.openProviderProduct56=function(productId=''){
  const p=provider56();
  if(!p)return toast('Proveedor no identificado');

  const old=productId?(data.providerProducts||[]).find(x=>x.id===productId&&belongs56(x,p)):null;
  const visible = old ? old.visibleToSalons!==false : true;

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${old?'Editar':'Agregar'} producto</h2>
        <p>Proveedor: <b>${esc56(providerName56(p))}</b></p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="providerProduct56">
      <div class="form-grid">
        <div class="field span2">
          <label>Producto</label>
          <input name="name" required value="${esc56(old?.name||'')}">
        </div>

        <div class="field">
          <label>Categoría</label>
          <input name="category" required value="${esc56(old?.category||'')}">
        </div>

        <div class="field">
          <label>Costo / precio</label>
          <input name="price" type="number" min="0" required value="${N56(old?.price)}">
        </div>

        <div class="field">
          <label>Unidad</label>
          <input name="unit" value="${esc56(old?.unit||'unidad')}" placeholder="unidad, caja, kg...">
        </div>

        <div class="field span2">
          <label>Descripción</label>
          <textarea name="description" required>${esc56(old?.description||'')}</textarea>
        </div>

        <div class="field span2">
          <label>Foto del producto</label>
          <input name="photoFile" type="file" accept="image/*">
          ${old?.photo?`<img src="${old.photo}" style="margin-top:8px;max-width:180px;max-height:130px;object-fit:cover;border-radius:12px">`:''}
        </div>

        <div class="field span2">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input name="visibleToSalons" type="checkbox" ${visible?'checked':''}>
            <span>
              <b>Visible para los salones</b><br>
              <small>Si está tildado, este producto aparecerá a los salones cuando quieran hacer un pedido.</small>
            </span>
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar producto</button>
      </div>
    </form>
  `);

  document.querySelector('#providerProduct56').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const file=e.target.querySelector('[name="photoFile"]')?.files?.[0];

    const finish=photo=>{
      const obj={
        ...(old||{}),
        id:old?.id||id(),
        providerId:p.id,
        providerUserId:p.userId||p.id,
        providerEmail:p.email||'',
        providerName:providerName56(p),
        name:String(fd.get('name')||'').trim(),
        category:String(fd.get('category')||'').trim(),
        description:String(fd.get('description')||'').trim(),
        price:N56(fd.get('price')),
        unit:String(fd.get('unit')||'unidad').trim(),
        active:true,
        visibleToSalons:fd.has('visibleToSalons')
      };
      if(photo)obj.photo=photo;

      if(old){
        const ix=data.providerProducts.findIndex(x=>x.id===old.id);
        if(ix>=0)data.providerProducts[ix]=obj;
      }else{
        data.providerProducts.push(obj);
      }

      save();
      closeModal();
      renderProviderCommunity56();
      toast(obj.visibleToSalons?'Producto visible para salones':'Producto guardado como no visible');
    };

    if(file){
      const r=new FileReader();
      r.onload=()=>finish(String(r.result||''));
      r.onerror=()=>finish('');
      r.readAsDataURL(file);
    }else finish('');
  };
};

// ------------------------------------------------------------
// PANTALLA PROVEEDOR
// ------------------------------------------------------------
window.renderProviderCommunity56=function(){
  const p=provider56();
  if(!p)return toast('No se pudo identificar el proveedor');

  const products=products56(p);

  document.querySelector('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div style="display:flex;align-items:center;gap:12px">
          ${p.logo?`<img src="${p.logo}" style="width:58px;height:58px;object-fit:contain;border-radius:12px">`:''}
          <div>
            <h2>${esc56(providerName56(p))}</h2>
            <small class="muted">${esc56(p.address||'')} ${p.phone?'· '+esc56(p.phone):''} ${p.email?'· '+esc56(p.email):''}</small>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openEditProviderUser56()">✏️ Editar usuario</button>
          <button class="secondary" onclick="openProviderProfile55()">🖼️ Logo / perfil</button>
          <button class="primary" onclick="openProviderOffer53()">+ Publicar oferta</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-title">
        <div>
          <h3>Mis productos</h3>
          <small class="muted">Elegí cuáles querés mostrar a los salones.</small>
        </div>
        <button class="primary" onclick="openProviderProduct56()">+ Agregar producto</button>
      </div>

      ${products.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Visible</th><th></th></tr>
            </thead>
            <tbody>
              ${products.map(x=>`
                <tr>
                  <td>
                    <div style="display:flex;gap:8px;align-items:center">
                      ${x.photo?`<img src="${x.photo}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">`:''}
                      <div><b>${esc56(x.name)}</b><small style="display:block">${esc56(x.description||'')}</small></div>
                    </div>
                  </td>
                  <td>${esc56(x.category||'')}</td>
                  <td><b>${money(x.price||0)}</b></td>
                  <td>${x.visibleToSalons!==false?'✅ Sí':'🚫 No'}</td>
                  <td><button class="secondary small" onclick="openProviderProduct56('${x.id}')">Editar</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `:'<div class="empty">Todavía no cargaste productos.</div>'}
    </div>
  `;
};

// Alias para botones/rutas de versiones anteriores.
window.renderProviderCommunity55=window.renderProviderCommunity56;
window.renderProviderCommunity54=window.renderProviderCommunity56;
window.renderProviderCommunity53=window.renderProviderCommunity56;
window.openProviderProduct55=window.openProviderProduct56;
window.openProviderProduct54=window.openProviderProduct56;
window.openProviderProduct53=window.openProviderProduct56;

// ------------------------------------------------------------
// FILTRO GLOBAL: LOS SALONES SOLO VEN PRODUCTOS TILDADOS.
// Productos viejos sin el campo se consideran visibles para no perderlos.
// ------------------------------------------------------------
const oldProductsForProvider55_56 = (typeof productsForProvider55==='function') ? productsForProvider55 : null;
if(oldProductsForProvider55_56){
  window.productsForProvider55=function(p){
    return oldProductsForProvider55_56(p).filter(x=>x.visibleToSalons!==false);
  };
}

// Reemplaza las funciones de comunidad usadas por compras V55.
const oldCommunityProviders55_56 = (typeof communityProviders55==='function') ? communityProviders55 : null;
if(oldCommunityProviders55_56){
  window.communityProviders55=function(){
    return (data.marketSuppliers||[])
      .filter(p=>p.status!=='Suspendido'&&p.active!==false)
      .map(p=>({
        raw:p,
        id:p.id,
        display:providerName56(p),
        products:(data.providerProducts||[])
          .filter(x=>belongs56(x,p)&&x.active!==false&&x.visibleToSalons!==false)
          .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
      }));
  };
}

})();


// ============================================================
// V57 - PEDIDOS DE COMUNIDAD: ACEPTACIÓN + CHAT + PAGO + ENTREGA
// ============================================================
(function(){
'use strict';

data.stockPurchases=data.stockPurchases||[];
data.orderMessages=data.orderMessages||[];

const N57=v=>Number(v||0);
const norm57=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc57=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money57=v=>{
  try{return money(v)}catch(e){return '$ '+N57(v).toLocaleString('es-AR')}
};
const SID57=()=>{
  try{return session?.salonId}catch(e){return window.session?.salonId}
};
const sess57=()=>{
  try{return session||{}}catch(e){return window.session||{}}
};

function provider57(){
  const s=sess57();
  const list=data.marketSuppliers||[];
  const vals=[
    s.providerId,s.supplierId,s.marketSupplierId,s.userId,s.id,
    s.email,s.userEmail,s.username,s.userName,s.name,s.businessName
  ].filter(Boolean).map(norm57);

  return list.find(p=>{
    const keys=[
      p.id,p.userId,p.providerId,p.supplierId,
      p.email,p.username,p.userName,p.name,p.businessName,p.fantasyName
    ].filter(Boolean).map(norm57);
    return keys.some(k=>vals.includes(k));
  })||null;
}
function providerName57(p){
  return String(p?.fantasyName||p?.businessName||p?.name||p?.username||p?.email||'Proveedor');
}
function communityProviders57(){
  return (data.marketSuppliers||[])
    .filter(p=>p.status!=='Suspendido'&&p.active!==false)
    .map(p=>({
      raw:p,
      id:p.id,
      display:providerName57(p),
      products:(data.providerProducts||[])
        .filter(x=>String(x.providerId)===String(p.id) && x.active!==false && x.visibleToSalons!==false)
    }));
}
function ownProviders57(){
  return (data.suppliers||[]).filter(x=>x.salonId===SID57());
}
function stockProducts57(){
  return (data.stockProducts||[]).filter(x=>x.salonId===SID57());
}
function events57(){
  return (data.events||[]).filter(x=>x.salonId===SID57()&&x.status!=='Cancelada')
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
}
function orderMessages57(orderId){
  return (data.orderMessages||[])
    .filter(m=>String(m.orderId)===String(orderId))
    .sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
}
function getOrder57(idOrder){
  return (data.stockPurchases||[]).find(x=>String(x.id)===String(idOrder));
}
function orderStatus57(o){
  return o.orderStatus||(
    o.supplierSource==='community'
      ? 'Pendiente de aceptación'
      : 'Registrado'
  );
}
function paymentStatus57(o){
  return o.paymentStatus||'Pendiente';
}
function deliveryStatus57(o){
  return o.deliveryStatus||'Pendiente de entrega';
}
function addMessage57(orderId,fromType,fromName,text){
  data.orderMessages=data.orderMessages||[];
  data.orderMessages.push({
    id:id(),
    orderId,
    fromType,
    fromName,
    text:String(text||'').trim(),
    createdAt:new Date().toISOString()
  });
}
function addStockOnce57(o){
  // Regla V57: SOLO cuando EL SALÓN marca "Entregado".
  if(o.stockAdded===true)return;
  if(o.targetType!=='stock')return;
  if(o.deliveryStatus!=='Entregado')return;

  data.stockProducts=data.stockProducts||[];
  let stock=stockProducts57().find(x=>norm57(x.name)===norm57(o.productName));
  if(!stock){
    stock={
      id:id(),
      salonId:o.salonId,
      name:o.productName,
      category:o.productCategory||'Compra a proveedor',
      stock:0,
      minStock:0,
      costPrice:N57(o.unitCost),
      salePrice:0
    };
    data.stockProducts.push(stock);
  }
  stock.stock=N57(stock.stock)+N57(o.qty);
  stock.costPrice=N57(o.unitCost);
  o.stockAdded=true;
  o.stockAddedAt=new Date().toISOString();
}
function addExpenseOnce57(o){
  if(o.paymentStatus!=='Pagado'||o.financeExpenseCreated===true)return;
  data.movements=data.movements||[];
  const exists=data.movements.some(m=>String(m.sourceKey)===`v57:community-order:${o.id}`);
  if(!exists){
    data.movements.push({
      id:id(),
      salonId:o.salonId,
      eventId:o.eventId||'',
      type:'Gasto',
      category:o.targetType==='event'?'Compra para fiesta':'Compra de stock',
      concept:`Pedido ${o.productName} · ${o.supplierName}`,
      amount:N57(o.total),
      movementDate:o.paymentDate||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString(),
      sourceKey:`v57:community-order:${o.id}`
    });
  }
  o.financeExpenseCreated=true;
}

// ------------------------------------------------------------
// SALÓN - NUEVO PEDIDO
// Para proveedor de comunidad: nace Pendiente de aceptación.
// NO permite marcar entregado al crear.
// ------------------------------------------------------------
window.openStockPurchase57=function(preselect=''){
  const own=ownProviders57();
  const community=communityProviders57();
  const events=events57();

  const providerOptions=`
    <option value="">Seleccionar proveedor</option>
    ${own.length?`
      <optgroup label="Mis proveedores manuales">
        ${own.map(s=>`<option value="own:${s.id}" ${preselect===`own:${s.id}`?'selected':''}>${esc57(s.name||s.businessName||'Proveedor')}</option>`).join('')}
      </optgroup>`:''}
    ${community.length?`
      <optgroup label="Proveedores de la comunidad">
        ${community.map(c=>`<option value="community:${c.id}" ${preselect===`community:${c.id}`?'selected':''}>${esc57(c.display)}</option>`).join('')}
      </optgroup>`:''}
  `;

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Nueva compra / pedido</h2>
        <p>Los pedidos a proveedores de la comunidad deben ser aceptados por el proveedor.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="purchase57">
      <div class="form-grid">
        <div class="field">
          <label>Destino</label>
          <select id="target57" name="targetType">
            <option value="stock">Para Stock</option>
            <option value="event">Para una fiesta</option>
          </select>
        </div>

        <div class="field" id="eventWrap57" style="display:none">
          <label>Fiesta</label>
          <select id="event57" name="eventId">
            <option value="">Seleccionar fiesta</option>
            ${events.map(e=>`<option value="${e.id}">${esc57(e.date||'')} · ${esc57(e.eventName||e.child||'Evento')}</option>`).join('')}
          </select>
        </div>

        <div class="field span2">
          <label>Proveedor</label>
          <select id="supplier57" name="supplier" required>${providerOptions}</select>
        </div>

        <div class="field span2">
          <label>Producto</label>
          <select id="product57" name="product" required>
            <option value="">Primero seleccioná un proveedor</option>
          </select>
          <small id="help57" class="muted"></small>
        </div>

        <div class="field">
          <label>Cantidad</label>
          <input id="qty57" name="qty" type="number" min="1" value="1" required>
        </div>

        <div class="field">
          <label>Precio unitario</label>
          <input id="cost57" name="unitCost" type="number" min="0" required>
        </div>

        <div class="field">
          <label>Total</label>
          <input id="total57" readonly>
        </div>

        <div class="field">
          <label>Fecha del pedido</label>
          <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required>
        </div>

        <div class="field span2">
          <label>Mensaje inicial al proveedor</label>
          <textarea name="initialMessage" placeholder="Ej.: Necesito entrega para el viernes por la mañana."></textarea>
        </div>
      </div>

      <div class="form-actions">
        <button class="primary">Enviar pedido</button>
      </div>
    </form>
  `);

  const target=$('#target57'), eventWrap=$('#eventWrap57'), eventEl=$('#event57');
  const supplier=$('#supplier57'), product=$('#product57');
  const qty=$('#qty57'), cost=$('#cost57'), total=$('#total57'), help=$('#help57');

  function selectedCommunity(idp){
    return community.find(x=>String(x.id)===String(idp));
  }
  function targetChange(){
    eventWrap.style.display=target.value==='event'?'':'none';
    eventEl.required=target.value==='event';
  }
  function loadProducts(){
    const [source,pid]=String(supplier.value||'').split(':');
    if(!pid){
      product.innerHTML='<option value="">Primero seleccioná un proveedor</option>';
      cost.value=''; cost.readOnly=false; help.textContent=''; total.value=money57(0);
      return;
    }

    if(source==='community'){
      const c=selectedCommunity(pid);
      const ps=c?.products||[];
      product.innerHTML='<option value="">Seleccionar producto</option>'+
        ps.map(p=>`<option value="community:${p.id}">${esc57(p.name)} · ${money57(p.price)} / ${esc57(p.unit||'unidad')}</option>`).join('');
      help.textContent=ps.length
        ? `Catálogo de ${c.display}. El precio lo cargó el proveedor.`
        : `${c?.display||'Este proveedor'} no tiene productos visibles.`;
      cost.readOnly=true;
      cost.value='';
    }else{
      const ps=stockProducts57();
      product.innerHTML='<option value="">Seleccionar producto de Stock</option>'+
        ps.map(p=>`<option value="stock:${p.id}">${esc57(p.name)}</option>`).join('');
      help.textContent='Proveedor manual.';
      cost.readOnly=false;
      cost.value='';
    }
    total.value=money57(0);
  }
  function loadPrice(){
    const [source,pid]=String(supplier.value||'').split(':');
    const [,prodId]=String(product.value||'').split(':');

    if(source==='community'){
      const c=selectedCommunity(pid);
      const p=(c?.products||[]).find(x=>String(x.id)===String(prodId));
      cost.value=p?N57(p.price):'';
    }else{
      const p=stockProducts57().find(x=>String(x.id)===String(prodId));
      if(p)cost.value=N57(p.costPrice);
    }
    total.value=money57(N57(qty.value)*N57(cost.value));
  }

  target.onchange=targetChange;
  supplier.onchange=loadProducts;
  product.onchange=loadPrice;
  qty.oninput=loadPrice;
  cost.oninput=loadPrice;
  targetChange();

  if(preselect){
    supplier.value=preselect;
    loadProducts();
  }

  $('#purchase57').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const [source,supplierId]=String(f.supplier||'').split(':');
    const [,productId]=String(f.product||'').split(':');

    if(f.targetType==='event'&&!f.eventId)return toast('Seleccioná la fiesta');

    let sup=null,prod=null,supplierName='Proveedor';
    if(source==='community'){
      const c=selectedCommunity(supplierId);
      if(c){
        sup=c.raw;
        supplierName=c.display;
        prod=c.products.find(x=>String(x.id)===String(productId));
      }
    }else{
      sup=own.find(x=>String(x.id)===String(supplierId));
      supplierName=sup?.name||sup?.businessName||'Proveedor';
      prod=stockProducts57().find(x=>String(x.id)===String(productId));
    }

    if(!sup)return toast('Proveedor no encontrado');
    if(!prod)return toast('Producto no encontrado');

    const event=f.targetType==='event'?events.find(x=>String(x.id)===String(f.eventId)):null;
    const unitCost=source==='community'?N57(prod.price):N57(f.unitCost);
    const quantity=N57(f.qty);

    const order={
      id:id(),
      salonId:SID57(),
      supplierId,
      supplierSource:source,
      supplierName,
      targetType:f.targetType,
      eventId:event?.id||'',
      eventName:event?.eventName||event?.child||'',
      productId:prod.id,
      productName:prod.name,
      productCategory:prod.category||'',
      productDescription:prod.description||'',
      productPhoto:prod.photo||'',
      qty:quantity,
      unitCost,
      total:quantity*unitCost,
      date:f.date,
      orderStatus:source==='community'?'Pendiente de aceptación':'Registrado',
      paymentStatus:'Pendiente',
      deliveryStatus:'Pendiente de entrega',
      stockAdded:false,
      financeExpenseCreated:false,
      createdAt:new Date().toISOString()
    };

    data.stockPurchases.push(order);

    if(source==='community'){
      addMessage57(
        order.id,
        'salon',
        'Salón',
        f.initialMessage||`Nuevo pedido: ${quantity} x ${prod.name}.`
      );
    }

    save();
    closeModal();
    renderSuppliersV57();
    toast(source==='community'?'Pedido enviado al proveedor':'Pedido registrado');
  };
};

// ------------------------------------------------------------
// CHAT COMPARTIDO
// ------------------------------------------------------------
window.openOrderChat57=function(orderId,actor='salon'){
  const o=getOrder57(orderId);
  if(!o)return toast('Pedido no encontrado');

  const msgs=orderMessages57(o.id);
  const providerSide=actor==='provider';

  showModal(`
    <div class="modal-title">
      <div>
        <h2>💬 Pedido · ${esc57(o.productName)}</h2>
        <p>${esc57(o.supplierName)} · ${money57(o.total)}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <div class="card" style="margin-bottom:12px;padding:12px">
      <div><b>Estado:</b> ${esc57(orderStatus57(o))}</div>
      <div><b>Pago:</b> ${esc57(paymentStatus57(o))}</div>
      <div><b>Entrega:</b> ${esc57(deliveryStatus57(o))}</div>
    </div>

    <div id="messages57" style="max-height:340px;overflow:auto;padding:4px">
      ${msgs.length?msgs.map(m=>`
        <div style="margin:8px 0;padding:10px 12px;border:1px solid #e6e6ea;border-radius:12px;${m.fromType===actor?'margin-left:32px':'margin-right:32px'}">
          <b>${esc57(m.fromName||m.fromType)}</b>
          <div>${esc57(m.text)}</div>
          <small class="muted">${new Date(m.createdAt).toLocaleString('es-AR')}</small>
        </div>
      `).join(''):'<div class="empty">Sin mensajes.</div>'}
    </div>

    <form id="chatForm57" style="margin-top:12px">
      <div class="field">
        <label>Mensaje</label>
        <textarea name="text" required placeholder="Escribí un mensaje..."></textarea>
      </div>
      <div class="form-actions">
        <button class="primary">Enviar mensaje</button>
      </div>
    </form>
  `);

  setTimeout(()=>{
    const box=$('#messages57');
    if(box)box.scrollTop=box.scrollHeight;
  },20);

  $('#chatForm57').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const name=providerSide?o.supplierName:'Salón';
    addMessage57(o.id,actor,name,f.text);
    save();
    closeModal();
    openOrderChat57(o.id,actor);
  };
};

// ------------------------------------------------------------
// PROVEEDOR - PEDIDOS RECIBIDOS
// ------------------------------------------------------------
window.renderProviderOrders57=function(){
  const p=provider57();
  if(!p)return toast('Proveedor no identificado');

  const orders=(data.stockPurchases||[])
    .filter(o=>o.supplierSource==='community'&&String(o.supplierId)===String(p.id))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h2>📦 Pedidos recibidos</h2>
          <small class="muted">Aceptá el pedido y comunicate con el salón hasta completar pago y entrega.</small>
        </div>
        <button class="secondary" onclick="renderProviderCommunity56()">← Volver a Comunidad</button>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      ${orders.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th><th>Producto</th><th>Cant.</th><th>Total</th>
                <th>Estado</th><th>Pago</th><th>Entrega</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(o=>`
                <tr>
                  <td>${esc57(o.date||'')}</td>
                  <td>
                    <b>${esc57(o.productName)}</b>
                    ${o.eventName?`<small style="display:block">Fiesta: ${esc57(o.eventName)}</small>`:''}
                  </td>
                  <td>${N57(o.qty)}</td>
                  <td>${money57(o.total)}</td>
                  <td><b>${esc57(orderStatus57(o))}</b></td>
                  <td>${esc57(paymentStatus57(o))}</td>
                  <td>${esc57(deliveryStatus57(o))}</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      ${orderStatus57(o)==='Pendiente de aceptación'?`
                        <button class="primary small" onclick="providerAcceptOrder57('${o.id}')">Aceptar</button>
                        <button class="danger small" onclick="providerRejectOrder57('${o.id}')">Rechazar</button>
                      `:''}
                      ${orderStatus57(o)==='Aceptado'&&paymentStatus57(o)==='Pagado'&&!o.providerPaymentConfirmed?`
                        <button class="secondary small" onclick="providerConfirmPayment57('${o.id}')">Confirmar pago recibido</button>
                      `:''}
                      <button class="secondary small" onclick="openOrderChat57('${o.id}','provider')">💬 Comunicación</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `:'<div class="empty">Todavía no recibiste pedidos.</div>'}
    </div>
  `;
};

window.providerAcceptOrder57=function(orderId){
  const o=getOrder57(orderId);
  if(!o)return;
  o.orderStatus='Aceptado';
  o.acceptedAt=new Date().toISOString();
  addMessage57(o.id,'provider',o.supplierName,'Pedido aceptado. Podemos continuar por este chat.');
  save();
  renderProviderOrders57();
  toast('Pedido aceptado');
};

window.providerRejectOrder57=function(orderId){
  const o=getOrder57(orderId);
  if(!o)return;

  const reason=prompt('Motivo del rechazo:');
  if(reason===null)return;

  o.orderStatus='Rechazado';
  o.rejectedAt=new Date().toISOString();
  o.rejectReason=String(reason||'').trim();
  addMessage57(o.id,'provider',o.supplierName,`Pedido rechazado${o.rejectReason?': '+o.rejectReason:'.'}`);
  save();
  renderProviderOrders57();
  toast('Pedido rechazado');
};

window.providerConfirmPayment57=function(orderId){
  const o=getOrder57(orderId);
  if(!o)return;
  o.providerPaymentConfirmed=true;
  o.providerPaymentConfirmedAt=new Date().toISOString();
  addMessage57(o.id,'provider',o.supplierName,'Pago recibido y confirmado.');
  save();
  renderProviderOrders57();
  toast('Pago confirmado');
};

// Inyecta botón PEDIDOS al proveedor
function injectProviderOrdersButton57(){
  const s=sess57();
  if(s.role!=='provider'&&s.role!=='supplier')return;
  if(document.querySelector('#provider-orders57'))return;

  const host=document.querySelector('.topbar .toolbar') ||
             document.querySelector('.nav') ||
             document.querySelector('.toolbar') ||
             document.querySelector('header') ||
             document.querySelector('#app');
  if(!host)return;

  const b=document.createElement('button');
  b.id='provider-orders57';
  b.className='secondary';
  b.innerHTML='📦 Pedidos';
  b.onclick=()=>renderProviderOrders57();
  host.appendChild(b);
}
setTimeout(injectProviderOrdersButton57,300);
setInterval(injectProviderOrdersButton57,1400);

// ------------------------------------------------------------
// SALÓN - GESTIÓN DEL PEDIDO
// ------------------------------------------------------------
window.salonMarkPaid57=function(orderId){
  const o=getOrder57(orderId);
  if(!o)return;
  if(orderStatus57(o)!=='Aceptado')return toast('El proveedor debe aceptar el pedido primero');
  if(o.paymentStatus==='Pagado')return toast('El pedido ya figura pagado');

  if(!confirm(`¿Confirmar pago de ${money57(o.total)} a ${o.supplierName}?`))return;

  o.paymentStatus='Pagado';
  o.paymentDate=new Date().toISOString().slice(0,10);
  addExpenseOnce57(o);
  addMessage57(o.id,'salon','Salón','Pago realizado.');
  save();
  renderSuppliersV57();
  toast('Pago registrado');
};

window.salonMarkDelivered57=function(orderId){
  const o=getOrder57(orderId);
  if(!o)return;
  if(orderStatus57(o)!=='Aceptado')return toast('El proveedor debe aceptar el pedido primero');
  if(o.deliveryStatus==='Entregado')return toast('El pedido ya figura entregado');

  if(!confirm(`¿Confirmás que recibiste el pedido de ${o.supplierName}?`))return;

  o.deliveryStatus='Entregado';
  o.deliveredAt=new Date().toISOString();

  // ÚNICO punto donde se incrementa stock.
  addStockOnce57(o);

  addMessage57(o.id,'salon','Salón','Pedido recibido y marcado como entregado.');
  save();
  renderSuppliersV57();
  toast(o.targetType==='stock'?'Pedido entregado y stock actualizado':'Pedido entregado');
};

window.renderSuppliersV57=function(){
  const own=ownProviders57();
  const community=communityProviders57();
  const purchases=(data.stockPurchases||[])
    .filter(o=>o.salonId===SID57())
    .sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));

  setTitle('Proveedores','Pedidos, comunidad y stock');

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>🚚 Proveedores</h3>
          <small class="muted">Los pedidos a la comunidad deben ser aceptados antes del pago y la entrega.</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openManualSupplier51()">+ Proveedor manual</button>
          <button class="primary" onclick="openStockPurchase57()">+ Nueva compra / pedido</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Proveedores de la comunidad</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:10px">
        ${community.length?community.map(c=>`
          <div class="card" style="margin:0">
            <div style="display:flex;gap:10px;align-items:center">
              ${c.raw.logo?`<img src="${c.raw.logo}" style="width:54px;height:54px;object-fit:contain;border-radius:10px">`:''}
              <div>
                <h3 style="margin:0">${esc57(c.display)}</h3>
                <small>${esc57(c.raw.address||'')}</small>
              </div>
            </div>
            <div style="margin-top:10px">
              ${c.products.length?c.products.map(p=>`
                <div style="display:grid;grid-template-columns:54px 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #eee">
                  ${p.photo?`<img src="${p.photo}" style="width:54px;height:54px;object-fit:cover;border-radius:8px">`:'<div></div>'}
                  <div><b>${esc57(p.name)}</b><small style="display:block">${esc57(p.description||'')}</small></div>
                  <b>${money57(p.price)}</b>
                </div>
              `).join(''):'<div class="empty">Sin productos visibles.</div>'}
            </div>
            <button class="primary small" style="margin-top:10px" onclick="openStockPurchase57('community:${c.id}')">Hacer pedido</button>
          </div>
        `).join(''):'<div class="empty">No hay proveedores de la comunidad.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Mis proveedores manuales</h3>
      ${own.length?own.map(s=>`
        <div style="padding:8px 0;border-bottom:1px solid #eee">
          <b>${esc57(s.name||s.businessName||'Proveedor')}</b>
        </div>
      `).join(''):'<div class="empty">Sin proveedores manuales.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Pedidos / compras</h3>
      ${purchases.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th><th>Proveedor</th><th>Producto</th><th>Destino</th>
                <th>Total</th><th>Estado</th><th>Pago</th><th>Entrega</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${purchases.map(o=>`
                <tr>
                  <td>${esc57(o.date||'')}</td>
                  <td>${esc57(o.supplierName||'')}</td>
                  <td>${esc57(o.productName||'')} × ${N57(o.qty)}</td>
                  <td>${o.targetType==='event'?`Fiesta: ${esc57(o.eventName||'')}`:'Stock'}</td>
                  <td><b>${money57(o.total||0)}</b></td>
                  <td><b>${esc57(orderStatus57(o))}</b></td>
                  <td>${esc57(paymentStatus57(o))}</td>
                  <td>${esc57(deliveryStatus57(o))}</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      ${o.supplierSource==='community'?`
                        <button class="secondary small" onclick="openOrderChat57('${o.id}','salon')">💬 Comunicación</button>
                        ${orderStatus57(o)==='Aceptado'&&paymentStatus57(o)!=='Pagado'?`
                          <button class="secondary small" onclick="salonMarkPaid57('${o.id}')">💳 Marcar pagado</button>
                        `:''}
                        ${orderStatus57(o)==='Aceptado'&&deliveryStatus57(o)!=='Entregado'?`
                          <button class="primary small" onclick="salonMarkDelivered57('${o.id}')">📦 Marcar entregado</button>
                        `:''}
                      `:''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `:'<div class="empty">Todavía no hay pedidos.</div>'}
    </div>
  `;
};

// Alias finales
window.openStockPurchase56=window.openStockPurchase57;
window.openStockPurchase55=window.openStockPurchase57;
window.openStockPurchase54=window.openStockPurchase57;
window.openStockPurchase53=window.openStockPurchase57;

window.openPurchaseFromCommunity53=function(providerId){
  openStockPurchase57(`community:${providerId}`);
};

window.renderSuppliersV56=window.renderSuppliersV57;
window.renderSuppliersV55=window.renderSuppliersV57;
window.renderSuppliersV54=window.renderSuppliersV57;
window.renderSuppliersV53=window.renderSuppliersV57;

const route57=renderSalonView;
renderSalonView=function(){
  if(view==='suppliers')return renderSuppliersV57();
  return route57();
};

})();


// ============================================================
// V58 - PORTAL PROVEEDOR: UN SOLO "PEDIDOS" + FINANZAS
// ============================================================
(function(){
'use strict';

data.providerFinanceMovements=data.providerFinanceMovements||[];

const N58=v=>Number(v||0);
const norm58=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc58=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money58=v=>{
  try{return money(v)}catch(e){return '$ '+N58(v).toLocaleString('es-AR')}
};
const sess58=()=>{
  try{return session||{}}catch(e){return window.session||{}}
};

function provider58(){
  const s=sess58();
  const vals=[
    s.providerId,s.supplierId,s.marketSupplierId,s.userId,s.id,
    s.email,s.userEmail,s.username,s.userName,s.name,s.businessName
  ].filter(Boolean).map(norm58);

  return (data.marketSuppliers||[]).find(p=>{
    const keys=[
      p.id,p.userId,p.providerId,p.supplierId,p.email,
      p.username,p.userName,p.name,p.businessName,p.fantasyName
    ].filter(Boolean).map(norm58);
    return keys.some(k=>vals.includes(k));
  })||null;
}
function providerName58(p){
  return String(p?.fantasyName||p?.businessName||p?.name||p?.username||p?.email||'Proveedor');
}
function providerOrders58(p){
  if(!p)return [];
  return (data.stockPurchases||[])
    .filter(o=>o.supplierSource==='community'&&String(o.supplierId)===String(p.id))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function providerMovements58(p){
  if(!p)return [];
  return (data.providerFinanceMovements||[])
    .filter(m=>String(m.providerId)===String(p.id))
    .sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')));
}
function paidSales58(p){
  return providerOrders58(p).filter(o=>o.paymentStatus==='Pagado');
}
function providerTotals58(p){
  const movs=providerMovements58(p);
  const sales=paidSales58(p);

  const ventas=sales.reduce((a,o)=>a+N58(o.total),0);
  const entradasManual=movs.filter(m=>m.kind==='Entrada').reduce((a,m)=>a+N58(m.amount),0);
  const salidas=movs.filter(m=>m.kind==='Salida').reduce((a,m)=>a+N58(m.amount),0);
  const compras=movs.filter(m=>m.kind==='Compra').reduce((a,m)=>a+N58(m.amount),0);

  return {
    ventas,
    entradas:ventas+entradasManual,
    salidas:salidas+compras,
    compras,
    resultado:(ventas+entradasManual)-(salidas+compras)
  };
}

// ------------------------------------------------------------
// LIMPIEZA DEL MENÚ: SACAR "PEDIDOS Y MENSAJES"
// y dejar el botón "PEDIDOS" existente.
// ------------------------------------------------------------
function cleanProviderMenu58(){
  const s=sess58();
  if(s.role!=='provider'&&s.role!=='supplier')return;

  const els=[...document.querySelectorAll('a,button,[role="button"],.nav-item,.menu-item,.sidebar-item,li')];

  els.forEach(el=>{
    const txt=norm58(el.textContent);
    if(txt==='pedidos y mensajes' || txt.includes('pedidos y mensajes')){
      // No tocar el botón "Pedidos" independiente.
      el.style.display='none';
      el.setAttribute('data-hidden-v58','1');
    }
  });

  // Agrega Finanzas una sola vez.
  if(document.querySelector('#provider-finance58'))return;

  const pedidos=[...document.querySelectorAll('a,button,[role="button"],.nav-item,.menu-item,.sidebar-item')]
    .find(el=>norm58(el.textContent)==='pedidos');

  const b=document.createElement('button');
  b.id='provider-finance58';
  b.className=pedidos?.className||'secondary';
  b.innerHTML='💰 Finanzas';
  b.onclick=()=>renderProviderFinance58();

  if(pedidos?.parentNode){
    pedidos.parentNode.insertBefore(b,pedidos.nextSibling);
  }else{
    const host=document.querySelector('.sidebar nav')||
               document.querySelector('.sidebar')||
               document.querySelector('.nav')||
               document.querySelector('#app');
    host?.appendChild(b);
  }
}

setTimeout(cleanProviderMenu58,250);
setInterval(cleanProviderMenu58,1200);

// ------------------------------------------------------------
// MOVIMIENTOS MANUALES DEL PROVEEDOR
// ------------------------------------------------------------
window.openProviderFinanceMovement58=function(kind){
  const p=provider58();
  if(!p)return toast('Proveedor no identificado');

  const title=kind==='Entrada'?'Registrar entrada':
              kind==='Salida'?'Registrar salida':
              'Registrar compra';

  showModal(`
    <div class="modal-title">
      <div><h2>${title}</h2><p>${esc58(providerName58(p))}</p></div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="providerMove58">
      <div class="form-grid">
        <div class="field span2">
          <label>Concepto</label>
          <input name="concept" required placeholder="${kind==='Compra'?'Ej.: Compra de insumos':'Detalle del movimiento'}">
        </div>

        <div class="field">
          <label>Importe</label>
          <input name="amount" type="number" min="0" step="0.01" required>
        </div>

        <div class="field">
          <label>Fecha</label>
          <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required>
        </div>

        <div class="field">
          <label>Medio</label>
          <select name="method">
            <option>Efectivo</option>
            <option>Transferencia</option>
            <option>Mercado Pago</option>
            <option>Tarjeta</option>
            <option>Otro</option>
          </select>
        </div>

        <div class="field">
          <label>Categoría</label>
          <input name="category" value="${kind==='Compra'?'Compra':'General'}">
        </div>

        <div class="field span2">
          <label>Observaciones</label>
          <textarea name="notes"></textarea>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar</button>
      </div>
    </form>
  `);

  document.querySelector('#providerMove58').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));

    data.providerFinanceMovements.push({
      id:id(),
      providerId:p.id,
      kind,
      concept:String(f.concept||'').trim(),
      amount:N58(f.amount),
      date:f.date,
      method:f.method,
      category:String(f.category||'General').trim(),
      notes:String(f.notes||'').trim(),
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    renderProviderFinance58();
    toast('Movimiento guardado');
  };
};

window.deleteProviderFinanceMovement58=function(mid){
  const p=provider58();
  const m=(data.providerFinanceMovements||[]).find(x=>x.id===mid&&String(x.providerId)===String(p?.id));
  if(!m)return;
  if(!confirm(`¿Eliminar "${m.concept}" por ${money58(m.amount)}?`))return;

  data.providerFinanceMovements=data.providerFinanceMovements.filter(x=>x.id!==mid);
  save();
  renderProviderFinance58();
  toast('Movimiento eliminado');
};

// ------------------------------------------------------------
// FINANZAS DEL PROVEEDOR
// ------------------------------------------------------------
window.renderProviderFinance58=function(){
  const p=provider58();
  if(!p)return toast('Proveedor no identificado');

  const totals=providerTotals58(p);
  const movs=providerMovements58(p);
  const sales=paidSales58(p);

  const rows=[
    ...sales.map(o=>({
      id:'',
      date:o.paymentDate||o.date||o.createdAt?.slice?.(0,10)||'',
      kind:'Venta',
      concept:`Venta ${o.productName||''} · pedido ${String(o.id||'').slice(-6)}`,
      method:o.paymentMethod||'',
      amount:N58(o.total),
      auto:true
    })),
    ...movs.map(m=>({...m,auto:false}))
  ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));

  const entradasEfectivo=rows.filter(r=>(r.kind==='Entrada'||r.kind==='Venta')&&r.method==='Efectivo').reduce((a,r)=>a+N58(r.amount),0);
  const entradasTransfer=rows.filter(r=>(r.kind==='Entrada'||r.kind==='Venta')&&r.method==='Transferencia').reduce((a,r)=>a+N58(r.amount),0);

  const content=document.querySelector('#content');
  if(!content)return;

  content.innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h2>💰 Finanzas · ${esc58(providerName58(p))}</h2>
          <small class="muted">Entradas, salidas, compras y ventas del proveedor.</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="primary" onclick="openProviderFinanceMovement58('Entrada')">+ Entrada</button>
          <button class="secondary" onclick="openProviderFinanceMovement58('Salida')">- Salida</button>
          <button class="secondary" onclick="openProviderFinanceMovement58('Compra')">🛒 Compra</button>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:14px">
      <div class="card">
        <small>Entradas</small>
        <h2>${money58(totals.entradas)}</h2>
      </div>
      <div class="card">
        <small>Salidas</small>
        <h2>${money58(totals.salidas)}</h2>
      </div>
      <div class="card">
        <small>Ventas cobradas</small>
        <h2>${money58(totals.ventas)}</h2>
      </div>
      <div class="card">
        <small>Compras</small>
        <h2>${money58(totals.compras)}</h2>
      </div>
      <div class="card">
        <small>Resultado</small>
        <h2>${money58(totals.resultado)}</h2>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Resumen de ingresos</h3>
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px">
        <span><b>Efectivo:</b> ${money58(entradasEfectivo)}</span>
        <span><b>Transferencia:</b> ${money58(entradasTransfer)}</span>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Movimientos</h3>
      ${rows.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th><th>Tipo</th><th>Concepto</th>
                <th>Medio</th><th>Importe</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r=>`
                <tr>
                  <td>${esc58(r.date||'')}</td>
                  <td><b>${esc58(r.kind||'')}</b>${r.auto?' <small>Automático</small>':''}</td>
                  <td>${esc58(r.concept||'')}</td>
                  <td>${esc58(r.method||'-')}</td>
                  <td><b>${money58(r.amount)}</b></td>
                  <td>${!r.auto?`<button class="danger small" onclick="deleteProviderFinanceMovement58('${r.id}')">Eliminar</button>`:''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `:'<div class="empty">Todavía no hay movimientos.</div>'}
    </div>
  `;
};

// ------------------------------------------------------------
// AL CONFIRMAR PAGO EN PEDIDOS, LA VENTA QUEDA AUTOMÁTICAMENTE
// reflejada en Finanzas porque se calcula desde pedidos pagados.
// No duplica movimientos manuales.
// ------------------------------------------------------------

// Si existe el render de pedidos V57, lo conservamos y limpiamos menú después.
const oldProviderOrders58=window.renderProviderOrders57;
if(typeof oldProviderOrders58==='function'){
  window.renderProviderOrders57=function(){
    const r=oldProviderOrders58.apply(this,arguments);
    setTimeout(cleanProviderMenu58,50);
    return r;
  };
}

})();


// ============================================================
// V59 - PRODUCTOS PROVEEDOR: EDITAR + BORRAR
// ============================================================
(function(){
'use strict';

const norm59=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc59=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money59=v=>{
  try{return money(v)}catch(e){return '$ '+Number(v||0).toLocaleString('es-AR')}
};
const sess59=()=>{
  try{return session||{}}catch(e){return window.session||{}}
};

function provider59(){
  const s=sess59();
  const vals=[
    s.providerId,s.supplierId,s.marketSupplierId,s.userId,s.id,
    s.email,s.userEmail,s.username,s.userName,s.name,s.businessName
  ].filter(Boolean).map(norm59);

  return (data.marketSuppliers||[]).find(p=>{
    const keys=[
      p.id,p.userId,p.providerId,p.supplierId,p.email,
      p.username,p.userName,p.name,p.businessName,p.fantasyName
    ].filter(Boolean).map(norm59);
    return keys.some(k=>vals.includes(k));
  })||null;
}
function belongs59(prod,p){
  if(!prod||!p)return false;
  return String(prod.providerId)===String(p.id) ||
         String(prod.providerUserId)===String(p.userId||p.id) ||
         (!!prod.providerEmail && !!p.email &&
          norm59(prod.providerEmail)===norm59(p.email));
}
function products59(p){
  return (data.providerProducts||[])
    .filter(x=>belongs59(x,p))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}

// BORRAR PRODUCTO
window.deleteProviderProduct59=function(productId){
  const p=provider59();
  if(!p)return toast('Proveedor no identificado');

  const prod=(data.providerProducts||[]).find(x=>x.id===productId&&belongs59(x,p));
  if(!prod)return toast('Producto no encontrado');

  const pending=(data.stockPurchases||[]).filter(o=>
    o.supplierSource==='community' &&
    String(o.supplierId)===String(p.id) &&
    String(o.productId)===String(prod.id) &&
    !['Entregado','Rechazado'].includes(String(o.deliveryStatus||o.orderStatus||''))
  ).length;

  const warning=pending
    ? `\n\nHay ${pending} pedido(s) existente(s) relacionados. Esos pedidos conservarán los datos históricos del producto.`
    : '';

  if(!confirm(`¿Borrar el producto "${prod.name}"?${warning}`))return;

  data.providerProducts=(data.providerProducts||[]).filter(x=>x.id!==productId);

  save();
  renderProviderCommunity59();
  toast('Producto eliminado');
};

// LISTADO FINAL DE PRODUCTOS
window.renderProviderCommunity59=function(){
  const p=provider59();
  if(!p)return toast('No se pudo identificar el proveedor');

  const products=products59(p);

  const content=document.querySelector('#content');
  if(!content)return;

  content.innerHTML=`
    <div class="card">
      <div class="section-title">
        <div style="display:flex;align-items:center;gap:12px">
          ${p.logo?`<img src="${p.logo}" style="width:58px;height:58px;object-fit:contain;border-radius:12px">`:''}
          <div>
            <h2>${esc59(p.fantasyName||p.businessName||p.name||'Proveedor')}</h2>
            <small class="muted">
              ${esc59(p.address||'')}
              ${p.phone?' · '+esc59(p.phone):''}
              ${p.email?' · '+esc59(p.email):''}
            </small>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openEditProviderUser56()">✏️ Editar usuario</button>
          <button class="secondary" onclick="openProviderProfile55()">🖼️ Logo / perfil</button>
          <button class="primary" onclick="openProviderOffer53()">+ Publicar oferta</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-title">
        <div>
          <h3>Mis productos</h3>
          <small class="muted">Cada producto puede editarse, ocultarse o eliminarse.</small>
        </div>
        <button class="primary" onclick="openProviderProduct56()">+ Agregar producto</button>
      </div>

      ${products.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Visible</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${products.map(x=>`
                <tr>
                  <td>
                    <div style="display:flex;gap:8px;align-items:center">
                      ${x.photo?`<img src="${x.photo}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">`:''}
                      <div>
                        <b>${esc59(x.name)}</b>
                        <small style="display:block">${esc59(x.description||'')}</small>
                      </div>
                    </div>
                  </td>
                  <td>${esc59(x.category||'')}</td>
                  <td><b>${money59(x.price||0)}</b></td>
                  <td>${x.visibleToSalons!==false?'✅ Sí':'🚫 No'}</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      <button class="secondary small" onclick="openProviderProduct56('${x.id}')">✏️ Editar</button>
                      <button class="danger small" onclick="deleteProviderProduct59('${x.id}')">🗑️ Borrar</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `:'<div class="empty">Todavía no cargaste productos.</div>'}
    </div>
  `;
};

// Alias finales
window.renderProviderCommunity58=window.renderProviderCommunity59;
window.renderProviderCommunity57=window.renderProviderCommunity59;
window.renderProviderCommunity56=window.renderProviderCommunity59;
window.renderProviderCommunity55=window.renderProviderCommunity59;
window.renderProviderCommunity54=window.renderProviderCommunity59;
window.renderProviderCommunity53=window.renderProviderCommunity59;

})();


// ============================================================
// V60 - MENSAJES DEL ADMINISTRADOR: POPUP + COMUNIDAD
// ============================================================
(function(){
'use strict';

data.adminCommunityMessages=data.adminCommunityMessages||[];

const norm60=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc60=v=>{
  try{return esc(v)}catch(e){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const sess60=()=>{
  try{return session||{}}catch(e){return window.session||{}}
};

function role60(){
  return String(sess60().role||'').toLowerCase();
}
function userKey60(){
  const s=sess60();
  return String(
    s.salonId ||
    s.providerId ||
    s.supplierId ||
    s.marketSupplierId ||
    s.userId ||
    s.id ||
    s.email ||
    'anon'
  );
}
function audienceAllows60(m){
  const r=role60();
  const aud=String(m.audience||m.target||'all').toLowerCase();
  if(aud==='all'||aud==='todos'||aud==='ambos')return r==='salon'||r==='provider'||r==='supplier';
  if((aud==='salons'||aud==='salones'||aud==='salon')&&r==='salon')return true;
  if((aud==='providers'||aud==='proveedores'||aud==='provider'||aud==='supplier')&&(r==='provider'||r==='supplier'))return true;
  return false;
}
function adminMessages60(){
  return (data.adminCommunityMessages||[])
    .filter(m=>m.active!==false&&audienceAllows60(m))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function seenKey60(id){
  return `fc_admin_msg_seen_${userKey60()}_${id}`;
}
function isSeen60(id){
  try{return localStorage.getItem(seenKey60(id))==='1'}catch(e){return false}
}
function markSeen60(id){
  try{localStorage.setItem(seenKey60(id),'1')}catch(e){}
}
function fmtDate60(v){
  try{return new Date(v).toLocaleString('es-AR')}catch(e){return ''}
}

// ------------------------------------------------------------
// ADMIN: BOTÓN PARA ENVIAR MENSAJE A TODA LA COMUNIDAD
// ------------------------------------------------------------
window.openAdminCommunityMessage60=function(){
  showModal(`
    <div class="modal-title">
      <div>
        <h2>📢 Mensaje a la comunidad</h2>
        <p>Se mostrará como popup y también quedará guardado en Comunidad.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="adminCommunity60">
      <div class="form-grid">
        <div class="field span2">
          <label>Título</label>
          <input name="title" required>
        </div>

        <div class="field span2">
          <label>Mensaje</label>
          <textarea name="text" required></textarea>
        </div>

        <div class="field">
          <label>Destinatarios</label>
          <select name="audience">
            <option value="all">Salones y proveedores</option>
            <option value="salons">Solo salones</option>
            <option value="providers">Solo proveedores</option>
          </select>
        </div>

        <div class="field">
          <label>Prioridad</label>
          <select name="priority">
            <option value="normal">Normal</option>
            <option value="important">Importante</option>
          </select>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Enviar mensaje</button>
      </div>
    </form>
  `);

  document.querySelector('#adminCommunity60').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));

    data.adminCommunityMessages.push({
      id:id(),
      title:String(f.title||'').trim(),
      text:String(f.text||'').trim(),
      audience:f.audience||'all',
      priority:f.priority||'normal',
      from:'Administrador',
      active:true,
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Mensaje enviado a la comunidad');
  };
};

function injectAdminCommunityButton60(){
  const r=role60();
  if(r!=='admin'&&r!=='administrator')return;
  if(document.querySelector('#admin-community-message60'))return;

  const host=document.querySelector('.topbar .toolbar')||
             document.querySelector('.nav')||
             document.querySelector('.toolbar')||
             document.querySelector('header')||
             document.querySelector('#app');
  if(!host)return;

  const b=document.createElement('button');
  b.id='admin-community-message60';
  b.className='primary';
  b.innerHTML='📢 Mensaje comunidad';
  b.onclick=()=>openAdminCommunityMessage60();
  host.appendChild(b);
}

// ------------------------------------------------------------
// POPUP INMEDIATO PARA SALÓN / PROVEEDOR
// ------------------------------------------------------------
let popupBusy60=false;

function showNextAdminPopup60(){
  const r=role60();
  if(!['salon','provider','supplier'].includes(r))return;
  if(popupBusy60)return;

  const m=adminMessages60().find(x=>!isSeen60(x.id));
  if(!m)return;

  popupBusy60=true;
  markSeen60(m.id);

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${m.priority==='important'?'⚠️':'📢'} ${esc60(m.title||'Mensaje del administrador')}</h2>
        <p>Mensaje de la comunidad</p>
      </div>
      <button class="ghost small" onclick="closeModal();window.finishAdminPopup60()">✕</button>
    </div>

    <div class="card" style="padding:16px">
      <div style="font-size:16px;line-height:1.55">${esc60(m.text||'')}</div>
      <small class="muted" style="display:block;margin-top:12px">${fmtDate60(m.createdAt)}</small>
    </div>

    <div class="form-actions">
      <button class="primary" onclick="closeModal();window.finishAdminPopup60()">Entendido</button>
    </div>
  `);
}

window.finishAdminPopup60=function(){
  popupBusy60=false;
  setTimeout(showNextAdminPopup60,250);
};

// ------------------------------------------------------------
// SECTOR COMUNIDAD: LISTADO PERMANENTE
// ------------------------------------------------------------
function adminMessagesCard60(){
  const msgs=adminMessages60();
  return `
    <div class="card" id="admin-community-card60" style="margin-top:14px">
      <div class="section-title">
        <div>
          <h3>📢 Mensajes del administrador</h3>
          <small class="muted">Comunicaciones oficiales para salones y proveedores.</small>
        </div>
      </div>

      ${msgs.length?msgs.map(m=>`
        <div style="padding:12px 0;border-bottom:1px solid #eee">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <b>${m.priority==='important'?'⚠️ ':''}${esc60(m.title||'Mensaje')}</b>
              <div style="margin-top:4px">${esc60(m.text||'')}</div>
            </div>
            <small class="muted">${fmtDate60(m.createdAt)}</small>
          </div>
        </div>
      `).join(''):'<div class="empty">No hay mensajes del administrador.</div>'}
    </div>
  `;
}

function appendAdminMessagesCard60(){
  if(!['salon','provider','supplier'].includes(role60()))return;
  const c=document.querySelector('#content');
  if(!c||document.querySelector('#admin-community-card60'))return;
  const box=document.createElement('div');
  box.innerHTML=adminMessagesCard60();
  c.appendChild(box.firstElementChild);
}

// Proveedor: Comunidad
const oldProviderCommunity60=window.renderProviderCommunity59;
if(typeof oldProviderCommunity60==='function'){
  window.renderProviderCommunity59=function(){
    const r=oldProviderCommunity60.apply(this,arguments);
    setTimeout(appendAdminMessagesCard60,50);
    return r;
  };
  window.renderProviderCommunity58=window.renderProviderCommunity59;
  window.renderProviderCommunity57=window.renderProviderCommunity59;
  window.renderProviderCommunity56=window.renderProviderCommunity59;
  window.renderProviderCommunity55=window.renderProviderCommunity59;
  window.renderProviderCommunity54=window.renderProviderCommunity59;
  window.renderProviderCommunity53=window.renderProviderCommunity59;
}

// Salón: Comunidad
const oldCommunityV24_60=window.renderCommunityV24;
if(typeof oldCommunityV24_60==='function'){
  window.renderCommunityV24=function(){
    const r=oldCommunityV24_60.apply(this,arguments);
    setTimeout(appendAdminMessagesCard60,50);
    return r;
  };
}

// Si existe renderCommunity general, también lo reforzamos.
const oldCommunityGeneral60=window.renderCommunity;
if(typeof oldCommunityGeneral60==='function'){
  window.renderCommunity=function(){
    const r=oldCommunityGeneral60.apply(this,arguments);
    setTimeout(appendAdminMessagesCard60,50);
    return r;
  };
}

// ------------------------------------------------------------
// POLLING: PARA QUE APAREZCA "EN EL MOMENTO"
// Consulta solo los mensajes administrativos sin tocar el resto
// del estado local.
// ------------------------------------------------------------
let polling60=false;
async function pollAdminMessages60(){
  if(polling60)return;
  const r=role60();
  if(!['salon','provider','supplier'].includes(r))return;

  polling60=true;
  try{
    const res=await fetch('/api/data',{cache:'no-store'});
    if(res.ok){
      const remote=await res.json();
      const src=(remote&&remote.data)?remote.data:remote;
      if(Array.isArray(src?.adminCommunityMessages)){
        const localById=new Map((data.adminCommunityMessages||[]).map(x=>[String(x.id),x]));
        src.adminCommunityMessages.forEach(x=>localById.set(String(x.id),x));
        data.adminCommunityMessages=[...localById.values()];
      }
    }
  }catch(e){}
  finally{
    polling60=false;
    showNextAdminPopup60();

    // Si el usuario está justo dentro de Comunidad, actualiza el bloque.
    const card=document.querySelector('#admin-community-card60');
    if(card){
      const wrap=document.createElement('div');
      wrap.innerHTML=adminMessagesCard60();
      card.replaceWith(wrap.firstElementChild);
    }
  }
}

setTimeout(()=>{
  injectAdminCommunityButton60();
  showNextAdminPopup60();
  pollAdminMessages60();
},400);

setInterval(injectAdminCommunityButton60,1400);
setInterval(pollAdminMessages60,5000);

})();

// ============================================================
// V74 - ELIMINAR REALMENTE "MIS PRODUCTOS" DEL MENÚ PROVEEDOR
// Corrige el caso con icono "📦 Mis productos".
// ============================================================
(function(){
'use strict';

const norm74=v=>String(v||'')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\p{L}\p{N}\s]/gu,' ')
  .replace(/\s+/g,' ')
  .trim();

function removeMisProductos74(){
  const sidebar=document.querySelector('.sidebar');
  if(!sidebar)return;

  const sideText=norm74(sidebar.innerText||'');
  if(!sideText.includes('portal proveedor'))return;

  // Busca únicamente dentro de la barra lateral.
  const nodes=[...sidebar.querySelectorAll('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item')];

  nodes.forEach(el=>{
    const txt=norm74(el.textContent||'');
    if(txt.includes('mis productos')){
      const target=el.closest('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item')||el;
      target.remove();
    }
  });
}

removeMisProductos74();
document.addEventListener('DOMContentLoaded',removeMisProductos74);
setTimeout(removeMisProductos74,50);
setTimeout(removeMisProductos74,250);
setTimeout(removeMisProductos74,800);

const obs74=new MutationObserver(removeMisProductos74);
obs74.observe(document.documentElement,{childList:true,subtree:true});

})();

// ============================================================
// V75 - PEDIDOS MULTI-ITEM + NOMBRE DEL SALÓN + REMITO FINAL PDF
// ============================================================
(function(){
'use strict';

const N75=v=>Number(v||0);
const norm75=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc75=v=>{
  try{return esc(v)}catch(_){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money75=v=>{
  try{return money(v)}catch(_){return '$ '+N75(v).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2})}
};
const SID75=()=>{
  try{return session?.salonId}catch(_){return window.session?.salonId}
};
const sess75=()=>{
  try{return session||{}}catch(_){return window.session||{}}
};

function salon75(salonId=SID75()){
  return (data.salons||[]).find(s=>String(s.id)===String(salonId))||{};
}
function salonName75(salonId=SID75()){
  const s=salon75(salonId);
  return String(s.fantasyName||s.businessName||s.name||s.salonName||s.email||'Salón');
}
function provider75(){
  const s=sess75();
  const vals=[
    s.providerId,s.supplierId,s.marketSupplierId,s.userId,s.id,
    s.email,s.userEmail,s.username,s.userName,s.name,s.businessName
  ].filter(Boolean).map(norm75);

  return (data.marketSuppliers||[]).find(p=>{
    const keys=[
      p.id,p.userId,p.providerId,p.supplierId,
      p.email,p.username,p.userName,p.name,p.businessName,p.fantasyName
    ].filter(Boolean).map(norm75);
    return keys.some(k=>vals.includes(k));
  })||null;
}
function providerName75(p){
  return String(p?.fantasyName||p?.businessName||p?.name||p?.username||p?.email||'Proveedor');
}
function ownProviders75(){
  return (data.suppliers||[]).filter(x=>String(x.salonId)===String(SID75()));
}
function stockProducts75(){
  return (data.stockProducts||[]).filter(x=>String(x.salonId)===String(SID75()));
}
function communityProviders75(){
  return (data.marketSuppliers||[])
    .filter(p=>p.status!=='Suspendido'&&p.active!==false)
    .map(p=>{
      let products=(data.providerProducts||[])
        .filter(x=>String(x.providerId)===String(p.id)&&x.active!==false&&x.visibleToSalons!==false);

      // Compatibilidad con productos históricos guardados en marketSuppliers[].products
      if(!products.length && Array.isArray(p.products)){
        products=p.products.filter(x=>x.active!==false&&x.visibleToSalons!==false);
      }
      return {raw:p,id:p.id,display:providerName75(p),products};
    });
}
function events75(){
  return (data.events||[]).filter(x=>String(x.salonId)===String(SID75())&&x.status!=='Cancelada')
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
}
function getOrder75(idv){
  return (data.stockPurchases||[]).find(o=>String(o.id)===String(idv));
}
function orderStatus75(o){return o.orderStatus||o.status||'Registrado'}
function paymentStatus75(o){return o.paymentStatus||'Pendiente'}
function deliveryStatus75(o){return o.deliveryStatus||'Pendiente de entrega'}

function items75(o){
  if(Array.isArray(o.items)&&o.items.length){
    return o.items.map(x=>({
      productId:x.productId||x.id||'',
      productName:x.productName||x.name||'Producto',
      productCategory:x.productCategory||x.category||'',
      productDescription:x.productDescription||x.description||'',
      productPhoto:x.productPhoto||x.photo||'',
      qty:N75(x.qty||x.quantity||0),
      unitCost:N75(x.unitCost??x.price??x.cost??0),
      total:N75(x.total || N75(x.qty||x.quantity||0)*N75(x.unitCost??x.price??x.cost??0))
    }));
  }
  return [{
    productId:o.productId||'',
    productName:o.productName||'Producto',
    productCategory:o.productCategory||'',
    productDescription:o.productDescription||'',
    productPhoto:o.productPhoto||'',
    qty:N75(o.qty||0),
    unitCost:N75(o.unitCost||0),
    total:N75(o.total||N75(o.qty||0)*N75(o.unitCost||0))
  }];
}
function itemsSummary75(o){
  const a=items75(o);
  if(a.length===1)return `${a[0].productName} × ${a[0].qty}`;
  return `${a.length} ítems · ${a.reduce((s,x)=>s+N75(x.qty),0)} unidades`;
}
function orderCode75(o){
  return String(o.orderCode||o.code||('PED-'+String(o.id||'').slice(-8).toUpperCase()));
}

function addMessage75(orderId,fromType,fromName,text){
  data.orderMessages=data.orderMessages||[];
  data.orderMessages.push({
    id:id(),orderId,fromType,fromName,text:String(text||'').trim(),
    createdAt:new Date().toISOString()
  });
}

function addExpenseOnce75(o){
  if(o.paymentStatus!=='Pagado'||o.financeExpenseCreated===true)return;
  data.movements=data.movements||[];
  const key=`v75:community-order:${o.id}`;
  const oldKey=`v57:community-order:${o.id}`;
  const exists=data.movements.some(m=>String(m.sourceKey)===key||String(m.sourceKey)===oldKey);
  if(!exists){
    data.movements.push({
      id:id(),
      salonId:o.salonId,
      eventId:o.eventId||'',
      type:'Gasto',
      category:o.targetType==='event'?'Compra para fiesta':'Compra de stock',
      concept:`Pedido ${orderCode75(o)} · ${o.supplierName}`,
      amount:N75(o.total),
      movementDate:o.paymentDate||new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString(),
      sourceKey:key
    });
  }
  o.financeExpenseCreated=true;
}

function addStockItemsOnce75(o){
  if(o.targetType!=='stock'||o.deliveryStatus!=='Entregado'||o.stockAdded===true)return;
  data.stockProducts=data.stockProducts||[];

  items75(o).forEach(it=>{
    let stock=data.stockProducts.find(p=>
      String(p.salonId)===String(o.salonId) &&
      (
        (it.productId && String(p.id)===String(it.productId)) ||
        norm75(p.name)===norm75(it.productName)
      )
    );

    if(!stock){
      stock={
        id:id(),
        salonId:o.salonId,
        name:it.productName,
        category:it.productCategory||'Compras',
        description:it.productDescription||'',
        photo:it.productPhoto||'',
        stock:0,
        minStock:0,
        costPrice:it.unitCost,
        active:true,
        createdAt:new Date().toISOString()
      };
      data.stockProducts.push(stock);
    }
    stock.stock=N75(stock.stock)+N75(it.qty);
    stock.costPrice=N75(it.unitCost);
  });

  o.stockAdded=true;
  o.stockAddedAt=new Date().toISOString();
}

// ------------------------------------------------------------
// SALÓN - NUEVO PEDIDO CON VARIOS ÍTEMS
// ------------------------------------------------------------
window.openStockPurchase75=function(preselect=''){
  const own=ownProviders75();
  const community=communityProviders75();
  const events=events75();

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Nueva compra / pedido</h2>
        <p>Podés incluir varios productos dentro del mismo pedido.</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="purchase75">
      <div class="form-grid">
        <div class="field">
          <label>Destino</label>
          <select id="target75" name="targetType">
            <option value="stock">Para Stock</option>
            <option value="event">Para una fiesta</option>
          </select>
        </div>

        <div class="field" id="eventWrap75" style="display:none">
          <label>Fiesta</label>
          <select id="event75" name="eventId">
            <option value="">Seleccionar fiesta</option>
            ${events.map(e=>`<option value="${e.id}">${esc75(e.date||'')} · ${esc75(e.eventName||e.child||'Evento')}</option>`).join('')}
          </select>
        </div>

        <div class="field span2">
          <label>Proveedor</label>
          <select id="supplier75" name="supplier" required>
            <option value="">Seleccionar proveedor</option>
            ${own.length?`
              <optgroup label="Mis proveedores manuales">
                ${own.map(s=>`<option value="own:${s.id}" ${preselect===`own:${s.id}`?'selected':''}>${esc75(s.name||s.businessName||'Proveedor')}</option>`).join('')}
              </optgroup>`:''}
            ${community.length?`
              <optgroup label="Proveedores de la comunidad">
                ${community.map(c=>`<option value="community:${c.id}" ${preselect===`community:${c.id}`?'selected':''}>${esc75(c.display)}</option>`).join('')}
              </optgroup>`:''}
          </select>
        </div>
      </div>

      <div class="card" style="margin:14px 0;padding:14px">
        <div class="section-title">
          <div>
            <h3>Ítems del pedido</h3>
            <small class="muted">Agregá todos los productos que necesites en un único pedido.</small>
          </div>
          <button type="button" class="secondary small" id="addItem75">+ Agregar ítem</button>
        </div>
        <div id="items75" style="margin-top:10px"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;font-size:18px">
          <b>Total pedido: <span id="grandTotal75">${money75(0)}</span></b>
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label>Fecha del pedido</label>
          <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required>
        </div>

        <div class="field span2">
          <label>Mensaje inicial al proveedor</label>
          <textarea name="initialMessage" placeholder="Ej.: Necesito entrega para el viernes por la mañana."></textarea>
        </div>
      </div>

      <div class="form-actions">
        <button class="primary">Enviar pedido</button>
      </div>
    </form>
  `);

  const target=document.querySelector('#target75');
  const eventWrap=document.querySelector('#eventWrap75');
  const eventEl=document.querySelector('#event75');
  const supplier=document.querySelector('#supplier75');
  const itemsHost=document.querySelector('#items75');
  const grand=document.querySelector('#grandTotal75');
  let rowSeq=0;

  function currentProviderData(){
    const [source,pid]=String(supplier.value||'').split(':');
    if(source==='community'){
      const c=community.find(x=>String(x.id)===String(pid));
      return {source,pid,products:c?.products||[],provider:c};
    }
    if(source==='own'){
      return {source,pid,products:stockProducts75(),provider:own.find(x=>String(x.id)===String(pid))};
    }
    return {source:'',pid:'',products:[],provider:null};
  }

  function productOptions(){
    const ctx=currentProviderData();
    if(!ctx.pid)return '<option value="">Seleccioná primero un proveedor</option>';
    return '<option value="">Seleccionar producto</option>'+
      ctx.products.map(p=>`
        <option value="${esc75(p.id)}">
          ${esc75(p.name||p.product||'Producto')}${ctx.source==='community'?' · '+money75(p.price??p.cost??0):''}
        </option>`).join('');
  }

  function recalc(){
    let total=0;
    itemsHost.querySelectorAll('.order-item75').forEach(row=>{
      const q=N75(row.querySelector('[data-qty]')?.value);
      const c=N75(row.querySelector('[data-cost]')?.value);
      const t=q*c;
      row.querySelector('[data-total]').value=money75(t);
      total+=t;
    });
    grand.textContent=money75(total);
  }

  function syncRowPrice(row){
    const ctx=currentProviderData();
    const prodId=row.querySelector('[data-product]').value;
    const prod=ctx.products.find(p=>String(p.id)===String(prodId));
    const cost=row.querySelector('[data-cost]');

    if(ctx.source==='community'){
      cost.readOnly=true;
      cost.value=prod?N75(prod.price??prod.cost??0):'';
    }else{
      cost.readOnly=false;
      if(prod && !cost.value)cost.value=N75(prod.costPrice??prod.cost??0);
    }
    recalc();
  }

  function addRow(){
    if(!supplier.value)return toast('Seleccioná un proveedor primero');

    const idx=++rowSeq;
    const row=document.createElement('div');
    row.className='order-item75';
    row.style.cssText='display:grid;grid-template-columns:minmax(220px,2fr) 90px 130px 130px auto;gap:8px;align-items:end;padding:10px 0;border-bottom:1px solid #eee';
    row.innerHTML=`
      <div class="field" style="margin:0">
        <label>Producto</label>
        <select data-product required>${productOptions()}</select>
      </div>
      <div class="field" style="margin:0">
        <label>Cant.</label>
        <input data-qty type="number" min="1" value="1" required>
      </div>
      <div class="field" style="margin:0">
        <label>Precio unit.</label>
        <input data-cost type="number" min="0" step="0.01" required>
      </div>
      <div class="field" style="margin:0">
        <label>Total</label>
        <input data-total readonly>
      </div>
      <button type="button" class="danger small" data-remove title="Quitar ítem">🗑️</button>
    `;
    itemsHost.appendChild(row);

    row.querySelector('[data-product]').onchange=()=>syncRowPrice(row);
    row.querySelector('[data-qty]').oninput=recalc;
    row.querySelector('[data-cost]').oninput=recalc;
    row.querySelector('[data-remove]').onclick=()=>{
      row.remove();
      recalc();
    };
    syncRowPrice(row);
  }

  function resetItems(){
    itemsHost.innerHTML='';
    rowSeq=0;
    if(supplier.value)addRow();
    else recalc();
  }

  target.onchange=()=>{
    eventWrap.style.display=target.value==='event'?'':'none';
    eventEl.required=target.value==='event';
  };
  supplier.onchange=resetItems;
  document.querySelector('#addItem75').onclick=addRow;

  target.onchange();
  if(preselect){
    supplier.value=preselect;
    resetItems();
  }

  document.querySelector('#purchase75').onsubmit=e=>{
    e.preventDefault();

    const fd=new FormData(e.target);
    const [source,supplierId]=String(fd.get('supplier')||'').split(':');
    if(!supplierId)return toast('Seleccioná un proveedor');
    if(fd.get('targetType')==='event'&&!fd.get('eventId'))return toast('Seleccioná la fiesta');

    const ctx=currentProviderData();
    const rows=[...itemsHost.querySelectorAll('.order-item75')];
    if(!rows.length)return toast('Agregá al menos un ítem al pedido');

    const orderItems=[];
    const used=new Set();

    for(const row of rows){
      const productId=row.querySelector('[data-product]').value;
      const qty=N75(row.querySelector('[data-qty]').value);
      const unitCost=N75(row.querySelector('[data-cost]').value);
      const prod=ctx.products.find(p=>String(p.id)===String(productId));

      if(!prod)return toast('Seleccioná un producto en todos los ítems');
      if(qty<=0)return toast('La cantidad debe ser mayor a cero');
      if(used.has(String(productId)))return toast('Un producto está repetido. Usá una sola línea y aumentá la cantidad.');
      used.add(String(productId));

      orderItems.push({
        productId:prod.id,
        productName:prod.name||prod.product||'Producto',
        productCategory:prod.category||'',
        productDescription:prod.description||'',
        productPhoto:prod.photo||prod.image||'',
        qty,
        unitCost,
        total:qty*unitCost
      });
    }

    const sup=source==='community'
      ? community.find(x=>String(x.id)===String(supplierId))
      : own.find(x=>String(x.id)===String(supplierId));

    if(!sup)return toast('Proveedor no encontrado');

    const event=fd.get('targetType')==='event'
      ? events.find(x=>String(x.id)===String(fd.get('eventId')))
      : null;

    const total=orderItems.reduce((s,x)=>s+N75(x.total),0);
    const first=orderItems[0];
    const oid=id();

    const order={
      id:oid,
      orderCode:'PED-'+String(oid).slice(-8).toUpperCase(),
      salonId:SID75(),
      salonName:salonName75(),
      supplierId,
      supplierSource:source,
      supplierName:source==='community'?sup.display:(sup.name||sup.businessName||'Proveedor'),
      targetType:fd.get('targetType'),
      eventId:event?.id||'',
      eventName:event?.eventName||event?.child||'',
      items:orderItems,

      // Compatibilidad con módulos anteriores
      productId:first.productId,
      productName:orderItems.length===1?first.productName:`${orderItems.length} ítems`,
      productCategory:first.productCategory,
      productDescription:first.productDescription,
      productPhoto:first.productPhoto,
      qty:orderItems.reduce((s,x)=>s+N75(x.qty),0),
      unitCost:orderItems.length===1?first.unitCost:0,

      total,
      date:fd.get('date'),
      orderStatus:source==='community'?'Pendiente de aceptación':'Registrado',
      paymentStatus:'Pendiente',
      deliveryStatus:'Pendiente de entrega',
      stockAdded:false,
      financeExpenseCreated:false,
      createdAt:new Date().toISOString()
    };

    data.stockPurchases=data.stockPurchases||[];
    data.stockPurchases.push(order);

    if(source==='community'){
      const msg=String(fd.get('initialMessage')||'').trim() ||
        `Nuevo pedido de ${order.salonName}: ${orderItems.map(x=>`${x.qty} x ${x.productName}`).join(', ')}.`;
      addMessage75(order.id,'salon',order.salonName,msg);
    }

    save();
    closeModal();
    renderSuppliersV57();
    toast(source==='community'?'Pedido enviado al proveedor':'Pedido registrado');
  };
};

// Reemplaza todos los accesos anteriores a "Nueva compra / pedido"
window.openStockPurchase57=window.openStockPurchase75;
window.openStockPurchase56=window.openStockPurchase75;
window.openStockPurchase55=window.openStockPurchase75;
window.openStockPurchase54=window.openStockPurchase75;
window.openStockPurchase53=window.openStockPurchase75;
window.openPurchaseFromCommunity53=function(providerId){
  openStockPurchase75(`community:${providerId}`);
};

// ------------------------------------------------------------
// PAGO / ENTREGA MULTI-ITEM
// ------------------------------------------------------------
window.salonMarkPaid57=function(orderId){
  const o=getOrder75(orderId);
  if(!o)return;
  if(orderStatus75(o)!=='Aceptado')return toast('El proveedor debe aceptar el pedido primero');
  if(paymentStatus75(o)==='Pagado')return toast('El pedido ya figura pagado');
  if(!confirm(`¿Confirmar pago de ${money75(o.total)} a ${o.supplierName}?`))return;

  o.paymentStatus='Pagado';
  o.paymentDate=new Date().toISOString().slice(0,10);
  addExpenseOnce75(o);
  addMessage75(o.id,'salon',o.salonName||salonName75(o.salonId),'Pago realizado.');
  save();
  renderSuppliersV57();
  toast('Pago registrado');
};

window.salonMarkDelivered57=function(orderId){
  const o=getOrder75(orderId);
  if(!o)return;
  if(orderStatus75(o)!=='Aceptado')return toast('El proveedor debe aceptar el pedido primero');
  if(deliveryStatus75(o)==='Entregado')return toast('El pedido ya figura entregado');
  if(!confirm(`¿Confirmás que recibiste el pedido de ${o.supplierName}?`))return;

  o.deliveryStatus='Entregado';
  o.deliveredAt=new Date().toISOString();
  addStockItemsOnce75(o);
  addMessage75(o.id,'salon',o.salonName||salonName75(o.salonId),'Pedido recibido y marcado como entregado.');
  save();
  renderSuppliersV57();
  toast(o.targetType==='stock'?'Pedido entregado y stock actualizado':'Pedido entregado');
};

// ------------------------------------------------------------
// PDF - REMITO FINAL
// Se habilita únicamente cuando está PAGADO + ENTREGADO.
// ------------------------------------------------------------
function pdfSafe75(v){
  return String(v??'')
    .replace(/€/g,'EUR')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g,' ');
}
function pdfEsc75(v){
  return pdfSafe75(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function makePdf75(lines){
  const content=[];
  content.push('BT');
  content.push('/F1 11 Tf');
  content.push('50 790 Td');

  lines.forEach((ln,i)=>{
    if(i>0)content.push('0 -17 Td');
    const bold=ln.bold===true;
    content.push(`/${bold?'F2':'F1'} ${bold?12:10.5} Tf`);
    content.push(`(${pdfEsc75(ln.text)}) Tj`);
  });
  content.push('ET');

  const stream=content.join('\n');
  const objs=[];
  objs[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objs[2]='<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>';
  objs[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[5]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[6]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(let i=1;i<=6;i++){
    offsets[i]=pdf.length;
    pdf+=`${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+='xref\n0 7\n0000000000 65535 f \n';
  for(let i=1;i<=6;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

window.downloadOrderRemito75=function(orderId){
  const o=getOrder75(orderId);
  if(!o)return toast('Pedido no encontrado');

  if(paymentStatus75(o)!=='Pagado'||deliveryStatus75(o)!=='Entregado'){
    return toast('El remito final se habilita cuando el pedido está pagado y entregado');
  }

  const code=orderCode75(o);
  const salonName=o.salonName||salonName75(o.salonId);
  const its=items75(o);

  const lines=[
    {text:'FIESTACONTROL - REMITO FINAL',bold:true},
    {text:`Remito: ${code}`},
    {text:`Fecha del pedido: ${o.date||''}`},
    {text:`Salon: ${salonName}`},
    {text:`Proveedor: ${o.supplierName||''}`},
    {text:`Destino: ${o.targetType==='event'?'Fiesta - '+(o.eventName||''): 'Stock'}`},
    {text:'------------------------------------------------------------'},
    {text:'DETALLE',bold:true},
  ];

  its.forEach((x,i)=>{
    lines.push({text:`${i+1}. ${x.productName}`});
    lines.push({text:`   Cantidad: ${x.qty}   Unitario: ${money75(x.unitCost)}   Subtotal: ${money75(x.total)}`});
  });

  lines.push(
    {text:'------------------------------------------------------------'},
    {text:`TOTAL: ${money75(o.total)}`,bold:true},
    {text:`Pago: ${paymentStatus75(o)}`},
    {text:`Entrega: ${deliveryStatus75(o)}`},
    {text:`Entregado: ${o.deliveredAt?new Date(o.deliveredAt).toLocaleString('es-AR'):''}`},
    {text:''},
    {text:'Documento generado por FiestaControl.'}
  );

  const pdf=makePdf75(lines);
  const bytes=new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;

  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`Remito_${code}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
};

// ------------------------------------------------------------
// PROVEEDOR - PEDIDOS RECIBIDOS CON NOMBRE DEL SALÓN
// ------------------------------------------------------------
window.renderProviderOrders57=function(){
  const p=provider75();
  if(!p)return toast('Proveedor no identificado');

  const orders=(data.stockPurchases||[])
    .filter(o=>o.supplierSource==='community'&&String(o.supplierId)===String(p.id))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h2>📦 Pedidos recibidos</h2>
          <small class="muted">Cada pedido identifica el salón que lo realizó.</small>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      ${orders.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Pedido</th><th>Fecha</th><th>Salón</th><th>Detalle</th><th>Total</th>
                <th>Estado</th><th>Pago</th><th>Entrega</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(o=>`
                <tr>
                  <td><b>${esc75(orderCode75(o))}</b></td>
                  <td>${esc75(o.date||'')}</td>
                  <td>
                    <b>${esc75(o.salonName||salonName75(o.salonId))}</b>
                    ${o.eventName?`<small style="display:block">Fiesta: ${esc75(o.eventName)}</small>`:''}
                  </td>
                  <td>
                    ${items75(o).map(x=>`
                      <div style="padding:3px 0">
                        <b>${esc75(x.productName)}</b> × ${x.qty}
                        <small style="display:block">${money75(x.unitCost)} c/u · ${money75(x.total)}</small>
                      </div>
                    `).join('')}
                  </td>
                  <td><b>${money75(o.total)}</b></td>
                  <td><b>${esc75(orderStatus75(o))}</b></td>
                  <td>${esc75(paymentStatus75(o))}</td>
                  <td>${esc75(deliveryStatus75(o))}</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      ${orderStatus75(o)==='Pendiente de aceptación'?`
                        <button class="primary small" onclick="providerAcceptOrder57('${o.id}')">Aceptar</button>
                        <button class="danger small" onclick="providerRejectOrder57('${o.id}')">Rechazar</button>
                      `:''}
                      ${orderStatus75(o)==='Aceptado'&&paymentStatus75(o)==='Pagado'&&!o.providerPaymentConfirmed?`
                        <button class="secondary small" onclick="providerConfirmPayment57('${o.id}')">Confirmar pago recibido</button>
                      `:''}
                      <button class="secondary small" onclick="openOrderChat57('${o.id}','provider')">💬 Comunicación</button>
                      ${paymentStatus75(o)==='Pagado'&&deliveryStatus75(o)==='Entregado'?`
                        <button class="primary small" onclick="downloadOrderRemito75('${o.id}')">📄 Remito final PDF</button>
                      `:''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `:'<div class="empty">Todavía no recibiste pedidos.</div>'}
    </div>
  `;
};

// ------------------------------------------------------------
// SALÓN - LISTADO DE PEDIDOS MULTI-ITEM + REMITO PDF
// ------------------------------------------------------------
window.renderSuppliersV57=function(){
  const own=ownProviders75();
  const community=communityProviders75();
  const purchases=(data.stockPurchases||[])
    .filter(o=>String(o.salonId)===String(SID75()))
    .sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));

  setTitle('Proveedores','Pedidos, comunidad y stock');

  $('#content').innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>🚚 Proveedores</h3>
          <small class="muted">Un pedido puede contener varios productos. El remito final se habilita cuando está pagado y entregado.</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" onclick="openManualSupplier51()">+ Proveedor manual</button>
          <button class="primary" onclick="openStockPurchase75()">+ Nueva compra / pedido</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Proveedores de la comunidad</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:10px">
        ${community.length?community.map(c=>`
          <div class="card" style="margin:0">
            <div style="display:flex;gap:10px;align-items:center">
              ${c.raw.logo?`<img src="${c.raw.logo}" style="width:54px;height:54px;object-fit:contain;border-radius:10px">`:''}
              <div>
                <h3 style="margin:0">${esc75(c.display)}</h3>
                <small>${esc75(c.raw.address||'')}</small>
              </div>
            </div>
            <div style="margin-top:10px">
              ${c.products.length?c.products.map(p=>`
                <div style="display:grid;grid-template-columns:54px 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #eee">
                  ${p.photo?`<img src="${p.photo}" style="width:54px;height:54px;object-fit:cover;border-radius:8px">`:'<div></div>'}
                  <div>
                    <b>${esc75(p.name||p.product||'Producto')}</b>
                    <small style="display:block">${esc75(p.description||'')}</small>
                  </div>
                  <b>${money75(p.price??p.cost??0)}</b>
                </div>
              `).join(''):'<div class="empty">Sin productos visibles.</div>'}
            </div>
            <button class="primary small" style="margin-top:10px" onclick="openStockPurchase75('community:${c.id}')">Hacer pedido</button>
          </div>
        `).join(''):'<div class="empty">No hay proveedores de la comunidad.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Mis proveedores manuales</h3>
      ${own.length?own.map(s=>`
        <div style="padding:8px 0;border-bottom:1px solid #eee">
          <b>${esc75(s.name||s.businessName||'Proveedor')}</b>
        </div>
      `).join(''):'<div class="empty">Sin proveedores manuales.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Pedidos / compras</h3>
      ${purchases.length?`
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Pedido</th><th>Fecha</th><th>Proveedor</th><th>Ítems</th><th>Destino</th>
                <th>Total</th><th>Estado</th><th>Pago</th><th>Entrega</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${purchases.map(o=>`
                <tr>
                  <td><b>${esc75(orderCode75(o))}</b></td>
                  <td>${esc75(o.date||'')}</td>
                  <td>${esc75(o.supplierName||'')}</td>
                  <td>
                    ${items75(o).map(x=>`
                      <div style="padding:3px 0">
                        <b>${esc75(x.productName)}</b> × ${x.qty}
                        <small style="display:block">${money75(x.unitCost)} c/u · ${money75(x.total)}</small>
                      </div>
                    `).join('')}
                  </td>
                  <td>${o.targetType==='event'?`Fiesta: ${esc75(o.eventName||'')}`:'Stock'}</td>
                  <td><b>${money75(o.total||0)}</b></td>
                  <td><b>${esc75(orderStatus75(o))}</b></td>
                  <td>${esc75(paymentStatus75(o))}</td>
                  <td>${esc75(deliveryStatus75(o))}</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      ${o.supplierSource==='community'?`
                        <button class="secondary small" onclick="openOrderChat57('${o.id}','salon')">💬 Comunicación</button>
                        ${orderStatus75(o)==='Aceptado'&&paymentStatus75(o)!=='Pagado'?`
                          <button class="secondary small" onclick="salonMarkPaid57('${o.id}')">💳 Marcar pagado</button>
                        `:''}
                        ${orderStatus75(o)==='Aceptado'&&deliveryStatus75(o)!=='Entregado'?`
                          <button class="primary small" onclick="salonMarkDelivered57('${o.id}')">📦 Marcar entregado</button>
                        `:''}
                      `:''}
                      ${paymentStatus75(o)==='Pagado'&&deliveryStatus75(o)==='Entregado'?`
                        <button class="primary small" onclick="downloadOrderRemito75('${o.id}')">📄 Remito final PDF</button>
                      `:''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `:'<div class="empty">Todavía no hay pedidos.</div>'}
    </div>
  `;
};

// Mantener aliases que otros módulos ya usan.
window.renderSuppliersV56=window.renderSuppliersV57;
window.renderSuppliersV55=window.renderSuppliersV57;
window.renderSuppliersV54=window.renderSuppliersV57;
window.renderSuppliersV53=window.renderSuppliersV57;

})();

// ============================================================
// V76 - CONFIRMACIÓN DE PAGO + ENTREGA + REMITO PDF DETALLADO
// ============================================================
(function(){
'use strict';

const N76=v=>Number(v||0);
const norm76=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc76=v=>{
  try{return esc(v)}catch(_){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};
const money76=v=>{
  try{return money(v)}catch(_){return '$ '+N76(v).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2})}
};
const today76=()=>new Date().toISOString().slice(0,10);

function getOrder76(orderId){
  return (data.stockPurchases||[]).find(o=>String(o.id)===String(orderId));
}
function orderStatus76(o){return o?.orderStatus||o?.status||'Registrado'}
function paymentStatus76(o){return o?.paymentStatus||'Pendiente'}
function deliveryStatus76(o){return o?.deliveryStatus||'Pendiente de entrega'}
function orderCode76(o){
  return String(o?.orderCode||o?.code||('PED-'+String(o?.id||'').slice(-8).toUpperCase()));
}
function salonName76(o){
  if(o?.salonName)return o.salonName;
  const s=(data.salons||[]).find(x=>String(x.id)===String(o?.salonId));
  return String(s?.fantasyName||s?.businessName||s?.name||s?.salonName||s?.email||'Salón');
}
function items76(o){
  if(Array.isArray(o?.items)&&o.items.length){
    return o.items.map(x=>({
      productId:x.productId||x.id||'',
      productName:x.productName||x.name||'Producto',
      productCategory:x.productCategory||x.category||'',
      productDescription:x.productDescription||x.description||'',
      productPhoto:x.productPhoto||x.photo||'',
      qty:N76(x.qty||x.quantity||0),
      unitCost:N76(x.unitCost??x.price??x.cost??0),
      total:N76(x.total || N76(x.qty||x.quantity||0)*N76(x.unitCost??x.price??x.cost??0))
    }));
  }
  return [{
    productId:o?.productId||'',
    productName:o?.productName||'Producto',
    productCategory:o?.productCategory||'',
    productDescription:o?.productDescription||'',
    productPhoto:o?.productPhoto||'',
    qty:N76(o?.qty||0),
    unitCost:N76(o?.unitCost||0),
    total:N76(o?.total||N76(o?.qty||0)*N76(o?.unitCost||0))
  }];
}
function addMessage76(orderId,fromType,fromName,text){
  data.orderMessages=data.orderMessages||[];
  data.orderMessages.push({
    id:id(),orderId,fromType,fromName,
    text:String(text||'').trim(),
    createdAt:new Date().toISOString()
  });
}
function ensurePaymentOrderNumber76(o){
  if(o.paymentOrderNumber)return o.paymentOrderNumber;
  const now=new Date();
  const yyyy=now.getFullYear();
  const mm=String(now.getMonth()+1).padStart(2,'0');
  const dd=String(now.getDate()).padStart(2,'0');
  const rnd=String(Math.floor(Math.random()*10000)).padStart(4,'0');
  o.paymentOrderNumber=`OP-${yyyy}${mm}${dd}-${rnd}`;
  return o.paymentOrderNumber;
}

function refreshSalonOrders76(){
  if(typeof window.renderSuppliersV57==='function')window.renderSuppliersV57();
}
function refreshProviderOrders76(){
  if(typeof window.renderProviderOrders57==='function')window.renderProviderOrders57();
}

// ------------------------------------------------------------
// PAGO - POPUP CON FORMA, FECHA Y NÚMERO DE ORDEN DE PAGO
// ------------------------------------------------------------
window.salonMarkPaid57=function(orderId){
  const o=getOrder76(orderId);
  if(!o)return toast('Pedido no encontrado');
  if(orderStatus76(o)!=='Aceptado')return toast('El proveedor debe aceptar el pedido primero');
  if(paymentStatus76(o)==='Pagado')return toast('El pedido ya figura pagado');

  const op=ensurePaymentOrderNumber76(o);

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Confirmar pago</h2>
        <p>${esc76(orderCode76(o))} · ${esc76(o.supplierName||'Proveedor')}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="payment76">
      <div class="form-grid">
        <div class="field">
          <label>Forma de pago</label>
          <select name="paymentMethod" required>
            <option value="">Seleccionar</option>
            <option>Transferencia bancaria</option>
            <option>Mercado Pago</option>
            <option>Efectivo</option>
            <option>Tarjeta de débito</option>
            <option>Tarjeta de crédito</option>
            <option>Cheque</option>
            <option>Otro</option>
          </select>
        </div>

        <div class="field">
          <label>Fecha de pago</label>
          <input name="paymentDate" type="date" value="${today76()}" required>
        </div>

        <div class="field">
          <label>Número de orden de pago</label>
          <input name="paymentOrderNumber" value="${esc76(op)}" readonly>
        </div>

        <div class="field">
          <label>Importe</label>
          <input value="${esc76(money76(o.total||0))}" readonly>
        </div>

        <div class="field span2">
          <label>Referencia / comprobante</label>
          <input name="paymentReference" placeholder="Ej.: N° transferencia, operación, recibo, etc.">
        </div>

        <div class="field span2">
          <label>Observaciones del pago</label>
          <textarea name="paymentNotes" placeholder="Opcional"></textarea>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Confirmar pago</button>
      </div>
    </form>
  `);

  document.querySelector('#payment76').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);

    o.paymentStatus='Pagado';
    o.paymentDate=String(fd.get('paymentDate')||today76());
    o.paymentMethod=String(fd.get('paymentMethod')||'');
    o.paymentOrderNumber=String(fd.get('paymentOrderNumber')||op);
    o.paymentReference=String(fd.get('paymentReference')||'').trim();
    o.paymentNotes=String(fd.get('paymentNotes')||'').trim();
    o.paymentConfirmedAt=new Date().toISOString();

    // Compatibilidad con lógica financiera anterior
    if(typeof addExpenseOnce75==='function'){
      try{addExpenseOnce75(o)}catch(_){}
    }else{
      data.movements=data.movements||[];
      const key=`v76:community-order:${o.id}`;
      if(!data.movements.some(m=>String(m.sourceKey)===key)){
        data.movements.push({
          id:id(),
          salonId:o.salonId,
          eventId:o.eventId||'',
          type:'Gasto',
          category:o.targetType==='event'?'Compra para fiesta':'Compra de stock',
          concept:`Pago ${o.paymentOrderNumber} · ${o.supplierName}`,
          amount:N76(o.total),
          movementDate:o.paymentDate,
          createdAt:new Date().toISOString(),
          sourceKey:key
        });
      }
      o.financeExpenseCreated=true;
    }

    addMessage76(
      o.id,
      'salon',
      salonName76(o),
      `Pago confirmado. Forma: ${o.paymentMethod}. Fecha: ${o.paymentDate}. Orden de pago: ${o.paymentOrderNumber}${o.paymentReference?'. Ref.: '+o.paymentReference:''}.`
    );

    save();
    closeModal();
    refreshSalonOrders76();
    toast(`Pago registrado · ${o.paymentOrderNumber}`);
  };
};

// ------------------------------------------------------------
// ENTREGA - POPUP CON FECHA DE ENTREGA
// ------------------------------------------------------------
window.salonMarkDelivered57=function(orderId){
  const o=getOrder76(orderId);
  if(!o)return toast('Pedido no encontrado');
  if(orderStatus76(o)!=='Aceptado')return toast('El proveedor debe aceptar el pedido primero');
  if(deliveryStatus76(o)==='Entregado')return toast('El pedido ya figura entregado');

  showModal(`
    <div class="modal-title">
      <div>
        <h2>Confirmar entrega</h2>
        <p>${esc76(orderCode76(o))} · ${esc76(o.supplierName||'Proveedor')}</p>
      </div>
      <button class="ghost small" onclick="closeModal()">✕</button>
    </div>

    <form id="delivery76">
      <div class="form-grid">
        <div class="field">
          <label>Fecha de entrega</label>
          <input name="deliveryDate" type="date" value="${today76()}" required>
        </div>

        <div class="field">
          <label>Recibido por</label>
          <input name="receivedBy" placeholder="Nombre de quien recibió">
        </div>

        <div class="field span2">
          <label>Observaciones de la entrega</label>
          <textarea name="deliveryNotes" placeholder="Ej.: Entrega completa, sin faltantes."></textarea>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Confirmar entrega</button>
      </div>
    </form>
  `);

  document.querySelector('#delivery76').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);

    o.deliveryStatus='Entregado';
    o.deliveryDate=String(fd.get('deliveryDate')||today76());
    o.deliveredAt=new Date().toISOString();
    o.receivedBy=String(fd.get('receivedBy')||'').trim();
    o.deliveryNotes=String(fd.get('deliveryNotes')||'').trim();

    // Suma stock multi-item una sola vez
    if(o.targetType==='stock' && o.stockAdded!==true){
      data.stockProducts=data.stockProducts||[];
      items76(o).forEach(it=>{
        let stock=data.stockProducts.find(p=>
          String(p.salonId)===String(o.salonId) &&
          (
            (it.productId && String(p.id)===String(it.productId)) ||
            norm76(p.name)===norm76(it.productName)
          )
        );

        if(!stock){
          stock={
            id:id(),
            salonId:o.salonId,
            name:it.productName,
            category:it.productCategory||'Compras',
            description:it.productDescription||'',
            photo:it.productPhoto||'',
            stock:0,
            minStock:0,
            costPrice:it.unitCost,
            active:true,
            createdAt:new Date().toISOString()
          };
          data.stockProducts.push(stock);
        }

        stock.stock=N76(stock.stock)+N76(it.qty);
        stock.costPrice=N76(it.unitCost);
      });
      o.stockAdded=true;
      o.stockAddedAt=new Date().toISOString();
    }

    addMessage76(
      o.id,
      'salon',
      salonName76(o),
      `Entrega confirmada. Fecha: ${o.deliveryDate}${o.receivedBy?'. Recibido por: '+o.receivedBy:''}.`
    );

    save();
    closeModal();
    refreshSalonOrders76();
    toast('Entrega registrada');
  };
};

// ------------------------------------------------------------
// PDF DETALLADO
// ------------------------------------------------------------
function pdfSafe76(v){
  return String(v??'')
    .replace(/€/g,'EUR')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g,' ');
}
function pdfEsc76(v){
  return pdfSafe76(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function wrap76(text,max=86){
  const words=pdfSafe76(text).split(/\s+/).filter(Boolean);
  const out=[];
  let line='';
  words.forEach(w=>{
    const test=line?line+' '+w:w;
    if(test.length>max && line){out.push(line); line=w}
    else line=test;
  });
  if(line)out.push(line);
  return out.length?out:[''];
}
function buildPdf76(lines){
  const perPage=42;
  const pages=[];
  for(let i=0;i<lines.length;i+=perPage)pages.push(lines.slice(i,i+perPage));

  const objs={};
  const pageIds=[];
  let nextId=3;

  const font1=nextId++, font2=nextId++;
  objs[font1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[font2]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  pages.forEach((pageLines,pageIndex)=>{
    const pageId=nextId++;
    const contentId=nextId++;
    pageIds.push(pageId);

    const content=['BT','50 800 Td'];
    pageLines.forEach((ln,i)=>{
      if(i>0)content.push('0 -17 Td');
      content.push(`/${ln.bold?'F2':'F1'} ${ln.bold?12:10} Tf`);
      content.push(`(${pdfEsc76(ln.text)}) Tj`);
    });
    content.push('ET');

    const stream=content.join('\n');
    objs[contentId]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objs[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentId} 0 R >>`;
  });

  objs[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objs[2]=`<< /Type /Pages /Kids [${pageIds.map(x=>x+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;

  const maxId=Math.max(...Object.keys(objs).map(Number));
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(let i=1;i<=maxId;i++){
    offsets[i]=pdf.length;
    pdf+=`${i} 0 obj\n${objs[i]||'<<>>'}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=maxId;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

window.downloadOrderRemito75=function(orderId){
  const o=getOrder76(orderId);
  if(!o)return toast('Pedido no encontrado');

  if(paymentStatus76(o)!=='Pagado'||deliveryStatus76(o)!=='Entregado'){
    return toast('El remito final se habilita cuando el pedido está pagado y entregado');
  }

  const salon=(data.salons||[]).find(s=>String(s.id)===String(o.salonId))||{};
  const provider=(data.marketSuppliers||[]).find(p=>String(p.id)===String(o.supplierId))||{};
  const its=items76(o);
  const messages=(data.orderMessages||[])
    .filter(m=>String(m.orderId)===String(o.id))
    .sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));

  const lines=[];
  const push=(text,bold=false)=>wrap76(text).forEach((t,i)=>lines.push({text:t,bold:bold&&i===0}));

  push('FIESTACONTROL - REMITO FINAL',true);
  push('Documento de cierre de pedido',true);
  push(' ');
  push(`Pedido: ${orderCode76(o)}`,true);
  push(`Fecha del pedido: ${o.date||''}`);
  push(`Estado del pedido: ${orderStatus76(o)}`);
  push(' ');
  push('DATOS DEL SALON',true);
  push(`Salon: ${salonName76(o)}`);
  if(salon.address)push(`Direccion: ${salon.address}`);
  if(salon.phone)push(`Telefono: ${salon.phone}`);
  if(salon.email)push(`Email: ${salon.email}`);
  push(' ');
  push('DATOS DEL PROVEEDOR',true);
  push(`Proveedor: ${o.supplierName||provider.fantasyName||provider.businessName||provider.name||''}`);
  if(provider.address)push(`Direccion: ${provider.address}`);
  if(provider.phone)push(`Telefono: ${provider.phone}`);
  if(provider.email)push(`Email: ${provider.email}`);
  push(' ');
  push('DESTINO DEL PEDIDO',true);
  push(o.targetType==='event'
    ? `Fiesta: ${o.eventName||''} · ID evento: ${o.eventId||''}`
    : 'Destino: Stock del salon');
  push(' ');
  push('DETALLE DE ITEMS',true);

  its.forEach((x,i)=>{
    push(`${i+1}. ${x.productName}`,true);
    if(x.productCategory)push(`   Categoria: ${x.productCategory}`);
    if(x.productDescription)push(`   Descripcion: ${x.productDescription}`);
    push(`   Cantidad: ${x.qty}`);
    push(`   Precio unitario: ${money76(x.unitCost)}`);
    push(`   Subtotal: ${money76(x.total)}`);
  });

  push(' ');
  push(`TOTAL DEL PEDIDO: ${money76(o.total||0)}`,true);
  push(' ');
  push('DATOS DEL PAGO',true);
  push(`Estado: ${paymentStatus76(o)}`);
  push(`Fecha de pago: ${o.paymentDate||''}`);
  push(`Forma de pago: ${o.paymentMethod||'No informada'}`);
  push(`Orden de pago: ${o.paymentOrderNumber||'No informada'}`);
  if(o.paymentReference)push(`Referencia / comprobante: ${o.paymentReference}`);
  if(o.paymentNotes)push(`Observaciones del pago: ${o.paymentNotes}`);
  push(' ');
  push('DATOS DE LA ENTREGA',true);
  push(`Estado: ${deliveryStatus76(o)}`);
  push(`Fecha de entrega: ${o.deliveryDate||''}`);
  if(o.receivedBy)push(`Recibido por: ${o.receivedBy}`);
  if(o.deliveryNotes)push(`Observaciones de la entrega: ${o.deliveryNotes}`);
  push(' ');
  push('TRAZABILIDAD DEL PEDIDO',true);
  push(`Creado: ${o.createdAt?new Date(o.createdAt).toLocaleString('es-AR'):''}`);
  if(o.paymentConfirmedAt)push(`Pago confirmado en sistema: ${new Date(o.paymentConfirmedAt).toLocaleString('es-AR')}`);
  if(o.deliveredAt)push(`Entrega confirmada en sistema: ${new Date(o.deliveredAt).toLocaleString('es-AR')}`);
  if(o.providerPaymentConfirmedAt)push(`Proveedor confirmo recepcion del pago: ${new Date(o.providerPaymentConfirmedAt).toLocaleString('es-AR')}`);

  if(messages.length){
    push(' ');
    push('HISTORIAL DE COMUNICACION',true);
    messages.forEach(m=>{
      const dt=m.createdAt?new Date(m.createdAt).toLocaleString('es-AR'):'';
      push(`${dt} - ${m.fromName||m.fromType||''}: ${m.text||''}`);
    });
  }

  push(' ');
  push('Este remito fue generado automaticamente por FiestaControl.');
  push('Documento de referencia interna entre salon y proveedor.');

  const pdf=buildPdf76(lines);
  const bytes=new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;

  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`Remito_Final_${orderCode76(o)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
};

window.downloadOrderRemito76=window.downloadOrderRemito75;

})();

// ============================================================
// V78 - MENSAJES ADMIN: MISMA FUENTE DE LA ALERTA + VISUALIZACIÓN REAL
// ============================================================
(function(){
'use strict';

const norm78=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const esc78=v=>{
  try{return esc(v)}catch(_){
    return String(v??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
};

function sess78(){try{return session||{}}catch(_){return window.session||{}}}

function audience78(){
  const s=sess78();
  const r=norm78(s.role||s.userRole||s.type||s.userType||'');
  if(r.includes('provider')||r.includes('proveedor')||r.includes('supplier'))return 'provider';
  if(r.includes('salon'))return 'salon';

  const side=norm78(document.querySelector('.sidebar')?.innerText||'');
  if(side.includes('portal proveedor'))return 'provider';
  if(side.includes('panel del salon')||side.includes('salon activo'))return 'salon';

  const body=norm78(document.body?.innerText||'');
  if(body.includes('portal proveedor'))return 'provider';
  if(body.includes('panel del salon')||body.includes('salon activo'))return 'salon';
  return '';
}

function userKey78(){
  const s=sess78();
  return String(
    s.salonId||
    s.providerId||
    s.supplierId||
    s.marketSupplierId||
    s.userId||
    s.id||
    s.email||
    s.userEmail||
    'anon'
  );
}

function ensure78(){
  data.adminCommunityMessages=data.adminCommunityMessages||[];
  data.communityMessageReads=data.communityMessageReads||[];
}

function allowed78(m){
  const aud=norm78(m.audience||m.target||'all');
  const a=audience78();

  if(!a)return false;
  if(!aud||aud==='all'||aud==='todos'||aud==='ambos')return true;
  if(a==='salon' && (aud==='salon'||aud==='salons'||aud==='salones'))return true;
  if(a==='provider' && (aud==='provider'||aud==='providers'||aud==='supplier'||aud==='proveedores'))return true;
  return false;
}

function messages78(){
  ensure78();
  return data.adminCommunityMessages
    .filter(m=>m&&m.active!==false&&allowed78(m))
    .sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
}

function read78(idv){
  ensure78();
  const u=userKey78();
  return data.communityMessageReads.some(r=>
    String(r.messageId)===String(idv)&&String(r.userKey)===u
  );
}

function mark78(idv){
  ensure78();
  if(read78(idv))return;
  data.communityMessageReads.push({
    id:id(),
    messageId:idv,
    userKey:userKey78(),
    readAt:new Date().toISOString()
  });
  save();
}

function fmt78(v){
  if(!v)return '';
  try{return new Date(v).toLocaleString('es-AR')}catch(_){return String(v)}
}

function count78(){
  return messages78().filter(m=>!read78(m.id)).length;
}

function renderAdminCard78(){
  const content=document.querySelector('#content');
  if(!content || !audience78())return;

  // Reemplaza la tarjeta vieja V60 si existe.
  document.querySelector('#admin-community-card60')?.remove();
  document.querySelector('#fc-v77-admin-messages')?.remove();
  document.querySelector('#admin-community-card78')?.remove();

  const msgs=messages78();
  const card=document.createElement('div');
  card.id='admin-community-card78';
  card.className='card';
  card.style.marginTop='14px';

  card.innerHTML=`
    <div class="section-title">
      <div>
        <h3>📢 Mensajes del administrador</h3>
        <small class="muted">Comunicaciones oficiales para salones y proveedores.</small>
      </div>
    </div>

    ${msgs.length?`
      <div style="display:grid;gap:10px;margin-top:10px">
        ${msgs.map(m=>`
          <article style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;${read78(m.id)?'':'background:#faf9ff'}">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
              <div style="min-width:0">
                <b>${m.priority==='important'?'⚠️ ':''}${esc78(m.title||'Mensaje del administrador')}</b>
                ${!read78(m.id)?'<span style="margin-left:8px;font-size:11px;font-weight:800">NUEVO</span>':''}
              </div>
              <small class="muted">${esc78(fmt78(m.createdAt||m.date||''))}</small>
            </div>

            <div style="margin-top:8px;white-space:pre-wrap;line-height:1.5">
              ${esc78(m.text||m.message||m.body||m.content||'')}
            </div>

            <div style="margin-top:10px">
              <button type="button" class="secondary small" data-admin-read78="${esc78(m.id)}">
                ${read78(m.id)?'✓ Leído':'Marcar como leído'}
              </button>
            </div>
          </article>
        `).join('')}
      </div>
    `:'<div class="empty" style="margin-top:12px">No hay mensajes del administrador.</div>'}
  `;

  content.appendChild(card);

  card.querySelectorAll('[data-admin-read78]').forEach(btn=>{
    btn.onclick=()=>{
      mark78(btn.dataset.adminRead78);
      renderAdminCard78();
      updateBadge78();
    };
  });
}

function updateBadge78(){
  const n=count78();
  const items=[...document.querySelectorAll('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item')];
  const item=items.find(el=>norm78(el.textContent).includes('comunidad'));
  if(!item)return;

  // Elimina badges anteriores que puedan estar duplicando.
  item.querySelectorAll('.fc-v77-community-badge,.fc-v78-community-badge').forEach(x=>x.remove());

  if(n>0){
    const b=document.createElement('span');
    b.className='fc-v78-community-badge';
    b.style.cssText='margin-left:8px;min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:#ef4444;color:white';
    b.textContent=String(n);
    item.appendChild(b);
    item.title=`${n} mensaje${n===1?'':'s'} sin leer`;
  }
}

function popup78(){
  const m=messages78().find(x=>!read78(x.id));
  if(!m)return;

  const key=`fc_v78_popup_${userKey78()}_${m.id}`;
  if(sessionStorage.getItem(key))return;
  sessionStorage.setItem(key,'1');

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${m.priority==='important'?'⚠️':'📢'} ${esc78(m.title||'Mensaje del administrador')}</h2>
        <p>Mensaje de la comunidad</p>
      </div>
      <button class="ghost small" id="close78">✕</button>
    </div>

    <div class="card" style="padding:16px">
      <div style="font-size:16px;line-height:1.55;white-space:pre-wrap">
        ${esc78(m.text||m.message||m.body||m.content||'')}
      </div>
      <small class="muted" style="display:block;margin-top:12px">${esc78(fmt78(m.createdAt||m.date||''))}</small>
    </div>

    <div class="form-actions">
      <button type="button" class="ghost" id="later78">Ver después</button>
      <button type="button" class="primary" id="read78">Marcar leído</button>
    </div>
  `);

  document.querySelector('#close78').onclick=()=>closeModal();
  document.querySelector('#later78').onclick=()=>closeModal();
  document.querySelector('#read78').onclick=()=>{
    mark78(m.id);
    closeModal();
    updateBadge78();
  };
}

async function refreshAdminMessages78(){
  if(!audience78())return;
  try{
    const res=await fetch('/api/data',{cache:'no-store'});
    if(!res.ok)return;
    const remote=await res.json();
    const src=(remote&&remote.data)?remote.data:remote;

    if(Array.isArray(src?.adminCommunityMessages)){
      const map=new Map((data.adminCommunityMessages||[]).map(x=>[String(x.id),x]));
      src.adminCommunityMessages.forEach(x=>map.set(String(x.id),x));
      data.adminCommunityMessages=[...map.values()];
    }

    if(Array.isArray(src?.communityMessageReads)){
      const key=r=>`${r.messageId}|${r.userKey}`;
      const map=new Map((data.communityMessageReads||[]).map(x=>[key(x),x]));
      src.communityMessageReads.forEach(x=>map.set(key(x),x));
      data.communityMessageReads=[...map.values()];
    }

    updateBadge78();

    // Si ya está en Comunidad, refresca visualmente la lista real.
    if(document.querySelector('#admin-community-card78') || document.querySelector('#admin-community-card60')){
      renderAdminCard78();
    }
  }catch(_){}
}

document.addEventListener('click',ev=>{
  if(!audience78())return;
  const item=ev.target.closest('button,a,li,[role="button"],.nav-item,.menu-item,.sidebar-item');
  if(!item)return;

  if(norm78(item.textContent).includes('comunidad')){
    setTimeout(renderAdminCard78,180);
    setTimeout(renderAdminCard78,600);
  }
},true);

function init78(){
  ensure78();
  updateBadge78();
  setTimeout(popup78,700);

  // Si el usuario ya está en Comunidad al cargar, corrige la tarjeta.
  setTimeout(()=>{
    if(document.querySelector('#admin-community-card60'))renderAdminCard78();
  },800);

  refreshAdminMessages78();
}

// V84: init78 desactivado para evitar badges/tarjetas antiguas
// V84: desactivado; la sincronización de Comunidad queda exclusivamente a cargo de admin_messages_fix_v84.js

window.renderAdminCommunityMessages78=renderAdminCard78;
window.updateCommunityBadge78=updateBadge78;

})();

// ============================================================
// V82 - ESTADO DE LA FIESTA: MOVIMIENTOS DE ADICIONALES
// ============================================================
(function(){
'use strict';

const n82=v=>Number(v||0);
const esc82=v=>String(v??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const money82=v=>{
  try{return money(v)}catch(_){return '$ '+n82(v).toLocaleString('es-AR')}
};
function sid82(){
  try{return session?.salonId}catch(_){return window.session?.salonId}
}
function event82(eid){
  return (data.events||[]).find(e=>String(e.id)===String(eid));
}
function salon82(){
  return (data.salons||[]).find(s=>String(s.id)===String(sid82()))||{};
}
function visiblePays82(e){
  if(typeof window.visiblePayments48==='function'){
    try{return window.visiblePayments48(e)}catch(_){}
  }
  return (data.movements||[]).filter(m=>
    String(m.eventId)===String(e.id) &&
    String(m.salonId)===String(sid82()) &&
    String(m.type||'').toLowerCase()==='ingreso'
  );
}
function additionalMovements82(e){
  return (data.movements||[])
    .filter(m=>String(m.eventId)===String(e.id)&&String(m.salonId)===String(sid82()))
    .filter(m=>{
      const cat=String(m.category||'').toLowerCase();
      const con=String(m.concept||'').toLowerCase();
      const key=String(m.sourceKey||'').toLowerCase();
      return cat.includes('adicional') || con.includes('adicional') || key.includes('extra:');
    })
    .sort((a,b)=>String(a.movementDate||a.createdAt||'').localeCompare(String(b.movementDate||b.createdAt||'')));
}
function printWindow82(title,html,autoPrint=true){
  const w=window.open('','_blank','width=980,height=900');
  if(!w){alert('El navegador bloqueó la ventana de impresión.');return}
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc82(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;margin:0;background:#fff}
    .page{padding:28px;max-width:920px;margin:auto}
    .actions{padding:12px 28px;background:#f3f4f6;display:flex;gap:8px}
    button{padding:9px 14px;border:1px solid #bbb;border-radius:8px;background:#fff;cursor:pointer}
    .head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:14px}
    .head h1{margin:0;font-size:24px}.right{text-align:right}.muted{font-size:12px;color:#666}
    h2{font-size:17px;margin:20px 0 8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px}
    .row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #ddd}
    .total{font-weight:bold;font-size:18px;border-top:2px solid #111;margin-top:8px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:13px;vertical-align:top}
    .sign{margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:60px}
    .line{border-top:1px solid #111;text-align:center;padding-top:6px;font-size:12px}
    @media print{.actions{display:none}.page{padding:0}@page{size:A4;margin:14mm}}
  </style></head><body>
  <div class="actions"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button><button onclick="window.close()">Cerrar</button></div>
  <div class="page">${html}</div></body></html>`);
  w.document.close();
  if(autoPrint)setTimeout(()=>{try{w.focus();w.print()}catch(_){}},500);
}

window.printReservationStatus82=function(eid,autoPrint=true){
  const e=event82(eid);
  if(!e)return toast('No se encontró la reserva');

  const s=salon82();
  const pays=visiblePays82(e);
  const addMoves=additionalMovements82(e);
  const total=n82(e.total);
  const paid=n82(e.paid);
  const balance=Math.max(0,total-paid);
  const extras=Array.isArray(e.extras)?e.extras:[];

  const additionalTotal=addMoves.reduce((sum,m)=>sum+n82(m.amount),0);

  const html=`
    <div class="head">
      <div>
        <h1>${esc82(s.name||'FiestaControl')}</h1>
        <div class="muted">${esc82(s.address||'')}</div>
        <div class="muted">${esc82(s.phone||'')}${s.email?' · '+esc82(s.email):''}</div>
      </div>
      <div class="right">
        <b>ESTADO DE LA FIESTA</b>
        <div class="muted">Emitido ${new Date().toLocaleString('es-AR')}</div>
      </div>
    </div>

    <h2>Datos del evento</h2>
    <div class="grid">
      <div><b>Tipo:</b> ${esc82(e.eventTypeName||'Evento')}</div>
      <div><b>Fecha:</b> ${esc82(e.date||'')}</div>
      <div><b>Nombre:</b> ${esc82(e.eventName||e.child||'')}</div>
      <div><b>Responsable:</b> ${esc82(e.client||'')}</div>
      <div><b>Horario:</b> ${esc82(e.start||'')} a ${esc82(e.end||'')}</div>
      <div><b>Estado:</b> ${esc82(e.status||'')}</div>
      <div><b>Adultos:</b> ${n82(e.adults)}</div>
      <div><b>Niños:</b> ${n82(e.children)}</div>
    </div>

    <h2>Adicionales incluidos en la fiesta</h2>
    ${extras.length?`
      <table>
        <thead><tr><th>Adicional</th><th>Detalle</th><th>Importe</th></tr></thead>
        <tbody>${extras.map(x=>`
          <tr>
            <td>${esc82(x.name||'Adicional')}</td>
            <td>${esc82(x.description||x.detail||'')}</td>
            <td>${money82(x.price||x.amount||0)}</td>
          </tr>`).join('')}</tbody>
      </table>
    `:'<div class="muted">Sin adicionales generales seleccionados.</div>'}

    <div class="row"><span>Adultos adicionales (${n82(e.extraAdultQty)})</span><b>${money82(e.extraAdultTotal)}</b></div>
    <div class="row"><span>Niños adicionales (${n82(e.extraChildQty)})</span><b>${money82(e.extraChildTotal)}</b></div>
    <div class="row"><span>Mozo adicional (${n82(e.extraWaiters)})</span><b>${money82(e.extraWaiterTotal)}</b></div>
    <div class="row"><span>Cocina adicional (${n82(e.extraKitchen)})</span><b>${money82(e.extraKitchenTotal)}</b></div>
    <div class="row"><span>Animador adicional (${n82(e.extraAnimators)})</span><b>${money82(e.extraAnimatorTotal)}</b></div>
    <div class="row"><span>Horas extra (${n82(e.extraHours)})</span><b>${money82(e.extraHourTotal)}</b></div>

    <h2>Movimientos de adicionales</h2>
    ${addMoves.length?`
      <table>
        <thead>
          <tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Medio</th><th>Importe</th></tr>
        </thead>
        <tbody>
          ${addMoves.map(m=>`
            <tr>
              <td>${esc82(m.movementDate||'')}</td>
              <td>${esc82(m.type||'')}</td>
              <td>${esc82(m.category||'')}</td>
              <td>${esc82(m.concept||'')}</td>
              <td>${esc82(m.method||'')}</td>
              <td>${money82(m.amount||0)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="text-align:right;margin-top:8px"><b>Total movimientos de adicionales: ${money82(additionalTotal)}</b></div>
    `:'<div class="muted">No hay movimientos de adicionales registrados para esta fiesta.</div>'}

    <h2>Estado económico</h2>
    <div class="row"><span>Total de la fiesta</span><b>${money82(total)}</b></div>
    <div class="row"><span>Total pagado</span><b>${money82(paid)}</b></div>
    <div class="row total"><span>Saldo pendiente</span><b>${money82(balance)}</b></div>

    <h2>Pagos registrados</h2>
    ${pays.length?`
      <table>
        <thead><tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th>Importe</th></tr></thead>
        <tbody>${pays.map(m=>`
          <tr>
            <td>${esc82(m.movementDate||'')}</td>
            <td>${esc82(m.concept||'Pago')}</td>
            <td>${esc82(m.method||'')}</td>
            <td>${money82(m.amount||0)}</td>
          </tr>`).join('')}</tbody>
      </table>
    `:'<div class="muted">No hay pagos registrados.</div>'}

    <div style="text-align:right;margin-top:10px"><b>Total pagos: ${money82(paid)}</b></div>

    <div class="sign">
      <div class="line">Firma del salón</div>
      <div class="line">Firma del cliente</div>
    </div>
  `;

  printWindow82(`Estado fiesta - ${e.eventName||e.child||'Evento'}`,html,autoPrint);
};

window.printReservationStatus49=window.printReservationStatus82;
window.printReservationStatus48=window.printReservationStatus82;
window.printReservationStatus46=window.printReservationStatus82;
window.printReservationStatus=window.printReservationStatus82;

})();

// ============================================================
// V86 - FINANZAS SALÓN: TABLERO COMPACTO POR MEDIO DE PAGO
// ============================================================
(function(){
'use strict';

function sid86(){
  try{return session?.salonId}catch(_){return window.session?.salonId}
}

function normMethod86(v){
  const s=String(v||'').trim().toLowerCase();
  if(!s)return 'Sin especificar';
  if(s.includes('efect'))return 'Efectivo';
  if(s.includes('transfer'))return 'Transferencia';
  if(s.includes('mercado')||s==='mp')return 'Mercado Pago';
  if(s.includes('tarjet')||s.includes('debito')||s.includes('débito')||s.includes('credito')||s.includes('crédito'))return 'Tarjeta';
  if(s.includes('otro'))return 'Otro';
  return String(v||'Otro').trim();
}

function money86(v){
  try{return money(Number(v||0))}catch(_){
    return '$ '+Number(v||0).toLocaleString('es-AR');
  }
}

function incomeMovements86(){
  const sid=sid86();
  return (data.movements||[]).filter(m=>
    String(m.salonId)===String(sid) &&
    ['Ingreso','Cobro'].includes(String(m.type||'')) &&
    Number(m.amount||0)>0
  );
}

function totals86(){
  const out={
    'Efectivo':0,
    'Transferencia':0,
    'Mercado Pago':0,
    'Tarjeta':0,
    'Otro':0,
    'Sin especificar':0
  };

  incomeMovements86().forEach(m=>{
    const key=normMethod86(m.method||m.paymentMethod);
    if(!(key in out)) out.Otro+=Number(m.amount||0);
    else out[key]+=Number(m.amount||0);
  });
  return out;
}

function renderPaymentDashboard86(){
  const content=document.querySelector('#content');
  if(!content)return;

  // Saca el dashboard antiguo V11 para no duplicar ni mostrar importes incompletos.
  content.querySelector('#v11-finance-dashboard')?.remove();
  content.querySelector('#v86-payment-dashboard')?.remove();

  const t=totals86();
  const total=Object.values(t).reduce((s,v)=>s+Number(v||0),0);

  const board=document.createElement('div');
  board.id='v86-payment-dashboard';
  board.className='card';
  board.style.cssText='margin-bottom:14px;padding:14px 16px';

  const cards=[
    ['💵','Efectivo',t['Efectivo']],
    ['🏦','Transferencia',t['Transferencia']],
    ['📱','Mercado Pago',t['Mercado Pago']],
    ['💳','Tarjeta',t['Tarjeta']],
    ['➕','Otro',t['Otro']]
  ];

  if(t['Sin especificar']>0){
    cards.push(['❔','Sin especificar',t['Sin especificar']]);
  }

  board.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <div>
        <h3 style="margin:0;font-size:16px">📊 Ingresos por medio de pago</h3>
        <small class="muted">Suma automática de los ingresos registrados en Finanzas.</small>
      </div>
      <div style="text-align:right">
        <small class="muted">TOTAL INGRESADO</small>
        <strong style="display:block;font-size:20px">${money86(total)}</strong>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px">
      ${cards.map(([icon,label,amount])=>`
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;background:#fff">
          <small style="display:block;margin-bottom:4px">${icon} ${label}</small>
          <strong style="font-size:16px">${money86(amount)}</strong>
        </div>
      `).join('')}
    </div>
  `;

  content.prepend(board);
}

const prevRenderFinanceV86=renderFinance;
renderFinance=function(){
  const r=prevRenderFinanceV86();
  renderPaymentDashboard86();
  // Segunda pasada por si algún wrapper anterior termina de modificar Finanzas luego.
  setTimeout(renderPaymentDashboard86,0);
  return r;
};

window.renderPaymentDashboardV86=renderPaymentDashboard86;

})();

// ============================================================
// V87 - FIX TABLERO FINANZAS + PROMOCIONES DESTACADAS DE SALONES
// ============================================================
(function(){
'use strict';

const esc87=v=>String(v??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function salon87(){
  const sid=session?.salonId;
  return (data.salons||[]).find(s=>String(s.id)===String(sid));
}

// ------------------------------------------------------------
// 1) FIX REAL DEL TABLERO DE MEDIOS DE PAGO
// El render final de Finanzas pasa por wrappers posteriores,
// por eso V86 no siempre llegaba a ejecutarse.
// ------------------------------------------------------------
function renderPaymentDashboard87(){
  const content=document.querySelector('#content');
  if(!content || view!=='finance')return;

  content.querySelector('#v11-finance-dashboard')?.remove();
  content.querySelector('#v86-payment-dashboard')?.remove();
  content.querySelector('#v87-payment-dashboard')?.remove();

  const sid=session?.salonId;
  const movements=(data.movements||[]).filter(m=>
    String(m.salonId)===String(sid) &&
    ['Ingreso','Cobro'].includes(String(m.type||'')) &&
    Number(m.amount||0)>0
  );

  const totals={
    'Efectivo':0,
    'Transferencia':0,
    'Mercado Pago':0,
    'Tarjeta':0,
    'Otro':0,
    'Sin especificar':0
  };

  const methodName=v=>{
    const s=String(v||'').trim().toLowerCase();
    if(!s)return 'Sin especificar';
    if(s.includes('efect'))return 'Efectivo';
    if(s.includes('transfer'))return 'Transferencia';
    if(s.includes('mercado')||s==='mp')return 'Mercado Pago';
    if(s.includes('tarjet')||s.includes('debito')||s.includes('débito')||s.includes('credito')||s.includes('crédito'))return 'Tarjeta';
    if(s.includes('otro'))return 'Otro';
    return 'Otro';
  };

  movements.forEach(m=>{
    totals[methodName(m.method||m.paymentMethod)]+=Number(m.amount||0);
  });

  const total=Object.values(totals).reduce((a,b)=>a+b,0);
  const fmt=v=>{
    try{return money(v)}catch(_){return '$ '+Number(v||0).toLocaleString('es-AR')}
  };

  const rows=[
    ['💵','Efectivo',totals['Efectivo']],
    ['🏦','Transferencia',totals['Transferencia']],
    ['📱','Mercado Pago',totals['Mercado Pago']],
    ['💳','Tarjeta',totals['Tarjeta']],
    ['➕','Otro',totals['Otro']]
  ];
  if(totals['Sin especificar']>0) rows.push(['❔','Sin especificar',totals['Sin especificar']]);

  const board=document.createElement('div');
  board.id='v87-payment-dashboard';
  board.className='card';
  board.style.cssText='margin-bottom:16px;padding:14px 16px';
  board.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <div>
        <h3 style="margin:0">📊 Ingresos por medio de pago</h3>
        <small class="muted">Suma automática según el medio elegido en Finanzas.</small>
      </div>
      <div style="text-align:right">
        <small class="muted">TOTAL INGRESADO</small>
        <strong style="display:block;font-size:21px">${fmt(total)}</strong>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
      ${rows.map(([icon,label,value])=>`
        <div style="border:1px solid #e5e7eb;border-radius:11px;padding:10px 12px;background:#fff">
          <small style="display:block;margin-bottom:5px">${icon} ${label}</small>
          <strong style="font-size:17px">${fmt(value)}</strong>
        </div>
      `).join('')}
    </div>`;
  content.prepend(board);
}

const prevSalonView87=renderSalonView;
renderSalonView=function(){
  const result=prevSalonView87();
  if(view==='finance'){
    setTimeout(renderPaymentDashboard87,0);
    setTimeout(renderPaymentDashboard87,100);
  }
  if(view==='profile'){
    setTimeout(renderPromoPanel87,0);
    setTimeout(renderPromoPanel87,100);
  }
  return result;
};
window.renderPaymentDashboard87=renderPaymentDashboard87;

// ------------------------------------------------------------
// 2) PROMOCIÓN DESTACADA DEL SALÓN
// Se administra desde "Mi salón".
// ------------------------------------------------------------
function promoIsActive87(s){
  if(!s || s.status!=='Aprobado' || s.publicProfileEnabled===false || s.publicPromoActive!==true)return false;
  if(s.publicPromoValidUntil){
    const today=new Date();
    today.setHours(0,0,0,0);
    const until=new Date(String(s.publicPromoValidUntil)+'T23:59:59');
    if(until<today)return false;
  }
  return true;
}

function renderPromoPanel87(){
  if(view!=='profile')return;
  const content=document.querySelector('#content');
  const s=salon87();
  if(!content||!s)return;

  content.querySelector('#v87-promo-panel')?.remove();

  const box=document.createElement('div');
  box.id='v87-promo-panel';
  box.className='card';
  box.style.cssText='margin-top:16px;padding:16px';
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0 0 4px">⭐ Promoción destacada</h3>
        <small class="muted">Publicala para que aparezca destacada cuando un cliente entra en “Ver salones”.</small>
      </div>
      <span style="font-size:12px;font-weight:800;padding:6px 10px;border-radius:999px;background:${promoIsActive87(s)?'#ecfdf5':'#f3f4f6'}">
        ${promoIsActive87(s)?'ACTIVA':'INACTIVA'}
      </span>
    </div>

    ${s.publicPromoImage?`
      <div style="margin-top:12px;border-radius:12px;overflow:hidden;max-width:420px">
        <img src="${s.publicPromoImage}" alt="Promoción" style="width:100%;max-height:190px;object-fit:cover;display:block">
      </div>`:''}

    ${s.publicPromoTitle?`
      <div style="margin-top:12px">
        <b style="font-size:18px">${esc87(s.publicPromoTitle)}</b>
        ${s.publicPromoPrice?`<strong style="display:block;margin-top:4px">${esc87(s.publicPromoPrice)}</strong>`:''}
        ${s.publicPromoText?`<p style="margin:6px 0 0">${esc87(s.publicPromoText)}</p>`:''}
        ${s.publicPromoValidUntil?`<small class="muted">Válida hasta ${esc87(s.publicPromoValidUntil)}</small>`:''}
      </div>`:''}

    <div style="margin-top:14px">
      <button class="primary" type="button" onclick="openSalonPromo87()">
        ${s.publicPromoTitle?'Editar promoción':'Crear promoción'}
      </button>
    </div>`;

  content.appendChild(box);
}

window.openSalonPromo87=function(){
  const s=salon87();
  if(!s)return;

  showModal(`
    <div class="modal-title">
      <div>
        <h2>⭐ Promoción destacada</h2>
        <p>Se mostrará públicamente en “Ver salones”.</p>
      </div>
      <button class="ghost small" type="button" onclick="closeModal()">✕</button>
    </div>

    <form id="v87-promo-form">
      <div class="form-grid">
        <div class="field span2">
          <label>Título de la promoción</label>
          <input name="title" required maxlength="80" value="${esc87(s.publicPromoTitle||'')}" placeholder="Ej: Fiesta completa de domingo">
        </div>

        <div class="field">
          <label>Precio / beneficio</label>
          <input name="price" maxlength="60" value="${esc87(s.publicPromoPrice||'')}" placeholder="Ej: $350.000 / 20% OFF">
        </div>

        <div class="field">
          <label>Válida hasta</label>
          <input name="validUntil" type="date" value="${esc87(s.publicPromoValidUntil||'')}">
        </div>

        <div class="field span2">
          <label>Detalle</label>
          <textarea name="text" maxlength="350" placeholder="Contá qué incluye la promoción">${esc87(s.publicPromoText||'')}</textarea>
        </div>

        <div class="field span2">
          <label>Imagen de la promoción</label>
          <input id="v87-promo-image" type="file" accept="image/*">
          ${s.publicPromoImage?`<img id="v87-promo-preview" src="${s.publicPromoImage}" style="display:block;margin-top:8px;width:100%;max-width:360px;max-height:180px;object-fit:cover;border-radius:10px">`:'<img id="v87-promo-preview" style="display:none;margin-top:8px;width:100%;max-width:360px;max-height:180px;object-fit:cover;border-radius:10px">'}
        </div>

        <div class="field span2">
          <label style="display:flex;gap:9px;align-items:center">
            <input name="active" type="checkbox" ${s.publicPromoActive===true?'checked':''}>
            <span><b>Mostrar como destacada</b><br><small>La verán los clientes en “Ver salones”.</small></span>
          </label>
        </div>
      </div>

      <div class="form-actions">
        ${s.publicPromoTitle?'<button type="button" class="danger" id="v87-delete-promo">Eliminar promoción</button>':''}
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar promoción</button>
      </div>
    </form>`);

  let newImage=s.publicPromoImage||'';
  const file=document.querySelector('#v87-promo-image');
  if(file){
    file.onchange=e=>{
      const f=e.target.files?.[0];
      if(!f)return;
      const reader=new FileReader();
      reader.onload=()=>{
        newImage=reader.result;
        const p=document.querySelector('#v87-promo-preview');
        if(p){p.src=newImage;p.style.display='block'}
      };
      reader.readAsDataURL(f);
    };
  }

  const del=document.querySelector('#v87-delete-promo');
  if(del){
    del.onclick=()=>{
      if(!confirm('¿Eliminar esta promoción destacada?'))return;
      s.publicPromoTitle='';
      s.publicPromoText='';
      s.publicPromoPrice='';
      s.publicPromoImage='';
      s.publicPromoValidUntil='';
      s.publicPromoActive=false;
      save();
      closeModal();
      renderSalonShell();
      toast('Promoción eliminada');
    };
  }

  document.querySelector('#v87-promo-form').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    s.publicPromoTitle=String(fd.get('title')||'').trim();
    s.publicPromoPrice=String(fd.get('price')||'').trim();
    s.publicPromoText=String(fd.get('text')||'').trim();
    s.publicPromoValidUntil=String(fd.get('validUntil')||'');
    s.publicPromoActive=e.target.elements.active.checked;
    s.publicPromoImage=newImage;
    s.publicPromoUpdatedAt=new Date().toISOString();
    save();
    closeModal();
    renderSalonShell();
    toast('Promoción guardada');
  };
};

// ------------------------------------------------------------
// 3) DESTACADOS EN LA PANTALLA PÚBLICA "VER SALONES"
// ------------------------------------------------------------
function injectFeaturedPromos87(){
  const results=document.querySelector('#v27-results');
  if(!results)return;

  document.querySelector('#v87-featured-promos')?.remove();

  const promos=(data.salons||[])
    .filter(promoIsActive87)
    .sort((a,b)=>String(b.publicPromoUpdatedAt||'').localeCompare(String(a.publicPromoUpdatedAt||'')));

  if(!promos.length)return;

  const sec=document.createElement('section');
  sec.id='v87-featured-promos';
  sec.style.cssText='margin:18px 0 22px';
  sec.innerHTML=`
    <div style="display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:10px">
      <div>
        <span style="font-size:11px;font-weight:900;letter-spacing:.08em">DESTACADOS</span>
        <h2 style="margin:3px 0 0">⭐ Promociones de salones</h2>
      </div>
      <small class="muted">Ofertas publicadas directamente por cada salón</small>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
      ${promos.map(s=>`
        <article class="card" style="padding:0;overflow:hidden;border:2px solid rgba(114,87,255,.18)">
          ${s.publicPromoImage
            ? `<img src="${s.publicPromoImage}" alt="${esc87(s.publicPromoTitle||s.name)}" style="width:100%;height:165px;object-fit:cover;display:block">`
            : `<div style="height:105px;display:flex;align-items:center;justify-content:center;font-size:42px;background:#f5f3ff">🎉</div>`}
          <div style="padding:14px">
            <span style="display:inline-block;font-size:10px;font-weight:900;padding:5px 8px;border-radius:999px;background:#f3e8ff">⭐ DESTACADO</span>
            <h3 style="margin:8px 0 2px">${esc87(s.publicPromoTitle||'Promoción especial')}</h3>
            <b style="display:block">${esc87(s.name||'Salón')}</b>
            ${s.zone?`<small class="muted">📍 ${esc87(s.zone)}</small>`:''}
            ${s.publicPromoPrice?`<div style="font-size:19px;font-weight:900;margin-top:8px">${esc87(s.publicPromoPrice)}</div>`:''}
            ${s.publicPromoText?`<p style="margin:7px 0 0">${esc87(s.publicPromoText)}</p>`:''}
            ${s.publicPromoValidUntil?`<small class="muted" style="display:block;margin-top:7px">Válida hasta ${esc87(s.publicPromoValidUntil)}</small>`:''}
            <button class="primary w100" style="margin-top:12px" onclick="renderPublicSalonPage('${esc87(s.id)}')">Ver salón →</button>
          </div>
        </article>
      `).join('')}
    </div>`;

  results.parentElement.insertBefore(sec,results);
}

if(typeof window.renderPublicSalonDirectory==='function'){
  const prevDirectory87=window.renderPublicSalonDirectory;
  window.renderPublicSalonDirectory=function(){
    const r=prevDirectory87();
    setTimeout(injectFeaturedPromos87,0);
    return r;
  };
}

const oldRenderAuth87=window.renderAuth;
if(typeof oldRenderAuth87==='function'){
  window.renderAuth=function(mode='home'){
    const r=oldRenderAuth87(mode);
    if(mode==='availability')setTimeout(injectFeaturedPromos87,0);
    return r;
  };
}

window.injectFeaturedPromos87=injectFeaturedPromos87;

})();

// ============================================================
// V88 - FINANZAS: INGRESOS VISIBLES + RESET CONTABLE TOTAL
// ============================================================
(function(){
'use strict';

const sid88=()=>session?.salonId;
const n88=v=>Number(v||0);
const esc88=v=>String(v??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const fmt88=v=>{
  try{return money(n88(v))}catch(_){return '$ '+n88(v).toLocaleString('es-AR')}
};
const mov88=()=> (data.movements||[]).filter(m=>String(m.salonId)===String(sid88()));

function isIncome88(m){
  const t=String(m?.type||'').toLowerCase();
  return t==='ingreso'||t==='cobro';
}
function isExpense88(m){
  const t=String(m?.type||'').toLowerCase();
  return t==='gasto'||t==='egreso';
}

function paymentMethod88(v){
  const s=String(v||'').trim().toLowerCase();
  if(!s)return 'Sin especificar';
  if(s.includes('efect'))return 'Efectivo';
  if(s.includes('transfer'))return 'Transferencia';
  if(s.includes('mercado')||s==='mp')return 'Mercado Pago';
  if(s.includes('tarjet')||s.includes('debito')||s.includes('débito')||s.includes('credito')||s.includes('crédito'))return 'Tarjeta';
  return 'Otro';
}

function figures88(){
  const all=mov88();
  const income=all.filter(isIncome88).reduce((s,m)=>s+n88(m.amount),0);
  const expense=all.filter(isExpense88).reduce((s,m)=>s+n88(m.amount),0);
  const methods={
    'Efectivo':0,
    'Transferencia':0,
    'Mercado Pago':0,
    'Tarjeta':0,
    'Otro':0,
    'Sin especificar':0
  };
  all.filter(isIncome88).forEach(m=>{
    methods[paymentMethod88(m.method||m.paymentMethod)]+=n88(m.amount);
  });
  return {all,income,expense,balance:income-expense,methods};
}

// ------------------------------------------------------------
// INGRESAR / EGRESAR DINERO
// Guarda en data.movements y vuelve a Finanzas para que se vea
// inmediatamente en tablero, totales y movimientos generales.
// ------------------------------------------------------------
window.openManualMoneyV88=function(type='Ingreso'){
  const isExpense=String(type).toLowerCase()==='gasto'||String(type).toLowerCase()==='egreso';

  showModal(`
    <div class="modal-title">
      <div>
        <h2>${isExpense?'Registrar egreso':'Ingresar dinero'}</h2>
        <p>${isExpense?'Salida manual de dinero del salón':'Entrada manual de dinero al salón'}</p>
      </div>
      <button class="ghost small" type="button" onclick="closeModal()">✕</button>
    </div>

    <form id="money88">
      <div class="form-grid">
        <div class="field">
          <label>Motivo</label>
          <select name="category">
            ${isExpense?`
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
          <input name="detail" placeholder="Detalle del movimiento">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="${isExpense?'danger':'primary'}">${isExpense?'Registrar egreso':'Registrar ingreso'}</button>
      </div>
    </form>
  `);

  document.querySelector('#money88').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const amount=n88(f.amount);
    if(amount<=0)return toast('Ingresá un importe válido');

    data.movements=data.movements||[];
    data.movements.push({
      id:id(),
      salonId:sid88(),
      type:isExpense?'Gasto':'Ingreso',
      category:String(f.category||'Movimiento manual'),
      concept:String(f.detail||'').trim()
        ? `${String(f.category||'Movimiento manual')} · ${String(f.detail).trim()}`
        : String(f.category||'Movimiento manual'),
      amount,
      method:String(f.method||''),
      movementDate:String(f.date||new Date().toISOString().slice(0,10)),
      manualMovement:true,
      sourceKey:`v88:manual:${id()}`,
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast(isExpense?'Egreso registrado':'Ingreso registrado');

    view='finance';
    // Espera el guardado y vuelve a dibujar desde la ruta final.
    setTimeout(()=>renderSalonShell(),80);
  };
};

// ------------------------------------------------------------
// TABLERO + MOVIMIENTOS GENERALES
// Corrige "Total ingresado": usa TODAS las entradas reales,
// incluyendo dinero ingresado manualmente.
// ------------------------------------------------------------
function paintFinance88(){
  if(view!=='finance')return;
  const content=document.querySelector('#content');
  if(!content)return;

  const f=figures88();

  // Quita tableros anteriores y deja uno solo.
  content.querySelector('#v11-finance-dashboard')?.remove();
  content.querySelector('#v86-payment-dashboard')?.remove();
  content.querySelector('#v87-payment-dashboard')?.remove();
  content.querySelector('#v88-payment-dashboard')?.remove();

  const board=document.createElement('div');
  board.id='v88-payment-dashboard';
  board.className='card';
  board.style.cssText='margin-bottom:16px;padding:14px 16px';

  const cards=[
    ['💵','Efectivo',f.methods['Efectivo']],
    ['🏦','Transferencia',f.methods['Transferencia']],
    ['📱','Mercado Pago',f.methods['Mercado Pago']],
    ['💳','Tarjeta',f.methods['Tarjeta']],
    ['➕','Otro',f.methods['Otro']]
  ];
  if(f.methods['Sin especificar']>0)cards.push(['❔','Sin especificar',f.methods['Sin especificar']]);

  board.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <div>
        <h3 style="margin:0">📊 Ingresos por medio de pago</h3>
        <small class="muted">Incluye cobros de fiestas e ingresos manuales registrados en Finanzas.</small>
      </div>
      <div style="text-align:right">
        <small class="muted">TOTAL DE INGRESOS</small>
        <strong style="display:block;font-size:21px">${fmt88(f.income)}</strong>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
      ${cards.map(([icon,label,value])=>`
        <div style="border:1px solid #e5e7eb;border-radius:11px;padding:10px 12px;background:#fff">
          <small style="display:block;margin-bottom:5px">${icon} ${label}</small>
          <strong style="font-size:17px">${fmt88(value)}</strong>
        </div>
      `).join('')}
    </div>
  `;

  content.prepend(board);

  // Corrige las tarjetas existentes del render histórico.
  content.querySelectorAll('.card.stat').forEach(card=>{
    const label=String(card.querySelector('small')?.textContent||'').trim().toLowerCase();
    const strong=card.querySelector('strong');
    if(!strong)return;
    if(label==='total ingresado')strong.textContent=fmt88(f.income);
    if(label==='total egresos')strong.textContent=fmt88(f.expense);
    if(label==='resultado de caja')strong.textContent=fmt88(f.balance);
  });

  // Asegura que exista y muestre la contabilidad general completa.
  let general=[...content.querySelectorAll('.card')].find(c=>
    String(c.querySelector('h3')?.textContent||'').toLowerCase().includes('movimientos generales')
  );

  if(!general){
    general=document.createElement('div');
    general.className='card';
    general.style.marginTop='16px';
    content.appendChild(general);
  }

  general.innerHTML=`
    <div class="section-title">
      <div>
        <h3>Movimientos generales</h3>
        <small class="muted">Todos los ingresos y egresos registrados en la contabilidad del salón.</small>
      </div>
    </div>
    ${f.all.length?`
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Importe</th><th>Medio</th></tr>
          </thead>
          <tbody>
            ${f.all.slice().reverse().map(m=>`
              <tr>
                <td>${esc88(m.movementDate||String(m.createdAt||'').slice(0,10))}</td>
                <td>${esc88(m.type||'')}</td>
                <td>${esc88(m.category||'')}</td>
                <td>${esc88(m.concept||'')}</td>
                <td><b>${fmt88(m.amount||0)}</b></td>
                <td>${esc88(m.method||m.paymentMethod||'')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `:'<div class="empty">Sin movimientos contables.</div>'}
  `;

  // Repara botones para que usen V88.
  const income=document.querySelector('#income36') ||
    [...document.querySelectorAll('button')].find(b=>String(b.textContent||'').includes('Ingresar dinero'));
  if(income)income.onclick=()=>openManualMoneyV88('Ingreso');

  const expense=document.querySelector('#expense36') ||
    [...document.querySelectorAll('button')].find(b=>String(b.textContent||'').includes('Registrar egreso'));
  if(expense)expense.onclick=()=>openManualMoneyV88('Gasto');
}

// ------------------------------------------------------------
// RESET CONTABLE TOTAL
// NO borra salones, proveedores ni compras.
// Sí elimina TODA huella monetaria del salón y deja compras/pedidos
// existentes como NO PAGADOS.
// ------------------------------------------------------------
function resetMoneyData88(){
  const sid=sid88();

  data.movements=(data.movements||[]).filter(x=>String(x.salonId)!==String(sid));
  data.providerPayments=(data.providerPayments||[]).filter(x=>String(x.salonId)!==String(sid));
  data.servicePayments=(data.servicePayments||[]).filter(x=>String(x.salonId)!==String(sid));

  // Reservas: conservan el contrato, pero cobranza vuelve a cero.
  (data.events||[]).forEach(e=>{
    if(String(e.salonId)!==String(sid))return;
    e.deposit=0;
    e.depositMethod='';
    e.depositDate='';
    e.paid=0;
    e.balance=n88(e.total);
  });

  // Compras a proveedores: se conservan, pero SIN pago/egreso contable.
  (data.stockPurchases||[]).forEach(p=>{
    if(String(p.salonId)!==String(sid))return;
    p.paymentStatus='Pendiente';
    p.paymentMethod='';
    p.paymentReference='';
    p.reference='';
    p.paymentDate='';
    p.paidAt=null;
    p.paidAmount=0;
    p.amountPaid=0;
    p.financeExpenseCreated=false;

    // No altera si fue entregado ni el stock ya recibido.
    // Solo deja la parte monetaria en cero.
  });

  // Pedidos históricos del salón también quedan sin pago.
  (data.orders||[]).forEach(o=>{
    if(String(o.salonId)!==String(sid))return;
    o.paymentStatus='Pendiente';
    o.paymentId=null;
    o.paymentMethod='';
    o.paymentReference='';
    o.paymentDate='';
    o.paidAt=null;
    o.paid=0;
    o.paidAmount=0;
    o.amountPaid=0;
    o.financeExpenseCreated=false;
  });

  // Proveedores propios: saldos contables a cero, sin borrar proveedor.
  (data.suppliers||[]).forEach(p=>{
    if(String(p.salonId)!==String(sid))return;
    p.balance=0;
    p.paid=0;
    p.totalPaid=0;
    p.totalPending=0;
  });

  // Baselines/resets contables anteriores no deben reconstruir montos.
  if(Array.isArray(data.financeResets)){
    data.financeResets=data.financeResets.filter(r=>String(r.salonId)!==String(sid));
  }
  if(Array.isArray(data.accountingEpochs)){
    data.accountingEpochs=data.accountingEpochs.filter(r=>String(r.salonId)!==String(sid));
  }
}

window.zeroMoney88=function(){
  const s=(data.salons||[]).find(x=>String(x.id)===String(sid88()));
  showModal(`
    <div class="modal-title">
      <div>
        <h2>💰 Poner movimientos en $0</h2>
        <p>Deja en cero toda la contabilidad general del salón.</p>
      </div>
      <button class="ghost small" type="button" onclick="closeModal()">✕</button>
    </div>

    <div class="admin-notice attention">
      <span>⚠️</span>
      <div>
        <b>Se pondrán en cero todos los movimientos de dinero.</b>
        <small>
          Ingresos, egresos, cobros, señas, pagos a proveedores,
          compras pagadas y saldos contables. No se borran salones,
          proveedores, fiestas, productos ni pedidos.
        </small>
      </div>
    </div>

    <form id="zero88" style="margin-top:14px">
      <div class="field">
        <label>Contraseña del salón</label>
        <input name="password" type="password" required>
      </div>
      <div class="field">
        <label>Motivo</label>
        <input name="reason" required placeholder="Ej.: comenzar contabilidad desde cero">
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="danger">Poner toda la contabilidad en $0</button>
      </div>
    </form>
  `);

  document.querySelector('#zero88').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const expected=String(s?.password||s?.pass||'');
    if(expected && String(f.password)!==expected)return toast('Contraseña incorrecta');

    resetMoneyData88();

    data.auditLog=data.auditLog||[];
    data.auditLog.push({
      id:id(),
      salonId:sid88(),
      type:'RESET_MONEY_V88',
      reason:String(f.reason||''),
      createdAt:new Date().toISOString()
    });

    save();
    closeModal();
    toast('Toda la contabilidad quedó en $0');

    // Segunda aplicación para impedir que una capa vieja reconstruya importes.
    setTimeout(()=>{
      resetMoneyData88();
      save();
      view='finance';
      renderSalonShell();
    },300);
  };
};

// El código anterior llama zeroMoney52 desde el botón. Lo reemplazamos.
window.zeroMoney52=window.zeroMoney88;
window.quickZeroMoneyV38=window.zeroMoney88;

function repairFinanceButtons88(){
  if(view!=='finance')return;
  document.querySelectorAll('button').forEach(btn=>{
    const t=String(btn.textContent||'').toLowerCase();
    if(t.includes('ingresar dinero'))btn.onclick=()=>openManualMoneyV88('Ingreso');
    if(t.includes('registrar egreso'))btn.onclick=()=>openManualMoneyV88('Gasto');
    if(t.includes('poner movimientos en $0')){
      btn.onclick=()=>zeroMoney88();
      btn.setAttribute('onclick','zeroMoney88()');
    }
  });
}

const route88=renderSalonView;
renderSalonView=function(){
  const r=route88();
  if(view==='finance'){
    setTimeout(()=>{paintFinance88();repairFinanceButtons88()},0);
    setTimeout(()=>{paintFinance88();repairFinanceButtons88()},120);
  }
  return r;
};

window.paintFinance88=paintFinance88;
window.resetMoneyData88=resetMoneyData88;

})();

// ============================================================
// V89 - PROMOS DESTACADAS PAGAS, HABILITADAS POR ADMIN
// ============================================================
(function(){
'use strict';

const esc89=v=>String(v??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function currentSalon89(){
  return (data.salons||[]).find(s=>String(s.id)===String(session?.salonId));
}

function promoEligible89(s){
  if(!s)return false;
  if(s.status!=='Aprobado')return false;
  if(s.publicProfileEnabled===false)return false;
  if(s.featuredPromoEnabled!==true)return false;
  if(s.featuredPromoActive!==true)return false;
  if(!s.featuredPromoTitle)return false;

  if(s.featuredPromoValidUntil){
    const end=new Date(String(s.featuredPromoValidUntil)+'T23:59:59');
    if(end < new Date()) return false;
  }
  return true;
}

// ------------------------------------------------------------
// ADMIN GENERAL: habilitar/deshabilitar publicación destacada
// ------------------------------------------------------------
window.toggleFeaturedPromoPermission89=function(sid){
  const s=(data.salons||[]).find(x=>String(x.id)===String(sid));
  if(!s)return;
  s.featuredPromoEnabled = !s.featuredPromoEnabled;
  if(!s.featuredPromoEnabled) s.featuredPromoActive=false;
  save();
  superSalons();
  toast(s.featuredPromoEnabled?'Promoción destacada habilitada':'Promoción destacada deshabilitada');
};

const prevSuperSalons89=window.superSalons || superSalons;
superSalons=function(){
  prevSuperSalons89();

  setTimeout(()=>{
    const content=document.querySelector('#content');
    if(!content)return;

    const rows=[...content.querySelectorAll('tbody tr')];
    rows.forEach(tr=>{
      const name=tr.querySelector('td b')?.textContent?.trim();
      if(!name)return;
      const s=(data.salons||[]).find(x=>x.name===name);
      if(!s)return;

      const actionCell=tr.querySelector('td.actions') || tr.lastElementChild;
      if(!actionCell || actionCell.querySelector('.v89-featured-btn'))return;

      const btn=document.createElement('button');
      btn.className=`${s.featuredPromoEnabled?'danger':'secondary'} small v89-featured-btn`;
      btn.style.marginLeft='6px';
      btn.textContent=s.featuredPromoEnabled?'Quitar destacado':'Habilitar destacado';
      btn.onclick=()=>toggleFeaturedPromoPermission89(s.id);
      actionCell.appendChild(btn);
    });

    if(!document.querySelector('#v89-admin-featured-note')){
      const note=document.createElement('div');
      note.id='v89-admin-featured-note';
      note.className='card';
      note.style.cssText='margin-bottom:14px;padding:14px 16px';
      note.innerHTML=`
        <div class="section-title">
          <div>
            <h3>⭐ Publicaciones destacadas pagas</h3>
            <small class="muted">
              El administrador habilita esta opción solamente a los salones que contrataron la promoción.
            </small>
          </div>
        </div>`;
      content.prepend(note);
    }
  },0);
};
window.superSalons=superSalons;

// ------------------------------------------------------------
// SALÓN: panel de promo solamente si el admin la habilitó
// ------------------------------------------------------------
function renderFeaturedPromoPanel89(){
  if(view!=='profile')return;
  const content=document.querySelector('#content');
  const s=currentSalon89();
  if(!content||!s)return;

  content.querySelector('#v87-promo-panel')?.remove();
  content.querySelector('#v89-featured-panel')?.remove();

  const box=document.createElement('div');
  box.id='v89-featured-panel';
  box.className='card';
  box.style.cssText='margin-top:16px;padding:16px';

  if(s.featuredPromoEnabled!==true){
    box.innerHTML=`
      <div class="section-title">
        <div>
          <h3>⭐ Publicación destacada</h3>
          <small class="muted">Promoción paga administrada por FiestaControl.</small>
        </div>
      </div>
      <div class="admin-notice">
        <span>🔒</span>
        <div>
          <b>Opción no habilitada</b>
          <small>Consultá con el administrador de FiestaControl para contratar una publicación destacada.</small>
        </div>
      </div>`;
    content.appendChild(box);
    return;
  }

  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0 0 4px">⭐ Publicación destacada</h3>
        <small class="muted">Tu salón está habilitado para publicar una promoción destacada paga.</small>
      </div>
      <span style="font-size:12px;font-weight:800;padding:6px 10px;border-radius:999px;background:${promoEligible89(s)?'#ecfdf5':'#f3f4f6'}">
        ${promoEligible89(s)?'PUBLICADA':'HABILITADA'}
      </span>
    </div>

    ${s.featuredPromoImage?`
      <div style="margin-top:12px;border-radius:14px;overflow:hidden;max-width:460px">
        <img src="${s.featuredPromoImage}" style="width:100%;max-height:210px;object-fit:cover;display:block">
      </div>`:''}

    ${s.featuredPromoTitle?`
      <div style="margin-top:12px">
        <b style="font-size:18px">${esc89(s.featuredPromoTitle)}</b>
        ${s.featuredPromoPrice?`<strong style="display:block;margin-top:4px">${esc89(s.featuredPromoPrice)}</strong>`:''}
        ${s.featuredPromoText?`<p style="margin:6px 0 0">${esc89(s.featuredPromoText)}</p>`:''}
        ${s.featuredPromoValidUntil?`<small class="muted">Vigente hasta ${esc89(s.featuredPromoValidUntil)}</small>`:''}
      </div>`:''}

    <div style="margin-top:14px">
      <button class="primary" onclick="openFeaturedPromo89()">
        ${s.featuredPromoTitle?'Editar publicación':'Cargar publicación'}
      </button>
    </div>`;

  content.appendChild(box);
}
window.renderFeaturedPromoPanel89=renderFeaturedPromoPanel89;

window.openFeaturedPromo89=function(){
  const s=currentSalon89();
  if(!s || s.featuredPromoEnabled!==true){
    return toast('Esta opción debe ser habilitada por el administrador');
  }

  showModal(`
    <div class="modal-title">
      <div>
        <h2>⭐ Publicación destacada</h2>
        <p>Esta promoción aparecerá en la pantalla principal de FiestaControl.</p>
      </div>
      <button class="ghost small" type="button" onclick="closeModal()">✕</button>
    </div>

    <form id="promo89">
      <div class="form-grid">
        <div class="field span2">
          <label>Título llamativo</label>
          <input name="title" maxlength="80" required value="${esc89(s.featuredPromoTitle||'')}" placeholder="Ej.: 20% OFF en fiestas de domingo">
        </div>

        <div class="field">
          <label>Precio / beneficio</label>
          <input name="price" maxlength="60" value="${esc89(s.featuredPromoPrice||'')}" placeholder="Ej.: Desde $450.000">
        </div>

        <div class="field">
          <label>Vigente hasta</label>
          <input name="validUntil" type="date" value="${esc89(s.featuredPromoValidUntil||'')}">
        </div>

        <div class="field span2">
          <label>Texto de venta</label>
          <textarea name="text" maxlength="350" placeholder="Contá qué incluye y por qué conviene reservar">${esc89(s.featuredPromoText||'')}</textarea>
        </div>

        <div class="field span2">
          <label>Imagen principal</label>
          <input id="promo89img" type="file" accept="image/*">
          ${s.featuredPromoImage
            ? `<img id="promo89preview" src="${s.featuredPromoImage}" style="display:block;margin-top:8px;width:100%;max-width:420px;max-height:220px;object-fit:cover;border-radius:12px">`
            : `<img id="promo89preview" style="display:none;margin-top:8px;width:100%;max-width:420px;max-height:220px;object-fit:cover;border-radius:12px">`
          }
        </div>

        <div class="field span2">
          <label style="display:flex;align-items:center;gap:9px">
            <input name="active" type="checkbox" ${s.featuredPromoActive===true?'checked':''}>
            <span><b>Publicar ahora</b><br><small>La publicación debe estar habilitada por el administrador.</small></span>
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="ghost" onclick="closeModal()">Cancelar</button>
        <button class="primary">Guardar publicación</button>
      </div>
    </form>`);

  let img=s.featuredPromoImage||'';
  const input=document.querySelector('#promo89img');
  input.onchange=e=>{
    const f=e.target.files?.[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      img=r.result;
      const p=document.querySelector('#promo89preview');
      p.src=img;
      p.style.display='block';
    };
    r.readAsDataURL(f);
  };

  document.querySelector('#promo89').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    s.featuredPromoTitle=String(fd.get('title')||'').trim();
    s.featuredPromoPrice=String(fd.get('price')||'').trim();
    s.featuredPromoText=String(fd.get('text')||'').trim();
    s.featuredPromoValidUntil=String(fd.get('validUntil')||'');
    s.featuredPromoImage=img;
    s.featuredPromoActive=e.target.elements.active.checked && s.featuredPromoEnabled===true;
    s.featuredPromoUpdatedAt=new Date().toISOString();
    save();
    closeModal();
    renderSalonShell();
    toast('Publicación destacada guardada');
  };
};

// ------------------------------------------------------------
// PANTALLA PRINCIPAL: bloque grande y llamativo de promociones
// ------------------------------------------------------------
function featuredSection89(){
  const list=(data.salons||[])
    .filter(promoEligible89)
    .sort((a,b)=>String(b.featuredPromoUpdatedAt||'').localeCompare(String(a.featuredPromoUpdatedAt||'')));

  if(!list.length)return '';

  return `
    <section class="v89-featured" style="margin-top:18px">
      <div class="card" style="padding:18px;background:linear-gradient(135deg,#fff7ed,#f5f3ff);border:1px solid #ede9fe">
        <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <span style="font-size:11px;font-weight:900;letter-spacing:.08em">⭐ PROMOS DESTACADAS</span>
            <h2 style="margin:4px 0 0">Ofertas especiales de nuestros salones</h2>
          </div>
          <small class="muted">Publicaciones promocionadas</small>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
          ${list.slice(0,6).map(s=>`
            <article class="card" style="padding:0;overflow:hidden;border:2px solid rgba(114,87,255,.16);box-shadow:0 10px 30px rgba(30,41,59,.08)">
              ${s.featuredPromoImage
                ? `<img src="${s.featuredPromoImage}" alt="${esc89(s.featuredPromoTitle)}" style="width:100%;height:180px;object-fit:cover;display:block">`
                : `<div style="height:130px;display:flex;align-items:center;justify-content:center;font-size:52px;background:#ede9fe">🎉</div>`}
              <div style="padding:14px">
                <span style="display:inline-block;font-size:10px;font-weight:900;padding:5px 8px;border-radius:999px;background:#fee2e2">DESTACADO</span>
                <h3 style="margin:8px 0 3px">${esc89(s.featuredPromoTitle)}</h3>
                <b>${esc89(s.name||'Salón')}</b>
                ${s.zone?`<small class="muted" style="display:block;margin-top:3px">📍 ${esc89(s.zone)}</small>`:''}
                ${s.featuredPromoPrice?`<div style="font-size:20px;font-weight:900;margin-top:9px">${esc89(s.featuredPromoPrice)}</div>`:''}
                ${s.featuredPromoText?`<p style="margin:8px 0 0;line-height:1.45">${esc89(s.featuredPromoText)}</p>`:''}
                ${s.featuredPromoValidUntil?`<small class="muted" style="display:block;margin-top:8px">Vigente hasta ${esc89(s.featuredPromoValidUntil)}</small>`:''}
                <button class="primary w100" style="margin-top:12px" onclick="renderPublicSalonPage('${esc89(s.id)}')">Ver salón</button>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    </section>`;
}

const prevHome89=window.renderPublicHome;
renderPublicHome=function(){
  prevHome89();

  setTimeout(()=>{
    const home=document.querySelector('.fc-home');
    if(!home)return;
    home.querySelector('.v89-featured')?.remove();

    const features=home.querySelector('.fc-home-features');
    const wrap=document.createElement('div');
    wrap.innerHTML=featuredSection89();
    const section=wrap.firstElementChild;
    if(section){
      if(features) home.insertBefore(section,features);
      else home.appendChild(section);
    }
  },0);
};
window.renderPublicHome=renderPublicHome;

// También al entrar a "Ver salones", arriba del listado.
const prevDir89=window.renderPublicSalonDirectory;
if(typeof prevDir89==='function'){
  window.renderPublicSalonDirectory=function(){
    const r=prevDir89();
    setTimeout(()=>{
      const results=document.querySelector('#v27-results');
      if(!results)return;
      document.querySelector('#v89-directory-featured')?.remove();
      const html=featuredSection89();
      if(!html)return;
      const wrap=document.createElement('div');
      wrap.id='v89-directory-featured';
      wrap.innerHTML=html;
      results.parentElement.insertBefore(wrap,results);
    },0);
    return r;
  };
}

// Asegura que Mi salón muestre el panel final V89
const route89=renderSalonView;
renderSalonView=function(){
  const r=route89();
  if(view==='profile'){
    setTimeout(renderFeaturedPromoPanel89,0);
    setTimeout(renderFeaturedPromoPanel89,100);
  }
  return r;
};

})();

