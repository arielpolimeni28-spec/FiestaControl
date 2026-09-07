#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import shutil
from datetime import datetime
from pathlib import Path

import server

def main():
    state = server.get_state()

    before = {
        "communityMessages": len(state.get("communityMessages", [])),
        "adminCommunityMessages": len(state.get("adminCommunityMessages", [])),
        "communityMessageReads": len(state.get("communityMessageReads", [])),
    }

    # Backup del estado actual antes de tocar nada.
    db_path = Path(server.DB)
    backup_path = None
    if db_path.exists():
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = db_path.with_name(f"{db_path.stem}_backup_comunidad_{stamp}{db_path.suffix}")
        shutil.copy2(db_path, backup_path)

    # Vaciar solamente Comunidad.
    state["communityMessages"] = []
    state["adminCommunityMessages"] = []
    state["communityMessageReads"] = []

    # Quitar marcas de resets anteriores para arrancar limpio.
    for key in list(state.keys()):
        if key.startswith("communityResetV") or key.startswith("communityResetAtV") \
           or key.startswith("adminMessagesResetV") or key.startswith("adminMessagesResetAtV"):
            state.pop(key, None)

    server.put_state(state)

    check = server.get_state()
    after = {
        "communityMessages": len(check.get("communityMessages", [])),
        "adminCommunityMessages": len(check.get("adminCommunityMessages", [])),
        "communityMessageReads": len(check.get("communityMessageReads", [])),
    }

    print("")
    print("========================================")
    print(" FIESTACONTROL - RESET DE COMUNIDAD")
    print("========================================")
    print("Antes:")
    print(json.dumps(before, ensure_ascii=False, indent=2))
    print("")
    print("Después:")
    print(json.dumps(after, ensure_ascii=False, indent=2))
    if backup_path:
        print("")
        print(f"Backup creado en: {backup_path}")
    print("")
    if all(v == 0 for v in after.values()):
        print("OK: Comunidad quedó vacía en el servidor.")
    else:
        print("ATENCIÓN: alguna colección no quedó en cero.")
    print("")

if __name__ == "__main__":
    main()
