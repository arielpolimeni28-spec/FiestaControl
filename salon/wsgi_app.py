import sys
import json
import mimetypes
import os
import time
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


def application(environ, start_response):
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
            server.put_state(leer_json(environ))
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
