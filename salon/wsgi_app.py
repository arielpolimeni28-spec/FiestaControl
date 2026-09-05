import sys
import json
import mimetypes
import os
import time
import smtplib
import ssl
from email.message import EmailMessage
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


def enviar_confirmacion_email(evento, salon):
    gmail_user = os.environ.get("FIESTACONTROL_EMAIL", "").strip()
    gmail_password = os.environ.get("FIESTACONTROL_EMAIL_PASSWORD", "").replace(" ", "").strip()

    if not gmail_user or not gmail_password:
        raise ValueError("Email no configurado: faltan las credenciales de Gmail")

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

    msg = EmailMessage()
    msg["Subject"] = f"Confirmación de fiesta - {salon_name}"
    msg["From"] = f"FiestaControl <{gmail_user}>"
    msg["To"] = destinatario
    msg.set_content(f"""¡Tu fiesta está confirmada!\n\nSalón: {salon_name}\nCliente: {client}\nCumpleañero/a: {child}\nFecha: {date_txt}\nHorario: {start} a {end}\nPaquete: {package}\n\nTu reserva quedó confirmada correctamente.\n\nGracias por elegirnos.\nFiestaControl\n""")
    msg.add_alternative(f"""
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
    """, subtype="html")

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=25) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(gmail_user, gmail_password)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise ValueError("Google rechazó el acceso. Revisá el Gmail y la contraseña de aplicación.")
    except Exception as ex:
        raise ValueError(f"No se pudo enviar el email: {ex}")

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


            if path == "/api/delete-event":
                event_id = str(req.get("eventId") or "")
                salon_id = str(req.get("salonId") or "")
                password = str(req.get("password") or "")

                if not event_id or not salon_id or not password:
                    raise ValueError("Faltan datos para borrar la fiesta")

                st = server.get_state()

                salon = next(
                    (x for x in st.get("salons", [])
                     if str(x.get("id")) == salon_id),
                    None
                )
                if not salon:
                    raise ValueError("Salón inexistente")

                if str(salon.get("password") or "") != password:
                    raise ValueError("Contraseña incorrecta")

                events = st.get("events", [])
                before = len(events)
                st["events"] = [
                    x for x in events
                    if not (
                        str(x.get("id")) == event_id and
                        str(x.get("salonId")) == salon_id
                    )
                ]

                if len(st["events"]) == before:
                    raise ValueError("Fiesta inexistente")

                # Limpia también datos relacionados con la fiesta.
                st["cards"] = [
                    x for x in st.get("cards", [])
                    if str(x.get("eventId") or "") != event_id
                ]
                st["assignments"] = [
                    x for x in st.get("assignments", [])
                    if str(x.get("eventId") or "") != event_id
                ]
                st["orders"] = [
                    x for x in st.get("orders", [])
                    if str(x.get("eventId") or "") != event_id
                ]

                server.put_state(st)

                return json_response(start_response, {
                    "ok": True,
                    "state": st
                })

            if path == "/api/email-confirmation":
                evento = req.get("event") or {}
                salon_id = str(req.get("salonId") or evento.get("salonId") or "")

                if evento.get("status") != "Confirmada":
                    raise ValueError("La reserva todavía no está confirmada")

                if evento.get("emailConfirmationSentAt"):
                    return json_response(start_response, {
                        "ok": True,
                        "alreadySent": True,
                        "sentAt": evento.get("emailConfirmationSentAt")
                    })

                st = server.get_state()
                salon = next(
                    (x for x in st.get("salons", []) if str(x.get("id")) == salon_id),
                    None
                )

                enviar_confirmacion_email(evento, salon)
                sent_at = time.strftime("%Y-%m-%dT%H:%M:%S")
                return json_response(start_response, {"ok": True, "sentAt": sent_at})

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
