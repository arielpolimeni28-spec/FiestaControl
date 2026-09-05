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
