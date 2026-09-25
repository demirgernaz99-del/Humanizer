#!/usr/bin/env python3
"""Baut zugradar.html (eigenständige Datei) aus template.html + src/.

  python3 build.py                 → zugradar.html (vollständiges HTML-Dokument)
  python3 build.py --fragment OUT  → zusätzlich OUT ohne <html>/<head>/<body> (für gehostete Seiten)
"""
import os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")

parts = {
    "@@STYLES@@": "styles.css",
    "@@PIECES@@": "pieces.css",
    "@@CHESS@@": "vendor/chess.js",
    "@@OPENINGS@@": "openings.js",
    "@@CLASSIFY@@": "classify.js",
    "@@COACH@@": "coach.js",
    "@@CONNECT@@": "connect.js",
    "@@ENGINE@@": "engine.js",
    "@@BOARD@@": "board.js",
    "@@APP@@": "app.js",
}

tpl = open(os.path.join(BASE, "template.html"), encoding="utf-8").read()
for marker, fname in parts.items():
    path = os.path.join(SRC, fname)
    if not os.path.exists(path):
        print("FEHLT:", fname); sys.exit(1)
    code = open(path, encoding="utf-8").read()
    if fname.endswith(".js") and "</script" in code.lower():
        print("ABBRUCH: '</script' in", fname); sys.exit(1)
    tpl = tpl.replace(marker, code)

head, body = tpl.split("<!--BODY-->", 1)
doc = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       + head.strip() + '\n</head>\n<body>\n' + body.strip() + '\n</body>\n</html>\n')
out = os.path.join(BASE, "zugradar.html")
open(out, "w", encoding="utf-8").write(doc)
print(f"OK: {out} ({len(doc):,} Bytes)")

if "--fragment" in sys.argv:
    dest = sys.argv[sys.argv.index("--fragment") + 1]
    open(dest, "w", encoding="utf-8").write(head.strip() + "\n" + body.strip() + "\n")
    print(f"OK: {dest} (Fragment)")
