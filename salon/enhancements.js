// FiestaControl - mejoras de Agenda + confirmación automática por WhatsApp
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

  async function sendConfirmationWhatsApp(eventObj) {
    if (!eventObj || eventObj.status !== 'Confirmada') return;
    if (eventObj.whatsappConfirmationSentAt) return;

    const phone = String(eventObj.phone || '').trim();
    if (!phone) {
      try { toast('Falta cargar el WhatsApp del cliente'); } catch (_) {}
      return;
    }

    try {
      const r = await fetch('/api/whatsapp-confirmation', {
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

      eventObj.whatsappConfirmationSentAt = res.sentAt || new Date().toISOString();
      eventObj.whatsappConfirmationMessageId = res.messageId || '';
      eventObj.whatsappConfirmationError = '';

      if (typeof save === 'function') save();
      try { toast('Fiesta confirmada y WhatsApp enviado'); } catch (_) {}
    } catch (err) {
      eventObj.whatsappConfirmationError = String(err?.message || err);
      if (typeof save === 'function') save();
      try { toast('Fiesta confirmada. No se pudo enviar el WhatsApp'); } catch (_) {}
      console.error('WhatsApp confirmación:', err);
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

      const phoneInput = form.querySelector('input[name="phone"]');
      if (phoneInput) phoneInput.placeholder = 'Ej: 54911XXXXXXXX';

      const originalSubmit = form.onsubmit;

      form.onsubmit = function (ev) {
        const snapshot = Object.fromEntries(new FormData(form));

        if (snapshot.status === 'Confirmada' && !String(snapshot.phone || '').trim()) {
          ev.preventDefault();
          try { toast('Para confirmar, cargá el WhatsApp del cliente'); } catch (_) {}
          form.querySelector('input[name="phone"]')?.focus();
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
          if (target) setTimeout(() => sendConfirmationWhatsApp(target), 0);
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
})();
