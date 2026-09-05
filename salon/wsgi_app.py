import sys
import json
import mimetypes
import os
import time
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import unquote

BASE = Path(__file__).resolve().parent

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
    return respuesta(
        start_response,
        status,
        raw,
        "application/json; charset=utf-8"
    )


def _fmt_date_ars(date_text):
    try:
        y, m, d = str(date_text).split("-")
        return f"{d}/{m}/{y}"
    except Exception:
        return str(date_text or "")


def _normalize_phone(phone):
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    # Si ya viene en formato internacional, se conserva.
    # Para Argentina, recomendamos cargarlo como 54911XXXXXXXX.
    return digits


def enviar_confirmacion_whatsapp(evento, salon):
    token = os.environ.get("META_WHATSAPP_TOKEN", "").strip()
    phone_number_id = os.environ.get("META_WHATSAPP_PHONE_NUMBER_ID", "").strip()
    graph_version = os.environ.get("META_GRAPH_VERSION", "").strip() or "v23.0"

    if not token or not phone_number_id:
        raise ValueError(
            "WhatsApp no está configurado: faltan META_WHATSAPP_TOKEN y/o META_WHATSAPP_PHONE_NUMBER_ID"
        )

    to = _normalize_phone(evento.get("phone"))
    if not to:
        raise ValueError("La reserva no tiene un WhatsApp válido")

    salon_name = str((salon or {}).get("name") or "el salón")
    date_txt = _fmt_date_ars(evento.get("date"))
    start = str(evento.get("start") or "")
    end = str(evento.get("end") or "")
    client = str(evento.get("client") or "")
    child = str(evento.get("child") or "")

    text = (
        "🎉 ¡Tu fiesta está confirmada!\n\n"
        f"Salón: {salon_name}\n"
        f"Cliente: {client}\n"
        f"Cumpleañero/a: {child}\n"
        f"Fecha: {date_txt}\n"
        f"Horario: {start} a {end}\n\n"
        "Gracias por elegirnos."
    )

    url = f"https://graph.facebook.com/{graph_version}/{phone_number_id}/messages"
    payload = json.dumps({
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text}
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(body)
            msg = err.get("error", {}).get("message") or body
        except Exception:
            msg = body
        raise ValueError(f"Meta WhatsApp rechazó el envío: {msg}")
    except Exception as e:
        raise ValueError(f"No se pudo conectar con WhatsApp: {e}")

    message_id = ""
    messages = data.get("messages") or []
    if messages and isinstance(messages[0], dict):
        message_id = str(messages[0].get("id") or "")

    return message_id


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = unquote(environ.get("PATH_INFO", "/"))

    try:
        # -----------------------
        # API - GET
        # -----------------------
        if method == "GET" and path == "/api/status":
            st = server.get_state()

            payload = {
                "ok": True,
                "server": "PythonAnywhere",
                "db": str(server.DB),
                "salons": len(st.get("salons", [])),
                "providers": len(st.get("marketSuppliers", [])),
            }

            return json_response(start_response, payload)

        if method == "GET" and path == "/api/data":
            return json_response(start_response, server.get_state())

        if method == "GET" and path == "/api/bootstrap.js":
            scheme = environ.get("wsgi.url_scheme", "https")
            host = environ.get("HTTP_HOST", "fiestacontrol.pythonanywhere.com")
            public_base = f"{scheme}://{host}"

            state = server.get_state()

            contenido = (
                "window.__FC_SERVER_MODE__=true;"
                f"window.__FC_PUBLIC_BASE_URL__={json.dumps(public_base)};"
                f"window.__FC_SERVER_DATA__={json.dumps(state, ensure_ascii=False)};"
            )

            return respuesta(
                start_response,
                "200 OK",
                contenido,
                "application/javascript; charset=utf-8"
            )

        # -----------------------
        # API - POST
        # -----------------------
        if method == "POST":
            req = leer_json(environ)

            if path == "/api/register":
                item = server.register_entity(
                    req.get("kind"),
                    req.get("data") or {}
                )
                return json_response(start_response, {
                    "ok": True,
                    "item": item,
                    "state": server.get_state()
                })

            if path == "/api/reservation":
                result = server.reservation_action(
                    req.get("action"),
                    req.get("data") or {}
                )
                return json_response(start_response, result)

            if path == "/api/provider-community":
                result = server.provider_community_action(
                    req.get("action"),
                    req.get("data") or {}
                )
                return json_response(start_response, {
                    "ok": True,
                    "state": result
                })

            if path == "/api/marketplace":
                result = server.marketplace_action(
                    req.get("action"),
                    req.get("data") or {}
                )
                return json_response(start_response, {
                    "ok": True,
                    "state": result
                })

            if path == "/api/whatsapp-confirmation":
                event_id = str(req.get("eventId") or "")
                salon_id = str(req.get("salonId") or "")
                if not event_id or not salon_id:
                    raise ValueError("Reserva inválida")

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

                if evento.get("whatsappConfirmationSentAt"):
                    return json_response(start_response, {
                        "ok": True,
                        "alreadySent": True,
                        "sentAt": evento.get("whatsappConfirmationSentAt"),
                        "messageId": evento.get("whatsappConfirmationMessageId", "")
                    })

                salon = next(
                    (x for x in st.get("salons", []) if str(x.get("id")) == salon_id),
                    None
                )

                message_id = enviar_confirmacion_whatsapp(evento, salon)
                sent_at = time.strftime("%Y-%m-%dT%H:%M:%S")

                evento["whatsappConfirmationSentAt"] = sent_at
                evento["whatsappConfirmationMessageId"] = message_id
                evento["whatsappConfirmationError"] = ""
                server.put_state(st)

                return json_response(start_response, {
                    "ok": True,
                    "sentAt": sent_at,
                    "messageId": message_id
                })

        # -----------------------
        # API - PUT
        # -----------------------
        if method == "PUT" and path == "/api/data":
            obj = leer_json(environ)
            server.put_state(obj)

            return json_response(start_response, {"ok": True})

        # -----------------------
        # ARCHIVOS DEL SITIO
        # -----------------------
        if method == "GET":
            if path == "/":
                path = "/index.html"

            archivo = (BASE / path.lstrip("/")).resolve()

            # Evita salir de la carpeta del proyecto
            if BASE not in archivo.parents and archivo != BASE:
                return respuesta(start_response, "403 Forbidden", "Acceso denegado")

            if archivo.is_file():
                content_type, _ = mimetypes.guess_type(str(archivo))
                content_type = content_type or "application/octet-stream"

                return respuesta(
                    start_response,
                    "200 OK",
                    archivo.read_bytes(),
                    content_type
                )

        return respuesta(start_response, "404 Not Found", "No encontrado")

    except ValueError as e:
        return json_response(
            start_response,
            {"ok": False, "error": str(e)},
            "409 Conflict"
        )

    except Exception as e:
        return json_response(
            start_response,
            {"ok": False, "error": str(e)},
            "500 Internal Server Error"
        )
