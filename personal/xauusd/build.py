#!/usr/bin/env python3
"""Baut dashboard-xauusd.html aus Template + Modulen zusammen."""
import os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")

parts = {
    "@@STYLES@@": "styles.css",
    "@@INDICATORS@@": "indicators.js",
    "@@ENGINE@@": "engine.js",
    "@@FASTENGINE@@": "fastengine.js",
    "@@OPTIMIZER@@": "optimizer.js",
    "@@BACKTEST@@": "backtest.js",
    "@@CHART@@": "chart.js",
    "@@APP@@": "app.js",
}

tpl = open(os.path.join(BASE, "template.html")).read()
missing = []
for marker, fname in parts.items():
    path = os.path.join(SRC, fname)
    if not os.path.exists(path):
        missing.append(fname)
        continue
    tpl = tpl.replace(marker, open(path).read())
if missing:
    print("FEHLT:", ", ".join(missing)); sys.exit(1)

out = os.path.join(BASE, "dashboard-xauusd.html")
open(out, "w").write(tpl)
print(f"OK: {out} ({len(tpl):,} Bytes)")
