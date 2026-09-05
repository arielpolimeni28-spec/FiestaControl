// FiestaControl - Agenda + confirmación automática por email + borrado protegido
(function () {
  'use strict';

  function safeEsc(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

  function getEvent(eid) {
    return (window.data || data || {}).events?.find(x => x.id === eid) || null;
  }

  // Estilo mínimo para que cada día del calendario sea clickeable sin romper el diseño actual.
  const style = document.createElement('style');
  style.textContent = `
    .day.fc-clickable-day{
      width:100%; min-height:118px; text-align:left; cursor:pointer;
      font:inherit; color:inherit; background:inherit;
      border:0; padding:10px; display:block;
    }
    .day.fc-clickable-day:hover{outline:2px solid rgba(114,87,255,.28); outline-offset:-2px}
    .fc-day-summary{margin-top:6px;font-size:12px}
    .fc-day-summary strong{display:block}
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
        body: JSON.stringify({ event: eventObj, salonId: eventObj.salonId }),
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
      try { toast('Fiesta confirmada. No se pudo enviar el email'); } catch (_) {}
      console.error('Email confirmación:', err);
    }
  }

  // Envuelve el formulario existente. No reemplaza la lógica principal de guardado.
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
          try { toast('Para confirmar, cargá el email del cliente'); } catch (_) {}
          form.querySelector('input[name="email"]')?.focus();
          return false;
        }

        const shouldNotify =
          snapshot.status === 'Confirmada' &&
          previousStatus !== 'Confirmada';

        const result = originalSubmit ? originalSubmit.call(form, ev) : undefined;

        if (shouldNotify) {
          let target = eid ? getEvent(eid) : null;
          if (!target) {
            target = (data.events || []).find(e => !beforeIds.has(e.id)) || null;
          }
          if (target) setTimeout(() => sendConfirmationEmail(target), 0);
        }

        return result;
      };
    };
  }

  function openAgendaDay(dateKey) {
    const events = (typeof se === 'function' ? se() : (data.events || []))
      .filter(e => e.date === dateKey && !['Cancelada','Finalizada'].includes(e.status))
      .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));

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
        closeModal();
        window.openEventForm();
        const inp = document.querySelector('#event-form input[name="date"]');
        if (inp) inp.value = dateKey;
      });
      return;
    }

    const rows = events.map(e => `
      <button class="today-event-row" type="button" data-fc-event="${safeEsc(e.id)}">
        <span class="today-time">${safeEsc(e.start || '--:--')}–${safeEsc(e.end || '--:--')}</span>
        <span>
          <b>${safeEsc(e.child || 'Fiesta')}</b>
          <small>${safeEsc(e.client || '')} · ${safeEsc(e.status || '')}</small>
        </span>
        <strong>Ver →</strong>
      </button>
    `).join('');

    showModal(`
      <div class="modal-title">
        <div>
          <h2>📅 ${safeEsc(titleDate)}</h2>
          <p>${events.length} reserva${events.length === 1 ? '' : 's'} / horario${events.length === 1 ? '' : 's'} ocupado${events.length === 1 ? '' : 's'}</p>
        </div>
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
        const id = btn.getAttribute('data-fc-event');
        closeModal();
        if (typeof openEvent === 'function') openEvent(id);
      });
    });

    document.querySelector('#fc-new-on-day')?.addEventListener('click', () => {
      closeModal();
      window.openEventForm();
      const inp = document.querySelector('#event-form input[name="date"]');
      if (inp) inp.value = dateKey;
    });
  }

  window.openAgendaDay = openAgendaDay;

  // Reemplaza solo la presentación de Agenda.
  // Mantiene el mes actual del sistema: Septiembre 2026.
  if (typeof renderCalendar === 'function') {
    window.renderCalendar = renderCalendar = function () {
      setTitle('Agenda', 'Disponibilidad y ocupación del salón');

      const d = new Date(2026, 8, 1);
      const first = d.getDay();
      const days = new Date(2026, 9, 0).getDate();
      const cells = [];

      for (let i = 0; i < first; i++) cells.push('<div class="day off"></div>');

      for (let n = 1; n <= days; n++) {
        const ds = `2026-09-${String(n).padStart(2, '0')}`;
        const events = se()
          .filter(e => e.date === ds && !['Cancelada','Finalizada'].includes(e.status))
          .sort((a,b) => String(a.start || '').localeCompare(String(b.start || '')));

        cells.push(`
          <button type="button" class="day fc-clickable-day" onclick="openAgendaDay('${ds}')">
            <div class="day-number">${n}</div>
            ${
              events.length
                ? `<div class="fc-day-summary"><strong>${events.length} reserva${events.length === 1 ? '' : 's'}</strong>${events.slice(0,2).map(e => `<span class="event-chip">${safeEsc(e.start)} · ${safeEsc(e.child)}</span>`).join('')}</div>`
                : '<small class="muted">Disponible</small>'
            }
          </button>
        `);
      }

      document.querySelector('#content').innerHTML = `
        <div class="card">
          <div class="calendar-head">
            <h3>Septiembre 2026</h3>
            <div>
              <span class="pill confirmada">Reservado</span>
              <span class="pill consulta">Consulta</span>
            </div>
          </div>
          <div class="calendar">
            ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(x => `<div class="weekday">${x}</div>`).join('')}
            ${cells.join('')}
          </div>
        </div>
      `;
    };
  }

  // Borrado protegido de fiestas: exige la contraseña actual del salón.
  const originalOpenEvent = window.openEvent;
  if (typeof originalOpenEvent === 'function') {
    window.openEvent = function (eid) {
      originalOpenEvent(eid);

      const toolbar = document.querySelector('#modal-body .toolbar');
      if (!toolbar || toolbar.querySelector('[data-fc-delete-event]')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'danger small';
      btn.setAttribute('data-fc-delete-event', '1');
      btn.textContent = '🗑 Borrar fiesta';
      btn.onclick = () => window.confirmDeleteEvent(eid);
      toolbar.appendChild(btn);
    };
  }

  window.confirmDeleteEvent = function (eid) {
    const ev = getEvent(eid);
    if (!ev) return;

    showModal(`
      <div class="modal-title">
        <div>
          <h2>🗑 Borrar fiesta</h2>
          <p>${safeEsc(ev.child || 'Fiesta')} · ${safeEsc(typeof fmtDate === 'function' ? fmtDate(ev.date) : ev.date)}</p>
        </div>
        <button class="ghost small" onclick="closeModal()">✕</button>
      </div>

      <div class="admin-notice attention">
        <span>⚠️</span>
        <div>
          <b>Esta acción no se puede deshacer</b>
          <small>Para borrar la fiesta ingresá la contraseña actual del salón.</small>
        </div>
      </div>

      <form id="fc-delete-event-form" style="margin-top:16px">
        <div class="field">
          <label>Contraseña del salón</label>
          <input type="password" name="password" required autocomplete="current-password">
        </div>
        <div class="form-actions">
          <button type="button" class="ghost" onclick="openEvent('${safeEsc(eid)}')">Cancelar</button>
          <button type="submit" class="danger">Borrar definitivamente</button>
        </div>
      </form>
    `);

    const form = document.querySelector('#fc-delete-event-form');
    if (!form) return;

    form.onsubmit = async function (e) {
      e.preventDefault();
      const password = String(new FormData(form).get('password') || '');

      try {
        const r = await fetch('/api/delete-event', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            eventId: eid,
            salonId: ev.salonId,
            password
          }),
          cache: 'no-store'
        });

        const res = await r.json().catch(() => ({}));
        if (!r.ok || !res.ok) {
          toast(res.error || 'No se pudo borrar la fiesta');
          return;
        }

        data = res.state;
        closeModal();
        toast('Fiesta borrada');
        renderSalonShell();
      } catch (err) {
        console.error(err);
        toast('No se pudo conectar con el servidor');
      }
    };
  };

})();
