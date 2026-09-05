import sys
import json
import mimetypes
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
