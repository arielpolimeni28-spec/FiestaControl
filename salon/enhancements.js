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
