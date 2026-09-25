#!/usr/bin/env python3
"""Lädt die Stockfish-Dateien nach engine/, damit Zugradar auch offline läuft.

Ohne diese Dateien lädt die App Stockfish automatisch von cdn.jsdelivr.net.
Lokale Dateien funktionieren nur, wenn die Seite über einen Webserver geöffnet wird:
    python3 get_engine.py && python3 -m http.server 8000   →  http://localhost:8000/zugradar.html
"""
import os, sys, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(BASE, "engine")
FILES = [
    ("stockfish@18.0.8/bin/stockfish-18-lite-single.js", "stockfish-18-lite-single.js"),
    ("stockfish@18.0.8/bin/stockfish-18-lite-single.wasm", "stockfish-18-lite-single.wasm"),
    ("stockfish.js@10.0.2/stockfish.js", "stockfish-10-asm.js"),
    ("stockfish@18.0.8/Copying.txt", "COPYING-stockfish.txt"),
]
MIRRORS = ["https://cdn.jsdelivr.net/npm/", "https://unpkg.com/"]

os.makedirs(DEST, exist_ok=True)
for path, name in FILES:
    target = os.path.join(DEST, name)
    if os.path.exists(target) and os.path.getsize(target) > 0:
        print("vorhanden:", name); continue
    for m in MIRRORS:
        try:
            print("lade", m + path, "…")
            with urllib.request.urlopen(m + path, timeout=120) as r:
                data = r.read()
            open(target, "wb").write(data)
            print(f"  OK {name} ({len(data):,} Bytes)")
            break
        except Exception as e:
            print("  Fehler:", e)
    else:
        print("KONNTE NICHT LADEN:", name); sys.exit(1)
print("Fertig. Engine liegt in", DEST)
