import sys
import json
import mimetypes
import os
import time
from datetime import datetime, timezone
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import unquote, parse_qs

BASE = Path(__file__).resolve().parent
EMAIL_SECRETS = Path.home() / ".fiestacontrol_email_secrets.json"

if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

import server


def respuesta(start_response, status, contenido=b"", content_type="text/plain; charset=utf-8"):
    if isinstance(contenido, str):
        contenido = contenido.encode("utf-8")
    start_response(status, [
        ("Content-Type", content_type),
        ("Content-Length", str(len(contenido))),
        ("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"),
        ("Pragma", "no-cache"),
    ])
    return [contenido]


def leer_json(environ):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        body = environ["wsgi.input"].read(length) if length else b"{}"
        return json.loads(body.decode("utf-8"))
    except Exception:
        return {}


def json_response(start_response, objeto, status="200 OK"):
    raw = json.dumps(objeto, ensure_ascii=False).encode("utf-8")
    return respuesta(start_response, status, raw, "application/json; charset=utf-8")


def _fmt_date_ars(date_text):
    try:
        y, m, d = str(date_text).split("-")
        return f"{d}/{m}/{y}"
    except Exception:
        return str(date_text or "")


def _load_email_secrets():
    try:
        if not EMAIL_SECRETS.exists():
            return {}
        obj = json.loads(EMAIL_SECRETS.read_text(encoding="utf-8"))
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def _save_email_secrets(obj):
    EMAIL_SECRETS.write_text(
        json.dumps(obj, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    try:
        os.chmod(EMAIL_SECRETS, 0o600)
    except Exception:
        pass


def _find_salon(st, salon_id):
    return next(
        (x for x in st.get("salons", []) if str(x.get("id")) == str(salon_id)),
        None
    )


def _require_salon_password(st, salon_id, password):
    salon = _find_salon(st, salon_id)
    if not salon:
        raise ValueError("Salón inexistente")
    if str(salon.get("password") or "") != str(password or ""):
        raise ValueError("Contraseña de FiestaControl incorrecta")
    return salon


def _email_config_for_salon(salon_id):
    secrets = _load_email_secrets()
    cfg = secrets.get(str(salon_id)) or {}

    # Compatibilidad con configuraciones antiguas de Gmail.
    if cfg.get("email") and cfg.get("appPassword") and not cfg.get("smtpHost"):
        cfg = {
            **cfg,
            "provider": "gmail",
            "smtpHost": "smtp.gmail.com",
            "smtpPort": 587,
            "smtpSecurity": "starttls",
        }

    # Respaldo del WSGI para el salón inicial.
    if not cfg.get("email") or not cfg.get("appPassword"):
        email = os.environ.get("FIESTACONTROL_EMAIL", "").strip()
        password = os.environ.get("FIESTACONTROL_EMAIL_PASSWORD", "").replace(" ", "").strip()
        if email and password:
            cfg = {
                "provider": "gmail",
                "email": email,
                "appPassword": password,
                "smtpHost": "smtp.gmail.com",
                "smtpPort": 587,
                "smtpSecurity": "starttls",
            }

    required = ("email", "appPassword", "smtpHost", "smtpPort", "smtpSecurity")
    if any(not cfg.get(k) for k in required):
        raise ValueError("Este salón todavía no configuró su correo de confirmaciones")

    try:
        port = int(cfg.get("smtpPort"))
    except Exception:
        raise ValueError("El puerto SMTP no es válido")

    security = str(cfg.get("smtpSecurity") or "").lower()
    if security not in ("starttls", "ssl", "none"):
        raise ValueError("El tipo de seguridad SMTP no es válido")

    return {
        "provider": str(cfg.get("provider") or "other"),
        "email": str(cfg.get("email") or "").strip(),
        "appPassword": str(cfg.get("appPassword") or "").replace(" ", "").strip(),
        "smtpHost": str(cfg.get("smtpHost") or "").strip(),
        "smtpPort": port,
        "smtpSecurity": security,
    }


def _send_email(config, destinatario, subject, text_body, html_body):
    sender = config["email"]
    password = config["appPassword"]
    host = config["smtpHost"]
    port = int(config["smtpPort"])
    security = config["smtpSecurity"]

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"FiestaControl <{sender}>"
    msg["To"] = destinatario
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()

    try:
        if security == "ssl":
            with smtplib.SMTP_SSL(host, port, timeout=25, context=context) as smtp:
                smtp.login(sender, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=25) as smtp:
                smtp.ehlo()
                if security == "starttls":
                    smtp.starttls(context=context)
                    smtp.ehlo()
                smtp.login(sender, password)
                smtp.send_message(msg)

    except smtplib.SMTPAuthenticationError:
        raise ValueError(
            "El proveedor rechazó el acceso. Revisá el email y la contraseña/clave de aplicación."
        )
    except Exception as ex:
        raise ValueError(f"No se pudo enviar el email: {ex}")

def enviar_confirmacion_email(evento, salon):
    salon_id = str(evento.get("salonId") or "")
    email_config = _email_config_for_salon(salon_id)

    destinatario = str(evento.get("email") or "").strip()
    if "@" not in destinatario:
        raise ValueError("La reserva no tiene un email válido")

    salon_name = str((salon or {}).get("name") or "FiestaControl")
    client = str(evento.get("client") or "")
    child = str(evento.get("child") or "")
    date_txt = _fmt_date_ars(evento.get("date"))
    start = str(evento.get("start") or "")
    end = str(evento.get("end") or "")
    package = str(evento.get("package") or "")

    subject = f"Confirmación de fiesta - {salon_name}"
    text_body = (
        "¡Tu fiesta está confirmada!\n\n"
        f"Salón: {salon_name}\n"
        f"Cliente: {client}\n"
        f"Cumpleañero/a: {child}\n"
        f"Fecha: {date_txt}\n"
        f"Horario: {start} a {end}\n"
        f"Paquete: {package}\n\n"
        "Tu reserva quedó confirmada correctamente.\n\n"
        "Gracias por elegirnos.\nFiestaControl"
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#222">
      <div style="padding:22px;border:1px solid #ddd;border-radius:14px">
        <h2>🎉 ¡Tu fiesta está confirmada!</h2>
        <p>Hola {client or 'cliente'}, confirmamos tu reserva.</p>
        <p><b>Salón:</b> {salon_name}<br>
        <b>Cumpleañero/a:</b> {child}<br>
        <b>Fecha:</b> {date_txt}<br>
        <b>Horario:</b> {start} a {end}<br>
        <b>Paquete:</b> {package}</p>
        <p>Tu reserva quedó confirmada correctamente.</p>
        <p>Gracias por elegirnos.</p>
        <p style="font-size:12px;color:#777">Enviado automáticamente por FiestaControl.</p>
      </div>
    </div>
    """
    _send_email(email_config, destinatario, subject, text_body, html_body)



def _ensure_community_reset_v85():
    """
    Reset global y único de Comunidad.
    Se ejecuta del lado del servidor, por lo que no depende del navegador
    ni del usuario que abra primero la aplicación.
    """
    st = server.get_state()
    if st.get("communityResetV85") is True:
        return

    st["adminCommunityMessages"] = []
    st["communityMessages"] = []
    st["communityMessageReads"] = []
    st["communityResetV85"] = True
    st["communityResetAtV85"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    server.put_state(st)



def _movement_timestamp(m):
    return str((m or {}).get("createdAt") or (m or {}).get("movementDate") or "")


def _parse_created_epoch_v117(obj):
    """Devuelve epoch UTC de createdAt/date cuando existe; None si no es confiable."""
    if not isinstance(obj, dict):
        return None
    raw = obj.get("createdAt") or obj.get("dateTime") or ""
    raw = str(raw or "").strip()
    if not raw:
        return None
    try:
        # JS usa ISO con Z. fromisoformat requiere +00:00.
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None


def _apply_supplier_cleanup_barrier_v117(current, merged):
    """
    Barrera definitiva contra resurrección de pedidos borrados.
    Después de una limpieza, un PUT viejo puede seguir llegando desde pestañas o
    scripts legacy. Solo se aceptan nuevas operaciones creadas DESPUÉS del epoch
    de limpieza del salón. Los registros viejos o sin fecha se descartan.
    """
    epochs = current.get("supplierCleanupEpochV117") or {}
    if not isinstance(epochs, dict):
        epochs = {}
    merged["supplierCleanupEpochV117"] = dict(epochs)
    if not epochs:
        return merged

    def keep_order(o):
        if not isinstance(o, dict):
            return False
        sid = str(o.get("salonId") or "")
        epoch = epochs.get(sid)
        if epoch is None:
            return True
        try:
            epoch = float(epoch)
        except Exception:
            return True
        created = _parse_created_epoch_v117(o)
        # Todo registro anterior a la limpieza, o sin timestamp confiable,
        # queda definitivamente invalidado para ese salón.
        return created is not None and created > epoch

    kept_purchase_ids = set()
    kept_order_ids = set()
    new_purchases = []
    for o in (merged.get("stockPurchases") or []):
        if keep_order(o):
            new_purchases.append(o)
            if o.get("id"):
                kept_purchase_ids.add(str(o.get("id")))
    new_orders = []
    for o in (merged.get("orders") or []):
        if keep_order(o):
            new_orders.append(o)
            if o.get("id"):
                kept_order_ids.add(str(o.get("id")))
    merged["stockPurchases"] = new_purchases
    merged["orders"] = new_orders
    valid_ids = kept_purchase_ids | kept_order_ids

    # Mensajes/pagos vinculados solo sobreviven si su pedido también sobrevivió.
    merged["orderMessages"] = [m for m in (merged.get("orderMessages") or [])
                               if not (m or {}).get("orderId") or str((m or {}).get("orderId")) in valid_ids]
    merged["providerPayments"] = [m for m in (merged.get("providerPayments") or [])
                                  if not (m or {}).get("orderId") or str((m or {}).get("orderId")) in valid_ids]
    merged["movements"] = [m for m in (merged.get("movements") or [])
                           if (not (m or {}).get("orderId") or str((m or {}).get("orderId")) in valid_ids)
                           and (not (m or {}).get("stockPurchaseId") or str((m or {}).get("stockPurchaseId")) in valid_ids)]
    return merged


def _merge_state_protecting_movements(incoming):
    """
    Protege movimientos financieros frente a PUT /api/data con copias viejas.
    La UI histórica guarda el estado completo; una pestaña/refresco atrasado podía
    reemplazar 'movements' y hacer desaparecer un egreso recién creado.
    """
    current = server.get_state()
    if not isinstance(incoming, dict):
        incoming = {}

    merged = dict(incoming)
    current_movements = current.get("movements") or []
    incoming_movements = incoming.get("movements") or []

    # Epoch de reset por salón. Evita que un PUT viejo resucite movimientos
    # anteriores a un "Poner movimientos en $0".
    epochs = current.get("financeMovementResetAtV93") or {}
    if not isinstance(epochs, dict):
        epochs = {}

    by_id = {}

    def allowed_after_reset(m):
        sid = str((m or {}).get("salonId") or "")
        epoch = str(epochs.get(sid) or "")
        if not epoch:
            return True
        ts = _movement_timestamp(m)
        return bool(ts and ts > epoch)

    for m in current_movements:
        if isinstance(m, dict) and m.get("id") and allowed_after_reset(m):
            by_id[str(m["id"])] = m

    for m in incoming_movements:
        if isinstance(m, dict) and m.get("id") and allowed_after_reset(m):
            # La versión entrante puede actualizar campos del mismo movimiento,
            # pero nunca eliminar movimientos que el servidor ya confirmó.
            by_id[str(m["id"])] = m

    merged["movements"] = list(by_id.values())
    merged["financeMovementResetAtV93"] = epochs

    # V114: un navegador con estado viejo no puede resucitar pedidos/compras borrados.
    tombstones = {str(x) for x in (current.get("deletedSupplierOrderIdsV114") or []) if x}
    merged["deletedSupplierOrderIdsV114"] = list(tombstones)
    merged["supplierCleanupAtV114"] = current.get("supplierCleanupAtV114") or {}
    if tombstones:
        merged["stockPurchases"] = [x for x in (merged.get("stockPurchases") or []) if str((x or {}).get("id") or "") not in tombstones]
        merged["orders"] = [x for x in (merged.get("orders") or []) if str((x or {}).get("id") or "") not in tombstones]
        merged["orderMessages"] = [x for x in (merged.get("orderMessages") or []) if str((x or {}).get("orderId") or "") not in tombstones]
        merged["providerPayments"] = [x for x in (merged.get("providerPayments") or []) if str((x or {}).get("orderId") or "") not in tombstones]
        merged["movements"] = [m for m in (merged.get("movements") or []) if str((m or {}).get("orderId") or "") not in tombstones and str((m or {}).get("stockPurchaseId") or "") not in tombstones]

    # V114: las promos múltiples se modifican por endpoint atómico; conservar la versión del servidor.
    cur_salons = {str((s or {}).get("id") or ""): s for s in (current.get("salons") or [])}
    for salon in (merged.get("salons") or []):
        sid = str((salon or {}).get("id") or "")
        cur = cur_salons.get(sid)
        if cur and "featuredPromos" in cur:
            salon["featuredPromos"] = cur.get("featuredPromos") or []
            # Mantener compatibilidad legacy sincronizada con el servidor.
            for k in ("featuredPromoTitle","featuredPromoPrice","featuredPromoText","featuredPromoImage","featuredPromoValidUntil","featuredPromoActive","featuredPromoUpdatedAt"):
                if k in cur:
                    salon[k] = cur.get(k)
    _apply_supplier_cleanup_barrier_v117(current, merged)
    _normalize_accounting_v116(merged)
    return merged


def _append_movement_v93(req):
    st = server.get_state()
    movement = (req or {}).get("movement") or {}
    if not isinstance(movement, dict):
        raise ValueError("Movimiento inválido")

    salon_id = str(movement.get("salonId") or "")
    movement_id = str(movement.get("id") or "")
    if not salon_id or not movement_id:
        raise ValueError("Faltan datos del movimiento")

    st["movements"] = st.get("movements") or []
    if not any(str(x.get("id")) == movement_id for x in st["movements"] if isinstance(x, dict)):
        st["movements"].append(movement)

    server.put_state(st)
    return server.get_state()


def _finance_reset_v93(req):
    st = server.get_state()
    salon_id = str((req or {}).get("salonId") or "")
    if not salon_id:
        raise ValueError("Falta el salón")

    reset_at = time.strftime("%Y-%m-%dT%H:%M:%S")
    epochs = st.get("financeMovementResetAtV93") or {}
    if not isinstance(epochs, dict):
        epochs = {}
    epochs[salon_id] = reset_at
    st["financeMovementResetAtV93"] = epochs

    st["movements"] = [
        m for m in (st.get("movements") or [])
        if str((m or {}).get("salonId") or "") != salon_id
    ]
    st["providerPayments"] = [
        m for m in (st.get("providerPayments") or [])
        if str((m or {}).get("salonId") or "") != salon_id
    ]
    st["servicePayments"] = [
        m for m in (st.get("servicePayments") or [])
        if str((m or {}).get("salonId") or "") != salon_id
    ]

    for e in st.get("events") or []:
        if str((e or {}).get("salonId") or "") == salon_id:
            e["deposit"] = 0
            e["depositMethod"] = ""
            e["depositDate"] = ""
            e["paid"] = 0
            try:
                e["balance"] = float(e.get("total") or 0)
            except Exception:
                e["balance"] = e.get("total") or 0

    for p in st.get("stockPurchases") or []:
        if str((p or {}).get("salonId") or "") == salon_id:
            p["paymentStatus"] = "Pendiente"
            p["paymentMethod"] = ""
            p["paymentReference"] = ""
            p["reference"] = ""
            p["paymentDate"] = ""
            p["paidAt"] = None
            p["paidAmount"] = 0
            p["amountPaid"] = 0
            p["financeExpenseCreated"] = False

    for o in st.get("orders") or []:
        if str((o or {}).get("salonId") or "") == salon_id:
            o["paymentStatus"] = "Pendiente"
            o["paymentId"] = None
            o["paymentMethod"] = ""
            o["paymentReference"] = ""
            o["paymentDate"] = ""
            o["paidAt"] = None
            o["paid"] = 0
            o["paidAmount"] = 0
            o["amountPaid"] = 0
            o["financeExpenseCreated"] = False

    server.put_state(st)
    return server.get_state()



def _atomic_state_v94(mutator):
    """
    Modifica el estado dentro del mismo LOCK y de la misma transacción SQLite.
    Evita que otro PUT con una copia vieja pise un movimiento recién guardado.
    """
    with server.LOCK:
        c = server.db_connect()
        row = c.execute('SELECT data FROM app_state WHERE id=1').fetchone()
        st = json.loads(row[0]) if row else json.loads(json.dumps(server.SEED))
        result = mutator(st)
        raw = json.dumps(st, ensure_ascii=False, separators=(',', ':'))
        c.execute('UPDATE app_state SET data=?, updated=? WHERE id=1', (raw, time.time()))
        c.commit()
        c.close()
        return result, st


def _finance_action_v94(req):
    action = str((req or {}).get("action") or "")
    salon_id = str((req or {}).get("salonId") or "")
    if not salon_id:
        raise ValueError("Falta el salón")

    def mutate(st):
        st.setdefault("movements", [])
        if action == "add":
            m = (req or {}).get("movement") or {}
            if not isinstance(m, dict) or not m.get("id"):
                raise ValueError("Movimiento inválido")
            if str(m.get("salonId") or "") != salon_id:
                raise ValueError("Movimiento de otro salón")
            if not any(str(x.get("id")) == str(m.get("id")) for x in st["movements"] if isinstance(x, dict)):
                st["movements"].append(m)
            return {"movementId": m.get("id")}

        if action == "reset":
            st["movements"] = [
                m for m in st.get("movements", [])
                if str((m or {}).get("salonId") or "") != salon_id
            ]
            st["providerPayments"] = [
                x for x in st.get("providerPayments", [])
                if str((x or {}).get("salonId") or "") != salon_id
            ]
            st["servicePayments"] = [
                x for x in st.get("servicePayments", [])
                if str((x or {}).get("salonId") or "") != salon_id
            ]

            for e in st.get("events", []):
                if str((e or {}).get("salonId") or "") == salon_id:
                    e["deposit"] = 0
                    e["depositMethod"] = ""
                    e["depositDate"] = ""
                    e["paid"] = 0
                    try:
                        e["balance"] = float(e.get("total") or 0)
                    except Exception:
                        e["balance"] = e.get("total") or 0

            for p in st.get("stockPurchases", []):
                if str((p or {}).get("salonId") or "") == salon_id:
                    p["paymentStatus"] = "Pendiente"
                    p["paymentMethod"] = ""
                    p["paymentReference"] = ""
                    p["paymentDate"] = ""
                    p["paidAt"] = None
                    p["paidAmount"] = 0
                    p["amountPaid"] = 0
                    p["financeExpenseCreated"] = False

            for o in st.get("orders", []):
                if str((o or {}).get("salonId") or "") == salon_id:
                    o["paymentStatus"] = "Pendiente"
                    o["paymentMethod"] = ""
                    o["paymentReference"] = ""
                    o["paymentDate"] = ""
                    o["paidAt"] = None
                    o["paid"] = 0
                    o["paidAmount"] = 0
                    o["amountPaid"] = 0
                    o["financeExpenseCreated"] = False

            return {"reset": True}

        raise ValueError("Acción financiera inválida")

    _, st = _atomic_state_v94(mutate)
    return st


def _promo_action_v94(req):
    action = str((req or {}).get("action") or "")
    salon_id = str((req or {}).get("salonId") or "")
    if not salon_id:
        raise ValueError("Falta el salón")

    def mutate(st):
        salon = next((s for s in st.get("salons", []) if str(s.get("id")) == salon_id), None)
        if not salon:
            raise ValueError("Salón inexistente")

        if action == "permission":
            salon["featuredPromoEnabled"] = bool((req or {}).get("enabled"))
            if not salon["featuredPromoEnabled"]:
                salon["featuredPromoActive"] = False
            return {"enabled": salon["featuredPromoEnabled"]}

        if action == "save":
            if salon.get("featuredPromoEnabled") is not True:
                raise ValueError("La promoción destacada no está habilitada")
            promo = (req or {}).get("promo") or {}
            salon["featuredPromoTitle"] = str(promo.get("title") or "").strip()
            salon["featuredPromoPrice"] = str(promo.get("price") or "").strip()
            salon["featuredPromoText"] = str(promo.get("text") or "").strip()
            salon["featuredPromoImage"] = str(promo.get("image") or "")
            salon["featuredPromoValidUntil"] = str(promo.get("validUntil") or "")
            salon["featuredPromoActive"] = bool(promo.get("active"))
            salon["featuredPromoUpdatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            return {"saved": True}

        raise ValueError("Acción de promoción inválida")

    _, st = _atomic_state_v94(mutate)
    return st



# ============================================================
# V114 - Operaciones atómicas de proveedores y promos múltiples
# ============================================================
def _order_items_v114(order):
    items = (order or {}).get("items") or []
    if isinstance(items, list) and items:
        return items
    return [{
        "productId": (order or {}).get("productId") or "",
        "productName": (order or {}).get("productName") or "",
        "qty": (order or {}).get("qty") or (order or {}).get("quantity") or 0,
    }]

def _num_v114(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0

def _norm_v114(v):
    return str(v or "").strip().lower()

def _supplier_cleanup_v114(req):
    salon_id = str((req or {}).get("salonId") or "")
    if not salon_id:
        raise ValueError("Falta el salón")

    def mutate(st):
        purchases = [x for x in st.get("stockPurchases", []) if str((x or {}).get("salonId") or "") == salon_id]
        orders = [x for x in st.get("orders", []) if str((x or {}).get("salonId") or "") == salon_id]
        all_orders = purchases + orders
        ids = {str((x or {}).get("id") or "") for x in all_orders if (x or {}).get("id")}

        # Revertir solo stock que haya sido acreditado por esas compras entregadas.
        products = st.get("stockProducts", []) or []
        for order in all_orders:
            if str((order or {}).get("targetType") or "").lower() != "stock":
                continue
            if (order or {}).get("stockAdded") is not True:
                continue
            for it in _order_items_v114(order):
                pid = str((it or {}).get("productId") or (it or {}).get("id") or "")
                pname = _norm_v114((it or {}).get("productName") or (it or {}).get("name"))
                qty = _num_v114((it or {}).get("qty") or (it or {}).get("quantity"))
                for prod in products:
                    if str((prod or {}).get("salonId") or "") != salon_id:
                        continue
                    same = bool(pid and str((prod or {}).get("id") or "") == pid) or bool(pname and _norm_v114((prod or {}).get("name")) == pname)
                    if same:
                        prod["stock"] = max(0, _num_v114((prod or {}).get("stock")) - qty)
                        break

        st["stockPurchases"] = [x for x in st.get("stockPurchases", []) if str((x or {}).get("salonId") or "") != salon_id]
        st["orders"] = [x for x in st.get("orders", []) if str((x or {}).get("salonId") or "") != salon_id]
        st["orderMessages"] = [x for x in st.get("orderMessages", []) if str((x or {}).get("orderId") or "") not in ids]
        st["providerPayments"] = [x for x in st.get("providerPayments", []) if str((x or {}).get("orderId") or "") not in ids]
        st["movements"] = [
            m for m in st.get("movements", [])
            if not (
                str((m or {}).get("salonId") or "") == salon_id and (
                    str((m or {}).get("orderId") or "") in ids or
                    str((m or {}).get("stockPurchaseId") or "") in ids or
                    any(str((m or {}).get("sourceKey") or "") in (f"stock-purchase:{oid}", f"provider-order:{oid}") for oid in ids)
                )
            )
        ]

        # Tombstones: impiden que un PUT viejo del navegador resucite pedidos borrados.
        tomb = [str(x) for x in (st.get("deletedSupplierOrderIdsV114") or []) if x]
        tomb = list(dict.fromkeys(tomb + sorted(ids)))[-5000:]
        st["deletedSupplierOrderIdsV114"] = tomb
        epochs = st.get("supplierCleanupAtV114") or {}
        if not isinstance(epochs, dict):
            epochs = {}
        epochs[salon_id] = time.strftime("%Y-%m-%dT%H:%M:%S")
        st["supplierCleanupAtV114"] = epochs

        # V117: epoch numérico de servidor. Actúa como barrera irreversible para
        # cualquier PUT viejo que intente volver a insertar operaciones borradas.
        hard_epochs = st.get("supplierCleanupEpochV117") or {}
        if not isinstance(hard_epochs, dict):
            hard_epochs = {}
        hard_epochs[salon_id] = time.time()
        st["supplierCleanupEpochV117"] = hard_epochs
        return {"deleted": len(all_orders), "ids": sorted(ids), "cleanupEpoch": hard_epochs[salon_id]}

    result, st = _atomic_state_v94(mutate)
    return result, st

def _ensure_promos_v114(salon):
    promos = salon.get("featuredPromos")
    if not isinstance(promos, list):
        promos = []
    if not promos and str(salon.get("featuredPromoTitle") or "").strip():
        promos.append({
            "id": f"legacy-{salon.get('id')}",
            "title": str(salon.get("featuredPromoTitle") or "").strip(),
            "price": str(salon.get("featuredPromoPrice") or "").strip(),
            "text": str(salon.get("featuredPromoText") or "").strip(),
            "image": str(salon.get("featuredPromoImage") or ""),
            "validUntil": str(salon.get("featuredPromoValidUntil") or ""),
            "active": salon.get("featuredPromoActive") is True,
            "createdAt": str(salon.get("featuredPromoUpdatedAt") or ""),
            "updatedAt": str(salon.get("featuredPromoUpdatedAt") or ""),
        })
    salon["featuredPromos"] = promos
    return promos

def _sync_legacy_promo_v114(salon):
    promos = _ensure_promos_v114(salon)
    active = [p for p in promos if isinstance(p, dict) and p.get("active") is True]
    chosen = (active or promos)[-1] if (active or promos) else {}
    salon["featuredPromoTitle"] = str(chosen.get("title") or "")
    salon["featuredPromoPrice"] = str(chosen.get("price") or "")
    salon["featuredPromoText"] = str(chosen.get("text") or "")
    salon["featuredPromoImage"] = str(chosen.get("image") or "")
    salon["featuredPromoValidUntil"] = str(chosen.get("validUntil") or "")
    salon["featuredPromoActive"] = bool(chosen.get("active")) if chosen else False
    salon["featuredPromoUpdatedAt"] = str(chosen.get("updatedAt") or chosen.get("createdAt") or "")

def _promos_action_v114(req):
    action = str((req or {}).get("action") or "")
    salon_id = str((req or {}).get("salonId") or "")
    if not salon_id:
        raise ValueError("Falta el salón")

    def mutate(st):
        salon = next((x for x in st.get("salons", []) if str((x or {}).get("id") or "") == salon_id), None)
        if not salon:
            raise ValueError("Salón inexistente")
        promos = _ensure_promos_v114(salon)

        if action == "permission":
            salon["featuredPromoEnabled"] = bool((req or {}).get("enabled"))
            if not salon["featuredPromoEnabled"]:
                for p in promos:
                    if isinstance(p, dict):
                        p["active"] = False
            _sync_legacy_promo_v114(salon)
            return {"enabled": salon["featuredPromoEnabled"]}

        if salon.get("featuredPromoEnabled") is not True:
            raise ValueError("La publicación destacada no está habilitada por el administrador")

        if action == "save":
            promo = (req or {}).get("promo") or {}
            pid = str(promo.get("id") or "").strip()
            now = time.strftime("%Y-%m-%dT%H:%M:%S")
            target = next((p for p in promos if str((p or {}).get("id") or "") == pid), None) if pid else None
            if target is None:
                pid = f"promo-{int(time.time()*1000)}-{len(promos)+1}"
                target = {"id": pid, "createdAt": now}
                promos.append(target)
            target.update({
                "title": str(promo.get("title") or "").strip(),
                "price": str(promo.get("price") or "").strip(),
                "text": str(promo.get("text") or "").strip(),
                "image": str(promo.get("image") or ""),
                "validUntil": str(promo.get("validUntil") or ""),
                "active": bool(promo.get("active")),
                "updatedAt": now,
            })
            if not target["title"]:
                raise ValueError("La publicación necesita un título")
            _sync_legacy_promo_v114(salon)
            return {"saved": True, "id": pid}

        pid = str((req or {}).get("promoId") or "")
        target = next((p for p in promos if str((p or {}).get("id") or "") == pid), None)
        if not target:
            raise ValueError("Publicación inexistente")

        if action == "toggle":
            target["active"] = bool((req or {}).get("active"))
            target["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            _sync_legacy_promo_v114(salon)
            return {"active": target["active"]}

        if action == "delete":
            salon["featuredPromos"] = [p for p in promos if str((p or {}).get("id") or "") != pid]
            _sync_legacy_promo_v114(salon)
            return {"deleted": True}

        raise ValueError("Acción de publicación inválida")

    result, st = _atomic_state_v94(mutate)
    return result, st


def _norm_text_v116(v):
    import unicodedata
    t = unicodedata.normalize("NFD", str(v or "").lower())
    return "".join(ch for ch in t if unicodedata.category(ch) != "Mn").strip()

def _num_v116(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0

def _is_income_v116(m):
    return _norm_text_v116((m or {}).get("type")) in ("ingreso", "cobro")

def _is_deposit_v116(m):
    m=m or {}
    c=_norm_text_v116(m.get("category")); q=_norm_text_v116(m.get("concept")); sk=str(m.get("sourceKey") or "").lower()
    return "sena" in c or "sena" in q or ":deposit:" in sk or sk.startswith("v47:deposit:") or sk.startswith("v110:deposit:") or sk.startswith("v116:deposit:")

def _normalize_accounting_v116(st, salon_id=None):
    """
    Normaliza pagos de reservas para que Finanzas use una sola fuente contable.
    - Una sola seña por reserva.
    - Los cobros ligados a una reserva nunca pueden sumar más que event.paid.
    - Conserva ingresos/egresos manuales y operaciones de proveedores.
    """
    if not isinstance(st, dict):
        return {"removed":0,"adjusted":0}
    moves=[m for m in (st.get("movements") or []) if isinstance(m,dict)]
    events=[e for e in (st.get("events") or []) if isinstance(e,dict)]
    removed_ids=set(); removed_obj=set(); adjusted=0

    for e in events:
        sid=str(e.get("salonId") or "")
        if salon_id is not None and sid != str(salon_id):
            continue
        eid=str(e.get("id") or "")
        if not eid: continue
        dep=max(0.0,_num_v116(e.get("deposit")))
        paid=max(0.0,_num_v116(e.get("paid")))
        names=[_norm_text_v116(e.get(k)) for k in ("eventName","child","client") if _norm_text_v116(e.get(k))]

        def belongs(m):
            if str(m.get("salonId") or "") != sid or not _is_income_v116(m): return False
            me=str(m.get("eventId") or "")
            if me==eid: return True
            if me: return False
            if not _is_deposit_v116(m) or dep<=0 or abs(_num_v116(m.get("amount"))-dep)>0.005: return False
            txt=_norm_text_v116(m.get("concept"))
            return any(n and n in txt for n in names)

        linked=[m for m in moves if belongs(m)]
        deposits=[m for m in linked if _is_deposit_v116(m)]

        if dep>0:
            if deposits:
                keep=sorted(deposits,key=lambda m:(0 if str(m.get("sourceKey") or "").startswith("v116:deposit:") else 1, 0 if str(m.get("eventId") or "")==eid else 1, str(m.get("createdAt") or m.get("movementDate") or "")))[0]
            else:
                keep={"id":"dep116_"+eid,"salonId":sid,"eventId":eid,"type":"Ingreso","category":"Seña","concept":"Seña de reserva "+str(e.get("eventName") or e.get("child") or e.get("client") or ""),"amount":dep,"method":e.get("depositMethod") or "No especificado","movementDate":e.get("depositDate") or str(e.get("createdAt") or "")[:10],"createdAt":time.strftime("%Y-%m-%dT%H:%M:%S")}
                moves.append(keep); linked.append(keep); deposits.append(keep)
            keep["salonId"]=sid; keep["eventId"]=eid; keep["type"]="Ingreso"; keep["category"]="Seña"; keep["sourceKey"]="v116:deposit:"+eid; keep["amount"]=dep
            keep["concept"]="Seña de reserva "+str(e.get("eventName") or e.get("child") or e.get("client") or "")
            if e.get("depositMethod"): keep["method"]=e.get("depositMethod")
            if e.get("depositDate"): keep["movementDate"]=e.get("depositDate")
            for m in deposits:
                if m is not keep: removed_obj.add(id(m))
        else:
            for m in deposits: removed_obj.add(id(m))

        # Pagos posteriores: el total contable de la reserva debe coincidir con event.paid.
        target=max(0.0, paid-dep)
        other=[m for m in linked if not _is_deposit_v116(m) and id(m) not in removed_obj]
        other.sort(key=lambda m:str(m.get("createdAt") or m.get("movementDate") or ""))
        acc=0.0
        for m in other:
            amt=max(0.0,_num_v116(m.get("amount")))
            remain=max(0.0,target-acc)
            if remain<=0.005:
                removed_obj.add(id(m)); continue
            if amt>remain+0.005:
                m["amount"]=remain; amt=remain; adjusted+=1
            acc+=amt

        total=max(0.0,_num_v116(e.get("total")))
        e["paid"]=min(paid,total) if total>0 else paid
        e["balance"]=max(0.0,total-_num_v116(e.get("paid")))

    st["movements"]=[m for m in moves if id(m) not in removed_obj]
    st["accountingNormalizedV116At"]=time.strftime("%Y-%m-%dT%H:%M:%S")
    return {"removed":len(removed_obj),"adjusted":adjusted}

def _accounting_repair_v116(req):
    salon_id=str((req or {}).get("salonId") or "")
    if not salon_id: raise ValueError("Falta el salón")
    def mutate(st): return _normalize_accounting_v116(st,salon_id)
    result,st=_atomic_state_v94(mutate)
    return result,st

def application(environ, start_response):
    _ensure_community_reset_v85()
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = unquote(environ.get("PATH_INFO", "/"))

    try:
        if method == "GET" and path == "/api/status":
            st = server.get_state()
            return json_response(start_response, {
                "ok": True,
                "server": "PythonAnywhere",
                "db": str(server.DB),
                "salons": len(st.get("salons", [])),
                "providers": len(st.get("marketSuppliers", [])),
            })

        if method == "GET" and path == "/api/data":
            return json_response(start_response, server.get_state())

        if method == "GET" and path == "/api/salon-email":
            qs = parse_qs(environ.get("QUERY_STRING", ""))
            salon_id = str((qs.get("salonId") or [""])[0])
            cfg = (_load_email_secrets().get(salon_id) or {})
            configured = bool(cfg.get("email") and cfg.get("appPassword"))
            provider = str(cfg.get("provider") or ("gmail" if configured else ""))
            return json_response(start_response, {
                "ok": True,
                "configured": configured,
                "provider": provider,
                "email": str(cfg.get("email") or ""),
                "smtpHost": str(cfg.get("smtpHost") or ""),
                "smtpPort": cfg.get("smtpPort") or "",
                "smtpSecurity": str(cfg.get("smtpSecurity") or "")
            })

        if method == "GET" and path == "/api/bootstrap.js":
            scheme = environ.get("wsgi.url_scheme", "https")
            host = environ.get("HTTP_HOST", "fiestacontrol.pythonanywhere.com")
            state = server.get_state()
            contenido = (
                "window.__FC_SERVER_MODE__=true;"
                f"window.__FC_PUBLIC_BASE_URL__={json.dumps(f'{scheme}://{host}')};"
                f"window.__FC_SERVER_DATA__={json.dumps(state, ensure_ascii=False)};"
            )
            return respuesta(start_response, "200 OK", contenido, "application/javascript; charset=utf-8")

        if method == "POST":
            req = leer_json(environ)

            if path == "/api/accounting-repair-v116":
                result, state = _accounting_repair_v116(req)
                return json_response(start_response, {"ok": True, "result": result, "state": state})

            if path in ("/api/supplier-cleanup-v114", "/api/supplier-cleanup-v117"):
                result, state = _supplier_cleanup_v114(req)
                return json_response(start_response, {"ok": True, "result": result, "state": state})

            if path == "/api/promos-v114":
                result, state = _promos_action_v114(req)
                return json_response(start_response, {"ok": True, "result": result, "state": state})

            if path == "/api/finance-v94":
                state = _finance_action_v94(req)
                return json_response(start_response, {"ok": True, "state": state})

            if path == "/api/promo-v94":
                state = _promo_action_v94(req)
                return json_response(start_response, {"ok": True, "state": state})

            if path == "/api/movement":
                state = _append_movement_v93(req)
                return json_response(start_response, {"ok": True, "state": state})

            if path == "/api/finance-reset":
                state = _finance_reset_v93(req)
                return json_response(start_response, {"ok": True, "state": state})

            if path == "/api/register":
                item = server.register_entity(req.get("kind"), req.get("data") or {})
                return json_response(start_response, {"ok": True, "item": item, "state": server.get_state()})

            if path == "/api/reservation":
                result = server.reservation_action(req.get("action"), req.get("data") or {})
                return json_response(start_response, result)

            if path == "/api/provider-community":
                result = server.provider_community_action(req.get("action"), req.get("data") or {})
                return json_response(start_response, {"ok": True, "state": result})

            if path == "/api/marketplace":
                result = server.marketplace_action(req.get("action"), req.get("data") or {})
                return json_response(start_response, {"ok": True, "state": result})

            if path == "/api/salon-email":
                salon_id = str(req.get("salonId") or "")
                provider = str(req.get("provider") or "other").strip().lower()
                email = str(req.get("email") or "").strip()
                smtp_host = str(req.get("smtpHost") or "").strip()
                smtp_port_raw = str(req.get("smtpPort") or "").strip()
                smtp_security = str(req.get("smtpSecurity") or "starttls").strip().lower()
                app_password = str(req.get("appPassword") or "").replace(" ", "").strip()
                salon_password = str(req.get("salonPassword") or "")

                st = server.get_state()
                _require_salon_password(st, salon_id, salon_password)

                if provider not in ("gmail", "outlook", "yahoo", "other"):
                    raise ValueError("Proveedor de correo inválido")
                if "@" not in email:
                    raise ValueError("Ingresá un email válido")
                if not smtp_host or "." not in smtp_host:
                    raise ValueError("Servidor SMTP inválido")
                try:
                    smtp_port = int(smtp_port_raw)
                except Exception:
                    raise ValueError("Puerto SMTP inválido")
                if smtp_port < 1 or smtp_port > 65535:
                    raise ValueError("Puerto SMTP inválido")
                if smtp_security not in ("starttls", "ssl", "none"):
                    raise ValueError("Seguridad SMTP inválida")
                if len(app_password) < 4:
                    raise ValueError("La contraseña o clave de aplicación no parece válida")

                secrets = _load_email_secrets()
                secrets[salon_id] = {
                    "provider": provider,
                    "email": email,
                    "smtpHost": smtp_host,
                    "smtpPort": smtp_port,
                    "smtpSecurity": smtp_security,
                    "appPassword": app_password,
                    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")
                }
                _save_email_secrets(secrets)
                return json_response(start_response, {"ok": True, "email": email})

            if path == "/api/salon-email-test":
                salon_id = str(req.get("salonId") or "")
                salon_password = str(req.get("salonPassword") or "")
                st = server.get_state()
                salon = _require_salon_password(st, salon_id, salon_password)
                email_config = _email_config_for_salon(salon_id)
                salon_name = str(salon.get("name") or "FiestaControl")
                _send_email(
                    email_config,
                    email_config["email"],
                    f"Prueba de correo - {salon_name}",
                    f"El correo de {salon_name} quedó configurado correctamente en FiestaControl.",
                    f"<h2>✅ Correo configurado</h2><p>El correo de <b>{salon_name}</b> quedó configurado correctamente en FiestaControl.</p>"
                )
                return json_response(start_response, {"ok": True})

            if path == "/api/delete-event":
                event_id = str(req.get("eventId") or "")
                salon_id = str(req.get("salonId") or "")
                password = str(req.get("password") or "")
                if not event_id or not salon_id or not password:
                    raise ValueError("Faltan datos para borrar la fiesta")

                st = server.get_state()
                _require_salon_password(st, salon_id, password)

                events = st.get("events", [])
                before = len(events)
                st["events"] = [
                    x for x in events
                    if not (str(x.get("id")) == event_id and str(x.get("salonId")) == salon_id)
                ]
                if len(st["events"]) == before:
                    raise ValueError("Fiesta inexistente")

                for key in ("cards", "assignments", "orders"):
                    st[key] = [x for x in st.get(key, []) if str(x.get("eventId") or "") != event_id]

                server.put_state(st)
                return json_response(start_response, {"ok": True, "state": st})

            if path == "/api/email-confirmation":
                event_id = str(req.get("eventId") or "")
                salon_id = str(req.get("salonId") or "")
                st = server.get_state()

                evento = next(
                    (x for x in st.get("events", [])
                     if str(x.get("id")) == event_id and str(x.get("salonId")) == salon_id),
                    None
                )
                if not evento:
                    raise ValueError("Reserva inexistente")
                if evento.get("status") != "Confirmada":
                    raise ValueError("La reserva todavía no está confirmada")
                if evento.get("emailConfirmationSentAt"):
                    return json_response(start_response, {
                        "ok": True,
                        "alreadySent": True,
                        "sentAt": evento.get("emailConfirmationSentAt")
                    })

                salon = _find_salon(st, salon_id)
                enviar_confirmacion_email(evento, salon)

                sent_at = time.strftime("%Y-%m-%dT%H:%M:%S")
                evento["emailConfirmationSentAt"] = sent_at
                evento["emailConfirmationError"] = ""
                server.put_state(st)

                return json_response(start_response, {"ok": True, "sentAt": sent_at})

        if method == "PUT" and path == "/api/data":
            incoming = leer_json(environ)
            server.put_state(_merge_state_protecting_movements(incoming))
            return json_response(start_response, {"ok": True})

        if method == "GET":
            if path == "/":
                path = "/index.html"
            archivo = (BASE / path.lstrip("/")).resolve()
            if BASE not in archivo.parents and archivo != BASE:
                return respuesta(start_response, "403 Forbidden", "Acceso denegado")
            if archivo.is_file():
                content_type, _ = mimetypes.guess_type(str(archivo))
                return respuesta(start_response, "200 OK", archivo.read_bytes(), content_type or "application/octet-stream")

        return respuesta(start_response, "404 Not Found", "No encontrado")

    except ValueError as e:
        return json_response(start_response, {"ok": False, "error": str(e)}, "409 Conflict")
    except Exception as e:
        return json_response(start_response, {"ok": False, "error": str(e)}, "500 Internal Server Error")
